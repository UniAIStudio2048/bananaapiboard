import test from 'node:test'
import assert from 'node:assert/strict'
import { getScriptResultPositions } from './scriptResultLayout.js'

const parent = { position: { x: 100, y: 200 }, data: {} }
test('first batch has a regular grid with room for media controls', () => {
  const points = getScriptResultPositions(parent, [parent], 5)
  assert.equal(points.length, 5)
  assert.equal(points[0].y, 200)
  assert.ok(points[1].x - points[0].x >= 440)
  assert.ok(points[4].y - points[0].y >= 640)
})
test('a second batch and video retries avoid all previous output nodes', () => {
  const first = getScriptResultPositions(parent, [parent], 2)
  const nodes = first.map(position => ({ position, data: { width: 400, height: 600 } }))
  const [next] = getScriptResultPositions(parent, [parent, ...nodes], 1)
  for (const node of nodes) assert.ok(next.x >= node.position.x + 400 + 60)
})
test('large groups and measured nodes are respected, including group padding', () => {
  const nodes = [parent, { type: 'group', position: { x: 600, y: 100 }, data: { width: 1800, height: 1200 } }, { position: { x: 2500, y: 200 }, dimensions: { width: 700, height: 800 } }]
  const [point] = getScriptResultPositions(parent, nodes, 4)
  assert.ok(point.x >= 3200 + 60)
})
test('unrelated nodes outside the batch vertical span do not push it away', () => {
  const baseline = getScriptResultPositions(parent, [parent], 1)
  assert.deepEqual(getScriptResultPositions(parent, [parent, { position: { x: 700, y: -3000 }, data: {} }], 1), baseline)
})
