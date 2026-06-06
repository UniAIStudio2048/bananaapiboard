import test from 'node:test'
import assert from 'node:assert/strict'

import { buildTaskQueryError } from './taskQueryError.js'

test('task query errors preserve backend code and category', () => {
  const error = buildTaskQueryError(
    { status: 409 },
    {
      error: 'task_identity_mismatch',
      category: 'task_identity_mismatch',
      message: '任务属于其他登录态或租户，请切回提交任务时的账号/租户后重新获取',
      expected: { userId: 'u-current', tenantId: 'tenant-current' },
      actual: { tenantId: 'tenant-owner', status: 'SUCCESS' }
    },
    '查询任务状态失败'
  )

  assert.equal(error.status, 409)
  assert.equal(error.code, 'task_identity_mismatch')
  assert.equal(error.category, 'task_identity_mismatch')
  assert.deepEqual(error.details.actual, { tenantId: 'tenant-owner', status: 'SUCCESS' })
  assert.match(error.message, /账号\/租户/)
})
