<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getMe } from '@/api/client'
import { getTenantHeaders, getModelDisplayName, isModelEnabled, getAvailableVideoModels } from '@/config/tenant'
import { shouldHistoryDrawerOpenByDefault } from '@/utils/deviceDetection'

const fileInputRef = ref(null)
const prompt = ref('')
const mode = ref('text') // text 或 image
const model = ref('sora2')  // 默认使用新版 sora2 整合模型
const aspectRatio = ref('16:9')
const duration = ref('10')
const hd = ref(false)

// VEO3模型列表（不支持时长参数）
const VEO3_MODELS = ['veo3.1-components', 'veo3.1', 'veo3.1-pro']

// 当前模型是否为VEO3系列
const isVeo3Model = computed(() => VEO3_MODELS.includes(model.value))

// 当前选中模型的配置
const currentModelConfig = computed(() => {
  return availableModels.value.find(m => m.value === model.value) || {}
})

// 可用的方向选项 - 从模型配置中读取
const availableAspectRatios = computed(() => {
  const aspectRatios = currentModelConfig.value?.aspectRatios
  if (aspectRatios && aspectRatios.length > 0) {
    return aspectRatios
  }
  // 兜底默认值
  return [
    { value: '16:9', label: '横屏 (16:9)' },
    { value: '9:16', label: '竖屏 (9:16)' }
  ]
})

// VEO3模型的图片数量限制
const maxImagesForModel = computed(() => {
  if (model.value === 'veo3.1-components') return 3
  if (VEO3_MODELS.includes(model.value)) return 2
  return 9 // 其他模型
})
const watermark = ref(false) // 默认false，隐藏选项
const isPrivate = ref(true) // 默认true，隐藏选项

// HD 选项是否可用（仅 Sora PRO 模型可用，VEO3不支持）
const isHdAvailable = computed(() => model.value === 'sora2-pro' || model.value === 'sora-2-pro')
const loading = ref(false)
const error = ref('')
const successMessage = ref('')

const imageFiles = ref([])
const previewUrls = ref([])
const isDragging = ref(false)

const me = ref(null)
const history = ref([])
const gallery = ref([])
// 根据设备类型设置历史记录抽屉默认状态：手机默认收起，平板和电脑默认展开
const isHistoryDrawerOpen = ref(shouldHistoryDrawerOpenByDefault())
const pollingTimers = new Map()

const showVideoModal = ref(false)
const currentVideo = ref(null)
const videoPlayerRef = ref(null)

// 积分配置（从租户配置动态获取）
const pointsCostConfig = computed(() => {
  const models = getAvailableVideoModels()
  const config = { hd_extra: 10 }
  for (const m of models) {
    if (m.pointsCost) {
      config[m.value] = m.pointsCost
    }
  }
  return config
})

// 可用的时长选项（根据模型动态计算，VEO3模型不支持时长选择）
const availableDurations = computed(() => {
  if (isVeo3Model.value) {
    return [] // VEO3模型不支持时长选择
  }
  // 优先使用模型配置中的 durations 数组
  const modelDurations = currentModelConfig.value?.durations
  if (modelDurations && modelDurations.length > 0) {
    return modelDurations
  }
  // 兜底：从积分配置中获取
  const config = pointsCostConfig.value[model.value] || {}
  return Object.keys(config).filter(key => key !== 'hd_extra').sort((a, b) => Number(a) - Number(b))
})

const totalPoints = computed(() => {
  if (!me.value) return 0
  return (me.value.package_points || 0) + (me.value.points || 0)
})

const currentPointsCost = computed(() => {
  // VEO3模型使用固定积分
  if (isVeo3Model.value) {
    return pointsCostConfig.value[model.value] || 100
  }
  
  const modelConfig = pointsCostConfig.value[model.value] || {}
  let cost = modelConfig[duration.value] || 40
  if (hd.value && pointsCostConfig.value.hd_extra) {
    cost += pointsCostConfig.value.hd_extra
  }
  return cost
})

// 用户套餐信息
const userPackageInfo = computed(() => {
  if (!me.value) return { hasPackage: false, concurrentLimit: 1 }
  
  // 判断是否有活跃套餐（只要套餐未过期即为VIP，不要求积分>0）
  const hasPackage = me.value.package_points_expires_at && 
                     me.value.package_points_expires_at > Date.now()
  
  return {
    hasPackage,
    concurrentLimit: me.value.concurrent_limit || 1
  }
})

// 获取可用的视频模型列表（从配置动态获取，过滤掉旧版模型）
const availableModels = computed(() => {
  const allModels = getAvailableVideoModels()
  // 过滤掉旧版 sora-2 和 sora-2-pro，只保留新版 sora2 系列和其他模型
  return allModels.filter(m => !['sora-2', 'sora-2-pro'].includes(m.value))
})

// 获取模型显示名称
const getModelName = (modelKey) => {
  // 先从动态模型列表中找
  const model = availableModels.value.find(m => m.value === modelKey)
  if (model) return model.label
  
  const customName = getModelDisplayName(modelKey, 'video')
  if (customName) return customName
  
  // 默认名称
  const defaultNames = {
    'sora-2': 'Sora 2',
    'sora-2-pro': 'Sora 2 Pro',
    'veo3.1-components': 'VEO 3.1',
    'veo3.1': 'VEO 3.1 标准',
    'veo3.1-pro': 'VEO 3.1 Pro'
  }
  return defaultNames[modelKey] || modelKey
}

function formatPointsTitle() {
  if (!me.value) return ''
  return `套餐积分：${me.value.package_points || 0} | 永久积分：${me.value.points || 0}`
}

// 监听模型变化，更新时长和方向选项
watch(model, (newModel) => {
  const modelConfig = availableModels.value.find(m => m.value === newModel)
  
  // 更新时长选项
  const durations = modelConfig?.durations || ['10', '15']
  if (durations.length > 0 && !durations.includes(duration.value)) {
    duration.value = durations[0]
    console.log('[VideoGeneration] 时长已重置为:', duration.value)
  }
  
  // 更新方向选项
  const aspectRatios = modelConfig?.aspectRatios || [{ value: '16:9', label: '横屏' }]
  const aspectValues = aspectRatios.map(ar => ar.value)
  if (aspectValues.length > 0 && !aspectValues.includes(aspectRatio.value)) {
    aspectRatio.value = aspectValues[0]
    console.log('[VideoGeneration] 方向已重置为:', aspectRatio.value)
  }
})

async function refreshUser() {
  me.value = await getMe()
}

// 从后端加载视频配置（积分配置现已从租户配置动态获取）
async function loadVideoConfig() {
  try {
    // 如果当前时长在新配置中不可用，重置为第一个可用时长
    const availableDurs = availableDurations.value
    if (availableDurs.length > 0 && !availableDurs.includes(duration.value)) {
      duration.value = availableDurs[0]
      console.log('[VideoGeneration] 时长已重置为:', duration.value)
    }
  } catch (e) {
    console.error('[VideoGeneration] 加载视频配置失败:', e)
  }
}

function triggerFileDialog() {
  fileInputRef.value?.click()
}

