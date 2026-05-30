import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAssetPanelStats,
  getAssetPanelTagCounts,
  getAssetPanelUserTags,
  getVisibleAssetPanelAssets
} from './assetPanelVisibility.js'

const assets = [
  { id: 'text-1', type: 'text', name: 'Visible copy', tags: ['keep'], is_favorite: true },
  { id: 'sora-hidden', type: 'sora-character', name: 'Hidden Sora', tags: ['hidden'] },
  { id: 'seedance-active', type: 'seedance-character', name: 'Active Seedance', tags: ['keep'], metadata: { groupId: 'active-group' } },
  { id: 'seedance-old-channel', type: 'seedance-character', name: 'Old Seedance', tags: ['hidden'], metadata: { groupId: 'old-group' } },
  { id: 'seedance-openapi', type: 'seedance-openapi-pro-character', name: 'OpenAPI Seedance', tags: ['hidden'], metadata: { groupId: 'seedance-openapi-pro-default' } },
  { id: 'seedance-quick', type: 'seedance-quick-character', name: 'Quick internal', tags: ['hidden'], metadata: { groupId: '__quick__' } },
  { id: 'bytefor-hidden', type: 'bytefor-character', name: 'Hidden Bytefor', tags: ['hidden'], metadata: { groupId: 'seedance-openapi-pro-default' } }
]

const visibleClassicContext = {
  seedanceFeaturesEnabled: true,
  soraCharacterLibraryEnabled: false,
  byteforCharacterLibraryEnabled: false,
  seedanceActiveProvider: 'volcengine',
  seedanceActiveGroupIds: ['active-group']
}

test('asset panel all view excludes hidden libraries and inactive Seedance channels', () => {
  const visible = getVisibleAssetPanelAssets(assets, {
    ...visibleClassicContext,
    selectedType: 'all',
    selectedTag: 'all',
    searchQuery: ''
  })

  assert.deepEqual(visible.map(asset => asset.id), ['text-1', 'seedance-active'])
})

test('asset panel stats and tag counts use the same visibility rules as the all view', () => {
  const stats = getAssetPanelStats(assets, visibleClassicContext)
  const tagCounts = getAssetPanelTagCounts(assets, {
    ...visibleClassicContext,
    selectedType: 'all',
    searchQuery: ''
  })

  assert.equal(stats.all, 2)
  assert.equal(stats.text, 1)
  assert.equal(stats['sora-character'], 0)
  assert.equal(stats['seedance-character'], 1)
  assert.equal(stats['bytefor-character'], 0)
  assert.deepEqual(tagCounts, { all: 2, favorite: 1, keep: 2 })
})

test('asset panel user tags exclude tags that only belong to hidden assets', () => {
  assert.deepEqual(getAssetPanelUserTags(assets, visibleClassicContext), ['keep'])
})

test('Seedance OpenAPI Pro assets are visible only when that provider is active', () => {
  const visible = getVisibleAssetPanelAssets(assets, {
    seedanceFeaturesEnabled: true,
    soraCharacterLibraryEnabled: false,
    byteforCharacterLibraryEnabled: false,
    seedanceActiveProvider: 'seedance_openapi_pro',
    seedanceActiveGroupIds: ['seedance-openapi-pro-default'],
    selectedType: 'seedance-character',
    selectedTag: 'all',
    searchQuery: ''
  })

  assert.deepEqual(visible.map(asset => [asset.id, asset.type]), [
    ['seedance-openapi', 'seedance-character']
  ])
})
