import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeWorkflowForSave } from './workflowSaveSanitizer.js'

test('video caches and binary buffers never inflate the saved JSON, including nested snapshots', () => {
  const videoUrl = 'https://cdn.example.com/video.mp4'
  const rawVideo = 'A'.repeat(2 * 1024 * 1024)
  const workflow = { nodes: [{ id: 'video', type: 'video', data: {
    prompt: '保留提示词和元信息', videoUrl, videoData: rawVideo,
    output: { url: videoUrl, videoData: rawVideo, duration: 5 },
    inheritedData: { videoData: rawVideo, url: videoUrl },
    directorStudioProjects: [{ snapshot: { videoData: rawVideo, videoUrl } }],
    uploadBuffer: new Uint8Array(128 * 1024),
    file: new Blob(['video bytes'], { type: 'video/mp4' })
  } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
  const saved = sanitizeWorkflowForSave(workflow)
  assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 2048, 'only metadata and persistent URLs should be serialized')
  assert.equal(saved.nodes[0].data.videoData, undefined)
  assert.equal(saved.nodes[0].data.output.videoData, undefined)
  assert.equal(saved.nodes[0].data.uploadBuffer, undefined)
  assert.equal(saved.nodes[0].data.file, undefined)
  assert.equal(saved.nodes[0].data.output.url, videoUrl)
  assert.equal(saved.nodes[0].data.output.duration, 5)
  assert.equal(saved.nodes[0].data.prompt, '保留提示词和元信息')
  assert.equal(workflow.nodes[0].data.videoData, rawVideo, 'saving must not mutate the live canvas')
})
