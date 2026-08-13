/**
 * 执行设置卡片视觉对齐 Agent 模式卡片：实底黑白灰，无玻璃拟态/蓝色高光。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.execution-settings-card.source.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

function extractRule(cssSource, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = cssSource.match(new RegExp(`${escaped} \\{[^}]*\\}`))
  return match?.[0] || ''
}

const styleStart = source.indexOf('<style')
const styleSource = styleStart >= 0 ? source.slice(styleStart) : source
const lightMarker = ':root.canvas-theme-light .ai-assistant-panel .execution-settings-popover'
const lightStart = styleSource.indexOf(lightMarker)
assert.ok(lightStart >= 0, 'light execution-settings-popover rule must exist')

const darkSource = styleSource.slice(0, lightStart)
const lightSource = styleSource.slice(lightStart)

const BLUE_TOKENS = /100,\s*150,\s*255|#3b82f6|180,\s*200,\s*255|59,\s*130,\s*246|150,\s*180,\s*255/

test('暗色执行设置卡片使用实底黑灰 chrome，无玻璃拟态', () => {
  const popover = extractRule(darkSource, '.execution-settings-popover')
  assert.ok(popover, 'dark .execution-settings-popover CSS block must exist')
  assert.match(popover, /background:\s*#252525/)
  assert.match(popover, /border-radius:\s*14px/)
  assert.doesNotMatch(popover, /linear-gradient/)
  assert.doesNotMatch(popover, /rgba\(30,\s*32,\s*40/)
})

test('暗色执行设置开关选中态不含蓝色 token', () => {
  const active = extractRule(darkSource, '.execution-toggle.active')
  assert.ok(active, 'dark .execution-toggle.active CSS block must exist')
  assert.doesNotMatch(active, /100,\s*150,\s*255/)
  assert.doesNotMatch(active, /#3b82f6/)
  assert.doesNotMatch(active, /180,\s*200,\s*255/)
})

test('浅色执行设置卡片使用实底白卡，无玻璃渐变和 blur', () => {
  const popover = extractRule(lightSource, lightMarker)
  assert.ok(popover, 'light .execution-settings-popover CSS block must exist')
  assert.match(popover, /background:\s*#ffffff/)
  assert.doesNotMatch(popover, /linear-gradient/)
  assert.doesNotMatch(popover, /backdrop-filter/)
})

test('浅色执行设置开关选中态不含蓝色 token', () => {
  const active = extractRule(
    lightSource,
    ':root.canvas-theme-light .ai-assistant-panel .execution-toggle.active',
  )
  assert.ok(active, 'light .execution-toggle.active CSS block must exist')
  assert.doesNotMatch(active, /#3b82f6/)
  assert.doesNotMatch(active, /59,\s*130,\s*246/)
})

test('开关开态轨道不含蓝色 token', () => {
  const darkOn = extractRule(darkSource, '.execution-toggle.active .execution-toggle__switch')
  const lightOn = extractRule(
    lightSource,
    ':root.canvas-theme-light .ai-assistant-panel .execution-toggle.active .execution-toggle__switch',
  )
  assert.ok(darkOn, 'dark switch-on CSS block must exist')
  assert.ok(lightOn, 'light switch-on CSS block must exist')
  assert.doesNotMatch(darkOn, BLUE_TOKENS)
  assert.doesNotMatch(lightOn, BLUE_TOKENS)
})
