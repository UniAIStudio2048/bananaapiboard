import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')

test('VideoGeneration reads Seedance reference limits from seedanceConfig', () => {
  assert.match(source, /seedanceMaxRefImages = computed\(\(\) => \{/)
  assert.match(source, /currentModelConfig\.value\?\.seedanceConfig\?\.maxImages/)
  assert.match(source, /seedanceMaxRefVideos = computed\(\(\) => \{/)
  assert.match(source, /currentModelConfig\.value\?\.seedanceConfig\?\.maxVideos/)
  assert.match(source, /seedanceMaxRefAudios = computed\(\(\) => \{/)
  assert.match(source, /currentModelConfig\.value\?\.seedanceConfig\?\.maxAudios/)
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

test('VideoGeneration total duration caps only apply to legacy Seedance limits', () => {
  assert.match(source, /seedanceMaxRefVideos\.value <= 3 && totalDuration \+ metadata\.duration > 15/)
  assert.match(source, /seedanceMaxRefAudios\.value <= 3 && totalDuration \+ dur > 15/)
})
