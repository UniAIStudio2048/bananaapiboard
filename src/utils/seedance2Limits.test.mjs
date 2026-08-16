import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSeedance25ModeConstraints,
  resolveSeedance2Limits,
  validateSeedance25ModePrompt,
  validateSeedanceReferenceCounts
} from './seedance2Limits.js'

test('Seedance 2.5 falls back to its own reference limits for legacy model records', () => {
  assert.deepEqual(
    resolveSeedance2Limits({ actualModel: 'doubao-seedance-2-5-260628' }),
    {
      maxImages: 30,
      maxVideos: 10,
      maxAudios: 10,
      minDuration: 3,
      maxDuration: 30,
      maxReferenceVideoDuration: 30
    }
  )
})

test('Seedance 2.5 uses the configured maximum selectable duration for each reference video', () => {
  const limits = resolveSeedance2Limits({
    actualModel: 'doubao-seedance-2-5-260628',
    seedanceConfig: { maxDuration: 12 }
  })

  assert.equal(limits.maxDuration, 12)
  assert.equal(limits.maxReferenceVideoDuration, 30)
})

test('Seedance 2.5 exposes its official 30-second output maximum', () => {
  const limits = resolveSeedance2Limits({
    actualModel: 'doubao-seedance-2-5-260628',
    seedanceConfig: { maxDuration: 30 }
  })

  assert.equal(limits.maxDuration, 30)
  assert.equal(limits.maxReferenceVideoDuration, 30)
})

test('Seedance 2.5 accepts 30 images, 10 videos, and 10 audios but rejects the next item', () => {
  const limits = resolveSeedance2Limits({ actualModel: 'doubao-seedance-2-5-260628' })

  assert.equal(validateSeedanceReferenceCounts({ imageCount: 30, videoCount: 10, audioCount: 10, limits }), '')
  assert.match(validateSeedanceReferenceCounts({ imageCount: 31, limits }), /不能超过30张/)
  assert.match(validateSeedanceReferenceCounts({ videoCount: 11, limits }), /不能超过10个/)
  assert.match(validateSeedanceReferenceCounts({ audioCount: 11, limits }), /不能超过10个/)
})

test('Seedance 2.5 applies special request constraints only to supported submodes', () => {
  const model = { actualModel: 'doubao-seedance-2-5-260628' }

  assert.deepEqual(getSeedance25ModeConstraints(model, 'multimodal_ref'), {
    ratio: 'adaptive',
    duration: -1,
    omniReferenceTaskType: 'auto',
    minReferenceVideoDuration: 4,
    maxReferenceVideoDuration: 30
  })
  assert.deepEqual(getSeedance25ModeConstraints(model, 'video_edit'), {
    ratio: 'adaptive',
    duration: -1,
    omniReferenceTaskType: 'edit',
    minReferenceVideoDuration: 4,
    maxReferenceVideoDuration: 30
  })
  assert.deepEqual(getSeedance25ModeConstraints(model, 'video_extend'), {
    ratio: 'adaptive',
    omniReferenceTaskType: 'extend'
  })
  assert.deepEqual(getSeedance25ModeConstraints(model, 'image2video_first'), { ratio: 'adaptive' })
  assert.deepEqual(getSeedance25ModeConstraints(model, 'image2video_first_last'), { ratio: 'adaptive' })
  assert.equal(getSeedance25ModeConstraints(model, 'text2video'), null)
  assert.equal(getSeedance25ModeConstraints({ actualModel: 'doubao-seedance-2-0-260128' }, 'video_edit'), null)
})

test('Seedance 2.5 edit and extend prompts require their provider keywords', () => {
  const model = { actualModel: 'doubao-seedance-2-5-260628' }

  assert.match(
    validateSeedance25ModePrompt({ modelConfig: model, mode: 'video_edit', prompt: '让画面更有趣' }),
    /编辑视频/
  )
  assert.equal(
    validateSeedance25ModePrompt({ modelConfig: model, mode: 'video_edit', prompt: '@video1 中加一些小动物' }),
    ''
  )
  assert.match(
    validateSeedance25ModePrompt({ modelConfig: model, mode: 'video_extend', prompt: '继续保持原样' }),
    /向前\/向后延长/
  )
  assert.equal(
    validateSeedance25ModePrompt({ modelConfig: model, mode: 'video_extend', prompt: '向后延长 @video1' }),
    ''
  )
})
