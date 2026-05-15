import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applySeedanceVideoInputMultiplier,
  formatSeedanceVideoInputMultiplier,
  normalizeSeedanceVideoInputMultiplier
} from './seedanceVideoInputMultiplier.js'

test('normalizes custom positive Seedance video input multipliers', () => {
  assert.equal(normalizeSeedanceVideoInputMultiplier('1.1'), 1.1)
  assert.equal(normalizeSeedanceVideoInputMultiplier(1.5), 1.5)
  assert.equal(normalizeSeedanceVideoInputMultiplier('2.25'), 2.25)
})

test('falls back to 1 for invalid Seedance video input multipliers', () => {
  assert.equal(normalizeSeedanceVideoInputMultiplier(''), 1)
  assert.equal(normalizeSeedanceVideoInputMultiplier(0), 1)
  assert.equal(normalizeSeedanceVideoInputMultiplier(-2), 1)
  assert.equal(normalizeSeedanceVideoInputMultiplier('abc'), 1)
})

test('applies Seedance video input multiplier only when video input exists', () => {
  assert.equal(applySeedanceVideoInputMultiplier(60, 1.5, true), 90)
  assert.equal(applySeedanceVideoInputMultiplier(75, 1.1, true), 82.5)
  assert.equal(applySeedanceVideoInputMultiplier(60, 2, false), 60)
})

test('formats custom Seedance video input multiplier labels', () => {
  assert.equal(formatSeedanceVideoInputMultiplier('1.25'), '1.25x')
})