function handleFiles(files) {
  const MAX_FILES = maxImagesForModel.value
  const MAX_SIZE = 30 * 1024 * 1024
  const list = Array.from(files).filter(file => file.type.startsWith('image/'))
  const validFiles = []
  for (const file of list) {
    if (file.size <= MAX_SIZE) {
      validFiles.push(file)
    }
  }
  const remaining = MAX_FILES - imageFiles.value.length
  const selected = validFiles.slice(0, remaining)
  imageFiles.value = [...imageFiles.value, ...selected]
  previewUrls.value = [...previewUrls.value, ...selected.map(file => URL.createObjectURL(file))]
}

function onFilesChange(e) {
  handleFiles(e.target.files || [])
  e.target.value = ''
}

function onDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave(e) {
  e.preventDefault()
  isDragging.value = false
}

function onDrop(e) {
  e.preventDefault()
  isDragging.value = false
  handleFiles(e.dataTransfer.files || [])
}

function removeImage(index) {
  URL.revokeObjectURL(previewUrls.value[index])
  imageFiles.value.splice(index, 1)
  previewUrls.value.splice(index, 1)
}

function clearImages() {
  previewUrls.value.forEach(url => URL.revokeObjectURL(url))
  imageFiles.value = []
  previewUrls.value = []
}

function formatStatus(status) {
  if (!status) return '未知状态'
  const normalized = status.toString().toLowerCase()
  const map = {
    pending: '排队中',
    not_start: '准备中',
    queued: '排队中',
    processing: '生成中',
    in_progress: '生成中',
    running: '生成中',
    completed: '已完成',
    success: '已完成',
    failure: '生成失败',
    failed: '生成失败',
    error: '生成失败',
    timeout: '生成超时',
    cancelled: '已取消',
    file_expired: '文件已过期'
  }
  return map[normalized] || status || '未知状态'
}

function statusColor(status) {
  if (!status) return 'text-slate-500'
  const normalized = status.toString().toLowerCase()
  if (normalized.includes('success') || normalized.includes('completed')) {
    return 'text-green-500'
  }
  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'text-red-500'
  }
  if (normalized.includes('process') || normalized.includes('pending') || normalized.includes('progress') || normalized.includes('not_start') || normalized.includes('queued') || normalized.includes('running')) {
    return 'text-blue-500'
  }
  return 'text-amber-500'
}

// 辅助函数：判断是否为生成中状态
function isProcessingStatus(status) {
  if (!status) return false
  const normalized = status.toString().toLowerCase()
  return ['pending', 'processing', 'in_progress', 'not_start', 'queued', 'running'].some(s => normalized.includes(s))
}

// 辅助函数：判断是否为失败状态
function isFailedStatus(status) {
  if (!status) return false
  const normalized = status.toString().toLowerCase()
  return ['failed', 'failure', 'error', 'timeout', 'file_expired', 'expired'].some(s => normalized.includes(s))
}

// 辅助函数：判断是否为成功状态
function isCompletedStatus(status) {
  if (!status) return false
  const normalized = status.toString().toLowerCase()
  return ['completed', 'success'].some(s => normalized.includes(s))
}

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function taskKey(item) {
  return item?.task_id || item?.id
}

function upsertTask(list, task) {
  const key = taskKey(task)
  const index = list.findIndex(entry => taskKey(entry) === key)
  if (index >= 0) {
    list[index] = { ...list[index], ...task }
  } else {
    list.unshift(task)
  }
}

async function generateVideo() {
  error.value = ''
  successMessage.value = ''
  
  console.log('[video] 开始生成视频请求')
  console.log('[video] 用户信息:', me.value ? `已登录 (${me.value.username})` : '未登录')
  
  if (!me.value) {
    error.value = '请先登录'
    return
  }
  if (!prompt.value.trim()) {
    error.value = '请输入提示词'
    return
  }
  if (mode.value === 'image' && imageFiles.value.length === 0) {
    error.value = '请上传参考图片'
    return
  }
  
  loading.value = true
  
  // 保存当前输入，用于创建任务
  const currentPrompt = prompt.value.trim()
  const currentModel = model.value
  const currentDuration = duration.value
  const currentAspectRatio = aspectRatio.value
  const pointsCost = currentPointsCost.value
  
  try {
    const formData = new FormData()
    formData.append('prompt', currentPrompt)
    formData.append('model', currentModel)
    formData.append('aspect_ratio', currentAspectRatio)
    formData.append('duration', currentDuration)
    formData.append('hd', hd.value ? 'true' : 'false')
    formData.append('watermark', watermark.value ? 'true' : 'false')
    formData.append('private', isPrivate.value ? 'true' : 'false')
    
    if (mode.value === 'image') {
      for (const file of imageFiles.value) {
        formData.append('images', file)
      }
    }
    
    console.log('[video] 请求参数:', {
      prompt: currentPrompt,
      model: currentModel,
      aspect_ratio: currentAspectRatio,
      duration: currentDuration,
      hd: hd.value,
      mode: mode.value,
      imageCount: imageFiles.value.length
    })
    
    const token = localStorage.getItem('token')
    console.log('[video] Token存在:', !!token)
    console.log('[video] 租户Headers:', getTenantHeaders())
    console.log('[video] 发起请求到 /api/videos/generate')
    
    // 立即清空输入框和图片，恢复UI状态
    clearImages()
    prompt.value = ''
    loading.value = false
    successMessage.value = '任务已提交，正在处理...'
    
    // 异步发送请求，不阻塞UI
    const response = await fetch('/api/videos/generate', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    })
    
    console.log('[video] 响应状态:', response.status, response.statusText)
    console.log('[video] 响应Headers:', Object.fromEntries(response.headers.entries()))
    
    const data = await response.json()
    console.log('[video] 响应数据:', data)
    if (!response.ok) {
      console.error('[video] 请求失败:', response.status, data)
      // 保存状态码和数据以便后续处理
      const err = new Error(data.message || data.error || '生成失败')
      err.status = response.status
      err.body = data
      throw err
    }
    
    console.log('[video] 请求成功，解析响应数据')
    const taskId = data.task_id || data.id || crypto.randomUUID()
    console.log('[video] 任务ID:', taskId)
    
    const task = {
      id: taskId,
      task_id: taskId,
      prompt: currentPrompt,
      model: currentModel,
      duration: currentDuration,
      aspect_ratio: currentAspectRatio,
      status: data.status || 'pending',
      progress: data.progress || '排队中',
      created_at: Date.now(),
      video_url: data.video_url || null,
      points_cost: pointsCost,
      fail_reason: null // 初始化失败原因
    }
    
    console.log('[video] 创建任务对象:', task)
    
    // 历史记录中添加（累积）
    history.value.unshift(task)
    console.log('[video] 已添加到历史记录')
    
    startPolling(taskId)
    console.log('[video] 已启动轮询')
    
    successMessage.value = '任务已提交，请在历史记录中查看进度'
    console.log('[video] 刷新用户信息')
    await refreshUser()
    console.log('[video] 视频生成流程完成')
    
    // 3秒后清除成功消息
    setTimeout(() => {
      if (successMessage.value === '任务已提交，请在历史记录中查看进度') {
        successMessage.value = ''
      }
    }, 3000)
  } catch (e) {
    console.error('[video] generate error:', e)
    loading.value = false
    if (e.status === 402 || e.message.includes('402')) {
      error.value = '积分不足，请先充值或使用兑换券'
    } else if (e.status === 401) {
      error.value = '未登录，请先登录'
    } else if (e.status === 429) {
      // 并发限制错误
      const hasPackage = userPackageInfo.value.hasPackage
      const concurrentLimit = e.body?.concurrent_limit || userPackageInfo.value.concurrentLimit
      if (hasPackage) {
        error.value = `已达到VIP并发限制（${concurrentLimit}个任务），请等待当前任务完成后再试`
      } else {
        error.value = `已达到并发限制（${concurrentLimit}个任务）。如需多并发，请升级套餐 →`
      }
    } else {
      error.value = e.message || '生成失败，请稍后再试'
    }
  }
}

