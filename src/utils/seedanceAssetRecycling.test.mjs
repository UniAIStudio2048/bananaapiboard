import test from 'node:test'
import assert from 'node:assert/strict'
import { isSeedanceAssetReusable, getSeedanceRecyclingStatus } from './seedanceAssetRecycling.js'

test('only opted-in expired assets remain available for re-review', () => {
  assert.equal(isSeedanceAssetReusable({ Status: 'Active' }), true)
  assert.equal(isSeedanceAssetReusable({ Status: 'Expired' }), false)
  assert.equal(isSeedanceAssetReusable({ Status: 'Expired', recyclingManaged: true }), true)
  assert.equal(isSeedanceAssetReusable({ Status: 'Failed', recyclingManaged: true }), false)
  assert.equal(isSeedanceAssetReusable({ Status: 'Processing', recyclingManaged: true }), false)
})
test('24-hour expiry is displayed even before the next backend sweep', () => {
  const a = { status: 'Active', recyclingManaged: true, expiresAt: '2026-10-31T12:00:00Z' }
  assert.equal(getSeedanceRecyclingStatus(a, Date.parse(a.expiresAt) - 1), 'Active')
  assert.equal(getSeedanceRecyclingStatus(a, Date.parse(a.expiresAt)), 'Expired')
  assert.equal(getSeedanceRecyclingStatus({ ...a, recyclingManaged: false }, Date.parse(a.expiresAt)), 'Active')
})
