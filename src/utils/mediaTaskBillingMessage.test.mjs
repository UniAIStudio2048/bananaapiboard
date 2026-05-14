import test from 'node:test'
import assert from 'node:assert/strict'

import { withNoChargeNotice } from './mediaTaskBillingMessage.js'

test('appends no-charge notice to media task errors', () => {
  assert.equal(withNoChargeNotice('任务超时，请重试'), '任务超时，请重试，未扣除积分')
})

test('does not duplicate no-charge notice', () => {
  assert.equal(withNoChargeNotice('生成失败，未扣除积分'), '生成失败，未扣除积分')
})

