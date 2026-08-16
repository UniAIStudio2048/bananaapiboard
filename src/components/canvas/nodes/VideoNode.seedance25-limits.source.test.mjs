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

test('VideoNode locks Seedance 2.5 special submodes to adaptive ratio and validates their prompts', () => {
  assert.match(source, /getSeedance25ModeConstraints/)
  assert.match(source, /validateSeedance25ModePrompt/)
  assert.match(source, /const seedance25ModeConstraints = computed/)
  assert.match(source, /selectedAspectRatio\.value = seedance25ModeConstraints\.value\.ratio/)
  assert.match(source, /value: seedance25ModeConstraints\.value\.ratio,[\s\S]*displayLabel: currentLanguage\.value\?\.startsWith\('zh'\) \? '自适应' : 'Auto'/)
  assert.match(source, /const seedanceRatio = seedance25ModeConstraints\.value\?\.ratio \|\| selectedAspectRatio\.value/)
  assert.match(source, /formData\.append\('seedance_ratio', seedanceRatio\)/)
  assert.match(source, /validateSeedance25ModePrompt\(\{[\s\S]*modelConfig: currentModelConfig\.value/)
})

test('VideoNode accepts 4-30 second local reference videos for constrained Seedance 2.5 submodes', () => {
  const validationStart = source.indexOf('async function validateSeedanceVideoFile')
  assert.ok(validationStart >= 0, 'local Seedance reference video validation should exist')
  const validationSource = source.slice(validationStart, validationStart + 1000)

  assert.match(validationSource, /maxDuration: seedance25ModeConstraints\.value\?\.maxReferenceVideoDuration \|\| seedance2Limits\.value\.maxDuration/)
  assert.match(validationSource, /metadata\.duration < seedance25ModeConstraints\.value\.minReferenceVideoDuration/)
})

test('VideoNode locks Seedance 2.5 video edit duration to the ten-second Auto prepayment option', () => {
  const durationOptionsStart = source.indexOf('const durations = computed')
  assert.ok(durationOptionsStart >= 0, 'duration option resolver should exist')
  const durationOptionsSource = source.slice(durationOptionsStart, durationOptionsStart + 900)

  assert.match(durationOptionsSource, /seedance25ModeConstraints\.value\?\.duration === -1 && selectedSeedance2Mode\.value === 'video_edit'/)
  assert.match(durationOptionsSource, /return \[\{ value: '10', label: 'Auto' \}\]/)
  assert.match(source, /seedance25ModeConstraints\.value\?\.duration === -1 && selectedSeedance2Mode\.value === 'video_edit'[\s\S]*selectedDuration\.value = '10'/)
})
