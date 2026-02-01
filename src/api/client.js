import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { logApiRequest, logApiResponse, logApiError, logAuth, logUserAction } from '@/utils/logger'

let KEY = ''
export function setApiKey(k) { KEY = k || '' }
export function getApiKey() { return KEY }

// 获取带租户标识的请求头
function getHeaders(options = {}) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(options.json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.extra
  }
}

export async function generateImage(payload) {
  const startTime = Date.now()
  const body = { ...payload, response_format: 'url' }
  const url = getApiUrl('/api/images/generate')
  
  logApiRequest('POST', '/api/images/generate', { 
    model: body.model, 
    aspect_ratio: body.aspect_ratio, 
    image_size: body.image_size,
    prompt_length: body.prompt?.length,
    has_reference_images: !!body.image?.length
  })
  
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: getHeaders({ json: true }),
      body: JSON.stringify(body)
    })
    
    const duration = Date.now() - startTime
    
    if (!r.ok) {
      const e = new Error('generate_failed')
      e.status = r.status
      try { 
        const errorData = await r.json()
        e.body = errorData
        e.message = errorData.message || errorData.error || 'generate_failed'
      } catch {
        try { e.body = await r.text() } catch {}
      }
      logApiError('POST', '/api/images/generate', e, { model: body.model })
      throw e
    }
    
    const j = await r.json()
    logApiResponse('POST', '/api/images/generate', r.status, duration, { 
      task_id: j.task_id || j.id,
      status: j.status
    })
    return j
  } catch (e) {
    if (!e.status) {
      logApiError('POST', '/api/images/generate', e, { model: body.model })
    }
    throw e
  }
}

