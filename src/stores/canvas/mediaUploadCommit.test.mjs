import assert from 'node:assert/strict'

import { buildMediaUploadCommit } from './mediaUploadCommit.js'

const uploaded = {
  url: 'https://cdn.example.com/canvas/a.png',
  status: 'completed',
  uploadId: 'up-1',
  assetId: 'asset-1'
}

{
  const nodes = [
    {
      id: 'source',
      type: 'image-input',
      data: {
        sourceImages: ['blob:old', 'https://existing/image.png'],
        output: { type: 'image', url: 'blob:old', urls: ['blob:old'] },
        isUploading: true
      }
    },
    {
      id: 'target',
      type: 'image',
      data: {
        imageOrder: ['blob:old'],
        referenceImages: ['blob:old'],
        inheritedData: { type: 'image', urls: ['blob:old'] }
      }
    },
    {
      id: 'story',
      type: 'storyboard',
      data: { images: [null, null, 'blob:old'] }
    }
  ]
  const edges = [
    { id: 'e1', source: 'source', target: 'target', targetHandle: 'input' },
    { id: 'e2', source: 'source', target: 'story', targetHandle: 'input-2' }
  ]
  const result = buildMediaUploadCommit({
    nodes,
    edges,
    nodeId: 'source',
    blobUrl: 'blob:old',
    uploaded,
    mediaType: 'image'
  })

  assert.deepEqual(result.sourcePatch.sourceImages, [uploaded.url, 'https://existing/image.png'])
  assert.equal(result.sourcePatch.output.url, uploaded.url)
  assert.deepEqual(result.sourcePatch.output.urls, [uploaded.url])
  assert.deepEqual({
    isUploading: result.sourcePatch.isUploading,
    uploadFailed: result.sourcePatch.uploadFailed,
    uploadError: result.sourcePatch.uploadError,
    uploadStatus: result.sourcePatch.uploadStatus,
    uploadId: result.sourcePatch.uploadId,
    assetId: result.sourcePatch.assetId
  }, {
    isUploading: false,
    uploadFailed: false,
    uploadError: null,
    uploadStatus: 'completed',
    uploadId: 'up-1',
    assetId: 'asset-1'
  })

  const targetPatch = result.downstreamPatches.find(item => item.nodeId === 'target').patch
  assert.deepEqual(targetPatch.imageOrder, [uploaded.url])
  assert.deepEqual(targetPatch.referenceImages, [uploaded.url])
  assert.deepEqual(targetPatch.inheritedData.urls, [uploaded.url])
  assert.deepEqual(
    result.downstreamPatches.find(item => item.nodeId === 'story').patch.images,
    [null, null, uploaded.url]
  )
  assert.equal(edges[1].targetHandle, 'input-2')
}

{
  const result = buildMediaUploadCommit({
    nodes: [{
      id: 'video-source',
      type: 'video',
      data: {
        sourceVideo: 'blob:video',
        output: { type: 'video', url: 'blob:video' }
      }
    }, {
      id: 'video-target',
      type: 'video',
      data: {
        videoOrder: ['blob:video'],
        inheritedData: { type: 'video', url: 'blob:video' }
      }
    }],
    edges: [{ source: 'video-source', target: 'video-target' }],
    nodeId: 'video-source',
    blobUrl: 'blob:video',
    uploaded: { ...uploaded, url: 'https://cdn.example.com/canvas/v.mp4' },
    mediaType: 'video'
  })
  assert.equal(result.sourcePatch.sourceVideo, 'https://cdn.example.com/canvas/v.mp4')
  assert.equal(result.sourcePatch.output.url, 'https://cdn.example.com/canvas/v.mp4')
  assert.deepEqual(result.downstreamPatches[0].patch.videoOrder, ['https://cdn.example.com/canvas/v.mp4'])
  assert.equal(result.downstreamPatches[0].patch.inheritedData.url, 'https://cdn.example.com/canvas/v.mp4')
}

{
  const result = buildMediaUploadCommit({
    nodes: [{
      id: 'audio-source',
      type: 'audio-input',
      data: {
        audioUrl: 'blob:audio',
        output: { type: 'audio', url: 'blob:audio' }
      }
    }, {
      id: 'audio-target',
      type: 'text',
      data: {
        audioOrder: ['blob:audio'],
        inheritedData: { type: 'audio', url: 'blob:audio' }
      }
    }],
    edges: [{ source: 'audio-source', target: 'audio-target' }],
    nodeId: 'audio-source',
    blobUrl: 'blob:audio',
    uploaded: { ...uploaded, url: 'https://cdn.example.com/canvas/a.mp3' },
    mediaType: 'audio'
  })
  assert.equal(result.sourcePatch.audioUrl, 'https://cdn.example.com/canvas/a.mp3')
  assert.equal(result.sourcePatch.output.url, 'https://cdn.example.com/canvas/a.mp3')
  assert.deepEqual(result.downstreamPatches[0].patch.audioOrder, ['https://cdn.example.com/canvas/a.mp3'])
}

{
  const stale = buildMediaUploadCommit({
    nodes: [{
      id: 'source',
      type: 'image-input',
      data: { sourceImages: ['blob:new'], uploadId: 'up-new', isUploading: true }
    }],
    edges: [],
    nodeId: 'source',
    blobUrl: 'blob:old',
    uploaded,
    mediaType: 'image'
  })
  assert.equal(stale.sourcePatch, null)
  assert.deepEqual(stale.downstreamPatches, [])
}

console.log('mediaUploadCommit tests passed')
