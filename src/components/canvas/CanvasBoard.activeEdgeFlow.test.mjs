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

const activeFlowLayerRule = source.match(/\.active-edge-flow\s*\{[\s\S]*?\n\}/)
assert.ok(
  activeFlowLayerRule,
  'active edge flow should define its own layer instead of inheriting the guide overlay z-index'
)
assert.match(
  activeFlowLayerRule[0],
  /z-index\s*:\s*0\s*;/,
  'active edge flow should render on the edge layer, below normal nodes'
)

assert.match(
  source,
  /const activeEdgeGeometrySignature = computed\(\(\) => \{/,
  'active edge flow should track selected edge endpoint geometry changes'
)

const activeFlowWatcher = source.match(/watch\(\s*\[[\s\S]*?activeEdgeGeometrySignature[\s\S]*?\]\s*,\s*\(\) => \{ nextTick\(scheduleActiveEdgePathsRead\) \}/)
assert.ok(
  activeFlowWatcher,
  'active edge flow should refresh when connected node geometry changes after media generation'
)
