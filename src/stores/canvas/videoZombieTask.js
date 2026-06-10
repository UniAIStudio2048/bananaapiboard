import {
  isVideoGenerationProcessingStatus,
  parseTaskCreatedAtForTimeout
} from '../../utils/videoGenerationProgress.js'

// 视频生成（含 image-to-video / text-to-video 等）硬超时：与后端 video-task-timeout.js 对齐。
// 错峰（off_peak）视频任务不会走画布节点，因此画布层这里只覆盖普通模式。
export const CANVAS_VIDEO_NODE_TIMEOUT_MS = 40 * 60 * 1000
// 图像生成（含高清/抠图/全景/扩图等）超时：30 分钟覆盖大多数链路
export const CANVAS_IMAGE_NODE_TIMEOUT_MS = 30 * 60 * 1000
// 音频生成/编辑超时：30 分钟
export const CANVAS_AUDIO_NODE_TIMEOUT_MS = 30 * 60 * 1000

const CANVAS_VIDEO_NODE_TYPES = new Set([
  'video',
  'video-input',
  'text-to-video',
  'image-to-video',
  'video-to-video'
])

const CANVAS_IMAGE_NODE_TYPES = new Set([
  'image',
  'image-input',
  'text-to-image',
  'image-to-image'
])

const CANVAS_AUDIO_NODE_TYPES = new Set([
  'audio',
  'audio-input',
  'text-to-audio'
])

// taskType -> 默认轮询用 type（registerTask 时使用）
const TASK_TYPE_FALLBACK = {
  video: 'video',
  'video-hd': 'video-hd',
  image: 'image',
  'image-hd': 'image-hd',
  'image-panorama': 'image-panorama',
  'image-cutout': 'image-cutout',
  'audio-edit': 'audio-edit'
}

export function getCanvasNodeTaskId(node) {
  const data = node?.data || {}
  return data.taskId || data.soraTaskId || data.task_id || data.videoTaskId || data.generationTaskId || null
}

// 兼容旧名（外部仍在引用）
export const getCanvasVideoNodeTaskId = getCanvasNodeTaskId

function getCanvasNodeStartedAt(node) {
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

export function isCanvasImageGenerationNode(node) {
  return CANVAS_IMAGE_NODE_TYPES.has(node?.type) || CANVAS_IMAGE_NODE_TYPES.has(node?.data?.type)
}

export function isCanvasAudioGenerationNode(node) {
  return CANVAS_AUDIO_NODE_TYPES.has(node?.type) || CANVAS_AUDIO_NODE_TYPES.has(node?.data?.type)
}

export function isCanvasGenerationNode(node) {
  return (
    isCanvasVideoGenerationNode(node) ||
    isCanvasImageGenerationNode(node) ||
    isCanvasAudioGenerationNode(node)
  )
}

// 按节点类别返回对应超时
export function getCanvasNodeTimeoutMs(node) {
  if (isCanvasVideoGenerationNode(node)) return CANVAS_VIDEO_NODE_TIMEOUT_MS
  if (isCanvasAudioGenerationNode(node)) return CANVAS_AUDIO_NODE_TIMEOUT_MS
  if (isCanvasImageGenerationNode(node)) return CANVAS_IMAGE_NODE_TIMEOUT_MS
  return CANVAS_VIDEO_NODE_TIMEOUT_MS
}

export function isTimedOutCanvasVideoNode(node, now = Date.now(), timeoutMs) {
  if (!isCanvasGenerationNode(node)) return false
  if (!isVideoGenerationProcessingStatus(node?.data?.status)) return false

  const startedAt = getCanvasNodeStartedAt(node)
  if (startedAt === null) return false

  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : getCanvasNodeTimeoutMs(node)
  return now - startedAt > effectiveTimeout
}

// 别名（语义更准确，旧调用方继续可用）
export const isTimedOutCanvasNode = isTimedOutCanvasVideoNode

export function shouldFailCanvasVideoNodeWithoutTask(node, hasBackgroundTask, now = Date.now()) {
  if (!isCanvasGenerationNode(node)) return false
  if (!isVideoGenerationProcessingStatus(node?.data?.status)) return false
  if (getCanvasNodeTaskId(node)) return false
  if (isTimedOutCanvasVideoNode(node, now)) return true
  return false
}

export function shouldResumeCanvasVideoNodeWithoutTask(node, hasBackgroundTask, now = Date.now()) {
  if (!isCanvasGenerationNode(node)) return false
  if (!isVideoGenerationProcessingStatus(node?.data?.status)) return false
  return !!getCanvasNodeTaskId(node) && !hasBackgroundTask
}

// 根据节点推断后台任务的 type（registerTask 用），有 taskType 优先用，否则按节点类别回退
export function getCanvasNodeBackgroundTaskType(node) {
  const taskType = node?.data?.taskType
  if (taskType && TASK_TYPE_FALLBACK[taskType]) return TASK_TYPE_FALLBACK[taskType]
  if (isCanvasVideoGenerationNode(node)) return 'video'
  if (isCanvasImageGenerationNode(node)) return 'image'
  if (isCanvasAudioGenerationNode(node)) return 'audio-edit'
  return 'video'
}
