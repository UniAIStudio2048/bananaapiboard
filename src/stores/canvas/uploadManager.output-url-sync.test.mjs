import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./uploadManager.js', import.meta.url), 'utf8')

test('image upload retry syncs output.url as well as output.urls', () => {
  const updateMatch = source.match(/async function updateNodeWithCloudUrl\(task\) \{[\s\S]*?^\s{2}\}/m)
  assert.ok(updateMatch, 'updateNodeWithCloudUrl should exist')
  const fn = updateMatch[0]

  assert.match(fn, /node\.data\?\.output\?\.urls/)
  assert.match(fn, /node\.data\?\.output\?\.url === task\.blobUrl/)
  assert.match(fn, /url: task\.cloudUrl/)
})
