/**
 * SkillsMarket「创建/编辑 Skill 弹窗居中 + 表单布局」回归测试（bugfix）。
 *
 * 缺陷：从 AI 灵感助手打开 Skill 市场（popover 锚定形态）后点击「创建」，
 * 编辑器表单仍停留在锚定 AI 助手旁的窄 popover 中（表单高 > 容器高，
 * 挤压滚动），未切换为整个画布居中的弹窗。
 *
 * 期望：
 *  1. startCreate/startEdit 进入编辑时切换 showAll = true（居中全屏形态）；
 *  2. 编辑状态下隐藏「全部/返回」形态切换按钮；
 *  3. 编辑器表单在宽弹窗下为双列限宽居中布局，窄屏回退单列。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/SkillsMarket.create-editor.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./SkillsMarket.vue', import.meta.url), 'utf8')

test('点击创建/编辑时切换为画布居中弹窗（showAll = true）', () => {
  assert.match(
    source,
    /function startCreate\(\) \{ showAll\.value = true; editing\.value = blankSkill\(\) \}/,
    'startCreate 应切换为居中全屏形态'
  )
  assert.match(
    source,
    /function startEdit\(skill\) \{ showAll\.value = true;/,
    'startEdit 应切换为居中全屏形态'
  )
})

test('编辑状态下隐藏「全部/返回」形态切换按钮', () => {
  assert.match(source, /v-if="!showAll && !editing"/, '「全部」按钮应在编辑时隐藏')
  assert.match(source, /v-else-if="showAll && !editing"/, '「返回」按钮应在编辑时隐藏')
})

test('「返回市场」按钮应使用文本按钮类而非图标按钮类', () => {
  assert.match(
    source,
    /<button class="all-button" type="button" @click="editing = null">返回市场<\/button>/,
    '返回市场是文本操作，不应使用 32px 方块图标按钮类 ghost-button'
  )
})

test('创建表单在居中弹窗下使用双列限宽布局', () => {
  assert.match(
    source,
    /\.skill-editor \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    '编辑器应使用双列网格'
  )
  assert.match(source, /max-width: 960px; margin: 0 auto;/, '编辑器应限宽居中')
  assert.match(
    source,
    /\.skill-editor label:has\(textarea\[rows="11"\]\)/,
    'SKILL.md 指令字段应跨双列'
  )
  assert.match(
    source,
    /@media \(max-width: 640px\) \{[\s\S]*?\.skill-editor \{ grid-template-columns: 1fr; \}/,
    '窄屏下编辑器应回退单列'
  )
})
