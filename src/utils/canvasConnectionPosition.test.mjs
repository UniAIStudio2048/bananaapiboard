import test from 'node:test'
import assert from 'node:assert/strict'
import { getElementCenterFlowPosition } from './canvasConnectionPosition.js'

function createElementWithRect(rect) {
  return {
    getBoundingClientRect: () => rect,
    closest: (selector) => {
      if (selector !== '.vue-flow') return null
      return {
        getBoundingClientRect: () => ({ left: 100, top: 50 })
      }
    }
  }
}

test('getElementCenterFlowPosition uses screenToFlowPosition when provided', () => {
  const element = createElementWithRect({ left: 210, top: 120, width: 36, height: 36 })
  const seen = []

  const result = getElementCenterFlowPosition(element, {
    screenToFlowPosition(position) {
      seen.push(position)
      return { x: position.x / 5, y: position.y / 5 }
    },
    viewport: { x: 9999, y: 9999, zoom: 0.01 }
  })

  assert.deepEqual(seen, [{ x: 228, y: 138 }])
  assert.deepEqual(result, { x: 45.6, y: 27.6 })
})

test('getElementCenterFlowPosition falls back to viewport math for legacy callers', () => {
  const element = createElementWithRect({ left: 210, top: 120, width: 36, height: 36 })

  const result = getElementCenterFlowPosition(element, {
    viewport: { x: 50, y: 25, zoom: 5 }
  })

  assert.deepEqual(result, { x: 15.6, y: 12.6 })
})
