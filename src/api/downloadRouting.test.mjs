import test from 'node:test'
import assert from 'node:assert/strict'

import { buildMediaProxyDownloadPath } from './downloadRouting.js'
import { buildStreamDownloadPath } from './downloadRouting.js'
import {
  buildDirectCdnDownloadUrl,
  isCanvasDirectCdnDownloadUrl,
  isDirectCdnDownloadUrl
} from './downloadRouting.js'

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

test('routes tenant canvas CDN image downloads through the image endpoint', () => {
  const path = buildStreamDownloadPath(
    'https://cdn.tenant-example.com/canvas/tenant/image.png',
    'image.png'
  )

  assert.equal(
    path,
    '/api/images/download?url=https%3A%2F%2Fcdn.tenant-example.com%2Fcanvas%2Ftenant%2Fimage.png&filename=image.png'
  )
})

test('routes tenant canvas CDN video downloads through the video endpoint', () => {
  const path = buildStreamDownloadPath(
    'https://cdn.tenant-example.com/canvas/tenant/clip.mp4',
    'clip.mp4'
  )

  assert.equal(
    path,
    '/api/videos/download?url=https%3A%2F%2Fcdn.tenant-example.com%2Fcanvas%2Ftenant%2Fclip.mp4&filename=clip.mp4'
  )
})

test('detects COS CDN URLs as direct CDN download targets', () => {
  assert.equal(
    isDirectCdnDownloadUrl('https://filescos.nananobanana.cn/default-tenant-001/images/image.png'),
    true
  )
})

test('detects tenant CDN canvas URLs as direct download targets', () => {
  assert.equal(
    isCanvasDirectCdnDownloadUrl('https://cdn.tenant-example.com/canvas/tenant/image.png'),
    true
  )
  assert.equal(
    isDirectCdnDownloadUrl('https://cdn.tenant-example.com/canvas/tenant/image.png'),
    true
  )
  assert.equal(
    isDirectCdnDownloadUrl('https://cdn.tenant-example.com/assets/tenant/image.png'),
    false
  )
  assert.equal(
    isCanvasDirectCdnDownloadUrl('https://filescos.nananobanana.cn/default-tenant-001/images/image.png'),
    false
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
