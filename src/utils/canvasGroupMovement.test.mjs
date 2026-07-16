import test from 'node:test'
import assert from 'node:assert/strict'
import { getMovedGroupChildPositions, getNodeDropGroupId } from './canvasGroupMovement.js'

test('moves visible group children when node offsets are missing', () => {
  const nodes = [
    {
      id: 'group-a',
      type: 'group',
      position: { x: 100, y: 80 },
      data: { nodeIds: ['image-a', 'image-b'] }
    },
    {
      id: 'image-a',
      type: 'image',
      position: { x: 160, y: 150 },
      data: { groupId: 'group-a' }
    },
    {
      id: 'image-b',
      type: 'image',
      position: { x: 320, y: 250 },
      data: { groupId: 'group-a' }
    }
  ]

  const result = getMovedGroupChildPositions(nodes, nodes[0], { x: 140, y: 110 }, {
    previousPosition: { x: 100, y: 80 }
  })

  assert.deepEqual(result.childPositions, {
    'image-a': { x: 200, y: 180 },
    'image-b': { x: 360, y: 280 }
  })
  assert.deepEqual(result.nodeOffsets, {
    'image-a': { x: 60, y: 70 },
    'image-b': { x: 220, y: 170 }
  })
  assert.equal(result.offsetsChanged, true)
})

test('uses stored node offsets as the source of truth when present', () => {
  const nodes = [
    {
      id: 'group-a',
      type: 'group',
      position: { x: 100, y: 80 },
      data: {
        nodeIds: ['image-a'],
        nodeOffsets: {
          'image-a': { x: 75, y: 90 }
        }
      }
    },
    {
      id: 'image-a',
      type: 'image',
      position: { x: 160, y: 150 },
      data: { groupId: 'group-a' }
    }
  ]

  const result = getMovedGroupChildPositions(nodes, nodes[0], { x: 140, y: 110 }, {
    previousPosition: { x: 100, y: 80 }
  })

  assert.deepEqual(result.childPositions, {
    'image-a': { x: 215, y: 200 }
  })
  assert.deepEqual(result.nodeOffsets, {
    'image-a': { x: 75, y: 90 }
  })
  assert.equal(result.offsetsChanged, false)
})

test('rebases stale stored offsets from the current child positions', () => {
  const nodes = [
    {
      id: 'group-a',
      type: 'group',
      position: { x: 100, y: 80 },
      data: {
        nodeIds: ['image-a'],
        // 旧快照中的偏移已不再匹配刷新后实际显示的位置
        nodeOffsets: {
          'image-a': { x: 10, y: 10 }
        }
      }
    },
    {
      id: 'image-a',
      type: 'image',
      position: { x: 160, y: 150 },
      data: { groupId: 'group-a' }
    }
  ]

  const result = getMovedGroupChildPositions(nodes, nodes[0], { x: 140, y: 110 }, {
    previousPosition: { x: 100, y: 80 },
    rebaseOffsets: true
  })

  assert.deepEqual(result.childPositions, {
    'image-a': { x: 200, y: 180 }
  })
  assert.deepEqual(result.nodeOffsets, {
    'image-a': { x: 60, y: 70 }
  })
  assert.equal(result.offsetsChanged, true)
})

test('detects a group when a dragged node center enters its bounds', () => {
  const nodes = [
    {
      id: 'group-a',
      type: 'group',
      position: { x: 100, y: 80 },
      data: { width: 500, height: 360 }
    },
    {
      id: 'image-a',
      type: 'image',
      position: { x: 20, y: 20 },
      data: {}
    }
  ]

  assert.equal(getNodeDropGroupId(nodes, nodes[1], { x: 60, y: 100 }, {
    width: 120,
    height: 100
  }), 'group-a')
})

test('returns no group when a grouped node center is dragged outside all bounds', () => {
  const nodes = [
    {
      id: 'group-a',
      type: 'group',
      position: { x: 100, y: 80 },
      data: { width: 500, height: 360, nodeIds: ['image-a'] }
    },
    {
      id: 'image-a',
      type: 'image',
      position: { x: 160, y: 150 },
      data: { groupId: 'group-a' }
    }
  ]

  assert.equal(getNodeDropGroupId(nodes, nodes[1], { x: 650, y: 150 }, {
    width: 120,
    height: 100
  }), null)
})