async function fetchTask(taskId) {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/videos/task/${taskId}`, {
      headers: { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
    if (!response.ok) return null
    return await response.json()
  } catch (e) {
    console.error('fetchTask error', e)
    return null
  }
}

function mergeTaskUpdate(taskId, update) {
  const apply = (list) => {
    const index = list.findIndex(entry => taskKey(entry) === taskId)
    if (index >= 0) {
      list[index] = { ...list[index], ...update }
    }
  }
  // 只更新 history 中已存在的任务
  // gallery 不再使用，保持为空状态
  apply(history.value)
}

function startPolling(taskId) {
  if (!taskId || pollingTimers.has(taskId)) return
  
  const timer = setInterval(async () => {
    const taskData = await fetchTask(taskId)
    if (!taskData) return
    
    // 检查超时（1小时 = 3600000毫秒）
    const createdAt = taskData.created_at || Date.now()
    const elapsed = Date.now() - createdAt
    const ONE_HOUR = 60 * 60 * 1000
    
    // 如果超过1小时且还在处理中，标记为失败
    if (elapsed > ONE_HOUR && isProcessingStatus(taskData.status)) {
      console.log(`[VideoGeneration] 任务超时: ${taskId}, 已运行 ${Math.floor(elapsed / 1000 / 60)} 分钟`)
      mergeTaskUpdate(taskId, {
        status: 'timeout',
        progress: '生成超时',
        fail_reason: '生成超时（超过1小时），未扣除积分'
      })
      clearInterval(timer)
      pollingTimers.delete(taskId)
      return
    }
    
    mergeTaskUpdate(taskId, {
      status: taskData.status,
      progress: taskData.progress,
      video_url: taskData.video_url || taskData.url,
      fail_reason: taskData.fail_reason
    })
    
    // 如果任务已完成或失败，停止轮询
    if (isCompletedStatus(taskData.status) || isFailedStatus(taskData.status)) {
      clearInterval(timer)
      pollingTimers.delete(taskId)
      refreshUser()
    }
  }, 4000)
  pollingTimers.set(taskId, timer)
}

async function loadHistory() {
  try {
    const token = localStorage.getItem('token')
    console.log('[VideoGeneration] 开始加载历史记录, token存在:', !!token)
    
    if (!token) {
      console.log('[VideoGeneration] 未登录，跳过加载历史记录')
      history.value = []
      // gallery 不清空，保留当前生成的视频
      return
    }
    
    const response = await fetch('/api/videos/history', {
      headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    })
    
    console.log('[VideoGeneration] API响应状态:', response.status, response.ok)
    
    if (!response.ok) {
      console.error('[VideoGeneration] API返回错误状态:', response.status)
      return
    }
    
    const data = await response.json()
    console.log('[VideoGeneration] 获取到原始数据:', data)
    
    const ONE_HOUR = 60 * 60 * 1000
    const now = Date.now()
    
    const videos = (data.videos || []).map(item => {
      const video = {
        ...item,
        task_id: item.task_id || item.id,
        created_at: item.created_at || item.created
      }
      
      // 检查超时：如果超过1小时且还在处理中，标记为超时失败
      const createdAt = video.created_at || 0
      const elapsed = now - createdAt
      
      if (elapsed > ONE_HOUR && isProcessingStatus(video.status)) {
        console.log(`[VideoGeneration] 发现超时任务: ${video.id}, 已运行 ${Math.floor(elapsed / 1000 / 60)} 分钟`)
        video.status = 'timeout'
        video.progress = '生成超时'
        video.fail_reason = '生成超时（超过1小时），未扣除积分'
      }
      
      return video
    })
    
    console.log('[VideoGeneration] 处理后的视频列表:', videos.length, '条')
    console.log('[VideoGeneration] 视频详情:', videos)
    
    // 更新历史记录
    history.value = videos
    
    // gallery 保持为空，始终显示"开始创作"空状态
    // 所有视频任务都在历史记录抽屉中查看
    console.log('[VideoGeneration] 历史记录已加载，输出库保持空状态（显示"开始创作"）')
    
    // 对 history 中的未完成任务启动轮询（且未超时）
    const pendingTasks = videos.filter(item => {
      const createdAt = item.created_at || 0
      const elapsed = now - createdAt
      return isProcessingStatus(item.status) && elapsed <= ONE_HOUR
    })
    console.log('[VideoGeneration] 未完成任务数:', pendingTasks.length, '个')
    
    pendingTasks.forEach(task => {
      if (task.task_id) {
        console.log('[VideoGeneration] 启动轮询:', task.task_id)
        startPolling(task.task_id)
      }
    })
  } catch (e) {
    console.error('[VideoGeneration] 加载历史记录失败:', e)
  }
}

async function deleteHistory(item) {
  if (!confirm('确定删除该记录吗？')) return
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/videos/history/${item.id}`, {
      method: 'DELETE',
      headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('删除失败')
    history.value = history.value.filter(v => v.id !== item.id)
    gallery.value = gallery.value.filter(v => v.id !== item.id)
  } catch (e) {
    console.error('deleteHistory error', e)
  }
}

async function downloadVideo(item) {
  if (!item?.video_url) return
  try {
    const token = localStorage.getItem('token')
    // 如果有备注，将备注添加到文件名开头（移除特殊字符）
    const notePrefix = item.note ? item.note.replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '_').slice(0, 30) + '_' : ''
    const promptPart = (item.prompt || 'video').slice(0, 20).replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '_')
    const filename = encodeURIComponent(`${notePrefix}${promptPart}`)
    const response = await fetch(`/api/videos/download?url=${encodeURIComponent(item.video_url)}&name=${filename}.mp4`, {
      headers: { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
    if (!response.ok) throw new Error('下载失败')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('download video error', e)
  }
}

// 更新视频备注
async function updateVideoNote(item, note) {
  if (!item || !item.id) return
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/videos/history/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ note })
    })
    if (response.ok) {
      // 更新本地数据
      const idx = history.value.findIndex(h => h.id === item.id)
      if (idx !== -1) {
        history.value[idx].note = note
      }
      const gIdx = gallery.value.findIndex(g => g.id === item.id)
      if (gIdx !== -1) {
        gallery.value[gIdx].note = note
      }
      console.log('[updateVideoNote] 更新成功:', item.id, note)
    }
  } catch (e) {
    console.error('[updateVideoNote] 更新失败:', e)
  }
}

