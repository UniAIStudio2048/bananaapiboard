import assert from 'node:assert/strict'
import test from 'node:test'
import { getSeedanceMediaType, getSeedanceSourceUrl, buildSeedanceCharacterData, mapLocalSeedanceAsset, getSeedanceMediaFileInfo } from './seedanceMedia.js'

test('character media types preserve legacy images and classify video/audio', () => {
  assert.equal(getSeedanceMediaType({}), 'image')
  assert.equal(getSeedanceMediaType({ assetType: 'Video' }), 'video')
  assert.equal(getSeedanceMediaType({ AssetType: 'Audio' }), 'audio')
})

test('source media addresses never use a video poster or audio cover', () => {
  assert.equal(getSeedanceSourceUrl({ sourceVideo: 'movie.mp4', thumbnailUrl: 'poster.jpg' }, 'Video'), 'movie.mp4')
  assert.equal(getSeedanceSourceUrl({ audioUrl: 'voice.wav', thumbnailUrl: 'cover.jpg' }, 'Audio'), 'voice.wav')
  assert.equal(getSeedanceSourceUrl({ nodeRole: 'source', sourceImages: ['new.png'], output: { url: 'old.png' } }, 'Image'), 'new.png')
  assert.equal(getSeedanceSourceUrl({ output: { urls: ['displayed.png'], url: 'legacy.png' } }, 'Image'), 'displayed.png')
})

test('local role metadata keeps original video separate from poster and URI', () => {
  const asset = mapLocalSeedanceAsset({ id: 'local', name: '角色', url: 'asset://video1', thumbnail_url: 'poster.jpg', metadata: JSON.stringify({ assetId: 'video1', assetType: 'Video', assetUrl: 'movie.mp4', status: 'Active' }) })
  assert.equal(asset.URL, 'movie.mp4')
  assert.equal(asset.ThumbnailURL, 'poster.jpg')
  const data = buildSeedanceCharacterData(asset)
  assert.equal(data.assetUri, 'asset://video1')
  assert.equal(data.assetUrl, 'movie.mp4')
  assert.equal(data.output.type, 'video')
  assert.equal(data.output.url, 'asset://video1')
})

test('legacy image records and face URI remain compatible', () => {
  const asset = mapLocalSeedanceAsset({ id: 'local', thumbnail_url: 'face.png', url: 'face:person', metadata: { assetId: 'person' } })
  const data = buildSeedanceCharacterData(asset)
  assert.equal(data.assetType, 'Image')
  assert.equal(data.assetUrl, 'face.png')
  assert.equal(data.assetUri, 'face:person')
  assert.equal(data.output.type, 'image')
})

test('upload MIME and filenames retain video/audio formats without using image extensions', () => {
  assert.deepEqual(getSeedanceMediaFileInfo('audio/wav', 'audio'), { mimeType: 'audio/wav', extension: 'wav' })
  assert.deepEqual(getSeedanceMediaFileInfo('video/quicktime', 'video'), { mimeType: 'video/quicktime', extension: 'mov' })
  assert.deepEqual(getSeedanceMediaFileInfo('application/octet-stream', 'audio', 'https://cdn.example/voice.flac'), { mimeType: 'audio/flac', extension: 'flac' })
  assert.throws(() => getSeedanceMediaFileInfo('image/jpeg', 'video'), /类型/)
})
