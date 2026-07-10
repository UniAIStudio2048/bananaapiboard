import assert from 'node:assert/strict'
import { File } from 'node:buffer'

import { createCanvasDirectUploader } from './canvasDirectUpload.js'
import { createMemoryCanvasUploadCheckpointStore } from './canvasUploadCheckpoint.js'

function directResponse(etag, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(etag ? { ETag: etag } : {})
  }
}

{
  const calls = []
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', {
    type: 'image/png',
    lastModified: 1
  })
  const apiFetch = async (url, options) => {
    calls.push({ kind: 'api', url, ...options })
    if (url.endsWith('/presign')) {
      return {
        success: true,
        upload: {
          id: 'up-1', mode: 'single', status: 'created', method: 'PUT',
          upload_url: 'https://bucket.cos.example/canvas/a.png?signature',
          headers: { 'Content-Type': 'image/png' }
        }
      }
    }
    return {
      success: true,
      upload: { id: 'up-1', status: 'completed' },
      asset: { id: 'asset-1', url: 'https://cdn.example.com/canvas/a.png' }
    }
  }
  const directFetch = async (url, options) => {
    calls.push({ kind: 'direct', url, ...options })
    return directResponse('"etag-a"')
  }
  const uploader = createCanvasDirectUploader({
    apiFetch,
    directFetch,
    checkpointStore: createMemoryCanvasUploadCheckpointStore()
  })
  const result = await uploader.upload(file, { mediaType: 'image' })

  assert.deepEqual(calls.map(call => call.url), [
    '/api/canvas/uploads/presign',
    'https://bucket.cos.example/canvas/a.png?signature',
    '/api/canvas/uploads/up-1/complete'
  ])
  assert.equal(calls[0].body.filename, 'a.png')
  assert.equal(calls[1].body, file)
  assert.equal(calls[2].body.etag, '"etag-a"')
  assert.equal(result.status, 'completed')
  assert.equal(result.url, 'https://cdn.example.com/canvas/a.png')
}

{
  const file = new File([new Uint8Array([1])], 'bad.png', { type: 'image/png' })
  const uploader = createCanvasDirectUploader({
    checkpointStore: createMemoryCanvasUploadCheckpointStore(),
    apiFetch: async url => url.endsWith('/presign')
      ? {
          upload: {
            id: 'up-bad', mode: 'single', upload_url: 'https://cos.example/bad',
            headers: { 'Content-Type': 'image/png' }
          }
        }
      : { success: true, upload: { id: 'up-bad', status: 'uploading' }, asset: { url: 'https://cdn.example/bad' } },
    directFetch: async () => directResponse('"etag"')
  })
  await assert.rejects(
    uploader.upload(file, { mediaType: 'image' }),
    /canvas_upload_not_completed/
  )
}

{
  const partSize = 8 * 1024 * 1024
  const fileSize = 50 * 1024 * 1024
  const slices = []
  const file = {
    name: 'large.mp4',
    type: 'video/mp4',
    size: fileSize,
    lastModified: 2,
    slice(start, end) {
      const part = { start, end, size: end - start }
      slices.push(part)
      return part
    }
  }
  const apiCalls = []
  const completionBodies = []
  const directAttempts = new Map()
  let active = 0
  let maxActive = 0
  const checkpointStore = createMemoryCanvasUploadCheckpointStore()
  const apiFetch = async (url, options) => {
    apiCalls.push({ url, ...options })
    if (url.endsWith('/presign') && !url.includes('/parts/')) {
      return {
        upload: { id: 'up-large', mode: 'multipart', status: 'created', part_size: partSize }
      }
    }
    if (url.endsWith('/parts/presign')) {
      return {
        upload: { id: 'up-large', mode: 'multipart', status: 'uploading' },
        parts: options.body.part_numbers.map(partNumber => ({
          part_number: partNumber,
          upload_url: `https://cos.example/part-${partNumber}`,
          headers: {}
        }))
      }
    }
    completionBodies.push(options.body)
    return {
      upload: { id: 'up-large', status: 'completed' },
      asset: { id: 'asset-large', url: 'https://cdn.example.com/canvas/large.mp4' }
    }
  }
  const directFetch = async url => {
    const partNumber = Number(url.match(/part-(\d+)/)[1])
    const attempt = (directAttempts.get(partNumber) || 0) + 1
    directAttempts.set(partNumber, attempt)
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setImmediate(resolve))
    active--
    if (partNumber === 2 && attempt === 1) return directResponse(null, 403)
    return directResponse(`"e${partNumber}"`)
  }
  const uploader = createCanvasDirectUploader({
    apiFetch,
    directFetch,
    checkpointStore,
    partSize,
    concurrency: 3
  })
  const result = await uploader.upload(file, { mediaType: 'video' })

  assert.equal(result.status, 'completed')
  assert.equal(slices.length, 8)
  assert.equal(slices.filter(part => part.size === partSize).length, 7)
  assert.equal(slices.filter(part => part.size === 2 * 1024 * 1024).length, 1)
  assert.ok(maxActive <= 3)
  assert.equal(directAttempts.get(1), 1)
  assert.equal(directAttempts.get(2), 2)
  assert.deepEqual(
    apiCalls.filter(call => call.url.endsWith('/parts/presign')).map(call => call.body.part_numbers),
    [[1, 2, 3, 4, 5, 6, 7], [2]]
  )
  assert.deepEqual(completionBodies[0].parts.map(part => part.part_number), [1, 2, 3, 4, 5, 6, 7])
  assert.equal(await checkpointStore.get('large.mp4:52428800:video/mp4:2'), null)
}

