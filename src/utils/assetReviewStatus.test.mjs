import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAssetReviewStatus } from './assetReviewStatus.js'

test('normalizes terminal asset review statuses returned by different providers', () => {
  for (const status of ['Active', 'approved', 'SUCCESS', 'completed']) {
    assert.equal(normalizeAssetReviewStatus(status), 'Active')
  }

  for (const status of ['Failed', 'rejected', 'ERROR', 'timed_out']) {
    assert.equal(normalizeAssetReviewStatus(status), 'Failed')
  }

  assert.equal(normalizeAssetReviewStatus('Processing'), 'Processing')
})
