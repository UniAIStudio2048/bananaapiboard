import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

test('canvas shortcuts treat descendants of contenteditable prompt chips as text input targets', () => {
  assert.match(source, /function\s+isTextInputEventTarget\(target\)/)
  assert.match(source, /target\?\.closest\?\.\('input,\s*textarea,\s*select,\s*\[contenteditable="true"\]'\)/)
  assert.match(source, /const\s+isInInput\s*=\s*isTextInputEventTarget\(target\)/)
  assert.doesNotMatch(source, /target\.tagName\s*===\s*'INPUT'\s*\|\|\s*target\.tagName\s*===\s*'TEXTAREA'\s*\|\|\s*target\.isContentEditable/)
})
