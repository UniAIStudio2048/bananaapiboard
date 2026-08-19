import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8')

test('running requests use a square stop control', () => {
  assert.match(source, /class="send-btn"[\s\S]*:class="\{ 'send-btn--stop': isLoading \}"/)
  assert.match(source, /isLoading \? stopCurrentActivity\(\) : sendMessage\(\)/)
  assert.match(source, /function stopCurrentActivity\(/)
})

test('running send queues the follow-up instead of interrupting the active turn', () => {
  // 本地乐观排队条不单独渲染（队列显示收敛到 AgentQueueBar 合并队列条）
  assert.doesNotMatch(source, /class="queued-message-bar"/)
  // 本地乐观队列恢复：运行中普通发送 → queueCurrentDraft → send_mode=queue；
  // 排队判断以真实会话状态为准（activeTurnRunning / serverQueue / queued 降级），非仅 isLoading
  assert.match(source, /const queuedMessages = ref\(\[\]\)/)
  assert.match(source, /const turnBusy = enhancedMode\.value[\s\S]*?if \(turnBusy && !force\) \{\s*queueCurrentDraft\(\)\s*return\s*\}/)
  assert.match(source, /send_mode: 'queue'/)
  // Ctrl/Cmd+Enter 仍走强制发送路径（interrupt 接管）
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/)
})
