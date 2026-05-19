import { withNoChargeNotice } from '../../../utils/mediaTaskBillingMessage.js'

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

function formatKnownSeedanceError(message) {
  if (!message || typeof message !== 'string') return ''

  const lower = message.toLowerCase()
  const requestId = extractRequestId(message)
  const withRequestId = (text) => requestId ? `${text}。Request id: ${requestId}` : text

  if (lower.includes('the request failed because the output video may contain sensitive information')) {
    return withRequestId('生成的视频可能包含敏感内容，已被内容安全系统拦截，请修改提示词后重试')
  }
  if (lower.includes('the request failed because the input may contain sensitive information')) {
    return withRequestId('输入内容可能包含敏感信息，已被内容安全系统拦截，请修改提示词后重试')
  }
  if (lower.includes('the request failed because the input image may contain sensitive information')) {
    return withRequestId('输入图片可能包含敏感内容，请更换图片后重试')
  }
  if (lower.includes('the request failed because the input video may contain sensitive information')) {
    return withRequestId('输入视频可能包含敏感内容，请更换视频后重试')
  }

  return ''
}

export function formatVideoNodeErrorMessage(message, options = {}) {
  const { includeNoChargeNotice = false, model = '' } = options

  if (!message || typeof message !== 'string') {
    return maybeWithNoChargeNotice('生成失败', includeNoChargeNotice)
  }

  const trimmed = message.trim()
  const lower = trimmed.toLowerCase()
  const seedanceMessage = isSeedanceVideoModel(model) ? formatKnownSeedanceError(trimmed) : ''
  if (seedanceMessage) {
    return maybeWithNoChargeNotice(seedanceMessage, includeNoChargeNotice)
  }

  const videoDurationMatch = trimmed.match(/video duration \(seconds\).*?less than or equal to\s+(\d+(?:\.\d+)?)/i)
  if (videoDurationMatch) {
    return maybeWithNoChargeNotice(`参考视频时长超限：当前渠道最多支持 ${videoDurationMatch[1]} 秒，请裁剪参考视频后重试。`, includeNoChargeNotice)
  }

  const audioDurationMatch = trimmed.match(/audio duration.*?less than or equal to\s+(\d+(?:\.\d+)?)/i)
  if (audioDurationMatch) {
    return maybeWithNoChargeNotice(`参考音频时长超限：当前渠道最多支持 ${audioDurationMatch[1]} 秒，请裁剪音频后重试。`, includeNoChargeNotice)
  }

  const videoPixelCountMatch = trimmed.match(/video pixel count.*?less than or equal to\s+(\d+)/i)
  if (videoPixelCountMatch) {
    return maybeWithNoChargeNotice(`参考视频分辨率过高：当前渠道要求单帧像素数不超过 ${videoPixelCountMatch[1]}，请压缩参考视频分辨率后重试。`, includeNoChargeNotice)
  }

  if (lower.includes('audio format specified in the request is not valid')) {
    return maybeWithNoChargeNotice('参考音频格式不受当前渠道支持，请改用常见的 MP3 或 WAV 后重试。', includeNoChargeNotice)
  }

  return maybeWithNoChargeNotice(trimmed.replace(/\s*request id:\s*[a-z0-9-]+\s*$/i, '').trim(), includeNoChargeNotice)
}

export function formatVideoNodeAsyncErrorMessage(message, model, options = {}) {
  const { includeNoChargeNotice = false } = options

  if (isSeedanceVideoModel(model)) {
    const seedanceMessage = formatKnownSeedanceError(message)
    if (seedanceMessage) {
      return maybeWithNoChargeNotice(seedanceMessage, includeNoChargeNotice)
    }
    return maybeWithNoChargeNotice(typeof message === 'string' && message.trim() ? message.trim() : '生成失败', includeNoChargeNotice)
  }

  return formatVideoNodeErrorMessage(message, options)
}