export async function uploadImages(files) {
  const form = new FormData()
  for (const f of files.slice(0, 9)) form.append('images', f)
  const token = localStorage.getItem('token')
  const r = await fetch(getApiUrl('/api/images/upload'), { 
    method: 'POST', 
    headers: {
      ...getTenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: form 
  })
  if (!r.ok) throw new Error('upload_failed')
  const j = await r.json()
  return j.urls || []
}

/**
 * 判断是否是七牛云 CDN URL（可以直接下载，不需要走后端代理）
 * @param {string} url - 要检查的 URL
 * @returns {boolean}
 */
export function isQiniuCdnUrl(url) {
  if (!url || typeof url !== 'string') return false
  return url.includes('files.nananobanana.cn') ||  // 项目的七牛云 CDN 域名
         url.includes('oss.nananobanana.cn') ||    // 项目的七牛云源站域名
         url.includes('qiniucdn.com') || 
         url.includes('clouddn.com') || 
         url.includes('qnssl.com') ||
         url.includes('qbox.me')
}

/**
 * 🔧 生成七牛云缩略图 URL（用于列表显示，节省 CDN 流量）
 * 使用七牛云图片处理服务生成小尺寸 WebP 格式缩略图
 * 
 * @param {string} url - 原图 URL
 * @param {number} width - 缩略图宽度（默认 400px）
 * @param {string} format - 输出格式（默认 webp，体积最小）
 * @returns {string} 缩略图 URL
 */
export function getQiniuThumbnailUrl(url, width = 400, format = 'webp') {
  if (!url || typeof url !== 'string') return url
  
  // 只对七牛云 URL 进行处理
  if (!isQiniuCdnUrl(url)) return url
  
  // 先获取原图 URL（去除可能已有的处理参数）
  const originalUrl = getQiniuOriginalUrl(url)
  
  // 添加七牛云图片处理参数
  // imageView2/2/w/400 - 等比缩放，宽度限制为 400px
  // format/webp - 转 WebP 格式，体积更小（比 JPEG 小 25-35%）
  const separator = originalUrl.includes('?') ? '|' : '?'
  return `${originalUrl}${separator}imageView2/2/w/${width}/format/${format}`
}

/**
 * 获取七牛云原图 URL（去除所有图片处理参数）
 * 七牛云图片处理参数格式：
 * - ?imageView2/... - 图片基本处理
 * - ?imageMogr2/... - 图片高级处理
 * - |imageView2/... - 管道操作（多个处理连接）
 * - ?imageInfo - 获取图片信息
 * - ?exif - 获取EXIF信息
 * - ?attname=xxx - 下载时的文件名（这个需要保留）
 * 
 * @param {string} url - 可能包含处理参数的七牛云 URL
 * @returns {string} 原图 URL（不含处理参数，但保留 attname）
 */
export function getQiniuOriginalUrl(url) {
  if (!url || typeof url !== 'string') return url
  
  // 如果不是七牛云 URL，直接返回
  if (!isQiniuCdnUrl(url)) return url
  
  // 分离基础 URL 和查询参数
  const questionMarkIndex = url.indexOf('?')
  if (questionMarkIndex === -1) {
    // 没有查询参数，检查管道操作符
    const pipeIndex = url.indexOf('|')
    if (pipeIndex !== -1) {
      return url.substring(0, pipeIndex)
    }
    return url
  }
  
  const baseUrl = url.substring(0, questionMarkIndex)
  const queryString = url.substring(questionMarkIndex + 1)
  
  // 检查是否有管道操作符（在查询参数之后）
  // 例如: ?xxx|imageView2/... 或 ?imageView2/...|imageMogr2/...
  const cleanQueryString = queryString.split('|')[0]
  
  // 解析查询参数，只保留 attname 参数
  const params = new URLSearchParams(cleanQueryString)
  const attname = params.get('attname')
  
  // 检查查询参数是否以图片处理指令开头
  const imageProcessingPrefixes = [
    'imageView2', 'imageMogr2', 'imageInfo', 'exif', 
    'watermark', 'roundPic', 'imageAve', 'imageslim'
  ]
  
  const firstParam = cleanQueryString.split('&')[0]
  const isImageProcessing = imageProcessingPrefixes.some(prefix => 
    firstParam.startsWith(prefix) || firstParam.startsWith(prefix + '/')
  )
  
  // 如果是图片处理参数，返回不带参数的基础 URL
  // 如果有 attname，单独保留
  if (isImageProcessing) {
    return attname ? `${baseUrl}?attname=${encodeURIComponent(attname)}` : baseUrl
  }
  
  // 不是图片处理参数，但可能混合了其他参数和图片处理
  // 过滤掉图片处理相关的参数
  const filteredParams = []
  for (const [key, value] of params.entries()) {
    const isProcessingParam = imageProcessingPrefixes.some(prefix => 
      key.startsWith(prefix) || key === 'format'
    )
    if (!isProcessingParam) {
      filteredParams.push(`${key}=${encodeURIComponent(value)}`)
    }
  }
  
  if (filteredParams.length > 0) {
    return `${baseUrl}?${filteredParams.join('&')}`
  }
  
  return baseUrl
}

/**
 * 构建七牛云强制下载 URL（使用 attname 参数）
 * 会先去除图片处理参数，确保下载原图
 * @param {string} url - 七牛云 URL
 * @param {string} filename - 下载时的文件名
 * @returns {string}
 */
export function buildQiniuForceDownloadUrl(url, filename) {
  if (!url || !filename) return url
  
  // 🔧 修复：先去除图片处理参数，确保下载原图
  const originalUrl = getQiniuOriginalUrl(url)
  
  const separator = originalUrl.includes('?') ? '&' : '?'
  return `${originalUrl}${separator}attname=${encodeURIComponent(filename)}`
}

/**
 * 构建图片下载 URL
 * - 七牛云 URL：直接使用 attname 参数下载（节省服务器出站流量）
 * - 本地文件：使用后端下载接口
 * - 其他外部 URL：走后端代理下载（解决跨域问题）
 * 
 * 🔧 修复：所有情况下都确保下载原图，去除压缩/处理参数
 * @param {string} url - 要下载的资源 URL
 * @param {string} filename - 下载时的文件名
 * @returns {string}
 */
export function buildDownloadUrl(url, filename) {
  // 本地文件路径，使用专用下载接口
  if (url && url.startsWith('/api/images/file/')) {
    const id = url.split('/').pop()
    const q = filename ? `?filename=${encodeURIComponent(filename)}` : ''
    return getApiUrl(`/api/images/download/${id}${q}`)
  }
  
  // 七牛云 URL：直接使用 attname 参数下载，不走后端代理（节省服务器流量）
  // buildQiniuForceDownloadUrl 内部会先去除图片处理参数
  if (isQiniuCdnUrl(url)) {
    return buildQiniuForceDownloadUrl(url, filename || 'download')
  }
  
  // 其他外部 URL：走后端代理下载
  // 后端会设置 Content-Disposition: attachment 头，解决跨域下载问题
  // 🔧 先清理可能的七牛云处理参数（以防 URL 被误分类）
  const cleanUrl = getQiniuOriginalUrl(url)
  const params = new URLSearchParams({ url: cleanUrl, filename })
  return getApiUrl(`/api/images/download?${params.toString()}`)
}

/**
 * 构建视频下载 URL
 * - 七牛云 URL：直接使用 attname 参数下载（节省服务器出站流量）
 * - 其他外部 URL：走后端代理下载（解决跨域问题）
 * 
 * 🔧 修复：所有情况下都确保下载原视频，去除处理参数
 * @param {string} url - 要下载的视频 URL
 * @param {string} filename - 下载时的文件名
 * @returns {string}
 */
export function buildVideoDownloadUrl(url, filename) {
  // 七牛云 URL：直接使用 attname 参数下载，不走后端代理（节省服务器流量）
  // buildQiniuForceDownloadUrl 内部会先去除处理参数
  if (isQiniuCdnUrl(url)) {
    return buildQiniuForceDownloadUrl(url, filename || 'video.mp4')
  }
  
  // 其他外部 URL：走后端代理下载
  // 后端会设置 Content-Disposition: attachment 头，解决跨域下载问题
  // 🔧 先清理可能的七牛云处理参数
  const cleanUrl = getQiniuOriginalUrl(url)
  return getApiUrl(`/api/videos/download?url=${encodeURIComponent(cleanUrl)}&name=${encodeURIComponent(filename || 'video.mp4')}`)
}

export async function getMe(forceRefresh = false) {
  const token = localStorage.getItem('token')
  if (!token) return null

  try {
    // 添加超时控制，防止请求卡住
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

    // 添加时间戳参数避免缓存
    const url = forceRefresh
      ? getApiUrl(`/api/user/me?_t=${Date.now()}`)
      : getApiUrl('/api/user/me')

    const r = await fetch(url, {
      headers: getHeaders(),
      signal: controller.signal,
      cache: forceRefresh ? 'no-store' : 'default' // 强制刷新时禁用缓存
    })

    clearTimeout(timeoutId)

    if (!r.ok) {
      // 如果返回401，可能是token过期，清除token
      if (r.status === 401) {
        console.warn('[getMe] 认证失败，token可能已过期')
      }
      return null
    }
    return r.json()
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[getMe] 请求超时')
    } else {
      console.error('[getMe] 请求失败:', e)
    }
    return null
  }
}

