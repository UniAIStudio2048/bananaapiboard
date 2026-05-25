import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./LoginModal.vue', import.meta.url), 'utf8')

test('LoginModal pre-fills invite code from the current URL when opened', () => {
  assert.match(
    source,
    /new URLSearchParams\(window\.location\.search\)/,
    'community login modal should inspect the current URL query string'
  )
  assert.match(
    source,
    /params\.get\('invite'\).*params\.get\('code'\)/s,
    'community login modal should accept invite and code query parameters'
  )
  assert.match(
    source,
    /inviteCode\.value\s*=\s*inviteFromUrl/,
    'community login modal should pre-fill the invite code field'
  )
  assert.match(
    source,
    /mode\.value\s*=\s*'register'/,
    'community login modal should switch to registration when an invite code is present'
  )
})
