import test from 'node:test'
import assert from 'node:assert/strict'
import { smsCopy, smsErrorText } from './smsCopy.js'

test('SMS copy supports every existing language and unknown language falls back to English', () => {
  for (const lang of ['zh-CN','zh-TW','ja','ko','es','fr','de','ru','ar','pt','ug']) {
    const copy = smsCopy(lang)
    assert.notEqual(copy.login, smsCopy('en').login, lang)
    for (const key of Object.keys(smsCopy('en'))) assert.ok(copy[key]?.trim(), `${lang}.${key}`)
    assert.equal(smsErrorText({code:'invalid_sms_code'},copy),copy.invalidCode)
  }
  assert.deepEqual(smsCopy('unknown'),smsCopy('en'))
})
