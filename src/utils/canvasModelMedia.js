export function isPreferredModelMediaUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('blob:') || url.startsWith('data:')) return false
  if (url.includes('localhost') || url.includes('127.0.0.1')) return false
  if (url.includes('/api/images/file/')) return false
  if (url.includes('files.nananobanana.cn')) return true
  if (url.includes('filescos.nananobanana.cn')) return true
  if (url.includes('qncdn.') || url.includes('.qiniucdn.com') || url.includes('.qbox.me')) return true
  if (url.includes('/api/cos-proxy/')) return true
  return /^https?:\/\//i.test(url)
}

function stripImageTransformParams(url) {
  if (url.includes('/api/images/file/')) {
    try {
      const urlObj = new URL(url, 'http://local.test')
      urlObj.searchParams.delete('preview')
      urlObj.searchParams.delete('w')
      const path = urlObj.pathname + (urlObj.search || '')
      return url.startsWith('http://') || url.startsWith('https://') ? urlObj.href.replace('http://local.test', '') : path
    } catch {
      return url.replace(/[?&]preview=true/g, '').replace(/[?&]w=\d+/g, '')
    }
  }

  if (url.includes('imageMogr2') || url.includes('imageView2')) {
    return url.split('?')[0].split('|')[0]
  }

  return url
}

export function normalizeModelImageUrl(url) {
  if (!url || typeof url !== 'string') return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  return stripImageTransformParams(url)
}

export function normalizeModelImageUrls(urls) {
  if (!Array.isArray(urls)) return []
  return urls.map(normalizeModelImageUrl).filter(Boolean)
}
