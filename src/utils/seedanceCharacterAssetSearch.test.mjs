import assert from 'node:assert/strict'
import test from 'node:test'

import {
  matchesSeedanceCharacterAssetSearch,
  getSeedanceCharacterAssetSearchText
} from './seedanceCharacterAssetSearch.js'

test('matches Seedance character assets by full and partial asset id', () => {
  const asset = {
    Name: '角色素材',
    Id: 'asset-20260521112047-btrdj'
  }

  assert.equal(matchesSeedanceCharacterAssetSearch(asset, 'asset-20260521112047-btrdj'), true)
  assert.equal(matchesSeedanceCharacterAssetSearch(asset, '21112047'), true)
  assert.equal(matchesSeedanceCharacterAssetSearch(asset, 'BTRDJ'), true)
})

test('matches asset ids stored in uri and metadata fields', () => {
  const asset = {
    Name: 'local record',
    id: 'canvas-local-id',
    url: 'asset://asset-20260521112047-btrdj',
    metadata: {
      assetId: 'asset-20260521112047-btrdj',
      assetUri: 'asset://asset-20260521112047-btrdj'
    }
  }

  assert.equal(matchesSeedanceCharacterAssetSearch(asset, 'asset-20260521112047'), true)
  assert.equal(matchesSeedanceCharacterAssetSearch(asset, 'asset://asset-20260521112047-btrdj'), true)
})

test('builds searchable text from face code fields without throwing on string metadata', () => {
  const text = getSeedanceCharacterAssetSearchText({
    Name: 'Hero',
    FaceCode: 'face_hero_01',
    metadata: '{"faceCode":"face_meta_02","assetId":"asset-meta-1"}'
  })

  assert.match(text, /hero/)
  assert.match(text, /face_hero_01/)
  assert.match(text, /face_meta_02/)
  assert.match(text, /asset-meta-1/)
})
