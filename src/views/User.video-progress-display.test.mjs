import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'User.vue'), 'utf8')

test('user video history does not render raw provider progress directly', () => {
  assert.doesNotMatch(source, /\{\{\s*video\.progress\s*\}\}/)
  assert.doesNotMatch(source, /\{\{\s*selectedVideo\.progress\s*\}\}/)
  assert.match(source, /displayVideoProgress\(video\)/)
  assert.match(source, /displayVideoProgress\(selectedVideo\)/)
})

test('user ledger amounts use point formatting instead of raw values', () => {
  assert.doesNotMatch(source, /\{\{\s*item\.value\s*\}\}/)
  assert.equal(
    (source.match(/\{\{\s*item\.value > 0 \? '\+' : ''\s*\}\}\{\{\s*formatPoints\(item\.value\)\s*\}\}/g) || []).length,
    2
  )
})
