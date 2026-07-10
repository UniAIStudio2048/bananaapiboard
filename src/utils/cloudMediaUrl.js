import { getApiUrl } from '@/config/tenant'

// 自有 CDN 直连开关：Vite 环境变量 VITE_DIRECT_CDN，默认 false（走 proxy，保持现状）
// 仅当 COS 已配置 CORS 后再开启（设为 'true' 或 '1'）。
const DIRECT_CDN_ENABLED = import.meta.env.VITE_DIRECT_CDN === 'true' || import.meta.env.VITE_DIRECT_CDN === '1'

/**
 * 智能解析图片 URL，决定直连还是走后端代理。
 * - data:/blob:/相对路径（/storage/、/api/）→ 原样返回
 * - 非 http(s) → 原样返回
 * - 同源 → 直连
 * - 自有 CDN（COS / 七牛）且开关开启 → 直连（依赖 COS 已配 CORS）
 * - 第三方域名 或 开关未开 → 走 /api/images/proxy 补 CORS
 */
export function getSmartImageUrl(url) {
  if (!url) return null
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/storage/') || url.startsWith('/api/')) return url
  if (!(url.startsWith('http://') || url.startsWith('https://'))) return url

  // 同源直连
  try { if (new URL(url).host === window.location.host) return url } catch (_) {}

  // 新画布资产已在上传阶段完成 COS/CORS 校验，始终绕过应用服务器直读 CDN。
  if (isCanvasDirectCdnUrl(url)) return url

  // 自家 CDN：开关开启时直连（依赖 COS 已配 CORS），否则暂走 proxy
  if (DIRECT_CDN_ENABLED && (isCosCdn(url) || isQiniuCdn(url))) {
    return url
  }

  // 第三方域名 或 开关未开：走代理补 CORS
  return `${getApiUrl('/api/images/proxy')}?force=1&url=${encodeURIComponent(url)}`
}

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

export function isCanvasDirectCdnUrl(url) {
  if (!isCosCdn(url)) return false
  try {
    return new URL(url).pathname.startsWith('/canvas/')
  } catch {
    return false
  }
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
