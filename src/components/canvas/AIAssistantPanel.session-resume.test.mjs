/**
 * AI 灵感助手「从历史进入进行中对话」回归测试（bugfix）。
 *
 * 根因之二：loadSession 从历史加载运行中会话时，若该回合还没落盘任何正文
 * （仅用户消息），messages 里没有 assistant 占位消息；reconnectStream 的
 * onContent/onToolEvent/onTaskEvent 都以 `find assistant` 为前提，找不到就 return，
 * 导致重连回放的正文/工具/媒体事件全部被丢弃——表现为“缺部分信息，只有完成后才显示”。
 *
 * 同时 loadSession 会把运行中回合的半截助手快照原样载入，再叠加事件回放，造成正文/工具卡重复。
 *
 * 期望：
 *  1. loadSession 对 running 会话，把运行中回合的半截 assistant 快照重置为空的流式占位，
 *     交给 reconnectStream 从事件流重建（避免重复、保证有占位可写）。
 *  2. reconnectStream 提供 onSnapshot，事件过期时用 DB 快照重建进度，而不是丢弃。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.session-resume.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')
const queueBar = await readFile(join(__dirname, 'AgentQueueBar.vue'), 'utf8')

test('loadSession running 分支：重置运行中回合的半截助手快照为流式占位', () => {
  const block = panel.match(/if \(turnStatus === 'running'\) \{[\s\S]*?reconnectStream\(session\.id\)/)?.[0]
  assert.ok(block, 'loadSession 的 running 分支必须存在')
  // 把最后一个 assistant 消息重置为空占位（content 清空、isStreaming/isThinking 复位）
  assert.match(block, /role:\s*'assistant'/, 'running 分支应构造 assistant 占位')
  assert.match(block, /content:\s*''/, '占位正文应清空，避免与事件回放叠加重复')
  assert.match(block, /isStreaming:\s*true/, '占位应处于流式状态')
  assert.match(block, /toolEvents:\s*\[\]/, '占位工具事件应清空，交给事件回放重建')
})

test('reconnectStream 提供 onSnapshot：事件过期时用 DB 快照重建进度', () => {
  const block = panel.match(/function reconnectStream\(threadId\) \{[\s\S]*?signal: reconnectController\.signal,/)?.[0]
  assert.ok(block, 'reconnectStream 必须存在')
  assert.match(block, /onSnapshot:\s*\(/, 'reconnectStream 必须处理 onSnapshot')
  assert.match(block, /snapshot\.partialContent/, 'onSnapshot 应读取快照正文')
  assert.match(block, /snapshot\.toolEvents/, 'onSnapshot 应读取快照工具事件')
})

test('loadSession 以会话详情同步运行态，停止的历史会话不继承上一会话的 loading/queue', () => {
  const block = panel.match(/async function loadSession\(session\) \{[\s\S]*?^}/m)?.[0]
  assert.ok(block, 'loadSession must exist')
  assert.match(block, /getCodexSession\(session\.id\)/, '应读取会话详情作为运行态真源')
  assert.match(block, /const active = sessionData\.active_turn/, '应使用服务端 active_turn')
  assert.match(block, /resetActiveTurn\(\)/, '切换历史会话时应清除旧 activeTurn')
  assert.match(block, /isLoading\.value = false/, '非运行会话应恢复直接发送')
  assert.match(block, /serverQueue\.value = queued\.map/, '历史队列应从服务端详情恢复')
})

test('停止后直发撞到锁释放窗口时，queued done 保留助手占位并让轮询重连同一 turn', () => {
  const block = panel.match(/onDone: \(result\) => \{[\s\S]*?maybeLatePullTaskResult\(assistantMessageIndex\)/)?.[0]
  assert.ok(block, 'sendEnhancedMessage onDone must exist')
  assert.match(block, /if \(result\?\.status === 'queued'\)/)
  assert.match(block, /message\.isThinking = true/)
  assert.match(block, /message\.isStreaming = true/)
  assert.match(block, /activeTurn\.value\.id = null/, '必须允许 refreshQueueAndFollow 对同一 turn_id 重连')
  assert.match(block, /refreshQueueAndFollow\(\)/)
})

test('「立即插入」按钮对可见排队项始终渲染：空闲时点击=直接发送，不再依赖 activeTurnRunning', () => {
  const insertButton = queueBar.match(/<button[\s\S]*?aria-label="立即插入这条消息"[\s\S]*?<\/button>/)?.[0]
  assert.ok(insertButton, 'insert button must exist')
  assert.doesNotMatch(insertButton, /v-if="activeTurnRunning"/)
})
