export function isVideoDownloadTarget(url, filename = '') {
  const text = `${url || ''} ${filename || ''}`.split(/[?#]/)[0]
  return /\.(mp4|webm|mov|avi|m4v|mkv)(\s|$)/i.test(text)
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
