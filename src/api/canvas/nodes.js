/**
 * Canvas Nodes API
 * 节点执行相关 API，复用现有的图片/视频生成接口
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { useTeamStore } from '@/stores/team'

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
  const {
    prompt,
    userPrompt,
    model = 'nano-banana-2',
    image_size,
    size,
    aspectRatio = 'auto',
    count = 1,
    enableGroupGeneration = false,
    maxGroupImages = 3,
    webSearch
  } = params
  
  // 优先使用 image_size，否则使用 size（向后兼容）
  const finalImageSize = image_size || size || '1K'
  
  const teamStore = useTeamStore()
  const spaceParams = teamStore.getSpaceParams('current')
  
  const body = {
    prompt,
    user_prompt: userPrompt || prompt,
    model,
    image_size: finalImageSize,
    aspect_ratio: aspectRatio,
    n: count,
    response_format: 'url',
    enableGroupGeneration,
    maxGroupImages,
    spaceType: spaceParams.spaceType,
    ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
  }

  // Seedream 5.0 Lite 联网搜索
  if (webSearch !== undefined) {
    body.webSearch = webSearch
  }
  
  // Seedream 组图生成参数
  if (enableGroupGeneration && maxGroupImages > 1) {
    body.sequential_image_generation = 'auto'
    body.sequential_image_generation_options = {
      max_images: maxGroupImages
    }
  }
  
  const response = await fetch(getApiUrl('/api/images/generate'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    if (error.error === 'insufficient_points' || response.status === 402) {
      throw new Error('当前积分余额不足，任务提交失败')
    }
    if (response.status === 429 && error.error === 'user_concurrent_limit_exceeded') {
      const err = new Error(error.message || '已达到并发限制，请升级套餐')
      err.code = 'concurrent_limit_exceeded'
      err.details = error.details
      throw err
    }
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
    userPrompt, // 用户原始输入（不含预设提示词）
    images, 
    model = 'nano-banana-2', 
    image_size,  // 支持 image_size 参数
    size,        // 也支持 size 参数（向后兼容）
    aspectRatio = 'auto',
    enableGroupGeneration = false,
    maxGroupImages = 3
  } = params
  
  // 优先使用 image_size，否则使用 size
  const finalImageSize = image_size || size || '1K'
  
  const teamStore = useTeamStore()
  const spaceParams = teamStore.getSpaceParams('current')
  
  const body = {
    prompt,
    user_prompt: userPrompt || prompt,
    image: images,
    model,
    image_size: finalImageSize,
    aspect_ratio: aspectRatio,
    response_format: 'url',
    spaceType: spaceParams.spaceType,
    ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
  }
  
  // Seedream 组图生成参数
  // 如果有多张参考图且启用组图生成，使用多图生组图模式
  if (images && images.length > 1 && enableGroupGeneration && maxGroupImages > 1) {
    body.sequential_image_generation = 'auto'
    body.sequential_image_generation_options = {
      max_images: maxGroupImages
    }
  } else if (enableGroupGeneration && maxGroupImages > 1) {
    // 单图或多图融合时也支持组图生成
    body.sequential_image_generation = 'auto'
    body.sequential_image_generation_options = {
      max_images: maxGroupImages
    }
  }
  
  console.log('[API] 图生图请求参数:', { 
    prompt: prompt?.substring(0, 50), 
    userPrompt: userPrompt?.substring(0, 50),
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
    if (error.error === 'insufficient_points' || response.status === 402) {
      throw new Error('当前积分余额不足，任务提交失败')
    }
    if (response.status === 429 && error.error === 'user_concurrent_limit_exceeded') {
      const err = new Error(error.message || '已达到并发限制，请升级套餐')
      err.code = 'concurrent_limit_exceeded'
      err.details = error.details
      throw err
    }
    throw new Error(error.message || error.error || '图片生成失败')
  }

  return response.json()
}

/**
 * 视频生成 - 文生视频
 */
