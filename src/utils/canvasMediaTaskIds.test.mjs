import test from 'node:test'
import assert from 'node:assert/strict'

import { getCanvasMediaTaskIds } from './canvasMediaTaskIds.js'

test('normalizes and de-duplicates media task id fields in stable order', () => {
  const node = {
    id: 'audio-1',
    type: 'audio-input',
    data: {
      status: 'processing',
      taskIds: [' audio-a ', 'audio-b', 'audio-a', null],
      taskId: 'audio-b'
    }
  }

  assert.deepEqual(getCanvasMediaTaskIds(node), ['audio-a', 'audio-b'])
})

test('supports scalar image and video task aliases regardless of status', () => {
  assert.deepEqual(
    getCanvasMediaTaskIds({ id: 'image-1', type: 'image', data: { status: 'error', task_id: 42 } }),
    ['42']
  )
  assert.deepEqual(
    getCanvasMediaTaskIds({
      id: 'video-1',
      type: 'video',
      data: { status: 'success', soraTaskId: 'sora-1', _failedTaskId: 'sora-1' }
    }),
    ['sora-1']
  )
})

test('does not expose task ids on non-media nodes or uploads without an id', () => {
  assert.deepEqual(
    getCanvasMediaTaskIds({ id: 'text-1', type: 'text-input', data: { taskId: 'hidden' } }),
    []
  )
  assert.deepEqual(
    getCanvasMediaTaskIds({
      id: 'upload-1',
      type: 'image-input',
      data: { sourceImages: ['blob:local-upload'] }
    }),
    []
  )
})

test('resolves an explicitly linked legacy group-image parent', () => {
  const child = { id: 'child-1', type: 'image', data: { status: 'success' } }
  const parent = {
    id: 'parent-1',
    type: 'image',
    data: { taskId: 'image-task', groupNodeIds: ['child-1'] }
  }
  const unrelated = {
    id: 'other-1',
    type: 'image',
    data: { taskId: 'wrong-task', groupNodeIds: ['other-child'] }
  }

  assert.deepEqual(getCanvasMediaTaskIds(child, [unrelated, parent, child]), ['image-task'])
})
