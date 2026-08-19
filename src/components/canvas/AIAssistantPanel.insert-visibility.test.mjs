/**
 * 「立即插入」可见性测试（2026-08-20 II）：
 * 点击「立即插入」后，消息内容必须立即进入聊天区显示（用户气泡 + 助手思考占位），
 * 并从队列条隐藏——不能出现「内容从队列条消失、等上一轮结束才在聊天区出现」的
 * 空窗，让用户误以为立即发送的内容丢了。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.insert-visibility.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')
const queueBar = await readFile(join(__dirname, 'AgentQueueBar.vue'), 'utf8')

test('forceInsertQueuedMessage 回合运行中分支：置顶后立即把消息对推入聊天区并从队列条隐藏', () => {
  const block = panel.match(/async function forceInsertQueuedMessage\(queued\)[\s\S]*?\n\}\n\n\/\/ 删除队列中未 dispatch 的消息/)?.[0]
  assert.ok(block, 'forceInsertQueuedMessage block must exist')
  // 置顶走 PATCH 优先级接口，不打断当前回合
  assert.match(block, /promoteQueuedCodexMessage\(currentCodexThreadId\.value, queued\.turn_id\)/)
  // 置顶成功后：乐观推送用户气泡 + 助手思考占位（内容立即可见，回复等本轮结束流入占位）
  assert.match(block, /pushPromotedConversationMessages\(queued\)/)
  const helper = panel.match(/function pushPromotedConversationMessages\(queued\)[\s\S]*?\n\}/)?.[0]
  assert.ok(helper, 'pushPromotedConversationMessages helper must exist')
  assert.match(helper, /role: 'user'/)
  assert.match(helper, /content: queued\.text/)
  assert.match(helper, /role: 'assistant'/)
  assert.match(helper, /isThinking: true/)
  assert.match(helper, /isStreaming: true/)
  // 占位带上置顶回合的 turn_id：重连流与历史回填据此定位
  assert.match(helper, /turn_id: queued\.turn_id/)
  // 隐藏键记录（turn_id / client_message_id），队列条据此过滤
  assert.match(block, /hidePromotedQueueItem\(queued\)/)
})

test('queueItems 过滤已进入聊天区的置顶项（服务端在认领前仍会返回该 queued turn）', () => {
  const block = panel.match(/const queueItems = computed\([\s\S]*?\]\, promotedQueueKeys\.value\)\)/)?.[0]
  assert.ok(block, 'queueItems computed must exist')
  assert.match(block, /filterVisibleQueueItems/)
  assert.match(block, /promotedQueueKeys/)
})

test('loadSessionMessages 按_turn_id 回填仍流式的助手占位（错过实时流的置顶回复不丢、不重复）', () => {
  const block = panel.match(/async function loadSessionMessages\(\)[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'loadSessionMessages block must exist')
  // 存在本地流式占位时，历史里的同 turn_id assistant 条目回填占位而非跳过/追加
  assert.match(block, /streamingPlaceholderByTurnId/)
  assert.match(block, /fillStreamingPlaceholder/)
})

test('stopCurrentActivity 收尾已删除置顶回合的占位气泡（不留永久思考中）', () => {
  const block = panel.match(/function stopCurrentActivity\(\)[\s\S]*?\n\}\n\nfunction selectSkillExecutionMode/)?.[0]
  assert.ok(block, 'stopCurrentActivity block must exist')
  assert.match(block, /finalizeDeletedTurnPlaceholders/)
})

test('AgentQueueBar 不再显示「本轮后立即发送」等待标签；插入按钮对可见排队项始终渲染', () => {
  assert.doesNotMatch(queueBar, /本轮后立即发送/)
  const insertButton = queueBar.match(/<button[\s\S]*?aria-label="立即插入这条消息"[\s\S]*?<\/button>/)?.[0]
  assert.ok(insertButton, 'insert button must exist')
  assert.doesNotMatch(insertButton, /v-if="!item\.priority"/)
})
