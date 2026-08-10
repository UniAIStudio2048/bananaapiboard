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

test('keyboard: running Enter queues; running Ctrl/Meta+Enter forces send', () => {
  const enterBlock = source.match(/if \(event\.key === 'Enter' && !event\.shiftKey\) \{[\s\S]*?\n  \}/)?.[0]
  assert.ok(enterBlock, 'Enter keydown block must exist')
  // IME 候选词确认的 Enter 不触发发送，避免一次输入重复发两条相同消息
  assert.match(enterBlock, /if \(event\.isComposing \|\| isInputComposing\) return/)
  assert.match(enterBlock, /event\.preventDefault\(\)/)
  assert.match(enterBlock, /sendMessage\(Boolean\(event\.ctrlKey \|\| event\.metaKey\)\)/)
  // 运行中普通 Enter → 只排队
  assert.match(source, /if \(isLoading\.value && !force\) \{\s*queueCurrentDraft\(\)\s*return\s*\}/)
  // 增强模式转发 force（Ctrl+Enter → interrupt）
  assert.match(source, /if \(enhancedMode\.value\) \{\s*return sendEnhancedMessage\(force\)/)
})

test('interrupt: force send cancels the active turn then sends with send_mode=interrupt', () => {
  assert.match(source, /async function sendEnhancedMessage\(force = false\)/)
  assert.match(source, /cancelCodexTurn\(currentCodexThreadId\.value, activeTurn\.value\.id, \{ reason: 'force_insert' \}\)/)
  assert.match(source, /sendMode = 'interrupt'/)
  assert.match(source, /targetTurnId = activeTurn\.value\.id/)
  assert.match(source, /target_turn_id: targetTurnId \|\| undefined/)
  assert.match(source, /client_message_id: clientMessageId/)
})

test('queue: running messages enqueue server-side with send_mode=queue and server metadata', () => {
  assert.match(source, /send_mode: 'queue'/)
  assert.match(source, /enqueueServerMessage\(draft\)/)
  assert.match(source, /syncServerQueueItem\(draft, json\)/)
  assert.match(source, /queue_position: json\.queue_position \|\| null/)
  assert.match(source, /serverQueue\.value\.push\(item\)/)
  assert.match(source, /AgentQueueBar/)
})

test('queue banner: 真正排队时显示用户输入的内容而不是笼统文案', () => {
  assert.match(source, /const queuedTurnContent = ref\(/ )
  assert.match(source, /queuedTurnContent\.value = messageText/)
  assert.match(source, /<div v-if="queuedTurn" class="queued-banner"[^>]*>[\s\S]*?<span class="queued-banner__label">排队中，等待上一轮完成…<\/span>[\s\S]*?<span v-if="queuedTurnContent" class="queued-banner__preview">/)
  assert.match(source, /queuedTurnContent\.value = ''/)
})

test('single round: turn status bar hidden, send button doubles as stop button', () => {
  // 单轮对话不显示回合状态条（已接受/正在思考…），仅右下角发送键切换为停止
  assert.match(source, /<AgentTurnStatusBar\s*v-if="enhancedMode && \(queuedTurn \|\| serverQueue\.length > 0 \|\| queuedMessages\.length > 0\)"/)
  assert.match(source, /class="send-btn"\s*type="button"\s*:class="\{ 'send-btn--stop': isLoading \}"/)
  assert.match(source, /@click="isLoading \? stopCurrentActivity\(\) : sendMessage\(\)"/)
})

test('queue: force insert and delete call the server queue APIs', () => {
  assert.match(source, /cancelCodexTurn\(currentCodexThreadId\.value, targetTurnId, \{ reason: 'force_insert' \}\)/)
  assert.match(source, /deleteQueuedCodexMessage\(currentCodexThreadId\.value, turnId\)/)
  assert.match(source, /function removeQueuedServerMessage\(queued\)/)
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
