import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')

test('VideoGeneration resolves Seedance reference limits from the shared Seedance 2.x resolver', () => {
  assert.match(source, /seedanceMaxRefImages = computed\(\(\) => \{/)
  assert.match(source, /const seedanceModelLimits = computed\(\(\) => resolveSeedance2Limits\(currentModelConfig\.value\)\)/)
  assert.match(source, /seedanceMaxRefVideos = computed\(\(\) => \{/)
  assert.match(source, /seedanceMaxRefAudios = computed\(\(\) => \{/)
})

test('VideoGeneration upload handlers use dynamic Seedance limits', () => {
  assert.match(source, /const MAX = isWan3Model\.value \? wan3MaxRefImages\.value : seedanceMaxRefImages\.value/)
  assert.match(source, /const MAX = isWan3Model\.value \? wan3MaxRefVideos\.value : seedanceMaxRefVideos\.value/)
  assert.match(source, /const MAX = isWan3Model\.value \? wan3MaxRefAudios\.value : seedanceMaxRefAudios\.value/)
})

test('VideoGeneration template renders dynamic Seedance limits', () => {
  assert.match(source, /seedanceMode === 'multimodal_ref' \? seedanceMaxRefImages : 1/)
  assert.match(source, /\{\{ seedanceMaxRefVideos \}\}/)
  assert.match(source, /\{\{ seedanceMaxRefAudios \}\}/)
  assert.match(source, /\) < seedanceMaxRefVideos/)
  assert.match(source, /\) < seedanceMaxRefAudios/)
})

test('VideoGeneration duration slider follows model duration range', () => {
  assert.match(source, /:min="seedanceMinDuration" :max="seedanceMaxDuration"/)
  assert.match(source, /<span>\{\{ seedanceMinDuration \}\}s<\/span><span>\{\{ seedanceMaxDuration \}\}s<\/span>/)
  assert.match(source, /seedanceConfig\?\.minDuration/)
  assert.match(source, /seedanceConfig\?\.maxDuration/)
})

test('VideoGeneration records the selected Seedance duration instead of the generic 10-second default', () => {
  assert.match(source, /const requestedDuration = isReferenceVideoModel\.value\s+\? \(seedanceAutoDuration\.value \? '-1' : String\(seedanceDuration\.value\)\)/)
  assert.match(source, /formData\.append\('duration', requestedDuration\)/)
  assert.match(source, /duration: requestedDuration,/)
})

test('VideoGeneration keeps the Seedance 2.5 30-second total video cap separate from each video cap', () => {
  assert.match(source, /const maxTotalDuration = isWan3Model\.value \? 15 : seedanceModelLimits\.value\.maxReferenceVideoDuration/)
  assert.match(source, /totalDuration \+ metadata\.duration > maxTotalDuration/)
  assert.match(source, /validateSeedanceReferenceCounts\(/)
})

test('VideoGeneration applies the Seedance 2.5 2-30 second audio and 30-second total limits', () => {
  assert.match(source, /seedanceAudioMax = isWan3Model\.value \? 15 : \(seedanceModelLimits\.value\.maxReferenceMediaDuration \|\| 15\)/)
  assert.match(source, /参考音频时长需在2到\$\{seedanceAudioMax\}秒之间/)
  assert.match(source, /seedanceAudioTotalMax = isWan3Model\.value \? 15 : \(seedanceModelLimits\.value\.maxTotalReferenceMediaDuration \|\| 15\)/)
  assert.match(source, /参考音频总时长不能超过\$\{seedanceAudioTotalMax\}秒/)
})
