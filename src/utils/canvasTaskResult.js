function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function firstArrayUrl(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const url = value.find(item => typeof item === 'string' && item.trim())
      if (url) return url
    }
  }
  return null
}

function firstObjectUrl(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const url = firstString(
        value.url,
        value.video_url,
        value.audio_url,
        value.image_url,
        value.outputUrl,
        value.output_url,
        value.qiniu_url,
        value.cdn_url,
        value.cos_url
      )
      if (url) return url
    }
  }
  return null
}

function firstArrayObjectUrl(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const url = value
        .map(item => typeof item === 'string' ? item : firstObjectUrl(item))
        .find(item => typeof item === 'string' && item.trim())
      if (url) return url
    }
  }
  return null
}

export function getTaskMediaUrl(result, type = 'image') {
  if (!result) return null

  if (type === 'audio') {
    return firstString(
      result.audio_url,
      result.url,
      result.outputUrl,
      result.output_url,
      result.qiniu_url,
      result.cdn_url,
      result.cos_url,
      result.data?.audio_url,
      result.data?.url,
      result.data?.output,
      result.data?.output_url,
      result.data?.qiniu_url,
      result.data?.cdn_url,
      result.result?.audio_url,
      result.result?.url,
      result.result?.output,
      result.result?.output_url,
      firstObjectUrl(result.output, result.data?.output, result.result?.output),
      firstArrayObjectUrl(result.audios, result.data?.audios, result.result?.audios)
    )
  }

  if (type === 'video') {
    return firstString(
      result.video_url,
      result.url,
      result.outputUrl,
      result.output_url,
      result.qiniu_url,
      result.cdn_url,
      result.cos_url,
      result.data?.video_url,
      result.data?.url,
      result.data?.output,
      result.data?.output_url,
      result.data?.qiniu_url,
      result.data?.cdn_url,
      result.result?.video_url,
      result.result?.url,
      result.result?.output,
      result.result?.output_url,
      result.result?.qiniu_url,
      result.result?.cdn_url,
      firstObjectUrl(result.output, result.data?.output, result.result?.output),
      firstArrayObjectUrl(result.videos, result.data?.videos, result.result?.videos, result.outputs, result.data?.outputs, result.result?.outputs)
    )
  }

  return firstString(
    result.url,
    firstArrayUrl(result.urls, result.images),
    firstArrayObjectUrl(result.outputs, result.data?.outputs, result.result?.outputs),
    result.qiniu_url,
    result.cdn_url,
    result.cos_url,
    result.image_url,
    result.outputUrl,
    result.output_url,
    result.data?.url,
    firstArrayUrl(result.data?.urls, result.data?.images),
    result.data?.qiniu_url,
    result.data?.cdn_url,
    result.data?.image_url,
    result.data?.output,
    result.data?.output_url,
    result.result?.url,
    firstArrayUrl(result.result?.urls, result.result?.images),
    result.result?.image_url,
    result.result?.output,
    result.result?.output_url,
    firstObjectUrl(result.output, result.data?.output, result.result?.output)
  )
}

export function normalizeTaskMediaResult(result, type = 'image') {
  const url = getTaskMediaUrl(result, type)
  const normalized = { ...(result || {}) }

  if (url) {
    normalized.url = normalized.url || url
    if (type === 'audio') {
      normalized.audio_url = normalized.audio_url || url
    } else if (type === 'video') {
      normalized.video_url = normalized.video_url || url
    } else if (!Array.isArray(normalized.urls) || normalized.urls.length === 0) {
      normalized.urls = [url]
    }
  }

  normalized.hasOutput = !!url
  return normalized
}
