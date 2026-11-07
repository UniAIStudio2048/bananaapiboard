import test from 'node:test'
import assert from 'node:assert/strict'
import { initialFrameCrop, moveFrameCrop, resizeFrameCrop, frameCropPixels, setFrameCropAspectRatio } from './videoFrameCrop.js'

test('initial selection covers the central 80 percent of the frame', () => {
  assert.deepEqual(initialFrameCrop(), { x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  assert.deepEqual(frameCropPixels(initialFrameCrop(), 1280, 704), { x: 128, y: 70, width: 1024, height: 562 })
})

test('moving keeps the selection inside the video', () => {
  assert.deepEqual(moveFrameCrop({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 }, -1, 2), { x: 0, y: 0.5, width: 0.5, height: 0.5 })
})

test('handles resize independently and respect bounds and minimum size', () => {
  const crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
  assert.deepEqual(resizeFrameCrop(crop, 'e', -0.25, 0, 1280, 704), { x: 0.1, y: 0.1, width: 0.55, height: 0.8 })
  const small = resizeFrameCrop(crop, 'nw', 2, 2, 1280, 704)
  assert.ok(small.width >= 16 / 1280 && small.height >= 16 / 704)
  assert.ok(small.x + small.width <= 1 && small.y + small.height <= 1)
})

test('pixel coordinates are even and fit within odd-sized sources', () => {
  const crop = frameCropPixels({ x: 0.9, y: 0.9, width: 0.1, height: 0.1 }, 641, 481)
  assert.ok(Object.values(crop).every(value => value % 2 === 0))
  assert.ok(crop.x + crop.width <= 641 && crop.y + crop.height <= 481)
})

test('aspect ratio preset preserves the current center and fits inside the selection', () => {
  const crop = setFrameCropAspectRatio({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, 16 / 9, 1152, 2048)
  const pixels = frameCropPixels(crop, 1152, 2048)

  assert.ok(Math.abs((pixels.width / pixels.height) - (16 / 9)) < 0.01)
  assert.ok(Math.abs(crop.x + crop.width / 2 - 0.5) < 1e-8)
  assert.ok(Math.abs(crop.y + crop.height / 2 - 0.5) < 1e-8)
  assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 1 && crop.y + crop.height <= 1)
})
