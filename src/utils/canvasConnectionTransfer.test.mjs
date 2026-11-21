import test from 'node:test'
import assert from 'node:assert/strict'
import { planNodeConnectionTransfer } from './canvasConnectionTransfer.js'

const edges = [
  { id: 'incoming', source: 'upstream', target: 'source', sourceHandle: 'output', targetHandle: 'input' },
  { id: 'outgoing', source: 'source', target: 'downstream', sourceHandle: 'output', targetHandle: 'input' }
]

test('shift transfer moves every incoming and outgoing edge to the target node', () => {
  const plan = planNodeConnectionTransfer({
    edges,
    sourceNodeId: 'source',
    targetNodeId: 'target',
    mode: 'move'
  })

  assert.deepEqual(plan.removeEdgeIds, ['incoming', 'outgoing'])
  assert.deepEqual(plan.addEdges.map(({ id, source, target }) => ({ id, source, target })), [
    { id: 'transfer-incoming-target', source: 'upstream', target: 'target' },
    { id: 'transfer-outgoing-target', source: 'target', target: 'downstream' }
  ])
})

test('ctrl transfer keeps originals and only adds missing mapped edges', () => {
  const plan = planNodeConnectionTransfer({
    edges: [
      ...edges,
      { id: 'already-copied', source: 'upstream', target: 'target', sourceHandle: 'output', targetHandle: 'input' }
    ],
    sourceNodeId: 'source',
    targetNodeId: 'target',
    mode: 'copy'
  })

  assert.deepEqual(plan.removeEdgeIds, [])
  assert.deepEqual(plan.addEdges.map(edge => edge.id), ['transfer-outgoing-target'])
  assert.equal(plan.addEdges[0].source, 'target')
  assert.equal(plan.addEdges[0].target, 'downstream')
})

test('transfer ignores self loops and invalid or identical targets', () => {
  const plan = planNodeConnectionTransfer({
    edges: [
      { id: 'self', source: 'source', target: 'source' },
      { id: 'valid', source: 'source', target: 'downstream' }
    ],
    sourceNodeId: 'source',
    targetNodeId: 'source',
    mode: 'move'
  })

  assert.deepEqual(plan, { removeEdgeIds: [], addEdges: [] })
})

test('repeated moves keep the reference edge ID within the database column limit', () => {
  let currentEdges = [{ id: 'reference-video', source: 'clip', target: 'video-0' }]
  for (let index = 1; index <= 30; index++) {
    const plan = planNodeConnectionTransfer({
      edges: currentEdges, sourceNodeId: `video-${index - 1}`, targetNodeId: `video-${index}`
    })
    assert.equal(plan.addEdges.length, 1)
    assert.ok(plan.addEdges[0].id.length <= 255)
    assert.notEqual(plan.addEdges[0].id, currentEdges[0].id)
    currentEdges = plan.addEdges
  }
})
