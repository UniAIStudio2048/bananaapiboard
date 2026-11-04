import test from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
}

const {
  captureSignupSource,
  getSignupSource,
  initialSignupSourceChoice,
  resolveSignupSource
} = await import('./signupSource.js')

test('captures and sanitizes utm_source first', () => {
  store.clear()
  captureSignupSource('?from=xianyu&utm_source=DouYin%20Ads!&src=x')
  assert.equal(getSignupSource(), 'douyinads')
})

test('falls back to from then src', () => {
  store.clear()
  captureSignupSource('?src=bilibili')
  assert.equal(getSignupSource(), 'bilibili')
  store.clear()
  captureSignupSource('?from=xianyu&src=bilibili')
  assert.equal(getSignupSource(), 'xianyu')
})

test('first touch wins', () => {
  store.clear()
  captureSignupSource('?utm_source=douyin')
  captureSignupSource('?utm_source=xiaohongshu')
  assert.equal(getSignupSource(), 'douyin')
})

test('limits length to 64 and ignores empty values', () => {
  store.clear()
  captureSignupSource('?utm_source=' + 'a'.repeat(100))
  assert.equal(getSignupSource().length, 64)
  store.clear()
  captureSignupSource('?utm_source=%E6%8A%96%E9%9F%B3')
  assert.equal(getSignupSource(), '')
})

test('preselects only known options and prefers explicit choice', () => {
  store.clear()
  captureSignupSource('?utm_source=douyin')
  assert.equal(initialSignupSourceChoice(), 'douyin')
  assert.equal(resolveSignupSource('friend'), 'friend')
  assert.equal(resolveSignupSource(''), 'douyin')
  store.clear()
  captureSignupSource('?utm_source=newsletter')
  assert.equal(initialSignupSourceChoice(), '')
  assert.equal(resolveSignupSource(''), 'newsletter')
  store.clear()
  assert.equal(resolveSignupSource(''), '')
})

test('swallows storage errors', () => {
  const original = globalThis.localStorage
  globalThis.localStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.doesNotThrow(() => captureSignupSource('?utm_source=douyin'))
  assert.equal(getSignupSource(), '')
  globalThis.localStorage = original
})
