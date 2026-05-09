export const VIDEO_GENERATION_TIMEOUT_HINT_MULTIPLIER = 3

export function parseTaskCreatedAt(createdAt) {
  if (createdAt === null || createdAt === undefined || createdAt === '') return null

  if (typeof createdAt === 'number') {
    return Number.isFinite(createdAt) ? createdAt : null
  }

  if (typeof createdAt === 'string') {
    const numericValue = Number(createdAt)
    if (Number.isFinite(numericValue) && createdAt.trim() !== '') {
      return numericValue
    }

    const timestamp = Date.parse(createdAt)
    return Number.isNaN(timestamp) ? null : timestamp
  }

  return null
}

export function getVideoGenerationElapsedSeconds(task, now = Date.now()) {
  const createdAt = parseTaskCreatedAt(
    task?.processingStartedAt ??
    task?.started_at ??
    task?.created_at ??
    task?.createdAt ??
    task?.created
  )
  if (createdAt === null) return 0

  return Math.max(0, Math.floor((now - createdAt) / 1000))
}

export function formatVideoGenerationElapsed(seconds) {
  const normalizedSeconds = Math.max(0, Math.floor(Number(seconds) || 0))

  if (normalizedSeconds < 60) {
    return `${normalizedSeconds}s`
  }

  const minutes = Math.floor(normalizedSeconds / 60)
  const remainingSeconds = normalizedSeconds % 60
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`
}

export function getVideoGenerationProgressText(task, now = Date.now()) {
  return `生成中${formatVideoGenerationElapsed(getVideoGenerationElapsedSeconds(task, now))}`
}

export function shouldShowVideoGenerationTimeoutHint(
  task,
  now = Date.now(),
  averageSeconds
) {
  if (!Number.isFinite(averageSeconds) || averageSeconds <= 0) return false

  const thresholdSeconds = averageSeconds * VIDEO_GENERATION_TIMEOUT_HINT_MULTIPLIER
  return getVideoGenerationElapsedSeconds(task, now) > thresholdSeconds
}
