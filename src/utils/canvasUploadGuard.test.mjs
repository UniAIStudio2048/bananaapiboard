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

console.log('canvasUploadGuard tests passed')
