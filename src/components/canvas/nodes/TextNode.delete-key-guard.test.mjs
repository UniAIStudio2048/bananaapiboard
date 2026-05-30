import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')

test('text editor delete keys do not bubble to canvas node deletion while editor selection is active', () => {
  assert.match(source, /function\s+handleTextEditorDeleteKeyDown\(event\)/)
  assert.match(source, /event\.key\s*!==\s*'Backspace'[\s\S]*event\.key\s*!==\s*'Delete'/)
  assert.match(source, /window\.getSelection\?\.\(\)/)
  assert.match(source, /selection\?\.anchorNode/)
  assert.match(source, /selection\?\.focusNode/)
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(source, /document\.addEventListener\('keydown',\s*handleTextEditorDeleteKeyDown,\s*true\)/)
  assert.match(source, /document\.removeEventListener\('keydown',\s*handleTextEditorDeleteKeyDown,\s*true\)/)
})
