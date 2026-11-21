import test from 'node:test'
import assert from 'node:assert/strict'
import { captureSignupSource, getSignupAttribution } from './signupSource.js'

const store = new Map()
const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) }
const origin = 'https://example.com'

test('tags paid clicks without retaining click identifiers', () => {
  store.clear()
  captureSignupSource({ href: origin + '/?from=ignored&utm_source=Bing&utm_medium=cpc&msclkid=private', storage })
  const attribution = getSignupAttribution(storage)
  assert.equal(attribution.source, 'bing')
  assert.equal(attribution.medium, 'cpc')
  assert.equal(attribution.paidClick, true)
  assert.ok(!JSON.stringify(attribution).includes('private'))
})

test('keeps the first identifiable landing source before registration', () => {
  store.clear()
  captureSignupSource({ href: origin, storage })
  captureSignupSource({ href: origin + '/community', referrer: 'https://www.bing.com/?q=private', storage })
  captureSignupSource({ href: origin + '/?utm_source=douyin', storage })
  storage.setItem('nb_vid', 'v_test_123')
  assert.deepEqual(getSignupAttribution(storage), {
    origin, referrer: 'https://www.bing.com', source: '', medium: '', paidClick: false, visitorId: 'v_test_123', landingPath: '/community'
  })
})

test('passes the stand-alone guide entry through the WeChat callback', () => {
  store.clear()
  captureSignupSource({ href: origin + '/guide/libtv-alternative?utm_source=douyin&utm_medium=organic_social&utm_campaign=three-shots', storage })
  storage.setItem('nb_vid', 'v_test_123')
  captureSignupSource({ href: origin + '/wechat/callback?code=private', storage })
  assert.deepEqual(getSignupAttribution(storage), {
    origin, referrer: '', source: 'douyin', medium: 'organic_social', campaign: 'three-shots',
    paidClick: false, visitorId: 'v_test_123', landingPath: '/guide/libtv-alternative'
  })
})
