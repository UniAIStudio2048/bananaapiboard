import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./checkout.js', import.meta.url), 'utf8').replace(/^import .*$/m, '').replace('export const checkoutApi', 'const checkoutApi')
function fixture(fetchImpl) {
  const timers = new Map(); let serial = 0, received
  const api = runInNewContext(`${source}\ncheckoutApi`, {
    AbortController, AbortSignal: {}, FormData, window: { location: { origin: 'https://example.test' } },
    localStorage: { getItem: () => null }, getTenantHeaders: () => ({}), getApiUrl: path => path,
    setTimeout: (fn, delay) => { assert.equal(delay, 25000); timers.set(++serial, fn); return serial },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => { received = options; return fetchImpl ? fetchImpl(url, options) : { ok: true, json: async () => ({ methods: [{ id: 1 }] }) } }
  })
  return { api, timers, options: () => received }
}
test('payment methods load without AbortSignal.any or AbortSignal.timeout', async () => {
  const f = fixture(); assert.equal((await f.api.methods('recharge', new AbortController().signal))[0].id, 1)
  assert.equal(f.timers.size, 0)
})
test('closing checkout cancels an in-flight request and cleans up', async () => {
  const f = fixture((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))))
  const parent = new AbortController(); const pending = f.api.methods('recharge', parent.signal)
  parent.abort(); await assert.rejects(pending, /aborted/)
  assert.equal(f.options().signal.aborted, true); assert.equal(f.timers.size, 0)
})
test('a stalled payment response is aborted after the timeout', async () => {
  const f = fixture((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timed out')))))
  const pending = f.api.list(); for (const expire of f.timers.values()) expire()
  await assert.rejects(pending, /timed out/); assert.equal(f.timers.size, 0)
})
test('already cancelled callers remain cancelled', async () => {
  const f = fixture((_url, { signal }) => { assert.equal(signal.aborted, true); throw new Error('aborted') })
  const parent = new AbortController(); parent.abort()
  await assert.rejects(f.api.methods('recharge', parent.signal), /aborted/)
  assert.equal(f.timers.size, 0)
})
test('network and JSON failures release timers and abort listeners', async () => {
  for (const failure of ['network', 'json']) {
    const f = fixture(() => { if (failure === 'network') throw new Error(failure); return { ok: true, json: async () => { throw new Error(failure) } } })
    const parent = new AbortController()
    await assert.rejects(f.api.methods('recharge', parent.signal), new RegExp(failure))
    parent.abort(); assert.equal(f.options().signal.aborted, false); assert.equal(f.timers.size, 0)
  }
})
