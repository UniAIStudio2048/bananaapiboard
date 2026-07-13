import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readNodeSource(fileName) {
  return readFileSync(join(__dirname, fileName), 'utf8')
}

function readComputedBody(source, name) {
  const match = source.match(new RegExp(`const ${name} = computed\\(\\(\\) => \\{([\\s\\S]*?)\\n\\}\\)`))
  assert.ok(match, `Expected ${name} computed visibility contract`)
  return match[1]
}

test('image prompt panel requires the sole authoritative node selection', () => {
  const source = readNodeSource('ImageNode.vue')
  const body = readComputedBody(source, 'showConfigPanel')

  assert.match(body, /const isSelected = canvasStore\.selectedNodeId === props\.id/)
  assert.match(body, /getSelectedNodes\.value\.length > 1 \|\| canvasStore\.selectedNodeIds\.length > 1/)
  assert.match(body, /if \(!isSelected \|\| isMultiSelect\) return false/)
  assert.doesNotMatch(body, /props\.selected \|\|/)
  assert.match(source, /v-if="showConfigPanel"/)
})

test('video prompt panel requires the sole authoritative node selection', () => {
  const source = readNodeSource('VideoNode.vue')
  const body = readComputedBody(source, 'isSoloSelected')

  assert.match(body, /const isSelected = canvasStore\.selectedNodeId === props\.id/)
  assert.match(body, /getSelectedNodes\.value\.length > 1 \|\| canvasStore\.selectedNodeIds\.length > 1/)
  assert.match(body, /return isSelected && !isMultiSelect/)
  assert.doesNotMatch(body, /props\.selected \|\|/)
  assert.doesNotMatch(body, /length <= 1 \|\|/)
  assert.match(source, /v-if="isSoloSelected"/)
})
