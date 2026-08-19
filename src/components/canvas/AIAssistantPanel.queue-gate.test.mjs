/**
 * 排队守卫测试（第一轮结束后插入消息不应误入排队区）：
 * - sendMessage 的排队判断必须基于真实回合状态（activeTurnRunning / serverQueue /
 *   activeTurn.status==='queued'），而不是仅依赖全局 isLoading——否则「第一轮已结束、
 *   没有排队项」时新消息也会被放进排队区等待（direct 发送被服务端降级 queued）。
 * - 排队条（AgentQueueBar）的「立即插入」必须始终可用：只要存在排队项，用户就能
 *   点击插入强行把该消息送入 LLM，不能因为当前回合不在 running 就隐藏按钮。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.queue-gate.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')
const queueBar = await readFile(join(__dirname, 'AgentQueueBar.vue'), 'utf8')

test('sendMessage 排队守卫基于真实回合状态，而非仅 isLoading（第一轮结束后直接发送）', () => {
  const block = panel.match(/async function sendMessage\(force = false\)[\s\S]*?\n\}\n\n(?:async )?function /)?.[0]
  assert.ok(block, 'sendMessage block must exist')
  // 增强模式：只有 activeTurn 在运行 / 服务端仍有排队 / 刚被服务端降级 queued 时才进排队区
  assert.match(block, /activeTurnRunning\.value/)
  assert.match(block, /serverQueue\.value\.length\s*>\s*0/)
  // 不允许再出现「仅凭 isLoading 就排队」的单独分支（普通发送在该分支直接发送）
  assert.doesNotMatch(block, /if\s*\(\s*isLoading\.value\s*&&\s*!force\s*\)/)
})

test('排队条「立即插入」按钮在存在排队项时始终可点击（不依赖当前回合是否 running）', () => {
  const insertButton = queueBar.match(/<button[\s\S]*?aria-label="立即插入这条消息"[\s\S]*?<\/button>/)?.[0]
  assert.ok(insertButton, 'insert button must exist in AgentQueueBar')
  // 不能用 activeTurnRunning 做 v-if：第一轮结束后 activeTurn 非 running，
  // 排队项仍应提供「立即插入」，否则用户无法强制插入
  assert.doesNotMatch(insertButton, /v-if="activeTurnRunning"/)
})

test('forceInsertQueuedMessage 直接调用 sendEnhancedMessage，不依赖 nextTick 链（防止渲染队列异常时消息被静默丢弃）', () => {
  const block = panel.match(/async function forceInsertQueuedMessage\(queued\)[\s\S]*?\n\}\n\n(?:async )?function /)?.[0]
  assert.ok(block, 'forceInsertQueuedMessage block must exist')
  // 两个分支（本地乐观项 / 服务端队列项）都必须直接发起强插发送
  const directCalls = block.match(/sendEnhancedMessage\(true\)/g) || []
  assert.ok(directCalls.length >= 2, 'both force-insert branches must call sendEnhancedMessage(true) directly')
  // nextTick 依赖 rejected 的 Vue 渲染 promise 时会跳过回调 → 消息丢失；禁止再依赖它发送
  assert.doesNotMatch(block, /nextTick\(\(\)\s*=>\s*sendEnhancedMessage\(true\)\)/)
})

test('restoreDraft 同步重建输入框，避免 contenteditable 片段在空锚点 mount 时 insertBefore 崩溃', () => {
  const block = panel.match(/function restoreDraft\(draft\)[\s\S]*?\n\}\n/)?.[0]
  assert.ok(block, 'restoreDraft block must exist')
  // renderKey 变更必须与草稿字段赋值在同一渲染周期（同步执行），而不是放在 nextTick 里，
  // 否则 Vue 会在旧输入框 DOM 上对 contenteditable 子片段执行 patch（空锚点被浏览器移除时
  // insertBefore 抛 NotFoundError），渲染队列 promise 变 rejected，后续 nextTick 发送全部失效
  assert.match(block, /inputEditorRenderKey\.value\s*\+=?\s*1[\s\S]*?nextTick\(\(\)\s*=>\s*autoResize\(\)\)/)
  assert.doesNotMatch(block, /nextTick\(\(\)\s*=>\s*\{\s*inputEditorRenderKey\.value\s*\+=?\s*1/)
})
