import test from 'node:test'
import assert from 'node:assert/strict'
import { composeDocumentTitle, isIndexableRoute, setPageTitle, refreshDocumentTitle } from './pageTitle.js'

test('composes page title with site title and falls back to default site title', () => {
  assert.equal(composeDocumentTitle('创作社区', 'Nano Banana'), '创作社区 - Nano Banana')
  assert.equal(composeDocumentTitle('', 'Nano Banana'), 'Nano Banana')
  assert.equal(composeDocumentTitle('', ''), 'ai绘图创作')
})

test('only public, indexable routes get their own title', () => {
  assert.equal(isIndexableRoute({ meta: { title: '社区', requiresAuth: false } }), true)
  assert.equal(isIndexableRoute({ meta: { title: '用户中心', requiresAuth: true } }), false)
  assert.equal(isIndexableRoute({ meta: { title: '分享', requiresAuth: false, noindex: true } }), false)
})

test('brand refresh keeps the current page title instead of overwriting it', () => {
  globalThis.document = { title: '' }
  setPageTitle('逐帧拉片', '')
  assert.equal(document.title, '逐帧拉片 - ai绘图创作')
  refreshDocumentTitle('Nano Banana')
  assert.equal(document.title, '逐帧拉片 - Nano Banana')
  setPageTitle('', 'Nano Banana')
  assert.equal(document.title, 'Nano Banana')
  delete globalThis.document
})
