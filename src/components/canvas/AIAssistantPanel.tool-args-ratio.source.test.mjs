/**
 * AI 助手生成中占位按请求比例展示（源码测试）。
 *
 * 需求：生图/生视频时，生成中就要显示请求的宽高比（而不是等全部生成完成后再显示）。
 * 数据源有两条：tool.started 的 args（image-gen/video-gen 提交参数，最及时），
 * 以及 task.started/progress 事件的 DB 真源透传（args 被脱敏时的兜底）。
 *
 * Run: cd bananapiboard && node --test src/components/canvas/AIAssistantPanel.tool-args-ratio.source.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8')

test('handleToolEvent started 分支把工具 args 的 aspect_ratio 传入生成中状态', () => {
  const block = source.match(/function handleToolEvent\(message, event, opts = \{\}\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'handleToolEvent must exist')
  // 进入媒体生成中时带上 tool.started args 里的 aspect_ratio（image-gen/video-gen 提交参数）
  assert.match(block, /enterMediaGeneratingState\(message, generatingType, opts\.messageText \|\| '', event\.args\?\.aspect_ratio\)/)
})

test('enterMediaGeneratingState 首参命中时记录生成中比例，未知比例不覆盖已有值', () => {
  const block = source.match(/function enterMediaGeneratingState\(message, generatingType, messageText = '', aspectRatio = null\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(block, 'enterMediaGeneratingState must exist')
  // 有比例时写入 mediaGeneratingRatio（只写一次：先到先得，tool args 与 task.started 不互踩）
  assert.match(block, /if \(aspectRatio && !message\.mediaGeneratingRatio\) \{/)
  assert.match(block, /message\.mediaGeneratingRatio = aspectRatio/)
})

test('onTaskEvent task.started/progress 透传后端 aspect_ratio（DB 真源兜底）', () => {
  const block = source.match(/onTaskEvent: \(event\) => \{[\s\S]*?\n      \},/)?.[0]
  assert.ok(block, 'onTaskEvent must exist')
  assert.match(block, /enterMediaGeneratingState\([\s\S]*?event\.aspect_ratio\)/)
})
