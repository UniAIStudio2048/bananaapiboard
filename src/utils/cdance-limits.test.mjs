import test from 'node:test'
import assert from 'node:assert/strict'
import { isSeedance25Model, resolveSeedance2Limits, getSeedance25ModeConstraints } from './seedance2Limits.js'

test('CDance 2.5 canvas has 30-second output and official editing constraints', () => {
  const model = { name: 'ctyun-cdance-2.5', actualModel: 'cdance2.5-0807' }
  assert.equal(isSeedance25Model(model), true)
  assert.equal(resolveSeedance2Limits(model).maxDuration, 30)
  assert.equal(getSeedance25ModeConstraints(model, 'video_edit').duration, -1)
  assert.equal(isSeedance25Model('cdance2.0-fast-0807'), false)
  assert.equal(isSeedance25Model('cdance2.50-0807'), false)
})
