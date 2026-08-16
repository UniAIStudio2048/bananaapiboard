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
  assert.match(source, /const MAX = seedanceMaxRefImages\.value/)
  assert.match(source, /const MAX = seedanceMaxRefVideos\.value/)
  assert.match(source, /const MAX = seedanceMaxRefAudios\.value/)
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
  assert.match(source, /const requestedDuration = isReferenceVideoModel\.value \? String\(seedanceDuration\.value\) : currentDuration/)
  assert.match(source, /formData\.append\('duration', requestedDuration\)/)
  assert.match(source, /duration: requestedDuration,/)
})

test('VideoGeneration keeps the Seedance 2.5 30-second total video cap separate from each video cap', () => {
  assert.match(source, /totalDuration \+ metadata\.duration > seedanceModelLimits\.value\.maxReferenceVideoDuration/)
  assert.match(source, /validateSeedanceReferenceCounts\(/)
})
