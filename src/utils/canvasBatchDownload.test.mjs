import test from 'node:test'
import assert from 'node:assert/strict'
import { getSelectedMediaNodeIds } from './canvasBatchDownload.js'

test('batch download keeps selected media nodes in selection order and skips non-media nodes', () => {
  const nodes = [
    { id: 'image', type: 'image', data: { imageUrl: '/image.png' } },
    { id: 'text', type: 'text-input', data: { text: 'prompt' } },
    { id: 'video', type: 'video', data: { videoUrl: '/video.mp4' } },
    { id: 'empty', type: 'audio', data: {} },
    { id: 'audio', type: 'audio', data: { audioUrl: '/audio.mp3' } }
  ]

  assert.deepEqual(
    getSelectedMediaNodeIds(nodes, ['video', 'text', 'image', 'missing', 'empty', 'audio', 'image'], 'text'),
    ['video', 'image', 'audio']
  )
  assert.deepEqual(getSelectedMediaNodeIds(nodes, [], 'image'), ['image'])
  assert.deepEqual(getSelectedMediaNodeIds(nodes, [], 'text'), [])
})
