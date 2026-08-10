/**
 * 任务提示（AgentToolTimeline）展示规则测试。
 * 断言：提示跟随对话最后一行；同一工具去重；多个任务只显示最后一个。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.tool-timeline.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')
const timeline = await readFile(join(__dirname, 'AgentToolTimeline.vue'), 'utf8')

test('任务提示渲染在对话消息列表末尾，而不是固定在输入框上方', () => {
  // 时间线位于 messages-area 内、消息列表之后
  assert.match(panel, /v-for="\(msg, index\) in messages"[\s\S]*?<AgentToolTimeline v-if="enhancedMode" :tools="activeToolEvents" \/>[\s\S]*?\n        <\/div>/)
  // 输入框上方（queued-banner 与 input-area 之间）不得再出现时间线
  const footer = panel.match(/<div v-if="queuedTurn" class="queued-banner"[^>]*>[\s\S]*?<!-- 输入区域 -->/)?.[0]
  assert.ok(footer, 'footer block must exist')
  assert.doesNotMatch(footer, /AgentToolTimeline/)
})

test('任务状态无边框无圆点，黑白灰 + 执行中文字流光（IDE Codex 风格）', () => {
  // 不再渲染彩色圆点
  assert.doesNotMatch(timeline, /agent-tool-timeline__dot/)
  // 状态行无外边框/卡片背景
  const itemStyle = timeline.match(/\.agent-tool-timeline__item \{[\s\S]*?\n\}/)?.[0]
  assert.ok(itemStyle, 'item style must exist')
  assert.doesNotMatch(itemStyle, /border/)
  assert.doesNotMatch(itemStyle, /background/)
  assert.doesNotMatch(itemStyle, /border-radius/)
  // 等宽文字 + 灰阶变量
  assert.match(timeline, /ui-monospace, SFMono-Regular/)
  assert.match(timeline, /var\(--canvas-text-primary\)/)
  assert.match(timeline, /var\(--canvas-text-secondary\)/)
  // 执行中/等待结果：文字流光扫过
  assert.match(timeline, /agent-tool-text-shimmer/)
  assert.match(timeline, /background-clip: text/)
  assert.match(timeline, /--running \.agent-tool-timeline__name,/)
})

test('多个任务只显示最后一个：AgentToolTimeline 只渲染 tools 最后一项', () => {
  assert.match(timeline, /const latestTools = computed\(\(\) => \{[\s\S]*?return active\.length \? \[active\[active\.length - 1\]\] : \[\]/)
  assert.match(timeline, /v-if="latestTools\.length"/)
  assert.match(timeline, /v-for="tool in latestTools"/)
})

test('任务完成后状态行自动消失（completed/cancelled 不再渲染）', () => {
  assert.match(timeline, /tools\.filter\(\(t\) => t\.status !== 'completed' && t\.status !== 'cancelled'\)/)
})

test('增强模式 onToolEvent 按 tool 名去重，最新事件移到末尾', () => {
  const block = panel.match(/onToolEvent: \(event\) => \{\s*const message = messages\.value\[assistantMessageIndex\]\s*handleToolEvent\(message, event, \{[\s\S]*?throttledScrollToBottom\(\)\n      \},/)?.[0]
  assert.ok(block, 'enhanced onToolEvent must exist')
  // 去重不再要求「非 completed」，避免重复投递（主流 + 重连流）生成两张相同工具卡
  assert.match(block, /findIndex\(\(t\) => t\.tool === event\.tool\)/)
  assert.match(block, /if \(existing >= 0\) activeToolEvents\.value\.splice\(existing, 1\)/)
  assert.match(block, /activeToolEvents\.value\.push\(card\)/)
})

test('onSnapshot 重建任务提示时按 tool 名去重（同 tool 只保留最后一条）', () => {
  assert.match(panel, /seen\.set\(t\.tool, \{/)
  assert.match(panel, /activeToolEvents\.value = \[\.\.\.seen\.values\(\)\]/)
})

test('handleToolEvent 对同一工具重复 started 复用运行中卡片', () => {
  const block = panel.match(/function handleToolEvent\(message, event, opts = \{\}\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'handleToolEvent must exist')
  assert.match(block, /item\.name === toolName && item\.status === 'running'/)
  assert.match(block, /if \(runningCard\) \{[\s\S]*?runningCard\.detail = ''/)
})

test('loadSessionMessages 按 turn_id 去重，防止媒体回合被轮询追加第二条带图消息', () => {
  const block = panel.match(/async function loadSessionMessages\(\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'loadSessionMessages must exist')
  assert.match(block, /const existingTurnIds = new Set\(messages\.value\.map\(\(m\) => m\.turn_id\)\.filter\(Boolean\)\)/)
  assert.match(block, /if \(m\.turn_id && existingTurnIds\.has\(m\.turn_id\)\) continue/)
})

test('onAccepted 把 turn_id 写入实时助手消息，供轮询去重', () => {
  const block = panel.match(/onAccepted: \(json\) => \{[\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'onAccepted must exist')
  assert.match(block, /messages\.value\[assistantMessageIndex\]\.turn_id = json\.turn_id/)
})
