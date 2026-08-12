/**
 * 执行摘要（AC-P2-03）测试：发送前展示 Skill / 参考素材 / 模型 / 预计积分 /
 * 写回目标；默认输入区不拥挤（高级项收敛到执行设置）。
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

test('执行摘要包含 Skill / 参考素材 / 模型 / 预计积分 / 完成后（AC-P2-03）', () => {
  const summary = panel.match(/<!-- 执行摘要（AC-P2-03）[\s\S]*?<\/div>\n        <\/div>\n      <\/div>\n    <\/div>\n  <\/Transition>/)?.[0]
  assert.ok(summary, 'execution summary block must exist')
  assert.match(summary, /executionSummaryTags\.length > 0/)
  assert.match(summary, /execution-summary__tag/)
  // 摘要标签由 executionSummaryTags computed 生成（模板内只渲染 tag，文案在 computed）
  const computed = panel.match(/const executionSummaryTags = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0]
  assert.ok(computed, 'executionSummaryTags computed must exist')
  assert.match(computed, /本次使用/)
  assert.match(computed, /参考素材/)
  assert.match(computed, /预计积分/)
  assert.match(computed, /完成后/)
  assert.match(computed, /写回当前画布/)
  assert.match(computed, /仅返回对话/)
})

test('摘要计算逻辑存在（executionSummaryTags）', () => {
  assert.match(panel, /const executionSummaryTags = computed\(/)
  assert.match(panel, /tags\.push\(\{ label: '本次使用'/)
  assert.match(panel, /tags\.push\(\{ label: '预计积分'/)
})
