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
  /addEventListener\('touchstart',\s*handleTouchStart,\s*\{\s*passive:\s*false\s*\}\)/,
  'CanvasBoard should attach a non-passive touchstart listener so iPad canvas gestures can prevent page scrolling'
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

assert.match(
  source,
  /applyZoomAtScreenPoint\(/,
  'CanvasBoard should zoom touch gestures around the pinch midpoint instead of the viewport origin'
)

assert.match(
  source,
  /removeEventListener\('touchstart',\s*handleTouchStart\)/,
  'CanvasBoard should remove touch listeners on unmount'
)

console.log('CanvasBoard touch interaction tests passed')
