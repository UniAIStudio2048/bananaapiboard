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
  assert.equal(next.x, first[0].x)
  for (const node of nodes) assert.ok(next.y >= node.position.y + 600 + 60)
})
test('large groups and measured nodes are respected, including group padding', () => {
  const nodes = [parent, { type: 'group', position: { x: 600, y: 100 }, data: { width: 1800, height: 1200 } }, { position: { x: 2500, y: 200 }, dimensions: { width: 700, height: 800 } }]
  const [point] = getScriptResultPositions(parent, nodes, 4)
  assert.ok(point.y >= 1300 + 60)
})
test('unrelated nodes outside the batch vertical span do not push it away', () => {
  const baseline = getScriptResultPositions(parent, [parent], 1)
  assert.deepEqual(getScriptResultPositions(parent, [parent, { position: { x: 700, y: -3000 }, data: {} }], 1), baseline)
})
test('asset grids stay entirely left of the script, including repeated batches', () => {
  const first = getScriptResultPositions(parent, [parent], 5, 'asset')
  for (const point of first) assert.ok(point.x + 400 + 90 < parent.position.x)
  const nodes = first.map(position => ({ position, data: { width: 400, height: 600 } }))
  nodes.push({ type: 'group', position: { x: first[0].x - 60, y: first[0].y - 90 }, data: { width: 1960, height: 1430 } })
  const next = getScriptResultPositions(parent, [parent, ...nodes], 2, 'asset')
  assert.ok(next[0].y >= first[4].y + 600 + 60)
  for (const point of next) assert.ok(point.x + 400 + 90 < parent.position.x)
})
test('a left-side obstruction cannot push an asset onto the right side', () => {
  const blocker = { position: { x: -2400, y: 0 }, data: { width: 2400, height: 1500 } }
  const [point] = getScriptResultPositions(parent, [parent, blocker], 1, 'asset')
  assert.ok(point.x + 400 + 90 < parent.position.x)
  assert.ok(point.y > blocker.position.y + 1500)
})
test('storyboard images and videos stay on the right of a resized script node', () => {
  const largeParent = { ...parent, dimensions: { width: 800, height: 600 } }
  for (const kind of ['image', 'video']) {
    const points = getScriptResultPositions(largeParent, [largeParent], 5, kind)
    for (const point of points) assert.ok(point.x > largeParent.position.x + 800 + 90)
  }
})
