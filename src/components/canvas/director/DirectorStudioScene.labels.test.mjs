import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function read(relativePath) {
  return readFileSync(join(__dirname, relativePath), 'utf8')
}

test('director studio scene renders visible item labels inside the exported scene', () => {
  const source = read('DirectorStudioScene.vue')

  assert.match(source, /const\s+labelById\s*=\s*new Map\(\)/, 'scene should track label sprites by item id')
  assert.match(source, /new\s+THREE\.CanvasTexture\(/, 'item labels should be rendered as canvas textures')
  assert.match(source, /LABEL_FONT_FAMILY[\s\S]*Noto Sans CJK SC/, 'label canvas should prefer Chinese-capable font families')
  assert.match(source, /new\s+THREE\.Sprite\(/, 'item labels should render as Three.js sprites')
  assert.match(source, /showLabel\s*!==\s*false/, 'the per-item label toggle should control visibility')
  assert.match(source, /labelGroup\s*=\s*new\s+THREE\.Group\(\)/, 'labels should be part of the Three.js scene graph')
  assert.match(source, /scene\.add\(labelGroup\)/, 'labels should be rendered by the same scene exportPng captures')
  assert.match(source, /syncLabelForItem\(item,\s*mesh\)/, 'item sync should update label text and visibility')
  assert.match(source, /syncLabelForItem\(item,\s*mesh\)[\s\S]*emit\('update-item'/, 'dragged items should move their labels before emitting updates')
})
