import test from 'node:test'
import assert from 'node:assert/strict'

import { calculateAudioPointsCost } from './audioPricing.js'

test('audio synthesis charges each started 100-character block', () => {
  assert.equal(calculateAudioPointsCost(5, ''), 5)
  assert.equal(calculateAudioPointsCost(5, 'a'.repeat(100)), 5)
  assert.equal(calculateAudioPointsCost(5, 'a'.repeat(103)), 10)
  assert.equal(calculateAudioPointsCost(5, 'a'.repeat(206)), 15)
})
