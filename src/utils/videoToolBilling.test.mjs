import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateSubtitleEraseBilling } from './videoToolBilling.js'

test('subtitle erase billing charges at least one minute', () => {
  assert.deepEqual(calculateSubtitleEraseBilling({ totalSeconds: 15, pricePerMinute: 12 }), {
    totalSeconds: 15,
    billedMinutes: 1,
    pointsCost: 12
  })
})

test('subtitle erase billing rounds up started minutes', () => {
  assert.deepEqual(calculateSubtitleEraseBilling({ totalSeconds: 61, pricePerMinute: 8 }), {
    totalSeconds: 61,
    billedMinutes: 2,
    pointsCost: 16
  })
})
