import assert from 'node:assert/strict'
import {
  clampOverlayPosition,
  createDefaultOverlay,
  getNextOverlayLabel,
  getOverlayExportRect,
  sortVisibleOverlays
} from './canvasPanoramaOverlay.js'

const overlays = [
  { label: '人物1', type: 'person' },
  { label: '物品1', type: 'object' },
  { label: '人物2', type: 'person' }
]

assert.equal(getNextOverlayLabel(overlays, 'person'), '人物3')
assert.equal(getNextOverlayLabel(overlays, 'object'), '物品2')
assert.equal(getNextOverlayLabel([], 'person'), '人物1')

const overlay = createDefaultOverlay({
  source: 'local',
  type: 'person',
  url: 'blob:demo',
  originalName: 'demo.png',
  existingOverlays: overlays,
  naturalWidth: 512,
  naturalHeight: 1024
})

assert.equal(overlay.label, '人物3')
assert.equal(overlay.x, 0.5)
assert.equal(overlay.y, 0.5)
assert.equal(overlay.scale, 1)
assert.equal(overlay.visible, true)
assert.equal(overlay.flipped, false)
assert.equal(overlay.naturalWidth, 512)
assert.equal(overlay.naturalHeight, 1024)

assert.deepEqual(clampOverlayPosition({ x: -1, y: 2 }), { x: 0, y: 1 })
assert.deepEqual(clampOverlayPosition({ x: 0.45, y: 0.72 }), { x: 0.45, y: 0.72 })

assert.deepEqual(
  sortVisibleOverlays([
    { id: 'hidden', visible: false, zIndex: 99, url: 'hidden.png' },
    { id: 'top', visible: true, zIndex: 2, url: 'top.png' },
    { id: 'bottom', visible: true, zIndex: 1, url: 'bottom.png' }
  ]).map(item => item.id),
  ['bottom', 'top']
)

assert.deepEqual(
  getOverlayExportRect({
    overlay: {
      x: 0.5,
      y: 0.75,
      scale: 1,
      naturalWidth: 400,
      naturalHeight: 800
    },
    outputWidth: 1000,
    outputHeight: 500,
    baseHeightRatio: 0.42
  }),
  {
    width: 105,
    height: 210,
    left: 448,
    top: 270
  }
)

assert.deepEqual(
  getOverlayExportRect({
    overlay: {
      x: 0.25,
      y: 0.25,
      scale: 2,
      naturalWidth: 100,
      naturalHeight: 100
    },
    outputWidth: 800,
    outputHeight: 600,
    baseHeightRatio: 0.25
  }),
  {
    width: 300,
    height: 300,
    left: 50,
    top: 0
  }
)

console.log('canvasPanoramaOverlay tests passed')
