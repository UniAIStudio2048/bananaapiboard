import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const referenceSection = source.slice(
  source.indexOf('function findUpstreamNodeByVideoUrl'),
  source.indexOf('function updatePromptMentionBindings')
)
const readReferenceMedia = new Function(
  'canvasStore', 'props', 'VIDEO_NODE_TYPES', 'referenceImages', 'referenceVideos',
  'computed', 'ref', 'getMediaMentionKey',
  `${referenceSection}\nreturn referenceMediaList.value`
)

function getReferences(nodes, images, videos = []) {
  return readReferenceMedia(
    {
      nodesById: new Map(nodes.map(node => [node.id, node])),
      edgesByTarget: new Map([['target', [{ source: 'source' }]]])
    },
    { id: 'target' }, ['video'], { value: images }, { value: videos },
    fn => ({ get value() { return fn() } }), value => ({ value }),
    ({ type, url }) => `${type}:${url}`
  )
}

test('connected uploaded and generated images resolve to a stable source node without breaking node setup', () => {
  for (const data of [
    { sourceImages: ['reference.png'] },
    { output: { url: 'reference.png' } },
    { output: { urls: ['reference.png'] } }
  ]) {
    const media = getReferences([{ id: 'source', type: 'image', data }], ['reference.png'])
    assert.equal(media[0].key, 'image:node:source:1')
    assert.equal(media[0].url, 'reference.png')
    assert.equal(media[0].label, '图片1')
  }
})

test('unconnected images do not claim another node as their reference source', () => {
  const media = getReferences([
    { id: 'source', type: 'image', data: { sourceImages: ['different.png'] } },
    { id: 'unconnected', type: 'image', data: { sourceImages: ['reference.png'] } }
  ], ['reference.png'])
  assert.equal(media[0].key, 'image:reference.png')
})

test('video references still resolve their source and thumbnail', () => {
  const media = getReferences([
    { id: 'source', type: 'video', data: { output: { url: 'reference.mp4' }, thumbnailUrl: 'poster.png' } }
  ], [], ['reference.mp4'])
  assert.equal(media[0].key, 'video:node:source:1')
  assert.equal(media[0].thumbnailUrl, 'poster.png')
})
