import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvasDirectUploader } from './canvasDirectUpload.js'
import { createMemoryCanvasUploadCheckpointStore } from './canvasUploadCheckpoint.js'

function harness(proxy) {
  const calls = []
  const checkpoints = createMemoryCanvasUploadCheckpointStore()
  const uploader = createCanvasDirectUploader({
    checkpointStore: checkpoints,
    directFetch: async () => { throw new TypeError('Failed to fetch') },
    apiFetch: async (path, options) => {
      calls.push({ path, options })
      if (path.endsWith('/presign')) {
        return { upload: { id: 'proxy-upload', mode: 'single', upload_url: 'https://storage.example/test' } }
      }
      if (path.endsWith('/proxy')) return proxy()
      throw new TypeError('Completion request lost')
    }
  })
  return { uploader, calls, checkpoints }
}

for (const mediaType of ['image', 'video']) {
  test(`${mediaType}: completed proxy upload succeeds without another completion request`, async () => {
    const file = new File(['test'], `test.${mediaType === 'video' ? 'mp4' : 'png'}`, {
      type: `${mediaType}/${mediaType === 'video' ? 'mp4' : 'png'}`, lastModified: 1
    })
    const h = harness(() => ({
      success: true,
      upload: { id: 'proxy-upload', status: 'completed' },
      asset: { id: 'proxy-asset', url: 'https://cdn.example/test' }
    }))
    const progress = []
    const result = await h.uploader.upload(file, { mediaType, onProgress: p => progress.push(p) })
    assert.equal(result.url, 'https://cdn.example/test')
    assert.equal(result.status, 'completed')
    assert.equal(h.calls.some(c => c.path.endsWith('/complete')), false)
    assert.equal(h.calls.at(-1).options.body, file)
    assert.equal(h.calls.at(-1).options.rawBody, true)
    assert.equal(progress.at(-1), 1)
    assert.equal(await h.checkpoints.get(`${file.name}:${file.size}:${file.type}:1`), null)
  })
}

test('proxy failure preserves the API status and code instead of the earlier direct network error', async () => {
  const expected = Object.assign(new Error('canvas_upload_unavailable'), { code: 'canvas_upload_unavailable', status: 503 })
  const h = harness(() => { throw expected })
  await assert.rejects(h.uploader.upload(new File(['test'], 'test.png', { type: 'image/png' }), { mediaType: 'image' }), error => error === expected)
  assert.equal(h.calls.some(c => c.path.endsWith('/complete')), false)
})

test('proxy response must contain a completed upload and media URL', async () => {
  const h = harness(() => ({ success: true, upload: { id: 'proxy-upload', status: 'uploading' } }))
  await assert.rejects(h.uploader.upload(new File(['test'], 'test.png', { type: 'image/png' }), { mediaType: 'image' }), /canvas_upload_not_completed/)
  assert.equal(h.calls.some(c => c.path.endsWith('/complete')), false)
})
