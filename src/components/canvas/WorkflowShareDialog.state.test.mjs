import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { compile, createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

const source = readFileSync(new URL('./WorkflowShareDialog.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const render = compile(descriptor.template.content)

async function renderDialog(overrides = {}) {
  const context = {}
  const state = {
    modelValue: true, loading: false, saving: false, errorMessage: '', workflowKey: 'saved-workflow',
    workflowTitle: '新建工作流', shareState: null, canManage: false, resolvedSpaceType: 'personal',
    selectedMode: 'disabled', currentMode: 'disabled', needsConfirmation: false, hasChanges: false,
    shareUrl: '', confirmed: false, copied: false,
    modeOptions: [{ value: 'disabled', title: '关闭公开分享' }, { value: 'view', title: '仅查看' }, { value: 'clone', title: '查看并克隆' }],
    close() {}, loadStatus() {}, selectMode() {}, saveShareMode() {}, copyShareLink() {}, resetShareLink() {},
    ...overrides
  }
  await renderToString(createSSRApp({ data: () => state, render }), context)
  return context.teleports?.body || ''
}

for (const resolvedSpaceType of ['personal', 'team']) {
  test(`${resolvedSpaceType} load failures do not masquerade as read-only or disabled shares`, async () => {
    const html = await renderDialog({ resolvedSpaceType, errorMessage: '分享不存在或已失效' })
    assert.match(html, /分享不存在或已失效/)
    assert.doesNotMatch(html, /团队分享状态只读|当前状态|关闭公开分享/)
    assert.match(html, /重新加载/)
  })
}

test('personal owners can choose all sharing modes after a successful load', async () => {
  const html = await renderDialog({ shareState: { mode: 'disabled', canManage: true }, canManage: true })
  assert.doesNotMatch(html, /团队分享状态只读/)
  assert.match(html, /仅查看/)
  assert.match(html, /查看并克隆/)
  assert.match(html, /保存分享设置/)
})

test('team members retain the read-only status view', async () => {
  const html = await renderDialog({ resolvedSpaceType: 'team', shareState: { mode: 'disabled', canManage: false } })
  assert.match(html, /团队分享状态只读/)
  assert.match(html, /当前状态/)
  assert.doesNotMatch(html, /保存分享设置/)
})
