import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readImageNode() {
  return readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')
}

test('image node prompt editor consumes touch drag events without preventing text caret movement', () => {
  const source = readImageNode()
  const refIndex = source.indexOf('ref="promptTextareaRef"')
  assert.ok(refIndex >= 0, 'Expected ImageNode prompt editor ref')
  const tagStart = source.lastIndexOf('<div', refIndex)
  const tagEnd = source.indexOf('\n          >', refIndex)
  assert.ok(tagStart >= 0 && tagEnd > refIndex, 'Expected ImageNode prompt editor opening tag')

  const promptEditor = source.slice(tagStart, tagEnd)

  assert.match(promptEditor, /class="prompt-input nodrag"/)
  assert.match(promptEditor, /@mousedown\.stop="startTextareaAutoScroll"/)
  assert.match(promptEditor, /@pointerdown\.stop/)
  assert.match(promptEditor, /@touchstart\.stop/)
  assert.match(promptEditor, /@touchmove\.stop/)
  assert.doesNotMatch(promptEditor, /@touch(?:start|move)\.stop\.prevent/)
  assert.doesNotMatch(promptEditor, /@pointerdown\.stop\.prevent/)
})
