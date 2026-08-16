import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('VideoNode resolves Seedance reference limits from the shared Seedance 2.x resolver', () => {
  assert.match(source, /const seedance2Limits = computed\(\(\) => resolveSeedance2Limits\(currentModelConfig\.value\)\)/)
  assert.match(source, /resolveSeedance2Limits\(currentModelConfig\.value\)/)
})

test('VideoNode submits Seedance 2.x references up to configured limits', () => {
  assert.match(source, /finalImages\.slice\(0, seedance2Limits\.value\.maxImages\)/)
  assert.match(source, /orderedVideos\.slice\(0, seedance2Limits\.value\.maxVideos\)/)
  assert.match(source, /orderedAudios\.slice\(0, seedance2Limits\.value\.maxAudios\)/)
})

test('VideoNode uses a 2.5 total video cap separate from the per-video cap', () => {
  assert.match(source, /totalVideoCap = seedance2Limits\.value\.maxReferenceVideoDuration/)
  assert.match(source, /validateSeedanceReferenceCounts\(/)
})
