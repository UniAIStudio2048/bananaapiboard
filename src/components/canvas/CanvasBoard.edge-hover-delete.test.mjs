import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

// ---- 连线悬停剪刀删除按钮 ----

assert.match(
  source,
  /const EDGE_HOVER_DELETE_DELAY = 500/,
  'edge hover delete button should appear only after the mouse rests on an edge for 500ms'
)

for (const hook of ['onEdgeMouseEnter', 'onEdgeMouseMove', 'onEdgeMouseLeave']) {
  assert.match(
    source,
    new RegExp(`${hook}\\(`),
    `CanvasBoard should register ${hook} to drive the edge hover delete button`
  )
}

const deleteClick = source.match(/function handleEdgeHoverDeleteClick\(\) \{[\s\S]*?\n\}/)
assert.ok(deleteClick, 'CanvasBoard should handle the scissors button click')
assert.match(
  deleteClick[0],
  /canvasStore\.saveHistory\(\{ force: true \}\)/,
  'scissors delete should persist an undo history entry like keyboard deletion'
)
assert.match(
  deleteClick[0],
  /canvasStore\.removeEdge\(/,
  'scissors delete should remove the edge through canvasStore.removeEdge'
)

assert.match(
  source,
  /function hideEdgeHoverDelete\(\)/,
  'hover state must be cleaned up when the mouse leaves the edge'
)
assert.match(
  source,
  /watch\(vfViewport[\s\S]*?hideEdgeHoverDelete\(\)/,
  'panning or zooming should dismiss a stale hover delete button'
)

const scissorsBtn = source.match(/<button[\s\S]*?class="edge-hover-delete-btn"[\s\S]*?<\/button>/)
assert.ok(scissorsBtn, 'template should render the scissors delete button')
assert.match(
  scissorsBtn[0],
  /:style="\{ left: `\$\{edgeHoverDelete\.x\}px`/, 'scissors button should be positioned at the mouse position'
)
assert.match(
  scissorsBtn[0],
  /M20 4 8\.12 15\.88/,
  'scissors button should render the scissors icon paths'
)

const btnCss = source.match(/\.edge-hover-delete-btn\s*\{[\s\S]*?\n\}/)
assert.ok(btnCss, 'scissors button should have its own style block')
assert.match(btnCss[0], /pointer-events:\s*auto/, 'scissors button must stay clickable above the canvas')

// ---- 选中连线动效颜色加强 ----

assert.match(
  source,
  /opacityPerLayer = 0\.09/,
  'selected edge flow layers should stack to a stronger opacity than the old 0.045'
)

const connectionFlowRule = source.match(/\.connection-flow\s*\{[\s\S]*?\n\}/)
assert.ok(connectionFlowRule, 'connection-flow rule should exist')
assert.match(
  connectionFlowRule[0],
  /stroke:\s*#93c5fd/,
  'selected edge flow color should be brightened from #60a5fa'
)
assert.match(
  connectionFlowRule[0],
  /stroke-width:\s*2\.5/,
  'selected edge flow should render slightly thicker'
)
