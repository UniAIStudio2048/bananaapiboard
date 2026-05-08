import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAvailableImageResolutionOptions,
  getImageResolutionCost,
  normalizeImageSelectedSize
} from './canvasImageResolutionOptions.js'

test('only exposes enabled resolution pricing entries with positive points', () => {
  const model = {
    pointsCost: { '1k': 0, '2k': 5, '3k': 8, '4k': 12 },
    resolutionEnabled: { '1k': false, '2k': true, '3k': true, '4k': false }
  }

  assert.deepEqual(getAvailableImageResolutionOptions(model), [
    { value: '2K', label: '2K', pointsCost: 5 },
    { value: '3K', label: '3K', pointsCost: 8 }
  ])
  assert.equal(getImageResolutionCost(model, '2K'), 5)
  assert.equal(getImageResolutionCost(model, '3K'), 8)
  assert.equal(normalizeImageSelectedSize(model, '1K'), '2K')
})

test('hides zero-point resolution entries even when enabled is omitted', () => {
  const model = {
    pointsCost: { '1k': 0, '2k': 5, '3k': 8, '4k': 0 }
  }

  assert.deepEqual(
    getAvailableImageResolutionOptions(model).map(option => option.value),
    ['2K', '3K']
  )
})

test('hides explicitly disabled positive-cost resolution entries', () => {
  const model = {
    pointsCost: { '1k': 3, '2k': 5, '3k': 8, '4k': 12 },
    resolutionEnabled: { '1k': true, '2k': false, '3k': false, '4k': true }
  }

  assert.deepEqual(
    getAvailableImageResolutionOptions(model).map(option => option.value),
    ['1K', '4K']
  )
  assert.equal(normalizeImageSelectedSize(model, '2K'), '1K')
  assert.equal(getImageResolutionCost(model, '2K'), 3)
})

test('keeps fixed pointsCost models compatible', () => {
  const model = { pointsCost: 6 }

  assert.deepEqual(getAvailableImageResolutionOptions(model), [
    { value: '1K', label: '1K', pointsCost: 6 },
    { value: '2K', label: '2K', pointsCost: 6 },
    { value: '4K', label: '4K', pointsCost: 6 }
  ])
  assert.equal(getImageResolutionCost(model, '4K'), 6)
  assert.equal(normalizeImageSelectedSize(model, '3K'), '1K')
})
