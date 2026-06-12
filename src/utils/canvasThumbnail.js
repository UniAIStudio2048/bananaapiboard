/**
 * 画布节点缩略图 URL 工具
 *
 * LOD（Level of Detail）策略：
 * - 画布缩小、节点很小 → 小档位缩略图，节约内存和带宽
 * - 节点逐渐放大 → 逐步提高分辨率
 * - 节点接近屏幕大小（>= 1920px 显示宽度）→ 直接用原图，保证清晰度
 * - pan/zoom 移动期间 → 强制最小档位低质量占位（preferLowQuality）
 *
 * 严格原则：
 * - 下载、节点间连线传输、全屏预览 → 始终使用原图（通过 getOriginalImageUrl）
 * - 画布节点显示 → 走缩略图档位
 * - COS CDN 缩略图加载失败 → 通过 onImageError 回退到原图，避免节点空白
 */

import { getApiUrl } from '@/config/tenant'
import { getCloudVideoPosterUrl, getCosProxyUrl, getSmartImageUrl, isCosCdn, isQiniuCdn, isVideoUrl } from './cloudMediaUrl.js'
import { selectLodWidth, MIN_CANVAS_PREVIEW_WIDTH, PREVIEW_WIDTHS, ORIGINAL_THRESHOLD } from './lodSelector.js'

const DEFAULT_THUMB_WIDTH = 1024

// COS 数据万象开关：默认启用（后端 cos-storage.js 已在用），生产环境若未开通可设 false
const COS_THUMBNAIL_ENABLED = (() => {
  try {
    const v = import.meta?.env?.VITE_COS_THUMBNAIL_ENABLED
    return v === undefined || v === '' ? true : v !== 'false' && v !== false
  } catch {
    return true
  }
})()

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

  if (isCosCdn(url) && isVideoUrl(url)) {
    return url
  }

  return url
}

/**
 * 根据节点实际屏幕显示宽度计算合适的缩略图宽度（不含 DPR 校正）
 * @param {number} zoom 画布缩放级别
 * @param {number} nodeWidth 节点宽度（画布坐标，默认 400）
 */
export function getThumbWidthForZoom(zoom, nodeWidth = 400) {
  if (!zoom) return MIN_CANVAS_PREVIEW_WIDTH
  const displayWidth = nodeWidth * zoom
  if (displayWidth >= ORIGINAL_THRESHOLD) return 0 // 0 表示用原图
  return PREVIEW_WIDTHS.find(width => width >= displayWidth) || PREVIEW_WIDTHS[PREVIEW_WIDTHS.length - 1]
}

/**
 * 根据视口状态返回画布节点应该使用的图片 URL
 *
 * 选择规则：
 *   - blob/data URI 直接返回（本地未上传）
 *   - preferLowQuality（pan/zoom 移动中）→ 最小档位
 *   - displayWidth >= 1920 → 原图（接近屏幕大小，避免模糊）
 *   - 其余按 PREVIEW_WIDTHS 选最小覆盖档位
 *
 * @param {string} url 原图 URL
 * @param {object} opts
 * @param {number} opts.zoom 画布 zoom
 * @param {number} opts.nodeWidth 节点画布坐标宽度
 * @param {number} opts.devicePixelRatio 设备像素比（高分屏）
 * @param {boolean} opts.preferLowQuality 是否优先低质量（移动期间）
 */
export function getHighQualityCanvasPreviewUrl(url, opts = {}) {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  const targetWidth = selectLodWidth(opts)
  // selectLodWidth 返回 0 表示节点接近屏幕大小，直接用原图避免模糊
  if (targetWidth === 0) return url
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

  // COS CDN 图片走数据万象缩略图（后端 cos-storage.js 已在用相同协议）。
  // 若 bucket 未启用万象或对象无扩展名，<img @error> 会自动回退到原图（见 makeCanvasImageErrorHandler）。
  // 紧急回滚：设环境变量 VITE_COS_THUMBNAIL_ENABLED=false 即可全局关闭。
  if (isCosCdn(url) && !isVideoUrl(url)) {
    if (!COS_THUMBNAIL_ENABLED) return url
    if (url.includes('imageMogr2') || url.includes('imageView2')) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}imageMogr2/thumbnail/${width}x`
  }

  // COS 代理 → 万象数据处理缩略图（仅图片，跳过视频）
  if (url.includes('/api/cos-proxy/') && !isVideoUrl(url)) {
    if (url.includes('imageMogr2') || url.includes('imageView2')) return url
    const sep = url.includes('?') ? '&' : '?'
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
 * 创建画布 <img> 的 onerror 回退处理器
 *
 * 缩略图加载失败时（COS 未开通万象 / 对象无扩展名等）自动回退到原图 URL，
 * 杜绝「画布只剩连线」的灾难场景。每张图最多回退一次，避免死循环。
 *
 * 用法：<img :src="thumbUrl" @error="onCanvasImageError" />
 */
export function onCanvasImageError(event) {
  const img = event?.target
  if (!img || !(img instanceof HTMLImageElement)) return
  if (img.dataset.fallbackTried === '1') return
  const current = img.getAttribute('src')
  if (!current) return
  const original = getOriginalImageUrl(current)
  if (!original || original === current) return
  img.dataset.fallbackTried = '1'
  img.src = original
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

/**
 * 将外部 CDN 图片 URL 转为可跨域访问的 URL
 * 用于 Canvas 绘图操作（需要 crossOrigin 或 fetch）
 * 内部委托给 cloudMediaUrl 的 getSmartImageUrl 统一收敛逻辑：
 * - blob:/data: 直接返回
 * - /storage/ 或 /api/ 开头的相对路径直接返回
 * - 同源 URL 直接返回
 * - 自有 CDN（开关开启时）直连，否则与第三方一样走 /api/images/proxy 代理
 * 保留导出名 getProxiedImageUrl 以保持向后兼容（其他文件 import 它）。
 */
export function getProxiedImageUrl(url) {
  return getSmartImageUrl(url)
}
