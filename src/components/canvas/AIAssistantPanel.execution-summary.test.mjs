/**
 * 执行设置（AC-P2-02/AC-P2-03 修订）测试：
 * 默认输入区只突出输入/附件/模型/发送；深度思考/联网/授权收敛到执行设置；
 * 弹层内不展示多余的解释文字；输入区下方不再渲染执行摘要条；
 * 深度思考默认开启。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.execution-summary.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('默认输入区只突出输入/附件/模型/发送；深度思考/联网/授权收敛到执行设置', () => {
  // 深度思考与联网不再是独立的一级工具栏按钮
  const toolbarRight = panel.match(/toolbar-right[\s\S]*?send-btn/)?.[0]
  assert.ok(toolbarRight, 'toolbar-right must exist')
  assert.doesNotMatch(toolbarRight, /title="深度思考"/, '深度思考不得作为一级按钮暴露')
  assert.doesNotMatch(toolbarRight, /title="联网搜索"/, '联网搜索不得作为一级按钮暴露')
  // 执行设置入口存在
  assert.match(panel, /执行设置（AC-P2-02 渐进披露）/)
  assert.match(panel, /title="执行设置"/)
})

test('执行设置弹层不展示多余解释文字（只保留开关与标题）', () => {
  const popover = panel.match(/execution-settings-popover[\s\S]*?<\/Transition>/)?.[0]
  assert.ok(popover, 'execution settings popover must exist')
  assert.match(popover, /深度思考/)
  assert.match(popover, /联网搜索/)
  assert.match(popover, /工具授权方式/)
  // 开关只保留标签与 switch，不再有 desc 解释文字
  assert.doesNotMatch(popover, /execution-toggle__desc/, '弹层内不得有解释性 desc 文字')
  assert.doesNotMatch(popover, /使用更强推理|获取最新资料|自动执行（Agent 自主调用）/)
  assert.match(popover, /execution-toggle__switch/, '开关仍保留 toggle 控件')
})

test('输入区下方不再渲染执行摘要条（AC-P2-03 移除）', () => {
  assert.doesNotMatch(panel, /class="execution-summary"/, '执行摘要条不得存在')
  assert.doesNotMatch(panel, /executionSummaryTags/, '执行摘要 computed 不得存在')
  assert.doesNotMatch(panel, /参考素材无/, '摘要文案不得存在')
})

test('深度思考默认开启', () => {
  assert.match(panel, /const deepThinkEnabled = ref\(true\)/, 'deepThinkEnabled 默认必须为 true')
})
