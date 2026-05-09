import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMediaProxyDownloadPath } from './downloadRouting.js'
import { buildStreamDownloadPath } from './downloadRouting.js'
import { buildDirectCdnDownloadUrl, isDirectCdnDownloadUrl } from './downloadRouting.js'

test('routes video downloads through the video download endpoint', () => {
  const path = buildMediaProxyDownloadPath('/api/images/file/video-123', 'clip.mp4')

  assert.equal(
    path,
    '/api/videos/download?url=%2Fapi%2Fimages%2Ffile%2Fvideo-123&filename=clip.mp4'
  )
})

test('routes image downloads through the image download endpoint', () => {
  const path = buildMediaProxyDownloadPath('/api/images/file/image-123', 'image.png')

  assert.equal(
    path,
    '/api/images/download?url=%2Fapi%2Fimages%2Ffile%2Fimage-123&filename=image.png'
  )
})

test('builds stream image downloads without waiting for preview image blobs', () => {
  const path = buildStreamDownloadPath('/api/images/file/image-123?preview=true&w=400', 'image.png')

  assert.equal(
    path,
    '/api/images/download?url=%2Fapi%2Fimages%2Ffile%2Fimage-123&filename=image.png'
  )
})

test('detects COS CDN URLs as direct CDN download targets', () => {
  assert.equal(
    isDirectCdnDownloadUrl('https://filescos.nananobanana.cn/default-tenant-001/images/image.png'),
    true
  )
})

test('builds direct COS CDN image downloads from the original file URL', () => {
  const url = buildDirectCdnDownloadUrl(
    'https://filescos.nananobanana.cn/default-tenant-001/images/image.png?imageMogr2/thumbnail/200x/format/webp',
    'chair.png'
  )

  assert.equal(
    url,
    'https://filescos.nananobanana.cn/default-tenant-001/images/image.png'
  )
})

test('builds direct COS CDN video downloads without routing through the API proxy', () => {
  const url = buildDirectCdnDownloadUrl(
    'https://filescos.nananobanana.cn/default-tenant-001/videos/clip.mp4',
    'clip.mp4'
  )

  assert.equal(
    url,
    'https://filescos.nananobanana.cn/default-tenant-001/videos/clip.mp4'
  )
})
