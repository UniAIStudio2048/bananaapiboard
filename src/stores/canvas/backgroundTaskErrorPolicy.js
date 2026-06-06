const TASK_IDENTITY_MISMATCH = 'task_identity_mismatch'

function isVideoTask(task) {
  return task?.type === 'video' || task?.type === 'video-hd' || task?.type === 'video-hd-upscale'
}

function isIdentityMismatchError(error) {
  return error?.code === TASK_IDENTITY_MISMATCH ||
    error?.category === TASK_IDENTITY_MISMATCH ||
    error?.status === 409
}

export function classifyPollingError(task, error) {
  const message = String(error?.message || '')

  if (isVideoTask(task) && isIdentityMismatchError(error)) {
    return {
      kind: 'pause',
      status: 'processing',
      stopPolling: true,
      notify: 'network-error',
      message: message || '任务属于其他登录态或租户，请切回提交任务时的账号/租户后重新获取'
    }
  }

  if (message.includes('任务不存在') || message.includes('not found')) {
    return {
      kind: 'failed',
      status: 'failed',
      stopPolling: true,
      notify: 'failed',
      message: '任务不存在或已过期，请重新生成'
    }
  }

  return {
    kind: 'retry',
    status: task?.status || 'processing',
    stopPolling: false,
    notify: 'none',
    message
  }
}
