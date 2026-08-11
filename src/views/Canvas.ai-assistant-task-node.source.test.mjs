/**
 * AI 助手任务提交时画布同步建节点（handleAIAssistantCanvasTaskStarted）源码测试。
 *
 * 需求：AI 助手提交生图/生视频任务时，画布同步创建与手动生图一致的节点：
 * 生成中 processing、参数（prompt/model/比例/时长）对应、参考图连线、错开堆叠。
 *
 * Run: cd bananapiboard && node --test src/views/Canvas.ai-assistant-task-node.source.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./Canvas.vue', import.meta.url), 'utf8')

test('模板绑定 canvas-task-started 事件', () => {
  assert.match(source, /@canvas-task-started="handleAIAssistantCanvasTaskStarted"/)
})

test('任务提交时创建 processing 节点（生成中），参数对应', () => {
  assert.match(source, /function handleAIAssistantCanvasTaskStarted\(payload = \{\}\)/)
  assert.match(source, /const taskId = payload\.task_id \|\| payload\.taskId \|\| null/)
  assert.match(source, /status: 'processing'/)
  assert.match(source, /progress: mediaType === 'video' \? '视频生成中\.\.\.' : '生成中\.\.\.'/)
  assert.match(source, /processingStartedAt: Date\.now\(\)/)
  assert.match(source, /taskType: mediaType/)
  assert.match(source, /prompt: payload\.prompt \|\| ''/)
  assert.match(source, /model: payload\.model \|\| undefined/)
  assert.match(source, /aspectRatio: payload\.aspect_ratio \|\| undefined/)
})

test('幂等：同一 task_id 已存在节点时只补参数不重建', () => {
  assert.match(source, /canvasStore\.nodes\.find\(\(node\) =>\s*node\.type === mediaType && node\.data\?\.taskId === taskId/)
  assert.match(source, /if \(payload\.prompt && !existing\.data\?\.prompt\) patch\.prompt = payload\.prompt/)
  assert.match(source, /if \(Object\.keys\(patch\)\.length\) \{\s*canvasStore\.updateNodeData\(existing\.id, patch\)/)
})

test('参考图连线：优先按来源节点 id 精确匹配（URL 反查兜底）', () => {
  assert.match(source, /const referenceNodeIds = Array\.isArray\(payload\.reference_node_ids\) \? payload\.reference_node_ids : \[\]/)
  assert.match(source, /const refNode = referenceNodeIds\.length[\s\S]*?referenceNodeIds\.includes\(node\.id\)[\s\S]*?: referenceUrls\.length/)
  assert.match(source, /node\.data\?\.output\?\.urls[\s\S]*?node\.data\?\.sourceImages[\s\S]*?referenceUrls\.includes\(u\)/)
  assert.match(source, /canvasStore\.addEdge\(\{ source: refNode\.id, target: node\.id, sourceHandle: 'output', targetHandle: 'input' \}\)/)
})

test('排版：就近原则竖排（参考图正下方）+ 空白区域查找，新节点不重叠', () => {
  // 参考图来源节点 → 就近竖排放置（参考图正下方逐行向下，避免连线交叉）
  assert.match(source, /const position = findCanvasFreePosition\(\{[\s\S]*?nearNode: refNode \|\| null,[\s\S]*?preferNear: Boolean\(refNode\)/)
  assert.match(source, /function findCanvasFreePosition\(\{ nearNode = null, preferNear = false \} = \{\}\)/)
  assert.match(source, /const overlaps = \(x, y, w, h\) => nodeRects\.some\(/)
  // 竖排：x 固定（同列），y 从参考图下方开始逐行向下
  assert.match(source, /if \(preferNear && nearNode\?\.position\) \{\s*[\s\S]*?nearNode\.position\.x \+ col \* \(NODE_W \+ GAP\)[\s\S]*?nearNode\.position\.y \+ baseH \+ GAP \+ row \* \(NODE_H \+ GAP\)/)
  // 无参考图：列优先竖排扫描（先向下排满一列再换列）
  assert.match(source, /for \(let col = 0; col < 12; col \+= 1\) \{\s*for \(let row = 0; row < 16; row \+= 1\)/)
  assert.match(source, /const start = getVisibleCanvasFlowPosition\(\)[\s\S]*?startX \+ col \* \(NODE_W \+ GAP\)[\s\S]*?startY \+ row \* \(NODE_H \+ GAP\)/)
  assert.match(source, /if \(!overlaps\(x, y, NODE_W, NODE_H\)\) return \{ x, y \}/)
})

test('创建节点后平移视口到新节点（自动滚动可见）', () => {
  assert.match(source, /panCanvasViewportToNode\(node\)/)
  assert.match(source, /function panCanvasViewportToNode\(node\) \{[\s\S]*?canvasStore\.updateViewport\(\{[\s\S]*?x: cx - node\.position\.x \* zoom,/)
})

test('结果写回优先升级同 task_id 的 processing 节点（不受选中节点影响）', () => {
  assert.match(source, /const taskWritebackNode = taskId[\s\S]*?node\.type === mediaType && node\.data\?\.taskId === taskId/)
  assert.match(source, /if \(taskWritebackNode\) \{\s*const output = mediaType === 'video'/)
  assert.match(source, /canvasStore\.updateNodeData\(taskWritebackNode\.id, \{\s*status: 'success'/)
})

test('参考图反查来源节点不排除当前选中节点', () => {
  // 参考图若来自当前选中节点，仍应从该节点连线到新建的 processing 节点
  const refBlock = source.slice(source.indexOf('const refNode = referenceUrls.length'))
  assert.doesNotMatch(refBlock, /node\.id === payload\.node_id/)
})

test('提示词补写同步回填节点输入区（ImageNode/VideoNode watch data.prompt）', async () => {
  const img = await readFile(new URL('../components/canvas/nodes/ImageNode.vue', import.meta.url), 'utf8')
  const vid = await readFile(new URL('../components/canvas/nodes/VideoNode.vue', import.meta.url), 'utf8')
  assert.match(img, /watch\(\s*\(\) => props\.data\?\.prompt,/)
  assert.match(img, /if \(typeof newPrompt === 'string' && newPrompt !== promptText\.value\) \{\s*promptText\.value = newPrompt/)
  assert.match(vid, /watch\(\s*\(\) => props\.data\?\.prompt,/)
})
