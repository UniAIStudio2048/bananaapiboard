function getApiErrorMessage(error, fallbackMessage) {
  return error?.message || error?.error || fallbackMessage
}

function getTaskQueryErrorMessage(response, error, fallbackMessage) {
  const fallback = response.status === 404
    ? '任务不存在或已过期，请重新生成'
    : response.status === 401
      ? '登录已过期，请刷新页面重新登录'
      : fallbackMessage
  return getApiErrorMessage(error, fallback)
}

export function buildTaskQueryError(response, body = {}, fallbackMessage = '查询任务状态失败') {
  const message = getTaskQueryErrorMessage(response, body, fallbackMessage)
  const err = new Error(message)
  err.status = response.status
  err.code = body?.error || body?.code || null
  err.category = body?.category || body?.error || null
  err.details = body || {}
  return err
}
