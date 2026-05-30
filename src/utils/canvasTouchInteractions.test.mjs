import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyPanToViewport,
  applyZoomAtScreenPoint,
  getTouchDistance,
  getTouchMidpoint,
  getTouchPoint
} from './canvasTouchInteractions.js'

test('touch point helpers normalize client coordinates', () => {
  assert.deepEqual(getTouchPoint({ clientX: 12, clientY: 34 }), { x: 12, y: 34 })
  assert.equal(getTouchPoint(null), null)
  assert.equal(getTouchPoint({ clientX: undefined, clientY: 10 }), null)
})

test('two touch helpers calculate pinch center and distance', () => {
  const first = { clientX: 10, clientY: 20 }
  const second = { clientX: 110, clientY: 220 }

  assert.deepEqual(getTouchMidpoint(first, second), { x: 60, y: 120 })
  assert.equal(getTouchDistance(first, second), Math.sqrt(100 * 100 + 200 * 200))
})

test('touch pan updates only the viewport offset', () => {
  assert.deepEqual(
    applyPanToViewport({ x: 100, y: -50, zoom: 1.25 }, { dx: 18, dy: -7 }),
    { x: 118, y: -57, zoom: 1.25 }
  )
})

test('touch zoom keeps the flow coordinate under the screen point fixed', () => {
  const viewport = { x: 50, y: 30, zoom: 1 }
  const screenPoint = { x: 250, y: 230 }
  const next = applyZoomAtScreenPoint(viewport, 2, screenPoint, { minZoom: 0.1, maxZoom: 5 })

  assert.deepEqual(next, { x: -150, y: -170, zoom: 2 })
  assert.equal((screenPoint.x - next.x) / next.zoom, (screenPoint.x - viewport.x) / viewport.zoom)
  assert.equal((screenPoint.y - next.y) / next.zoom, (screenPoint.y - viewport.y) / viewport.zoom)
})

test('touch zoom clamps to configured zoom bounds', () => {
  assert.deepEqual(
    applyZoomAtScreenPoint({ x: 0, y: 0, zoom: 1 }, 10, { x: 100, y: 100 }, { minZoom: 0.1, maxZoom: 5 }),
    { x: -400, y: -400, zoom: 5 }
  )

  assert.deepEqual(
    applyZoomAtScreenPoint({ x: 0, y: 0, zoom: 1 }, 0.01, { x: 100, y: 100 }, { minZoom: 0.1, maxZoom: 5 }),
    { x: 90, y: 90, zoom: 0.1 }
  )
})
