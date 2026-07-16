import test from 'node:test'
import assert from 'node:assert/strict'

import { getDraggedNodeFinalPositions } from './canvasDragPositions.js'

function moveNodes(nodes, draggedNodeId, finalPosition) {
  const draggedNode = nodes.find(node => node.id === draggedNodeId)
  const positions = getDraggedNodeFinalPositions(nodes, draggedNode, finalPosition)
  return nodes.map(node => ({ ...node, position: positions[node.id] }))
}

test('multi-node dragging preserves every relative position across repeated moves', () => {
  const initialNodes = [
    { id: 'text-1', position: { x: 100, y: 80 } },
    { id: 'image-1', position: { x: 260, y: 140 } },
    { id: 'video-1', position: { x: 420, y: 360 } }
  ]

  const firstMove = moveNodes(initialNodes, 'image-1', { x: 310, y: 210 })
  const secondMove = moveNodes(firstMove, 'text-1', { x: 40, y: 25 })

  for (const nodes of [firstMove, secondMove]) {
    assert.deepEqual(
      nodes.map(node => ({
        x: node.position.x - nodes[0].position.x,
        y: node.position.y - nodes[0].position.y
      })),
      initialNodes.map(node => ({
        x: node.position.x - initialNodes[0].position.x,
        y: node.position.y - initialNodes[0].position.y
      }))
    )
  }
})

test('snap correction is applied equally to every dragged node', () => {
  const nodes = [
    { id: 'text-1', position: { x: 113, y: 87 } },
    { id: 'image-1', position: { x: 273, y: 147 } }
  ]

  assert.deepEqual(
    getDraggedNodeFinalPositions(nodes, nodes[0], { x: 120, y: 100 }),
    {
      'text-1': { x: 120, y: 100 },
      'image-1': { x: 280, y: 160 }
    }
  )
})
