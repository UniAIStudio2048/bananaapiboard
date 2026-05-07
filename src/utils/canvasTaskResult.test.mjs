import test from 'node:test'
import assert from 'node:assert/strict'

import { getTaskMediaUrl, normalizeTaskMediaResult } from './canvasTaskResult.js'

test('does not treat Seedance copyright result_url text as a video output URL', () => {
  const errorText = 'The request failed because the output video may be related to copyright restrictions. Request id: 02177815108988300000000000000000000ffffac190daf147628'

  const result = normalizeTaskMediaResult({
    status: 'succeeded',
    result_url: errorText
  }, 'video')

  assert.equal(getTaskMediaUrl(result, 'video'), null)
  assert.equal(result.hasOutput, false)
  assert.equal(result.error, errorText)
})

test('detects copyright failure text in nested data.result_url', () => {
  const errorText = 'The request failed because the output video may be related to copyright restrictions.'

  const result = normalizeTaskMediaResult({
    status: 'succeeded',
    data: { result_url: errorText }
  }, 'video')

  assert.equal(getTaskMediaUrl(result, 'video'), null)
  assert.equal(result.hasOutput, false)
  assert.equal(result.error, errorText)
  assert.equal(result.fail_reason, errorText)
})

test('treats valid result_url URL as video output', () => {
  const url = 'https://example.com/video.mp4'

  const result = normalizeTaskMediaResult({
    status: 'succeeded',
    result_url: url
  }, 'video')

  assert.equal(getTaskMediaUrl(result, 'video'), url)
  assert.equal(result.hasOutput, true)
  assert.equal(result.video_url, url)
})

test('treats valid nested result.output.result_url URL as video output', () => {
  const url = 'https://cdn.example.com/output.mp4'

  const result = normalizeTaskMediaResult({
    status: 'succeeded',
    result: { output: { result_url: url } }
  }, 'video')

  assert.equal(getTaskMediaUrl(result, 'video'), url)
  assert.equal(result.hasOutput, true)
})

test('treats local media result_url path as video output', () => {
  const url = '/api/images/file/video_123.mp4'

  const result = normalizeTaskMediaResult({
    status: 'succeeded',
    result_url: url
  }, 'video')

  assert.equal(getTaskMediaUrl(result, 'video'), url)
  assert.equal(result.hasOutput, true)
})
