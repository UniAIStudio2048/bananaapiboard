import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createWechatAttempt, readWechatCallback, safeWechatReturnPath } from './wechatLogin.js'

test('每次扫码使用独立浏览器随机凭据和 SHA256 challenge', async () => {
  const a = await createWechatAttempt(webcrypto), b = await createWechatAttempt(webcrypto)
  assert.match(a.verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.match(a.challenge, /^[a-f0-9]{64}$/)
  assert.notEqual(a.verifier, b.verifier)
})
test('回调必须与本标签页、租户和 state 对应，且未过期', () => {
  const stored = { state: 's', verifier: 'v', tenantId: 't1', expiresAt: 1000, returnPath: '/canvas' }
  const input = { href: 'https://canvas.example.com/wechat/callback?code=c&state=s', stored, tenantId: 't1', now: 500 }
  assert.deepEqual(readWechatCallback(input), { code: 'c', state: 's', verifier: 'v', returnPath: '/canvas' })
  for (const change of [{ stored: null }, { tenantId: 't2' }, { now: 1001 }, { href: input.href.replace('state=s', 'state=wrong') }, { href: input.href.replace('code=c&', '') }]) {
    assert.throws(() => readWechatCallback({ ...input, ...change }))
  }
})
test('登录完成只能返回本站路径，阻断协议相对 URL、反斜杠和回调循环', () => {
  for (const value of ['//evil.com', '/\\evil.com', 'https://evil.com', '/wechat/callback', '/%5cevil.com', '/\nevil.com']) assert.equal(safeWechatReturnPath(value), '/canvas')
  assert.equal(safeWechatReturnPath('/community?tab=new'), '/community?tab=new')
})
