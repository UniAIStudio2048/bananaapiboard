import test from 'node:test'
import assert from 'node:assert/strict'
import { findBatchSafetyError } from './canvasBatchFailures.js'

test('finds a structured safety failure among mixed batch results', () => {
  const safety = {
    code: 'prompt_safety_blocked',
    message: '提示词未通过安全审核',
    safety: { matchedContent: ['blocked'] },
    payload: { error: 'prompt_safety_blocked' }
  }

  assert.equal(findBatchSafetyError([
    { taskId: 'accepted-task' },
    { error: 'ordinary failure', detail: { code: 'provider_error' } },
    { error: safety.message, detail: safety }
  ]), safety)
})

test('accepts persisted node safetyError values and ignores ordinary failures', () => {
  const safety = { code: 'prompt_safety_blocked', message: 'blocked' }

  assert.equal(findBatchSafetyError([
    { status: 'success' },
    { safetyError: safety }
  ]), safety)
  assert.equal(findBatchSafetyError([
    { error: 'provider unavailable', detail: { code: 'provider_error' } }
  ]), null)
})
