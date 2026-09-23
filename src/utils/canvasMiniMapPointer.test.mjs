import test from 'node:test'
import assert from 'node:assert/strict'
import { getMiniMapPointerPosition } from './canvasMiniMapPointer.js'

test('maps a screen pointer through the SVG transform, including unequal axis scaling', () => {
  const svg = {
    getScreenCTM: () => ({
      inverse: () => ({ a: 0.5, d: 0.25, e: -10, f: -7.5 })
    }),
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform(matrix) {
        return {
          x: this.x * matrix.a + matrix.e,
          y: this.y * matrix.d + matrix.f
        }
      }
    })
  }

  assert.deepEqual(getMiniMapPointerPosition(svg, 220, 230), { x: 100, y: 50 })
})

test('ignores unavailable transforms and invalid pointer coordinates', () => {
  const svg = { getScreenCTM: () => null }
  assert.equal(getMiniMapPointerPosition(svg, 20, 30), null)
  assert.equal(getMiniMapPointerPosition(svg, NaN, 30), null)
})
