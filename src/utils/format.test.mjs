import test from 'node:test'
import assert from 'node:assert/strict'

import { formatPoints, sumPoints } from './format.js'

test('formatPoints keeps up to two decimals and rounds the third decimal', () => {
  assert.equal(formatPoints(1.5), '1.5')
  assert.equal(formatPoints(-1.5), '-1.5')
  assert.equal(formatPoints(1.555), '1.56')
  assert.equal(formatPoints(1.554), '1.55')
  assert.equal(formatPoints('12.999'), '13')
  assert.equal(formatPoints(-3.195), '-3.2')
})

test('formatPoints omits trailing zeros', () => {
  assert.equal(formatPoints(10), '10')
  assert.equal(formatPoints(10.00), '10')
  assert.equal(formatPoints(10.5), '10.5')
  assert.equal(formatPoints(10.50), '10.5')
  assert.equal(formatPoints(0), '0')
})

test('sumPoints 个人空间（无团队积分）等于套餐 + 永久', () => {
  assert.equal(sumPoints(0, 100, 50), '150')
  assert.equal(sumPoints(undefined, 100, 50), '150')
  assert.equal(sumPoints(null, 100, 50), '150')
})

test('sumPoints 团队空间 = 团队积分 + 套餐 + 永久', () => {
  assert.equal(sumPoints(300, 100, 50), '450')
  assert.equal(sumPoints(12.34, 0, 0), '12.34')
  assert.equal(sumPoints('300', '100.5', 50.25), '450.75')
})

test('sumPoints 全部为空时返回 0', () => {
  assert.equal(sumPoints(), '0')
  assert.equal(sumPoints(undefined, undefined, undefined), '0')
  assert.equal(sumPoints('abc', NaN, null), '0')
})
