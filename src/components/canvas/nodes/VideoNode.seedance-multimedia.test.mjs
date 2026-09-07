import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parse as parseVue } from '@vue/compiler-sfc'
import { parse } from '@babel/parser'
import { getSeedanceMediaType } from '../../../utils/seedanceMedia.js'
import { getSeedanceQuickAsset, getSeedanceQuickAssetStatus } from '../../../utils/seedanceQuickAsset.js'
import { applyOrderedMediaReplacements } from '../../../utils/videoReferenceOrdering.js'
import { normalizeAssetReviewStatus } from '../../../utils/assetReviewStatus.js'

const source = parseVue(readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')).descriptor.scriptSetup.content
const names = new Set(['IMAGE_NODE_TYPES', 'VIDEO_NODE_TYPES', 'AUDIO_NODE_TYPES', 'referenceImages', 'referenceVideos', 'referenceAudios', 'getSeedanceCharacterPreviewUrl', 'collectNodeMediaUrls', 'collectSeedanceMediaReplacements', 'getUpstreamData'])
const statements = parse(source, { sourceType: 'module' }).program.body.filter(statement => names.has(statement.id?.name) || statement.declarations?.some(declaration => names.has(declaration.id?.name)))
const code = statements.map(statement => source.slice(statement.start, statement.end)).join('\n')

function harness(nodes, data = {}) {
  const canvasStore = { nodes, edges: nodes.map(node => ({ source: node.id, target: 'target' })) }
  const computed = callback => ({ get value() { return callback() } })
  return new Function('canvasStore', 'props', 'computed', 'getSeedanceMediaType', 'getSeedanceQuickAsset', 'getSeedanceQuickAssetStatus', 'normalizeAssetReviewStatus', 'isBrowserRenderableUrl', 'console', `const isHeygenModelSelected = { value: false }; ${code}; return { referenceImages, referenceVideos, referenceAudios, collectSeedanceMediaReplacements, getUpstreamData }`)(
    canvasStore, { id: 'target', data }, computed, getSeedanceMediaType, getSeedanceQuickAsset, getSeedanceQuickAssetStatus, normalizeAssetReviewStatus, url => /^https?:\/\//.test(url || ''), { log() {} }
  )
}

function character(id, assetType, assetUrl) {
  return { id, type: 'seedance-character', data: { assetId: id, assetType, assetUrl, thumbnailUrl: 'https://cdn.example/poster.jpg', assetUri: `asset://${id}`, status: 'Active', output: { url: `asset://${id}` } } }
}

test('mixed roles flow into three separate reference lists and preserve requested order', () => {
  const state = harness([
    character('image1', 'Image', 'https://cdn.example/image.png'),
    character('video1', 'Video', 'https://cdn.example/video1.mp4'),
    character('audio1', 'Audio', 'https://cdn.example/audio.wav'),
    character('video2', 'Video', 'https://cdn.example/video2.mp4')
  ], { videoOrder: ['https://cdn.example/video2.mp4', 'https://cdn.example/video1.mp4'] })
  assert.equal(state.referenceImages.value.length, 1)
  assert.deepEqual(state.referenceVideos.value, ['https://cdn.example/video2.mp4', 'https://cdn.example/video1.mp4'])
  assert.deepEqual(state.referenceAudios.value, ['https://cdn.example/audio.wav'])
  const videoReplacements = state.collectSeedanceMediaReplacements('target', { mediaType: 'video' })
  assert.deepEqual(applyOrderedMediaReplacements(state.referenceVideos.value, videoReplacements), ['asset://video2', 'asset://video1'])
  const upstream = state.getUpstreamData()
  assert.equal(upstream.images.length, 1)
  assert.equal(upstream.videos.length, 2)
  assert.equal(upstream.audios.length, 1)
  assert.deepEqual(upstream.characterAssetUris, ['asset://image1'])
})

test('quick video/audio reviews replace only their source and never enter image references', () => {
  const nodes = ['Video', 'Audio'].map(assetType => {
    const id = assetType.toLowerCase()
    const sourceUrl = `https://cdn.example/${id}`
    return { id, type: id, data: { output: { url: sourceUrl }, seedanceQuickAsset: { assetId: id, assetUri: `asset://${id}`, assetType, sourceUrl, status: 'Active' } } }
  })
  const state = harness(nodes)
  assert.deepEqual(state.referenceImages.value, [])
  assert.deepEqual(state.collectSeedanceMediaReplacements('target'), [])
  assert.equal(state.collectSeedanceMediaReplacements('target', { mediaType: 'video' })[0].replacementUrl, 'asset://video')
  nodes[0].data.output.url = 'https://cdn.example/replaced'
  assert.deepEqual(state.collectSeedanceMediaReplacements('target', { mediaType: 'video' }), [])
  nodes[1].data.seedanceQuickAsset.expiresAt = '2000-01-01'
  assert.deepEqual(state.collectSeedanceMediaReplacements('target', { mediaType: 'audio' }), [])
})

test('processing and failed roles cannot be injected as reviewed assets', () => {
  for (const status of ['Processing', 'Failed']) {
    const node = character('video1', 'Video', 'https://cdn.example/video.mp4')
    node.data.status = status
    const state = harness([node])
    assert.deepEqual(state.collectSeedanceMediaReplacements('target', { mediaType: 'video' }), [])
  }
})

test('provider success status variants remain usable as reviewed role assets', () => {
  for (const status of ['active', 'approved', 'succeeded', 'completed']) {
    const node = character('video1', 'Video', 'https://cdn.example/video.mp4')
    node.data.status = status
    assert.equal(harness([node]).collectSeedanceMediaReplacements('target', { mediaType: 'video' }).length, 1)
  }
})
