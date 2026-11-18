import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSeedanceQuickAsset,
  getSeedanceQuickAssetStatus,
  getVideoReferenceImageUrlForTarget
} from './seedanceQuickAsset.js'

test('active quick asset resolves to asset URI for Seedance 2 target only', () => {
  const now = Date.parse('2026-05-09T00:00:00.000Z')
  const sourceNode = {
    data: {
      seedanceQuickAsset: {
        assetId: 'asset-1',
        assetUri: 'asset://asset-1',
        status: 'Active'
      }
    }
  }

  assert.equal(getSeedanceQuickAssetStatus(sourceNode.data, now), 'approved')
  assert.equal(
    getVideoReferenceImageUrlForTarget(sourceNode, 'https://cdn.example/image.png', true, now),
    'asset://asset-1'
  )
  assert.equal(
    getVideoReferenceImageUrlForTarget(sourceNode, 'https://cdn.example/image.png', false, now),
    'https://cdn.example/image.png'
  )
})

test('legacy fixed expiry does not hide an approved quick asset', () => {
  const now = Date.parse('2026-05-09T00:00:00.000Z')
  const sourceNode = {
    data: {
      seedanceQuickAsset: {
        assetId: 'asset-1',
        assetUri: 'asset://asset-1',
        status: 'Active',
        expiresAt: new Date(now - 1).toISOString()
      }
    }
  }

  const state = getSeedanceQuickAsset(sourceNode.data, now)
  assert.equal(state.reviewed, true)
  assert.equal(state.active, true)
  assert.equal(state.expired, false)
  assert.equal(getSeedanceQuickAssetStatus(sourceNode.data, now), 'approved')
  assert.equal(getVideoReferenceImageUrlForTarget(sourceNode, 'https://cdn.example/image.png', true, now), 'asset://asset-1')
})

test('a genuinely expired official quick asset keeps its URI for server-side renewal', () => {
  const data = { seedanceQuickAsset: { assetId: 'old', assetUri: 'asset://old', status: 'Expired', providerType: 'volcengine' } }
  assert.equal(getSeedanceQuickAssetStatus(data), 'expired')
  assert.equal(getVideoReferenceImageUrlForTarget({ data }, 'https://cdn.example/image.png', true), 'asset://old')
  data.seedanceQuickAsset.providerType = 'stars_asset'
  assert.equal(getVideoReferenceImageUrlForTarget({ data }, 'https://cdn.example/image.png', true), 'https://cdn.example/image.png')
})

test('failed quick asset is exposed as failed instead of remaining in review', () => {
  const now = Date.parse('2026-05-09T00:00:00.000Z')
  const data = {
    seedanceQuickAsset: {
      assetId: 'asset-1',
      assetUri: 'asset://asset-1',
      status: 'rejected'
    }
  }

  assert.equal(getSeedanceQuickAsset(data, now).failed, true)
  assert.equal(getSeedanceQuickAssetStatus(data, now), 'failed')
})

test('changing source media invalidates its saved review without deleting the asset', () => {
  for (const assetType of ['Image', 'Video', 'Audio']) {
    const data = { output: { url: 'new-media' }, seedanceQuickAsset: { assetId: 'old', assetUri: 'asset://old', assetType, sourceUrl: 'old-media', status: 'Active' } }
    assert.equal(getSeedanceQuickAssetStatus(data), 'none')
    assert.equal(getVideoReferenceImageUrlForTarget({ data }, 'new-media', true), 'new-media')
  }
})
