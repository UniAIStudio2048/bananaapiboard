import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// tenant.js 使用 Vite 别名 @/，注册最小别名解析 hook（@/ -> <项目根>/src/）
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
const originalLog = console.log
console.log = () => {}

const pending = []
const fetchCalls = []
globalThis.fetch = (url) => {
  fetchCalls.push(String(url))
  return new Promise(resolve => pending.push({ url: String(url), resolve }))
}

const tenant = await import('./tenant.js')

function respond(urlPart, body) {
  const index = pending.findIndex(p => p.url.includes(urlPart))
  assert.notEqual(index, -1, `expected pending request for ${urlPart}`)
  const [entry] = pending.splice(index, 1)
  entry.resolve({ ok: true, status: 200, json: async () => body })
}
const flush = () => new Promise(resolve => setImmediate(resolve))
const count = part => fetchCalls.filter(u => u.includes(part)).length

function reset() {
  store.clear()
  fetchCalls.length = 0
  pending.length = 0
}

test('concurrent loadBrandConfig calls (forced or not) share one brand-config request', async () => {
  reset()
  const first = tenant.loadBrandConfig()
  const forced = tenant.loadBrandConfig(true)
  const forcedAgain = tenant.loadBrandConfig(true)
  await flush()
  assert.equal(count('/api/tenant-portal/brand-config'), 1)

  respond('/api/tenant-portal/brand-config', { brandName: 'Dedupe Brand' })
  const results = await Promise.all([first, forced, forcedAgain])
  assert.ok(results.every(brand => brand.name === 'Dedupe Brand'))
  assert.equal(count('/api/tenant-portal/brand-config'), 1)
})

test('forceReload within 5s of the last successful fetch reuses the fresh result', async () => {
  reset()
  const realNow = Date.now
  let clock = realNow() + 60 * 60 * 1000
  Date.now = () => clock
  try {
    const first = tenant.loadBrandConfig(true)
    await flush()
    respond('/api/tenant-portal/brand-config', { brandName: 'Fresh' })
    await first

    clock += 4999
    const reused = await tenant.loadBrandConfig(true)
    assert.equal(count('/api/tenant-portal/brand-config'), 1, 'no new request within 5s')
    assert.equal(reused.name, 'Fresh')
  } finally {
    Date.now = realNow
  }
})

test('forceReload 5s or more after the last successful fetch fetches again', async () => {
  reset()
  const realNow = Date.now
  let clock = realNow() + 2 * 60 * 60 * 1000
  Date.now = () => clock
  try {
    const first = tenant.loadBrandConfig(true)
    await flush()
    respond('/api/tenant-portal/brand-config', { brandName: 'A' })
    await first
    clock += 5000
    const second = tenant.loadBrandConfig(true)
    await flush()
    assert.equal(count('/api/tenant-portal/brand-config'), 2)
    respond('/api/tenant-portal/brand-config', { brandName: 'B' })
    assert.equal((await second).name, 'B')
  } finally {
    Date.now = realNow
  }
})

test('failed fetch does not count as fresh for forceReload', async () => {
  reset()
  const realNow = Date.now
  let clock = realNow() + 3 * 60 * 60 * 1000
  Date.now = () => clock
  try {
    const first = tenant.loadBrandConfig(true)
    await flush()
    const [entry] = pending.splice(0, 1)
    entry.resolve({ ok: false, status: 500, json: async () => ({}) })
    await first
    clock += 1000
    const second = tenant.loadBrandConfig(true)
    await flush()
    assert.equal(count('/api/tenant-portal/brand-config'), 2)
    respond('/api/tenant-portal/brand-config', { brandName: 'C' })
    assert.equal((await second).name, 'C')
  } finally {
    Date.now = realNow
  }
})

test('non-forced call within the 1 minute cache window does not hit the network', async () => {
  reset()
  store.set('brand_config_last_update', String(Date.now()))
  const brand = await tenant.loadBrandConfig()
  assert.equal(count('/api/tenant-portal/brand-config'), 0)
  assert.ok(brand)
})

test('concurrent loadModelEntitlements calls share one request per token', async () => {
  reset()
  store.set('token', 'token-a')
  const a = tenant.loadModelEntitlements()
  const b = tenant.loadModelEntitlements()
  assert.equal(count('/api/user/model-entitlements'), 1)
  respond('/api/user/model-entitlements', { entitlements: { image: { x: true }, video: {} } })
  const [ea, eb] = await Promise.all([a, b])
  assert.deepEqual(ea, { image: { x: true }, video: {} })
  assert.equal(ea, eb)

  const c = tenant.loadModelEntitlements()
  assert.equal(count('/api/user/model-entitlements'), 2, 'finished requests are not cached')
  respond('/api/user/model-entitlements', { entitlements: { image: {}, video: {} } })
  await c
})

test('entitlement request for a different token is not shared', async () => {
  reset()
  store.set('token', 'token-a')
  const a = tenant.loadModelEntitlements()
  store.set('token', 'token-b')
  const b = tenant.loadModelEntitlements()
  assert.equal(count('/api/user/model-entitlements'), 2)
  respond('/api/user/model-entitlements', { entitlements: { image: {}, video: {} } })
  respond('/api/user/model-entitlements', { entitlements: { image: {}, video: {} } })
  await Promise.all([a, b])
})

test.after(() => { console.log = originalLog })
