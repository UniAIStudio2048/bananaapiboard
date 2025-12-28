/**
 * Canvas 历史记录 API
 * 使用与普通模式相同的历史数据源
 * 数据来自 /api/images/history 和 /api/video/tasks
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

/**
 * 获取API基础URL
 */
function getApiBase() {
  const url = getApiUrl('')
  return url || ''
}

/**
 * 获取带认证的请求头
 */
function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

/**
 * 获取历史记录列表（合并图片和视频历史）
 * 优化：使用 Promise.allSettled 并行请求，提升加载速度
 * @param {Object} params - 查询参数
 * @param {string} params.type - 类型筛选 (image/video/audio)
 */
export async function getHistory(params = {}) {
  const results = []
  const timestamp = Date.now()
  const headers = getAuthHeaders()
  
  // 创建请求 Promise 数组
  const requests = []
  
  // 图片历史请求
  if (!params.type || params.type === 'all' || params.type === 'image') {
    requests.push(
      fetch(`${getApiBase()}/api/images/history?_=${timestamp}`, {
        method: 'GET',
        credentials: 'include',
        headers,
        cache: 'no-store'
      })
      .then(async res => {
        if (!res.ok) return { type: 'image', data: [] }
        const data = await res.json()
        return { 
          type: 'image', 
          data: (data.images || []).map(img => ({
            id: img.id,
            type: 'image',
            name: img.prompt ? img.prompt.substring(0, 30) + (img.prompt.length > 30 ? '...' : '') : '图片',
            url: img.url,
            thumbnail_url: img.url,
            prompt: img.prompt,
            model: img.model,
            status: img.status,
            created_at: img.created ? new Date(img.created * 1000).toISOString() : null,
            size: img.size,
            aspect_ratio: img.aspect_ratio,
            reference_images: img.reference_images
          }))
        }
      })
      .catch(e => {
        console.error('[History API] 获取图片历史失败:', e)
        return { type: 'image', data: [] }
      })
    )
  }
  
  // 视频历史请求
  if (!params.type || params.type === 'all' || params.type === 'video') {
    requests.push(
      fetch(`${getApiBase()}/api/videos/history?_=${timestamp}`, {
        method: 'GET',
        credentials: 'include',
        headers,
        cache: 'no-store'
      })
      .then(async res => {
        if (!res.ok) return { type: 'video', data: [] }
        const data = await res.json()
        return {
          type: 'video',
          data: (data.videos || []).map(vid => ({
            id: vid.id || vid.task_id,
            task_id: vid.task_id, // 用于角色创建
            type: 'video',
            name: vid.prompt ? vid.prompt.substring(0, 30) + (vid.prompt.length > 30 ? '...' : '') : '视频',
            url: vid.video_url || vid.url,
            thumbnail_url: vid.cover_url || vid.thumbnail_url,
            prompt: vid.prompt,
            model: vid.model,
            status: vid.status === 'SUCCESS' ? 'completed' : vid.status,
            aspect_ratio: vid.aspect_ratio,
            created_at: vid.created_at
          }))
        }
      })
      .catch(e => {
        console.error('[History API] 获取视频历史失败:', e)
        return { type: 'video', data: [] }
      })
    )
  }
  
  // 并行执行所有请求
  const responses = await Promise.all(requests)
  
  // 合并结果
  responses.forEach(res => {
    if (res.data && res.data.length > 0) {
      results.push(...res.data)
    }
  })
  
  // 按创建时间倒序排序
  results.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0
    return timeB - timeA
  })
  
  // 只返回已完成且有有效 URL 的记录
  const completedResults = results.filter(r => {
    // 必须是已完成状态
    if (r.status !== 'completed' && r.status !== 'SUCCESS') return false
    // 必须有有效的 URL
    if (!r.url || r.url === 'null' || r.url === 'undefined') return false
    // 过滤掉只有提示词没有实际内容的记录
    if (r.type === 'image' && !r.url.includes('/')) return false
    return true
  })
  
  return { history: completedResults }
}

/**
 * 获取单个历史记录详情
 * @param {string} historyId - 历史记录ID
 */
export async function getHistoryDetail(historyId) {
  // 对于现有数据源，直接返回基本信息
  return { history: { id: historyId } }
}

/**
 * 删除历史记录
 * @param {string} historyId - 历史记录ID
 * @param {string} type - 类型 (image/video)
 */
export async function deleteHistory(historyId, type = 'image') {
  const endpoint = type === 'video' 
    ? `${getApiBase()}/api/video/tasks/${historyId}`
    : `${getApiBase()}/api/images/history/${historyId}`
    
  const response = await fetch(endpoint, {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '删除历史记录失败')
  }
  
  return response.json()
}

