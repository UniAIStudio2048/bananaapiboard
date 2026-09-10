import test from 'node:test'
import assert from 'node:assert/strict'

import { formatPoints, sumPoints, formatMoney, formatMoneyAmount } from './format.js'

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

test('formatMoney 分转当前货币并带符号（默认 CNY）', () => {
  assert.equal(formatMoney(1000), '¥10.00')
  assert.equal(formatMoney(1000, 'CNY'), '¥10.00')
  assert.equal(formatMoney(1000, 'USD'), '$10.00')
  assert.equal(formatMoney(0, 'USD'), '$0.00')
  assert.equal(formatMoney(-550, 'USD'), '$-5.50')
})

test('formatMoney 对非法输入回退为 0.00', () => {
  assert.equal(formatMoney(null, 'USD'), '$0.00')
  assert.equal(formatMoney(undefined), '¥0.00')
  assert.equal(formatMoney('abc', 'USD'), '$0.00')
})

test('formatMoneyAmount 返回不带符号的金额字符串', () => {
  assert.equal(formatMoneyAmount(1000), '10.00')
  assert.equal(formatMoneyAmount(1000, 'USD'), '10.00')
  assert.equal(formatMoneyAmount(null), '0.00')
})
