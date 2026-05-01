/**
 * 画布节点缩略图 URL 工具
 *
 * 根据画布 zoom 级别动态调整图片质量：
 * - 缩小时加载小缩略图，节约内存和带宽
 * - 放大时逐步提高分辨率，接近原图
 * - 原图仅用于下载、全屏预览或生成输入，不直接用于画布节点
 */

import { getApiUrl } from '@/config/tenant'
import { getCloudVideoPosterUrl, isCosCdn, isQiniuCdn, isVideoUrl } from './cloudMediaUrl.js'

const DEFAULT_THUMB_WIDTH = 1024
const MIN_CANVAS_PREVIEW_WIDTH = 384
const PREVIEW_WIDTHS = [384, 768, 1024]

/**
 * 将完整媒体 URL 转为可访问的 URL
 * - 本地部署（apiBase 为空）：返回 /api/... 相对路径，由 Vite proxy / Nginx 转发
 * - 远程租户（apiBase 非空）：返回 ${apiBase}/api/... 绝对路径，直连后端 API
 */
export function toSameOriginUrl(url) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (url.startsWith('/api/')) return getApiUrl(url)

  const proxyPaths = ['/api/cos-proxy/', '/api/videos/file/', '/api/images/file/', '/api/canvas/audio/']
  for (const p of proxyPaths) {
    const idx = url.indexOf(p)
    if (idx !== -1) return getApiUrl(url.substring(idx))
  }
  return url
}

/**
 * 根据节点实际屏幕显示宽度计算合适的缩略图宽度
 * @param {number} zoom 画布缩放级别
 * @param {number} nodeWidth 节点宽度（画布坐标，默认 400）
 *
 * displayWidth = nodeWidth × zoom = 节点在屏幕上的像素宽度
 * 画布节点预览固定使用小档位，原图只在全屏预览、下载、生成输入中使用。
 */
export function getThumbWidthForZoom(zoom, nodeWidth = 400) {
  if (!zoom) return MIN_CANVAS_PREVIEW_WIDTH
  const displayWidth = nodeWidth * zoom
  if (displayWidth >= 700) return 1024
  if (displayWidth >= 250) return 768
  return MIN_CANVAS_PREVIEW_WIDTH
}

export function getHighQualityCanvasPreviewUrl(url, { zoom = 1, nodeWidth = 400, devicePixelRatio = 1, preferLowQuality = false } = {}) {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (preferLowQuality) return getCanvasThumbnailUrl(url, MIN_CANVAS_PREVIEW_WIDTH)

  const displayWidth = Math.max(1, (nodeWidth || 400) * (zoom || 1) * Math.max(1, devicePixelRatio || 1))
  const targetWidth = PREVIEW_WIDTHS.find(width => width >= displayWidth) || PREVIEW_WIDTHS[PREVIEW_WIDTHS.length - 1]
  return getCanvasThumbnailUrl(url, targetWidth)
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

  // COS CDN → 数据万象缩略图（仅图片）
  if (isCosCdn(url) && !isVideoUrl(url)) {
    if (url.includes('imageMogr2') || url.includes('imageView2')) return url
    const sep = url.includes('?') ? '|' : '?'
    return `${url}${sep}imageMogr2/thumbnail/${width}x/format/webp`
  }

  // COS 代理 → 万象数据处理缩略图（仅图片，跳过视频）
  if (url.includes('/api/cos-proxy/') && !isVideoUrl(url)) {
    const sep = url.includes('?') ? '|' : '?'
    return `${url}${sep}imageMogr2/thumbnail/${width}x`
  }

  // 七牛 CDN → imageView2 缩略图
  if (isQiniuCdn(url) && !isVideoUrl(url)) {
    if (url.includes('imageView2') || url.includes('imageMogr2')) return url
    const sep = url.includes('?') ? '|' : '?'
    return `${url}${sep}imageView2/2/w/${width}`
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

  // COS CDN：去掉 imageMogr2 参数
  if (isCosCdn(url)) {
    return url.split('?')[0]
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
  return getCloudVideoPosterUrl(url, width)
}
