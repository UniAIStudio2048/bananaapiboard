import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// client.js 使用 Vite 别名 @/，注册最小别名解析 hook（@/ -> <项目根>/src/）
const projectRoot = new URL('../../', import.meta.url)
const aliasLoader = `
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = new URL('./src/' + specifier.slice(2), ${JSON.stringify(projectRoot.href)})
    let url = base.href
    if (!existsSync(fileURLToPath(base))) {
      url = new URL(base.pathname + '.js', base).href
    }
    return { url, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
`
register('data:text/javascript,' + encodeURIComponent(aliasLoader), projectRoot)

const store = new Map()
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
}
globalThis.window = { dispatchEvent() {}, addEventListener() {} }
globalThis.CustomEvent = class { constructor(type) { this.type = type } }

const fetchCalls = []
let nextResponse = () => ({ ok: true, status: 200, body: { id: 1, username: 'alice', points: 10 } })
globalThis.fetch = async (url, options) => {
  fetchCalls.push({ url: String(url), options })
  const { ok, status, body } = nextResponse()
  return { ok, status, text: async () => JSON.stringify(body), json: async () => body }
}

const client = await import('./client.js')
const { getMe, fetchMeShared, invalidateMeCache, persistAuthSession, clearAuthSession } = client

function reset(token = 'token-a') {
  invalidateMeCache()
  store.clear()
  if (token) store.set('token', token)
  fetchCalls.length = 0
  nextResponse = () => ({ ok: true, status: 200, body: { id: 1, username: 'alice', points: 10 } })
}

test('concurrent getMe calls (and the router guard request) share one /api/user/me request', async () => {
  reset()
  const [a, b, guard] = await Promise.all([getMe(), getMe(), fetchMeShared()])
  assert.equal(fetchCalls.length, 1)
  assert.ok(fetchCalls[0].url.includes('/api/user/me'))
  assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer token-a')
  assert.deepEqual(a, b)
  assert.notEqual(a, b, 'each caller gets its own object')
  assert.equal(guard.status, 200)
})

test('getMe reuses the result within 2 seconds', async () => {
  reset()
  await getMe()
  await getMe()
  assert.equal(fetchCalls.length, 1)
})

test('forceRefresh always issues a new request', async () => {
  reset()
  await getMe()
  await getMe(true)
  assert.equal(fetchCalls.length, 2)
  assert.ok(fetchCalls[1].url.includes('_t='))
  assert.equal(fetchCalls[1].options.cache, 'no-store')
})

test('teamId requests are keyed separately', async () => {
  reset()
  await getMe()
  await getMe(false, { teamId: 'team-1' })
  assert.equal(fetchCalls.length, 2)
  assert.ok(fetchCalls[1].url.includes('teamId=team-1'))
})

test('logout (clearAuthSession) invalidates the cache', async () => {
  reset()
  await getMe()
  clearAuthSession()
  assert.equal(await getMe(), null, 'no token -> no request')
  store.set('token', 'token-a')
  await getMe()
  assert.equal(fetchCalls.length, 2)
})

test('login with a new token invalidates the cache', async () => {
  reset()
  await getMe()
  persistAuthSession('token-b', { id: 2, username: 'bob' })
  await getMe()
  assert.equal(fetchCalls.length, 2)
  assert.equal(fetchCalls[1].options.headers.Authorization, 'Bearer token-b')
})

test('persisting the same token from getMe keeps the short cache', async () => {
  reset()
  await getMe()
  await getMe()
  assert.equal(fetchCalls.length, 1)
  assert.equal(JSON.parse(store.get('user')).username, 'alice')
})

test('invalidateMeCache (profile update) forces the next call to refetch', async () => {
  reset()
  await getMe()
  invalidateMeCache()
  await getMe()
  assert.equal(fetchCalls.length, 2)
})

test('401 is shared with the guard but not cached', async () => {
  reset()
  nextResponse = () => ({ ok: false, status: 401, body: {} })
  const [me, guard] = await Promise.all([getMe(), fetchMeShared()])
  assert.equal(me, null)
  assert.equal(guard.status, 401)
  assert.equal(guard.ok, false)
  assert.equal(fetchCalls.length, 1)
  await getMe()
  assert.equal(fetchCalls.length, 2)
})
