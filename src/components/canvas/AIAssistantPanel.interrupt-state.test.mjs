/**
 * 强插状态（AC-P0-04 / AC-P1-02）测试：interrupt 等待旧回合停止时保留草稿并
 * 显示「等待上一轮停止」；收到 interrupt_waiting_for_cancel 后不直发。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.interrupt-state.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('interrupt 分支先取消旧回合再以 interrupt 模式发送（target_turn_id）', () => {
  const block = panel.match(/强制插入（Ctrl\/Cmd\+Enter）[\s\S]*?sendMode = 'interrupt'[\s\S]*?targetTurnId = activeTurn\.value\.id[\s\S]*?cancelCodexTurn\(currentCodexThreadId\.value, activeTurn\.value\.id, \{ reason: 'force_insert' \}\)/)?.[0]
  assert.ok(block, 'interrupt send branch must exist')
  assert.match(block, /cancelCodexTurn\(currentCodexThreadId\.value, activeTurn\.value\.id, \{ reason: 'force_insert' \}\)/)
})

test('interrupt_waiting_for_cancel：保留草稿并显示等待，不直发新回合', () => {
  const catchBlock = panel.match(/interrupt_waiting_for_cancel[\s\S]*?sendEnhancedMessage\(force\)\n      \}, 1000\)/)?.[0]
  assert.ok(catchBlock, 'interrupt_waiting_for_cancel handling must exist')
  assert.match(catchBlock, /正在等待上一轮 AI 回复停止，请稍候/)
  assert.match(catchBlock, /inputText\.value = messageText/)
  assert.match(catchBlock, /sendEnhancedMessage\(force\)/)
})
