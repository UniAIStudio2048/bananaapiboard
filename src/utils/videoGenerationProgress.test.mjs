import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getVideoGenerationElapsedSeconds,
  getVideoGenerationProgressText,
  hasVideoGenerationTimedOut,
  shouldShowVideoGenerationTimeoutHint
} from './videoGenerationProgress.js'

test('video generation progress text shows live elapsed runtime without percent or estimate copy', () => {
  const task = { created_at: 1_000 }
  const text = getVideoGenerationProgressText(task, 11_000)

  assert.equal(text, '生成中10s')
  assert.doesNotMatch(text, /%/)
  assert.doesNotMatch(text, /预计|分钟/)
})

test('video generation progress text formats longer elapsed runtime', () => {
  const task = { created_at: '2026-05-09T12:00:00.000Z' }

  assert.equal(getVideoGenerationProgressText(task, Date.parse('2026-05-09T12:01:05.000Z')), '生成中1m 05s')
})

test('timeout hint appears only after elapsed runtime is greater than three times average generation time', () => {
  const task = { created_at: 0 }
  const averageSeconds = 90

  assert.equal(shouldShowVideoGenerationTimeoutHint(task, averageSeconds * 3 * 1000, averageSeconds), false)
  assert.equal(shouldShowVideoGenerationTimeoutHint(task, averageSeconds * 3 * 1000 + 1000, averageSeconds), true)
})

test('timeout hint stays hidden until a real average generation time is available', () => {
  const task = { created_at: 0 }

  assert.equal(shouldShowVideoGenerationTimeoutHint(task, 10 * 60 * 1000, null), false)
  assert.equal(shouldShowVideoGenerationTimeoutHint(task, 10 * 60 * 1000, undefined), false)
})

test('official and third-party Wan 3 API warnings start at 20 minutes regardless of model stats', () => {
  const start = Date.parse('2026-05-13T12:00:00.000Z')
  const threshold = 20 * 60 * 1000
  const channels = ['wan3', 'routerbee-wan3', 'atlascloud-wan3', 'wavespeed-wan3', 'siray-wan3', 'grsai-wan3']
  for (const apiType of channels) {
    const task = { processingStartedAt: start }
    assert.equal(shouldShowVideoGenerationTimeoutHint(task, start + threshold - 1, 60, { apiType }), false, apiType)
    assert.equal(shouldShowVideoGenerationTimeoutHint(task, start + threshold, null, { apiType }), true, apiType)
    assert.equal(shouldShowVideoGenerationTimeoutHint(task, start + threshold, 900, { apiType }), true, apiType)
  }
})

test('Wan 3 history and generic third-party model IDs use the same warning threshold', () => {
  const start = Date.parse('2026-05-13T12:00:00.000Z')
  const task = { created_at: start / 1000, model: 'wan3api' }
  assert.equal(shouldShowVideoGenerationTimeoutHint(task, start + 13 * 60 * 1000, 120), false)
  assert.equal(shouldShowVideoGenerationTimeoutHint(task, start + 20 * 60 * 1000), true)

  const modelConfig = { apiType: 'atlascloud-video', actualModel: 'alibaba/wan-3.0-prime/image-to-video' }
  assert.equal(shouldShowVideoGenerationTimeoutHint({ created_at: start }, start + 19 * 60 * 1000, 120, modelConfig), false)
  assert.equal(shouldShowVideoGenerationTimeoutHint({ created_at: start }, start + 20 * 60 * 1000, 120, modelConfig), true)
  assert.equal(shouldShowVideoGenerationTimeoutHint({}, start, 120, modelConfig), false)
})

test('elapsed seconds is clamped for missing or future timestamps', () => {
  assert.equal(getVideoGenerationElapsedSeconds({}, 10_000), 0)
  assert.equal(getVideoGenerationElapsedSeconds({ created_at: 20_000 }, 10_000), 0)
})

test('elapsed seconds supports video node processing start timestamps', () => {
  assert.equal(getVideoGenerationElapsedSeconds({ processingStartedAt: 2_000 }, 108_000), 106)
})

test('video timeout check handles ISO, seconds, and millisecond created_at values', () => {
  const now = Date.parse('2026-05-13T12:00:00.000Z')
  const timeoutMs = 80 * 60 * 1000

  assert.equal(hasVideoGenerationTimedOut({
    status: 'PROCESSING',
    created_at: '2026-05-13T10:39:00.000Z'
  }, now, timeoutMs), true)

  assert.equal(hasVideoGenerationTimedOut({
    status: 'queued',
    created_at: Math.floor((now - timeoutMs - 1000) / 1000)
  }, now, timeoutMs), true)

  assert.equal(hasVideoGenerationTimedOut({
    status: 'processing',
    created_at: now - timeoutMs + 1000
  }, now, timeoutMs), false)
})
