/**
 * 媒体生成动效生命周期测试（回归：生成中动效保持到 task.completed 真正返回结果）。
 *
 * 缺陷：image-gen/video-gen 的 tool.completed 只表示「任务已提交到队列」，
 * 此前前端在该事件里删除 mediaGenerating，导致生成中动效提前消失、
 * agent 生成中的叙述文本堆进 content 一次性弹出（重复文案）。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/components/canvas/AIAssistantPanel.media-generation-lifecycle.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('handleToolEvent completed 不再删除生成中动效（tool.completed 只是任务已提交）', () => {
  const block = source.match(/function handleToolEvent\(message, event, opts = \{\}\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'handleToolEvent must exist')
  // 共享工具事件处理器内不得删除 mediaGenerating：删除只发生在 task.completed / 兜底 finalize
  assert.doesNotMatch(block, /delete message\.mediaGenerating/)
  // completed 分支仍通过 extractCodexGeneratedMediaResult 把真实结果交给 onGeneratedResult
  assert.match(block, /extractCodexGeneratedMediaResult\(event\.tool, event\.result\)/)
  assert.match(block, /if \(generated && opts\.onGeneratedResult\) opts\.onGeneratedResult\(generated\)/)
})

test('finalizeMediaGenerationState 是唯一的动效清理入口并支持恢复生成中缓冲文本', () => {
  const block = source.match(/function finalizeMediaGenerationState\(message, \{ restoreBuffer = false \} = \{\}\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'finalizeMediaGenerationState must exist')
  assert.match(block, /delete message\.mediaGenerating/)
  assert.match(block, /delete message\.mediaGeneratingCount/)
  assert.match(block, /message\.generationContentBuffer \|\| ''/)
  assert.match(block, /if \(restoreBuffer && buffered && !message\.content\)/)
})

test('生成中期间 agent 增量文本进 generationContentBuffer 不上屏（sendEnhancedMessage）', () => {
  const block = source.match(/onContent: \(text, isFinal\) => \{\s*const message = messages\.value\[assistantMessageIndex\][\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'sendEnhancedMessage onContent must exist')
  assert.match(block, /if \(message\.mediaGenerating\)/)
  assert.match(block, /message\.generationContentBuffer = \(message\.generationContentBuffer \|\| ''\) \+ text/)
  assert.match(block, /return/)
})

test('applyGeneratedResult 与 onDone 走 finalize 清理动效（增强模式）', () => {
  const applyBlock = source.match(/const applyGeneratedResult = \(result\) => \{\s*const message = messages\.value\[assistantMessageIndex\][\s\S]*?canvasWritebackSent = true/)?.[0]
  assert.ok(applyBlock, 'enhanced applyGeneratedResult must exist')
  assert.match(applyBlock, /finalizeMediaGenerationState\(message\)/)
  assert.match(applyBlock, /if \(!urls\.length\) return/)

  const doneBlock = source.match(/onDone: \(result\) => \{\s*flushContent\(\)\s*const message = messages\.value\[assistantMessageIndex\][\s\S]*?\n      \},/)?.[0]
  assert.ok(doneBlock, 'enhanced onDone must exist')
  assert.match(doneBlock, /finalizeMediaGenerationState\(message, \{ restoreBuffer: true \}\)/)
})

test('onTaskEvent task.completed 应用结果、task.failed 清理动效并显示错误', () => {
  const block = source.match(/onTaskEvent: \(event\) => \{[\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'onTaskEvent must exist')
  assert.match(block, /event\.type === 'task\.completed'[\s\S]*?applyGeneratedResult/)
  assert.match(block, /event\.type === 'task\.failed'[\s\S]*?finalizeMediaGenerationState/)
  assert.match(block, /媒体任务执行失败/)
})

test('普通模式 tool_completed 保留结果应用但不删除生成中动效', () => {
  const block = source.match(/onToolEvent: \(event\) => \{\s*const message = messages\.value\[assistantMessageIndex\]\s*if \(!message\) return[\s\S]*?throttledScrollToBottom\(\)\n      \},/)?.[0]
  assert.ok(block, 'normal mode onToolEvent must exist')
  assert.doesNotMatch(block, /tool_completed'\)[\s\S]*?delete message\.mediaGenerating/)
  assert.match(block, /if \(event\.result && !event\.result\?\.error && Array\.isArray\(event\.result\?\.result_urls\)\)/)
})

test('重连流 onContent 在生成中时也进缓冲，onDone 兜底 finalize', () => {
  const reconnectBlock = source.match(/function reconnectStream\(threadId\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(reconnectBlock, 'reconnectStream must exist')
  assert.match(reconnectBlock, /if \(last\.mediaGenerating\)/)
  assert.match(reconnectBlock, /last\.generationContentBuffer = \(last\.generationContentBuffer \|\| ''\) \+ text/)
  assert.match(reconnectBlock, /finalizeMediaGenerationState\(last, \{ restoreBuffer: true \}\)/)
})
