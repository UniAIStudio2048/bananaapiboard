import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSeedanceQuickAsset,
  getSeedanceQuickAssetStatus,
  getVideoReferenceImageUrlForTarget,
  SEEDANCE_QUICK_ASSET_TTL_MS
} from './seedanceQuickAsset.js'

test('active quick asset resolves to asset URI for Seedance 2 target only', () => {
  const now = Date.parse('2026-05-09T00:00:00.000Z')
  const sourceNode = {
    data: {
      seedanceQuickAsset: {
        assetId: 'asset-1',
        assetUri: 'asset://asset-1',
        status: 'Active',
        expiresAt: new Date(now + SEEDANCE_QUICK_ASSET_TTL_MS).toISOString()
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

test('expired quick asset is marked invalid and falls back to original URL', () => {
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
  assert.equal(state.active, false)
  assert.equal(state.expired, true)
  assert.equal(getSeedanceQuickAssetStatus(sourceNode.data, now), 'expired')
  assert.equal(
    getVideoReferenceImageUrlForTarget(sourceNode, 'https://cdn.example/image.png', true, now),
    'https://cdn.example/image.png'
  )
})
