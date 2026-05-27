import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyBackgroundTaskStatus } from './backgroundTaskStatus.js'

test('keeps successful terminal status without media output in processing with waitingForUrl flag (grace period)', () => {
  // 语义变更说明：
  // 第三方异步渠道（视频/HD/部分图片）经常在"状态先 success，URL 几秒后才落库"。
  // 旧行为立即 failed → 用户看到"已生成但节点空白"。
  // 新行为：标记 waitingForUrl，由 BackgroundTaskManager 给出有限宽限期再决定 failed。
  const result = {
    status: 'succeeded',
    progress: '100%',
    hasOutput: false
  }

  const status = classifyBackgroundTaskStatus(result, 'video')

  assert.equal(status.state, 'processing')
  assert.equal(status.isTerminal, false)
  assert.equal(status.waitingForUrl, true)
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
