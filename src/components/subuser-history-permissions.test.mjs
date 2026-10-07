import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as Vue from 'vue'
import { parse } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

function actions(node, match) {
  const source = node.loc?.source || ''
  if (['button', 'div'].includes(node.tag) && node.props?.some(prop => prop.type === 7 && prop.name === 'on' && match.test(prop.exp?.content || ''))) return [source]
  return (node.children || []).flatMap(child => actions(child, match))
}

for (const [path, match, count, canvas] of [
  ['./canvas/HistoryPanel.vue', /^handleDelete\(/, 3, true],
  ['./canvas/WorkflowPanel.vue', /^confirmDelete\(.*true\)$|^clearHistoryConfirm = true$/, 2, true],
  ['../views/Home.vue', /^deleteHistoryImage\(/, 4, false],
  ['../views/VideoGeneration.vue', /^deleteHistory\(/, 1, false],
  ['../views/User.vue', /^deleteImage\(|^deleteVideo\(/, 2, false]
]) {
  const template = parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8')).descriptor.template.content
  const entries = actions(baseParse(template), match)
  for (const [name, user, allowed] of [
    ['禁止删除的子用户', { is_subuser: true, can_delete_history: false }, false],
    ['允许删除的子用户', { is_subuser: true, can_delete_history: true }, true],
    ['主用户', { is_subuser: false, can_delete_history: true }, true],
    ['兼容旧用户信息', { is_subuser: false }, true],
    ['用户信息加载中', null, false]
  ]) {
    test(`${path}: ${name}删除入口`, async () => {
      assert.equal(entries.length, count)
      for (const entry of entries) {
        const render = new Function('Vue', compile(entry, { prefixIdentifiers: true }).code)(Vue)
        const html = await renderToString(Vue.createSSRApp({
          data: () => ({ me: user, canDeleteHistory: Boolean(user && user.can_delete_history !== false), historyWorkflows: [{}], t: value => value, item: {}, h: {}, image: {}, video: {}, contextMenuItem: {}, previewItem: {} }),
          render
        }))
        assert.equal(/<(button|div)[\s>]/.test(html), allowed, `${canvas ? '画布' : '页面'}: ${entry}`)
      }
    })
  }
}

test('Canvas passes the current user permission to both history panels', () => {
  const source = fs.readFileSync(new URL('../views/Canvas.vue', import.meta.url), 'utf8')
  for (const name of ['HistoryPanel', 'WorkflowPanel']) {
    const tag = source.match(new RegExp(`<${name}\\b[^>]*>`))?.[0]
    assert.match(tag, /:can-delete-history="(?:!!me|Boolean\(me\)).*me\.can_delete_history !== false/)
  }
})
