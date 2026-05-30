import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

test('history panel renders first server page before full background refresh', () => {
  assert.match(source, /maxPages:\s*1/)
  assert.match(source, /cacheResult:\s*false/)
  assert.match(source, /_refreshHistoryInBackground\(spaceParams, spaceType, teamId/)
})

test('history panel auto refresh checks only the first history page', () => {
  assert.match(source, /getHistory\(\{ \.\.\.spaceParams, noCache: true, maxPages: 1 \}\)/)
  assert.match(source, /function _isHistoryPrefixEqual/)
})
