import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeEmailWhitelist } from './emailWhitelist.js'

test('normalizes configured email domains without producing a double @ address', () => {
  assert.deepEqual(
    normalizeEmailWhitelist(['@qq.com', '163.com', ' @QQ.COM ', '@@yeah.net']),
    ['qq.com', '163.com', 'yeah.net']
  )
})

test('ignores empty and non-array whitelist values', () => {
  assert.deepEqual(normalizeEmailWhitelist(['', '@', null]), [])
  assert.deepEqual(normalizeEmailWhitelist(null), [])
})
