import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

test('canvas history panel displays model display names instead of raw model ids', () => {
  assert.match(source, /function getHistoryModelDisplayName\(item\)/)
  assert.match(source, /class="overlay-model"[\s\S]*getHistoryModelDisplayName\(item\)/)
  assert.match(source, /class="info-tag"[\s\S]*getHistoryModelDisplayName\(previewItem\)/)
  assert.doesNotMatch(source, /class="overlay-model"[^>]*>\{\{ item\.model \}\}/)
  assert.doesNotMatch(source, /class="info-tag">\{\{ previewItem\.model \}\}/)
})

