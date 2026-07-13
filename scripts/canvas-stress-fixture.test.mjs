import assert from 'node:assert/strict'
import { createCanvasStressSession } from './canvas-stress-fixture.mjs'

const session = createCanvasStressSession({ nodeCount: 1000, columns: 40 })

assert.equal(session.activeTabId, 'canvas-stress-tab')
assert.equal(session.tabs.length, 1)

const [tab] = session.tabs
assert.equal(tab.nodes.length, 1000)
assert.equal(tab.edges.length, 999)
assert.deepEqual(tab.viewport, { x: 0, y: 0, zoom: 1 })

const ids = new Set(tab.nodes.map(node => node.id))
assert.equal(ids.size, 1000)
assert.equal(tab.nodes[0].type, 'text-input')
assert.equal(tab.nodes[1].type, 'image')
assert.equal(tab.nodes[2].type, 'video')
assert.equal(tab.nodes[0].position.x, 0)
assert.equal(tab.nodes[40].position.y, 360)

for (const edge of tab.edges) {
  assert.ok(ids.has(edge.source), `missing source ${edge.source}`)
  assert.ok(ids.has(edge.target), `missing target ${edge.target}`)
  assert.equal(edge.animated, false)
}

const videoNodes = tab.nodes.filter(node => node.type === 'video')
assert.ok(videoNodes.length > 0)
assert.ok(videoNodes.every(node => node.data.thumbnail_url), 'video stress nodes should use poster thumbnails')

const bigSession = createCanvasStressSession({ nodeCount: 1500 })
assert.equal(bigSession.tabs[0].nodes.length, 1500)
