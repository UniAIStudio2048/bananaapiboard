import test from 'node:test'
import assert from 'node:assert/strict'
import { isStaleTaskResultForInFlightNode } from './canvasTaskResultGuard.js'

const regenerating = { status: 'processing', processingStartedAt: 2000, taskId: null, output: null }

test('上一次任务的成功结果不能覆盖正在重新生成的节点', () => {
  const previous = { status: 'success', processingStartedAt: 1000, taskId: 'cgt-old', output: { url: 'https://cdn/old.mp4' } }
  assert.equal(isStaleTaskResultForInFlightNode(regenerating, previous), true)
})

test('没有生成记录的旧终态（如上传视频）同样视为过期', () => {
  assert.equal(isStaleTaskResultForInFlightNode(regenerating, { status: 'success', output: { url: 'https://cdn/upload.mp4' } }), true)
})

test('复制粘贴出的节点：服务端仍是 idle + 旧视频，同样不能覆盖本次生成', () => {
  const pasted = { status: 'idle', processingStartedAt: 1000, taskId: null, output: { url: 'https://cdn/old.mp4' } }
  assert.equal(isStaleTaskResultForInFlightNode(regenerating, pasted), true)
})

test('上一轮生成中的旧状态（旧 taskId）也视为过期，避免轮询旧任务', () => {
  assert.equal(isStaleTaskResultForInFlightNode(regenerating, { status: 'processing', processingStartedAt: 1000, taskId: 'cgt-old' }), true)
})

test('本次生成的结果（开始时间相同或同一任务）照常应用', () => {
  assert.equal(isStaleTaskResultForInFlightNode(regenerating, { status: 'success', processingStartedAt: 2000, taskId: 'cgt-new' }), false)
  assert.equal(isStaleTaskResultForInFlightNode({ ...regenerating, taskId: 'cgt-new' }, { status: 'error', taskId: 'cgt-new' }), false)
})

test('本地未在生成或没有开始时间时不拦截', () => {
  const previous = { status: 'success', processingStartedAt: 1000 }
  assert.equal(isStaleTaskResultForInFlightNode({ status: 'success', processingStartedAt: 2000 }, previous), false)
  assert.equal(isStaleTaskResultForInFlightNode({ status: 'processing' }, previous), false)
  assert.equal(isStaleTaskResultForInFlightNode(regenerating, { status: 'processing', processingStartedAt: 2000 }), false)
})
