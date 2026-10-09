import assert from 'node:assert/strict'
import test from 'node:test'
import { exchangeUserCanvasLogin } from './userCanvasLogin.js'

test('先清除 URL 中的凭据，再 POST 兑换，成功才替换用户会话', async () => {
  const order = [], token = 'a'.repeat(43)
  const result = await exchangeUserCanvasLogin({
    location: { hash: `#token=${token}`, pathname: '/admin/canvas-login' },
    history: { replaceState(...args) { order.push(['clean', args[2]]) } },
    apiUrl: '/api/auth/login/canvas', tenantHeaders: { 'X-Tenant-ID': 'tenant-a' },
    fetchImpl: async (url, options) => {
      order.push(['exchange', url])
      assert.equal(options.headers.Authorization, undefined)
      assert.equal(options.headers['X-Tenant-ID'], 'tenant-a')
      assert.equal(JSON.parse(options.body).token, token)
      return { ok: true, json: async () => ({ token: 'new-session', user: { id: 'target', tenant_id: 'tenant-a' } }) }
    },
    persistSession: (...args) => order.push(['persist', ...args])
  })
  assert.equal(result.user.id, 'target')
  assert.deepEqual(order.map(item => item[0]), ['clean', 'exchange', 'persist'])
  assert.equal(order[0][1], '/admin/canvas-login')
})

test('直接访问或旧链接不会沿用已有身份进入画布', async () => {
  let exchanged = false, persisted = false
  const options = {
    location: { hash: '', pathname: '/admin/canvas-login' }, history: { replaceState() {} },
    tenantHeaders: { 'X-Tenant-ID': 'tenant-a' },
    fetchImpl: async () => { exchanged = true; return { ok: false, json: async () => ({ message: '链接已失效' }) } },
    persistSession: () => { persisted = true }
  }
  await assert.rejects(exchangeUserCanvasLogin(options), /用户管理/)
  assert.equal(exchanged, false)
  options.location.hash = `#token=${'a'.repeat(43)}`
  await assert.rejects(exchangeUserCanvasLogin(options), /链接已失效/)
  assert.equal(persisted, false)
})

test('响应租户不匹配时不保存会话', async () => {
  await assert.rejects(exchangeUserCanvasLogin({
    location: { hash: `#token=${'a'.repeat(43)}`, pathname: '/admin/canvas-login' },
    history: { replaceState() {} }, tenantHeaders: { 'X-Tenant-ID': 'tenant-a' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ token: 'session', user: { id: 'u', tenant_id: 'other' } }) }),
    persistSession: () => assert.fail('must not persist')
  }), /租户/)
})