// 更新视频星标
async function updateVideoRating(item, rating) {
  if (!item || !item.id) return
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/videos/history/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ rating })
    })
    if (response.ok) {
      // 更新本地数据
      const idx = history.value.findIndex(h => h.id === item.id)
      if (idx !== -1) {
        history.value[idx].rating = rating
      }
      const gIdx = gallery.value.findIndex(g => g.id === item.id)
      if (gIdx !== -1) {
        gallery.value[gIdx].rating = rating
      }
      console.log('[updateVideoRating] 更新成功:', item.id, rating)
    }
  } catch (e) {
    console.error('[updateVideoRating] 更新失败:', e)
  }
}

function openVideoModal(item) {
  currentVideo.value = item
  showVideoModal.value = true
  // 使用 nextTick 确保 DOM 更新后再尝试播放
  setTimeout(() => {
    if (videoPlayerRef.value) {
      videoPlayerRef.value.muted = false
      videoPlayerRef.value.volume = 1
      videoPlayerRef.value.play().catch(e => {
        console.log('[video] 自动播放失败，需用户交互:', e.message)
      })
    }
  }, 100)
}

function closeVideoModal() {
  // 关闭模态框时暂停视频
  if (videoPlayerRef.value) {
    videoPlayerRef.value.pause()
  }
  showVideoModal.value = false
  currentVideo.value = null
}

// 视频加载完成后自动播放（带声音）
function onVideoLoaded() {
  if (videoPlayerRef.value) {
    videoPlayerRef.value.muted = false
    videoPlayerRef.value.volume = 1
    videoPlayerRef.value.play().catch(e => {
      console.log('[video] 自动播放失败:', e.message)
    })
  }
}

// 从历史记录再次生成
async function regenerateFromHistory(item) {
  if (!item) return
  
  console.log('[VideoGeneration] 再次生成:', item)
  
  // 恢复参数到输入框
  if (item.prompt) {
    prompt.value = item.prompt
  }
  if (item.model) {
    model.value = item.model
  }
  if (item.aspect_ratio) {
    aspectRatio.value = item.aspect_ratio
  }
  if (item.duration) {
    duration.value = String(item.duration)
  }
  
  // 获取参考图片列表
  const referenceImages = item.reference_images || (item.reference_image ? [item.reference_image] : [])
  
  // 如果有参考图片，切换到图生视频模式并加载图片
  if (referenceImages.length > 0) {
    mode.value = 'image'
    
    // 清空现有图片
    clearImages()
    
    // 显示加载提示
    successMessage.value = '正在加载参考图片...'
    
    try {
      for (const imageUrl of referenceImages) {
        console.log('[VideoGeneration] 加载参考图片:', imageUrl)
        
        try {
          const response = await fetch(imageUrl)
          if (response.ok) {
            const blob = await response.blob()
            const filename = imageUrl.split('/').pop() || `image-${Date.now()}.jpg`
            const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
            const previewUrl = URL.createObjectURL(blob)
            
            imageFiles.value.push(file)
            previewUrls.value.push(previewUrl)
          }
        } catch (imgError) {
          console.error('[VideoGeneration] 加载图片失败:', imageUrl, imgError)
        }
      }
      
      if (imageFiles.value.length > 0) {
        successMessage.value = `已自动填充参数和${imageFiles.value.length}张参考图片`
      } else {
        successMessage.value = '已填充参数，但参考图片加载失败（可能已过期）'
      }
    } catch (e) {
      console.error('[VideoGeneration] 加载参考图片失败:', e)
      successMessage.value = '已填充参数，但参考图片加载失败'
    }
  } else {
    mode.value = 'text'
    successMessage.value = '已自动填充参数，可以直接生成或修改后生成'
  }
  
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' })
  
  // 3秒后清除提示
  setTimeout(() => {
    successMessage.value = ''
  }, 3000)
}

function toggleHistoryDrawer() {
  isHistoryDrawerOpen.value = !isHistoryDrawerOpen.value
}

// 监听模型变化
watch(model, (newModel) => {
  // 切换到非 PRO 模型时自动关闭 HD
  if (newModel !== 'sora-2-pro' && hd.value) {
    hd.value = false
  }
  
  // VEO3模型不需要时长选项
  if (VEO3_MODELS.includes(newModel)) {
    console.log('[VideoGeneration] VEO3模型不支持时长选择')
    // 如果上传的图片数量超过VEO3限制，提示用户
    const maxImages = newModel === 'veo3.1-components' ? 3 : 2
    if (imageFiles.value.length > maxImages) {
      console.log(`[VideoGeneration] 图片数量 ${imageFiles.value.length} 超过VEO3限制 ${maxImages}`)
    }
  } else {
    // 检查当前时长是否在新模型的可用时长列表中
    const availableDurs = availableDurations.value
    if (availableDurs.length > 0 && !availableDurs.includes(duration.value)) {
      duration.value = availableDurs[0]
      console.log('[VideoGeneration] 模型切换，时长已调整为:', duration.value)
    }
  }
})

onMounted(async () => {
  // 加载视频配置（优先加载，以便后续计算积分）
  await loadVideoConfig()
  await refreshUser()
  // 只加载历史记录到抽屉，不自动显示在输出视频库
  await loadHistory()
  // gallery 保持为空，等待用户生成新视频
  
  // 选择一个启用的默认模型（从配置动态获取）
  const enabledModels = availableModels.value
  if (enabledModels.length > 0 && !enabledModels.find(m => m.value === model.value)) {
    model.value = enabledModels[0].value
    console.log('[VideoGeneration] 自动选择启用的模型:', model.value)
  }
  
  // 检查是否有从图片页面传来的数据
  const videoGenerationData = sessionStorage.getItem('videoGenerationImage')
  if (videoGenerationData) {
    try {
      const data = JSON.parse(videoGenerationData)
      console.log('[VideoGeneration] 接收到图片数据:', data)
      
      // 检查数据是否过期（5分钟）
      if (Date.now() - data.timestamp < 5 * 60 * 1000) {
        // 切换到图生视频模式
        mode.value = 'image'
        
        // 填充提示词
        if (data.prompt) {
          prompt.value = data.prompt
        }
        
        // 加载图片
        if (data.url) {
          try {
            const response = await fetch(data.url)
            if (response.ok) {
              const blob = await response.blob()
              const filename = data.url.split('/').pop() || `image-${Date.now()}.jpg`
              const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
              const previewUrl = URL.createObjectURL(blob)
              
              imageFiles.value = [file]
              previewUrls.value = [previewUrl]
              
              successMessage.value = '图片已加载，可以开始生成视频'
              setTimeout(() => { successMessage.value = '' }, 3000)
            }
          } catch (e) {
            console.error('[VideoGeneration] 加载图片失败:', e)
            error.value = '图片加载失败，请重新上传'
            setTimeout(() => { error.value = '' }, 3000)
          }
        }
      }
      
      // 清除 sessionStorage 数据
      sessionStorage.removeItem('videoGenerationImage')
    } catch (e) {
      console.error('[VideoGeneration] 解析图片数据失败:', e)
      sessionStorage.removeItem('videoGenerationImage')
    }
  }
})

