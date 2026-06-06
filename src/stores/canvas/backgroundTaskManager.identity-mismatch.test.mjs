import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyPollingError } from './backgroundTaskErrorPolicy.js'

test('video task identity mismatch pauses polling without marking generation failed', () => {
  const error = new Error('任务属于其他登录态或租户，请切回提交任务时的账号/租户后重新获取')
  error.status = 409
  error.code = 'task_identity_mismatch'
  error.category = 'task_identity_mismatch'

  const action = classifyPollingError({
    taskId: 'task-video-1',
    type: 'video',
    status: 'processing'
  }, error)

  assert.equal(action.kind, 'pause')
  assert.equal(action.status, 'processing')
  assert.equal(action.stopPolling, true)
  assert.equal(action.notify, 'network-error')
  assert.match(action.message, /账号\/租户/)
})

test('image task not found remains a terminal failure', () => {
  const error = new Error('任务不存在或已过期，请重新生成')
  error.status = 404

  const action = classifyPollingError({
    taskId: 'task-image-1',
    type: 'image',
    status: 'processing'
  }, error)

  assert.equal(action.kind, 'failed')
  assert.equal(action.status, 'failed')
  assert.equal(action.stopPolling, true)
})