{
  const partSize = 8
  const file = {
    name: 'resume.mp4', type: 'video/mp4', size: 16, lastModified: 3,
    slice(start, end) { return { start, end, size: end - start } }
  }
  const fingerprint = 'resume.mp4:16:video/mp4:3'
  const checkpointStore = createMemoryCanvasUploadCheckpointStore()
  await checkpointStore.set(fingerprint, {
    fingerprint,
    uploadId: 'up-resume',
    completedParts: [{ partNumber: 1, etag: '"stale"', size: 8 }]
  })
  const directParts = []
  const apiCalls = []
  const uploader = createCanvasDirectUploader({
    checkpointStore,
    partSize,
    concurrency: 3,
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ url, ...options })
      if (url === '/api/canvas/uploads/up-resume') {
        return {
          upload: { id: 'up-resume', mode: 'multipart', status: 'uploading' },
          parts: [{ part_number: 1, etag: '"server-e1"', size: 8 }]
        }
      }
      if (url.endsWith('/parts/presign')) {
        return { parts: [{ part_number: 2, upload_url: 'https://cos.example/part-2', headers: {} }] }
      }
      return {
        upload: { id: 'up-resume', status: 'completed' },
        asset: { id: 'asset-resume', url: 'https://cdn.example.com/canvas/resume.mp4' }
      }
    },
    directFetch: async url => {
      directParts.push(url)
      return directResponse('"server-e2"')
    }
  })
  await uploader.upload(file, { mediaType: 'video' })
  assert.deepEqual(directParts, ['https://cos.example/part-2'])
  assert.equal(apiCalls[0].url, '/api/canvas/uploads/up-resume')
  assert.deepEqual(apiCalls.at(-1).body.parts, [
    { part_number: 1, etag: '"server-e1"' },
    { part_number: 2, etag: '"server-e2"' }
  ])
}

{
  const controller = new AbortController()
  const file = {
    name: 'abort.mp4', type: 'video/mp4', size: 16, lastModified: 4,
    slice(start, end) { return { start, end, size: end - start } }
  }
  const apiCalls = []
  const uploader = createCanvasDirectUploader({
    checkpointStore: createMemoryCanvasUploadCheckpointStore(),
    partSize: 8,
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ url, ...options })
      if (url.endsWith('/parts/presign')) {
        return { parts: options.body.part_numbers.map(number => ({ part_number: number, upload_url: `https://cos.example/${number}`, headers: {} })) }
      }
      if (url.endsWith('/presign')) return { upload: { id: 'up-abort', mode: 'multipart', part_size: 8 } }
      return { success: true, upload: { id: 'up-abort', status: 'aborted' } }
    },
    directFetch: async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }
  })
  await assert.rejects(uploader.upload(file, { mediaType: 'video', signal: controller.signal }), /aborted/i)
  assert.ok(apiCalls.some(call => call.url === '/api/canvas/uploads/up-abort' && call.method === 'DELETE'))
}

console.log('canvasDirectUpload tests passed')
