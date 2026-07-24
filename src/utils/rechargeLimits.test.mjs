import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRechargeLimits } from './rechargeLimits.js'

test('frontend recharge limits use tenant values with 1-10000 defaults', () => {
  assert.deepEqual(normalizeRechargeLimits(), { minAmount: 1, maxAmount: 10000 })
  assert.deepEqual(normalizeRechargeLimits({ minAmount: 5, maxAmount: 50000 }), {
    minAmount: 5,
    maxAmount: 50000
  })
})

test('frontend recharge limits never exceed the 100000 yuan platform ceiling', () => {
  assert.deepEqual(normalizeRechargeLimits({ minAmount: 1, maxAmount: 200000 }), {
    minAmount: 1,
    maxAmount: 100000
  })
})
