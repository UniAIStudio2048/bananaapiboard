import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearPendingGenerationSubmissions,
  createPendingGenerationSubmission,
  getPendingGenerationSubmissions,
  markNodeGenerationSubmissionsDeleted,
  markSubmissionTaskCreated,
  recoverPendingCanvasVideoSubmissions
} from './pendingGenerationSubmissions.js'

function installLocalStorage() {
  const data = new Map()
  globalThis.localStorage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      data.set(key, String(value))
    },
    removeItem(key) {
      data.delete(key)
    },
    clear() {
      data.clear()
    }
  }
}

test.beforeEach(() => {
  installLocalStorage()
  clearPendingGenerationSubmissions()
})

test('persists a canvas video submission before a backend task id is known', () => {
  const now = () => 1772448000000
  const submission = createPendingGenerationSubmission({
    type: 'video',
    nodeId: 'node-video-1',
    tabId: 'tab-a',
    workflowId: 'workflow-a',
    prompt: 'a calm 4s camera pan',
    model: 'seedance-2.0-ant',
    aspectRatio: '16:9',
    duration: '4',
    now
  })

  assert.match(submission.submissionId, /^cgs-/)
  assert.equal(submission.status, 'submitting')
  assert.equal(submission.taskId, null)

  const [saved] = getPendingGenerationSubmissions({ type: 'video', now })
  assert.equal(saved.submissionId, submission.submissionId)
  assert.equal(saved.nodeId, 'node-video-1')
  assert.equal(saved.duration, '4')
})

test('keeps a task-created submission recoverable until completion removes it', () => {
  const submission = createPendingGenerationSubmission({
    type: 'video',
    nodeId: 'node-video-1',
    tabId: 'tab-a'
  })

  markSubmissionTaskCreated(submission.submissionId, 'cgt-20260630160805-v9s7r')

  const [saved] = getPendingGenerationSubmissions({ type: 'video' })
  assert.equal(saved.status, 'task-created')
  assert.equal(saved.taskId, 'cgt-20260630160805-v9s7r')
})

test('deleted canvas nodes are not revived by pending submission recovery', async () => {
  const submission = createPendingGenerationSubmission({
    type: 'video',
    nodeId: 'node-video-1',
    tabId: 'tab-a'
  })
  markNodeGenerationSubmissionsDeleted('node-video-1', { tabId: 'tab-a' })

  const result = await recoverPendingCanvasVideoSubmissions({
    canvasStore: {
      activeTabId: 'tab-a',
      nodes: [{ id: 'node-video-1', type: 'video', data: { status: 'processing' } }],
      updateNodeData() {
        throw new Error('deleted submission should not update the node')
      }
    },
    fetchSubmissionStatus: async () => ({
      task_id: 'cgt-deleted',
      status: 'processing'
    }),
    ensureTaskPolling() {
      throw new Error('deleted submission should not restart polling')
    }
  })

  assert.equal(result.recovered, 0)
  assert.equal(result.skippedDeleted, 1)
  assert.equal(getPendingGenerationSubmissions({ type: 'video' }).length, 0)
  assert.equal(submission.nodeId, 'node-video-1')
})

