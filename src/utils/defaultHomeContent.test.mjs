import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultHomeContent, isDefaultHomepage, defaultHomepageTitle } from './defaultHomeContent.js'
import { setPageTitle, refreshDocumentTitle } from './pageTitle.js'

test('homepage content and title are restricted to the default tenant root route', () => {
  assert.equal(isDefaultHomepage('/', 'default-tenant-001'), true)
  for (const [path, tenant] of [['/', 'tenant-other'], ['/community', 'default-tenant-001'], ['/canvas', 'default-tenant-001'], ['/', undefined]]) {
    assert.equal(isDefaultHomepage(path, tenant), false)
    assert.equal(defaultHomepageTitle(path, tenant), '')
  }
})

test('homepage search title survives asynchronous brand refresh and clears on navigation', () => {
  globalThis.document = { title: '' }
  try {
    setPageTitle(defaultHomepageTitle('/', 'default-tenant-001'), '旧的品牌长标题', 'Nano Banana')
    assert.match(document.title, /^无限画布.*AI绘画.*AI视频生成/)
    refreshDocumentTitle('Nano Banana - AI视频/漫剧创作画布')
    assert.equal(document.title, `${defaultHomeContent.pageTitle} - Nano Banana`)
    setPageTitle('创作社区', 'Nano Banana')
    assert.equal(document.title, '创作社区 - Nano Banana')
  } finally {
    delete globalThis.document
  }
})
