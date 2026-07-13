import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CANVAS_GRID_SNAP_STORAGE_KEY,
  CANVAS_LAST_EDGE_STYLE_STORAGE_KEY,
  resolveCanvasGridSnap,
  resolveEdgeRestoreStyle,
  writeCanvasGridSnap,
  writeEdgeRestoreStyle
} from './canvasControlPreferences.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }
}

test('grid snap defaults on and accepts only explicit persisted booleans', () => {
  assert.equal(resolveCanvasGridSnap({}, null), true)
  assert.equal(resolveCanvasGridSnap({ canvas: { gridSnap: false } }, 'true'), false)
  assert.equal(resolveCanvasGridSnap({ canvas: { gridSnap: true } }, 'false'), true)
  assert.equal(resolveCanvasGridSnap({}, 'false'), false)
  assert.equal(resolveCanvasGridSnap({}, 'invalid'), true)
})

test('writes the grid preference as a stable local-storage boolean', () => {
  const storage = memoryStorage()

  assert.equal(writeCanvasGridSnap(storage, false), true)
  assert.equal(storage.getItem(CANVAS_GRID_SNAP_STORAGE_KEY), 'false')
  assert.equal(writeCanvasGridSnap(storage, true), true)
  assert.equal(storage.getItem(CANVAS_GRID_SNAP_STORAGE_KEY), 'true')
})

test('storage failures do not break the visible control state', () => {
  const throwingStorage = { setItem() { throw new Error('denied') } }
  assert.equal(writeCanvasGridSnap(throwingStorage, true), false)
  assert.equal(writeEdgeRestoreStyle(throwingStorage, 'straight'), false)
})

test('hidden or invalid edge styles restore to bezier', () => {
  assert.equal(resolveEdgeRestoreStyle('smoothstep'), 'smoothstep')
  assert.equal(resolveEdgeRestoreStyle('straight'), 'straight')
  assert.equal(resolveEdgeRestoreStyle('hidden'), 'bezier')
  assert.equal(resolveEdgeRestoreStyle('invalid'), 'bezier')
  assert.equal(resolveEdgeRestoreStyle(null), 'bezier')
})

test('persists only valid visible edge styles', () => {
  const storage = memoryStorage()

  assert.equal(writeEdgeRestoreStyle(storage, 'straight'), true)
  assert.equal(storage.getItem(CANVAS_LAST_EDGE_STYLE_STORAGE_KEY), 'straight')
  assert.equal(writeEdgeRestoreStyle(storage, 'hidden'), true)
  assert.equal(storage.getItem(CANVAS_LAST_EDGE_STYLE_STORAGE_KEY), 'bezier')
})
