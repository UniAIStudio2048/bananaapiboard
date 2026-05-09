import test from 'node:test'
import assert from 'node:assert/strict'

import { formatPoints } from './format.js'

test('formatPoints truncates to one decimal place without rounding', () => {
  assert.equal(formatPoints(1.29), '1.2')
  assert.equal(formatPoints('12.99'), '12.9')
  assert.equal(formatPoints(-3.19), '-3.1')
})

test('formatPoints omits trailing .0 for whole point values', () => {
  assert.equal(formatPoints(10), '10')
  assert.equal(formatPoints(10.04), '10')
  assert.equal(formatPoints(0), '0')
})
