import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as Vue from 'vue'
import { parse } from '@vue/compiler-sfc'
import { baseParse, compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
import { formatPoints } from '../utils/format.js'
import * as points from '../utils/points.js'

function permanentCards(node) {
  const children = (node.children || []).flatMap(permanentCards)
  if (children.length) return children
  const source = node.loc?.source || ''
  const label = /t\('user\.permanentPoints(?:Desc)?'\)|>永久积分<|💎 永久积分/.test(source)
  const balance = /formatPoints\((?:getPermanentUserPoints\(|toPointsNumber\(me\?\.points|me\.points|userInfo\?\.points)/.test(source)
  return ['div', 'button'].includes(node.tag) && label && balance ? [source] : []
}

for (const [name, path, key, count] of [
  ['画布个人中心', './canvas/UserProfilePanel.vue', 'userInfo', 1],
  ['桌面与移动导航', '../App.vue', 'me', 2],
  ['账户首页与积分详情', '../views/User.vue', 'me', 2]
]) {
  const source = parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8')).descriptor.template.content
  const cards = permanentCards(baseParse(source))
  for (const [label, user, expected] of [
    ['子用户分配与自有积分', { is_subuser: true, points: '30.25', subuser_points: '100.50', package_points: '20' }, '130.75'],
    ['只有分配积分', { is_subuser: true, points: 0, subuser_points: '100.50' }, '100.5'],
    ['分配余额回收后', { is_subuser: true, points: '30.25', subuser_points: 0 }, '30.25'],
    ['普通用户', { points: '74272.08' }, '74272.08']
  ]) {
    test(`${name}永久积分：${label}`, async () => {
      assert.equal(cards.length, count)
      for (const card of cards) {
        const app = Vue.createSSRApp({
          data: () => ({
            [key]: user, formatPoints, ...points, icons: { diamond: '' },
            t: key => key, pointsStats: { permanent: { earned: 0, spent: 0 } }
          }),
          render: new Function('Vue', compile(card, { prefixIdentifiers: true }).code)(Vue)
        })
        const html = await renderToString(app)
        assert.ok(html.replace(/<[^>]*>/g, ' ').split(/\s+/).includes(expected), html)
      }
    })
  }
}
