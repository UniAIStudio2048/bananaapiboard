import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTextNodeLlmMediaUploadFileName,
  collectTextNodeLlmMediaReferences,
  shouldUploadTextNodeLlmMediaUrl
} from './textNodeLlmMedia.js'

test('text node LLM media passes remote and backend URLs directly to the backend', () => {
  const result = collectTextNodeLlmMediaReferences({
    videoUrls: [
      'https://files.nananobanana.cn/default-tenant-001/videos/clip.mp4',
      '/api/videos/file/local-clip.mp4'
    ],
    imageUrls: [
      'https://cdn.example.com/ref.png',
      '/storage/default-tenant-001/images/ref.jpg',
      '/api/cos-proxy/default-tenant-001/images/cos.png'
    ]
  })

  assert.deepEqual(result.directUrls, [
    'https://files.nananobanana.cn/default-tenant-001/videos/clip.mp4',
    '/api/videos/file/local-clip.mp4',
    'https://cdn.example.com/ref.png',
    '/storage/default-tenant-001/images/ref.jpg',
    '/api/cos-proxy/default-tenant-001/images/cos.png'
  ])
  assert.deepEqual(result.uploadItems, [])
})

test('text node LLM media uploads only browser-local transient media before chat', () => {
  const result = collectTextNodeLlmMediaReferences({
    videoUrls: ['blob:https://app.local/video'],
    imageUrls: ['data:image/png;base64,abc']
  })

  assert.deepEqual(result.directUrls, [])
  assert.deepEqual(result.uploadItems, [
    { type: 'video', url: 'blob:https://app.local/video' },
    { type: 'image', url: 'data:image/png;base64,abc' }
  ])
  assert.equal(shouldUploadTextNodeLlmMediaUrl('blob:https://app.local/video'), true)
  assert.equal(shouldUploadTextNodeLlmMediaUrl('data:image/png;base64,abc'), true)
  assert.equal(shouldUploadTextNodeLlmMediaUrl('/api/images/file/ref.jpg'), false)
  assert.equal(shouldUploadTextNodeLlmMediaUrl('https://cdn.example.com/ref.jpg'), false)
})

test('text node LLM media upload filenames match media type and mime', () => {
  assert.equal(
    buildTextNodeLlmMediaUploadFileName({ type: 'image', mimeType: 'image/webp', now: 1000 }),
    'text_node_reference_1000.webp'
  )
  assert.equal(
    buildTextNodeLlmMediaUploadFileName({ type: 'video', mimeType: 'video/quicktime', now: 1000 }),
    'text_node_reference_1000.mov'
  )
})
