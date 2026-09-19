import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
const source = readFileSync(new URL('./checkoutController.js', import.meta.url), 'utf8').replace('export function', 'function')
function fixture(crypto, overrides = {}) {
  const keys = [], orderKeys = []; let fail = true
  const create = runInNewContext(`Array.prototype.at = undefined;\n${source}\ncreateCheckoutController`, { crypto, AbortController, Uint8Array })
  const controller = create({ api: {
    methods: async () => [{ id: 1 }],
    create: async (_input, key) => { orderKeys.push(key); if (fail) { fail = false; throw new Error('offline') } return { id: 'order' } },
    attempt: async (_id, _method, key) => { keys.push(key); return { id: key, expires_at: Date.now() + 60000 } },
    ...overrides
  }, schedule: () => 1, cancel: () => {} })
  return { controller, keys, orderKeys }
}
test('older and HTTP browsers can create payments with stable retry keys and distinct attempt keys', async () => {
  const f = fixture({ getRandomValues: bytes => webcrypto.getRandomValues(bytes) })
  await f.controller.open({ kind: 'recharge', amount: 100 }); await f.controller.choose(1); await f.controller.choose(1); await f.controller.choose(2)
  assert.equal(f.controller.state.error, ''); assert.equal(f.orderKeys.length, 2)
  assert.equal(f.orderKeys[0], f.orderKeys[1]); assert.equal(f.keys.length, 2)
  assert.notEqual(f.keys[0], f.keys[1]); assert.notEqual(f.keys[0], f.orderKeys[0])
  for (const key of [...f.keys, ...f.orderKeys]) assert.match(key, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
})
test('resuming an order works without Array.at', async () => {
  // Use the VM realm array to reproduce the older browser API surface.
  const attempts = runInNewContext('Array.prototype.at = undefined; [{ id: "old" }, { id: "latest", method_id: 2 }]')
  const g = fixture(webcrypto, { status: async () => ({ id: 'order', kind: 'recharge', attempts }) })
  await g.controller.open({}, 'order'); assert.equal(g.controller.state.attempt?.id, 'latest'); assert.equal(g.controller.state.error, '')
})
test('missing secure random support produces a visible error instead of rejecting open', async () => {
  const f = fixture(undefined); await f.controller.open({ kind: 'recharge', amount: 100 })
  assert.equal(f.controller.state.open, true); assert.equal(f.controller.state.busy, false); assert.ok(f.controller.state.error)
})
