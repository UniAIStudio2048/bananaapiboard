const SUCCESS_STATUSES = new Set(['completed', 'success', 'succeeded', 'finished', 'done'])
const FAILURE_STATUSES = new Set(['failed', 'failure', 'fail', 'error', 'timeout', 'cancelled', 'canceled', 'expired'])

function hasMediaOutput(result) {
  return !!(
    result?.hasOutput ||
    result?.url ||
    result?.video_url ||
    result?.audio_url ||
    result?.outputUrl ||
    result?.output_url ||
    (Array.isArray(result?.urls) && result.urls.length > 0) ||
    (Array.isArray(result?.images) && result.images.length > 0) ||
    (Array.isArray(result?.videos) && result.videos.length > 0) ||
    (Array.isArray(result?.audios) && result.audios.length > 0)
  )
}

function getErrorMessage(result, fallback) {
  return result?.error || result?.fail_reason || result?.message || fallback
}

export function classifyBackgroundTaskStatus(result, resultType = 'image') {
  const statusLower = String(result?.status || '').toLowerCase()
  const hasOutput = hasMediaOutput(result)

  if (hasOutput) {
    return { state: 'completed', isTerminal: true, hasOutput }
  }

  if (FAILURE_STATUSES.has(statusLower)) {
    return {
      state: 'failed',
      isTerminal: true,
      hasOutput,
      error: getErrorMessage(result, '任务执行失败')
    }
  }

  if (SUCCESS_STATUSES.has(statusLower)) {
    return {
      state: 'failed',
      isTerminal: true,
      hasOutput,
      error: getErrorMessage(result, `${resultType === 'video' ? '视频' : resultType === 'audio' ? '音频' : '图片'}生成完成但未返回结果`)
    }
  }

  return { state: 'processing', isTerminal: false, hasOutput }
}
