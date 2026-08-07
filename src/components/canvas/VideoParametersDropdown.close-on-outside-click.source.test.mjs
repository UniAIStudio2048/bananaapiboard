import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoParametersDropdown.vue', import.meta.url), 'utf8')

test('dropdown closes on prompt/panel mousedown via capture-phase document listener', () => {
  assert.match(source, /document\.addEventListener\('mousedown', handleDocumentMouseDown, true\)/)
  assert.match(source, /document\.removeEventListener\('mousedown', handleDocumentMouseDown, true\)/)
})

test('dropdown stays open for clicks inside its own root', () => {
  assert.match(source, /if \(!rootRef\.value\?\.contains\(event\.target\)\) \{\s*isOpen\.value = false\s*\}/)
})
