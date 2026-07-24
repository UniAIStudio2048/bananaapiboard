import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SEEDANCE_MAX_IMAGE_BYTES,
  SEEDANCE_MAX_IMAGE_PIXELS,
  getSeedanceImageCompressionPlan,
  validatePreparedSeedanceImage,
  validateSeedanceVideoMetadata,
  validateSeedanceModeInputs
} from './seedanceMediaValidation.js'

test('marks oversized seedance images for compression by pixel count', () => {
  const plan = getSeedanceImageCompressionPlan({
    width: 9000,
    height: 5000,
    size: 8 * 1024 * 1024
  })

  assert.equal(plan.needsCompression, true)
  assert.equal(plan.reason, 'pixels')
  assert.ok(plan.targetWidth * plan.targetHeight <= SEEDANCE_MAX_IMAGE_PIXELS)
  assert.ok(plan.targetWidth < 9000)
})

test('marks seedance images over 30MB for compression even when pixels are valid', () => {
  const plan = getSeedanceImageCompressionPlan({
    width: 3000,
    height: 3000,
    size: SEEDANCE_MAX_IMAGE_BYTES + 1
  })

  assert.equal(plan.needsCompression, true)
  assert.equal(plan.reason, 'size')
  assert.equal(plan.targetWidth, 3000)
  assert.equal(plan.targetHeight, 3000)
})

test('prepared seedance image validation reports exact blocking reason', () => {
  assert.equal(
    validatePreparedSeedanceImage({ width: 7000, height: 6000, size: 20 * 1024 * 1024 }),
    '图片像素超过3600万，自动压缩后仍不符合要求，请更换图片'
  )
  assert.equal(
    validatePreparedSeedanceImage({ width: 3000, height: 3000, size: SEEDANCE_MAX_IMAGE_BYTES + 1 }),
    '图片大小超过30MB，自动压缩后仍不符合要求，请更换图片'
  )
})

test('seedance mode validation returns concrete missing input messages', () => {
  assert.equal(
    validateSeedanceModeInputs({ mode: 'image2video_first', imageCount: 0, videoCount: 0 }),
    '请上传或连接首帧图片'
  )
  assert.equal(
    validateSeedanceModeInputs({ mode: 'image2video_first_last', imageCount: 1, videoCount: 0 }),
    '请上传或连接尾帧图片'
  )
  assert.equal(
    validateSeedanceModeInputs({ mode: 'multimodal_ref', imageCount: 0, videoCount: 0 }),
    '多模态模式至少需要一个参考图片或参考视频'
  )
  assert.equal(
    validateSeedanceModeInputs({ mode: 'video_edit', imageCount: 0, videoCount: 0 }),
    'Seedance 视频编辑模式至少需要一个参考视频'
  )
})

test('seedance video metadata validation rejects low pixel count with exact dimensions', () => {
  assert.equal(
    validateSeedanceVideoMetadata({
      width: 360,
      height: 640,
      duration: 14.5,
      size: 544369,
      type: 'video/mp4'
    }, { index: 0, apiType: 'ant' }),
    '参考视频1分辨率过低：当前 360×640（230400 像素），要求至少 409600 像素，请提升到 480×854 或更高后重试'
  )
})

test('seedance video metadata validation rejects invalid size and accepts valid video', () => {
  assert.match(
    validateSeedanceVideoMetadata({
      width: 720,
      height: 1280,
      duration: 10,
      size: 50 * 1024 * 1024 + 1,
      type: 'video/mp4'
    }, { index: 1, apiType: 'ant' }),
    /参考视频2.*50MB/
  )

  assert.equal(
    validateSeedanceVideoMetadata({
      width: 720,
      height: 1280,
      duration: 10,
      size: 8 * 1024 * 1024,
      type: 'video/mp4'
    }, { index: 0, apiType: 'ant' }),
    ''
  )
})
