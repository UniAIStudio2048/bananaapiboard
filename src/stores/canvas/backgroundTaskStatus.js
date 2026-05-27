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

/**
 * 分类后台任务状态
 *
 * 关键改动：当后端返回 success/completed 但 URL 字段尚未补齐时，
 * 不再立即判定 failed —— 第三方异步渠道（视频/HD/部分图片）经常出现"状态先 success，
 * URL 几秒后才落库"的时间差，立刻 failed 会让用户看到"已生成但节点空"。
 *
 * 现在返回 `state:'processing' + waitingForUrl:true`，让 BackgroundTaskManager
 * 结合连续宽限次数（SUCCESS_NO_URL_GRACE）决定何时真正 failed。
 */
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
    // 后端说成功但还没拿到 URL —— 给一个宽限期（由调用方 BTM 计数）
    // 提供错误文案，BTM 在宽限耗尽后用作最终错误信息
    return {
      state: 'processing',
      isTerminal: false,
      hasOutput,
      waitingForUrl: true,
      error: getErrorMessage(result, `${resultType === 'video' ? '视频' : resultType === 'audio' ? '音频' : '图片'}生成完成但未返回结果`)
    }
  }

  return { state: 'processing', isTerminal: false, hasOutput }
}
