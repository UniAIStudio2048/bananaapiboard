/**
 * 渐进披露（AC-P2-02）测试：默认不展示深度思考/联网/授权策略三个独立图标；
 * 高级项收敛到「执行设置」齿轮弹层，弹层内不展示多余解释文字。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.progressive-disclosure.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('默认工具栏不暴露高级概念（三个独立图标已移除）', () => {
  // 输入区主工具栏（input-toolbar）内不再有 deep_think / web_search / 授权策略独立按钮
  const toolbar = panel.match(/<!-- 工具栏 -->[\s\S]*?<!-- 执行设置/)?.[0]
  assert.ok(toolbar, 'main toolbar block must exist')
  assert.doesNotMatch(toolbar, /深度思考按钮/, '主工具栏不得有独立深度思考按钮')
  assert.doesNotMatch(toolbar, /联网搜索按钮/, '主工具栏不得有独立联网按钮')
})

test('执行设置弹层内包含三个可配置项，且无多余解释文字', () => {
  const popover = panel.match(/execution-settings-popover[\s\S]*?<\/Transition>/)?.[0]
  assert.ok(popover, 'execution settings popover must exist')
  assert.match(popover, /深度思考/)
  assert.match(popover, /联网搜索/)
  assert.match(popover, /工具授权方式/)
  assert.doesNotMatch(popover, /execution-toggle__desc/, '弹层内不得有解释性 desc 文字')
  assert.match(panel, /class="execution-settings-popover"/, '弹层使用绝对定位浮层而非文档流')
})

test('执行设置弹层有独立 CSS（position 绝对定位，不占文档流）', () => {
  const css = panel.match(/\.execution-settings-popover \{[^}]*\}/)?.[0]
  assert.ok(css, 'execution-settings-popover CSS 必须存在')
  assert.match(css, /position: absolute/, '弹层必须绝对定位')
  assert.match(css, /bottom: calc\(100% \+ 8px\)/, '弹层浮在齿轮按钮上方')
  assert.match(css, /right: 0/, '弹层右对齐齿轮按钮')
  assert.match(css, /z-index/, '弹层需要 z-index 浮层')
})
