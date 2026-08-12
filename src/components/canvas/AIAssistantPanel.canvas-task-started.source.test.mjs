/**
 * AI 助手任务提交时画布同步建节点（canvas-task-started 事件）源码测试。
 *
 * 需求：AI 助手提交生图/生视频任务时，在画布同步创建与手动生图一致的节点
 * （生成中 processing、参数对应、参考图连线），结果到达再升级为 success。
 *
 * Run: cd bananapiboard && node --test src/components/canvas/AIAssistantPanel.canvas-task-started.source.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8')

test('面板声明 canvas-task-started 事件并带任务参数', () => {
  assert.match(source, /defineEmits\(\[[\s\S]*?'canvas-task-started'/)
})

test('提交响应（tool.completed）触发画布同步建节点，参数取自工具 args', () => {
  // tool.started 的 args 入队（并发多图按调用序配对不错位）
  assert.match(source, /pendingToolArgs\.get\(event\.tool\) \|\| \[\]/)
  assert.match(source, /queue\.push\(event\.args\)/)
  assert.match(source, /queue\.shift\(\) \|\| \{\}/)
  // image-gen/video-gen/image-gen-batch completed 且能提取 task_id 时 emit canvas-task-started
  // （batch 并发提交的每个任务都建节点，一张不漏）
  assert.match(source, /event\.type === 'completed' && \(event\.tool === 'image-gen' \|\| event\.tool === 'video-gen' \|\| event\.tool === 'image-gen-batch'\)/)
  assert.match(source, /extractTaskIdsFromToolCompletedResult\(event\.result\)/)
  assert.match(source, /for \(const tid of batchTaskIds\) \{/)
  assert.match(source, /emitCanvasTaskStarted\(\{[\s\S]*?task_id: tid/)
  // 参考图 URL 从 args 的 input_images/image/inputs/reference_images/source_assets 收集
  assert.match(source, /args\.input_images[\s\S]*?args\.image[\s\S]*?args\.inputs[\s\S]*?args\.reference_images[\s\S]*?args\.source_assets/)
})

test('task.started/progress 事件透传后端参数补建/补参节点', () => {
  assert.match(source, /if \(event\.type === 'task\.started' \|\| event\.type === 'task\.progress'\) \{/)
  assert.match(source, /emitCanvasTaskStarted\(\{[\s\S]*?task_id: event\.task_id/)
  assert.match(source, /prompt: event\.prompt/)
  assert.match(source, /model: event\.model/)
  assert.match(source, /reference_images: event\.reference_images/)
})

test('emitCanvasTaskStarted 组装节点 payload 并只透传合法字段', () => {
  assert.match(source, /function emitCanvasTaskStarted\(\{ task_id, media_type, tool, prompt = '', model = '', aspect_ratio = '', duration = null, reference_images = \[\], reference_node_ids = \[\] \}\)/)
  assert.match(source, /reference_images: Array\.isArray\(reference_images\) \? reference_images\.filter\(u => typeof u === 'string' && u\.startsWith\('http'\)\) : \[\]/)
  assert.match(source, /reference_node_ids: Array\.isArray\(reference_node_ids\) \? reference_node_ids\.filter\(Boolean\) : \[\]/)
  assert.match(source, /node_id: props\.canvasContext\?\.node_ids\?\.\[0\]/)
})

test('增强模式多图结果逐张写回画布（修复只写回一部分）', () => {
  // 增强模式 applyGeneratedResult 不再用 canvasWritebackSent 单次标志限制：
  // 每张结果到达都 emit canvas-writeback（幂等由 Canvas.vue 按 taskId/URL 去重），
  // 否则 6 张只写回第一张。普通模式结果一次性返回，保留原标志不受影响。
  const enhanced = source.slice(source.indexOf('const applyGeneratedResult'), source.indexOf('async function sendMessage'))
  assert.doesNotMatch(enhanced, /canvasWritebackSent/)
  assert.match(enhanced, /emit\('canvas-writeback', \{[\s\S]*?result_urls: urls/)
})

test('画布选图附件携带来源节点 id，发送时透传给画布建节点', () => {
  // addAttachmentFromUrl 接收 sourceNodeId 并写入附件（buildDirectUrlAttachment / pushAttachment）
  assert.match(source, /async function addAttachmentFromUrl\(url, type, name, sourceNodeId\)/)
  assert.match(source, /buildDirectUrlAttachment\(\{ url: directUrl, type, name: fileName, sourceNodeId \}\)/)
  // 发送时从附件收集 referenceNodeIds
  assert.match(source, /const referenceNodeIds = \[\.\.\.new Set\([\s\S]*?messageAttachments\.map\(\(a\) => a\?\.sourceNodeId\)\.filter\(Boolean\)[\s\S]*?\]/)
  // canvas-task-started 透传 reference_node_ids
  assert.match(source, /emitCanvasTaskStarted\(\{[\s\S]*?reference_node_ids: referenceNodeIds/)
  assert.match(source, /function emitCanvasTaskStarted\(\{[\s\S]*?reference_node_ids = \[\]/)
  assert.match(source, /reference_node_ids: Array\.isArray\(reference_node_ids\) \? reference_node_ids\.filter\(Boolean\) : \[\]/)
})
