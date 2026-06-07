import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readVideoNode() {
  return readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')
}

test('video node prompt editor consumes touch drag events without preventing text caret movement', () => {
  const source = readVideoNode()
  const refIndex = source.indexOf('ref="promptTextareaRef"')
  assert.ok(refIndex >= 0, 'Expected VideoNode prompt editor ref')
  const tagStart = source.lastIndexOf('<div', refIndex)
  const tagEnd = source.indexOf('\n          >', refIndex)
  assert.ok(tagStart >= 0 && tagEnd > refIndex, 'Expected VideoNode prompt editor opening tag')

  const promptEditor = source.slice(tagStart, tagEnd)

  assert.match(promptEditor, /class="prompt-input nodrag"/)
  assert.match(promptEditor, /@mousedown\.stop="markPromptTextareaResizeIntent"/)
  assert.match(promptEditor, /@pointerdown\.stop/)
  assert.match(promptEditor, /@touchstart\.stop/)
  assert.match(promptEditor, /@touchmove\.stop/)
  assert.doesNotMatch(promptEditor, /@touch(?:start|move)\.stop\.prevent/)
  assert.doesNotMatch(promptEditor, /@pointerdown\.stop\.prevent/)
})
