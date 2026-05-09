import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getVideoGenerationElapsedSeconds,
  getVideoGenerationProgressText,
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

test('elapsed seconds is clamped for missing or future timestamps', () => {
  assert.equal(getVideoGenerationElapsedSeconds({}, 10_000), 0)
  assert.equal(getVideoGenerationElapsedSeconds({ created_at: 20_000 }, 10_000), 0)
})

test('elapsed seconds supports video node processing start timestamps', () => {
  assert.equal(getVideoGenerationElapsedSeconds({ processingStartedAt: 2_000 }, 108_000), 106)
})
