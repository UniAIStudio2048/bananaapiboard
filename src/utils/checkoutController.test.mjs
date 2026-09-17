import test from 'node:test'
import assert from 'node:assert/strict'
import { createCheckoutController } from './checkoutController.js'
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function fixture(overrides = {}) {
  let creates = 0, attempts = 0, paid = 0, timer
  const api = { methods: async () => [{ id: '1' }], create: async () => { creates++; return { id: 'order', status: 'pending' } },
    attempt: async () => { attempts++; return { id: 'attempt', status: 'pending', expires_at: 2000 } },
    status: async () => ({ id: 'order', status: 'pending', attempts: [] }), ...overrides }
  const controller = createCheckoutController({ api, onPaid: () => paid++, now: () => 1000,
    schedule: fn => { timer = fn; return 1 }, cancel: () => { timer = null } })
  return { controller, count: () => ({ creates, attempts, paid }), tick: () => timer?.() }
}
test('opening only loads enabled methods; selecting creates one attempt despite double click', async () => {
  const f = fixture(); await f.controller.open({ kind: 'recharge', amount: 1000 })
  assert.equal(f.count().creates, 0)
  await Promise.all([f.controller.choose('1'), f.controller.choose('1')])
  assert.equal(f.count().creates, 1); assert.equal(f.count().attempts, 1)
})
test('closing aborts and ignores late order and QR responses', async () => {
  const wait = deferred(); const f = fixture({ attempt: () => wait.promise })
  await f.controller.open({ kind: 'recharge', amount: 1000 })
  const work = f.controller.choose('1'); await new Promise(r => setImmediate(r))
  f.controller.close(); wait.resolve({ id: 'stale', status: 'pending' }); await work
  assert.equal(f.controller.state.attempt, null); assert.equal(f.controller.state.open, false)
})
test('expired refresh checks payment first and never creates another attempt after success', async () => {
  const f = fixture({ status: async () => ({ id: 'order', status: 'paid', attempts: [] }) })
  await f.controller.open({ kind: 'recharge', amount: 1000 }); await f.controller.choose('1')
  await f.controller.refresh()
  assert.equal(f.count().attempts, 1); assert.equal(f.count().paid, 1)
})
test('poll completion emits success once and cancels scheduled polling', async () => {
  const f = fixture({ status: async () => ({ id: 'order', status: 'paid', attempts: [] }) })
  await f.controller.open({ kind: 'recharge', amount: 1000 }); await f.controller.choose('1')
  await f.tick(); await f.tick(); assert.equal(f.count().paid, 1)
})
test('empty methods stay empty, failed method load does not retain previous methods', async () => {
  let fail = false; const f = fixture({ methods: async () => { if (fail) throw new Error('offline'); return [] } })
  await f.controller.open({ kind: 'recharge', amount: 1000 }); assert.deepEqual(f.controller.state.methods, [])
  fail = true; await f.controller.open({ kind: 'recharge', amount: 1000 }); assert.deepEqual(f.controller.state.methods, [])
  assert.match(f.controller.state.error, /offline/)
})

test('manual status refresh shares an in-flight poll instead of overlapping requests', async () => {
  const wait = deferred(); let requests = 0
  const f = fixture({ status: () => { requests++; return wait.promise } })
  await f.controller.open({ kind: 'recharge', amount: 1000 }); await f.controller.choose('1')
  const first = f.controller.poll(), second = f.controller.poll()
  assert.equal(requests, 1)
  wait.resolve({ id: 'order', status: 'pending', attempts: [] })
  await Promise.all([first, second])
})
test('a late status response cannot restore a previously selected payment channel', async () => {
  const wait = deferred()
  const f = fixture({ status: () => wait.promise, attempt: async (_order, method) => ({ id: method, method_id: method, status: 'pending', expires_at: 2000 }) })
  await f.controller.open({ kind: 'recharge', amount: 1000 }); await f.controller.choose('1')
  const polling = f.controller.poll(); await f.controller.choose('2')
  wait.resolve({ id: 'order', status: 'pending', attempts: [{ id: '1', method_id: '1' }] }); await polling
  assert.equal(f.controller.state.attempt.id, '2')
})
