/**
 * 画布节点缩略图 URL 工具
 *
 * 根据画布 zoom 级别动态调整图片质量：
 * - 缩小时加载小缩略图，节约内存和带宽
 * - 放大时逐步提高分辨率，接近原图
 * - zoom >= 2 时直接加载原图
 */

import { getApiUrl } from '@/config/tenant'
import { getCloudVideoPosterUrl, isCosCdn, isQiniuCdn, isVideoUrl } from './cloudMediaUrl.js'

const DEFAULT_THUMB_WIDTH = 2048
const MIN_CANVAS_PREVIEW_WIDTH = 1024
const PREVIEW_WIDTHS = [1024, 2048, 3072]

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
 * 画布节点预览不再使用 256/512 低清图，也不强制转 WebP。
 * 目标是接近原图观感，仅在远距离缩放时减少传输体积。
 */
export function getThumbWidthForZoom(zoom, nodeWidth = 400) {
  if (!zoom) return 0
  const displayWidth = nodeWidth * zoom
  if (displayWidth >= 1200) return 0
  if (displayWidth >= 700) return 3072
  if (displayWidth >= 250) return 2048
  return MIN_CANVAS_PREVIEW_WIDTH
}

export function getHighQualityCanvasPreviewUrl(url, { zoom = 1, nodeWidth = 400, devicePixelRatio = 1 } = {}) {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url

  const displayWidth = Math.max(1, (nodeWidth || 400) * (zoom || 1) * Math.max(1, devicePixelRatio || 1))
  if (displayWidth >= 1200) return url

  const targetWidth = PREVIEW_WIDTHS.find(width => width >= displayWidth) || 0
  return getCanvasThumbnailUrl(url, targetWidth || 0)
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
