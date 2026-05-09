export function isVideoDownloadTarget(url, filename = '') {
  const text = `${url || ''} ${filename || ''}`.split(/[?#]/)[0]
  return /\.(mp4|webm|mov|avi|m4v|mkv)(\s|$)/i.test(text)
}

export function isCosCdnDownloadUrl(url) {
  if (!url || typeof url !== 'string') return false
  const lower = url.toLowerCase()
  return lower.includes('filescos.nananobanana.cn') ||
    ((lower.includes('.cos.') || lower.includes('.cos-')) && lower.includes('.myqcloud.com')) ||
    lower.includes('.tencentcos.cn')
}

export function isDirectCdnDownloadUrl(url) {
  return isCosCdnDownloadUrl(url)
}

export function cleanCosCdnDownloadUrl(url) {
  if (!isCosCdnDownloadUrl(url)) return url

  try {
    const parsed = new URL(url)
    const rawSearch = parsed.search || ''
    if (rawSearch.includes('imageMogr2') || rawSearch.includes('imageView2') || rawSearch.includes('ci-process=')) {
      parsed.search = ''
    }
    return parsed.toString()
  } catch {
    return url.split('?')[0]
  }
}

export function buildDirectCdnDownloadUrl(url, filename = 'download') {
  if (!isDirectCdnDownloadUrl(url)) return url

  return cleanCosCdnDownloadUrl(url)
}

export function buildMediaProxyDownloadPath(url, filename) {
  const params = new URLSearchParams({
    url,
    filename: filename || (isVideoDownloadTarget(url) ? 'video.mp4' : 'download')
  })

  const endpoint = isVideoDownloadTarget(url, filename)
    ? '/api/videos/download'
    : '/api/images/download'

  return `${endpoint}?${params.toString()}`
}

export function cleanStreamDownloadUrl(url) {
  if (!url || typeof url !== 'string') return url

  if (!url.includes('/api/images/file/')) return url

  try {
    const parsed = new URL(url, 'http://download.local')
    parsed.searchParams.delete('preview')
    parsed.searchParams.delete('w')
    return url.startsWith('http://') || url.startsWith('https://')
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}`
  } catch {
    return url
      .replace(/([?&])preview=true(&?)/g, (match, prefix, suffix) => suffix ? prefix : '')
      .replace(/([?&])w=\d+(&?)/g, (match, prefix, suffix) => suffix ? prefix : '')
      .replace(/[?&]$/, '')
  }
}

export function buildStreamDownloadPath(url, filename) {
  const cleanUrl = cleanStreamDownloadUrl(url)
  return buildMediaProxyDownloadPath(cleanUrl, filename)
}
