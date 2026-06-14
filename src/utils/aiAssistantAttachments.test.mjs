import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDirectUrlAttachment,
  shouldFetchAssistantAttachmentUrl
} from './aiAssistantAttachments.js'

test('uses direct URL attachments for remote media to avoid browser CORS fetches', () => {
  const url = 'https://files.nananobanana.cn/default-tenant-001/videos/clip.mp4'

  assert.equal(shouldFetchAssistantAttachmentUrl(url), false)
  assert.deepEqual(
    buildDirectUrlAttachment({ url, type: 'video', name: 'clip' }),
    {
      type: 'video',
      name: 'clip.mp4',
      fileType: 'video',
      ext: 'mp4',
      size: 0,
      preview: url,
      url
    }
  )
})

test('only fetches transient media so API and storage URLs avoid browser CORS downloads', () => {
  assert.equal(shouldFetchAssistantAttachmentUrl('/api/images/file/video-123'), false)
  assert.equal(shouldFetchAssistantAttachmentUrl('/api/cos-proxy/default-tenant-001/images/a.jpg'), false)
  assert.equal(shouldFetchAssistantAttachmentUrl('/storage/default-tenant-001/images/a.jpg'), false)
  assert.equal(shouldFetchAssistantAttachmentUrl('/uploads/default-tenant-001/images/a.jpg'), false)
  assert.equal(shouldFetchAssistantAttachmentUrl('https://app.nananobanana.cn/api/images/file/a.jpg'), false)
  assert.equal(shouldFetchAssistantAttachmentUrl('http://localhost:5173/api/images/file/a.jpg'), false)
  assert.equal(shouldFetchAssistantAttachmentUrl('blob:https://app.local/123'), true)
  assert.equal(shouldFetchAssistantAttachmentUrl('data:image/png;base64,abc'), true)
})
