import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyBackgroundTaskStatus } from './backgroundTaskStatus.js'

test('treats successful terminal status without media output as failed instead of still processing', () => {
  const result = {
    status: 'succeeded',
    progress: '100%',
    hasOutput: false
  }

  const status = classifyBackgroundTaskStatus(result, 'video')

  assert.equal(status.state, 'failed')
  assert.equal(status.isTerminal, true)
  assert.match(status.error, /未返回/)
})

test('recognizes backend and provider terminal failure statuses', () => {
  for (const rawStatus of ['FAILURE', 'fail', 'timeout', 'cancelled', 'canceled', 'expired']) {
    const status = classifyBackgroundTaskStatus({ status: rawStatus }, 'image')

    assert.equal(status.state, 'failed', rawStatus)
    assert.equal(status.isTerminal, true, rawStatus)
  }
})

test('keeps transient statuses processing', () => {
  for (const rawStatus of ['pending', 'PROCESSING', 'running', 'queued', 'submitting']) {
    const status = classifyBackgroundTaskStatus({ status: rawStatus }, 'video')

    assert.equal(status.state, 'processing', rawStatus)
    assert.equal(status.isTerminal, false, rawStatus)
  }
})

test('treats media output as completed even when status is still processing', () => {
  const status = classifyBackgroundTaskStatus({
    status: 'processing',
    url: 'https://cdn.example.com/final.png'
  }, 'image')

  assert.equal(status.state, 'completed')
  assert.equal(status.isTerminal, true)
})
