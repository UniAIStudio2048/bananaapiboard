import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcDir = join(__dirname, '../../..')

function read(relativePath) {
  return readFileSync(join(srcDir, relativePath), 'utf8')
}

test('director studio shell exposes the full Task 7 prop and event contract', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')

  assert.match(source, /sourceNodeId:\s*\{\s*type:\s*String,\s*required:\s*true\s*\}/)
  assert.match(source, /referenceImages:\s*\{\s*type:\s*Array,\s*default:\s*\(\)\s*=>\s*\[\]\s*\}/)
  assert.match(source, /imageAssets:\s*\{\s*type:\s*Array,\s*default:\s*\(\)\s*=>\s*\[\]\s*\}/)
  assert.match(source, /panoramaAssets:\s*\{\s*type:\s*Array,\s*default:\s*\(\)\s*=>\s*\[\]\s*\}/)
  assert.match(source, /defineEmits\(\[[\s\S]*'update:selectedItemId'[\s\S]*'items-change'[\s\S]*'update-node-data'[\s\S]*'add-snapshot-to-canvas'[\s\S]*'close'[\s\S]*\]\)/)
  assert.match(source, /function\s+patchNodeData\s*\(\s*patch\s*\)\s*\{[\s\S]*emit\('update-node-data',\s*patch\)[\s\S]*\}/)
})

test('director studio shell renders the workstation panels and drives the scene transform mode', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')

  for (const component of [
    'DirectorStudioToolbar',
    'DirectorStudioProjectPanel',
    'DirectorStudioItemList',
    'DirectorStudioModelLibrary',
    'DirectorStudioSnapshotPanel',
    'DirectorStudioInspector',
    'DirectorStudioShortcutDialog'
  ]) {
    assert.match(source, new RegExp(`import\\s+${component}\\s+from`), `${component} should be imported`)
    assert.match(source, new RegExp(`<${component}\\b`), `${component} should be rendered`)
  }

  assert.match(source, /<DirectorStudioScene[\s\S]*:items="items"[\s\S]*:selected-item-id="selectedSceneItemId"[\s\S]*:transform-mode="transformMode"/)
  assert.match(source, /@update-item="handleSceneUpdateItem"/)
})

test('director studio shell exposes left rail item selection', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')

  assert.match(source, /function\s+handleItemListSelect\s*\(\s*id\s*\)\s*\{[\s\S]*emit\('update:selectedItemId',\s*id == null \? null : String\(id\)\)[\s\S]*\}/)
  assert.match(source, /<DirectorStudioItemList[\s\S]*:items="items"[\s\S]*:selected-item-id="selectedSceneItemId"[\s\S]*@select-item="handleItemListSelect"/)
})

test('director studio shell shortcuts are scoped to focused shell and honor configured bindings', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')

  assert.doesNotMatch(source, /window\.addEventListener\('keydown',\s*handleShellKeydown\)/)
  assert.doesNotMatch(source, /window\.removeEventListener\('keydown',\s*handleShellKeydown\)/)
  assert.match(source, /<section[\s\S]*ref="rootEl"[\s\S]*@keydown="handleShellKeydown"/)
  assert.match(source, /function\s+isShellShortcutTarget\s*\(\s*event\s*\)\s*\{[\s\S]*shortcutsOpen\.value[\s\S]*rootEl\.value[\s\S]*\.director-studio-scene[\s\S]*\}/)
  assert.match(source, /function\s+matchesShortcut\s*\(\s*event\s*,\s*shortcut\s*\)/)
  assert.match(source, /function\s+resolveShortcutAction\s*\(\s*event\s*\)\s*\{[\s\S]*shortcuts\.value[\s\S]*matchesShortcut\(event,[\s\S]*\}/)
  assert.match(source, /function\s+handleShellKeydown\s*\(\s*event\s*\)\s*\{[\s\S]*if\s*\(!isShellShortcutTarget\(event\)\)\s*return[\s\S]*resolveShortcutAction\(event\)[\s\S]*event\.stopPropagation\(\)[\s\S]*\}/)
})

