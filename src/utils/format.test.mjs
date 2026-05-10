import test from 'node:test'
import assert from 'node:assert/strict'

import { formatPoints } from './format.js'

test('formatPoints keeps up to two decimals and rounds the third decimal', () => {
  assert.equal(formatPoints(1.5), '1.5')
  assert.equal(formatPoints(-1.5), '-1.5')
  assert.equal(formatPoints(1.555), '1.56')
  assert.equal(formatPoints(1.554), '1.55')
  assert.equal(formatPoints('12.999'), '13')
  assert.equal(formatPoints(-3.195), '-3.2')
})

test('formatPoints omits trailing zeros', () => {
  assert.equal(formatPoints(10), '10')
  assert.equal(formatPoints(10.00), '10')
  assert.equal(formatPoints(10.5), '10.5')
  assert.equal(formatPoints(10.50), '10.5')
  assert.equal(formatPoints(0), '0')
})
