import test from 'node:test'
import assert from 'node:assert/strict'
import { getTotalUserPoints, toPointsNumber } from './points.js'

test('getTotalUserPoints adds decimal string package and permanent points numerically', () => {
  assert.equal(getTotalUserPoints({ package_points: '43.50', points: '87093.30' }), 87136.8)
})

test('getTotalUserPoints treats missing or invalid point fields as zero', () => {
  assert.equal(getTotalUserPoints({ package_points: null, points: 'abc' }), 0)
  assert.equal(toPointsNumber(undefined), 0)
})
