import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

test('canvas history panel uses aspect ratios instead of fixed card heights', () => {
  assert.match(source, /getHistoryCardAspectStyle/)
  assert.match(source, /normalizeHistoryAspectRatio/)
  assert.match(source, /columnItems/)
  assert.doesNotMatch(source, /height:\s*172px/)
  assert.doesNotMatch(source, /:style="\{ height: totalHeight \+ 'px' \}"/)
})
