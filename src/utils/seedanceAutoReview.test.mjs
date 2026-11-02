import test from 'node:test'
import assert from 'node:assert/strict'
import { isAutoReviewConnected, getAutoReviewMaterials } from './seedanceAutoReview.js'

test('TokenHub joins the official and Stars channels with auto review enabled by default', () => {
  for (const provider of ['volcengine', 'stars_asset', 'tokenhub_asset']) {
    assert.equal(isAutoReviewConnected(provider), true)
    assert.equal(getAutoReviewMaterials(provider, 'model'), true)
  }
  for (const provider of ['', 'thirdparty', 'ctyun_asset']) assert.equal(getAutoReviewMaterials(provider, 'model'), false)
})

test('database user preferences override legacy node settings and carry over to new nodes', () => {
  const preferences = { canvas: { autoReviewMaterials: { model: false } } }
  assert.equal(getAutoReviewMaterials('tokenhub_asset', 'model', {}, preferences), false)
  assert.equal(getAutoReviewMaterials('tokenhub_asset', 'model', { model: true }, preferences), false)
  assert.equal(getAutoReviewMaterials('tokenhub_asset', 'other-model', {}, preferences), true)
  assert.equal(getAutoReviewMaterials('volcengine', 'model', { model: false }), false)
  assert.equal(getAutoReviewMaterials('tokenhub_asset', 'model', { model: false }, { canvas: { autoReviewMaterials: { model: true } } }), true)
})
