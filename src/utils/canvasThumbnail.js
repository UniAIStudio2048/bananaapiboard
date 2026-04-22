/**
 * 画布节点缩略图 URL 工具
 *
 * 根据画布 zoom 级别动态调整图片质量：
 * - 缩小时加载小缩略图，节约内存和带宽
 * - 放大时逐步提高分辨率，接近原图
 * - zoom >= 2 时直接加载原图
 */

const DEFAULT_THUMB_WIDTH = 1024

/**
 * 将完整媒体 URL 转为同源相对路径，避免跨域加载失败
 * 完整 URL 经 Vite proxy（开发）或 nginx（生产）转发到后端
 */
export function toSameOriginUrl(url) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (url.startsWith('/api/')) return url

  const proxyPaths = ['/api/cos-proxy/', '/api/videos/file/', '/api/images/file/', '/api/canvas/audio/']
  for (const p of proxyPaths) {
    const idx = url.indexOf(p)
    if (idx !== -1) return url.substring(idx)
  }
  return url
}

/**
 * 根据节点实际屏幕显示宽度计算合适的缩略图宽度
 * @param {number} zoom 画布缩放级别
 * @param {number} nodeWidth 节点宽度（画布坐标，默认 400）
 *
 * displayWidth = nodeWidth × zoom = 节点在屏幕上的像素宽度
 * displayWidth >= 1200 → 原图（节点接近屏幕大小，几乎不压缩）
 * displayWidth >= 800  → 2048px
 * displayWidth >= 500  → 1024px
 * displayWidth >= 250  → 512px
 * displayWidth <  250  → 256px
 */
export function getThumbWidthForZoom(zoom, nodeWidth = 400) {
  if (!zoom) return 0
  const displayWidth = nodeWidth * zoom
  if (displayWidth >= 1200) return 0
  if (displayWidth >= 800) return 2048
  if (displayWidth >= 500) return 1024
  if (displayWidth >= 250) return 512
  return 256
}

/**
 * 将图片 URL 转为画布适用的缩略图 URL
 * @param {string} url 原始图片 URL
 * @param {number} width 缩略图宽度，传 0 表示使用原图
 */
export function getCanvasThumbnailUrl(url, width = DEFAULT_THUMB_WIDTH) {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (width <= 0) return url

  // 本地文件接口 → 后端 Sharp 缩略图
  if (url.includes('/api/images/file/')) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}preview=true&w=${width}`
  }

  // COS 代理 → 万象数据处理缩略图（仅图片，跳过视频）
  if (url.includes('/api/cos-proxy/') && !isVideoUrl(url)) {
    const sep = url.includes('?') ? '|' : '?'
    return `${url}${sep}imageMogr2/thumbnail/${width}x/format/webp`
  }

  // 七牛 CDN → imageView2 缩略图
  if (isQiniuCdn(url) && !isVideoUrl(url)) {
    if (url.includes('imageView2') || url.includes('imageMogr2')) return url
    const sep = url.includes('?') ? '|' : '?'
    return `${url}${sep}imageView2/2/w/${width}/format/webp`
  }

  return url
}

/**
 * 获取图片原始 URL（去除所有缩略图参数）
 * 用于下载、预览放大、视频节点输入等需要原图的场景
 */
export function getOriginalImageUrl(url) {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url

  // 本地文件接口：去掉 preview 和 w 参数
  if (url.includes('/api/images/file/')) {
    try {
      const urlObj = new URL(url, window.location.origin)
      urlObj.searchParams.delete('preview')
      urlObj.searchParams.delete('w')
      return urlObj.pathname + (urlObj.search || '')
    } catch {
      return url.replace(/[?&]preview=true/g, '').replace(/[?&]w=\d+/g, '')
    }
  }

  // COS 代理：去掉 imageMogr2 参数
  if (url.includes('/api/cos-proxy/')) {
    return url.split('?')[0]
  }

  // 七牛 CDN：去掉 imageView2 参数
  if (isQiniuCdn(url)) {
    return url.split('?')[0]
  }

  return url
}

/**
 * 为视频生成封面图 URL（用作 poster）
 * COS 视频支持 ?ci-process=snapshot 截取首帧
 */
export function getVideoPosterUrl(url, width = DEFAULT_THUMB_WIDTH) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return ''

  // COS 代理视频 → 视频截帧
  if (url.includes('/api/cos-proxy/') && isVideoUrl(url)) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}ci-process=snapshot&time=0&width=${width}&format=jpg`
  }

  // 七牛 CDN 视频 → vframe 截帧
  if (isQiniuCdn(url) && isVideoUrl(url)) {
    const sep = url.includes('?') ? '|' : '?'
    return `${url}${sep}vframe/jpg/offset/0/w/${width}`
  }

  return ''
}

function isVideoUrl(url) {
  if (!url) return false
  const lower = url.split('?')[0].toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
         lower.includes('/videos/') || lower.includes('/video-files/') ||
         lower.includes('/character-videos/')
}

function isQiniuCdn(url) {
  return url.includes('files.nananobanana.cn') ||
         url.includes('qiniucdn.com') || url.includes('qncdn.net') ||
         url.includes('clouddn.com') || url.includes('qnssl.com') ||
         url.includes('qbox.me')
}
