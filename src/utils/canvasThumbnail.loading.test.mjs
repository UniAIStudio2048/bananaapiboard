import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { selectLodWidth } from './lodSelector.js'

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const apiImport = "import { getApiUrl } from '@/config/tenant'"
const apiStub = 'const getApiUrl = url => url'
const cloudSource = readFileSync(new URL('./cloudMediaUrl.js', import.meta.url), 'utf8')
  .replace(apiImport, apiStub)
  .replaceAll('import.meta.env', "({ VITE_DIRECT_CDN: 'true' })")
const thumbnailSource = readFileSync(new URL('./canvasThumbnail.js', import.meta.url), 'utf8')
  .replace(apiImport, apiStub)
  .replace("'./cloudMediaUrl.js'", JSON.stringify(moduleUrl(cloudSource)))
  .replace("'./lodSelector.js'", JSON.stringify(new URL('./lodSelector.js', import.meta.url).href))
const thumbnail = await import(moduleUrl(thumbnailSource))
const image = 'https://filescos.nananobanana.cn/canvas/test/transparent.png'

test('11% canvas overview uses a 128px preview, including DPR 2', () => {
  assert.equal(selectLodWidth({ zoom: 0.11, nodeWidth: 380, devicePixelRatio: 1 }), 128)
  assert.equal(selectLodWidth({ zoom: 0.11, nodeWidth: 380, devicePixelRatio: 2 }), 128)
  assert.equal(selectLodWidth({ zoom: 0.4, nodeWidth: 380 }), 192)
  assert.equal(selectLodWidth({ zoom: 0.6, nodeWidth: 380 }), 256)
  assert.equal(selectLodWidth({ zoom: 0.4, nodeWidth: 380, devicePixelRatio: 2 }), 384)
  assert.equal(selectLodWidth({ zoom: 5, nodeWidth: 400, preferLowQuality: true }), 128)
  assert.equal(selectLodWidth({ zoom: 5, nodeWidth: 400 }), 0)
})

test('canvas cloud previews use WebP while original and general thumbnails keep their URLs', () => {
  const preview = thumbnail.getHighQualityCanvasPreviewUrl(image, { zoom: 0.11, nodeWidth: 380 })
  assert.equal(preview, `${image}?imageMogr2/thumbnail/128x/format/webp/quality/80`)
  assert.equal(thumbnail.getOriginalImageUrl(preview), image)
  assert.equal(thumbnail.getHighQualityCanvasPreviewUrl(image, { zoom: 5, nodeWidth: 400 }), image)
  assert.equal(thumbnail.getCanvasThumbnailUrl(image, 600), `${image}?imageMogr2/thumbnail/600x`)
})

test('lightweight previews preserve proxy bucket identity and use the matching CDN protocol', () => {
  assert.equal(thumbnail.getCanvasWebpThumbnailUrl('/api/cos-proxy/test/a.png?bid=old-bucket', 160),
    '/api/cos-proxy/test/a.png?bid=old-bucket&imageMogr2/thumbnail/160x/format/webp/quality/80')
  assert.equal(thumbnail.getCanvasWebpThumbnailUrl('https://files.nananobanana.cn/a.png', 160),
    'https://files.nananobanana.cn/a.png?imageView2/2/w/160/format/webp/q/80')
})

test('GIF, explicit image processing, third-party and local temporary URLs remain compatible', () => {
  for (const url of [image.replace('.png', '.gif'), 'blob:pending-upload', 'data:image/png;base64,AA==',
    `${image}?imageMogr2/thumbnail/80x`, 'https://external.example/a.png']) {
    assert.equal(thumbnail.getCanvasWebpThumbnailUrl(url, 160), url)
  }
  assert.equal(thumbnail.getCanvasWebpThumbnailUrl(image, 0), image)
})

test('cloud thumbnail failure falls back once to the original', () => {
  const source = readFileSync(new URL('./canvasThumbnail.js', import.meta.url), 'utf8')
  const start = source.indexOf('export function onCanvasImageError(')
  const end = source.indexOf('/**', start)
  class ImageElement {
    constructor() { this.dataset = {}; this.src = `${image}?imageMogr2/thumbnail/128x/format/webp/quality/80` }
    getAttribute() { return this.src }
  }
  const onError = runInNewContext(`${source.slice(start, end).replace('export ', '')}; onCanvasImageError`, {
    HTMLImageElement: ImageElement, getOriginalImageUrl: thumbnail.getOriginalImageUrl
  })
  const img = new ImageElement()
  onError({ target: img })
  assert.equal(img.src, image)
  img.src = 'failed-again'
  onError({ target: img })
  assert.equal(img.src, 'failed-again')
})

const directorySource = readFileSync(new URL('../components/canvas/CanvasDirectoryPanel.vue', import.meta.url), 'utf8')
function directoryHarness() {
  const start = directorySource.indexOf('function isImagePreviewUrl(')
  const end = directorySource.indexOf('function toHoverAsset(', start)
  return runInNewContext(`${directorySource.slice(start, end)}; ({ getRowPreviewUrl, handleRowPreviewError })`, {
    failedPreviewKeys: { value: new Set() }, originalPreviewKeys: { value: new Set() },
    toSameOriginUrl: url => url, getCanvasWebpThumbnailUrl: thumbnail.getCanvasWebpThumbnailUrl,
    getVideoPosterUrl: thumbnail.getVideoPosterUrl
  })
}

test('directory uses a 160px WebP without changing node media data', () => {
  const row = { id: 'image', mediaKind: 'image', previewUrl: image, mediaUrl: image }
  assert.equal(directoryHarness().getRowPreviewUrl(row), `${image}?imageMogr2/thumbnail/160x/format/webp/quality/80`)
  assert.equal(row.mediaUrl, image)
  assert.equal(row.previewUrl, image)
})

test('directory retries the original once, then shows the icon, and replacement URLs can load', () => {
  const harness = directoryHarness()
  const row = { id: 'image', mediaKind: 'image', previewUrl: image, mediaUrl: image }
  harness.handleRowPreviewError(row)
  assert.equal(harness.getRowPreviewUrl(row), image)
  harness.handleRowPreviewError(row)
  assert.equal(harness.getRowPreviewUrl(row), '')
  row.previewUrl = row.mediaUrl = image.replace('transparent', 'replacement')
  assert.match(harness.getRowPreviewUrl(row), /thumbnail\/160x\/format\/webp/)
})

test('directory fallback preserves the original proxy bucket and supports independent thumbnails', () => {
  const harness = directoryHarness()
  const original = '/api/cos-proxy/legacy/a.png?bid=old-bucket'
  const row = { id: 'legacy', mediaKind: 'image', previewUrl: image, mediaUrl: original }
  harness.handleRowPreviewError(row)
  assert.equal(harness.getRowPreviewUrl(row), original)
})

test('directory preserves local image transparency and existing video poster behavior', () => {
  const harness = directoryHarness()
  assert.equal(harness.getRowPreviewUrl({ mediaKind: 'image', previewUrl: '/api/images/file/local-png' }),
    '/api/images/file/local-png')
  assert.match(harness.getRowPreviewUrl({ mediaKind: 'video', previewUrl: image.replace('.png', '.mp4') }),
    /ci-process=snapshot&time=0&width=160&format=jpg/)
})
