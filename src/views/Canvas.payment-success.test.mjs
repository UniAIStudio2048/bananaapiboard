import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
const ast = parse(source, { sourceType: 'module' })
const handler = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'handlePurchaseSuccess')
function notify(data) {
  const toasts = []; let refreshed = 0
  const context = { data, console: { log() {} }, displayToast: (...args) => toasts.push(args), handleUserInfoUpdated: () => refreshed++ }
  runInNewContext(`${source.slice(handler.start, handler.end)}\nhandlePurchaseSuccess(data)`, context)
  return { toasts, refreshed }
}
test('balance recharge reports recharge success and refreshes user information', () => {
  assert.deepEqual(notify({ kind: 'recharge' }), { toasts: [['余额充值成功！', 'success', 3000]], refreshed: 1 })
})
test('package purchase reports package success and refreshes user information', () => {
  assert.deepEqual(notify({ kind: 'package' }), { toasts: [['套餐购买成功！', 'success', 3000]], refreshed: 1 })
})
test('balance-to-points refresh events do not report a package purchase', () => {
  assert.deepEqual(notify(undefined), { toasts: [], refreshed: 1 })
})
