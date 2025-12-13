/**
 * Canvas Nodes API
 * 节点执行相关 API，复用现有的图片/视频生成接口
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

// 获取通用请求头
function getHeaders(options = {}) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(options.json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.extra
  }
}

/**
 * 图片生成 - 文生图
 */
export async function generateImageFromText(params) {
  const { prompt, model = 'nano-banana-2', size = '1K', aspectRatio = 'auto', count = 1 } = params
  
  const body = {
    prompt,
    model,
    image_size: size,
    aspect_ratio: aspectRatio,
    n: count,
    response_format: 'url'
  }
  
  const response = await fetch(getApiUrl('/api/images/generate'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '图片生成失败')
  }
  
  return response.json()
}

/**
 * 图片生成 - 图生图
 */
export async function generateImageFromImage(params) {
  const { 
    prompt, 
    images, 
    model = 'nano-banana-2', 
    image_size,  // 支持 image_size 参数
    size,        // 也支持 size 参数（向后兼容）
    aspectRatio = 'auto' 
  } = params
  
  // 优先使用 image_size，否则使用 size
  const finalImageSize = image_size || size || '1K'
  
  const body = {
    prompt,
    image: images, // 参考图URL数组
    model,
    image_size: finalImageSize,
    aspect_ratio: aspectRatio,
    response_format: 'url'
  }
  
  console.log('[API] 图生图请求参数:', { 
    prompt: prompt?.substring(0, 50), 
    model, 
    image_size: finalImageSize, 
    aspect_ratio: aspectRatio,
    imageCount: images?.length 
  })
  
  const response = await fetch(getApiUrl('/api/images/generate'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    console.error('[API] 图生图请求失败:', error)
    throw new Error(error.message || error.error || '图片生成失败')
  }
  
  return response.json()
}

/**
 * 视频生成 - 文生视频
 */
export async function generateVideoFromText(params) {
  const { prompt, model = 'sora-2', aspectRatio = '16:9', duration = '10' } = params
  
  const body = {
    prompt,
    model,
    aspect_ratio: aspectRatio,
    duration
  }
  
  const response = await fetch(getApiUrl('/api/video/generate'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '视频生成失败')
  }
  
  return response.json()
}

/**
 * 视频生成 - 图生视频
 */
export async function generateVideoFromImage(params) {
  const { prompt, imageUrl, model = 'sora-2', aspectRatio = '16:9', duration = '10' } = params
  
  const body = {
    prompt,
    image_url: imageUrl,
    model,
    aspect_ratio: aspectRatio,
    duration
  }
  
  const response = await fetch(getApiUrl('/api/video/generate'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '视频生成失败')
  }
  
  return response.json()
}

/**
 * 查询图片任务状态
 * 注意：后端API路径是 /api/images/task/:taskId（单数）
 */
export async function getImageTaskStatus(taskId) {
  const response = await fetch(getApiUrl(`/api/images/task/${taskId}`), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '查询任务状态失败')
  }
  
  return response.json()
}

/**
 * 查询视频任务状态
 */
export async function getVideoTaskStatus(taskId) {
  const response = await fetch(getApiUrl(`/api/video/tasks/${taskId}`), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '查询任务状态失败')
  }
  
  return response.json()
}

/**
 * 上传图片
 */
export async function uploadImages(files) {
  const form = new FormData()
  for (const f of files.slice(0, 9)) {
    form.append('images', f)
  }
  
  const token = localStorage.getItem('token')
  const response = await fetch(getApiUrl('/api/images/upload'), {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: form
  })
  
  if (!response.ok) {
    throw new Error('图片上传失败')
  }
  
  const data = await response.json()
  return data.urls || []
}

/**
 * 轮询任务状态直到完成
 * 后端图片任务状态: pending -> processing -> completed/failed
 * 当 status=completed 或者有 url 时表示完成
 */
export function pollTaskStatus(taskId, type = 'image', options = {}) {
  const { interval = 2000, timeout = 300000, onProgress } = options
  const getStatus = type === 'video' ? getVideoTaskStatus : getImageTaskStatus
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    
    const poll = async () => {
      try {
        const result = await getStatus(taskId)
        
        console.log('[pollTaskStatus] 任务状态:', taskId, result.status, result.url ? '有URL' : '无URL')
        
        // 回调进度
        if (onProgress) {
          onProgress(result)
        }
        
        // 检查状态 - 有 url 也算完成
        if (result.status === 'completed' || result.status === 'success' || result.url) {
          resolve(result)
          return
        }
        
        if (result.status === 'failed' || result.status === 'error') {
          reject(new Error(result.error || '任务执行失败'))
          return
        }
        
        // 检查超时
        if (Date.now() - startTime > timeout) {
          reject(new Error('任务执行超时'))
          return
        }
        
        // 继续轮询
        setTimeout(poll, interval)
      } catch (e) {
        reject(e)
      }
    }
    
    poll()
  })
}

