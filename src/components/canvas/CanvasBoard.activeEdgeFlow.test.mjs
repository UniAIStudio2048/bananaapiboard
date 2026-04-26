import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(
  source,
  /function scheduleActiveEdgePathsRead\(\)/,
  'CanvasBoard should schedule active edge flow path reads for the next animation frame'
)

const dragHandler = source.match(/onNodeDrag\(\(event\) => \{[\s\S]*?\n\}\)\n\n\/\/ 计算对齐辅助线/)
assert.ok(dragHandler, 'CanvasBoard should contain the node drag handler')

const handlerSource = dragHandler[0]
const firstSchedule = handlerSource.indexOf('scheduleActiveEdgePathsRead()')
const throttledReturn = handlerSource.indexOf('return // 跳过这次计算')

assert.ok(firstSchedule > -1, 'node drag should schedule active edge flow refresh')
assert.ok(throttledReturn > -1, 'node drag should keep the large-canvas alignment throttle')
assert.ok(
  firstSchedule < throttledReturn,
  'active edge flow refresh must be scheduled before alignment throttling can return'
)
