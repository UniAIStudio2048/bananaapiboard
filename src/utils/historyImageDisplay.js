function encodeBase64(value) {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(value)))
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64')
  }
  return ''
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function makeHistoryImagePlaceholder(item = {}) {
  const prompt = escapeSvgText(String(item.note || item.prompt || '图片暂不可用').slice(0, 30))
  const model = escapeSvgText(String(item.model || '').slice(0, 20))
  const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="52%" stop-color="#334155"/><stop offset="100%" stop-color="#1e40af"/></linearGradient></defs><rect width="640" height="480" fill="url(#bg)"/><circle cx="320" cy="188" r="54" fill="rgba(255,255,255,0.14)"/><path d="M286 206l23-26 20 22 15-16 30 36h-88z" fill="rgba(255,255,255,0.78)"/><text x="320" y="286" fill="#fff" font-size="28" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">图片暂不可用</text><text x="320" y="322" fill="rgba(255,255,255,0.76)" font-size="17" font-family="Arial, sans-serif" text-anchor="middle">${prompt}</text><text x="320" y="350" fill="rgba(255,255,255,0.56)" font-size="14" font-family="Arial, sans-serif" text-anchor="middle">${model}</text></svg>`
  return `data:image/svg+xml;base64,${encodeBase64(svg)}`
}

export function getHistoryImageDisplayUrl(item = {}, mediaUrlResolver = value => value) {
  if (!item?.url) return makeHistoryImagePlaceholder(item)
  return mediaUrlResolver(item.url)
}
