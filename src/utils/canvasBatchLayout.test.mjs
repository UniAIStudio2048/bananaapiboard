import test from 'node:test'
import assert from 'node:assert/strict'
import { getBatchGridPositions, getVisibleGroupGeometry } from './canvasBatchLayout.js'

test('lays out 2 outputs in one row and 4 outputs in a 2x2 grid', () => {
  const options = {
    origin: { x: 100, y: 200 },
    nodeWidth: 380,
    nodeHeight: 320,
    horizontalGap: 40,
    verticalGap: 40
  }

  assert.deepEqual(getBatchGridPositions({ ...options, count: 2 }), [
    { x: 100, y: 200 },
    { x: 520, y: 200 }
  ])
  assert.deepEqual(getBatchGridPositions({ ...options, count: 4 }), [
    { x: 100, y: 200 },
    { x: 520, y: 200 },
    { x: 100, y: 560 },
    { x: 520, y: 560 }
  ])
})

test('builds padded visible-group geometry and member offsets', () => {
  const nodes = [
    {
      id: 'a',
      position: { x: 100, y: 200 },
      dimensions: { width: 380, height: 320 },
      data: {}
    },
    {
      id: 'b',
      position: { x: 520, y: 200 },
      dimensions: { width: 380, height: 320 },
      data: {}
    }
  ]

  assert.deepEqual(getVisibleGroupGeometry(nodes), {
    position: { x: 40, y: 110 },
    width: 920,
    height: 470,
    nodeOffsets: {
      a: { x: 60, y: 90 },
      b: { x: 480, y: 90 }
    }
  })
})
