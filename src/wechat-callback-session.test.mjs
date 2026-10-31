import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('微信回调在交换新身份前不发起旧账号刷新，普通页面仍刷新', async () => {
  const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
  const start = source.indexOf('onMounted(async () => {') + 'onMounted(async () => {'.length
  const end = source.indexOf('  me.value = await getMe()', start)
  const runGuard = new Function('window', 'route', 'getMe', `return (async () => { ${source.slice(start, end)}; await getMe() })()`)
  for (const pathname of ['/wechat/callback', '/admin/canvas-login', '/canvas']) {
    let called = false
    await runGuard({ location: { pathname } }, {}, () => { called = true })
    assert.equal(called, pathname === '/canvas', pathname)
  }
})
