/**
 * Canvas 历史记录 API
 * 使用与普通模式相同的历史数据源
 * 数据来自 /api/images/history 和 /api/video/tasks
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { normalizeImageHistoryItem } from '@/utils/imageHistoryPrompt'

function isVideoUrl(url) {
  if (!url) return false
  const lower = url.split('?')[0].toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
         lower.includes('/videos/') || lower.includes('/video-files/') ||
         lower.includes('/character-videos/')
}

function generateThumbnailUrl(url) {
  if (!url) return url
  const lower = url.toLowerCase()

  // COS CDN → 数据万象缩略图
  if ((lower.includes('filescos.nananobanana.cn') ||
       (lower.includes('.cos.') && lower.includes('.myqcloud.com')) ||
       lower.includes('.tencentcos.cn')) && !isVideoUrl(url)) {
    if (url.includes('imageMogr2') || url.includes('imageView2')) return url
    const separator = url.includes('?') ? '|' : '?'
    return `${url}${separator}imageMogr2/thumbnail/200x/format/webp`
  }

  if (url.includes('/api/cos-proxy/') && !isVideoUrl(url)) {
    const separator = url.includes('?') ? '|' : '?'
    return `${url}${separator}imageMogr2/thumbnail/200x/format/webp`
  }

  if (url.includes('files.nananobanana.cn') || 
      url.includes('qiniucdn.com') ||
      url.includes('qncdn.net') ||
      url.includes('clouddn.com')) {
    const separator = url.includes('?') ? '|' : '?'
    return `${url}${separator}imageView2/2/w/200/format/webp`
  }
  return url
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

const MAX_HISTORY_PAGES = 20

function getHistoryPageLimit(limit) {
  const parsed = Number.parseInt(limit, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 50
  return Math.min(parsed, 500)
}

function getHistoryMaxPages(maxPages) {
  const parsed = Number.parseInt(maxPages, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_HISTORY_PAGES
  return Math.min(parsed, MAX_HISTORY_PAGES)
}

function buildHistoryQuery(params, pageLimit, offset) {
  const parts = []
  if (params.spaceType) {
    parts.push(`spaceType=${encodeURIComponent(params.spaceType)}`)
    if (params.spaceType === 'team' && params.teamId) {
      parts.push(`teamId=${encodeURIComponent(params.teamId)}`)
    }
  }
  parts.push(`limit=${pageLimit}`)
  parts.push(`offset=${offset}`)
  if (params.noCache) {
    parts.push(`noCache=${Date.now()}`)
  }
  return parts.join('&')
}

async function fetchHistoryPages(endpoint, responseKey, params, headers, mapRows, errorLabel) {
  const allItems = []
  const pageLimit = getHistoryPageLimit(params.limit)
  const maxPages = getHistoryMaxPages(params.maxPages)
  let offset = Math.max(Number.parseInt(params.offset, 10) || 0, 0)

  for (let page = 0; page < maxPages; page++) {
    try {
      const query = buildHistoryQuery(params, pageLimit, offset)
      const res = await fetch(getApiUrl(`${endpoint}?${query}`), {
        method: 'GET',
        credentials: 'include',
        headers
      })

      if (!res.ok) break

      const data = await res.json()
      const rows = data[responseKey] || []
      allItems.push(...mapRows(rows))

      if (!data.hasMore || rows.length < pageLimit) break
      offset += pageLimit
    } catch (e) {
      console.error(`[History API] ${errorLabel}失败:`, e)
      break
    }
  }

  return allItems
}

/**
 * 获取历史记录列表（合并图片和视频历史）
 * 每类媒体按页拉取，与普通模式保持同一个 15 天历史范围
 * @param {Object} params - 查询参数
 * @param {string} params.type - 类型筛选 (image/video/audio)
 * @param {string} params.spaceType - 空间类型 (personal/team/all)
 * @param {string} params.teamId - 团队ID (spaceType=team时需要)
 */
