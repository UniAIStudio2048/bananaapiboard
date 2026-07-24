import test from 'node:test'
import assert from 'node:assert/strict'

import { getApiErrorMessage } from './apiErrorMessage.js'

test('prefers channel detail when the backend message is generic', () => {
  assert.equal(
    getApiErrorMessage({
      error: 'all_channels_failed',
      message: '所有视频生成渠道都不可用，请稍后重试',
      detail: '渠道 seedance-default 返回错误: 503 - provider account pool exhausted'
    }),
    'provider account pool exhausted'
  )
})

test('keeps a concrete backend message ahead of internal detail', () => {
  assert.equal(
    getApiErrorMessage({
      error: 'invalid_reference_video',
      message: '参考视频1分辨率过低，请提升分辨率后重试',
      detail: 'internal probe output'
    }),
    '参考视频1分辨率过低，请提升分辨率后重试'
  )
})

test('extracts nested details when message is missing', () => {
  assert.equal(
    getApiErrorMessage({
      error: 'generation_failed',
      details: { error: { message: 'provider rejected reference video format' } }
    }),
    'provider rejected reference video format'
  )
})
