/**
 * 渐进披露（AC-P2-02）测试：默认不展示深度思考/联网/授权策略三个独立图标；
 * 开启后输入区显示摘要 tag；产品不能实际控制的开关不显示。
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

test('执行设置弹层内包含三个可配置项', () => {
  const popover = panel.match(/execution-settings-popover[\s\S]*?<\/Transition>/)?.[0]
  assert.ok(popover, 'execution settings popover must exist')
  assert.match(popover, /深度思考/)
  assert.match(popover, /联网搜索/)
  assert.match(popover, /工具授权方式/)
})

test('开启的高级选项用摘要 tag 展示（executionSummaryTags 驱动）', () => {
  assert.match(panel, /executionSummaryTags\.length > 0/)
  assert.match(panel, /execution-summary__tag/)
  assert.match(panel, /v-if="executionSummaryTags\.length > 0" class="execution-summary"/)
})
