import {
  isVideoGenerationProcessingStatus,
  parseTaskCreatedAtForTimeout
} from '../../utils/videoGenerationProgress.js'

export const CANVAS_VIDEO_NODE_TIMEOUT_MS = 120 * 60 * 1000

const CANVAS_VIDEO_NODE_TYPES = new Set([
  'video',
  'video-input',
  'text-to-video',
  'image-to-video',
  'video-to-video'
])

export function getCanvasVideoNodeTaskId(node) {
  const data = node?.data || {}
  return data.taskId || data.soraTaskId || data.task_id || data.videoTaskId || data.generationTaskId || null
}

function getCanvasVideoNodeStartedAt(node) {
  const data = node?.data || {}
  return parseTaskCreatedAtForTimeout(
    data.startedAt ??
    data.processingStartedAt ??
    data.createdAt ??
    data.created_at
  )
}

export function isCanvasVideoGenerationNode(node) {
  return CANVAS_VIDEO_NODE_TYPES.has(node?.type) || CANVAS_VIDEO_NODE_TYPES.has(node?.data?.type)
}

export function isTimedOutCanvasVideoNode(node, now = Date.now(), timeoutMs = CANVAS_VIDEO_NODE_TIMEOUT_MS) {
  if (!isCanvasVideoGenerationNode(node)) return false
  if (!isVideoGenerationProcessingStatus(node?.data?.status)) return false

  const startedAt = getCanvasVideoNodeStartedAt(node)
  if (startedAt === null) return false

  return now - startedAt > timeoutMs
}

export function shouldFailCanvasVideoNodeWithoutTask(node, hasBackgroundTask, now = Date.now()) {
  if (!isCanvasVideoGenerationNode(node)) return false
  if (!isVideoGenerationProcessingStatus(node?.data?.status)) return false
  if (isTimedOutCanvasVideoNode(node, now)) return true
  return false
}

export function shouldResumeCanvasVideoNodeWithoutTask(node, hasBackgroundTask, now = Date.now()) {
  if (!isCanvasVideoGenerationNode(node)) return false
  if (!isVideoGenerationProcessingStatus(node?.data?.status)) return false
  if (isTimedOutCanvasVideoNode(node, now)) return false
  return !!getCanvasVideoNodeTaskId(node) && !hasBackgroundTask
}
