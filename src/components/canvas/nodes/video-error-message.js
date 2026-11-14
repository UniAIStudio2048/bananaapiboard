import { t as translateUi } from '../../../i18n/index.js'
import { withNoChargeNotice } from '../../../utils/mediaTaskBillingMessage.js'

const FORBIDDEN_MODEL_TERMS = /万相\s*3(?:\.0)?|wan\s*3(?:[._-]?0)(?:[-_][a-z0-9.-]+)*|seedance\s*[-_]?2(?:[._-]?(?:0|5))(?:[-_][a-z0-9.-]+)*|火山引擎/gi

export function isSeedanceVideoModel(model) {
  if (!model || typeof model !== 'string') return false
  return model.toLowerCase().includes('seedance')
}

function maybeWithNoChargeNotice(message, includeNoChargeNotice) {
  return includeNoChargeNotice ? withNoChargeNotice(message) : message
}

function extractRequestId(message) {
  const match = String(message || '').match(/\brequest id:\s*([a-z0-9-]+)/i)
  return match?.[1] || ''
}

export function sanitizeVideoNodeMessage(message) {
  if (!message || typeof message !== 'string') return message || ''
  return message
    .replace(FORBIDDEN_MODEL_TERMS, '')
    .replace(/([（(])\s*(?:[/／,，;；|]\s*)+/g, '$1')
    .replace(/\s*(?:[/／,，;；|]\s*)+([）)])/g, '$1')
    .replace(/（\s*）|\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function isVideoNodeNetworkError(message) {
  const normalized = String(message || '').trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed') ||
    normalized.includes('load failed') ||
    normalized.includes('网络连接异常')
}

function formatKnownSeedanceError(message) {
  if (!message || typeof message !== 'string') return ''

  const lower = message.toLowerCase()
  const requestId = extractRequestId(message)
  const withRequestId = (text) => requestId ? `${text}。Request id: ${requestId}` : text

  if (lower.includes('inputimagesensitivecontentdetected.privacyinformation') ||
      /input image\b.*?may contain real person/i.test(message)) {
    return withRequestId(translateUi('uiMessages.m9e89e53e2865'))
  }
  if (lower.includes('the request failed because the output video may contain sensitive information')) {
    return withRequestId(translateUi('uiMessages.mff592c157e91'))
  }
  if (lower.includes('the request failed because the input may contain sensitive information')) {
    return withRequestId(translateUi('uiMessages.mc3e7ea201e84'))
  }
  if (lower.includes('the request failed because the input text may contain sensitive information')) {
    return withRequestId(translateUi('uiMessages.m837cd60b44a6'))
  }
  if (lower.includes('the request failed because the input image may contain sensitive information')) {
    return withRequestId(translateUi('uiMessages.m16af09e1c8d3'))
  }
  if (lower.includes('the request failed because the input video may contain sensitive information')) {
    return withRequestId(translateUi('uiMessages.m8005df5ea697'))
  }

  return ''
}

export function formatVideoNodeErrorMessage(message, options = {}) {
  const { includeNoChargeNotice = false, model = '' } = options

  if (!message || typeof message !== 'string') {
    return maybeWithNoChargeNotice(translateUi('canvas.audioNode.generateFailed'), includeNoChargeNotice)
  }

  const trimmed = message.trim()
  const lower = trimmed.toLowerCase()
  if (isVideoNodeNetworkError(trimmed)) {
    return maybeWithNoChargeNotice(translateUi('uiMessages.mff328011b804'), includeNoChargeNotice)
  }

  const knownContentSafetyMessage = formatKnownSeedanceError(trimmed)
  if (knownContentSafetyMessage) {
    return maybeWithNoChargeNotice(knownContentSafetyMessage, includeNoChargeNotice)
  }

  // Wan3.0 将参考视频时长和输出时长合并校验；上游返回英文表达式时统一给出中文规则。
  if (/input[_ ]video[_ ]duration\s*\([^)]*\)\s*\+\s*duration\s*\([^)]*\).*exceeds\s*30s\s*limit/i.test(trimmed)) {
    return maybeWithNoChargeNotice(translateUi('uiMessages.m47251f2c6902'), includeNoChargeNotice)
  }
  if (/\bduration\s*\([^)]*\).*exceeds\s*30s\s*limit/i.test(trimmed)) {
    return maybeWithNoChargeNotice(translateUi('uiMessages.m67c79e7ff44f'), includeNoChargeNotice)
  }

  const videoDurationMatch = trimmed.match(/video duration \(seconds\).*?less than or equal to\s+(\d+(?:\.\d+)?)/i)
  if (videoDurationMatch) {
    return maybeWithNoChargeNotice(translateUi('uiMessages.m5ace786bd54e', { value1: (videoDurationMatch[1]) }), includeNoChargeNotice)
  }

  const audioDurationMatch = trimmed.match(/audio duration.*?less than or equal to\s+(\d+(?:\.\d+)?)/i)
  if (audioDurationMatch) {
    return maybeWithNoChargeNotice(translateUi('uiMessages.m1b9129a8d05c', { value1: (audioDurationMatch[1]) }), includeNoChargeNotice)
  }

  const videoPixelCountMatch = trimmed.match(/video pixel count.*?less than or equal to\s+(\d+)/i)
  if (videoPixelCountMatch) {
    return maybeWithNoChargeNotice(translateUi('uiMessages.mfc6a047147d5', { value1: (videoPixelCountMatch[1]) }), includeNoChargeNotice)
  }

  if (lower.includes('audio format specified in the request is not valid')) {
    return maybeWithNoChargeNotice(translateUi('uiMessages.m8c9f8eed1d02'), includeNoChargeNotice)
  }

  return maybeWithNoChargeNotice(
    sanitizeVideoNodeMessage(trimmed.replace(/\s*request id:\s*[a-z0-9-]+\s*$/i, '').trim()),
    includeNoChargeNotice
  )
}

export function formatVideoNodeAsyncErrorMessage(message, model, options = {}) {
  const { includeNoChargeNotice = false } = options

  if (isVideoNodeNetworkError(message)) {
    return maybeWithNoChargeNotice(translateUi('uiMessages.mff328011b804'), includeNoChargeNotice)
  }

  if (isSeedanceVideoModel(model)) {
    const seedanceMessage = formatKnownSeedanceError(message)
    if (seedanceMessage) {
      return maybeWithNoChargeNotice(seedanceMessage, includeNoChargeNotice)
    }
    return maybeWithNoChargeNotice(
      sanitizeVideoNodeMessage(typeof message === 'string' && message.trim() ? message.trim() : translateUi('canvas.audioNode.generateFailed')),
      includeNoChargeNotice
    )
  }

  return formatVideoNodeErrorMessage(message, options)
}