export async function generateVideoFromText(params) {
  const { prompt, model = 'sora-2', aspectRatio = '16:9', duration = '10', offPeak = false, klingOmniVideoUrl, klingOmniVideoReferType, klingOmniKeepSound, klingOmniEndFrameUrl, klingOmniSubMode, klingOmniImageUrls } = params
  
  const teamStore = useTeamStore()
  const spaceParams = teamStore.getSpaceParams('current')
  
  const body = {
    prompt,
    model,
    aspect_ratio: aspectRatio,
    duration,
    spaceType: spaceParams.spaceType,
    ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
  }
  
  // Vidu 错峰模式
  if (offPeak) {
    body.off_peak = true
  }
  
  // Kling Omni-Video O1 特有参数
  if (klingOmniSubMode) {
    body.kling_omni_sub_mode = klingOmniSubMode
  }
  if (klingOmniVideoUrl) {
    body.kling_omni_video_url = klingOmniVideoUrl
    body.kling_omni_video_refer_type = klingOmniVideoReferType || 'feature'
    body.kling_omni_keep_sound = klingOmniKeepSound || 'yes'
  }
  if (klingOmniEndFrameUrl) {
    body.kling_omni_end_frame_url = klingOmniEndFrameUrl
  }
  if (klingOmniImageUrls && klingOmniImageUrls.length > 0) {
    body.kling_omni_image_urls = klingOmniImageUrls
  }
  
  const response = await fetch(getApiUrl('/api/videos/generate'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    // 统一积分不足错误提示
    if (error.error === 'insufficient_points' || response.status === 402) {
      throw new Error('当前积分余额不足，任务提交失败')
    }
    throw new Error(error.message || error.error || '视频生成失败')
  }
  
  return response.json()
}

/**
 * 视频生成 - 图生视频
 */
export async function generateVideoFromImage(params) {
  const { prompt, imageUrl, model = 'sora-2', aspectRatio = '16:9', duration = '10', offPeak = false, klingOmniVideoUrl, klingOmniVideoReferType, klingOmniKeepSound, klingOmniEndFrameUrl, klingOmniSubMode, klingOmniImageUrls } = params
  
  const teamStore = useTeamStore()
  const spaceParams = teamStore.getSpaceParams('current')
  
  const body = {
    prompt,
    image_url: imageUrl,
    model,
    aspect_ratio: aspectRatio,
    duration,
    spaceType: spaceParams.spaceType,
    ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {})
  }
  
  // Vidu 错峰模式
  if (offPeak) {
    body.off_peak = true
  }
  
  // Kling Omni-Video O1 特有参数
  if (klingOmniSubMode) {
    body.kling_omni_sub_mode = klingOmniSubMode
  }
  if (klingOmniVideoUrl) {
    body.kling_omni_video_url = klingOmniVideoUrl
    body.kling_omni_video_refer_type = klingOmniVideoReferType || 'base'
    body.kling_omni_keep_sound = klingOmniKeepSound || 'yes'
  }
  if (klingOmniEndFrameUrl) {
    body.kling_omni_end_frame_url = klingOmniEndFrameUrl
  }
  if (klingOmniImageUrls && klingOmniImageUrls.length > 0) {
    body.kling_omni_image_urls = klingOmniImageUrls
  }
  
  const response = await fetch(getApiUrl('/api/videos/generate'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    // 统一积分不足错误提示
    if (error.error === 'insufficient_points' || response.status === 402) {
      throw new Error('当前积分余额不足，任务提交失败')
    }
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
  const response = await fetch(getApiUrl(`/api/videos/task/${taskId}`), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '查询任务状态失败')
  }
  
  return response.json()
}

/**
 * 查询视频高清放大任务状态
 */
export async function getVideoHdTaskStatus(taskId) {
  const response = await fetch(getApiUrl(`/api/videos/hd-upscale/task/${taskId}`), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '查询高清任务状态失败')
  }
  
  return response.json()
}

/**
 * 查询图片高清放大任务状态
 */
export async function getImageHdTaskStatus(taskId) {
  const response = await fetch(getApiUrl(`/api/images/hd-upscale/task/${taskId}`), {
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '查询图片高清任务状态失败')
  }

  return response.json()
}

/**
 * 上传图片（内置重试机制）
 */
export async function uploadImages(files, retryOptions = {}) {
  const form = new FormData()
  for (const f of files.slice(0, 9)) {
    form.append('images', f)
  }
  
  const token = localStorage.getItem('token')
  const maxRetries = retryOptions.maxRetries ?? 3
  const baseDelay = retryOptions.baseDelay ?? 2000
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const timeoutMs = retryOptions.timeoutMs ?? (totalSize > 10 * 1024 * 1024 ? 180000 : 120000)
  
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
      console.log(`[uploadImages] 第 ${attempt} 次重试，等待 ${Math.round(delay)}ms...`)
      await new Promise(r => setTimeout(r, delay))
      const retryForm = new FormData()
      for (const f of files.slice(0, 9)) {
        retryForm.append('images', f)
      }
    }
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const uploadForm = attempt === 0 ? form : (() => {
        const f = new FormData()
        for (const file of files.slice(0, 9)) f.append('images', file)
        return f
      })()
      
      const response = await fetch(getApiUrl('/api/images/upload'), {
        method: 'POST',
        headers: {
          ...getTenantHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: uploadForm,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`服务器错误 ${response.status}`)
        continue
      }
      
      if (!response.ok) {
        throw new Error('图片上传失败')
      }
      
      const data = await response.json()
      return data.urls || []
    } catch (err) {
      clearTimeout(timeoutId)
      lastError = err
      
      const isRetryable = err.name === 'AbortError' ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError') ||
        err.message?.includes('network')
      
      if (!isRetryable || attempt >= maxRetries) {
        if (err.name === 'AbortError') {
          throw new Error('图片上传超时，请检查网络')
        }
        throw err
      }
    }
  }
  throw lastError
}

