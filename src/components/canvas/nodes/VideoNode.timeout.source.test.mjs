import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('canvas video polling uses the same 40 minute timeout for every mode', () => {
  assert.doesNotMatch(source, /48 \* 60 \* 60 \* 1000/)
  assert.doesNotMatch(source, /80 \* 60 \* 1000/)
  assert.match(source, /const MAX_POLL_TIME = 40 \* 60 \* 1000/g)
})
