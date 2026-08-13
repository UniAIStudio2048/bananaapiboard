/**
 * SkillsMarket 昼夜模式（light/dark）适配回归测试（bugfix）。
 *
 * 缺陷：从 AI 助手打开的 Skill 市场弹窗卡片（is-popover 形态）背景
 * 硬编码深色 rgba(24,24,24,.98)，而卡片内文字/输入框颜色跟随
 * --canvas-* 主题变量——light 主题下深色背景 + 深色文字，内容看不清；
 * 原生 select 下拉列表也未设置 color-scheme 跟随主题。
 *
 * 期望：
 *  1. is-popover 背景改用主题变量 var(--canvas-bg-elevated)；
 *  2. .skills-market 设置 color-scheme: dark（原生控件随暗色渲染）；
 *  3. light 主题（:root.canvas-theme-light）下有完整覆盖：color-scheme:
 *     light、输入框/卡片/按钮等半透明白色改为浅色主题适配值。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/SkillsMarket.theme.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./SkillsMarket.vue', import.meta.url), 'utf8')

test('popover 形态背景应跟随主题变量而非硬编码深色', () => {
  assert.match(
    source,
    /\.skills-market\.is-popover \{[\s\S]*?background: var\(--canvas-bg-elevated\)/,
    'popover 卡片背景应使用主题变量'
  )
})

test('市场弹窗应设置 color-scheme 跟随主题（原生下拉列表渲染）', () => {
  assert.match(
    source,
    /\.skills-market \{[\s\S]*?color-scheme: dark/,
    '暗色默认应声明 color-scheme: dark'
  )
  assert.match(
    source,
    /:root\.canvas-theme-light \.skills-market \{[\s\S]*?color-scheme: light/,
    'light 主题应覆盖 color-scheme: light'
  )
})

test('light 主题下应有浅色背景适配（输入框/卡片等不再用白色半透明）', () => {
  assert.match(
    source,
    /:root\.canvas-theme-light \.skills-market [^{]*\.skill-editor (input|textarea|select)/,
    'light 下输入控件应有浅色适配背景'
  )
  assert.match(
    source,
    /:root\.canvas-theme-light \.skills-market [^{]*\.market-card/,
    'light 下市场卡片应有浅色适配背景'
  )
  assert.match(
    source,
    /:root\.canvas-theme-light \.skills-market [^{]*\.create-button/,
    'light 下创建按钮应有浅色适配背景'
  )
})
