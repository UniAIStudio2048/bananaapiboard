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
