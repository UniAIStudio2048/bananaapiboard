import test from 'node:test'
import assert from 'node:assert/strict'

import { getImageMediaUrls } from './communityMedia.js'

test('returns media_urls for image works', () => {
  assert.deepEqual(
    getImageMediaUrls({ media_type: 'image', media_urls: ['a.jpg', 'b.jpg'], media_url: 'ignored.jpg' }),
    ['a.jpg', 'b.jpg']
  )
})

test('parses JSON encoded image media_url arrays', () => {
  assert.deepEqual(
    getImageMediaUrls({ media_type: 'image', media_url: JSON.stringify(['a.jpg', 'b.jpg']) }),
    ['a.jpg', 'b.jpg']
  )
})

test('falls back to single image media_url strings', () => {
  assert.deepEqual(
    getImageMediaUrls({ media_type: 'image', media_url: 'single.jpg' }),
    ['single.jpg']
  )
})

test('ignores non-image works', () => {
  assert.deepEqual(
    getImageMediaUrls({ media_type: 'video', media_url: 'movie.mp4', media_urls: ['poster.jpg'] }),
    []
  )
})
