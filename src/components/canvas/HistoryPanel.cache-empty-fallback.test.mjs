import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

test('canvas history panel treats empty indexeddb cache as a miss and refetches from server', () => {
  assert.match(source, /Array\.isArray\(cachedData\) && cachedData\.length > 0/)
  assert.match(source, /IndexedDB 缓存为空，回源刷新/)
  assert.doesNotMatch(source, /if \(cachedData\) \{\s*historyList\.value = cachedData/)
})
