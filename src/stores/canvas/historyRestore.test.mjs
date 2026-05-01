import assert from 'node:assert/strict'
import { sanitizeNodesForHistoryRestore } from './historyRestore.js'

const restored = sanitizeNodesForHistoryRestore([
  {
    id: 'image-1',
    type: 'image',
    data: {
      status: 'processing',
      progress: '生成中...',
      taskId: 'task-123',
      executeTriggered: 1710000000000,
      triggeredByGroup: true,
      output: null
    }
  },
  {
    id: 'image-2',
    type: 'image',
    data: {
      status: 'processing',
      progress: '生成中...',
      taskId: 'task-456',
      executeTriggered: 1710000000001,
      triggeredByGroup: true,
      output: { type: 'image', urls: ['https://cdn.example.com/final.png'] }
    }
  }
])

assert.equal(restored[0].data.status, 'idle', 'processing history snapshots without output should restore as idle')
assert.equal(restored[0].data.progress, null, 'transient progress should be cleared')
assert.equal(restored[0].data.taskId, null, 'stale task id should be cleared')
assert.equal(restored[0].data.executeTriggered, false, 'group execution trigger should be cleared')
assert.equal(restored[0].data.triggeredByGroup, false, 'group execution flag should be cleared')

assert.equal(restored[1].data.status, 'success', 'history snapshots with image output should restore as completed image nodes')
assert.deepEqual(restored[1].data.output.urls, ['https://cdn.example.com/final.png'])
