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

{
  const file = new File([new Uint8Array([1, 2, 3])], 'retry.png', { type: 'image/png' })
  const apiCalls = []
  const directCalls = []
  const uploader = createCanvasDirectUploader({
    checkpointStore: createMemoryCanvasUploadCheckpointStore(),
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ url, ...options })
      if (url.endsWith('/presign')) {
        return {
          upload: {
            id: 'up-retry', mode: 'single',
            upload_url: 'https://cos.example/canvas/retry.png?same-signature',
            headers: { 'Content-Type': 'image/png' }
          }
        }
      }
      return {
        upload: { id: 'up-retry', status: 'completed' },
        asset: { id: 'asset-retry', url: 'https://cdn.example.com/canvas/retry.png' }
      }
    },
    directFetch: async (url, options) => {
      directCalls.push({ url, ...options })
      if (directCalls.length === 1) throw new TypeError('network interrupted')
      if (directCalls.length === 2) return directResponse(null, 503)
      return directResponse('"etag-retry"')
    }
  })

  const result = await uploader.upload(file, { mediaType: 'image' })
  assert.equal(result.status, 'completed')
  assert.equal(directCalls.length, 3)
  assert.deepEqual(
    directCalls.map(call => call.url),
    Array(3).fill('https://cos.example/canvas/retry.png?same-signature')
  )
  assert.ok(directCalls.every(call => call.body === file))
  assert.equal(apiCalls.filter(call => call.url.endsWith('/presign')).length, 1)
  assert.equal(apiCalls.at(-1).body.etag, '"etag-retry"')
  assert.ok(apiCalls.every(call => !(call.body instanceof Blob)))
}

{
  const file = new File([new Uint8Array([1])], 'limited.png', { type: 'image/png' })
  let directAttempts = 0
  const uploader = createCanvasDirectUploader({
    checkpointStore: createMemoryCanvasUploadCheckpointStore(),
    apiFetch: async url => url.endsWith('/presign')
      ? { upload: { id: 'up-limited', mode: 'single', upload_url: 'https://cos.example/limited', headers: {} } }
      : { upload: { id: 'up-limited', status: 'completed' }, asset: { url: 'https://cdn.example.com/canvas/limited.png' } },
    directFetch: async () => {
      directAttempts++
      return directResponse(null, 500)
    }
  })

  await assert.rejects(
    uploader.upload(file, { mediaType: 'image', maxRetries: 0 }),
    /canvas_upload_direct_put_failed/
  )
  assert.equal(directAttempts, 1)
}

{
  const file = new File([new Uint8Array([1])], 'capped.png', { type: 'image/png' })
  let directAttempts = 0
  const uploader = createCanvasDirectUploader({
    checkpointStore: createMemoryCanvasUploadCheckpointStore(),
    apiFetch: async url => url.endsWith('/presign')
      ? { upload: { id: 'up-capped', mode: 'single', upload_url: 'https://cos.example/capped', headers: {} } }
      : { upload: { id: 'up-capped', status: 'completed' }, asset: { url: 'https://cdn.example.com/canvas/capped.png' } },
    directFetch: async () => {
      directAttempts++
      return directResponse(null, 500)
    }
  })

  await assert.rejects(
    uploader.upload(file, { mediaType: 'image', maxRetries: 99 }),
    /canvas_upload_direct_put_failed/
  )
  assert.equal(directAttempts, 6)
}

{
  const file = new File([new Uint8Array([1])], 'conflict.png', { type: 'image/png' })
  const apiCalls = []
  let directAttempts = 0
  const uploader = createCanvasDirectUploader({
    checkpointStore: createMemoryCanvasUploadCheckpointStore(),
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ url, ...options })
      if (url.endsWith('/presign')) {
        return { upload: { id: 'up-conflict', mode: 'single', upload_url: 'https://cos.example/conflict', headers: {} } }
      }
      return {
        upload: { id: 'up-conflict', status: 'completed' },
        asset: { id: 'asset-conflict', url: 'https://cdn.example.com/canvas/conflict.png' }
      }
    },
    directFetch: async () => {
      directAttempts++
      return directAttempts === 1 ? directResponse(null, 500) : directResponse(null, 409)
    }
  })

  const result = await uploader.upload(file, { mediaType: 'image' })
  assert.equal(result.status, 'completed')
  assert.equal(directAttempts, 2)
  assert.deepEqual(apiCalls.map(call => call.url), [
    '/api/canvas/uploads/presign',
    '/api/canvas/uploads/up-conflict/complete'
  ])
  assert.deepEqual(apiCalls.at(-1).body, {})
}

