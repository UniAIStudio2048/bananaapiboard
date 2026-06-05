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

assert.match(
  touchEndHandler,
  /touchState\.mode === 'node-delete-pending'[\s\S]*?selectSingleNodeFromTouch\(touchState\.nodeId\)/,
  'Quick taps on iPad nodes should sync single-node selection so prompt panels appear'
)

assert.match(
  touchEndHandler,
  /touchState\.mode === 'node-drag'[\s\S]*?finishTouchNodeDrag\(\)/,
  'Touch node drags should finish with the same drag-end cleanup as mouse drags'
)

const selectedNodeMoveHandler = source.match(
  /function handleSelectedNodeTouchDeleteMove\([\s\S]*?\n}\n\nfunction handleTouchNodeDragMove/
)?.[0] || ''

assert.match(
  selectedNodeMoveHandler,
  /startTouchNodeDrag\(point\)/,
  'Moving past the long-press threshold on a node should start a touch node drag instead of dropping the gesture'
)

const touchNodeDragMoveHandler = source.match(
  /function handleTouchNodeDragMove\([\s\S]*?\n}\n\nfunction moveTouchDraggedNode/
)?.[0] || ''

assert.match(
  touchNodeDragMoveHandler,
  /moveTouchDraggedNode\(point\)/,
  'Active touch node drags should update the dragged node position on each move'
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

const interactiveTouchTarget = source.match(
  /function isInteractiveTouchTarget\(target\) \{[\s\S]*?\n\}/
)?.[0] || ''

assert.match(
  interactiveTouchTarget,
  /model-selector-custom/,
  'Image node model picker should be treated as an interactive touch target on Android tablets'
)

assert.match(
  interactiveTouchTarget,
  /preset-selector-custom/,
  'Image node preset picker should be treated as an interactive touch target on Android tablets'
)

assert.match(
  interactiveTouchTarget,
  /param-chip/,
  'Image node size chips should be treated as interactive touch targets on Android tablets'
)

assert.match(
  interactiveTouchTarget,
  /count-display/,
  'Image node batch count control should be treated as an interactive touch target on Android tablets'
)

console.log('CanvasBoard touch interaction tests passed')
