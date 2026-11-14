import test from 'node:test'
import assert from 'node:assert/strict'
import { createIncrementalWriter } from './incrementalWriter.js'

function createWriter({ postWorkflowOps = async () => ({}), isOnline = () => true } = {}) {
  return createIncrementalWriter({
    api: { postWorkflowOps },
    storage: {
      load: async () => { throw new Error('Offline replay must remain disabled') }
    },
    workflowIdRef: () => 'workflow-a',
    options: { allowOfflineReplay: false, debounceMs: 10_000, maxRetry: 0, isOnline }
  })
}

test('an idle collaboration writer does not block video submission when offline replay is disabled', async () => {
  const writer = createWriter({ postWorkflowOps: async () => assert.fail('No pending writes') })
  try {
    const result = await writer.flush()
    assert.equal(result.replayed, 0)
    assert.ok(result.ok !== false && !result.paused && !result.offline)
  } finally { writer.dispose() }
})

test('submission remains allowed after pending collaboration writes have been saved', async () => {
  let requests = 0
  const writer = createWriter({ postWorkflowOps: async () => { requests++; return {} } })
  try {
    writer.enqueue({ op: 'update', target: 'node', id: 'video-a', payload: { title: 'Video' } })
    assert.equal((await writer.flush()).ok, true)
    const result = await writer.flush()
    assert.ok(result.ok !== false && !result.paused && !result.offline)
    assert.equal(requests, 1)
  } finally { writer.dispose() }
})

test('a real version conflict still blocks submission', async () => {
  const writer = createWriter({ postWorkflowOps: async () => {
    throw Object.assign(new Error('Conflict'), { status: 409, code: 'workflow_revision_conflict' })
  } })
  try {
    writer.enqueue({ op: 'update', target: 'node', id: 'video-a', payload: {} })
    const result = await writer.flush()
    assert.equal(result.ok, false)
    assert.equal(result.paused, true)
  } finally { writer.dispose() }
})

test('pending writes while offline still block submission', async () => {
  const writer = createWriter({ isOnline: () => false })
  try {
    writer.enqueue({ op: 'update', target: 'node', id: 'video-a', payload: {} })
    const result = await writer.flush()
    assert.equal(result.offline, true)
    assert.equal(result.paused, true)
  } finally { writer.dispose() }
})
