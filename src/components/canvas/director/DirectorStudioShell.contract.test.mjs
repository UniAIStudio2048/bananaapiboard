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

test('director studio node card hides secondary counters from the canvas', () => {
  const source = read('components/canvas/nodes/DirectorStudioNode.vue')

  assert.doesNotMatch(source, /class="director-counters"/)
  assert.doesNotMatch(source, /\.director-counters\b/)
  assert.doesNotMatch(source, /const\s+(elementsLabel|referencesLabel|projectsLabel)\s*=/)
})

test('director studio stage uses the selected aspect frame as a screenshot preview window', () => {
  const shell = read('components/canvas/director/DirectorStudioShell.vue')
  const scene = read('components/canvas/director/DirectorStudioScene.vue')

  assert.match(scene, /--director-aspect-ratio/)
  assert.match(scene, /class="director-aspect-frame"/)
  assert.match(scene, /watch\(\(\)\s*=>\s*props\.aspectFrame,[\s\S]*syncSize/)
  assert.doesNotMatch(shell, /aspect-ratio:\s*auto\s*!important/)
  assert.match(shell, /\.director-shell-stage\s*\{[\s\S]*align-items:\s*center[\s\S]*justify-content:\s*center/)
  assert.match(shell, /:deep\(\.director-studio-scene\)\s*\{[\s\S]*var\(--director-aspect-ratio/)
})

test('director studio workstation localizes visible controls and exposes language switching', () => {
  const toolbar = read('components/canvas/director/DirectorStudioToolbar.vue')
  const shell = read('components/canvas/director/DirectorStudioShell.vue')
  const inspector = read('components/canvas/director/DirectorStudioInspector.vue')
  const modelLibrary = read('components/canvas/director/DirectorStudioModelLibrary.vue')
  const projectPanel = read('components/canvas/director/DirectorStudioProjectPanel.vue')
  const itemList = read('components/canvas/director/DirectorStudioItemList.vue')
  const snapshotPanel = read('components/canvas/director/DirectorStudioSnapshotPanel.vue')
  const shortcutDialog = read('components/canvas/director/DirectorStudioShortcutDialog.vue')
  const zhLocale = read('i18n/locales/zh-CN.js')
  const enLocale = read('i18n/locales/en.js')

  assert.match(toolbar, /import\s+LanguageSwitcher\s+from\s+['"]@\/components\/LanguageSwitcher\.vue['"]/)
  assert.match(toolbar, /<LanguageSwitcher[\s\S]*compact[\s\S]*:is-dark="true"[\s\S]*direction="down"/)

  for (const source of [toolbar, shell, inspector, modelLibrary, projectPanel, itemList, snapshotPanel, shortcutDialog]) {
    assert.match(source, /useI18n|useDirectorStudioI18n/)
    assert.match(source, /dt\('/)
  }

  for (const source of [toolbar, shell, inspector, modelLibrary, projectPanel, itemList, snapshotPanel, shortcutDialog]) {
    assert.doesNotMatch(source, />\s*(Director Studio|Save|Capture|Canvas|Panorama|Upload|Clear|Inspector|Focus|Paste|Duplicate|Name|Category|Color|Action|Relation|Note|Camera|Lighting|Grid|View|Prompt|Shortcuts|Model Library|Search models|Pedestrians|Projects|Snapshots|No snapshots|No item selected)\s*</)
  }

  for (const localeSource of [zhLocale, enLocale]) {
    assert.match(localeSource, /toolbar:\s*\{/)
    assert.match(localeSource, /inspector:\s*\{/)
    assert.match(localeSource, /modelLibrary:\s*\{/)
    assert.match(localeSource, /shortcuts:\s*\{/)
  }
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
  assert.match(panel, /:title="dt\('snapshots\.downloadActive'[\s\S]*@click="emit\('download-snapshot',\s*snapshotUrl\)"/)
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
  const toolbarSource = read('components/canvas/director/DirectorStudioToolbar.vue')
  const projectSource = read('components/canvas/director/DirectorStudioProjectPanel.vue')
  const inspectorSource = read('components/canvas/director/DirectorStudioInspector.vue')

  assert.match(source, /@media\s*\(max-width:\s*860px\)/)
  assert.match(source, /@media\s*\(max-width:\s*860px\)[\s\S]*\.director-shell-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*grid-template-rows:[\s\S]*\}/)
  assert.match(source, /@media\s*\(max-width:\s*860px\)[\s\S]*\.director-shell-stage\s*\{[\s\S]*min-height:\s*320px[\s\S]*\}/)
  assert.match(source, /@media\s*\(max-width:\s*860px\)[\s\S]*\.director-shell-left\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*\}/)
  assert.match(source, /@media\s*\(max-width:\s*860px\)[\s\S]*:deep\(\.director-inspector\)\s*\{[\s\S]*max-height:[\s\S]*\}/)
  assert.match(source, /@media\s*\(max-width:\s*640px\)[\s\S]*\.director-shell-left\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*\}/)
  assert.match(toolbarSource, /@media\s*\(max-width:\s*860px\)[\s\S]*\.director-toolbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*\}/)
  assert.match(toolbarSource, /@media\s*\(max-width:\s*860px\)[\s\S]*\.director-toolbar-group,\s*\n\s*\.director-toolbar-segment,\s*\n\s*\.director-toolbar-language\s*\{[\s\S]*width:\s*100%[\s\S]*overflow-x:\s*auto[\s\S]*\}/)
  assert.match(toolbarSource, /@media\s*\(max-width:\s*640px\)[\s\S]*\.director-command\s+span\s*\{[\s\S]*display:\s*none[\s\S]*\}/)
  assert.match(projectSource, /@media\s*\(max-width:\s*520px\)[\s\S]*\.director-project-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*\}/)
  assert.match(projectSource, /@media\s*\(max-width:\s*520px\)[\s\S]*\.director-project-row-actions\s*\{[\s\S]*flex-wrap:\s*wrap[\s\S]*\}/)
  assert.match(inspectorSource, /@media\s*\(max-width:\s*520px\)[\s\S]*\.director-field-grid\.three\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*\}/)
  assert.match(inspectorSource, /@media\s*\(max-width:\s*420px\)[\s\S]*\.director-field-grid\.two,\s*\n\s*\.director-field-grid\.three\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*\}/)
})

test('director studio inspector clamps body controls by field-specific ranges', () => {
  const source = read('components/canvas/director/DirectorStudioInspector.vue')

  assert.match(source, /const\s+BODY_CONTROL_RANGES\s*=\s*\{[\s\S]*torsoLeanDeg:\s*\[-45,\s*45\][\s\S]*arms:[\s\S]*thickness:\s*\[0\.45,\s*2\][\s\S]*legs:[\s\S]*thickness:\s*\[0\.45,\s*2\][\s\S]*\}/)
  assert.match(source, /function\s+getBodyControlRange\s*\(\s*section\s*,\s*key\s*\)/)
  assert.match(source, /function\s+updateBodyValue\s*\(\s*section,\s*key,\s*event\s*\)\s*\{[\s\S]*const\s+\[min,\s*max\]\s*=\s*getBodyControlRange\(section,\s*key\)[\s\S]*normalizeDirectorStudioBodyControls\(\{[\s\S]*\[section\]:[\s\S]*\[key\]:\s*clampNumber\(event\.target\.value,[\s\S]*min,\s*max\)[\s\S]*\}\)[\s\S]*\}/)
  assert.doesNotMatch(source, /clampNumber\(event\.target\.value,\s*bodyControls\.value\[section\]\?\.\[key\],\s*-360,\s*360\)/)
})

test('director studio exposes character bone controls and action presets', () => {
  const inspector = read('components/canvas/director/DirectorStudioInspector.vue')
  const shell = read('components/canvas/director/DirectorStudioShell.vue')
  const catalog = read('config/canvas/directorStudioPresetCatalog.js')

  assert.match(catalog, /DIRECTOR_STUDIO_ACTION_POSE_PRESETS/)
  assert.match(catalog, /DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS/)
  assert.match(catalog, /function\s+normalizeDirectorStudioBoneControls/)
  assert.match(catalog, /face-to-face-dialogue/)
  assert.match(catalog, /handshake/)
  assert.match(catalog, /pass-object/)

  assert.match(inspector, /DIRECTOR_STUDIO_BONE_CONTROL_GROUPS/)
  assert.match(inspector, /DIRECTOR_STUDIO_ACTION_POSE_PRESETS/)
  assert.match(inspector, /DIRECTOR_STUDIO_INTERACTION_POSE_PRESETS/)
  assert.match(inspector, /const\s+boneControls\s*=\s*computed/)
  assert.match(inspector, /function\s+updateBoneValue\s*\(\s*boneKey,\s*axisKey,\s*event\s*\)/)
  assert.match(inspector, /selectedItem\.category === 'person' && bodyControls\.showControls/)
  assert.match(inspector, /@input="updateBoneValue\(bone\.key,\s*axis\.key,\s*\$event\)"/)
  assert.match(inspector, /@change="handleActionPresetChange"/)
  assert.match(inspector, /@change="handleInteractionPresetChange"/)
  assert.match(inspector, /'apply-action-preset'/)
  assert.match(inspector, /'apply-interaction-preset'/)

  assert.match(shell, /function\s+applyActionPosePreset\s*\(\s*presetId\s*\)/)
  assert.match(shell, /function\s+applyInteractionPosePreset\s*\(\s*presetId\s*\)/)
  assert.match(shell, /@apply-action-preset="applyActionPosePreset"/)
  assert.match(shell, /@apply-interaction-preset="applyInteractionPosePreset"/)
})

test('director studio custom poses preserve manual bone controls', () => {
  const inspector = read('components/canvas/director/DirectorStudioInspector.vue')
  const shell = read('components/canvas/director/DirectorStudioShell.vue')

  assert.match(inspector, /boneControls:\s*props\.selectedItem\.boneControls\s*\|\|\s*\{\}/)
  assert.match(shell, /function\s+saveCustomPose\s*\(\s*payload\s*\)\s*\{[\s\S]*boneControls:\s*cloneJson\(payload\?\.boneControls\s*\|\|\s*\{\}\)[\s\S]*\}/)
  assert.match(shell, /function\s+applyCustomPose\s*\(\s*key\s*\)\s*\{[\s\S]*boneControls:\s*cloneJson\(pose\.boneControls\s*\|\|\s*selectedItem\.value\.boneControls\s*\|\|\s*\{\}\)[\s\S]*\}/)
})

test('director studio crowd insertion defaults to useful multi-person groups', () => {
  const library = read('components/canvas/director/DirectorStudioModelLibrary.vue')
  const shell = read('components/canvas/director/DirectorStudioShell.vue')

  assert.match(library, /const\s+pedestrianMode\s*=\s*ref\('array'\)/)
  assert.match(library, /const\s+pedestrianCount\s*=\s*ref\(8\)/)
  assert.match(library, /const\s+crowdActionMode\s*=\s*ref\('standing'\)/)
  assert.match(library, /actionMode:\s*crowdActionMode\.value/)
  assert.match(library, /modelLibrary\.crowdAction/)
  assert.match(shell, /options\.actionMode === 'walking'/)
  assert.match(shell, /options\.actionMode === 'conversation'/)
})

test('director studio scene keeps camera distance stable during transform updates and reverses vertical orbit by setting', () => {
  const scene = read('components/canvas/director/DirectorStudioScene.vue')

  assert.match(scene, /let\s+lastCameraFov\s*=/)
  assert.match(scene, /let\s+lastCameraLensDistance\s*=/)
  assert.match(scene, /const\s+lensChanged\s*=/)
  assert.match(scene, /if\s*\(lensChanged\)\s*\{[\s\S]*cameraState\.distance\s*=/)
  assert.doesNotMatch(scene, /cameraState\.distance\s*=\s*THREE\.MathUtils\.clamp\(settings\.lensDistance,\s*1\.8,\s*90\)\s*\n\s*applyCamera\(\)/)
  assert.match(scene, /normalizeDirectorViewSettings\(props\.viewSettings\)/)
  assert.match(scene, /settings\.reverseVerticalOrbit\s*\?\s*1\s*:\s*-1/)
  assert.match(scene, /cameraState\.pitch\s*\+=\s*dy\s*\*\s*0\.005\s*\*\s*verticalDirection/)
})

test('director studio scene exposes mouse drag controls for person bone keypoints', () => {
  const scene = read('components/canvas/director/DirectorStudioScene.vue')

  assert.match(scene, /updateDirectorObjectBoneControls/)
  assert.doesNotMatch(scene, /function\s+meshCacheKey\s*\(\s*item\s*\)\s*\{[\s\S]*JSON\.stringify\(item\?\.boneControls\s*\|\|\s*\{\}\)[\s\S]*\}/)
  assert.match(scene, /updateDirectorObjectBoneControls\(mesh,\s*item\?\.boneControls\)/)
  assert.match(scene, /boneDragState\s*=/)
  assert.match(scene, /function\s+raycastBoneHandle\s*\(\s*local\s*\)/)
  assert.match(scene, /function\s+startBoneDrag\s*\(\s*event,\s*hit\s*\)/)
  assert.match(scene, /function\s+updateBoneDrag\s*\(\s*event\s*\)/)
  assert.match(scene, /function\s+emitBoneControlPatch\s*\(\s*itemId,\s*boneKey,\s*nextBoneControls\s*\)/)
  assert.match(scene, /pointerState\.mode\s*=\s*'bone'/)
  assert.match(scene, /event\.shiftKey\s*\?\s*'zDeg'\s*:\s*null/)
  assert.match(scene, /@pointermove="handlePointerMove"/)
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
  assert.match(source, /import\s*\{[\s\S]*buildDirectorStudioPrompt[\s\S]*\}\s*from\s*['"]@\/utils\/directorStudioPrompt\.js['"]/)
  assert.match(source, /import\s*\{[\s\S]*resolveDirectorAspectRatio[\s\S]*resolveDirectorAiRequestAspectRatio[\s\S]*\}\s*from\s*['"]@\/utils\/directorStudioSceneExport\.js['"]/)
  assert.match(source, /async\s+function\s+handleAddSnapshotToCanvas\s*\(\s*payloadOrEvent\s*\)/)
  assert.match(source, /const\s+persistentSnapshotUrl\s*=\s*await\s+persistDirectorStudioImageSource\(nextSnapshotUrl\)/)
  assert.match(source, /const\s+prompt\s*=\s*buildDirectorStudioPrompt\(\{[\s\S]*\.\.\.props\.data[\s\S]*referenceImages:\s*referenceImages\.value[\s\S]*\}\)/)
  assert.match(source, /const\s+sourceNodeId\s*=\s*`node_\$\{Date\.now\(\)\}_source_\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*11\)\}`/)
  assert.match(source, /const\s+generationNodeId\s*=\s*`node_\$\{Date\.now\(\)\}_generation_\$\{Math\.random\(\)\.toString\(36\)\.slice\(2,\s*11\)\}`/)
  assert.match(source, /const\s+generationReferenceImages\s*=\s*\[\s*persistentSnapshotUrl,\s*\.\.\.linkedReferenceUrls\s*\]/)
  assert.match(source, /type:\s*['"]image-input['"][\s\S]*title:\s*['"]导演台截图['"][\s\S]*sourceImages:\s*\[persistentSnapshotUrl\][\s\S]*imageUrl:\s*persistentSnapshotUrl/)
  assert.match(source, /type:\s*['"]image-to-image['"][\s\S]*position:\s*\{[\s\S]*x:\s*currentPosition\.x\s*\+\s*960[\s\S]*prompt[\s\S]*aspectRatio:\s*aspectRatio[\s\S]*aspectRatioMode:\s*aspectRatio/)
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

test('director studio node labels merged reference images as 图N from a stable palette', () => {
  const source = read('components/canvas/nodes/DirectorStudioNode.vue')

  assert.match(source, /const\s+DIRECTOR_REFERENCE_COLOR_PALETTE\s*=\s*\[[\s\S]*'#60a5fa'[\s\S]*'#f472b6'[\s\S]*\]/)
  assert.match(source, /function\s+getDirectorReferenceColor\s*\(\s*index\s*\)/)
  assert.match(source, /function\s+mergeDirectorStudioReferenceImages\s*\(\s*nodeId,\s*data,\s*nodes,\s*edges\s*\)/)
  assert.match(source, /edge\.target\s*===\s*nodeId/)
  assert.match(source, /sourceData\.sourceImages[\s\S]*sourceData\.output\?\.urls[\s\S]*sourceData\.output\?\.url[\s\S]*sourceData\.imageUrl/)
  assert.match(source, /data\?\.referenceImages[\s\S]*item\.refImageUrl/)
  assert.match(source, /label:\s*`图\$\{index\s*\+\s*1\}`/)
  assert.match(source, /color:\s*getDirectorReferenceColor\(index\)/)
})

test('director studio node creates or reuses direct reference source nodes for snapshot generation', () => {
  const source = read('components/canvas/nodes/DirectorStudioNode.vue')

  assert.match(source, /import\s*\{[\s\S]*buildDirectorStudioPrompt[\s\S]*dedupeDirectorReferenceUrls[\s\S]*\}\s*from\s*['"]@\/utils\/directorStudioPrompt\.js['"]/)
  assert.match(source, /function\s+findDirectorReferenceSourceNode\s*\(\s*url,\s*nodes,\s*excludedNodeIds\s*=\s*new Set\(\)\s*\)/)
  assert.match(source, /function\s+collectDirectorNodeUpstreamImageUrls\s*\(\s*node\s*\)[\s\S]*data\.nodeRole\s*===\s*['"]source['"][\s\S]*data\.output\?\.urls[\s\S]*data\.output\?\.url[\s\S]*data\.sourceImages/)
  assert.match(source, /const\s+upstreamUrls\s*=\s*collectDirectorNodeUpstreamImageUrls\(node\)[\s\S]*upstreamUrls\.length\s*===\s*1\s*&&\s*upstreamUrls\[0\]\s*===\s*normalizedUrl/)
  assert.match(source, /const\s+linkedReferenceUrls\s*=\s*dedupeDirectorReferenceUrls\([\s\S]*referenceImages\.value\.map\(item\s*=>\s*item\?\.url\)[\s\S]*\)\.filter\(url\s*=>\s*url\s*!==\s*persistentSnapshotUrl\)/)
  assert.match(source, /const\s+generationReferenceImages\s*=\s*\[\s*persistentSnapshotUrl,\s*\.\.\.linkedReferenceUrls\s*\]/)
  assert.match(source, /sourceImages:\s*\[persistentSnapshotUrl\][\s\S]*imageUrl:\s*persistentSnapshotUrl/)
  assert.match(source, /referenceImages:\s*generationReferenceImages[\s\S]*sourceImages:\s*generationReferenceImages[\s\S]*aspectRatio:\s*aspectRatio[\s\S]*requestAspectRatio:\s*aiAspectRatio/)
  assert.match(source, /referenceSourcePlans\.forEach\(reference\s*=>\s*\{[\s\S]*canvasStore\.addNode\(\{[\s\S]*type:\s*['"]image-input['"][\s\S]*sourceImages:\s*\[reference\.url\][\s\S]*imageUrl:\s*reference\.url/)
  assert.match(source, /referenceSourcePlans\.forEach\(reference\s*=>\s*\{[\s\S]*source:\s*reference\.nodeId[\s\S]*target:\s*generationNodeId/)
})
