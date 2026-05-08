import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findClosestAspectRatio,
  resolveGenerationAspectRatio
} from './aspectRatio.js'

test('findClosestAspectRatio maps portrait reference to 3:4', () => {
  assert.equal(findClosestAspectRatio(900, 1200), '3:4')
})

test('findClosestAspectRatio maps wide reference to 16:9', () => {
  assert.equal(findClosestAspectRatio(1920, 1080), '16:9')
})

test('findClosestAspectRatio maps square reference to 1:1', () => {
  assert.equal(findClosestAspectRatio(1024, 1024), '1:1')
})

test('resolveGenerationAspectRatio returns non-auto selection unchanged', async () => {
  assert.equal(await resolveGenerationAspectRatio('4:5', 'image.png'), '4:5')
})

test('resolveGenerationAspectRatio returns text-to-image default when auto has no image', async () => {
  assert.equal(await resolveGenerationAspectRatio('auto', null), '9:16')
})
