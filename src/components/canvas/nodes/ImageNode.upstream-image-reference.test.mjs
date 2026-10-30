import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')

test('image reference lookup is defined only once', () => {
  assert.equal([...source.matchAll(/function findUpstreamNodeByImageUrl\(url\)/g)].length, 1)
})

test('image reference mentions resolve connected images without crashing', () => {
  const match = source.match(/function findUpstreamNodeByImageUrl\(url\)\s*\{[\s\S]*?\n\}/)
  assert.ok(match, 'ImageNode must define its upstream image lookup')
  const uploaded = { id: 'source', type: 'image', data: { nodeRole: 'source', sourceImages: ['uploaded'] } }
  const generated = { id: 'generated', type: 'image', data: { output: { urls: ['generated', 'extra'] } } }
  const single = { id: 'single', type: 'image-input', data: { output: { url: 'single' } } }
  const video = { id: 'video', type: 'video', data: { output: { url: 'video-frame' } } }
  const disconnected = { id: 'disconnected', type: 'image', data: { sourceImages: ['disconnected'] } }
  const nodes = [uploaded, generated, single, video, disconnected]
  const context = {
    props: { id: 'target' }, VIDEO_NODE_TYPES: ['video'],
    canvasStore: {
      nodesById: new Map(nodes.map(node => [node.id, node])),
      edgesByTarget: new Map([['target', [uploaded, generated, single, video].map(node => ({ source: node.id, target: 'target' }))]])
    }
  }
  const find = vm.runInNewContext(`(${match[0]})`, context)
  assert.equal(find('uploaded'), uploaded)
  assert.equal(find('generated'), generated)
  assert.equal(find('extra'), generated)
  assert.equal(find('single'), single)
  assert.equal(find('video-frame'), null)
  assert.equal(find('disconnected'), null)
  assert.equal(find('missing'), null)
})
