import test from 'node:test'
import assert from 'node:assert/strict'
import { createInflightRequestCache } from './inflightRequestCache.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('concurrent calls with the same key share one in-flight request', async () => {
  const cache = createInflightRequestCache({ ttl: 2000 })
  const d = deferred()
  let calls = 0
  const loader = () => { calls += 1; return d.promise }
  const a = cache.run('k', loader)
  const b = cache.run('k', loader)
  assert.equal(calls, 1)
  d.resolve('value')
  assert.deepEqual(await Promise.all([a, b]), ['value', 'value'])
})

test('results are reused within ttl and refetched after it expires', async () => {
  let clock = 0
  const cache = createInflightRequestCache({ ttl: 2000, now: () => clock })
  let calls = 0
  const loader = async () => { calls += 1; return calls }
  assert.equal(await cache.run('k', loader), 1)
  clock = 1999
  assert.equal(await cache.run('k', loader), 1)
  clock = 2000
  assert.equal(await cache.run('k', loader), 2)
})

test('different keys do not share requests or cached results', async () => {
  const cache = createInflightRequestCache({ ttl: 2000 })
  let calls = 0
  const loader = async () => { calls += 1; return calls }
  assert.equal(await cache.run('token-a|', loader), 1)
  assert.equal(await cache.run('token-b|', loader), 2)
  assert.equal(await cache.run('token-a|team', loader), 3)
})

test('skipCache bypasses cached and in-flight results but feeds later callers', async () => {
  const cache = createInflightRequestCache({ ttl: 2000 })
  let calls = 0
  const loader = async () => { calls += 1; return calls }
  assert.equal(await cache.run('k', loader), 1)
  assert.equal(await cache.run('k', loader, { skipCache: true }), 2)
  assert.equal(await cache.run('k', loader), 2, 'forced result refreshes the cache')

  const fresh = createInflightRequestCache({ ttl: 2000 })
  const forced = fresh.run('k', loader, { skipCache: true })
  const joined = fresh.run('k', loader)
  assert.equal(await forced, 3)
  assert.equal(await joined, 3, 'non-forced caller joins the forced in-flight request')
})

test('shouldCache=false results are shared while in flight but not cached', async () => {
  const cache = createInflightRequestCache({ ttl: 2000 })
  let calls = 0
  const loader = async () => { calls += 1; return { ok: false } }
  await Promise.all([cache.run('k', loader, { shouldCache: r => r.ok }), cache.run('k', loader, { shouldCache: r => r.ok })])
  assert.equal(calls, 1)
  await cache.run('k', loader, { shouldCache: r => r.ok })
  assert.equal(calls, 2)
})

test('rejections are shared, not cached, and release the in-flight slot', async () => {
  const cache = createInflightRequestCache({ ttl: 2000 })
  let calls = 0
  const loader = async () => { calls += 1; throw new Error('boom') }
  const results = await Promise.allSettled([cache.run('k', loader), cache.run('k', loader)])
  assert.equal(calls, 1)
  assert.ok(results.every(r => r.status === 'rejected'))
  await assert.rejects(cache.run('k', loader))
  assert.equal(calls, 2)
})

test('invalidate drops cached results and in-flight results started before it', async () => {
  const cache = createInflightRequestCache({ ttl: 2000 })
  let calls = 0
  const loader = async () => { calls += 1; return calls }
  assert.equal(await cache.run('k', loader), 1)
  cache.invalidate()
  assert.equal(await cache.run('k', loader), 2)

  const d = deferred()
  const stale = cache.run('k2', () => d.promise)
  cache.invalidate()
  const fresh = cache.run('k2', loader)
  d.resolve('stale')
  assert.equal(await stale, 'stale')
  assert.equal(await fresh, 3, 'call after invalidate must not join the pre-invalidate request')
  assert.equal(await cache.run('k2', loader), 3, 'stale result must not overwrite the cache')
})
