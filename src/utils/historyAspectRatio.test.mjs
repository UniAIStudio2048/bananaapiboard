import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getHistoryAspectRatio,
  getHistoryAspectRatioStyle,
  normalizeHistoryAspectRatio
} from './historyAspectRatio.js'

test('normalizes history aspect ratios for CSS use', () => {
  assert.equal(normalizeHistoryAspectRatio('16:9'), '16 / 9')
  assert.equal(normalizeHistoryAspectRatio('9 / 16'), '9 / 16')
  assert.equal(normalizeHistoryAspectRatio('1.5'), '1.5')
  assert.equal(normalizeHistoryAspectRatio('', '4 / 3'), '4 / 3')
})

test('extracts aspect ratio style from history records', () => {
  assert.equal(getHistoryAspectRatio({ aspect_ratio: '4:3' }), '4 / 3')
  assert.deepEqual(getHistoryAspectRatioStyle({ aspectRatio: '3:4' }), { aspectRatio: '3 / 4' })
})