{
  const controller = new AbortController()
  const file = new File([new Uint8Array([1])], 'abort-single.png', { type: 'image/png' })
  const apiCalls = []
  let directAttempts = 0
  const uploader = createCanvasDirectUploader({
    checkpointStore: createMemoryCanvasUploadCheckpointStore(),
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ url, ...options })
      if (url.endsWith('/presign')) {
        return { upload: { id: 'up-abort-single', mode: 'single', upload_url: 'https://cos.example/abort-single', headers: {} } }
      }
      return { success: true, upload: { id: 'up-abort-single', status: 'aborted' } }
    },
    directFetch: async () => {
      directAttempts++
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    }
  })

  await assert.rejects(
    uploader.upload(file, { mediaType: 'image', signal: controller.signal }),
    /aborted/i
  )
  assert.equal(directAttempts, 1)
  assert.equal(apiCalls.filter(call => call.method === 'DELETE').length, 1)
}

{
  const file = new File([new Uint8Array([1])], 'completed.png', { type: 'image/png', lastModified: 10 })
  const fingerprint = 'completed.png:1:image/png:10'
  const checkpointStore = createMemoryCanvasUploadCheckpointStore()
  await checkpointStore.set(fingerprint, { uploadId: 'up-completed', mode: 'single', completedParts: [] })
  const apiCalls = []
  const uploader = createCanvasDirectUploader({
    checkpointStore,
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ url, ...options })
      if (url === '/api/canvas/uploads/up-completed' && options.method === 'GET') {
        return { upload: { id: 'up-completed', mode: 'single', status: 'completed' }, parts: [] }
      }
      return {
        upload: { id: 'up-completed', status: 'completed' },
        asset: { id: 'asset-completed', url: 'https://cdn.example.com/canvas/completed.png' }
      }
    },
    directFetch: async () => { throw new Error('completed recovery must not PUT') }
  })

  const result = await uploader.upload(file, { mediaType: 'image' })
  assert.equal(result.url, 'https://cdn.example.com/canvas/completed.png')
  assert.deepEqual(apiCalls.map(call => call.url), [
    '/api/canvas/uploads/up-completed',
    '/api/canvas/uploads/up-completed/complete'
  ])
  assert.equal(await checkpointStore.get(fingerprint), null)
}

{
  const file = {
    name: 'completing.mp4', type: 'video/mp4', size: 16, lastModified: 11,
    slice() { throw new Error('completing recovery must not slice or PUT') }
  }
  const fingerprint = 'completing.mp4:16:video/mp4:11'
  const checkpointStore = createMemoryCanvasUploadCheckpointStore()
  await checkpointStore.set(fingerprint, {
    uploadId: 'up-completing', mode: 'multipart',
    completedParts: [
      { partNumber: 1, etag: '"e1"', size: 8 },
      { partNumber: 2, etag: '"e2"', size: 8 }
    ]
  })
  const apiCalls = []
  const uploader = createCanvasDirectUploader({
    checkpointStore,
    partSize: 8,
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ url, ...options })
      if (url === '/api/canvas/uploads/up-completing' && options.method === 'GET') {
        return { upload: { id: 'up-completing', mode: 'multipart', status: 'completing' }, parts: [] }
      }
      return {
        upload: { id: 'up-completing', status: 'completed' },
        asset: { id: 'asset-completing', url: 'https://cdn.example.com/canvas/completing.mp4' }
      }
    },
    directFetch: async () => { throw new Error('completing recovery must not PUT') }
  })

  const result = await uploader.upload(file, { mediaType: 'video' })
  assert.equal(result.status, 'completed')
  assert.deepEqual(apiCalls.at(-1).body.parts, [
    { part_number: 1, etag: '"e1"' },
    { part_number: 2, etag: '"e2"' }
  ])
}

