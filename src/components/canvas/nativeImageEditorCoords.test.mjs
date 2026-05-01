import { strict as assert } from 'node:assert'
import { getNativeImageEditorPointerCoords } from './nativeImageEditorCoords.js'

const coords = getNativeImageEditorPointerCoords(
  { clientX: 250, clientY: 140 },
  { left: 50, top: 40, width: 400, height: 200 },
  { width: 800, height: 600, displayWidth: 400, displayHeight: 200 }
)

assert.deepEqual(coords, {
  x: 400,
  y: 300,
  displayX: 200,
  displayY: 100
})

assert.notEqual(
  coords.x,
  coords.displayX,
  'DOM overlays must use display coordinates, not canvas pixel coordinates'
)

const zoomedCoords = getNativeImageEditorPointerCoords(
  { clientX: 450, clientY: 240 },
  { left: 50, top: 40, width: 800, height: 400 },
  { width: 800, height: 600, displayWidth: 400, displayHeight: 200 }
)

assert.deepEqual(zoomedCoords, {
  x: 400,
  y: 300,
  displayX: 200,
  displayY: 100
})

console.log('NativeImageEditor coordinate tests passed')
