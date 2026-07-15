import assert from 'node:assert/strict'
import {
  getCanvasNodeBounds,
  getCanvasViewportBounds,
  projectCanvasRenderState
} from './canvasRenderProjection.js'

const containerRect = { width: 1000, height: 800 }
const viewport = { x: 0, y: 0, zoom: 1 }

function node(id, x, y, type = 'image', data = {}) {
  return { id, type, position: { x, y }, width: 100, height: 80, data }
}

assert.deepEqual(
  getCanvasNodeBounds(node('a', 10, 20)),
  { left: 10, top: 20, right: 110, bottom: 100, width: 100, height: 80 }
)

assert.deepEqual(
  getCanvasViewportBounds({ viewport, containerRect, bufferRatio: 1 }),
  { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }
)

{
  const nodes = [node('a', 0, 0)]
  const edges = [{ id: 'e-a', source: 'a', target: 'a' }]
  const result = projectCanvasRenderState({
    nodes,
    edges,
    viewport,
    containerRect,
    threshold: 220
  })
  assert.equal(result.enabled, false)
  assert.notEqual(result.nodes, nodes, 'normal-size projections need a fresh node list so data updates reach Vue Flow')
  assert.notEqual(result.edges, edges, 'normal-size projections need a fresh edge list so updates reach Vue Flow')
  assert.deepEqual(result.nodes, nodes)
  assert.deepEqual(result.edges, edges)
}

{
  const nodes = [
    node('visible', 100, 100),
    node('far', 5000, 5000),
    node('selected-far', 6000, 6000),
    node('group-visible', 80, 80, 'group', { width: 300, height: 300 }),
    node('child-in-group', 120, 120, 'image', { groupId: 'group-visible' })
  ]
  const edges = [
    { id: 'e-visible', source: 'visible', target: 'child-in-group' },
    { id: 'e-far', source: 'far', target: 'selected-far' }
  ]
  const result = projectCanvasRenderState({
    nodes,
    edges,
    viewport,
    containerRect,
    selectedIds: new Set(['selected-far']),
    activeIds: new Set(),
    performanceMode: 'minimal',
    threshold: 3,
    bufferRatio: 1
  })
  assert.equal(result.enabled, true)
  assert.deepEqual(result.nodeIds.sort(), ['child-in-group', 'group-visible', 'selected-far', 'visible'].sort())
  assert.deepEqual(result.edgeIds.sort(), ['e-visible'].sort())
  assert.equal(result.minimapItems.length, nodes.length)
}

{
  const nodes = [node('a', 0, 0), node('b', 5000, 5000)]
  const result = projectCanvasRenderState({
    nodes,
    edges: [{ id: 'e-hidden', source: 'a', target: 'b' }],
    viewport,
    containerRect,
    selectedIds: new Set(),
    activeIds: new Set(),
    performanceMode: 'minimal',
    threshold: 1,
    bufferRatio: 1
  })
  assert.deepEqual(result.nodeIds, ['a'])
  assert.deepEqual(result.edgeIds, [])
}

{
  const nodes = Array.from({ length: 1000 }, (_, index) => node(`n-${index}`, index * 500, 0))
  const result = projectCanvasRenderState({
    nodes,
    edges: [],
    viewport,
    containerRect,
    selectedIds: new Set(),
    activeIds: new Set(['n-999']),
    performanceMode: 'minimal',
    threshold: 200,
    bufferRatio: 1
  })
  assert.equal(result.enabled, true)
  assert.ok(result.nodes.length < 20, `projection should bound rendered nodes, got ${result.nodes.length}`)
  assert.ok(result.nodeIds.includes('n-999'), 'active nodes should stay mounted even outside the viewport')
  assert.equal(result.minimapItems.length, 1000)
}

console.log('canvasRenderProjection tests passed')
