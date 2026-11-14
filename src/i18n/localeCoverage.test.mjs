import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'

const files = (await readdir(new URL('./locales/', import.meta.url))).filter(file => file.endsWith('.js'))
const locales = Object.fromEntries(await Promise.all(files.map(async file => [file.slice(0, -3), (await import(`./locales/${file}`)).default])))
const flatten = (value, prefix = '', result = {}) => {
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof item === 'string') result[path] = item
    else if (item && typeof item === 'object') flatten(item, path, result)
  }
  return result
}
const reference = flatten(locales['zh-CN'])
const currencyMessages = new Set(['user.exchangeRateHint', 'user.enterTransferAmount', 'user.minTransferAmount', 'user.customAmountHint', 'user.minRechargeAmount', 'user.maxRechargeAmount'])
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

for (const [language, messages] of Object.entries(locales)) {
  test(`${language}: all UI messages exist with matching interpolation parameters`, () => {
    const translated = flatten(messages)
    const failures = []
    for (const [key, text] of Object.entries(reference)) {
      if (currencyMessages.has(key)) assert.ok(placeholders(translated[key] || '').every(param => ['unit', 'symbol', 'rate', 'amount'].includes(param)), `${language} ${key}: unsupported currency parameter`)
      if (!translated[key]?.trim()) failures.push(`${key}: missing`)
      else if (!currencyMessages.has(key) && JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(translated[key]))) failures.push(`${key}: interpolation parameters differ`)
    }
    assert.deepEqual(failures, [])
  })
}
