import test from 'node:test'
import assert from 'node:assert/strict'

import {
  localizeExternalMediaErrorPayload,
  resolveExternalMediaErrorMessage
} from './externalMediaError.js'

const payload = {
  status: 'FAILURE',
  fail_reason: 'too many requests',
  error_i18n: {
    source: 'volcengine',
    messages: {
      en: 'too many requests',
      'zh-CN': '请求过多触发限流，请稍后再试',
      'zh-TW': '請求過多觸發限流，請稍後再試'
    }
  }
}

test('uses Simplified Chinese only for zh-CN', () => {
  assert.equal(resolveExternalMediaErrorMessage(payload, 'fallback', 'zh-CN'), '请求过多触发限流，请稍后再试')
})

test('uses Traditional Chinese only for zh-TW', () => {
  assert.equal(resolveExternalMediaErrorMessage(payload, 'fallback', 'zh-TW'), '請求過多觸發限流，請稍後再試')
})

test('uses English for English and every non-Chinese language', () => {
  for (const language of ['en', 'ja', 'ko', 'es', 'fr', 'de', 'ru', 'ar', 'pt', 'ug']) {
    assert.equal(resolveExternalMediaErrorMessage(payload, 'fallback', language), 'too many requests')
  }
})

test('localizes task payload error fields without dropping the structured contract', () => {
  const localized = localizeExternalMediaErrorPayload(payload, 'fallback', 'zh-TW')

  assert.equal(localized.error, '請求過多觸發限流，請稍後再試')
  assert.equal(localized.fail_reason, '請求過多觸發限流，請稍後再試')
  assert.equal(localized.error_i18n, payload.error_i18n)
  assert.equal(localized.status, 'FAILURE')
})

test('preserves existing raw messages when the backend has no localization contract', () => {
  assert.equal(resolveExternalMediaErrorMessage({ message: 'raw upstream failure' }, 'fallback', 'ja'), 'raw upstream failure')
})
