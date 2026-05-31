import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildVideoGenerationFormEntries,
  getDefaultGenerationModeForVideoModel,
  getWanDurationOptions,
  isSeedanceSd2VideoModel,
  isWanVideoModel,
  resolveVideoRequestModel
} from './videoGenerationMode.js'

test('Bytefor video models are not treated as Seedance SD2 models', () => {
  assert.equal(isSeedanceSd2VideoModel({ apiType: 'bytefor' }), false)
  assert.equal(isSeedanceSd2VideoModel({ apiType: 'byteforapi' }), false)
  assert.equal(isSeedanceSd2VideoModel({ apiType: 'happyhorse' }), true)
  assert.equal(isSeedanceSd2VideoModel({ apiType: 'seedance-2.0' }), true)
  assert.equal(isSeedanceSd2VideoModel({ apiType: 'ant' }), true)
  assert.equal(isSeedanceSd2VideoModel({ apiType: 'ctyun-seedance' }), true)
})

test('Ctyun Seedance default generation mode follows SD2 detector', () => {
  assert.equal(
    getDefaultGenerationModeForVideoModel({
      apiType: 'ctyun-seedance',
      defaultSeedance2Mode: 'image2video_first'
    }),
    'image'
  )
  assert.equal(
    getDefaultGenerationModeForVideoModel({ apiType: 'ctyun-seedance' }),
    'text'
  )
})

test('Ctyun Seedance submit payload appends SD2 fields', () => {
  const entries = buildVideoGenerationFormEntries({
    modelConfig: { apiType: 'ctyun-seedance' },
    prompt: '小女孩唱歌',
    model: 'ctyun-seedance-2.0',
    aspectRatio: '16:9',
    duration: '4',
    mode: 'text',
    seedance: {
      mode: 'text2video',
      resolution: '720p',
      ratio: '16:9',
      generateAudio: true,
      webSearch: false,
      watermark: false,
      duration: '4'
    }
  })

  assert.equal(entries.get('seedance_mode'), 'text2video')
  assert.equal(entries.get('seedance_resolution'), '720p')
  assert.equal(entries.get('seedance_ratio'), '16:9')
  assert.equal(entries.get('seedance_generate_audio'), 'true')
  assert.equal(entries.get('duration'), '4')
})

test('Bytefor-backed Seedance and HappyHorse configs are not treated as Seedance SD2 models', () => {
  const byteforFields = [
    { apiBase: 'https://api.byteforapi.com/v1' },
    { provider: 'bytefor' },
    { name: 'Bytefor Seedance 2.0' },
    { displayName: 'Bytefor API Video' },
    { actualModel: 'byteforapi/seedance-2.0-pro' }
  ]

  for (const fields of byteforFields) {
    assert.equal(isSeedanceSd2VideoModel({ apiType: 'seedance-2.0', ...fields }), false)
    assert.equal(isSeedanceSd2VideoModel({ apiType: 'happyhorse', ...fields }), false)
  }
})

test('Bytefor uses normal text/image generation mode defaults', () => {
  assert.equal(
    getDefaultGenerationModeForVideoModel({
      apiType: 'bytefor',
      defaultVideoMode: 'i2v',
      defaultSeedance2Mode: 'text2video'
    }),
    'image'
  )

  assert.equal(
    getDefaultGenerationModeForVideoModel({
      apiType: 'happyhorse',
      defaultVideoMode: 't2v',
      defaultSeedance2Mode: 'image2video_first'
    }),
    'image'
  )
})

test('Bytefor submit payload keeps normal video fields and skips SD2 fields', () => {
  const image = { name: 'first-frame.png' }
  const entries = buildVideoGenerationFormEntries({
    modelConfig: { apiType: 'bytefor' },
    prompt: 'make a product shot move',
    model: 'bytefor-video',
    aspectRatio: '16:9',
    duration: '10',
    mode: 'image',
    imageFiles: [image],
    hd: false,
    watermark: false,
    isPrivate: true,
    seedance: {
      mode: 'image2video_first',
      resolution: '720p',
      ratio: 'adaptive',
      generateAudio: true,
      webSearch: true,
      watermark: false
    }
  })

  assert.deepEqual(entries.getAll('images'), [image])
  assert.equal(entries.get('aspect_ratio'), '16:9')
  assert.equal(entries.get('duration'), '10')
  assert.equal(entries.has('seedance_mode'), false)
  assert.equal(entries.has('seedance_resolution'), false)
  assert.equal(entries.has('seedance_generate_audio'), false)
})

test('video generation payload keeps configured model id for backend routing', () => {
  const configuredProviderModel = 'Custom Bytefor Model From Settings'
  const entries = buildVideoGenerationFormEntries({
    modelConfig: { apiType: 'bytefor', actualModel: configuredProviderModel },
    prompt: 'make a product shot move',
    model: 'bytefor-seedance-2.0',
    aspectRatio: '16:9',
    duration: '10',
    mode: 'text'
  })

  assert.equal(entries.get('model'), 'bytefor-seedance-2.0')
})

test('Bytefor request model keeps model id instead of provider model', () => {
  const configuredProviderModel = 'Custom Bytefor Model From Settings'
  assert.equal(
    resolveVideoRequestModel({
      apiType: 'bytefor',
      name: 'bytefor-seedance-2.0',
      seedanceConfig: { model: configuredProviderModel }
    }, 'bytefor-seedance-2.0'),
    'bytefor-seedance-2.0'
  )
})

test('Wan video models use text defaults and clamp r2v durations with video references', () => {
  assert.equal(isWanVideoModel({ apiType: 'wan' }), true)
  assert.equal(isWanVideoModel({ apiType: 'seedance-2.0' }), false)
  assert.equal(getDefaultGenerationModeForVideoModel({ apiType: 'wan' }), 'text')

  assert.deepEqual(
    getWanDurationOptions({
      modelDurations: [2, 5, 10, 11, 15, 20],
      mode: 't2v',
      hasVideoReference: false
    }),
    [2, 5, 10, 11, 15]
  )

  assert.deepEqual(
    getWanDurationOptions({
      modelDurations: [2, 5, 10, 11, 15, 20],
      mode: 'r2v',
      hasVideoReference: true
    }),
    [2, 5, 10]
  )

  assert.deepEqual(
    getWanDurationOptions({
      modelDurations: [2, 5, 10, 11, 15],
      mode: 'videoedit',
      hasVideoReference: true
    }),
    []
  )
})
