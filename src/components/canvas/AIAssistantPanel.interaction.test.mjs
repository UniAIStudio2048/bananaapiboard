/**
 * AIAssistantPanel 交互规则测试（reliability design 3 & 7.5）。
 * 断言：键盘规则、停止/排队/强制插入、服务端队列协议、activeTurn 状态对象。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.interaction.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('IME composition hides the custom placeholder before candidate text commits', () => {
  assert.match(source, /:class="\{ 'is-empty': !inputText && !selectedAssistantModel && !referencedSkill && !isInputComposing \}"/)
  assert.match(source, /const isInputComposing = ref\(false\)/)
  assert.match(source, /function handleInputCompositionStart\(\) \{[\s\S]*?isInputComposing\.value = true/)
  assert.match(source, /function handleInputCompositionEnd\(event\) \{[\s\S]*?isInputComposing\.value = false/)
})

test('keyboard: Shift+Enter only inserts a newline', () => {
  assert.match(source, /if \(event\.key === 'Enter' && event\.shiftKey\) \{\s*event\.preventDefault\(\)\s*insertInputEditorPlainText\('\\n'\)/)
})

test('keyboard: slash menu consumes Enter before sending', () => {
  const block = source.match(/if \(slashMenuVisible\.value\) \{[\s\S]*?\n  \}/)?.[0]
  assert.ok(block, 'slash menu keydown block must exist')
  assert.match(block, /event\.key === 'Enter' \|\| event\.key === 'Tab'/)
  assert.match(block, /event\.preventDefault\(\)/)
  assert.match(block, /selectSlashSkill\(skill\)/)
})

test('keyboard: running Enter queues the follow-up; running Ctrl/Meta+Enter forces immediate send', () => {
  const enterBlock = source.match(/if \(event\.key === 'Enter' && !event\.shiftKey\) \{[\s\S]*?\n  \}/)?.[0]
  assert.ok(enterBlock, 'Enter keydown block must exist')
  // IME 候选词确认的 Enter 不触发发送，避免一次输入重复发两条相同消息
  assert.match(enterBlock, /if \(event\.isComposing \|\| isInputComposing\.value\) return/)
  assert.match(enterBlock, /event\.preventDefault\(\)/)
  assert.match(enterBlock, /sendMessage\(Boolean\(event\.ctrlKey \|\| event\.metaKey\)\)/)
  // 运行中普通 Enter → 消息进入队列（send_mode=queue），当前任务继续运行、生成中卡片不受影响；
  // 排队判断以真实会话状态为准（activeTurnRunning / serverQueue / queued 降级），不是仅 isLoading
  const sendBlock = source.match(/const turnBusy = enhancedMode\.value[\s\S]*?if \(turnBusy && !force\) \{\s*queueCurrentDraft\(\)\s*return\s*\}/)?.[0]
  assert.ok(sendBlock, 'turnBusy queue guard must exist')
  assert.match(sendBlock, /activeTurnRunning\.value/)
  assert.match(sendBlock, /serverQueue\.value\.length > 0/)
})

test('interrupt: force send cancels the active turn and waits for terminal state', () => {
  assert.match(source, /async function sendEnhancedMessage\(force = false\)/)
  // 强制发送先取消当前回合并等待其进入终态（避免 Codex SDK thread-store conflict）
  assert.match(source, /cancelActiveTurnAndWait\(\)/)
  assert.match(source, /sendMode = 'interrupt'/)
  assert.match(source, /target_turn_id: targetTurnId \|\| undefined/)
  assert.match(source, /client_message_id: clientMessageId/)
})

test('queue: running send enqueues via send_mode=queue and syncs into server queue bar', () => {
  // 本地乐观排队 + 服务端 send_mode=queue：运行中普通发送不再中断旧回合
  assert.match(source, /async function enqueueServerMessage\(draft\)/)
  assert.match(source, /send_mode: 'queue'/)
  assert.match(source, /queueCurrentDraft\(\)/)
  assert.match(source, /function syncServerQueueItem\(draft, json\)/)
  // 服务端队列（持久化真源）仍可强制插入与删除
  assert.match(source, /AgentQueueBar/)
  assert.match(source, /async function forceInsertQueuedMessage\(queued\)/)
  assert.match(source, /function removeQueuedServerMessage\(queued\)/)
})

test('queue UI: single merged queue bar; no duplicated queued banner', () => {
  // 队列显示收敛到 AgentQueueBar 单一队列条：不再渲染独立的 queued-message-bar / queued-banner
  assert.doesNotMatch(source, /queued-message-bar/)
  assert.doesNotMatch(source, /queued-banner/)
  // 本地乐观排队项映射进队列条 items（queueItems 合并列表，已置顶项过滤隐藏）；queued-banner 删除后
  // queuedTurnContent 已无读取方，应一并清除（不留只写死变量）
  assert.match(source, /const queueItems = computed\(\(\) => filterVisibleQueueItems\(\[[\s\S]*?_local: true[\s\S]*?\], promotedQueueKeys\.value\)\)/)
  assert.doesNotMatch(source, /queuedTurnContent/)
})

test('accepted status bar sits at the bottom of the message list after the tool timeline', () => {
  const timelineIdx = source.indexOf('<AgentToolTimeline')
  const statusIdx = source.indexOf('<AgentTurnStatusBar')
  const queueIdx = source.indexOf('<AgentQueueBar')
  assert.ok(timelineIdx >= 0 && statusIdx >= 0 && queueIdx >= 0, 'timeline, status bar and queue bar must exist')
  assert.ok(timelineIdx < statusIdx, 'AgentTurnStatusBar must appear after AgentToolTimeline')
  assert.ok(statusIdx < queueIdx, 'AgentTurnStatusBar must appear before AgentQueueBar')
  // 运行中就显示在对话底部，不再要求「有排队才显示」
  const statusSnippet = source.slice(statusIdx, statusIdx + 280)
  assert.match(statusSnippet, /v-if="enhancedMode"/)
  assert.doesNotMatch(statusSnippet, /queuedTurn \|\| serverQueue/)
  // 停止仍走右下角发送键，状态行不再挂 stop
  assert.doesNotMatch(statusSnippet, /@stop="stopCurrentActivity"/)
  assert.match(source, /class="send-btn"\s*type="button"\s*:class="\{ 'send-btn--stop': isLoading \}"/)
  assert.match(source, /@click="isLoading \? stopCurrentActivity\(\) : sendMessage\(\)"/)
})

test('queue: force insert (running) promotes to next-after-current-round; idle branch deletes and sends directly', () => {
  // 「立即插入」= 本轮结束后立即发送：运行中不打断当前回合，置顶（priority=100）并
  // 立即在聊天区乐观展示消息对；只有空闲分支才删队列项直接发送。
  const forceInsertBlock = source.match(/async function forceInsertQueuedMessage\(queued\) \{[\s\S]*?^}/m)?.[0]
  assert.ok(forceInsertBlock, 'forceInsertQueuedMessage must exist')
  // 运行中分支：置顶 + 隐藏队列项 + 乐观推送消息对，绝不取消当前回合
  assert.match(forceInsertBlock, /promoteQueuedCodexMessage\(currentCodexThreadId\.value, queued\.turn_id\)/)
  assert.match(forceInsertBlock, /hidePromotedQueueItem\(queued\)/)
  assert.match(forceInsertBlock, /pushPromotedConversationMessages\(queued\)/)
  assert.doesNotMatch(forceInsertBlock, /只把排队项追加到当前对话/)
  assert.doesNotMatch(forceInsertBlock, /dismissed:\s*true/)
  // 空闲分支：删服务端队列项 → 恢复草稿 → 直接发送（不取消任何回合）
  const idleSrv = forceInsertBlock.slice(forceInsertBlock.lastIndexOf('if (enhancedMode.value && currentCodexThreadId.value) {'))
  const deleteIndex = idleSrv.indexOf('await deleteQueuedCodexMessage(currentCodexThreadId.value, queued.turn_id)')
  const sendIndex = idleSrv.indexOf('sendEnhancedMessage(true)')
  assert.ok(deleteIndex >= 0 && sendIndex >= 0 && deleteIndex < sendIndex, 'idle branch must delete the queued turn before direct send')
  assert.match(forceInsertBlock, /queuedMessages\.value = queuedMessages\.value\.filter\(\(s\) => s\.id !== queued\.id/)
  assert.match(forceInsertBlock, /restoreDraft\(queued\)/)
  assert.match(forceInsertBlock, /sendEnhancedMessage\(true\)/)
  // 取消防护仅保留给 Ctrl/Cmd+Enter 接管发送（sendEnhancedMessage force 分支），队列条插入不再走取消
  assert.match(source, /if \(force && activeTurn\.value\.id && currentCodexThreadId\.value\) \{[\s\S]*?cancelActiveTurnAndWait\(\)/)
  assert.match(source, /function removeQueuedServerMessage\(queued\)/)
})

test('queue follow must not inject a fake thinking message that freezes the thread', () => {
  const followBlock = source.match(/async function refreshQueueAndFollow\(\) \{[\s\S]*?^}/m)?.[0]
  assert.ok(followBlock, 'refreshQueueAndFollow must exist')
  assert.match(followBlock, /reconnectStream\(currentCodexThreadId\.value\)/)
  // 仍禁止注入伪造 assistant 消息；同步 activeTurn/isLoading 仅限「发现新的非本地驱动回合」，
  // 回合本身结束/队列清空时停表回读真源，不会锁死线程
  assert.doesNotMatch(followBlock, /role:\s*'assistant'/)
  assert.doesNotMatch(followBlock, /isThinking:\s*true/)
})

test('assistant header and input tags stay in-flow so they follow panel resize', () => {
  const header = source.match(/\.panel-header\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const tags = source.match(/\.input-context-tags\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const container = source.match(/\.ai-assistant-container\s*\{[\s\S]*?\n\}/)?.[0] || ''
  assert.match(container, /position:\s*fixed/)
  assert.doesNotMatch(header, /position:\s*fixed/)
  assert.doesNotMatch(tags, /position:\s*fixed/)
  assert.match(source, /emit\('width-change', newWidth\)/)
  assert.match(source, /emit\('width-change', panelWidth\.value\)/)
})

test('AgentTurnStatusBar uses the same monochrome inline style as the tool timeline', async () => {
  const bar = readFileSync(join(__dirname, 'AgentTurnStatusBar.vue'), 'utf8')
  assert.doesNotMatch(bar, /rgba\(6,\s*182,\s*212/)
  assert.doesNotMatch(bar, /agent-turn-status-bar__dot/)
  assert.doesNotMatch(bar, /agent-turn-status-bar__stop/)
  assert.match(bar, /ui-monospace, SFMono-Regular/)
  assert.match(bar, /var\(--canvas-text-primary\)/)
  assert.match(bar, /var\(--canvas-text-secondary\)/)
})

test('AgentQueueBar exposes an insert action for queued follow-ups', async () => {
  const bar = readFileSync(join(__dirname, 'AgentQueueBar.vue'), 'utf8')
  assert.match(bar, /item\.text \|\| item\.content/)
  assert.match(bar, /\$emit\('insert', item\)/)
  assert.match(bar, /立即插入|插入/)
  assert.doesNotMatch(bar, /item\.inserted/)
})

test('stop: stopCurrentActivity cancels the server turn and keeps fallback content', () => {
  assert.match(source, /cancelCodexTurn\(currentCodexThreadId\.value, activeTurn\.value\.id, \{ reason: 'user_stop' \}\)/)
  assert.match(source, /if \(!activeMessage\.content\) activeMessage\.content = '已停止当前对话或任务'/)
})

test('activeTurn state object carries server turn metadata', () => {
  const block = source.match(/const activeTurn = ref\(\{[\s\S]*?\n\}\)/)?.[0]
  assert.ok(block, 'activeTurn ref must exist')
  for (const field of ['id', 'threadId', 'clientMessageId', 'status', 'phase', 'tool', 'taskId', 'startedAt', 'lastEventAt', 'cancellable', 'cancelRequested', 'error']) {
    assert.match(block, new RegExp(`${field}:`), `activeTurn must carry ${field}`)
  }
})

test('new chat: startNewChat clears thread reference and queued banner', () => {
  const block = source.match(/function startNewChat\(\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'startNewChat must exist')
  // 新对话必须清空线程引用，否则第一条消息会续聊旧线程并误显示「排队中」
  assert.match(block, /currentCodexThreadId\.value = null/)
  assert.match(block, /queuedTurn\.value = false/)
  assert.match(block, /serverQueue\.value = \[\]/)
})

test('failure fallback: empty assistant content is replaced with readable error', () => {
  assert.match(source, /if \(!message\.content\) \{\s*message\.content = `抱歉，发生了错误: \$\{error\.message\}`/)
})

test('streaming callbacks tolerate a replaced message slot (no crash on reconnect)', () => {
  // 会话恢复/重连可能替换 messages.value，SSE 回调必须对缺失消息槽做空值保护，
  // 否则 onContent/onDone/onError 会抛 TypeError（reliability §12.1）。
  assert.match(source, /onContent: \(text, isFinal\) => \{\s*const message = messages\.value\[assistantMessageIndex\]\s*if \(!message\) return/)
  assert.match(source, /onDone: \(result\) => \{\s*flushContent\(\)\s*const message = messages\.value\[assistantMessageIndex\]\s*if \(message\) \{/)
  assert.match(source, /onError: \(error\) => \{\s*if \(requestController\.signal\.aborted \|\| stopRequested\.value\) return\s*flushContent\(\)\s*const message = messages\.value\[assistantMessageIndex\]\s*if \(!message\) return/)
  assert.match(source, /if \(pendingContent\) \{\s*const message = messages\.value\[assistantMessageIndex\]\s*if \(message\) message\.content = pendingContent/)
})
