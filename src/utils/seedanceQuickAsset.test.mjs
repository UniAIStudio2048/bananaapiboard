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

test('a saved pending video review uses the provider-approved asset URI in its original slot', async () => {
  const { refreshPendingSeedanceVideoReferences } = await import('./seedanceQuickAsset.js')
  const sourceUrl = 'https://cdn.example/source.mp4'
  const otherUrl = 'https://cdn.example/second.mp4'
  const quick = { assetId: 'reviewed-video', assetUri: 'asset://reviewed-video', assetType: 'Video', status: 'Processing', providerType: 'stars_asset', groupId: 'group-1' }
  const updates = []
  const urls = await refreshPendingSeedanceVideoReferences([otherUrl, sourceUrl], [
    { id: 'node-1', data: { output: { url: sourceUrl }, seedanceQuickAsset: quick } }
  ], {
    async loadAsset(id, options) {
      assert.equal(id, quick.assetId)
      assert.deepEqual(options, { providerType: 'stars_asset', groupId: 'group-1' })
      return { asset: { Id: id, Status: 'Active' } }
    },
    updateAsset(id, asset) { updates.push({ id, asset }) }
  })
  assert.deepEqual(urls, [otherUrl, 'asset://reviewed-video'])
  assert.equal(updates[0].id, 'node-1')
  assert.equal(updates[0].asset.status, 'Active')
  assert.equal(updates[0].asset.sourceUrl, sourceUrl)
})

test('a pending or failed video review never becomes an approved reference', async () => {
  const { refreshPendingSeedanceVideoReferences } = await import('./seedanceQuickAsset.js')
  const sourceUrl = 'https://cdn.example/source.mp4'
  const quick = { assetId: 'video', assetUri: 'asset://video', assetType: 'Video', status: 'Processing', sourceUrl }
  const nodes = [{ id: 'node-1', data: { sourceVideo: sourceUrl, seedanceQuickAsset: quick } }]
  for (const [status, message] of [['Processing', /仍在审核/], ['Failed', /审核未通过/]]) {
    await assert.rejects(refreshPendingSeedanceVideoReferences([sourceUrl], nodes, {
      loadAsset: async () => ({ asset: { Id: 'video', Status: status } }),
      updateAsset() {}
    }), message)
  }
  assert.deepEqual(await refreshPendingSeedanceVideoReferences([sourceUrl], [
    { id: 'node-1', data: { sourceVideo: sourceUrl, seedanceQuickAsset: { ...quick, sourceUrl: 'https://cdn.example/replaced.mp4' } } }
  ], {
    loadAsset() { assert.fail('review for a replaced media source must not be used') },
    updateAsset() {}
  }), [sourceUrl])
})
