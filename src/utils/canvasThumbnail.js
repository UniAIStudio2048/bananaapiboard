/**
 * 画布节点缩略图 URL 工具
 *
 * 画布节点通常只有 200-400px 宽，不需要加载原图（可能 4K+）。
 * 此工具将各类图片 URL 转为带缩略图参数的版本，显著降低：
 * - 网络带宽（缩略图 ~30-100KB vs 原图 ~2-6MB）
 * - 内存占用（解码后像素缓冲区从 ~40MB 降到 ~1MB）
 * - GPU 解码耗时
 */

const CANVAS_THUMB_WIDTH = 400

/**
 * 将图片 URL 转为画布适用的缩略图 URL
 */
export function getCanvasThumbnailUrl(url, width = CANVAS_THUMB_WIDTH) {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url

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
 * 为视频生成封面图 URL（用作 poster）
 * COS 视频支持 ?ci-process=snapshot 截取首帧
 */
export function getVideoPosterUrl(url, width = CANVAS_THUMB_WIDTH) {
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
