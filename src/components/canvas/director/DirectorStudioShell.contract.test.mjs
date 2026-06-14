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
