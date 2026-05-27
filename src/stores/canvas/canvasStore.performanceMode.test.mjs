/**
 * canvasStore.performanceMode 分级渲染契约测试
 * 运行：node bananaapiboard/src/stores/canvas/canvasStore.performanceMode.test.mjs
 *
 * 直接读源码做静态校验，无需挂载 Vue runtime。
 */
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const storeSrc = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')
const boardSrc = readFileSync(
  join(__dirname, '..', '..', 'components', 'canvas', 'CanvasBoard.vue'),
  'utf8'
)

// --- canvasStore.js 必须导出新阈值 ---
// minimal: > 500
assert.match(storeSrc, /count\s*>\s*500\)\s*return\s*['"]minimal['"]/, 'minimal 档应为 > 500 节点')
// reduced: > 200
assert.match(storeSrc, /count\s*>\s*200\)\s*return\s*['"]reduced['"]/, 'reduced 档应为 > 200 节点')
// optimized: > 50
assert.match(storeSrc, /count\s*>\s*50\)\s*return\s*['"]optimized['"]/, 'optimized 档应为 > 50 节点')

// 必须存在覆盖机制
assert.match(storeSrc, /performanceModeOverride/, 'canvasStore 必须暴露 performanceModeOverride 用于自适应降级')
assert.match(storeSrc, /function\s+setPerformanceMode/, 'canvasStore 必须暴露 setPerformanceMode')

// 历史栈长度阈值需要与性能档对齐
assert.match(storeSrc, /nodeCount\s*>\s*500[\s\S]{0,80}effectiveMaxHistory\s*=\s*3/, 'minimal 档历史栈应为 3')
assert.match(storeSrc, /nodeCount\s*>\s*200[\s\S]{0,80}effectiveMaxHistory\s*=\s*5/, 'reduced 档历史栈应为 5')

// --- CanvasBoard.vue 必须 provide performanceMode 并消费它 ---
assert.match(boardSrc, /provide\(\s*['"]canvasPerformanceMode['"]/, 'CanvasBoard 必须 provide canvasPerformanceMode')
assert.match(boardSrc, /canvasStore\.performanceMode/, 'CanvasBoard 必须读取 canvasStore.performanceMode')
assert.match(boardSrc, /shouldDisableAlignmentGuides/, 'CanvasBoard 必须根据性能档禁用对齐辅助线')
assert.match(boardSrc, /shouldDisableEdgeAnimation/, 'CanvasBoard 必须根据性能档禁用边动画')

console.log('canvasStore performanceMode tier tests passed')