/**
 * 轮询任务状态直到完成
 * 后端图片任务状态: pending -> processing -> completed/failed
 * 当 status=completed 或者有 url 时表示完成
 * 
 * @param {string} taskId - 任务ID
 * @param {string} type - 任务类型 'image' | 'video'
 * @param {object} options - 选项
 * @param {number} options.interval - 轮询间隔，默认 2000ms
 * @param {number} options.timeout - 超时时间，统一默认 15 分钟
 */
export function pollTaskStatus(taskId, type = 'image', options = {}) {
  // 🔧 修复：统一超时时间为 15 分钟（900秒）
  const defaultTimeout = 15 * 60 * 1000
  const { interval = 2000, timeout = defaultTimeout, onProgress } = options
  const getStatus = type === 'video' ? getVideoTaskStatus : getImageTaskStatus
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let pollCount = 0
    
    const poll = async () => {
      try {
        pollCount++
        const result = await getStatus(taskId)
        
        // 🔧 增强日志：显示更多调试信息
        console.log('[pollTaskStatus] 轮询状态:', {
          taskId,
          pollCount,
          status: result.status,
          hasUrl: !!result.url,
          hasUrls: !!result.urls,
          hasImages: !!result.images,
          elapsed: `${Math.round((Date.now() - startTime) / 1000)}s`
        })
        
        // 回调进度
        if (onProgress) {
          onProgress(result)
        }
        
        // 🔧 修复：增强状态判断，兼容更多返回格式
        // 成功状态：completed, success, succeeded, finished, done
        const isCompleted = result.status === 'completed' || 
                           result.status === 'success' || 
                           result.status === 'succeeded' ||
                           result.status === 'finished' ||
                           result.status === 'done'
        
        // URL检查：url, urls数组, images数组
        const hasValidUrl = result.url || 
                           (result.urls && result.urls.length > 0) ||
                           (result.images && result.images.length > 0)
        
        if (isCompleted || hasValidUrl) {
          console.log('[pollTaskStatus] 任务完成:', {
            taskId,
            status: result.status,
            url: result.url?.substring(0, 60),
            urlsCount: result.urls?.length || 0,
            imagesCount: result.images?.length || 0
          })
          resolve(result)
          return
        }
        
        // 失败状态：failed, error
        if (result.status === 'failed' || result.status === 'error') {
          console.error('[pollTaskStatus] 任务失败:', {
            taskId,
            status: result.status,
            error: result.error
          })
          reject(new Error(result.error || '任务执行失败'))
          return
        }
        
        // 检查超时
        const elapsed = Date.now() - startTime
        if (elapsed > timeout) {
          console.error('[pollTaskStatus] 任务超时:', {
            taskId,
            elapsed: `${Math.round(elapsed / 1000)}s`,
            timeout: `${Math.round(timeout / 1000)}s`,
            lastStatus: result.status
          })
          reject(new Error(`任务执行超时（超过${Math.round(timeout / 60000)}分钟）`))
          return
        }
        
        // 继续轮询
        setTimeout(poll, interval)
      } catch (e) {
        console.error('[pollTaskStatus] 轮询异常:', {
          taskId,
          pollCount,
          error: e.message
        })
        reject(e)
      }
    }
    
    poll()
  })
}

/**
 * 画布裁剪积分扣除
 * @param {string} cropType - 'grid9' 或 'grid4'
 * @returns {Promise<{success: boolean, pointsCost: number, message: string}>}
 */
export async function deductCropPoints(cropType) {
  const response = await fetch(getApiUrl('/api/canvas/crop-deduct'), {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify({ cropType })
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    // 积分不足时返回友好提示
    if (data.error === 'insufficient_points') {
      throw new Error(data.message || '积分不足')
    }
    throw new Error(data.message || data.error || '积分扣除失败')
  }
  
  return data
}

/**
 * 抠图 - 调用后端去除图片背景
 */
export async function removeImageBackground(imageUrl, bgType = 'transparent', bgColor = null) {
  const token = localStorage.getItem('token')
  const response = await fetch(getApiUrl('/api/images/remove-background'), {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ imageUrl, bgType, bgColor })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '抠图失败')
  }
  
  return response.json()
}