export async function updateUserPreferences(preferences) {
  const token = localStorage.getItem('token')
  if (!token) return null

  try {
    const r = await fetch(getApiUrl('/api/user/preferences'), {
      method: 'PUT',
      headers: getHeaders({ json: true }),
      body: JSON.stringify({ preferences })
    })

    if (!r.ok) {
      console.error('[updateUserPreferences] 请求失败:', r.status)
      return null
    }

    const data = await r.json()
    return data
  } catch (e) {
    console.error('[updateUserPreferences] 请求失败:', e)
    return null
  }
}

export async function redeemVoucher(code) {
  const r = await fetch(getApiUrl('/api/vouchers/redeem'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify({ code })
  })
  
  const data = await r.json()
  
  if (!r.ok) {
    const error = new Error(data.message || 'redeem_failed')
    error.status = r.status
    error.data = data
    throw error
  }
  
  return data
}

// 通用 API 请求方法
export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, json = true } = options
  
  const fetchOptions = {
    method,
    headers: getHeaders({ json: json && body })
  }
  
  if (body) {
    fetchOptions.body = json ? JSON.stringify(body) : body
  }
  
  const r = await fetch(getApiUrl(path), fetchOptions)
  
  if (!r.ok) {
    const error = new Error('request_failed')
    error.status = r.status
    try {
      error.data = await r.json()
      error.message = error.data.message || error.data.error || 'request_failed'
    } catch {
      try { error.data = await r.text() } catch {}
    }
    throw error
  }
  
  const contentType = r.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    return r.json()
  }
  return r.text()
}

/**
 * 带认证头的文件下载函数
 * 解决前后端分离架构下，window.open 不带租户认证头导致的 401 错误
 * 
 * @param {string} downloadUrl - 下载 URL（完整 URL 或 API 路径）
 * @param {string} filename - 保存的文件名
 * @returns {Promise<void>}
 */
export async function downloadWithAuth(downloadUrl, filename) {
  try {
    // 如果是七牛云 URL，直接下载（不需要认证）
    if (isQiniuCdnUrl(downloadUrl)) {
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename || 'download'
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }
    
    // 确保 URL 是完整路径
    const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : getApiUrl(downloadUrl)
    
    // 使用 fetch 带认证头请求
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: getHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }
    
    // 获取文件 blob
    const blob = await response.blob()
    
    // 创建临时下载链接
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    
    // 释放 blob URL
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
    
    console.log('[downloadWithAuth] 下载成功:', filename)
  } catch (e) {
    console.error('[downloadWithAuth] 下载失败:', e)
    throw e
  }
}

// 导出便捷方法
export const api = {
  get: (path) => apiRequest(path, { method: 'GET' }),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body }),
  delete: (path) => apiRequest(path, { method: 'DELETE' })
}

// 默认导出
export default api
