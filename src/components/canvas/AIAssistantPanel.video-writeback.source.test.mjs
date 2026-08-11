/**
 * 视频任务结果写回对话的回归测试（source-level）。
 * 背景：生图/生视频历史记录正常返回，但对话中视频任务完成后仍显示「执行中」。
 * 根因：
 *   1. turn.failed 时前端 onError 不做任务追尾补拉，task.completed 无法写回消息；
 *   2. TaskProgressBridge 的 task.completed 缺 media_type，视频被当成 image 渲染；
 *   3. 服务端 autoSubmitVideoTask 兜底提交时前端收不到 video-gen tool 事件，兜底失效。
 * 断言：onError 含追尾补拉；媒体类型按扩展名兜底为 video；补拉成功后清理「执行中」状态卡。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.video-writeback.source.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panel = await readFile(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('turn.failed 时 onError 发起任务追尾补拉，避免对话永远显示执行中', () => {
  const block = panel.match(/onError: \(error\) => \{[\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'enhanced onError block must exist')
  assert.match(block, /maybeLatePullTaskResult\(assistantMessageIndex\)/, 'onError must trigger late pull like onDone')
})

test('追尾补拉逻辑可被 onDone 与 onError 复用（maybeLatePullTaskResult 存在）', () => {
  const block = panel.match(/function maybeLatePullTaskResult\(assistantMessageIndex\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'maybeLatePullTaskResult must exist')
  assert.match(block, /subscribeCodexStream\(currentCodexThreadId\.value/)
  assert.match(block, /event\.type === 'task\.completed'/)
  assert.match(block, /applyAgentResultToMessage\(assistantMessageIndex, \{/)
})

test('媒体类型统一兜底：视频 URL 扩展名（.mp4/.webm/.mov）识别为 video，不再默认 image', () => {
  const block = panel.match(/function resolveMediaType\(event\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'resolveMediaType must exist')
  assert.match(block, /\\\.\(mp4\|webm\|mov\)/, 'video url extension check must exist')
  assert.match(block, /return 'video'/)
  assert.match(block, /return 'image'/)
})

test('主流程 task.completed 使用 resolveMediaType，覆盖服务端兜底提交（无 tool 事件）场景', () => {
  const block = panel.match(/onTaskEvent: \(event\) => \{[\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'onTaskEvent block must exist')
  assert.match(block, /media_type: resolveMediaType\(event\)/)
  assert.doesNotMatch(block, /media_type: event\.media_type \|\| \(activeTurn\.value\.tool/)
})

test('重连流 task.completed 不再默认 image，视频结果正确写回', () => {
  const block = panel.match(/onTaskEvent: \(event\) => \{[\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'reconnect onTaskEvent block must exist')
  assert.match(block, /media_type: resolveMediaType\(event\)/)
})

test('追尾补拉成功后清理「执行中」状态卡（AgentToolTimeline 不残留 running）', () => {
  const block = panel.match(/function clearPendingToolStatusCards\(\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'clearPendingToolStatusCards must exist')
  assert.match(block, /status !== 'running' && t\.status !== 'waiting'/)
  assert.match(panel, /clearPendingToolStatusCards\(\)\s*$[\s\S]*?lateTaskController\?\.abort\(\)/m, 'late pull must clear pending cards')
})

test('任务状态事件带出的画幅比例写入生成中消息（videoGeneratingRatio），不再固定 16:9', () => {
  const block = panel.match(/function enterMediaGeneratingState\(message, generatingType, messageText = '', aspectRatio = null\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'enterMediaGeneratingState must accept aspectRatio')
  assert.match(block, /if \(aspectRatio && !message\.mediaGeneratingRatio\) \{[\s\S]*?message\.mediaGeneratingRatio = aspectRatio/)
  // 主流程与重连流的 task.started/progress 都透传 event.aspect_ratio
  assert.match(panel, /enterMediaGeneratingState\([\s\S]*?messageText,\s*event\.aspect_ratio[\s\S]*?\)/)
  assert.match(panel, /enterMediaGeneratingState\(last, getAssistantMediaGeneratingType\([\s\S]*?event\.aspect_ratio\)/)
})
