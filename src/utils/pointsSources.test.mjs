import test from 'node:test'
import assert from 'node:assert/strict'
import { getPointsSourcesMaxTotal, normalizePointsSources } from './pointsSources.js'

test('normalizePointsSources keeps only positive totals and sorts descending', () => {
  const sources = normalizePointsSources([
    { type: 'checkin', total: '12', count: '2', earned: '12', spent: '0' },
    { type: 'generate_cost', total: 0, count: 5, earned: 0, spent: 30 },
    { type: 'invite', total: '24.5', count: '3', earned: '24.5', spent: 0 }
  ])

  assert.deepEqual(sources.map((source) => source.type), ['invite', 'checkin'])
  assert.equal(sources[0].total, 24.5)
  assert.equal(sources[0].count, 3)
})

test('getPointsSourcesMaxTotal returns zero safely for empty inputs', () => {
  assert.equal(getPointsSourcesMaxTotal([]), 0)
  assert.equal(getPointsSourcesMaxTotal([{ total: '8.2' }, { total: 3 }]), 8.2)
})
