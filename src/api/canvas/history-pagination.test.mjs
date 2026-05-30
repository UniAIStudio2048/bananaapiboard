import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'history.js'), 'utf8')

test('canvas history supports bounded paginated fetching', () => {
  assert.match(source, /async function fetchHistoryPages/)
  assert.match(source, /function getHistoryMaxPages/)
  assert.match(source, /const maxPages = getHistoryMaxPages\(params\.maxPages\)/)
  assert.match(source, /page < maxPages/)
  assert.match(source, /offset \+= pageLimit/)
  assert.match(source, /hasMore/)
  assert.match(source, /offset=\$\{offset\}/)
})

test('canvas history preserves preview metadata fields for media details', () => {
  assert.match(source, /finished_at: img\.finished_at \|\| img\.finishedAt/)
  assert.match(source, /file_size: img\.file_size \|\| img\.fileSize \|\| img\.size_bytes/)
  assert.match(source, /fps: vid\.fps \|\| vid\.frame_rate \|\| vid\.frameRate/)
  assert.match(source, /finished_at: aud\.completed_at \|\| aud\.finished_at \|\| aud\.finishedAt/)
})
