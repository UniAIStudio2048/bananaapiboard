import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(
  source,
  /from '@\/utils\/canvasTouchInteractions'/,
  'CanvasBoard should use shared touch gesture math helpers'
)

assert.match(
  source,
  /addEventListener\('touchstart',\s*handleTouchStart,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/,
  'CanvasBoard should capture a non-passive touchstart listener before Vue Flow can consume selected-node long presses'
)

assert.match(
  source,
  /window\.addEventListener\('touchmove',\s*handleTouchMove,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/,
  'CanvasBoard should track touch movement globally while a touch gesture is active'
)

assert.match(
  source,
  /window\.addEventListener\('touchend',\s*handleTouchEnd,\s*\{\s*capture:\s*true\s*\}\)/,
  'CanvasBoard should finish touch pan, pinch, and connection gestures even when the finger leaves the board'
)

assert.match(
  source,
  /function handleTouchConnectionStart\([\s\S]*?canvasStore\.startDragConnection/,
  'CanvasBoard should start custom drag connections from touch on the node add button'
)

const touchEndHandler = source.match(
  /function handleTouchEnd\([\s\S]*?\n}\n\nfunction handleTouchCancel/
)?.[0] || ''

assert.match(
  touchEndHandler,
  /touchState\.mode === 'blank-long-press'[\s\S]*?canvasStore\.isNodeSelectorOpen[\s\S]*?canvasStore\.closeNodeSelector\(\)/,
  'Blank canvas taps on touch devices should close an already-open node selector'
)

assert.match(
  touchEndHandler,
  /touchState\.mode === 'blank-long-press'[\s\S]*?canvasStore\.closeAllContextMenus\(\)/,
  'Blank canvas taps on touch devices should close an open node long-press context menu'
)

const touchConnectionStart = source.match(
  /function handleTouchConnectionStart\([\s\S]*?\n}\n\nfunction startTouchConnectionDrag/
)?.[0] || ''

assert.match(
  touchConnectionStart,
  /startTouchConnectionDrag\(\)/,
  'Touching the right node add button should immediately enter drag-connection mode on iPad'
)

assert.doesNotMatch(
  touchConnectionStart,
  /touchConnectionLongPressTimer\s*=\s*setTimeout/,
  'Touch connection start should not wait for a long-press timer before drawing the connection'
)

assert.match(
  source,
  /applyZoomAtScreenPoint\(/,
  'CanvasBoard should zoom touch gestures around the pinch midpoint instead of the viewport origin'
)

assert.match(
  source,
  /removeEventListener\('touchstart',\s*handleTouchStart,\s*\{\s*capture:\s*true\s*\}\)/,
  'CanvasBoard should remove the captured touchstart listener on unmount'
)

console.log('CanvasBoard touch interaction tests passed')
