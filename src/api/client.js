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

export function buildDownloadUrl(url, filename) {
  // 本地文件路径，使用专用下载接口
  if (url && url.startsWith('/api/images/file/')) {
    const id = url.split('/').pop()
    const q = filename ? `?filename=${encodeURIComponent(filename)}` : ''
    return getApiUrl(`/api/images/download/${id}${q}`)
  }
  // 所有外部URL（包括七牛云），统一走后端代理下载
  // 后端会设置 Content-Disposition: attachment 头，解决跨域下载问题
  const params = new URLSearchParams({ url, filename })
  return getApiUrl(`/api/images/download?${params.toString()}`)
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