test('recovers a submitted canvas video task after reload and restarts polling', async () => {
  const submission = createPendingGenerationSubmission({
    type: 'video',
    nodeId: 'node-video-1',
    tabId: 'tab-a',
    prompt: 'a calm 4s camera pan',
    model: 'seedance-2.0-ant'
  })

  const patches = []
  const ensured = []
  const result = await recoverPendingCanvasVideoSubmissions({
    canvasStore: {
      activeTabId: 'tab-a',
      nodes: [{ id: 'node-video-1', type: 'video', data: { status: 'processing' } }],
      updateNodeData(nodeId, patch) {
        patches.push({ nodeId, patch })
      }
    },
    fetchSubmissionStatus: async (submissionId) => {
      assert.equal(submissionId, submission.submissionId)
      return {
        task_id: 'cgt-20260630160805-v9s7r',
        status: 'processing',
        progress: '32%',
        model: 'seedance-2.0-ant'
      }
    },
    ensureTaskPolling(task) {
      ensured.push(task)
      return { taskId: task.taskId, status: 'processing' }
    }
  })

  assert.equal(result.recovered, 1)
  assert.deepEqual(ensured, [{
    taskId: 'cgt-20260630160805-v9s7r',
    type: 'video',
    nodeId: 'node-video-1',
    tabId: 'tab-a'
  }])
  assert.equal(patches[0].nodeId, 'node-video-1')
  assert.equal(patches[0].patch.taskId, 'cgt-20260630160805-v9s7r')
  assert.equal(patches[0].patch.soraTaskId, 'cgt-20260630160805-v9s7r')
  assert.equal(patches[0].patch.status, 'processing')

  const [saved] = getPendingGenerationSubmissions({ type: 'video' })
  assert.equal(saved.status, 'task-created')
  assert.equal(saved.taskId, 'cgt-20260630160805-v9s7r')
})

test('keeps not-yet-created backend submissions pending so Canvas can retry recovery', async () => {
  createPendingGenerationSubmission({
    type: 'video',
    nodeId: 'node-video-1',
    tabId: 'tab-a'
  })

  const result = await recoverPendingCanvasVideoSubmissions({
    canvasStore: {
      activeTabId: 'tab-a',
      nodes: [{ id: 'node-video-1', type: 'video', data: { status: 'processing' } }],
      updateNodeData() {
        throw new Error('not found submissions should not patch nodes')
      }
    },
    fetchSubmissionStatus: async () => null,
    ensureTaskPolling() {
      throw new Error('not found submissions should not restart polling')
    }
  })

  assert.equal(result.notFound, 1)
  assert.equal(getPendingGenerationSubmissions({ type: 'video' }).length, 1)
})

test('keeps submissions pending when the canvas node is temporarily unavailable', async () => {
  const submission = createPendingGenerationSubmission({
    type: 'video',
    nodeId: 'node-video-1',
    tabId: 'tab-a'
  })

  const result = await recoverPendingCanvasVideoSubmissions({
    canvasStore: {
      activeTabId: 'tab-a',
      nodes: [],
      updateNodeData() {
        throw new Error('missing nodes should not be patched')
      }
    },
    fetchSubmissionStatus() {
      throw new Error('missing nodes should wait for a later recovery pass')
    },
    ensureTaskPolling() {
      throw new Error('missing nodes should not restart polling yet')
    }
  })

  assert.equal(result.missingNode, 1)
  const [saved] = getPendingGenerationSubmissions({ type: 'video', includeDeleted: true })
  assert.equal(saved.submissionId, submission.submissionId)
  assert.equal(saved.deletedByUser, false)
  assert.equal(saved.status, 'waiting-node')
})

test('writes completed recovered video output without starting another poller', async () => {
  createPendingGenerationSubmission({
    type: 'video',
    nodeId: 'node-video-1',
    tabId: 'tab-a'
  })

  const patches = []
  const result = await recoverPendingCanvasVideoSubmissions({
    canvasStore: {
      activeTabId: 'tab-a',
      nodes: [{ id: 'node-video-1', type: 'video', data: { status: 'processing' } }],
      updateNodeData(nodeId, patch) {
        patches.push({ nodeId, patch })
      }
    },
    fetchSubmissionStatus: async () => ({
      task_id: 'cgt-complete',
      status: 'SUCCESS',
      progress: '100%',
      video_url: 'https://cdn.example/video.mp4',
      finished_at: 1772448123000
    }),
    ensureTaskPolling() {
      throw new Error('completed recovered submissions should not start polling')
    }
  })

  assert.equal(result.completed, 1)
  assert.equal(patches[0].patch.status, 'success')
  assert.deepEqual(patches[0].patch.output, {
    type: 'video',
    url: 'https://cdn.example/video.mp4'
  })
  assert.equal(getPendingGenerationSubmissions({ type: 'video' }).length, 0)
})
