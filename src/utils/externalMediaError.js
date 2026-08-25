function resolveLanguage(language) {
  if (language) return language
  if (typeof localStorage !== 'undefined') return localStorage.getItem('language') || 'en'
  return 'en'
}

function getRawMessage(payload, fallback) {
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  if (!payload || typeof payload !== 'object') return fallback
  const error = typeof payload.error === 'string'
    ? payload.error
    : payload.error?.message
  return error || payload.fail_reason || payload.message || fallback
}

export function resolveExternalMediaErrorMessage(payload, fallback = 'Generation failed', language) {
  const contract = payload?.error_i18n || payload?.localized_error
  const messages = contract?.messages
  if (!messages || typeof messages !== 'object') return getRawMessage(payload, fallback)

  const currentLanguage = resolveLanguage(language)
  if (currentLanguage === 'zh-CN') return messages['zh-CN'] || messages.en || getRawMessage(payload, fallback)
  if (currentLanguage === 'zh-TW') return messages['zh-TW'] || messages.en || getRawMessage(payload, fallback)
  return messages.en || getRawMessage(payload, fallback)
}

export function localizeExternalMediaErrorPayload(payload, fallback = 'Generation failed', language) {
  if (!payload || typeof payload !== 'object' || !payload.error_i18n) return payload
  const message = resolveExternalMediaErrorMessage(payload, fallback, language)
  return {
    ...payload,
    error: message,
    ...(payload.fail_reason !== undefined ? { fail_reason: message } : {}),
    ...(payload.message !== undefined ? { message } : {})
  }
}
