export function isVideoUrl(url) {
  if (!url) return false
  const lower = url.split('?')[0].toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
         lower.includes('/videos/') || lower.includes('/video-files/') ||
         lower.includes('/character-videos/')
}

export function isQiniuCdn(url) {
  return !!url && (
    url.includes('files.nananobanana.cn') ||
    url.includes('qiniucdn.com') || url.includes('qncdn.net') ||
    url.includes('clouddn.com') || url.includes('qnssl.com') ||
    url.includes('qbox.me')
  )
}

export function isCosCdn(url) {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.includes('filescos.nananobanana.cn') ||
         (lower.includes('.cos.') && lower.includes('.myqcloud.com')) ||
         lower.includes('.tencentcos.cn')
}

export function getCosProxyUrl(url) {
  if (!url) return ''

  const proxyMarker = '/api/cos-proxy/'
  const proxyIndex = url.indexOf(proxyMarker)
  if (proxyIndex !== -1) {
    return url.slice(proxyIndex)
  }

  if (!isCosCdn(url)) return ''

  try {
    const parsed = new URL(url)
    return `${proxyMarker}${parsed.pathname.replace(/^\/+/, '')}${parsed.search || ''}`
  } catch {
    return ''
  }
}

export function getCloudVideoPosterUrl(url, width = 2048) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return ''

  if (isCosCdn(url) && isVideoUrl(url)) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}ci-process=snapshot&time=0&width=${width}&format=jpg`
  }

  if (url.includes('/api/cos-proxy/') && isVideoUrl(url)) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}ci-process=snapshot&time=0&width=${width}&format=jpg`
  }

  if (isQiniuCdn(url) && isVideoUrl(url)) {
    const sep = url.includes('?') ? '|' : '?'
    return `${url}${sep}vframe/jpg/offset/0/w/${width}`
  }

  return ''
}
