import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'history.js'), 'utf8')

test('canvas history fetches all paginated history pages instead of only the first page', () => {
  assert.match(source, /async function fetchHistoryPages/)
  assert.match(source, /offset \+= pageLimit/)
  assert.match(source, /hasMore/)
  assert.match(source, /offset=\$\{offset\}/)
})
