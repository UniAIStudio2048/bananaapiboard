import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getMaskBrushAlpha,
  getMaskBrushFeatherRadius,
  normalizeMaskBrushSettings
} from './nativeMaskBrushSettings.js'

test('normalizes mask brush size hardness and opacity for editor controls', () => {
  assert.deepEqual(
    normalizeMaskBrushSettings({ size: 160, hardness: -20, opacity: 0 }),
    { size: 100, hardness: 0, opacity: 1 }
  )

  assert.deepEqual(
    normalizeMaskBrushSettings({ size: 'bad', hardness: 'bad', opacity: 'bad' }),
    { size: 10, hardness: 100, opacity: 100 }
  )
})

test('derives soft mask brush feather and alpha from hardness and opacity', () => {
  assert.equal(getMaskBrushFeatherRadius(40, 100), 0)
  assert.equal(getMaskBrushFeatherRadius(40, 50), 10)
  assert.equal(getMaskBrushFeatherRadius(40, 0), 20)
  assert.equal(getMaskBrushAlpha(48), 0.48)
})

test('supports the same hardness and opacity calculation for draw brushes', () => {
  const settings = normalizeMaskBrushSettings({ size: 30, hardness: 25, opacity: 60 })

  assert.equal(getMaskBrushFeatherRadius(settings.size, settings.hardness), 11.25)
  assert.equal(getMaskBrushAlpha(settings.opacity), 0.6)
})