{
  const file = new File([new Uint8Array([1])], 'lost.png', { type: 'image/png', lastModified: 12 })
  const fingerprint = 'lost.png:1:image/png:12'
  const checkpointStore = createMemoryCanvasUploadCheckpointStore()
  let phase = 'first'
  let directAttempts = 0
  const apiCalls = []
  const uploader = createCanvasDirectUploader({
    checkpointStore,
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ phase, url, ...options })
      if (url.endsWith('/presign')) {
        return { upload: { id: 'up-lost', mode: 'single', status: 'created', upload_url: 'https://cos.example/lost', headers: {} } }
      }
      if (url === '/api/canvas/uploads/up-lost' && options.method === 'GET') {
        return { upload: { id: 'up-lost', mode: 'single', status: 'completing' }, parts: [] }
      }
      if (phase === 'first') throw new TypeError('complete response lost')
      return {
        upload: { id: 'up-lost', status: 'completed' },
        asset: { id: 'asset-lost', url: 'https://cdn.example.com/canvas/lost.png' }
      }
    },
    directFetch: async () => {
      directAttempts++
      return directResponse('"etag-lost"')
    }
  })

  await assert.rejects(uploader.upload(file, { mediaType: 'image' }), /complete response lost/)
  assert.equal((await checkpointStore.get(fingerprint))?.uploadId, 'up-lost')
  phase = 'resume'
  const result = await uploader.upload(file, { mediaType: 'image' })
  assert.equal(result.status, 'completed')
  assert.equal(directAttempts, 1)
  assert.equal(apiCalls.filter(call => call.url.endsWith('/presign')).length, 1)
}

{
  const file = new File([new Uint8Array([1])], 'not-put.png', { type: 'image/png', lastModified: 13 })
  const fingerprint = 'not-put.png:1:image/png:13'
  const checkpointStore = createMemoryCanvasUploadCheckpointStore()
  await checkpointStore.set(fingerprint, { uploadId: 'up-stale', mode: 'single', completedParts: [] })
  const apiCalls = []
  const directUrls = []
  const uploader = createCanvasDirectUploader({
    checkpointStore,
    apiFetch: async (url, options = {}) => {
      apiCalls.push({ url, ...options })
      if (url === '/api/canvas/uploads/up-stale' && options.method === 'GET') {
        return { upload: { id: 'up-stale', mode: 'single', status: 'created' }, parts: [] }
      }
      if (url === '/api/canvas/uploads/up-stale/complete') {
        return {
          ok: false,
          status: 409,
          async json() { return { success: false, error: 'canvas_upload_verification_failed' } }
        }
      }
      if (url === '/api/canvas/uploads/up-stale' && options.method === 'DELETE') {
        return { upload: { id: 'up-stale', status: 'aborted' } }
      }
      if (url.endsWith('/presign')) {
        return { upload: { id: 'up-new', mode: 'single', status: 'created', upload_url: 'https://cos.example/new', headers: {} } }
      }
      return {
        upload: { id: 'up-new', status: 'completed' },
        asset: { id: 'asset-new', url: 'https://cdn.example.com/canvas/new.png' }
      }
    },
    directFetch: async url => {
      directUrls.push(url)
      assert.equal(url, 'https://cos.example/new')
      return directResponse('"etag-new"')
    }
  })

  const result = await uploader.upload(file, { mediaType: 'image' })
  assert.equal(result.url, 'https://cdn.example.com/canvas/new.png')
  assert.deepEqual(directUrls, ['https://cos.example/new'])
  assert.ok(apiCalls.some(call => call.url === '/api/canvas/uploads/up-stale' && call.method === 'DELETE'))
  assert.equal(apiCalls.filter(call => call.url.endsWith('/presign')).length, 1)
}

console.log('canvasDirectUpload tests passed')
