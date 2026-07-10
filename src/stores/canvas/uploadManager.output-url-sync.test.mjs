import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./uploadManager.js', import.meta.url), 'utf8')
const commitSource = readFileSync(new URL('./mediaUploadCommit.js', import.meta.url), 'utf8')

test('image upload retry syncs output.url as well as output.urls', () => {
  const updateMatch = source.match(/async function updateNodeWithCloudUrl\(task\) \{[\s\S]*?^\s{2}\}/m)
  assert.ok(updateMatch, 'updateNodeWithCloudUrl should exist')
  const fn = updateMatch[0]

  assert.match(fn, /canvasStore\.commitMediaUpload\(/)
  assert.match(fn, /blobUrl:\s*task\.blobUrl/)
  assert.match(fn, /uploaded/)
  assert.match(commitSource, /next\.url === from/)
  assert.match(commitSource, /replaceArray\(next\.urls, from, to\)/)
})
