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

export function getTaskMediaUrl(result, type = 'image') {
  if (!result) return null

  if (type === 'audio') {
    return firstString(
      result.audio_url,
      result.url,
      result.outputUrl,
      result.qiniu_url,
      result.cdn_url,
      result.cos_url,
      result.data?.audio_url,
      result.data?.url,
      result.data?.output,
      result.data?.qiniu_url,
      result.data?.cdn_url
    )
  }

  if (type === 'video') {
    return firstString(
      result.video_url,
      result.url,
      result.outputUrl,
      result.qiniu_url,
      result.cdn_url,
      result.cos_url,
      result.data?.video_url,
      result.data?.url,
      result.data?.output,
      result.data?.qiniu_url,
      result.data?.cdn_url
    )
  }

  return firstString(
    result.url,
    firstArrayUrl(result.urls, result.images),
    result.qiniu_url,
    result.cdn_url,
    result.cos_url,
    result.image_url,
    result.data?.url,
    firstArrayUrl(result.data?.urls, result.data?.images),
    result.data?.qiniu_url,
    result.data?.cdn_url,
    result.data?.image_url
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
