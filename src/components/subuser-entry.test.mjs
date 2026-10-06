import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as Vue from 'vue'
import { parse } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'

function template(path) {
  return parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8')).descriptor.template.content
}

function links(node, found = []) {
  if (node.tag === 'RouterLink' && node.props.some(prop => prop.name === 'to' && prop.value?.content === '/subuser')) found.push(node.loc.source)
  for (const child of node.children || []) links(child, found)
  return found
}

async function render(source, data) {
  const app = Vue.createSSRApp({ data: () => data, render: new Function('Vue', compile(source, { prefixIdentifiers: true }).code)(Vue) })
  app.component('RouterLink', { props: ['to'], setup: (props, { slots }) => () => Vue.h('a', { href: props.to }, slots.default?.()) })
  app.component('SubuserPanel', { setup: () => () => Vue.h('button', '创建子用户') })
  return renderToString(app)
}

const entries = [
  ['画布', './canvas/UserProfilePanel.vue', 'userInfo'],
  ['顶部和移动端', '../App.vue', 'me']
]

for (const [name, path, key] of entries) {
  const quickLinks = links(baseParse(template(path))).filter(source => !source.includes('创建子用户'))
  for (const [label, user, visible] of [
    ['未登录', null, false],
    ['未创建子用户', { is_subuser: false, has_subusers: false }, false],
    ['旧接口缺少子用户状态', { is_subuser: false }, false],
    ['已创建子用户', { is_subuser: false, has_subusers: true }, true],
    ['子用户', { is_subuser: true, has_subusers: true }, false]
  ]) {
    test(`${name}快捷入口：${label}`, async () => {
      assert.ok(quickLinks.length)
      for (const link of quickLinks) assert.equal((await render(link, { [key]: user })).includes('href="/subuser"'), visible)
    })
  }
}

for (const [path, key] of [['./canvas/UserProfilePanel.vue', 'userInfo'], ['../views/User.vue', 'me']]) {
  test(`${path}账户管理保留主用户首次创建入口，子用户隐藏`, async () => {
    const createLinks = links(baseParse(template(path))).filter(source => source.includes('创建子用户'))
    assert.equal(createLinks.length, 1)
    for (const isSubuser of [false, true]) {
      const html = await render(createLinks[0], { [key]: { is_subuser: isSubuser } })
      assert.equal(html.includes('href="/subuser"'), !isSubuser)
    }
  })
}

for (const [label, me, loading, allowed] of [
  ['加载中不显示创建按钮', null, true, false],
  ['主用户可首次创建', { is_subuser: false }, false, true],
  ['子用户直达也无法创建', { is_subuser: true }, false, false],
  ['未登录无法创建', null, false, false]
]) {
  test(label, async () => {
    const html = await render(template('../views/Subusers.vue'), { me, loading, send: () => {} })
    assert.equal(html.includes('<button>创建子用户</button>'), allowed)
  })
}
