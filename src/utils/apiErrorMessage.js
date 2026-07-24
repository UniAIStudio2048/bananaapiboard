function firstString(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function extractNestedMessage(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value !== 'object') return ''
  return firstString([
    extractNestedMessage(value.message, depth + 1),
    extractNestedMessage(value.detail, depth + 1),
    extractNestedMessage(value.details, depth + 1),
    extractNestedMessage(value.error, depth + 1),
    extractNestedMessage(value.reason, depth + 1)
  ])
}

function isGenericMessage(message) {
  const normalized = String(message || '').trim().toLowerCase()
  return !normalized ||
    normalized === '生成失败' ||
    normalized === '请求失败' ||
    normalized === '后端报错' ||
    normalized.includes('所有视频生成渠道都不可用') ||
    normalized.includes('服务器错误') ||
    normalized === 'internal server error'
}

function cleanChannelDetail(message) {
  return String(message || '')
    .replace(/^渠道\s+\S+\s+(返回错误:\s*\d+\s*-\s*|返回格式错误:\s*|返回业务错误:\s*|请求失败:\s*)/, '')
    .trim()
}

export function getApiErrorMessage(payload = {}, fallback = '生成失败') {
  if (typeof payload === 'string') return payload.trim() || fallback

  const message = firstString([payload?.message])
  const detail = firstString([
    extractNestedMessage(payload?.detail),
    extractNestedMessage(payload?.details),
    typeof payload?.error === 'object' ? extractNestedMessage(payload.error) : ''
  ])

  if (message && !isGenericMessage(message)) return message
  if (detail) return cleanChannelDetail(detail) || fallback
  if (message) return message
  return firstString([typeof payload?.error === 'string' ? payload.error : '', fallback])
}
