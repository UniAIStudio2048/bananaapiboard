import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getBatchGridPositions,
  getVisibleGroupGeometry,
  getVisibleNodeGroups
} from './canvasBatchLayout.js'

test('keeps 1x at the origin and leaves gaps between batch cells', () => {
  const options = {
    origin: { x: 100, y: 200 },
    nodeWidth: 380,
    nodeHeight: 320,
    horizontalGap: 40,
    verticalGap: 40
  }

  assert.deepEqual(getBatchGridPositions({ ...options, count: 1 }), [
    { x: 100, y: 200 }
  ])

  const positions = getBatchGridPositions({ ...options, count: 4 })
  assert.equal(positions[1].x - positions[0].x, 420)
  assert.equal(positions[2].y - positions[0].y, 360)
})

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

test('rebuilds group metadata from persisted visible group nodes', () => {
  assert.deepEqual(getVisibleNodeGroups([
    { id: 'image-1', type: 'image', data: { groupId: 'group-1' } },
    {
      id: 'group-1',
      type: 'group',
      data: {
        groupName: '图片生成 ×2',
        groupColor: 'rgba(1, 2, 3, 0.08)',
        borderColor: 'rgba(1, 2, 3, 0.25)',
        nodeIds: ['image-1', 'image-2']
      }
    }
  ]), [{
    id: 'group-1',
    name: '图片生成 ×2',
    nodeIds: ['image-1', 'image-2'],
    color: 'rgba(1, 2, 3, 0.08)',
    borderColor: 'rgba(1, 2, 3, 0.25)'
  }])
  assert.deepEqual(getVisibleNodeGroups([]), [])
})
