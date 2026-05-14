import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'UserProfilePanel.vue'), 'utf8')

test('canvas ledger panel shows task id and memo details', () => {
  assert.match(source, /ledgerDisplayItems/)
  assert.match(source, /item\.task_id/)
  assert.match(source, /item\.memo/)
  assert.match(source, /ledger-points-type/)
})
