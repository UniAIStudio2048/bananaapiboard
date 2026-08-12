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
