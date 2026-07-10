import assert from 'node:assert/strict'

import { findBlockingCanvasUploads } from './canvasUploadGuard.js'

const nodes = [
  { id: 'remote', type: 'image-input', data: { sourceImages: ['https://cdn.example.com/canvas/a.png'] } },
  { id: 'uploading', type: 'video', data: { output: { type: 'video', url: 'blob:video' }, isUploading: true } },
  { id: 'pending', type: 'audio-input', data: { audioUrl: 'https://cdn.example.com/canvas/a.mp3', uploadId: 'up-1', uploadStatus: 'uploading' } },
  { id: 'target', type: 'video', data: {} },
  { id: 'unrelated', type: 'image-input', data: { sourceImages: ['data:image/png;base64,AA=='] } }
]
const edges = [
  { source: 'remote', target: 'target' },
  { source: 'uploading', target: 'target' },
  { source: 'pending', target: 'uploading' }
]

const targetBlockers = findBlockingCanvasUploads(nodes, edges, 'target')
assert.deepEqual(targetBlockers.map(item => item.nodeId).sort(), ['pending', 'uploading'])
assert.ok(targetBlockers.some(item => item.reason === 'transient_media'))
assert.ok(targetBlockers.some(item => item.reason === 'upload_pending'))

const allBlockers = findBlockingCanvasUploads(nodes, edges)
assert.deepEqual(allBlockers.map(item => item.nodeId).sort(), ['pending', 'unrelated', 'uploading'])

assert.deepEqual(findBlockingCanvasUploads([
  {
    id: 'completed',
    data: {
      sourceImages: ['https://cdn.example.com/canvas/a.png'],
      uploadId: 'up-done',
      uploadStatus: 'completed',
      isUploading: false
    }
  }
], []), [])

const canonicalMediaFields = [
  'sourceImage',
  'imageUrl',
  'sourceImages',
  'images',
  'referenceImages',
  'sourceVideo',
  'videoUrl',
  'sourceVideos',
  'referenceVideos',
  'audioUrl',
  'audioData',
  'audioUrls',
  'referenceAudios',
  'output',
  'inheritedData',
  'imageOrder',
  'videoOrder',
  'audioOrder'
]

for (const [index, field] of canonicalMediaFields.entries()) {
  const transientUrl = index % 2 === 0 ? `blob:${field}` : `data:${field}`
  const value = field === 'output' || field === 'inheritedData'
    ? { nested: { url: transientUrl } }
    : field.endsWith('s') || field.endsWith('Order')
      ? [transientUrl]
      : transientUrl
  const blockers = findBlockingCanvasUploads([
    { id: `node-${field}`, data: { [field]: value } }
  ], [])

  assert.deepEqual(
    blockers,
    [{ nodeId: `node-${field}`, reason: 'transient_media' }],
    `${field} must block durable canvas operations`
  )
}

console.log('canvasUploadGuard tests passed')
