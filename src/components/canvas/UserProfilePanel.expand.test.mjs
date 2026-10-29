import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse, compile } from '@vue/compiler-dom'
import { runInNewContext } from 'node:vm'
import * as Vue from 'vue'

const source = readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../styles/canvas-chrome.css', import.meta.url), 'utf8')
const template = parseSfc(source).descriptor.template.content
const ast = parse(template)
function find(node, predicate) {
  if (node.type === 1 && predicate(node)) return node
  for (const child of node.children || []) { const found = find(child, predicate); if (found) return found }
}
const expandButton = find(ast, node => node.tag === 'button' && node.loc.source.includes('profile-expand-btn'))

test('展开和还原按钮切换面板状态并提供明确的无障碍名称', () => {
  assert.ok(expandButton)
  const render = runInNewContext(`(function () { ${compile(expandButton.loc.source).code} })()`, { Vue })
  const ctx = { isProfileExpanded: false, Maximize2: 'svg', Minimize2: 'svg' }
  let button = render(ctx, [])
  assert.equal(button.props['aria-expanded'], false)
  assert.equal(button.props['aria-label'], '放大个人中心')
  button.props.onClick()
  button = render(ctx, [])
  assert.equal(button.props['aria-expanded'], true)
  assert.equal(button.props['aria-label'], '还原个人中心')
  button.props.onClick()
  assert.equal(ctx.isProfileExpanded, false)
})

test('关闭面板时重置窗口状态，放大窗口包含自适应内容区域', () => {
  assert.match(source, /watch\(\(\) => props\.visible,[\s\S]*?isProfileExpanded\.value = false/)
  assert.match(source, /class="profile-panel"[\s\S]*?is-expanded[\s\S]*?isProfileExpanded \? \{\}/)
  assert.match(source, /<ChevronLeft[^>]*aria-hidden="true"/)
  assert.match(css, /\.profile-panel\.is-expanded[\s\S]*?grid-template-areas/)
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*?\.profile-panel\.is-expanded/)
})
