export function formatVideoNodeErrorMessage(message) {
  if (!message || typeof message !== 'string') return '生成失败'

  const trimmed = message.trim()
  const lower = trimmed.toLowerCase()

  const videoDurationMatch = trimmed.match(/video duration \(seconds\).*?less than or equal to\s+(\d+(?:\.\d+)?)/i)
  if (videoDurationMatch) {
    return `参考视频时长超限：当前渠道最多支持 ${videoDurationMatch[1]} 秒，请裁剪参考视频后重试。`
  }

  const audioDurationMatch = trimmed.match(/audio duration.*?less than or equal to\s+(\d+(?:\.\d+)?)/i)
  if (audioDurationMatch) {
    return `参考音频时长超限：当前渠道最多支持 ${audioDurationMatch[1]} 秒，请裁剪音频后重试。`
  }

  const videoPixelCountMatch = trimmed.match(/video pixel count.*?less than or equal to\s+(\d+)/i)
  if (videoPixelCountMatch) {
    return `参考视频分辨率过高：当前渠道要求单帧像素数不超过 ${videoPixelCountMatch[1]}，请压缩参考视频分辨率后重试。`
  }

  if (lower.includes('audio format specified in the request is not valid')) {
    return '参考音频格式不受当前渠道支持，请改用常见的 MP3 或 WAV 后重试。'
  }

  return trimmed.replace(/\s*request id:\s*[a-z0-9-]+\s*$/i, '').trim()
}
