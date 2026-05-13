import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isTimedOutCanvasVideoNode,
  shouldFailCanvasVideoNodeWithoutTask,
  shouldResumeCanvasVideoNodeWithoutTask
} from './videoZombieTask.js'

test('detects timed out canvas video nodes with ISO timestamps', () => {
  const now = Date.parse('2026-05-13T12:00:00.000Z')

  assert.equal(isTimedOutCanvasVideoNode({
    type: 'text-to-video',
    data: {
      status: 'PROCESSING',
      taskId: 'task_1',
      created_at: '2026-05-13T09:59:00.000Z'
    }
  }, now), true)
})

test('resumes recent processing canvas video nodes when task id exists but background task is missing', () => {
  const node = {
    type: 'video',
    data: {
      status: 'pending',
      soraTaskId: 'task_missing',
      createdAt: Date.parse('2026-05-13T11:59:00.000Z')
    }
  }

  assert.equal(shouldResumeCanvasVideoNodeWithoutTask(node, false, Date.parse('2026-05-13T12:00:00.000Z')), true)
  assert.equal(shouldFailCanvasVideoNodeWithoutTask(node, false, Date.parse('2026-05-13T12:00:00.000Z')), false)
  assert.equal(shouldFailCanvasVideoNodeWithoutTask(node, true, Date.parse('2026-05-13T12:00:00.000Z')), false)
})
