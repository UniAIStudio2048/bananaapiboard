import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./PublishWorkDialog.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
const ast = parse(script, { sourceType: 'module' })
const ref = value => ({ value })
const image = name => new File(['image'], name, { type: 'image/png' })

function harness({ upload, publish } = {}) {
  const uploads = [], published = [], emitted = []
  const context = {
    SUPPORTED_MEDIA_TYPES: ['image', 'video'], AbortController, FormData, setTimeout, clearTimeout,
    localStorage: { getItem: () => 'test-token' }, getApiUrl: path => path, getTenantHeaders: () => ({}),
    // 模拟媒体大请求被网关拒绝；直传控制请求不经过这些旧入口。
    uploadImages: async () => { throw new Error('upload_failed') },
    fetch: async () => ({ ok: false, status: 413, json: async () => ({ error: 'upload_failed' }) }),
    uploadCanvasFile: async (file, mediaType, options) => {
      uploads.push({ file, mediaType, options })
      if (upload) return upload(file, mediaType, options, uploads.length)
      options.onProgress?.(0.5)
      options.onProgress?.(1)
      return { url: `https://cdn.example.com/${file.name}`, status: 'completed' }
    },
    publishWork: async payload => {
      published.push(payload)
      return publish ? publish(payload) : { success: true }
    },
    emit: (...args) => emitted.push(args),
    props: { initialCoverUrl: 'https://cdn.example.com/existing.png', initialMediaUrl: 'https://cdn.example.com/existing.mp4', initialMediaType: 'video', workflowId: 'wf-1' },
    title: ref('测试作品'), description: ref(''), coverFile: ref(null), coverPreview: ref('existing-cover'),
    workFile: ref(null), workPreview: ref('existing-media'), workFiles: ref([]),
    selectedWorkflowId: ref('wf-1'), linkProject: ref(false), selectedProjectId: ref(''),
    selectedTags: ref([1]), selectedCategory: ref(''), orientation: ref('landscape'),
    shareMode: ref('free'), isAnonymous: ref(true), price: ref(0), uploadType: ref('both'),
    error: ref(''), loading: ref(false), uploadProgress: ref(0)
  }
  for (const name of ['inferMediaTypeFromFile', 'inferMediaTypeFromUrl', 'normalizeMediaType', 'getMediaRequiredMessage', 'close', 'uploadWorkMedia', 'handlePublish']) {
    const node = ast.program.body.find(item => item.type === 'FunctionDeclaration' && item.id.name === name)
    context[name] = runInNewContext(`(${script.slice(node.start, node.end)})`, context)
  }
  return { context, uploads, published, emitted }
}

test('cover upload uses the current uploader before publishing with existing media', async () => {
  const h = harness()
  h.context.coverFile.value = image('cover.png')
  await h.context.handlePublish()
  assert.equal(h.context.error.value, '')
  assert.equal(h.uploads.length, 1)
  assert.equal(h.uploads[0].mediaType, 'image')
  assert.equal(h.uploads[0].options.spaceType, 'personal')
  assert.equal(h.published[0].cover_url, 'https://cdn.example.com/cover.png')
  assert.equal(h.published[0].media_url, h.context.props.initialMediaUrl)
  assert.equal(h.published[0].is_anonymous, true)
})

test('multiple work images and cover all use verified upload URLs in their original order', async () => {
  const h = harness()
  h.context.workFiles.value = [image('first.png'), image('second.png')]
  h.context.coverFile.value = image('cover.png')
  await h.context.handlePublish()
  assert.equal(h.context.error.value, '')
  assert.deepEqual(h.uploads.map(item => item.file.name), ['first.png', 'second.png', 'cover.png'])
  assert.deepEqual(JSON.parse(h.published[0].media_url), ['https://cdn.example.com/first.png', 'https://cdn.example.com/second.png'])
  assert.equal(h.published[0].media_type, 'image')
})

test('large video uses the existing uploader and converts fractional progress to percent', async () => {
  const h = harness()
  const file = { name: 'large.mp4', type: 'video/mp4', size: 200 * 1024 * 1024 }
  const progress = []
  const urls = await h.context.uploadWorkMedia(file, { onProgress: value => progress.push(value.percent) })
  assert.equal(urls[0], 'https://cdn.example.com/large.mp4')
  assert.equal(h.uploads[0].file, file)
  assert.equal(h.uploads[0].mediaType, 'video')
  assert.deepEqual(progress, [50, 100])
})

test('an upload failure prevents publication and preserves files for a successful retry', async () => {
  let fail = true
  const h = harness({ upload: async file => {
    if (fail) throw Object.assign(new Error('canvas_upload_unavailable'), { code: 'canvas_upload_unavailable', status: 503 })
    return { url: `https://cdn.example.com/${file.name}` }
  } })
  const files = [image('first.png'), image('second.png')]
  h.context.workFiles.value = files
  await h.context.handlePublish()
  assert.equal(h.published.length, 0)
  assert.match(h.context.error.value, /上传服务暂不可用/)
  assert.equal(h.context.workFiles.value, files)
  assert.equal(h.context.loading.value, false)
  fail = false
  await h.context.handlePublish()
  assert.equal(h.context.error.value, '')
  assert.equal(h.published.length, 1)
})

test('a missing URL from any image stops publication instead of publishing a partial gallery', async () => {
  const h = harness({ upload: async (file, _, __, count) => count === 2 ? {} : { url: `https://cdn.example.com/${file.name}` } })
  h.context.workFiles.value = [image('first.png'), image('second.png')]
  await h.context.handlePublish()
  assert.equal(h.published.length, 0)
  assert.match(h.context.error.value, /上传/)
})

for (const [code, status, expected] of [
  ['canvas_upload_unauthorized', 401, /登录已失效/],
  ['forbidden', 403, /没有权限/],
  ['canvas_upload_invalid_file', 400, /文件格式或大小/],
  ['canvas_upload_verification_failed', 409, /文件校验失败/],
  ['canvas_upload_direct_put_failed', 500, /上传失败/]
]) {
  test(`upload error ${code} shows a readable message`, async () => {
    const h = harness({ upload: async () => { throw Object.assign(new Error(code), { code, status }) } })
    await assert.rejects(h.context.uploadWorkMedia(image('cover.png')), expected)
  })
}

test('upload timeout aborts the existing uploader and reports a readable timeout', async () => {
  const h = harness({ upload: async (_, __, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  }) })
  await assert.rejects(h.context.uploadWorkMedia(image('slow.png'), { timeout: 5 }), /上传超时/)
  assert.equal(h.uploads[0].options.signal.aborted, true)
})

test('existing media URLs publish without uploading again', async () => {
  const h = harness()
  await h.context.handlePublish()
  assert.equal(h.uploads.length, 0)
  assert.equal(h.published.length, 1)
  assert.equal(h.published[0].workflow_id, 'wf-1')
})

test('concurrent independent uploads receive separate abort signals', async () => {
  const h = harness()
  await Promise.all([h.context.uploadWorkMedia(image('a.png')), h.context.uploadWorkMedia(image('b.png'))])
  assert.equal(h.uploads.length, 2)
  assert.notEqual(h.uploads[0].options.signal, h.uploads[1].options.signal)
})
