import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isPreferredModelMediaUrl,
  normalizeModelImageUrl,
  normalizeModelImageUrls
} from './canvasModelMedia.js'

test('normalizes COS thumbnail URLs back to original object URLs for model params', () => {
  const url = 'https://filescos.nananobanana.cn/tenant-a/images/a.png?imageMogr2/thumbnail/1024x/format/webp'
  assert.equal(
    normalizeModelImageUrl(url),
    'https://filescos.nananobanana.cn/tenant-a/images/a.png'
  )
})

test('normalizes Qiniu and local preview URLs back to original URLs for model params', () => {
  assert.equal(
    normalizeModelImageUrl('https://files.nananobanana.cn/a.jpg?imageView2/2/w/1024'),
    'https://files.nananobanana.cn/a.jpg'
  )
  assert.equal(
    normalizeModelImageUrl('/api/images/file/abc.png?preview=true&w=2048'),
    '/api/images/file/abc.png'
  )
})

test('recognizes cloud CDN and backend proxy URLs but rejects transient inline URLs', () => {
  assert.equal(isPreferredModelMediaUrl('https://files.nananobanana.cn/a.jpg'), true)
  assert.equal(isPreferredModelMediaUrl('https://filescos.nananobanana.cn/a.jpg'), true)
  assert.equal(isPreferredModelMediaUrl('https://api.nananobanana.cn/api/cos-proxy/tenant/a.jpg'), true)
  assert.equal(isPreferredModelMediaUrl('https://app.nananobanana.cn/api/images/file/a.jpg'), false)
  assert.equal(isPreferredModelMediaUrl('http://localhost:5000/api/images/file/a.jpg'), false)
  assert.equal(isPreferredModelMediaUrl('blob:https://app/123'), false)
  assert.equal(isPreferredModelMediaUrl('data:image/png;base64,abc'), false)
})

test('normalizes image URL arrays while preserving order', () => {
  assert.deepEqual(
    normalizeModelImageUrls([
      'https://filescos.nananobanana.cn/a.png?imageMogr2/thumbnail/2048x/format/webp',
      'https://files.nananobanana.cn/b.jpg?imageView2/2/w/1024'
    ]),
    [
      'https://filescos.nananobanana.cn/a.png',
      'https://files.nananobanana.cn/b.jpg'
    ]
  )
})