onUnmounted(() => {
  pollingTimers.forEach(timer => clearInterval(timer))
  pollingTimers.clear()
  clearImages()
})
</script>

<template>
  <!-- 主容器 - 两栏布局（左侧控制面板 + 中间输出区，右侧抽屉独立） -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      
      <!-- 左侧控制面板 -->
      <div class="lg:col-span-3">
        <div class="card p-5 sticky top-24">
          <!-- 模式切换标签 -->
          <div class="flex bg-slate-100 dark:bg-dark-700 rounded-xl p-1 mb-5">
            <button 
              @click="mode = 'image'" 
              :class="mode === 'image' 
                ? 'bg-white dark:bg-dark-600 shadow-md text-pink-600 dark:text-pink-400' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
              class="flex-1 flex items-center justify-center space-x-2 rounded-lg transition-all duration-200 font-medium py-3 px-4"
            >
              <span class="text-xl">🎬</span>
              <span class="text-sm">图生视频</span>
            </button>
            <button 
              @click="mode = 'text'" 
              :class="mode === 'text' 
                ? 'bg-white dark:bg-dark-600 shadow-md text-primary-600 dark:text-primary-400' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
              class="flex-1 flex items-center justify-center space-x-2 rounded-lg transition-all duration-200 font-medium py-3 px-4"
            >
              <span class="text-xl">✍️</span>
              <span class="text-sm">文生视频</span>
            </button>
          </div>

          <div class="space-y-4">
            <!-- 模型选择 -->
            <div>
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>🤖</span>
                <span>模型</span>
              </label>
              <select v-model="model" class="input text-sm">
                <option v-for="m in availableModels" :key="m.value" :value="m.value">
                  {{ m.label }}
                </option>
              </select>
            </div>

            <!-- 画面比例/方向 - 从模型配置动态获取 -->
            <div>
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>📐</span>
                <span>画面方向</span>
              </label>
              <select v-model="aspectRatio" class="input text-sm">
                <option 
                  v-for="ar in availableAspectRatios" 
                  :key="ar.value" 
                  :value="ar.value"
                >{{ ar.label }}</option>
              </select>
            </div>

            <!-- 视频长度（VEO3模型不显示） -->
            <div v-if="!isVeo3Model">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>⏱️</span>
                <span>视频长度</span>
              </label>
              <select v-model="duration" class="input text-sm">
                <option v-for="dur in availableDurations" :key="dur" :value="dur">
                  {{ dur }} 秒
                </option>
              </select>
            </div>
            
            <!-- VEO3模型提示（仅在图生视频模式下显示） -->
            <div v-if="isVeo3Model && mode === 'image'" class="p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p class="text-xs text-blue-700 dark:text-blue-300">
                <span class="font-semibold">{{ getModelName(model) }}</span> 
                <span v-if="model === 'veo3.1-components'">支持最多 3 张参考图</span>
                <span v-else>支持最多 2 张参考图（首尾帧）</span>
              </p>
            </div>

            <!-- 选项 -->
            <div v-if="isHdAvailable">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>⚙️</span>
                <span>选项</span>
              </label>
              <div class="space-y-2">
                <label class="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" v-model="hd" class="rounded accent-primary-600" />
                  <span>HD 高清 (+{{ pointsCostConfig.hd_extra }}积分)</span>
                </label>
              </div>
            </div>

            <!-- 提示词 -->
            <div>
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>📝</span>
                <span>提示词</span>
              </label>
              <textarea
                v-model="prompt"
                rows="3"
                class="input text-sm resize-none"
                placeholder="描述你想要的视频场景、角色、镜头语言等"
              ></textarea>
            </div>

            <!-- 图生视频上传区域 -->
            <div v-if="mode === 'image'" class="space-y-2.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>🖼️</span>
                  <span>上传参考图片</span>
                </label>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  <span class="font-semibold text-primary-600 dark:text-primary-400">{{ imageFiles.length }}</span> / {{ maxImagesForModel }}张
                </div>
              </div>
              
              <!-- 图片数量超限提示 -->
              <div v-if="imageFiles.length > maxImagesForModel" class="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p class="text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ 当前模型最多支持 {{ maxImagesForModel }} 张图片，请删除多余图片或切换模型
                </p>
              </div>
              
              <!-- 拖拽区域 -->
              <div 
                v-if="imageFiles.length < maxImagesForModel"
                @dragover="onDragOver"
                @dragleave="onDragLeave"
                @drop="onDrop"
                :class="{ 'border-primary-500 bg-primary-50 dark:bg-primary-900/20': isDragging }"
                class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-4 text-center transition-colors cursor-pointer hover:border-primary-400"
                @click="triggerFileDialog"
              >
                <div class="text-3xl mb-1.5">📤</div>
                <p class="text-xs text-slate-600 dark:text-slate-400 mb-1">
                  点击或拖拽图片到这里
                </p>
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  单张最大30MB
                </p>
                <input 
                  ref="fileInputRef"
                  type="file" 
                  accept="image/*" 
                  multiple 
                  @change="onFilesChange" 
                  class="hidden"
                />
              </div>

              <!-- 已达上限提示 -->
              <div 
                v-else-if="imageFiles.length >= maxImagesForModel"
                class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-4 text-center bg-slate-50 dark:bg-dark-700/50"
              >
                <div class="text-2xl mb-1">✅</div>
                <p class="text-xs text-slate-600 dark:text-slate-400">
                  已上传 {{ imageFiles.length }} 张图片（已达上限）
                </p>
              </div>

              <!-- 预览已上传的图片 -->
              <div v-if="previewUrls.length > 0" class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    图片列表
                  </span>
                  <button 
                    @click="clearImages"
                    class="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    清空全部
                  </button>
                </div>
                
                <div class="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar-small">
                  <div 
                    v-for="(url, idx) in previewUrls" 
                    :key="idx" 
                    class="relative group flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600"
                  >
                    <!-- 序号 -->
                    <div class="flex-shrink-0 w-6 h-6 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full flex items-center justify-center text-xs font-bold">
                      {{ idx + 1 }}
                    </div>
                    
                    <!-- 缩略图 -->
                    <img 
                      :src="url" 
                      class="w-12 h-12 object-cover rounded flex-shrink-0" 
                    />
                    
                    <!-- 文件信息 -->
                    <div class="flex-1 min-w-0">
                      <p class="text-xs text-slate-700 dark:text-slate-300 truncate font-medium">
                        {{ imageFiles[idx].name }}
                      </p>
                      <p class="text-xs text-slate-500 dark:text-slate-400">
                        {{ (imageFiles[idx].size / 1024 / 1024).toFixed(2) }} MB
                      </p>
                    </div>
                    
                    <!-- 删除按钮 -->
                    <button 
                      @click.stop="removeImage(idx)"
                      class="w-6 h-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center"
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 生成按钮 -->
            <button 
              @click="generateVideo" 
              :disabled="loading"
              class="w-full btn-primary text-base disabled:opacity-60 disabled:cursor-not-allowed font-semibold shadow-lg hover:shadow-xl transition-all duration-300 py-3.5"
            >
              <span v-if="loading" class="inline-flex items-center">
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                提交中...
              </span>
              <span v-else class="inline-flex items-center justify-center w-full">
                <span class="mr-2">✨</span>
                <span>立即生成</span>
                <span class="ml-2 text-sm opacity-90">(消耗{{ currentPointsCost }}积分)</span>
              </span>
            </button>

            <!-- 并发限制提示 -->
            <div v-if="me" class="text-center">
              <p class="text-xs text-slate-500 dark:text-slate-400">
                <span v-if="userPackageInfo.hasPackage" class="text-purple-600 dark:text-purple-400">
                  ⚡ VIP用户
                </span>
                <span v-else class="text-slate-600 dark:text-slate-400">
                  👤 普通用户
                </span>
                <span class="mx-1">·</span>
                <span>最多支持 <span class="font-semibold text-primary-600 dark:text-primary-400">{{ me.concurrent_limit || 1 }}</span> 条并发任务</span>
              </p>
            </div>

            <!-- 未登录提示 -->
            <div v-if="!me" class="p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div class="flex items-start space-x-2">
                <span class="text-lg">🎁</span>
                <div class="flex-1">
                  <p class="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">
                    注册即送积分！
                  </p>
                  <p class="text-xs text-blue-700 dark:text-blue-400">
                    新用户注册可获得奖励积分，立即开始创作吧～
                  </p>
                  <a 
                    href="/" 
                    class="mt-2 inline-block px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded-md transition-colors font-medium"
                  >
                    立即注册/登录
                  </a>
                </div>
              </div>
            </div>

            <!-- 错误提示 -->
            <div v-if="error" class="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p class="text-xs text-red-700 dark:text-red-400 flex items-center">
                <span class="mr-1.5">⚠️</span>
                <span>{{ error }}</span>
                <!-- 如果是未登录错误，显示登录按钮 -->
                <a 
                  v-if="error.includes('未登录') || error.includes('请先登录')"
                  href="/" 
                  class="ml-2 px-3 py-1 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded-md transition-colors whitespace-nowrap"
                >
                  立即登录
                </a>
                <!-- 如果是并发限制错误且是普通用户，显示升级按钮 -->
                <a 
                  v-else-if="error.includes('如需多并发') && !userPackageInfo.hasPackage"
                  href="/packages" 
                  class="ml-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md transition-colors whitespace-nowrap"
                >
                  升级套餐
                </a>
              </p>
            </div>

            <!-- 成功提示 -->
            <div v-if="successMessage" class="p-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p class="text-xs text-green-700 dark:text-green-400 flex items-center">
                <span class="mr-1.5">✅</span>
                <span>{{ successMessage }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间输出视频库 -->
      <div class="lg:col-span-9">
        <div class="card p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-bold gradient-text flex items-center">
              <span class="mr-2">🎬</span>
              <span>输出视频库</span>
              <span class="ml-2 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full text-xs font-semibold">
                {{ gallery.length }}
              </span>
            </h2>
            <button 
              @click="loadHistory" 
              class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              刷新
            </button>
          </div>

          <!-- 空状态 - 开始创作 -->
          <div v-if="gallery.length === 0" class="text-center py-20">
            <div class="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 rounded-2xl flex items-center justify-center shadow-lg">
              <span class="text-4xl">🎬</span>
            </div>
            <h3 class="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
              开始创作
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              在左侧输入提示词，点击生成按钮创造精彩的视频
            </p>
          </div>

          <!-- 单个视频大图展示 -->
          <div v-else-if="gallery.length === 1" class="w-full">
            <div
              v-for="item in gallery"
              :key="item.id"
              class="space-y-4"
            >
              <!-- 生成中状态 -->
              <div v-if="isProcessingStatus(item.status)" 
                class="rounded-lg overflow-hidden bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-purple-900/20 dark:via-blue-900/20 dark:to-pink-900/20 aspect-video relative">
                <!-- 动态背景动效 -->
                <div class="absolute inset-0 bg-gradient-to-br from-purple-100/50 via-blue-100/50 to-pink-100/50 dark:from-purple-800/10 dark:via-blue-800/10 dark:to-pink-800/10 animate-pulse"></div>
                
                <!-- 装饰性闪光元素 -->
                <div class="absolute inset-0 overflow-hidden opacity-30">
                  <div class="absolute top-1/4 left-1/4 w-32 h-32 bg-primary-300 dark:bg-primary-500/30 rounded-full blur-3xl animate-blob"></div>
                  <div class="absolute top-1/3 right-1/4 w-32 h-32 bg-purple-300 dark:bg-purple-500/30 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
                  <div class="absolute bottom-1/4 left-1/3 w-32 h-32 bg-pink-300 dark:bg-pink-500/30 rounded-full blur-3xl animate-blob animation-delay-4000"></div>
                </div>
                
                <div class="absolute inset-0 flex flex-col items-center justify-center z-10">
                  <!-- 旋转加载图标 -->
                  <svg class="animate-spin h-16 w-16 text-primary-500 mb-3 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  
                  <p class="text-slate-700 dark:text-slate-200 text-base font-bold mb-2">正在生成精彩视频...</p>
                  <p v-if="item.progress" class="text-primary-600 dark:text-primary-400 text-sm font-semibold mb-3 animate-pulse">{{ item.progress }}</p>
                  <p v-else class="text-slate-500 dark:text-slate-400 text-sm mb-3">AI正在为您创作中...</p>
                  
                  <!-- 进度条效果 -->
                  <div class="w-48 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-primary-500 via-purple-500 to-pink-500 rounded-full animate-loading-bar"></div>
                  </div>
                  
                  <p class="text-primary-500 dark:text-primary-400 text-xs mt-4 font-medium px-6 text-center">
                    ✨ 视频生成需要一定时间，您可以继续创作新视频
                  </p>
                </div>
              </div>
              
              <!-- 失败状态 -->
              <div v-else-if="isFailedStatus(item.status)" 
                class="rounded-lg overflow-hidden bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 aspect-video relative">
                <div class="absolute inset-0 flex flex-col items-center justify-center p-4">
                  <div class="text-4xl mb-3">❌</div>
                  <p class="text-red-600 dark:text-red-400 text-base font-semibold text-center">{{ formatStatus(item.status) }}</p>
                  <p v-if="item.fail_reason" class="text-red-500 dark:text-red-500 text-xs mt-2 text-center opacity-75">{{ item.fail_reason }}</p>
                  <p v-else class="text-red-500 dark:text-red-500 text-xs mt-2 text-center opacity-75">请稍后重试</p>
                  <p class="text-sm text-green-600 dark:text-green-400 mt-3 font-medium">✓ 未扣除积分</p>
                </div>
              </div>
              
              <!-- 完成状态 -->
              <div v-else 
                class="rounded-lg overflow-hidden bg-black aspect-video relative cursor-pointer group" 
                @click="openVideoModal(item)"
              >
                <video
                  v-if="item.video_url"
                  :src="item.video_url"
                  class="w-full h-full object-cover"
                  muted
                  playsinline
                ></video>
                <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                  <div class="text-4xl mb-2">⏳</div>
                  <div class="text-sm">{{ formatStatus(item.status) }}</div>
                </div>
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div class="text-white text-5xl">▶️</div>
                </div>
                <div class="absolute bottom-2 right-2 px-3 py-1 rounded-full text-xs bg-black/70 text-white backdrop-blur-sm">
                  {{ item.duration || duration }}s · {{ item.aspect_ratio }}
                </div>
              </div>
              
              <!-- 视频信息 -->
              <div class="space-y-2">
                <p class="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">{{ item.prompt }}</p>
                <div class="flex items-center justify-between text-xs">
                  <span :class="statusColor(item.status)" class="font-medium">{{ formatStatus(item.status) }}</span>
                  <span class="text-slate-500 dark:text-slate-400">{{ formatTime(item.created_at) }}</span>
                </div>
                
                <!-- 快捷星标 -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-0.5" @click.stop>
                    <button 
                      v-for="star in 5" 
                      :key="star"
                      @click="updateVideoRating(item, item.rating === star ? 0 : star)"
                      class="text-sm transition-all hover:scale-125"
                      :class="star <= (item.rating || 0) ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-600 hover:text-yellow-300'"
                      :title="`${star}星`"
                    >
                      ★
                    </button>
                  </div>
                </div>
                
                <!-- 快捷备注 -->
                <div @click.stop>
                  <input
                    type="text"
                    :value="item.note || ''"
                    @blur="(e) => updateVideoNote(item, e.target.value)"
                    @keyup.enter="(e) => { updateVideoNote(item, e.target.value); e.target.blur() }"
                    placeholder="添加备注..."
                    class="w-full px-2 py-1 text-xs bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-slate-600 dark:text-slate-300 placeholder-slate-400"
                  />
                </div>
                
                <div class="flex items-center gap-2 pt-2">
                  <button 
                    class="flex-1 btn-secondary text-xs py-2" 
                    @click="openVideoModal(item)"
                    :disabled="!item.video_url"
                  >
                    预览
                  </button>
                  <button 
                    class="flex-1 btn-secondary text-xs py-2" 
                    @click="downloadVideo(item)" 
                    :disabled="!item.video_url"
                  >
                    下载
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- 右侧历史记录抽屉（独立于主布局） -->
  <div>
    <!-- 抽屉触发按钮 -->
        <div 
          v-if="!isHistoryDrawerOpen"
          class="fixed right-0 top-1/2 -translate-y-1/2 z-30"
        >
          <button
            @click="toggleHistoryDrawer"
            class="relative bg-primary-600 hover:bg-primary-700 text-white rounded-l-2xl shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center"
            style="width: 56px; height: 120px;"
            title="打开历史记录"
          >
            <span class="text-2xl mb-1">🎬</span>
            <span class="text-xs font-semibold">历史记录</span>
            <span v-if="history.length > 0" class="absolute -top-2 -left-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-md">
              {{ history.length > 99 ? '99+' : history.length }}
            </span>
          </button>
        </div>

        <!-- 抽屉面板 -->
        <div
          class="fixed right-0 bg-white dark:bg-slate-900 shadow-2xl z-40 transform transition-transform duration-300 ease-in-out flex flex-col"
          :class="isHistoryDrawerOpen ? 'translate-x-0' : 'translate-x-full'"
          style="width: min(360px, 90vw); top: 64px; height: calc(100vh - 64px);"
        >
          <!-- 抽屉头部 -->
          <div class="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800">
            <div class="flex items-center space-x-2.5">
              <div class="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white shadow-md">
                <span class="text-lg">🎬</span>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center">
                  历史记录
                  <span class="ml-2 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full text-xs font-semibold">
                    {{ history.length }}
                  </span>
                </h3>
              </div>
            </div>
            <button
              @click="toggleHistoryDrawer"
              class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="关闭"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>

          <!-- 抽屉内容 -->
          <div class="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-slate-50/50 dark:bg-dark-900/50">
            <!-- 空状态 -->
            <div v-if="history.length === 0" class="flex flex-col items-center justify-center h-full text-center py-12">
              <div class="text-6xl mb-4 opacity-50">🎬</div>
              <p class="text-slate-500 dark:text-slate-400 text-sm font-medium">暂无历史记录</p>
              <p class="text-slate-400 dark:text-slate-500 text-xs mt-2">生成的视频会显示在这里</p>
            </div>

            <!-- 历史记录列表 -->
            <div
              v-for="item in history"
              :key="item.id"
              class="group bg-white dark:bg-dark-800 rounded-xl p-3 border border-slate-200 dark:border-dark-700 hover:border-primary-300 dark:hover:border-primary-600 transition-all duration-200 hover:shadow-lg"
            >
              <!-- 视频预览 -->
              <div 
                class="relative w-full aspect-video rounded-lg overflow-hidden cursor-pointer mb-3 group-hover:ring-2 group-hover:ring-primary-400 transition-all" 
                :class="item.video_url ? 'bg-black' : 'bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-purple-900/20 dark:via-blue-900/20 dark:to-pink-900/20'"
                @click="openVideoModal(item)"
              >
                <video
                  v-if="item.video_url"
                  :src="item.video_url"
                  class="w-full h-full object-cover"
                  muted
                  playsinline
                ></video>
                <!-- 生成中状态 -->
                <div v-else-if="isProcessingStatus(item.status)" class="absolute inset-0 flex flex-col items-center justify-center">
                  <!-- 动态背景 -->
                  <div class="absolute inset-0 bg-gradient-to-br from-purple-100/50 via-blue-100/50 to-pink-100/50 dark:from-purple-800/10 dark:via-blue-800/10 dark:to-pink-800/10 animate-pulse"></div>
                  
                  <!-- 内容 -->
                  <div class="relative z-10 text-center">
                    <!-- 加载旋转图标 -->
                    <svg class="animate-spin h-10 w-10 text-primary-500 mb-2 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="text-xs text-slate-700 dark:text-slate-300 font-semibold">正在生成中...</p>
                    <p v-if="item.progress" class="text-xs text-primary-600 dark:text-primary-400 mt-1 animate-pulse">{{ item.progress }}</p>
                    <p v-else class="text-xs text-slate-500 dark:text-slate-400 mt-1 opacity-75">AI正在创作中</p>
                  </div>
                </div>
                <!-- 失败状态 -->
                <div v-else-if="isFailedStatus(item.status)" class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20">
                  <div class="text-3xl mb-2">❌</div>
                  <p class="text-xs text-red-600 dark:text-red-400 font-semibold">{{ formatStatus(item.status) }}</p>
                  <p v-if="item.fail_reason" class="text-xs text-red-500 dark:text-red-500 mt-1 text-center px-4 line-clamp-2">{{ item.fail_reason }}</p>
                  <p class="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">✓ 未扣除积分</p>
                </div>
                <!-- 其他未知状态 - 默认显示为等待中 -->
                <div v-else class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                  <svg class="animate-spin h-8 w-8 text-primary-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div class="text-xs text-slate-700 dark:text-slate-300 font-semibold">{{ formatStatus(item.status) }}</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">请稍候...</div>
                </div>
                
                <!-- 悬停播放图标 -->
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div class="text-white text-4xl">▶️</div>
                </div>

                <!-- 时长标签 -->
                <div class="absolute bottom-2 right-2 px-2 py-1 rounded-md text-xs bg-black/70 text-white backdrop-blur-sm">
                  {{ item.duration || duration }}s
                </div>
              </div>

              <!-- 视频信息 -->
              <div class="space-y-2">
                <!-- 时间戳 -->
                <div class="flex items-center justify-between text-xs">
                  <span class="text-slate-500 dark:text-slate-400">{{ formatTime(item.created_at) }}</span>
                  <span :class="statusColor(item.status)" class="font-medium px-2 py-0.5 rounded-full bg-white dark:bg-slate-700">
                    {{ formatStatus(item.status) }}
                  </span>
                </div>

                <!-- 提示词 -->
                <p class="text-sm text-slate-900 dark:text-white line-clamp-2 leading-relaxed">
                  {{ item.prompt }}
                </p>

                <!-- 元数据和星标 -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span class="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded">{{ getModelName(item.model) }}</span>
                    <span class="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded">{{ item.aspect_ratio }}</span>
                  </div>
                  <!-- 快捷星标 -->
                  <div class="flex items-center gap-0.5" @click.stop>
                    <button 
                      v-for="star in 5" 
                      :key="star"
                      @click="updateVideoRating(item, item.rating === star ? 0 : star)"
                      class="text-sm transition-all hover:scale-125"
                      :class="star <= (item.rating || 0) ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-600 hover:text-yellow-300'"
                      :title="`${star}星`"
                    >
                      ★
                    </button>
                  </div>
                </div>
                
                <!-- 快捷备注 -->
                <div @click.stop>
                  <input
                    type="text"
                    :value="item.note || ''"
                    @blur="(e) => updateVideoNote(item, e.target.value)"
                    @keyup.enter="(e) => { updateVideoNote(item, e.target.value); e.target.blur() }"
                    placeholder="添加备注（如分镜信息）..."
                    class="w-full px-2 py-1 text-xs bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 text-slate-600 dark:text-slate-300 placeholder-slate-400"
                  />
                </div>

                <!-- 失败原因 -->
                <div v-if="isFailedStatus(item.status)" class="text-xs bg-red-50 dark:bg-red-900/20 p-2 rounded space-y-1">
                  <p v-if="item.fail_reason" class="text-red-500">{{ item.fail_reason }}</p>
                  <p class="text-green-600 dark:text-green-400 font-medium">✓ 未扣除积分</p>
                </div>

                <!-- 操作按钮 -->
                <div class="flex items-center gap-2 pt-2">
                  <!-- 再次生成按钮 -->
                  <button 
                    class="w-10 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center justify-center"
                    @click="regenerateFromHistory(item)"
                    title="再次生成"
                  >
                    🔄
                  </button>
                  <button 
                    class="flex-1 btn-secondary-small" 
                    @click="openVideoModal(item)"
                  >
                    <span class="mr-1">👁️</span>
                    预览
                  </button>
                  <button 
                    class="flex-1 btn-secondary-small" 
                    :disabled="!item.video_url" 
                    @click="downloadVideo(item)"
                    :class="{ 'opacity-50 cursor-not-allowed': !item.video_url }"
                  >
                    <span class="mr-1">⬇️</span>
                    下载
                  </button>
                  <button 
                    class="w-10 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center"
                    @click="deleteHistory(item)"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
  </div>

  <!-- 视频预览模态框 -->
  <div v-if="showVideoModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" @click.self="closeVideoModal">
    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-dark-600">
        <h4 class="font-semibold text-slate-900 dark:text-white">视频预览</h4>
        <button 
          class="text-slate-500 hover:text-slate-900 dark:hover:text-white text-2xl leading-none" 
          @click="closeVideoModal"
        >
          ✕
        </button>
      </div>
      <div class="p-6 flex-1 overflow-y-auto space-y-4">
        <div class="rounded-xl overflow-hidden bg-black aspect-video">
          <video 
            ref="videoPlayerRef"
            v-if="currentVideo?.video_url" 
            :src="currentVideo.video_url" 
            controls 
            class="w-full h-full object-contain"
            playsinline
            @loadeddata="onVideoLoaded"
          ></video>
          <div v-else class="flex items-center justify-center h-full text-slate-400">
            <div class="text-center">
              <div class="text-5xl mb-3">⏳</div>
              <div class="text-lg">视频尚未生成完成</div>
            </div>
          </div>
        </div>
        <div>
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-1">提示词</p>
          <p class="text-base text-slate-900 dark:text-white whitespace-pre-wrap">{{ currentVideo?.prompt }}</p>
        </div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div class="flex items-center space-x-2">
            <span class="text-slate-500 dark:text-slate-400">模型：</span>
            <span class="text-slate-900 dark:text-white font-medium">{{ currentVideo?.model }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-slate-500 dark:text-slate-400">画幅：</span>
            <span class="text-slate-900 dark:text-white font-medium">{{ currentVideo?.aspect_ratio }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-slate-500 dark:text-slate-400">时长：</span>
            <span class="text-slate-900 dark:text-white font-medium">{{ currentVideo?.duration || duration }}s</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-slate-500 dark:text-slate-400">状态：</span>
            <span :class="statusColor(currentVideo?.status)" class="font-medium">{{ formatStatus(currentVideo?.status) }}</span>
          </div>
        </div>
      </div>
      <div class="p-4 border-t border-slate-200 dark:border-dark-600 flex justify-end gap-3">
        <button class="btn-secondary px-6 py-2" @click="closeVideoModal">关闭</button>
        <button 
          class="btn-primary px-6 py-2" 
          :disabled="!currentVideo?.video_url" 
          @click="downloadVideo(currentVideo)"
        >
          下载视频
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  @apply bg-white dark:bg-slate-900 rounded-2xl shadow-soft border border-slate-200/60 dark:border-slate-800;
}

.input {
  @apply w-full px-3 py-2 border border-slate-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all;
}

.btn-primary {
  @apply bg-gradient-to-r from-primary-600 to-pink-600 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-300 hover:scale-[1.02];
}

.btn-secondary {
  @apply px-4 py-2 rounded-lg border border-slate-300 dark:border-dark-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors;
}

.btn-secondary-small {
  @apply px-3 py-2 rounded-lg border border-slate-300 dark:border-dark-600 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors font-medium;
}

.writing-vertical-rl {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.shadow-soft {
  box-shadow: 0 25px 40px -20px rgba(15, 23, 42, 0.15);
}

.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.5);
  border-radius: 999px;
}

.custom-scrollbar-small {
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.3) transparent;
}

.custom-scrollbar-small::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar-small::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 999px;
}

/* 视频生成动效 */
@keyframes blob {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(30px, -50px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
}

@keyframes loading-bar {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-blob {
  animation: blob 7s infinite;
}

.animation-delay-2000 {
  animation-delay: 2s;
}

.animation-delay-4000 {
  animation-delay: 4s;
}

.animate-loading-bar {
  animation: loading-bar 2s ease-in-out infinite;
}
</style>



