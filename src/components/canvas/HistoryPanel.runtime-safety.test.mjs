import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

test('canvas history panel keeps legacy scroll refs defined for mounted and unmounted hooks', () => {
  assert.match(source, /let scrollRAF = null/)
  assert.match(source, /let pendingScrollTop = 0/)
  assert.match(source, /function updateContainerHeight\(\)/)
})
