/**
 * 停止状态机（AC-P1-02）测试：点击停止先显示「正在停止」；收到 turn.cancelled
 * 后才显示「已停止」；取消 API 失败时不清空真实运行态；媒体任务继续显示。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.stop-state.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('停止先进入 stopping（正在停止），不立即显示 cancelled', () => {
  const block = panel.match(/function stopCurrentActivity\(\)[\s\S]*?\n}/)?.[0]
  assert.ok(block, 'stopCurrentActivity must exist')
  assert.match(block, /activeTurn\.value\.status = 'stopping'/)
  assert.match(block, /activeTurn\.value\.phase = 'stopping'/)
  assert.match(block, /activeTurn\.value\.cancellable = false/)
})

test('取消失败恢复 running 并显示可重试错误（AC-P1-02）', () => {
  const block = panel.match(/function stopCurrentActivity\(\)[\s\S]*?\n}/)?.[0]
  assert.ok(block)
  assert.match(block, /activeTurn\.value\.status = 'running'/)
  assert.match(block, /showAlert\(`停止失败/)
})

test('停止不清空取消确认所需的观察流（不 abort reconnectController）', () => {
  const block = panel.match(/function stopCurrentActivity\(\)[\s\S]*?\n}/)?.[0]
  assert.ok(block)
  assert.doesNotMatch(block, /reconnectController\.abort\(\)/, 'stop 不得 abort 用于观察 turn.cancelled 的重连流')
  assert.match(block, /normalStreamController\?\.abort\(\)/)
  assert.match(block, /agentStreamController\?\.abort\(\)/)
})

test('状态条：cancelled 显示「已停止」而非失败，cancelRequested 显示「正在停止」', async () => {
  const { readFile: read } = await import('node:fs/promises')
  const bar = await read(new URL('./AgentTurnStatusBar.vue', import.meta.url), 'utf8')
  assert.match(bar, /cancelled: '已停止'/)
  assert.match(bar, /正在停止/)
  assert.doesNotMatch(bar, /cancelled: '失败'/)
  // cancelled 状态类不触发错误样式
  assert.match(bar, /status === 'cancelled'\) return 'cancelled'/)
})

test('取消失败不清空队列/运行态（可重试）', () => {
  // 取消 API 失败仅记录 warn，不清空 serverQueue
  assert.match(panel, /cancelCodexTurn\(currentCodexThreadId\.value, activeTurn\.value\.id, \{ reason: 'user_stop' \}\)\.catch/)
})
