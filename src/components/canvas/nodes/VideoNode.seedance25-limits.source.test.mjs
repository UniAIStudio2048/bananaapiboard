import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('VideoNode resolves Seedance reference limits from seedanceConfig', () => {
  assert.match(source, /const seedance2Limits = computed\(\(\) => \{/)
  assert.match(source, /toPositiveNumber\(config\.maxImages, 9\)/)
  assert.match(source, /toPositiveNumber\(config\.maxVideos, 3\)/)
  assert.match(source, /toPositiveNumber\(config\.maxAudios, 3\)/)
})

test('VideoNode submits Seedance 2.x references up to configured limits', () => {
  assert.match(source, /finalImages\.slice\(0, seedance2Limits\.value\.maxImages\)/)
  assert.match(source, /orderedVideos\.slice\(0, seedance2Limits\.value\.maxVideos\)/)
  assert.match(source, /orderedAudios\.slice\(0, seedance2Limits\.value\.maxAudios\)/)
})

test('VideoNode total duration caps skip when model supports more inputs', () => {
  assert.match(source, /totalAudioCap = isMinimaxH3Model\.value \|\| seedance2Limits\.value\.maxAudios <= 3 \? 15 : Infinity/)
  assert.match(source, /totalVideoCap = seedance2Limits\.value\.maxVideos > 3 \? Infinity : 15/)
})