test('director studio shell syncs project snapshot output when loading a saved project', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')

  assert.match(source, /function\s+selectProject\s*\(\s*projectId\s*\)\s*\{[\s\S]*const\s+projectSnapshotUrl\s*=[\s\S]*record\.snapshot\.snapshotUrl[\s\S]*patchNodeData\(\{[\s\S]*output:\s*projectSnapshotUrl\s*\?\s*buildOutputPatch\(projectSnapshotUrl,\s*record\.snapshot\.output\)\s*:\s*\{\s*url:\s*null,\s*urls:\s*\[\]\s*\}[\s\S]*activeDirectorStudioProjectId:\s*record\.id[\s\S]*\}\)/)
})

test('director studio shell uploads screenshots before storing snapshot node output', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')

  assert.match(source, /import\s*\{\s*persistDirectorStudioImageSource\s*\}\s*from\s*['"]@\/utils\/directorStudioMedia\.js['"]/)
  assert.match(source, /async\s+function\s+captureScreenshot\s*\(\s*\)\s*\{[\s\S]*computeDirectorScreenshotSize\(aspectFrame\.value,\s*screenshotResolution\.value\)[\s\S]*sceneRef\.value\?\.exportPng\?\.\(size\)[\s\S]*await\s+persistDirectorStudioImageSource\(dataUrl\)[\s\S]*patchNodeData\(\{[\s\S]*snapshotUrl[\s\S]*snapshotHistory:\s*appendDirectorSnapshotHistory\(props\.data\.snapshotHistory,\s*snapshotUrl\)[\s\S]*sourceImages:\s*\[snapshotUrl\][\s\S]*output:\s*\{\s*url:\s*snapshotUrl,\s*urls:\s*\[snapshotUrl\]\s*\}[\s\S]*status:\s*['"]success['"][\s\S]*\}\)[\s\S]*leftPanel\.value\s*=\s*['"]snapshots['"][\s\S]*return\s+snapshotUrl[\s\S]*\}/)
  assert.match(source, /async\s+function\s+captureScreenshot\s*\(\s*\)\s*\{[\s\S]*try\s*\{[\s\S]*await\s+persistDirectorStudioImageSource\(dataUrl\)[\s\S]*\}\s*catch\s*\(\s*error\s*\)\s*\{[\s\S]*sceneErrorMessage\.value[\s\S]*patchNodeData\(\{\s*status:\s*['"]error['"]\s*\}\)[\s\S]*return\s+null[\s\S]*\}\s*finally\s*\{[\s\S]*screenshotBusy\.value\s*=\s*false[\s\S]*\}/)
})

test('director studio shell snapshot actions use persistent selected history entries', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')
  const panel = read('components/canvas/director/DirectorStudioSnapshotPanel.vue')

  assert.match(source, /const\s+selectedSnapshotUrl\s*=\s*ref\(null\)/)
  assert.match(source, /const\s+snapshotHistoryNewestFirst\s*=\s*computed\(\(\)\s*=>\s*\[\.\.\.snapshotHistory\.value\]\.reverse\(\)\)/)
  assert.match(source, /function\s+deleteSelectedSnapshot\s*\(\s*\)\s*\{[\s\S]*selectedSnapshotUrl\.value[\s\S]*patchNodeData\(\{[\s\S]*snapshotHistory:\s*nextHistory[\s\S]*snapshotUrl:\s*nextSnapshotUrl[\s\S]*output:\s*nextSnapshotUrl\s*\?\s*\{\s*url:\s*nextSnapshotUrl,\s*urls:\s*\[nextSnapshotUrl\]\s*\}\s*:\s*\{\s*url:\s*null,\s*urls:\s*\[\]\s*\}[\s\S]*\}\)[\s\S]*\}/)
  assert.match(source, /function\s+addSelectedSnapshotToCanvas\s*\(\s*\)\s*\{[\s\S]*const\s+url\s*=\s*selectedSnapshotUrl\.value\s*\|\|\s*snapshotUrl\.value[\s\S]*emit\('add-snapshot-to-canvas',\s*\{\s*snapshotUrl:\s*url\s*\}\)[\s\S]*\}/)
  assert.match(source, /:snapshot-history="snapshotHistoryNewestFirst"/)
  assert.match(source, /@delete-snapshot="deleteSelectedSnapshot"/)
  assert.match(source, /@select-current="selectCurrentSnapshot"/)
  assert.match(panel, /selectedSnapshotUrl:\s*\{\s*type:\s*String,\s*default:\s*null\s*\}/)
  assert.match(panel, /defineEmits\(\[[\s\S]*'select-current'[\s\S]*'delete-snapshot'[\s\S]*\]\)/)
  assert.match(panel, /:class="\{\s*active:\s*url\s*===\s*selectedSnapshotUrl\s*\}"/)
  assert.match(panel, /title="Download active snapshot"[\s\S]*@click="emit\('download-snapshot',\s*snapshotUrl\)"/)
})

test('director studio shell project library can create, overwrite, rename, restore, delete, and update covers', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')
  const panel = read('components/canvas/director/DirectorStudioProjectPanel.vue')

  for (const fn of [
    'saveProjectAsNew',
    'saveActiveProject',
    'renameProject',
    'restoreProject',
    'deleteProject',
    'updateProjectCoverFromSnapshot'
  ]) {
    assert.match(source, new RegExp(`function\\s+${fn}\\s*\\(`), `${fn} should exist in shell`)
  }

  assert.match(source, /id:\s*`director-project-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*8\)\}`/)
  assert.match(source, /coverUrl:\s*snapshotUrl\.value\s*\|\|\s*existing\?\.coverUrl\s*\|\|\s*null/)
  assert.match(source, /snapshot:\s*captureDirectorSnapshot\(\{[\s\S]*\.\.\.props\.data[\s\S]*directorStudioProjects:\s*props\.data\.directorStudioProjects[\s\S]*\},\s*snapshotUrl\.value\)/)
  assert.match(source, /function\s+restoreProject\s*\(\s*projectId\s*\)\s*\{[\s\S]*patchNodeData\(\{[\s\S]*\.\.\.record\.snapshot[\s\S]*activeDirectorStudioProjectId:\s*record\.id[\s\S]*\}\)[\s\S]*\}/)
  assert.match(panel, /defineEmits\(\[[\s\S]*'save-new-project'[\s\S]*'save-active-project'[\s\S]*'rename-project'[\s\S]*'restore-project'[\s\S]*'delete-project'[\s\S]*'update-project-cover'[\s\S]*\]\)/)
})

test('director studio shell imports panorama backgrounds from assets or local uploads without generation providers', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')

  assert.match(source, /const\s+panoramaFileInput\s*=\s*ref\(null\)/)
  assert.match(source, /const\s+panoramaImportAssets\s*=\s*computed\(\(\)\s*=>\s*normalizeReferenceAssets\(\[[\s\S]*\.\.\.props\.panoramaAssets[\s\S]*\.\.\.referenceAssets\.value[\s\S]*\]\)\)/)
  assert.match(source, /async\s+function\s+selectPanoramaSource\s*\(\s*source\s*\)\s*\{[\s\S]*await\s+persistDirectorStudioImageSource\(url\)[\s\S]*patchNodeData\(\{[\s\S]*mode:\s*['"]panorama['"][\s\S]*backgroundPanoramaUrl:\s*persistentUrl[\s\S]*backgroundImageUrl:\s*persistentUrl[\s\S]*\}\)[\s\S]*\}/)
  assert.match(source, /function\s+clearPanoramaSource\s*\(\s*\)\s*\{[\s\S]*patchNodeData\(\{\s*mode:\s*['"]flat['"],\s*backgroundPanoramaUrl:\s*null\s*\}\)[\s\S]*\}/)
  assert.match(source, /<input[\s\S]*ref="panoramaFileInput"[\s\S]*type="file"[\s\S]*accept="image\/\*"[\s\S]*@change="handlePanoramaFileChange"/)
  assert.doesNotMatch(source, /generatePanorama|provider|text-to-image|image-gen/)
})

test('director studio shell keeps the scene usable on narrow viewports', () => {
  const source = read('components/canvas/director/DirectorStudioShell.vue')

  assert.match(source, /@media\s*\(max-width:\s*860px\)/)
  assert.match(source, /@media\s*\(max-width:\s*860px\)[\s\S]*\.director-shell-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*grid-template-rows:[\s\S]*\}/)
  assert.match(source, /@media\s*\(max-width:\s*860px\)[\s\S]*\.director-shell-stage\s*\{[\s\S]*min-height:\s*320px[\s\S]*\}/)
  assert.match(source, /@media\s*\(max-width:\s*860px\)[\s\S]*:deep\(\.director-inspector\)\s*\{[\s\S]*max-height:[\s\S]*\}/)
})

test('director studio inspector clamps body controls by field-specific ranges', () => {
  const source = read('components/canvas/director/DirectorStudioInspector.vue')

  assert.match(source, /const\s+BODY_CONTROL_RANGES\s*=\s*\{[\s\S]*torsoLeanDeg:\s*\[-45,\s*45\][\s\S]*arms:[\s\S]*thickness:\s*\[0\.45,\s*2\][\s\S]*legs:[\s\S]*thickness:\s*\[0\.45,\s*2\][\s\S]*\}/)
  assert.match(source, /function\s+getBodyControlRange\s*\(\s*section\s*,\s*key\s*\)/)
  assert.match(source, /function\s+updateBodyValue\s*\(\s*section,\s*key,\s*event\s*\)\s*\{[\s\S]*const\s+\[min,\s*max\]\s*=\s*getBodyControlRange\(section,\s*key\)[\s\S]*normalizeDirectorStudioBodyControls\(\{[\s\S]*\[section\]:[\s\S]*\[key\]:\s*clampNumber\(event\.target\.value,[\s\S]*min,\s*max\)[\s\S]*\}\)[\s\S]*\}/)
  assert.doesNotMatch(source, /clampNumber\(event\.target\.value,\s*bodyControls\.value\[section\]\?\.\[key\],\s*-360,\s*360\)/)
})

test('director studio node bridges shell events into shallow node data updates', () => {
  const source = read('components/canvas/nodes/DirectorStudioNode.vue')

  assert.match(source, /function\s+handleDirectorItemsChange\s*\(\s*nextItems\s*\)\s*\{[\s\S]*canvasStore\.updateNodeData\(props\.id,\s*\{\s*items:\s*nextItems\s*\}\)[\s\S]*\}/)
  assert.match(source, /function\s+handleDirectorNodeDataChange\s*\(\s*patch\s*\)\s*\{[\s\S]*canvasStore\.updateNodeData\(props\.id,\s*patch\)[\s\S]*\}/)
  assert.match(source, /:source-node-id="id"/)
  assert.match(source, /:reference-images="referenceImages"/)
  assert.match(source, /:image-assets="imageAssets"/)
  assert.match(source, /:panorama-assets="panoramaAssets"/)
  assert.match(source, /@items-change="handleDirectorItemsChange"/)
  assert.match(source, /@update-node-data="handleDirectorNodeDataChange"/)
  assert.match(source, /@add-snapshot-to-canvas="handleAddSnapshotToCanvas"/)
})

test('director studio node persists snapshots and creates source-to-generation canvas nodes', () => {
  const source = read('components/canvas/nodes/DirectorStudioNode.vue')

  assert.match(source, /import\s*\{\s*persistDirectorStudioImageSource\s*,\s*isDirectorDataImageUrl\s*\}\s*from\s*['"]@\/utils\/directorStudioMedia\.js['"]/)
  assert.match(source, /import\s*\{\s*buildDirectorStudioPrompt\s*\}\s*from\s*['"]@\/utils\/directorStudioPrompt\.js['"]/)
  assert.match(source, /import\s*\{[\s\S]*resolveDirectorAspectRatio[\s\S]*resolveDirectorAiRequestAspectRatio[\s\S]*\}\s*from\s*['"]@\/utils\/directorStudioSceneExport\.js['"]/)
  assert.match(source, /async\s+function\s+handleAddSnapshotToCanvas\s*\(\s*payloadOrEvent\s*\)/)
  assert.match(source, /const\s+persistentSnapshotUrl\s*=\s*await\s+persistDirectorStudioImageSource\(nextSnapshotUrl\)/)
  assert.match(source, /const\s+prompt\s*=\s*buildDirectorStudioPrompt\(\{[\s\S]*\.\.\.props\.data[\s\S]*referenceImages:\s*referenceImages\.value[\s\S]*\}\)/)
  assert.match(source, /const\s+sourceNodeId\s*=\s*`node_\$\{Date\.now\(\)\}_source_\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*11\)\}`/)
  assert.match(source, /const\s+generationNodeId\s*=\s*`node_\$\{Date\.now\(\)\}_generation_\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*11\)\}`/)
  assert.match(source, /const\s+generationReferenceImages\s*=\s*\[[\s\S]*persistentSnapshotUrl[\s\S]*\.\.\.referenceImages\.value\.map[\s\S]*\]/)
  assert.match(source, /type:\s*['"]image-input['"][\s\S]*title:\s*['"]导演台截图['"][\s\S]*sourceImages:\s*generationReferenceImages[\s\S]*imageUrl:\s*persistentSnapshotUrl/)
  assert.match(source, /type:\s*['"]image-to-image['"][\s\S]*position:\s*\{[\s\S]*x:\s*currentPosition\.x\s*\+\s*960[\s\S]*prompt[\s\S]*aspectRatio:\s*aiAspectRatio[\s\S]*aspectRatioMode:\s*aspectRatio/)
  assert.match(source, /canvasStore\.addEdge\(\{[\s\S]*source:\s*sourceNodeId[\s\S]*target:\s*generationNodeId[\s\S]*\}\)/)
  assert.match(source, /canvasStore\.selectNode\(generationNodeId\)/)
  assert.match(source, /if\s*\(isDirectorDataImageUrl\(nextSnapshotUrl\)\s*&&\s*persistentSnapshotUrl\s*!==\s*nextSnapshotUrl\)\s*\{[\s\S]*canvasStore\.updateNodeData\(props\.id,\s*\{[\s\S]*snapshotUrl:\s*persistentSnapshotUrl[\s\S]*snapshotHistory:\s*appendDirectorSnapshotHistory\(props\.data\.snapshotHistory,\s*persistentSnapshotUrl\)[\s\S]*sourceImages:\s*\[persistentSnapshotUrl\][\s\S]*status:\s*['"]success['"][\s\S]*\}\)[\s\S]*\}/)
})

test('director studio node passes canvas image assets into the shell', () => {
  const source = read('components/canvas/nodes/DirectorStudioNode.vue')

  assert.match(source, /function\s+collectDirectorStudioCanvasImageAssets\s*\(\s*nodes\s*\)/)
  assert.match(source, /const\s+canvasImageAssets\s*=\s*computed\(\(\)\s*=>\s*readonlyPreview\s*\?\s*\[\]\s*:\s*collectDirectorStudioCanvasImageAssets\(canvasStore\.nodes\)\)/)
  assert.match(source, /const\s+imageAssets\s*=\s*computed\(\(\)\s*=>\s*mergeDirectorStudioAssetLists\(\[[\s\S]*props\.data\.imageAssets[\s\S]*canvasImageAssets\.value[\s\S]*\]\)\)/)
  assert.match(source, /const\s+panoramaAssets\s*=\s*computed\(\(\)\s*=>\s*mergeDirectorStudioAssetLists\(\[[\s\S]*props\.data\.panoramaAssets[\s\S]*canvasImageAssets\.value[\s\S]*\]\)\)/)
})
