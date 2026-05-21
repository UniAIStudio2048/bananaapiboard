import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isTimedOutCanvasVideoNode,
  shouldFailCanvasVideoNodeWithoutTask,
  shouldResumeCanvasVideoNodeWithoutTask,
  getCanvasNodeBackgroundTaskType,
  isCanvasImageGenerationNode,
  isCanvasAudioGenerationNode,
  CANVAS_VIDEO_NODE_TIMEOUT_MS,
  CANVAS_IMAGE_NODE_TIMEOUT_MS,
  CANVAS_AUDIO_NODE_TIMEOUT_MS
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

test('resumes recent processing canvas image nodes when task id exists but background task is missing', () => {
  // 图像节点：15 分钟前提交，未超 30min 图像超时
  const now = Date.parse('2026-05-13T12:00:00.000Z')
  const node = {
    type: 'image',
    data: {
      status: 'processing',
      taskId: 'task_image_1',
      taskType: 'image',
      processingStartedAt: Date.parse('2026-05-13T11:45:00.000Z')
    }
  }
  assert.equal(shouldResumeCanvasVideoNodeWithoutTask(node, false, now), true)
  assert.equal(shouldFailCanvasVideoNodeWithoutTask(node, false, now), false)
  assert.equal(getCanvasNodeBackgroundTaskType(node), 'image')
})

test('marks timed out image / audio nodes as failable when no background task', () => {
  // 图像节点：超 30min
  const now = Date.parse('2026-05-13T12:00:00.000Z')
  const imageNode = {
    type: 'image',
    data: {
      status: 'processing',
      taskId: null,
      processingStartedAt: Date.parse('2026-05-13T11:20:00.000Z') // 40min 前
    }
  }
  assert.equal(shouldFailCanvasVideoNodeWithoutTask(imageNode, false, now), true)

  // 音频节点：超 30min
  const audioNode = {
    type: 'audio',
    data: {
      status: 'processing',
      taskId: null,
      processingStartedAt: Date.parse('2026-05-13T11:20:00.000Z')
    }
  }
  assert.equal(shouldFailCanvasVideoNodeWithoutTask(audioNode, false, now), true)
})

test('correct timeout thresholds per node type', () => {
  // 视频与后端 VIDEO_TASK_TIMEOUT_MS 对齐，超过即在画布上自动判失败 / 触发后端退款
  assert.equal(CANVAS_VIDEO_NODE_TIMEOUT_MS, 40 * 60 * 1000)
  assert.equal(CANVAS_IMAGE_NODE_TIMEOUT_MS, 30 * 60 * 1000)
  assert.equal(CANVAS_AUDIO_NODE_TIMEOUT_MS, 30 * 60 * 1000)
})

test('getCanvasNodeBackgroundTaskType maps taskType correctly', () => {
  assert.equal(
    getCanvasNodeBackgroundTaskType({ type: 'image', data: { taskType: 'image-cutout' } }),
    'image-cutout'
  )
  assert.equal(
    getCanvasNodeBackgroundTaskType({ type: 'image', data: { taskType: 'image-hd' } }),
    'image-hd'
  )
  assert.equal(
    getCanvasNodeBackgroundTaskType({ type: 'audio', data: { taskType: 'audio-edit' } }),
    'audio-edit'
  )
  // 未指定 taskType 时按节点类型回退
  assert.equal(getCanvasNodeBackgroundTaskType({ type: 'image', data: {} }), 'image')
  assert.equal(getCanvasNodeBackgroundTaskType({ type: 'audio', data: {} }), 'audio-edit')
  assert.equal(getCanvasNodeBackgroundTaskType({ type: 'video', data: {} }), 'video')
})

test('isCanvasImageGenerationNode / isCanvasAudioGenerationNode correctly identify nodes', () => {
  assert.equal(isCanvasImageGenerationNode({ type: 'image', data: {} }), true)
  assert.equal(isCanvasImageGenerationNode({ type: 'text-to-image', data: {} }), true)
  assert.equal(isCanvasImageGenerationNode({ type: 'video', data: {} }), false)
  assert.equal(isCanvasAudioGenerationNode({ type: 'audio', data: {} }), true)
  assert.equal(isCanvasAudioGenerationNode({ type: 'video', data: {} }), false)
})
