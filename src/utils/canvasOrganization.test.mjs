import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOrganizationSignature,
  getOrganizationNodeSize,
  organizeCanvasNodes,
  rectanglesConflict
} from './canvasOrganization.js'

function imageNode(id, x, y, width = 100, height = 100, data = {}) {
  return {
    id,
    type: 'image',
    position: { x, y },
    dimensions: { width, height },
    data
  }
}

test('keeps conflict-free nodes unchanged and moves only a later overlap', () => {
  const nodes = [
    imageNode('a', 0, 0),
    imageNode('b', 180, 0),
    imageNode('c', 20, 20)
  ]

  const result = organizeCanvasNodes(nodes, { gap: 40, snapToGrid: false })

  assert.equal(result.failed, false)
  assert.equal(result.changed, true)
  assert.deepEqual(result.positions.a, { x: 0, y: 0 })
  assert.deepEqual(result.positions.b, { x: 180, y: 0 })
  assert.notDeepEqual(result.positions.c, { x: 20, y: 20 })
})

test('returns rectangles with no overlap or spacing violation', () => {
  const nodes = [
    imageNode('a', 0, 0),
    imageNode('b', 10, 10),
    imageNode('c', 20, 20),
    imageNode('d', 30, 30)
  ]

  const result = organizeCanvasNodes(nodes, { gap: 40 })
  const rectangles = Object.values(result.rectangles)

  for (let index = 0; index < rectangles.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < rectangles.length; otherIndex += 1) {
      assert.equal(rectanglesConflict(rectangles[index], rectangles[otherIndex], 40), false)
    }
  }
})

test('treats a visible group as one item and omits its children', () => {
  const nodes = [
    {
      id: 'group-1',
      type: 'group',
      position: { x: 0, y: 0 },
      data: { width: 300, height: 240, nodeIds: ['child'] }
    },
    imageNode('child', 30, 50, 100, 100, { groupId: 'group-1' }),
    imageNode('other', 40, 40)
  ]

  const result = organizeCanvasNodes(nodes, { gap: 40 })

  assert.deepEqual([...result.itemIds].sort(), ['group-1', 'other'])
  assert.equal(Object.hasOwn(result.positions, 'child'), false)
})

test('treats a child with a missing group as an independent item', () => {
  const result = organizeCanvasNodes([
    imageNode('orphan', 0, 0, 100, 100, { groupId: 'missing-group' })
  ])

  assert.deepEqual(result.itemIds, ['orphan'])
})

test('snaps final positions to the existing 20px grid deterministically', () => {
  const nodes = [
    imageNode('a', 13, 27),
    imageNode('b', 20, 30)
  ]

  const first = organizeCanvasNodes(nodes, { gap: 40, snapToGrid: true, grid: 20 })
  const second = organizeCanvasNodes(nodes, { gap: 40, snapToGrid: true, grid: 20 })

  assert.deepEqual(first, second)
  for (const position of Object.values(first.positions)) {
    assert.equal(position.x % 20, 0)
    assert.equal(position.y % 20, 0)
  }
})

test('uses stable node-type dimensions when Vue Flow has not measured a node', () => {
  assert.deepEqual(getOrganizationNodeSize({ type: 'storyboard', data: {} }), { width: 720, height: 360 })
  assert.deepEqual(
    getOrganizationNodeSize({ type: 'image', data: { width: 512, height: 256 } }),
    { width: 512, height: 256 }
  )
})

test('signature ignores task data but detects positions, grouping, and edges', () => {
  const baseNodes = [imageNode('a', 0, 0, 100, 100, { status: 'idle' })]
  const taskUpdatedNodes = [imageNode('a', 0, 0, 100, 100, { status: 'processing' })]

  assert.equal(buildOrganizationSignature(baseNodes, []), buildOrganizationSignature(taskUpdatedNodes, []))
  assert.notEqual(
    buildOrganizationSignature(baseNodes, []),
    buildOrganizationSignature([imageNode('a', 20, 0)], [])
  )
  assert.notEqual(
    buildOrganizationSignature(baseNodes, []),
    buildOrganizationSignature(baseNodes, [{ id: 'edge-1', source: 'a', target: 'b' }])
  )
})
