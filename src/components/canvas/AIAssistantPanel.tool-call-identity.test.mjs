/**
 * 工具调用身份（AC-P1-03）—— 面板工具卡以 tool_call_id 为主键。
 *
 * 同一回合两次参数相同的 image-gen 显示两张独立卡；completed 只能更新
 * 同 ID 卡片；禁止按 tool 名去重或"寻找最后一张 running 卡"。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.tool-call-identity.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('工具卡以 tool_call_id 为主键，非 tool 名', () => {
  // started 分支：有 tool_call_id 时按 ID 查找复用，无则创建独立卡
  assert.match(panel, /const toolCallId = event\.tool_call_id \|\| null/)
  assert.match(panel, /card = message\.toolEvents\.find\(\(item\) => item\.tool_call_id === toolCallId\)/)
  // 卡片 id 优先使用 tool_call_id
  assert.match(panel, /id: toolCallId \|\| `\$\{toolName\}-\$\{message\.toolEvents\.length\}-\$\{Date\.now\(\)\}`/)
  // completed 分支：同样按 tool_call_id 查找，只有同 ID 卡被更新
  const completedBlock = panel.match(/else if \(event\.type === 'completed' \|\| event\.type === 'failed' \|\| event\.type === 'progress' \|\| event\.type === 'retrying'\)[\s\S]*?card\.status = event\.type === 'failed' \? 'error' :/)?.[0]
  assert.ok(completedBlock, 'completed block must exist')
  assert.match(completedBlock, /card = message\.toolEvents\.find\(\(item\) => item\.tool_call_id === toolCallId\)/)
})

test('禁止按 tool 名去重（两次同类调用是两张独立卡）', () => {
  const startedBlock = panel.match(/if \(event\.type === 'started'\)[\s\S]*?message\.isStreaming = true/)?.[0]
  assert.ok(startedBlock, 'started block must exist')
  // 不得以 tool 名作为查找键去重（只允许 findIndex by tool 的兜底逻辑不在 started 分支）
  assert.doesNotMatch(startedBlock, /findIndex\(\(t\) => t\.tool === event\.tool\)/)
  // started 分支内按 tool_call_id 创建/复用
  assert.match(startedBlock, /item\.tool_call_id === toolCallId/)
})

test('completed 无 tool_call_id 时才有兼容兜底（不得作为主路径）', () => {
  // 主路径按 tool_call_id；无 ID（旧协议）才退化为最后一张 running 卡
  assert.match(panel, /completed 无 tool_call_id（旧协议）：退化为最后一张 running 卡（兼容）/)
  assert.match(panel, /\[\.\.\.message\.toolEvents\]\.reverse\(\)\.find\(item => item\.status === 'running'\)/)
})
