import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveSeedance2Limits,
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
      maxDuration: 15,
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

test('Seedance 2.5 never exposes an output or single-reference duration above 15 seconds', () => {
  const limits = resolveSeedance2Limits({
    actualModel: 'doubao-seedance-2-5-260628',
    seedanceConfig: { maxDuration: 30 }
  })

  assert.equal(limits.maxDuration, 15)
  assert.equal(limits.maxReferenceVideoDuration, 30)
})

test('Seedance 2.5 accepts 30 images, 10 videos, and 10 audios but rejects the next item', () => {
  const limits = resolveSeedance2Limits({ actualModel: 'doubao-seedance-2-5-260628' })

  assert.equal(validateSeedanceReferenceCounts({ imageCount: 30, videoCount: 10, audioCount: 10, limits }), '')
  assert.match(validateSeedanceReferenceCounts({ imageCount: 31, limits }), /不能超过30张/)
  assert.match(validateSeedanceReferenceCounts({ videoCount: 11, limits }), /不能超过10个/)
  assert.match(validateSeedanceReferenceCounts({ audioCount: 11, limits }), /不能超过10个/)
})
