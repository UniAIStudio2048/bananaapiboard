import test from 'node:test'
import assert from 'node:assert/strict'
import { isOrphanedTextNodeLlmRequest, trackTextNodeLlmRequest } from './textNodeLlmRequests.js'

test('刷新后没有进行中请求的 processing 节点视为已中断', () => {
  assert.equal(isOrphanedTextNodeLlmRequest('restored', { status: 'processing' }), true)
})

test('请求进行中节点重新挂载时不视为中断，结束后才视为中断', () => {
  const release = trackTextNodeLlmRequest('running')
  assert.equal(isOrphanedTextNodeLlmRequest('running', { status: 'processing' }), false)
  release()
  assert.equal(isOrphanedTextNodeLlmRequest('running', { status: 'processing' }), true)
})

test('视频解析任务由持久任务恢复，不视为中断', () => {
  assert.equal(isOrphanedTextNodeLlmRequest('analysis', { status: 'processing', analysisTaskId: 'task-1' }), false)
  assert.equal(isOrphanedTextNodeLlmRequest('analysis', { status: 'processing', analysisRequestId: 'req-1' }), false)
})

test('非 processing 状态不视为中断', () => {
  for (const status of ['success', 'error', 'idle', undefined]) {
    assert.equal(isOrphanedTextNodeLlmRequest('done', { status }), false)
  }
  assert.equal(isOrphanedTextNodeLlmRequest('empty', undefined), false)
})
