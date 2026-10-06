import test from 'node:test'
import assert from 'node:assert/strict'
import { getTotalUserPoints, toPointsNumber } from './points.js'
import * as points from './points.js'

test('permanent point display includes allocated decimal points without mutating account balances', () => {
  const user = Object.freeze({ points: '30.25', subuser_points: '100.50', package_points: '20', team_points: 50 })
  assert.equal(points.getPermanentUserPoints(user), 130.75)
  assert.equal(getTotalUserPoints(user), 150.75)
  assert.equal(user.points, '30.25')
  assert.equal(user.subuser_points, '100.50')
})

test('permanent point display handles allocation only, ordinary accounts and missing fields', () => {
  assert.equal(points.getPermanentUserPoints({ subuser_points: '100.50' }), 100.5)
  assert.equal(points.getPermanentUserPoints({ points: '74272.08' }), 74272.08)
  assert.equal(points.getPermanentUserPoints({ points: 'abc', subuser_points: null }), 0)
  assert.equal(points.getPermanentUserPoints(null), 0)
})

test('allocated consumption, reclaim and refund updates are reflected without double counting', () => {
  const user = { points: '30', package_points: '20', subuser_points: '100' }
  for (const [allocated, expected] of [['100', 130], ['70', 100], ['0', 30], ['15.5', 45.5]]) {
    user.subuser_points = allocated
    assert.equal(points.getPermanentUserPoints(user), expected)
    assert.equal(getTotalUserPoints(user), expected + 20)
  }
})

test('getTotalUserPoints adds decimal string package and permanent points numerically', () => {
  assert.equal(getTotalUserPoints({ package_points: '43.50', points: '87093.30' }), 87136.8)
})

test('getTotalUserPoints treats missing or invalid point fields as zero', () => {
  assert.equal(getTotalUserPoints({ package_points: null, points: 'abc' }), 0)
  assert.equal(toPointsNumber(undefined), 0)
})
