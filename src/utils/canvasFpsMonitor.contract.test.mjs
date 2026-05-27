/**
 * Canvas.vue × canvasFpsMonitor 集成契约测试
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')
const canvasSrc = readFileSync(join(repoRoot, 'src', 'views', 'Canvas.vue'), 'utf8')
const storeSrc = readFileSync(join(repoRoot, 'src', 'stores', 'canvas', 'canvasStore.js'), 'utf8')

// store 必须提供 baselinePerformanceMode
assert.match(storeSrc, /baselinePerformanceMode/, 'canvasStore 必须新增 baselinePerformanceMode')
assert.match(storeSrc, /baselinePerformanceMode,/, '必须 export baselinePerformanceMode')

// Canvas.vue 必须导入 & 启动 / 停止 FPS monitor
assert.match(canvasSrc, /from\s+['"]@\/utils\/canvasFpsMonitor['"]/, 'Canvas.vue 必须从 canvasFpsMonitor 导入')
assert.match(canvasSrc, /createCanvasFpsMonitor\s*\(/, 'Canvas.vue 必须调用 createCanvasFpsMonitor')
assert.match(canvasSrc, /startCanvasFpsMonitor\s*\(\)/, 'Canvas.vue 必须在挂载时启动 FPS monitor')
assert.match(canvasSrc, /stopCanvasFpsMonitor\s*\(\)/, 'Canvas.vue 必须在卸载时停止 FPS monitor')

// 必须委托 setPerformanceMode（自适应降级落到 store）
assert.match(canvasSrc, /canvasStore\.setPerformanceMode\(/, 'FPS monitor 必须通过 setPerformanceMode 反向写入 store')

// 必须读取 baseline 用于恢复
assert.match(canvasSrc, /canvasStore\.baselinePerformanceMode/, 'FPS monitor 必须读取 baselinePerformanceMode 作为恢复上限')

console.log('canvasFpsMonitor integration contract tests passed')
