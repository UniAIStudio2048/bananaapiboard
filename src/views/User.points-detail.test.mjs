import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'User.vue'), 'utf8')

test('user points source analysis normalizes data before rendering', () => {
  assert.match(source, /normalizePointsSources\(pointsSources\.value\)/)
  assert.match(source, /getPointsSourcesMaxTotal\(normalizedPointsSources\.value\)/)
  assert.match(source, /pointsSourcesMaxTotal > 0 \?/)
})

test('user ledger records expose task id in the detail view', () => {
  assert.match(source, /item\.task_id/)
  assert.match(source, /任务ID：\{\{\s*item\.task_id\s*\}\}/)
})
