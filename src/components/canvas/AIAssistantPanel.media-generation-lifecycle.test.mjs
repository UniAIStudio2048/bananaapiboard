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

test('多图生成：applyAgentResultToMessage 按 URL 合并累积，不整体覆盖上一张', () => {
  const block = source.match(/function applyAgentResultToMessage\(index, result\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'applyAgentResultToMessage must exist')
  // 按 URL 去重追加，编号按累积顺序递增
  assert.match(block, /const existing = Array\.isArray\(messages\.value\[index\]\.attachments\) \? messages\.value\[index\]\.attachments : \[\]/)
  assert.match(block, /seen\.has\(url\)\) continue/)
  assert.match(block, /existing\.push\(/)
  assert.match(block, /messages\.value\[index\]\.attachments = existing/)
  // 计数文案按累积数量生成（8 张全部返回后显示"已生成 8 张图片"）
  assert.match(block, /已生成 \$\{imageCount\} 张图片/)
})

test('多图生成：applyGeneratedResult 每张完成时占位递减，全部完成才清除生成中状态', () => {
  const block = source.match(/const applyGeneratedResult = \(result\) => \{\s*const message = messages\.value\[assistantMessageIndex\][\s\S]*?canvasWritebackSent = true/)?.[0]
  assert.ok(block, 'enhanced applyGeneratedResult must exist')
  assert.match(block, /countMediaByType\(message, mediaType\)/)
  assert.match(block, /message\.mediaGeneratingCount = Math\.max\(0, \(message\.mediaGeneratingCount \|\| 1\) - added\)/)
  assert.match(block, /if \(message\.mediaGeneratingCount <= 0\) finalizeMediaGenerationState\(message\)/)
  // 单张/最后一张才整体 finalize，多张在途时保留生成中占位
  assert.match(block, /} else \{\s*finalizeMediaGenerationState\(message\)\s*\}/)
})

test('enterMediaGeneratingState 幂等：已在生成中时保留首次解析的多图计数', () => {
  const block = source.match(/function enterMediaGeneratingState\(message, generatingType, messageText = '', aspectRatio = null\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'enterMediaGeneratingState must exist')
  // 多图拆分多次 image-gen 的 tool.started 不再重置占位计数
  assert.match(block, /if \(!message\.mediaGenerating\) \{/)
  assert.match(block, /message\.mediaGeneratingCount = getRequestedMediaCount\(messageText, generatingType\)/)
})

test('多图生成：按提交顺序记录 task_id（task.started），结果按此顺序排列显示', () => {
  const block = source.match(/onTaskEvent: \(event\) => \{\s*const message = messages\.value\[assistantMessageIndex\][\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'onTaskEvent must exist')
  // task.started 按任务提交顺序到达，把 task_id 追加进 mediaSubmissionOrder（去重）
  assert.match(block, /if \(!Array\.isArray\(message\.mediaSubmissionOrder\)\) message\.mediaSubmissionOrder = \[\]/)
  assert.match(block, /if \(!message\.mediaSubmissionOrder\.includes\(event\.task_id\)\) message\.mediaSubmissionOrder\.push\(event\.task_id\)/)
  // 重连流同样记录，保证重连回放后顺序一致
  const reconnectBlock = source.match(/function reconnectStream\(threadId\) \{[\s\S]*?\n\}/)?.[0]
  assert.match(reconnectBlock, /last\.mediaSubmissionOrder\.push\(event\.task_id\)/)
})

test('applyAgentResultToMessage 按提交顺序排序，后提交先完成不会排到前面', () => {
  const block = source.match(/function applyAgentResultToMessage\(index, result\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'applyAgentResultToMessage must exist')
  // attachment 记录 task_id，结果按 mediaSubmissionOrder 中的提交次序排序
  assert.match(block, /newItems\.push\(\{ type: mediaType, url, task_id: taskId \}\)/)
  assert.match(block, /existing\.sort\(\(a, b\) => orderIndex\(a\) - orderIndex\(b\)\)/)
  assert.match(block, /order\.includes\(a\.task_id\)/)
})

test('多图生成：mediaGeneratingTotal 记录恒定总占位格数，与递减计数分离', () => {
  // 缺陷：mediaGeneratingCount 同时承担「占位格总数」与「剩余待完成数」，每完成一张递减，
  // 模板 v-for 用它渲染格子导致占位格随生成变少（8 张生成 6 张后只剩 2 格）。
  // 修复：首次进入生成中时另存 mediaGeneratingTotal（恒定为请求数量），占位格数改由它决定。
  const enterBlock = source.match(/function enterMediaGeneratingState\(message, generatingType, messageText = '', aspectRatio = null\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(enterBlock, 'enterMediaGeneratingState must exist')
  assert.match(enterBlock, /message\.mediaGeneratingTotal = message\.mediaGeneratingCount/)
})

test('finalizeMediaGenerationState 一并清理 mediaGeneratingTotal', () => {
  const block = source.match(/function finalizeMediaGenerationState\(message, \{ restoreBuffer = false \} = \{\}\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'finalizeMediaGenerationState must exist')
  assert.match(block, /delete message\.mediaGeneratingTotal/)
})

test('finalizeMediaGenerationState 对 mediaStopped 保留冻结卡片（仅清理缓冲）', () => {
  const block = source.match(/function finalizeMediaGenerationState\(message, \{ restoreBuffer = false \} = \{\}\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'finalizeMediaGenerationState must exist')
  // 守卫：mediaStopped 时只清理生成中缓冲文本，不删除 mediaGenerating 等字段（卡片冻结保留）
  assert.match(block, /if \(message\.mediaStopped\) \{/)
  assert.match(block, /delete message\.generationContentBuffer/)
  assert.match(block, /return\s*\}/)
})

test('兜底计数设置点同步记录 mediaGeneratingTotal，避免重连/兜底路径丢失恒定格数', () => {
  const reconnectBlock = source.match(/function reconnectStream\(threadId\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(reconnectBlock, 'reconnectStream must exist')
  assert.match(reconnectBlock, /last\.mediaGeneratingTotal = /)
  const taskEventBlock = source.match(/onTaskEvent: \(event\) => \{\s*const message = messages\.value\[assistantMessageIndex\][\s\S]*?\n      \},/)?.[0]
  assert.ok(taskEventBlock, 'enhanced onTaskEvent must exist')
  assert.match(taskEventBlock, /message\.mediaGeneratingTotal = /)
})

test('普通模式 tool_started 设置计数时同步记录 mediaGeneratingTotal', () => {
  const block = source.match(/onToolEvent: \(event\) => \{\s*const message = messages\.value\[assistantMessageIndex\]\s*if \(!message\) return[\s\S]*?throttledScrollToBottom\(\)\n      \},/)?.[0]
  assert.ok(block, 'normal mode onToolEvent must exist')
  assert.match(block, /message\.mediaGeneratingTotal = /)
})
