import test from 'node:test'
import assert from 'node:assert/strict'
import { getMovedGroupChildPositions } from './canvasGroupMovement.js'

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