export async function getHistory(params = {}) {
  const results = []
  const headers = getAuthHeaders()

  // 创建请求 Promise 数组
  const requests = []
  
  // 图片历史请求
  if (!params.type || params.type === 'all' || params.type === 'image') {
    requests.push(
      fetchHistoryPages(
        '/api/images/history',
        'images',
        params,
        headers,
        rows => rows.map(img => {
            const normalized = normalizeImageHistoryItem(img)
            const displayPrompt = normalized.prompt
            return {
              id: img.id,
              type: 'image',
              name: displayPrompt ? displayPrompt.substring(0, 30) + (displayPrompt.length > 30 ? '...' : '') : '图片',
              url: img.url,
              thumbnail_url: generateThumbnailUrl(img.url),
              prompt: displayPrompt, // 显示用户原始输入（不含预设）
              fullPrompt: normalized.fullPrompt,
              user_prompt: normalized.user_prompt,
              model: img.model,
              model_display_name: img.model_display_name || img.modelDisplayName || '',
              status: img.status,
              created_at: img.created_at || (img.created ? new Date(img.created * 1000).toISOString() : null),
              finished_at: img.finished_at || img.finishedAt || null,
              size: img.size,
              image_size: img.image_size || img.imageSize || img.size,
              file_size: img.file_size || img.fileSize || img.size_bytes || null,
              width: img.width || img.image_width || null,
              height: img.height || img.image_height || null,
              aspect_ratio: img.aspect_ratio
            }
          }),
        '获取图片历史'
      ).then(data => ({ type: 'image', data }))
    )
  }
  
  // 视频历史请求
  if (!params.type || params.type === 'all' || params.type === 'video') {
    requests.push(
      fetchHistoryPages(
        '/api/videos/history',
        'videos',
        params,
        headers,
        rows => rows.map(vid => {
            // 优先使用 user_prompt（用户原始输入），如果没有则回退到 prompt
            const displayPrompt = vid.user_prompt || vid.prompt
            return {
              id: vid.id || vid.task_id,
              task_id: vid.task_id, // 用于角色创建
              type: 'video',
              name: displayPrompt ? displayPrompt.substring(0, 30) + (displayPrompt.length > 30 ? '...' : '') : '视频',
              url: vid.video_url || vid.url,
              thumbnail_url: vid.cover_url || vid.thumbnail_url,
              prompt: displayPrompt, // 显示用户原始输入
              fullPrompt: vid.prompt, // 保留完整提示词
              user_prompt: vid.user_prompt,
              model: vid.model,
              model_display_name: vid.model_display_name || vid.modelDisplayName || '',
              status: vid.status === 'SUCCESS' ? 'completed' : vid.status,
              aspect_ratio: vid.aspect_ratio,
              duration: vid.duration,
              fps: vid.fps || vid.frame_rate || vid.frameRate || null,
              file_size: vid.file_size || vid.fileSize || vid.size_bytes || null,
              width: vid.width || vid.video_width || null,
              height: vid.height || vid.video_height || null,
              created_at: vid.created_at,
              finished_at: vid.finished_at || vid.finishedAt || null
            }
          }),
        '获取视频历史'
      ).then(data => ({ type: 'video', data }))
    )
  }
  
  // 音频历史请求
  if (!params.type || params.type === 'all' || params.type === 'audio') {
    requests.push(
      fetchHistoryPages(
        '/api/music/history',
        'data',
        params,
        headers,
        rows => rows.filter(aud => aud.status === 'completed').map(aud => {
            const displayTitle = aud.title || aud.prompt?.substring(0, 30) || '音乐'
            return {
              id: aud.id || aud.task_id,
              task_id: aud.task_id,
              type: 'audio',
              name: displayTitle,
              url: aud.audio_url,
              thumbnail_url: aud.image_url || aud.image_large_url,
              prompt: aud.prompt,
              title: aud.title,
              tags: aud.tags,
              model: aud.model,
              model_display_name: aud.model_display_name || aud.modelDisplayName || '',
              status: 'completed',
              created_at: aud.created_at,
              finished_at: aud.completed_at || aud.finished_at || aud.finishedAt || null,
              duration: aud.duration || aud.audio_duration || null,
              file_size: aud.file_size || aud.fileSize || aud.size_bytes || null,
              video_url: aud.video_url // 音乐MV
            }
          }),
        '获取音频历史'
      ).then(data => ({ type: 'audio', data }))
    )
    requests.push(
      fetchHistoryPages(
        '/api/audio/history',
        'data',
        params,
        headers,
        rows => rows.filter(aud => aud.status === 'completed').map(aud => ({
          id: aud.id || aud.task_id,
          task_id: aud.task_id,
          type: 'audio',
          history_source: 'coze-audio',
          name: aud.capability === 'voice_design' ? '音色设计' : aud.capability === 'voice_clone' ? '声音克隆' : (aud.input_text?.substring(0, 30) || '语音合成'),
          url: aud.audio_url || aud.output_url,
          prompt: aud.prompt || aud.input_text,
          model: aud.model,
          model_display_name: aud.model_display_name || '',
          capability: aud.capability,
          voice_id: aud.voice_id,
          status: 'completed',
          created_at: aud.created_at,
          finished_at: aud.updated_at
        })),
        '获取 Coze 音频历史'
      ).then(data => ({ type: 'audio', data }))
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
 * @param {string} type - 类型 (image/video/audio)
 */
export async function deleteHistory(historyId, type = 'image') {
  let endpoint
  if (type === 'video') {
    endpoint = `/api/videos/history/${historyId}`
  } else if (type === 'audio') {
    endpoint = `/api/music/history/${historyId}`
  } else {
    endpoint = `/api/images/history/${historyId}`
  }
    
  let response = await fetch(getApiUrl(endpoint), {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  })

  if (type === 'audio' && response.status === 404) {
    response = await fetch(getApiUrl(`/api/audio/history/${historyId}`), {
      method: 'DELETE',
      credentials: 'include',
      headers: getAuthHeaders()
    })
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '删除历史记录失败')
  }
  
  return response.json()
}
