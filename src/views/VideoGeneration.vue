<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getMe, isQiniuCdnUrl, buildVideoDownloadUrl } from '@/api/client'
import { getTenantHeaders, getModelDisplayName, isModelEnabled, getAvailableVideoModels } from '@/config/tenant'
import { shouldHistoryDrawerOpenByDefault } from '@/utils/deviceDetection'
import { formatPoints } from '@/utils/format'

const fileInputRef = ref(null)
const prompt = ref('')
const mode = ref('text') // text 或 image
const model = ref('sora2')  // 默认使用新版 sora2 整合模型
const aspectRatio = ref('16:9')
const duration = ref('10')
const hd = ref(false)
const offPeak = ref(false) // Vidu 错峰模式
const resolution = ref('1080p') // Vidu 清晰度选项

// VEO3模型列表（不支持时长参数选择，固定8秒）
const VEO3_MODELS = [
  'veo3.1-components', 'veo3.1', 'veo3.1-pro',
  'veo3.1-4k', 'veo3.1-components-4k', 'veo3.1-pro-4k',
  'veo_3_1-fast' // 新增的 VEO 快速版
]

// 当前模型是否为VEO3系列
const isVeo3Model = computed(() => VEO3_MODELS.includes(model.value))

// 当前模型是否为Vidu系列（支持错峰模式）
const isViduModel = computed(() => {
  const modelConfig = currentModelConfig.value
  return modelConfig?.apiType === 'vidu' || model.value.toLowerCase().includes('vidu')
})

// 当前选中模型的配置
const currentModelConfig = computed(() => {
  return availableModels.value.find(m => m.value === model.value) || {}
})

// 可用的方向选项 - 从模型配置中读取
const availableAspectRatios = computed(() => {
  const aspectRatios = currentModelConfig.value?.aspectRatios
  if (aspectRatios && aspectRatios.length > 0) {
    // 兼容两种格式：字符串数组 ['16:9', '9:16'] 或对象数组 [{value, label}]
    return aspectRatios.map(ar => {
      // 如果是字符串，转换为对象格式
      if (typeof ar === 'string') {
        // 根据比例值生成友好的标签
        const labelMap = {
          '16:9': '横屏 (16:9)',
          '9:16': '竖屏 (9:16)',
          '1:1': '方形 (1:1)',
          '4:3': '4:3',
          '3:4': '3:4'
        }
        return {
          value: ar,
          label: labelMap[ar] || ar
        }
      }
      // 如果已经是对象，直接返回
      return ar
    })
  }
  // 兜底默认值
  return [
    { value: '16:9', label: '横屏 (16:9)' },
    { value: '9:16', label: '竖屏 (9:16)' }
  ]
})

// VEO3模型的图片数量限制
const maxImagesForModel = computed(() => {
  // components 版本支持最多 3 张图
  if (model.value === 'veo3.1-components' || model.value === 'veo3.1-components-4k') return 3
  // 其他 VEO3 模型支持最多 2 张图（首尾帧）
  if (VEO3_MODELS.includes(model.value)) return 2
  return 9 // 其他模型
})
const watermark = ref(false) // 默认false，隐藏选项
const isPrivate = ref(true) // 默认true，隐藏选项

// ========== Seedance 2.0 相关状态 ==========
const seedanceMode = ref('text2video') // 当前选择的 Seedance 模式
const seedanceResolution = ref('720p') // 分辨率：480p / 720p
const seedanceRatio = ref('adaptive') // 宽高比
const seedanceDuration = ref(5) // 时长：4-15秒
const seedanceGenerateAudio = ref(true) // 生成有声视频
const seedanceWebSearch = ref(false) // 联网搜索增强
const seedanceWatermark = ref(false) // 水印
const seedanceAdvancedOpen = ref(false) // 高级设置展开状态
const seedanceModeOpen = ref(true) // 模式选择展开状态

// Seedance 首帧/尾帧图片
const seedanceFirstFrameFile = ref(null)
const seedanceFirstFramePreview = ref('')
const seedanceLastFrameFile = ref(null)
const seedanceLastFramePreview = ref('')

// Seedance 多模态参考图片
const seedanceRefImages = ref([])
const seedanceRefImagePreviews = ref([])

// Seedance 参考视频
const seedanceRefVideos = ref([])
const seedanceRefVideoPreviews = ref([]) // { name, size, url }

// Seedance 参考音频
const seedanceRefAudios = ref([])
const seedanceRefAudioPreviews = ref([]) // { name, size, duration }

// Seedance 参考 URL 输入
const seedanceRefImageUrl = ref('')
const seedanceRefVideoUrl = ref('')
const seedanceRefAudioUrl = ref('')
const seedanceRefImageUrls = ref([])
const seedanceRefVideoUrls = ref([])
const seedanceRefAudioUrls = ref([])

// Seedance 文件上传 refs
const seedanceFirstFrameInputRef = ref(null)
const seedanceLastFrameInputRef = ref(null)
const seedanceRefImageInputRef = ref(null)
const seedanceRefVideoInputRef = ref(null)
const seedanceRefAudioInputRef = ref(null)

// Seedance 模式定义
const SEEDANCE_MODES = [
  { value: 'text2video', label: '文生视频', icon: '✍️' },
  { value: 'image2video_first', label: '首帧', icon: '🖼️' },
  { value: 'image2video_first_last', label: '首尾帧', icon: '🎞️' },
  { value: 'multimodal_ref', label: '多模态', icon: '🎨' },
  { value: 'video_edit', label: '编辑', icon: '✂️' },
  { value: 'video_extend', label: '延长', icon: '⏩' }
]

const SEEDANCE_RATIOS = [
  { value: 'adaptive', label: '自适应' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' }
]

// HD 选项已弃用（Sora 新版本不再支持 HD 选项）
const isHdAvailable = computed(() => false)

// 当前模型是否为 Seedance 2.0
const isSeedanceModel = computed(() => {
  const modelConfig = currentModelConfig.value
  return modelConfig?.apiType === 'seedance-2.0'
})

// Seedance 可用的模式（从模型配置的 seedanceConfig.supportedModes 读取）
const seedanceAvailableModes = computed(() => {
  if (!isSeedanceModel.value) return []
  const config = currentModelConfig.value?.seedanceConfig
  const supported = config?.supportedModes
  if (!supported) return SEEDANCE_MODES // 无配置则全部可用
  // supported 可以是数组 ['text2video', 'image2video_first'] 或对象 { text2video: true }
  if (Array.isArray(supported)) {
    return SEEDANCE_MODES.filter(m => supported.includes(m.value))
  } else if (typeof supported === 'object') {
    return SEEDANCE_MODES.filter(m => supported[m.value] === true)
  }
  return SEEDANCE_MODES
})
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
  const models = getAvailableVideoModels({ disableVeoMerge: true })
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
    // 🔧 确保时长为字符串格式（数据库配置可能返回数字）
    return modelDurations.map(d => String(d))
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
    const veoConfig = pointsCostConfig.value[model.value]
    // 如果是数字直接返回，如果是对象取默认值
    return typeof veoConfig === 'number' ? veoConfig : (veoConfig || 100)
  }
  
  const modelConfig = pointsCostConfig.value[model.value]
  // 如果 pointsCost 是数字（固定积分），直接使用
  // 如果是对象（按时长计费），取对应时长的积分
  let cost
  if (typeof modelConfig === 'number') {
    cost = modelConfig
  } else if (typeof modelConfig === 'object' && modelConfig !== null) {
    cost = modelConfig[duration.value] || 40
  } else {
    cost = 40
  }
  if (hd.value && pointsCostConfig.value.hd_extra) {
    cost += pointsCostConfig.value.hd_extra
  }
  
  // Vidu 720P清晰度折扣
  if (isViduModel.value && resolution.value === '720p') {
    const modelCfg = currentModelConfig.value
    const discount = modelCfg?.resolution720Discount || 0.7 // 默认70%折扣
    cost = Math.ceil(cost * discount)
  }
  
  // Vidu 错峰模式折扣
  if (isViduModel.value && offPeak.value) {
    const modelCfg = currentModelConfig.value
    const discount = modelCfg?.offPeakDiscount || 0.7 // 默认70%折扣
    cost = Math.ceil(cost * discount)
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

// 获取可用的视频模型列表（从配置动态获取，根据当前模式过滤）
// 🔧 新手模式禁用 VEO 整合，直接显示所有 VEO 子模型
const availableModels = computed(() => {
  const allModels = getAvailableVideoModels({ disableVeoMerge: true })
  
  // 过滤掉旧版 sora-2 和 sora-2-pro
  const filteredByVersion = allModels.filter(m => !['sora-2', 'sora-2-pro'].includes(m.value))
  
  // 🔧 根据当前模式过滤：text=t2v, image=i2v
  const currentMode = mode.value === 'text' ? 't2v' : 'i2v'
  
  return filteredByVersion.filter(m => {
    // Seedance 2.0 模型始终显示（有自己的模式选择器）
    if (m.apiType === 'seedance-2.0') return true

    const supportedModes = m.supportedModes
    if (!supportedModes) return true // 无配置默认支持所有模式
    
    // 支持两种格式：数组 ['t2v', 'i2v'] 或 对象 { t2v: true, i2v: true }
    if (Array.isArray(supportedModes)) {
      return supportedModes.includes(currentMode)
    } else if (typeof supportedModes === 'object') {
      return supportedModes[currentMode] === true
    }
    return true
  })
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
    // Sora 系列（新版）
    'sora-2-33': 'Sora 2 普通版',
    'sora2-pro': 'Sora 2 Pro',
    'sora-2-duomi': 'Sora 2 角色创建版',
    // Sora 系列（旧版，已弃用）
    'sora-2': 'Sora 2',
    'sora-2-pro': 'Sora 2 Pro',
    // VEO 系列
    'veo3.1-components': 'VEO 3.1',
    'veo3.1': 'VEO 3.1 标准',
    'veo3.1-pro': 'VEO 3.1 Pro',
    'veo3.1-4k': 'VEO 4K',
    'veo3.1-components-4k': 'VEO 4K 多图',
    'veo3.1-pro-4k': 'VEO 4K Pro',
    'veo_3_1-fast': 'VEO 快速版'
  }
  return defaultNames[modelKey] || modelKey
}

function formatPointsTitle() {
  if (!me.value) return ''
  return `套餐积分：${formatPoints(me.value.package_points || 0)} | 永久积分：${formatPoints(me.value.points || 0)}`
}

// 监听模型变化，更新时长和方向选项
watch(model, (newModel) => {
  const modelConfig = availableModels.value.find(m => m.value === newModel)

  // 更新时长选项（确保为字符串格式）
  const durations = (modelConfig?.durations || ['10', '15']).map(d => String(d))
  if (durations.length > 0 && !durations.includes(String(duration.value))) {
    duration.value = durations[0]
    console.log('[VideoGeneration] 时长已重置为:', duration.value)
  }

  // 更新方向选项 - 兼容两种格式
  const aspectRatios = modelConfig?.aspectRatios || [{ value: '16:9', label: '横屏' }]
  const aspectValues = aspectRatios.map(ar => {
    // 兼容字符串和对象格式
    return typeof ar === 'string' ? ar : ar.value
  })
  if (aspectValues.length > 0 && !aspectValues.includes(aspectRatio.value)) {
    aspectRatio.value = aspectValues[0]
    console.log('[VideoGeneration] 方向已重置为:', aspectRatio.value)
  }
})

// 🔧 监听模式变化，检查当前模型是否支持新模式
watch(mode, (newMode) => {
  // 检查当前选中的模型是否在新模式的可用模型列表中
  const modelsForNewMode = availableModels.value
  const currentModelStillAvailable = modelsForNewMode.some(m => m.value === model.value)
  
  if (!currentModelStillAvailable && modelsForNewMode.length > 0) {
    // 当前模型不支持新模式，切换到第一个支持的模型
    model.value = modelsForNewMode[0].value
    console.log('[VideoGeneration] 切换模式后自动选择模型:', model.value)
  }
})

// 监听 Seedance 模式变化，清空上一个模式的文件
watch(seedanceMode, () => {
  clearSeedanceFiles()
  // 非文生视频模式时关闭联网搜索
  if (seedanceMode.value !== 'text2video') {
    seedanceWebSearch.value = false
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

// ========== Seedance 文件上传函数 ==========

function handleSeedanceFirstFrame(e) {
  const file = e.target.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  if (file.size > 30 * 1024 * 1024) { error.value = '图片不能超过30MB'; return }
  if (seedanceFirstFramePreview.value) URL.revokeObjectURL(seedanceFirstFramePreview.value)
  seedanceFirstFrameFile.value = file
  seedanceFirstFramePreview.value = URL.createObjectURL(file)
  e.target.value = ''
}

function removeSeedanceFirstFrame() {
  if (seedanceFirstFramePreview.value) URL.revokeObjectURL(seedanceFirstFramePreview.value)
  seedanceFirstFrameFile.value = null
  seedanceFirstFramePreview.value = ''
}

function handleSeedanceLastFrame(e) {
  const file = e.target.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  if (file.size > 30 * 1024 * 1024) { error.value = '图片不能超过30MB'; return }
  if (seedanceLastFramePreview.value) URL.revokeObjectURL(seedanceLastFramePreview.value)
  seedanceLastFrameFile.value = file
  seedanceLastFramePreview.value = URL.createObjectURL(file)
  e.target.value = ''
}

function removeSeedanceLastFrame() {
  if (seedanceLastFramePreview.value) URL.revokeObjectURL(seedanceLastFramePreview.value)
  seedanceLastFrameFile.value = null
  seedanceLastFramePreview.value = ''
}

function handleSeedanceRefImages(e) {
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
  const MAX = 9
  const remaining = MAX - seedanceRefImages.value.length - seedanceRefImageUrls.value.length
  const selected = files.filter(f => f.size <= 30 * 1024 * 1024).slice(0, remaining)
  seedanceRefImages.value.push(...selected)
  seedanceRefImagePreviews.value.push(...selected.map(f => URL.createObjectURL(f)))
  e.target.value = ''
}

function removeSeedanceRefImage(idx) {
  URL.revokeObjectURL(seedanceRefImagePreviews.value[idx])
  seedanceRefImages.value.splice(idx, 1)
  seedanceRefImagePreviews.value.splice(idx, 1)
}

function handleSeedanceRefVideos(e) {
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/'))
  const MAX = 3
  const remaining = MAX - seedanceRefVideos.value.length - seedanceRefVideoUrls.value.length
  const selected = files.filter(f => f.size <= 50 * 1024 * 1024).slice(0, remaining)
  for (const file of selected) {
    seedanceRefVideos.value.push(file)
    seedanceRefVideoPreviews.value.push({
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2),
      url: URL.createObjectURL(file)
    })
  }
  e.target.value = ''
}

function removeSeedanceRefVideo(idx) {
  URL.revokeObjectURL(seedanceRefVideoPreviews.value[idx].url)
  seedanceRefVideos.value.splice(idx, 1)
  seedanceRefVideoPreviews.value.splice(idx, 1)
}

function handleSeedanceRefAudios(e) {
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('audio/'))
  const MAX = 3
  const remaining = MAX - seedanceRefAudios.value.length - seedanceRefAudioUrls.value.length
  const selected = files.filter(f => f.size <= 15 * 1024 * 1024).slice(0, remaining)
  for (const file of selected) {
    seedanceRefAudios.value.push(file)
    seedanceRefAudioPreviews.value.push({
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2)
    })
  }
  e.target.value = ''
}

function removeSeedanceRefAudio(idx) {
  seedanceRefAudios.value.splice(idx, 1)
  seedanceRefAudioPreviews.value.splice(idx, 1)
}

function addSeedanceRefImageUrl() {
  const url = seedanceRefImageUrl.value.trim()
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    seedanceRefImageUrls.value.push(url)
    seedanceRefImageUrl.value = ''
  }
}
function removeSeedanceRefImageUrl(idx) {
  seedanceRefImageUrls.value.splice(idx, 1)
}
function addSeedanceRefVideoUrl() {
  const url = seedanceRefVideoUrl.value.trim()
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    seedanceRefVideoUrls.value.push(url)
    seedanceRefVideoUrl.value = ''
  }
}
function removeSeedanceRefVideoUrl(idx) {
  seedanceRefVideoUrls.value.splice(idx, 1)
}
function addSeedanceRefAudioUrl() {
  const url = seedanceRefAudioUrl.value.trim()
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    seedanceRefAudioUrls.value.push(url)
    seedanceRefAudioUrl.value = ''
  }
}
function removeSeedanceRefAudioUrl(idx) {
  seedanceRefAudioUrls.value.splice(idx, 1)
}

function clearSeedanceFiles() {
  removeSeedanceFirstFrame()
  removeSeedanceLastFrame()
  seedanceRefImagePreviews.value.forEach(url => URL.revokeObjectURL(url))
  seedanceRefImages.value = []
  seedanceRefImagePreviews.value = []
  seedanceRefVideoPreviews.value.forEach(p => URL.revokeObjectURL(p.url))
  seedanceRefVideos.value = []
  seedanceRefVideoPreviews.value = []
  seedanceRefAudios.value = []
  seedanceRefAudioPreviews.value = []
  seedanceRefImageUrls.value = []
  seedanceRefVideoUrls.value = []
  seedanceRefAudioUrls.value = []
  seedanceRefImageUrl.value = ''
  seedanceRefVideoUrl.value = ''
  seedanceRefAudioUrl.value = ''
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
    return 'text-gray-500'
  }
  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'text-red-500'
  }
  if (normalized.includes('process') || normalized.includes('pending') || normalized.includes('progress') || normalized.includes('not_start') || normalized.includes('queued') || normalized.includes('running')) {
    return 'text-gray-500'
  }
  return 'text-gray-500'
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

function isContentSafetyMsg(msg) {
  if (!msg) return false
  const keywords = ['敏感', '安全', '拦截', '违规', 'sensitive', 'moderation', 'content safety', 'illegal']
  return keywords.some(k => msg.toLowerCase().includes(k.toLowerCase()))
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
    // Seedance 非文生视频模式允许空提示词
    if (!isSeedanceModel.value || seedanceMode.value === 'text2video') {
      error.value = '请输入提示词'
      return
    }
  }
  if (mode.value === 'image' && !isSeedanceModel.value && imageFiles.value.length === 0) {
    error.value = '请上传参考图片'
    return
  }

  // Seedance 模式特定验证
  if (isSeedanceModel.value) {
    const sm = seedanceMode.value
    if (sm === 'image2video_first' && !seedanceFirstFrameFile.value) {
      error.value = '请上传首帧图片'
      return
    }
    if (sm === 'image2video_first_last') {
      if (!seedanceFirstFrameFile.value) { error.value = '请上传首帧图片'; return }
      if (!seedanceLastFrameFile.value) { error.value = '请上传尾帧图片'; return }
    }
    if (sm === 'video_edit') {
      if (seedanceRefVideos.value.length === 0 && seedanceRefVideoUrls.value.length === 0) { error.value = '请上传参考视频或输入视频 URL'; return }
    }
    if (sm === 'video_extend') {
      if (seedanceRefVideos.value.length === 0 && seedanceRefVideoUrls.value.length === 0) { error.value = '请上传要延长的视频或输入视频 URL'; return }
    }
    if (sm === 'multimodal_ref') {
      const hasImages = seedanceRefImages.value.length > 0 || seedanceRefImageUrls.value.length > 0
      const hasVideos = seedanceRefVideos.value.length > 0 || seedanceRefVideoUrls.value.length > 0
      if (!hasImages && !hasVideos) {
        error.value = '多模态模式至少需要一个参考图片或参考视频'
        return
      }
    }
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
    formData.append('duration', isSeedanceModel.value ? String(seedanceDuration.value) : currentDuration)
    formData.append('hd', hd.value ? 'true' : 'false')
    formData.append('watermark', watermark.value ? 'true' : 'false')
    formData.append('private', isPrivate.value ? 'true' : 'false')
    
    // Vidu 错峰模式
    if (isViduModel.value && offPeak.value) {
      formData.append('off_peak', 'true')
    }
    
    // Vidu 清晰度
    if (isViduModel.value) {
      formData.append('resolution', resolution.value)
    }
    
    if (mode.value === 'image') {
      for (const file of imageFiles.value) {
        formData.append('images', file)
      }
    }

    // Seedance 2.0 参数
    if (isSeedanceModel.value) {
      formData.append('seedance_mode', seedanceMode.value)
      formData.append('seedance_resolution', seedanceResolution.value)
      formData.append('seedance_ratio', seedanceRatio.value)
      formData.append('seedance_generate_audio', seedanceGenerateAudio.value ? 'true' : 'false')
      formData.append('web_search', seedanceWebSearch.value ? 'true' : 'false')
      formData.append('seedance_watermark', seedanceWatermark.value ? 'true' : 'false')

      // 首帧图片（文件上传字段名需与 multer 配置一致，使用驼峰命名）
      if (seedanceFirstFrameFile.value) {
        formData.append('firstFrameImage', seedanceFirstFrameFile.value)
      }
      // 尾帧图片
      if (seedanceLastFrameFile.value) {
        formData.append('lastFrameImage', seedanceLastFrameFile.value)
      }
      // 多模态参考图片（文件上传）
      for (const file of seedanceRefImages.value) {
        formData.append('referenceImages', file)
      }
      if (seedanceRefImageUrls.value.length > 0) {
        formData.append('reference_images', JSON.stringify(seedanceRefImageUrls.value))
      }
      // 参考视频（文件上传）
      for (const file of seedanceRefVideos.value) {
        formData.append('referenceVideos', file)
      }
      if (seedanceRefVideoUrls.value.length > 0) {
        formData.append('reference_videos', JSON.stringify(seedanceRefVideoUrls.value))
      }
      // 参考音频（文件上传）
      for (const file of seedanceRefAudios.value) {
        formData.append('referenceAudios', file)
      }
      if (seedanceRefAudioUrls.value.length > 0) {
        formData.append('reference_audios', JSON.stringify(seedanceRefAudioUrls.value))
      }
    }
    
    console.log('[video] 请求参数:', {
      prompt: currentPrompt,
      model: currentModel,
      aspect_ratio: currentAspectRatio,
      duration: currentDuration,
      hd: hd.value,
      mode: mode.value,
      imageCount: imageFiles.value.length,
      resolution: isViduModel.value ? resolution.value : undefined,
      offPeak: isViduModel.value ? offPeak.value : undefined
    })
    
    const token = localStorage.getItem('token')
    console.log('[video] Token存在:', !!token)
    console.log('[video] 租户Headers:', getTenantHeaders())
    console.log('[video] 发起请求到 /api/videos/generate')
    
    // 立即清空输入框和图片，恢复UI状态
    clearImages()
    if (isSeedanceModel.value) clearSeedanceFiles()
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
    
    // 判断是否是错峰模式任务
    const isOffPeakTask = isViduModel.value && offPeak.value
    
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
      fail_reason: null, // 初始化失败原因
      off_peak: isOffPeakTask ? 1 : 0 // 记录是否为错峰模式
    }
    
    console.log('[video] 创建任务对象:', task)
    
    // 历史记录中添加（累积）
    history.value.unshift(task)
    gallery.value = [task]
    console.log('[video] 已添加到历史记录和输出视频库')
    
    // 🔥 错峰模式使用特殊轮询策略
    startPolling(taskId, isOffPeakTask, Date.now())
    console.log('[video] 已启动轮询, 错峰模式:', isOffPeakTask)
    
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
  apply(history.value)
  apply(gallery.value)
}

// 计算错峰模式的轮询间隔
function getOffPeakPollInterval(taskCreatedAt) {
  const elapsed = Date.now() - taskCreatedAt
  const EIGHTY_MINUTES = 80 * 60 * 1000
  
  if (elapsed < EIGHTY_MINUTES) {
    // 前80分钟：正常轮询（5秒）
    return 5000
  } else {
    // 80分钟后：每10分钟轮询一次
    return 10 * 60 * 1000
  }
}

function startPolling(taskId, isOffPeakTask = false, taskCreatedAt = null) {
  if (!taskId || pollingTimers.has(taskId)) return
  
  const startTime = taskCreatedAt || Date.now()
  const EIGHTY_MINUTES = 80 * 60 * 1000
  const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000
  
  // 错峰模式使用动态轮询，普通模式使用固定间隔
  const scheduleNextPoll = () => {
    const interval = isOffPeakTask ? getOffPeakPollInterval(startTime) : 4000
    if (isOffPeakTask) {
      console.log(`[VideoGeneration] 错峰模式轮询 | 已过: ${Math.round((Date.now() - startTime) / 60000)}分钟 | 下次间隔: ${interval / 1000}秒`)
    }
    const timer = setTimeout(pollTask, interval)
    pollingTimers.set(taskId, timer)
  }
  
  const pollTask = async () => {
    const taskData = await fetchTask(taskId)
    if (!taskData) {
      scheduleNextPoll()
      return
    }
    
    // 检查超时
    const createdAt = taskData.created_at || startTime
    const elapsed = Date.now() - createdAt
    const maxTime = isOffPeakTask ? FORTY_EIGHT_HOURS : EIGHTY_MINUTES
    
    // 如果超时且还在处理中，标记为失败
    if (elapsed > maxTime && isProcessingStatus(taskData.status)) {
      console.log(`[VideoGeneration] 任务超时: ${taskId}, 已运行 ${Math.floor(elapsed / 1000 / 60)} 分钟, 错峰模式: ${isOffPeakTask}`)
      mergeTaskUpdate(taskId, {
        status: 'timeout',
        progress: '生成超时',
        fail_reason: isOffPeakTask ? '错峰模式生成超时（48小时）' : '生成超时（超过80分钟），未扣除积分'
      })
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
      pollingTimers.delete(taskId)
      refreshUser()
    } else {
      // 继续轮询
      scheduleNextPoll()
    }
  }
  
  // 开始第一次轮询
  pollTask()
}

const VIDEO_PAGE_SIZE = 30
const videoHistoryOffset = ref(0)
const hasMoreVideoHistory = ref(true)
const loadingMoreVideoHistory = ref(false)

async function loadHistory(reset = true) {
  if (!reset && (!hasMoreVideoHistory.value || loadingMoreVideoHistory.value)) return
  
  try {
    const token = localStorage.getItem('token')

    if (!token) {
      history.value = []
      return
    }

    if (reset) {
      videoHistoryOffset.value = 0
      hasMoreVideoHistory.value = true
    }
    
    loadingMoreVideoHistory.value = true

    const response = await fetch(`/api/videos/history?limit=${VIDEO_PAGE_SIZE}&offset=${videoHistoryOffset.value}`, {
      headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    })

    if (!response.ok) return

    const data = await response.json()
    hasMoreVideoHistory.value = data.hasMore !== false && (data.videos || []).length === VIDEO_PAGE_SIZE

    const EIGHTY_MINUTES = 80 * 60 * 1000
    const now = Date.now()

    const allVideos = data.videos || []

    const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000
    const videos = allVideos.map(item => {
      const video = {
        ...item,
        task_id: item.task_id || item.id,
        created_at: item.created_at || item.created
      }

      const createdAt = video.created_at || 0
      const elapsed = now - createdAt
      const isOffPeakTask = video.off_peak === 1 || video.off_peak === true
      const maxTime = isOffPeakTask ? FORTY_EIGHT_HOURS : EIGHTY_MINUTES

      if (elapsed > maxTime && isProcessingStatus(video.status)) {
        video.status = 'timeout'
        video.progress = '生成超时'
        video.fail_reason = isOffPeakTask ? '错峰模式生成超时（48小时）' : '生成超时（超过80分钟），未扣除积分'
      }

      return video
    })

    if (reset) {
      history.value = videos
    } else {
      const existingIds = new Set(history.value.map(v => v.id))
      const uniqueNew = videos.filter(v => !existingIds.has(v.id))
      history.value = [...history.value, ...uniqueNew]
    }
    
    videoHistoryOffset.value += videos.length

    if (gallery.value.length === 0 && videos.length > 0) {
      const latestActive = videos.find(v => isProcessingStatus(v.status)) || videos.find(v => v.status === 'SUCCESS')
      if (latestActive) {
        gallery.value = [latestActive]
      }
    }
    console.log('[VideoGeneration] 历史记录已加载，输出库显示:', gallery.value.length, '条')

    // 对 history 中的未完成任务启动轮询（且未超时）- 限制数量
    // 错峰模式任务允许48小时，普通任务80分钟
    const MAX_POLLING_TASKS = 5
    const pendingTasks = videos.filter(item => {
      const createdAt = item.created_at || 0
      const elapsed = now - createdAt
      const isOffPeakTask = item.off_peak === 1 || item.off_peak === true
      const maxTime = isOffPeakTask ? FORTY_EIGHT_HOURS : EIGHTY_MINUTES
      return isProcessingStatus(item.status) && elapsed <= maxTime
    }).slice(0, MAX_POLLING_TASKS)

    console.log('[VideoGeneration] 未完成任务数:', pendingTasks.length, '个(已限制最多', MAX_POLLING_TASKS, '个)')

    pendingTasks.forEach(task => {
      if (task.task_id) {
        const isOffPeakTask = task.off_peak === 1 || task.off_peak === true
        console.log('[VideoGeneration] 启动轮询:', task.task_id, '错峰模式:', isOffPeakTask)
        startPolling(task.task_id, isOffPeakTask, task.created_at)
      }
    })
  } catch (e) {
    console.error('[VideoGeneration] 加载历史记录失败:', e)
  } finally {
    loadingMoreVideoHistory.value = false
  }
}

function loadMoreVideoHistory() {
  loadHistory(false)
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

// 🔧 修复：使用 smartDownload 统一下载，解决跨域和扩展名不匹配问题
async function downloadVideo(item) {
  if (!item?.video_url) return
  try {
    // 如果有备注，将备注添加到文件名开头（移除特殊字符）
    const notePrefix = item.note ? item.note.replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '_').slice(0, 30) + '_' : ''
    const promptPart = (item.prompt || 'video').slice(0, 20).replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '_')
    const filename = `${notePrefix}${promptPart}.mp4`
    
    const { smartDownload } = await import('@/api/client')
    await smartDownload(item.video_url, filename)
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
  // HD 选项已弃用，始终关闭
  if (hd.value) {
    hd.value = false
  }
  
  // 切换到非 Vidu 模型时自动关闭错峰模式
  const modelCfg = availableModels.value.find(m => m.value === newModel)
  const isVidu = modelCfg?.apiType === 'vidu' || newModel.toLowerCase().includes('vidu')
  if (!isVidu && offPeak.value) {
    offPeak.value = false
  }

  // 切换到 Seedance 模型时重置模式为文生视频，切换离开时清空 Seedance 文件
  const isSeedance = modelCfg?.apiType === 'seedance-2.0'
  if (isSeedance) {
    seedanceMode.value = 'text2video'
    seedanceResolution.value = '720p'
    seedanceRatio.value = 'adaptive'
    seedanceDuration.value = 5
    seedanceGenerateAudio.value = true
    seedanceWebSearch.value = false
    seedanceWatermark.value = false
  } else {
    clearSeedanceFiles()
  }
  
  // VEO3模型不需要时长选项（固定 8 秒）
  if (VEO3_MODELS.includes(newModel)) {
    console.log('[VideoGeneration] VEO3模型不支持时长选择，固定8秒')
    // 如果上传的图片数量超过VEO3限制，提示用户
    const maxImages = (newModel === 'veo3.1-components' || newModel === 'veo3.1-components-4k') ? 3 : 2
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
  await loadHistory()

  // 选择一个启用的默认模型（从配置动态获取）
  const enabledModels = availableModels.value
  if (enabledModels.length > 0 && !enabledModels.find(m => m.value === model.value)) {
    model.value = enabledModels[0].value
    console.log('[VideoGeneration] 自动选择启用的模型:', model.value)
  }

  // 确保 aspectRatio 有效（在可用选项中）
  const availableRatioValues = availableAspectRatios.value.map(ar => ar.value)
  if (availableRatioValues.length > 0 && !availableRatioValues.includes(aspectRatio.value)) {
    aspectRatio.value = availableRatioValues[0]
    console.log('[VideoGeneration] 画面方向已初始化为:', aspectRatio.value)
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
  clearSeedanceFiles()
})
</script>

<template>
  <!-- 主容器 - 两栏布局（左侧控制面板 + 中间输出区，右侧抽屉独立） -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      
      <!-- 左侧控制面板 -->
      <div class="lg:col-span-3">
        <div class="card p-5 sticky top-24">
          <!-- 模式切换标签（非 Seedance 模型时显示） -->
          <div v-if="!isSeedanceModel" class="flex bg-slate-100 dark:bg-dark-700 rounded-xl p-1 mb-5">
            <button 
              @click="mode = 'image'" 
              :class="mode === 'image' 
                ? 'bg-white dark:bg-dark-600 shadow-md text-gray-800 dark:text-gray-200' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
              class="flex-1 flex items-center justify-center space-x-2 rounded-lg transition-all duration-200 font-medium py-3 px-4"
            >
              <span class="text-xl">🎬</span>
              <span class="text-sm">图生视频</span>
            </button>
            <button 
              @click="mode = 'text'" 
              :class="mode === 'text' 
                ? 'bg-white dark:bg-dark-600 shadow-md text-gray-800 dark:text-gray-200' 
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

            <!-- 画面比例/方向 - 从模型配置动态获取（非 Seedance 模型） -->
            <div v-if="!isSeedanceModel">
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

            <!-- 视频长度（VEO3模型和Seedance模型不显示） -->
            <div v-if="!isVeo3Model && !isSeedanceModel">
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

            <!-- Vidu 错峰模式开关 -->
            <div v-if="isViduModel">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>🌙</span>
                <span>错峰模式</span>
              </label>
              <div class="flex items-center space-x-3 p-2.5 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800/30 dark:to-gray-900/30 border border-gray-300 dark:border-gray-700 rounded-lg">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" v-model="offPeak" class="sr-only peer" />
                  <div class="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gray-400 dark:peer-focus:ring-gray-600 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-gray-600"></div>
                </label>
                <div class="flex-1">
                  <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {{ offPeak ? '已开启' : '已关闭' }}
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400 opacity-80">
                    {{ offPeak ? '享受错峰优惠，生成时间可能稍长' : '开启后可享受积分折扣' }}
                  </p>
                </div>
              </div>
            </div>
            
            <!-- Vidu 清晰度选择 -->
            <div v-if="isViduModel">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>📺</span>
                <span>清晰度</span>
              </label>
              <div class="flex space-x-2">
                <button
                  type="button"
                  @click="resolution = '720p'"
                  :class="[
                    'flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-all',
                    resolution === '720p'
                      ? 'bg-white text-black border-white dark:bg-gray-200 dark:text-black dark:border-gray-200'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-gray-400'
                  ]"
                >
                  720P
                  <span v-if="currentModelConfig?.resolution720Discount" class="ml-1 text-xs opacity-80">
                    ({{ Math.round(currentModelConfig.resolution720Discount * 100) }}%价格)
                  </span>
                </button>
                <button
                  type="button"
                  @click="resolution = '1080p'"
                  :class="[
                    'flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-all',
                    resolution === '1080p'
                      ? 'bg-white text-black border-white dark:bg-gray-200 dark:text-black dark:border-gray-200'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-gray-400'
                  ]"
                >
                  1080P
                </button>
              </div>
            </div>
            
            <!-- VEO3模型提示（仅在图生视频模式下显示） -->
            <div v-if="isVeo3Model && mode === 'image'" class="p-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg">
              <p class="text-xs text-gray-700 dark:text-gray-300">
                <span class="font-semibold">{{ getModelName(model) }}</span> 
                <span v-if="model === 'veo3.1-components' || model === 'veo3.1-components-4k'">支持最多 3 张参考图</span>
                <span v-else>支持最多 2 张参考图（首尾帧），固定生成 8 秒视频</span>
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
                  <input type="checkbox" v-model="hd" class="rounded accent-gray-600" />
                  <span>HD 高清 (+{{ formatPoints(pointsCostConfig.hd_extra) }}积分)</span>
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

            <!-- ========== Seedance 2.0 模式选择 ========== -->
            <div v-if="isSeedanceModel" class="space-y-3">
              <!-- 模式选择区域（可展开/折叠） -->
              <div class="border border-slate-200 dark:border-dark-600 rounded-lg overflow-hidden">
                <button
                  type="button"
                  @click="seedanceModeOpen = !seedanceModeOpen"
                  class="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-dark-700 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
                >
                  <span class="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>🎬</span>
                    <span>生成模式</span>
                    <span class="ml-1 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                      {{ SEEDANCE_MODES.find(m => m.value === seedanceMode)?.label }}
                    </span>
                  </span>
                  <svg
                    class="w-4 h-4 text-slate-500 transition-transform duration-200"
                    :class="{ 'rotate-180': seedanceModeOpen }"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  v-show="seedanceModeOpen"
                  class="px-3 py-2.5 border-t border-slate-200 dark:border-dark-600"
                >
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="m in seedanceAvailableModes"
                      :key="m.value"
                      type="button"
                      @click="seedanceMode = m.value"
                      :class="[
                        'px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150',
                        seedanceMode === m.value
                          ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200 shadow-sm'
                          : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-gray-400 dark:hover:border-gray-500'
                      ]"
                    >
                      <span class="mr-1">{{ m.icon }}</span>{{ m.label }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Seedance 动态上传区域 -->

              <!-- 首帧图片上传（image2video_first / image2video_first_last） -->
              <div v-if="seedanceMode === 'image2video_first' || seedanceMode === 'image2video_first_last'">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  <span>🖼️</span><span>首帧图片</span>
                </label>
                <div v-if="!seedanceFirstFrameFile" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceFirstFrameInputRef?.click()">
                  <div class="text-2xl mb-1">📤</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">点击上传首帧图片</p>
                  <input ref="seedanceFirstFrameInputRef" type="file" accept="image/*" @change="handleSeedanceFirstFrame" class="hidden" />
                </div>
                <div v-else class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                  <img :src="seedanceFirstFramePreview" class="w-12 h-12 object-cover rounded flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-slate-700 dark:text-slate-300 truncate">{{ seedanceFirstFrameFile.name }}</p>
                    <p class="text-xs text-slate-500">{{ (seedanceFirstFrameFile.size / 1024 / 1024).toFixed(2) }} MB</p>
                  </div>
                  <button @click="removeSeedanceFirstFrame" class="w-6 h-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 flex items-center justify-center text-xs">✕</button>
                </div>
              </div>

              <!-- 尾帧图片上传（image2video_first_last） -->
              <div v-if="seedanceMode === 'image2video_first_last'">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  <span>🖼️</span><span>尾帧图片</span>
                </label>
                <div v-if="!seedanceLastFrameFile" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceLastFrameInputRef?.click()">
                  <div class="text-2xl mb-1">📤</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">点击上传尾帧图片</p>
                  <input ref="seedanceLastFrameInputRef" type="file" accept="image/*" @change="handleSeedanceLastFrame" class="hidden" />
                </div>
                <div v-else class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                  <img :src="seedanceLastFramePreview" class="w-12 h-12 object-cover rounded flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-slate-700 dark:text-slate-300 truncate">{{ seedanceLastFrameFile.name }}</p>
                    <p class="text-xs text-slate-500">{{ (seedanceLastFrameFile.size / 1024 / 1024).toFixed(2) }} MB</p>
                  </div>
                  <button @click="removeSeedanceLastFrame" class="w-6 h-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 flex items-center justify-center text-xs">✕</button>
                </div>
              </div>

              <!-- 多模态参考图片（multimodal_ref / video_edit） -->
              <div v-if="seedanceMode === 'multimodal_ref' || seedanceMode === 'video_edit'">
                <div class="flex items-center justify-between mb-1.5">
                  <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>🖼️</span><span>参考图片</span>
                  </label>
                  <span class="text-xs text-slate-500">{{ seedanceRefImages.length + seedanceRefImageUrls.length }} / {{ seedanceMode === 'multimodal_ref' ? 9 : 1 }}</span>
                </div>
                <!-- URL 输入 -->
                <div v-if="(seedanceRefImages.length + seedanceRefImageUrls.length) < (seedanceMode === 'multimodal_ref' ? 9 : 1)" class="flex gap-1.5 mb-1.5">
                  <input v-model="seedanceRefImageUrl" type="text" placeholder="粘贴图片 URL" class="flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-gray-400" @keydown.enter.prevent="addSeedanceRefImageUrl" />
                  <button @click="addSeedanceRefImageUrl" :disabled="!seedanceRefImageUrl.trim()" class="px-2 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-200 dark:text-gray-900">添加</button>
                </div>
                <!-- 已添加的 URL 列表 -->
                <div v-if="seedanceRefImageUrls.length > 0" class="space-y-1 mb-1.5">
                  <div v-for="(url, idx) in seedanceRefImageUrls" :key="'img-url-'+idx" class="flex items-center gap-2 px-2 py-1 bg-slate-50 dark:bg-dark-700 rounded text-xs border border-slate-200 dark:border-dark-600">
                    <span class="text-blue-500 flex-shrink-0">🔗</span>
                    <span class="flex-1 truncate text-slate-600 dark:text-slate-400">{{ url }}</span>
                    <button @click="removeSeedanceRefImageUrl(idx)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center justify-center text-xs flex-shrink-0">✕</button>
                  </div>
                </div>
                <!-- 文件上传分隔 -->
                <div v-if="(seedanceRefImages.length + seedanceRefImageUrls.length) < (seedanceMode === 'multimodal_ref' ? 9 : 1)" class="flex items-center gap-2 mb-1.5">
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                  <span class="text-xs text-slate-400">或</span>
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                </div>
                <div v-if="(seedanceRefImages.length + seedanceRefImageUrls.length) < (seedanceMode === 'multimodal_ref' ? 9 : 1)" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceRefImageInputRef?.click()">
                  <div class="text-2xl mb-1">📤</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">点击上传参考图片</p>
                  <input ref="seedanceRefImageInputRef" type="file" accept="image/*" multiple @change="handleSeedanceRefImages" class="hidden" />
                </div>
                <div v-if="seedanceRefImagePreviews.length > 0" class="space-y-1.5 mt-1.5 max-h-36 overflow-y-auto">
                  <div v-for="(url, idx) in seedanceRefImagePreviews" :key="idx" class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-1.5 border border-slate-200 dark:border-dark-600">
                    <img :src="url" class="w-10 h-10 object-cover rounded flex-shrink-0" />
                    <span class="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{{ seedanceRefImages[idx]?.name }}</span>
                    <button @click="removeSeedanceRefImage(idx)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center justify-center text-xs">✕</button>
                  </div>
                </div>
              </div>

              <!-- 参考视频上传（multimodal_ref / video_edit / video_extend） -->
              <div v-if="seedanceMode === 'multimodal_ref' || seedanceMode === 'video_edit' || seedanceMode === 'video_extend'">
                <div class="flex items-center justify-between mb-1.5">
                  <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>🎥</span><span>参考视频</span>
                  </label>
                  <span class="text-xs text-slate-500">{{ seedanceRefVideos.length + seedanceRefVideoUrls.length }} / 3</span>
                </div>
                <!-- URL 输入 -->
                <div v-if="(seedanceRefVideos.length + seedanceRefVideoUrls.length) < 3" class="flex gap-1.5 mb-1.5">
                  <input v-model="seedanceRefVideoUrl" type="text" placeholder="粘贴视频 URL" class="flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-gray-400" @keydown.enter.prevent="addSeedanceRefVideoUrl" />
                  <button @click="addSeedanceRefVideoUrl" :disabled="!seedanceRefVideoUrl.trim()" class="px-2 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-200 dark:text-gray-900">添加</button>
                </div>
                <!-- 已添加的 URL 列表 -->
                <div v-if="seedanceRefVideoUrls.length > 0" class="space-y-1 mb-1.5">
                  <div v-for="(url, idx) in seedanceRefVideoUrls" :key="'vid-url-'+idx" class="flex items-center gap-2 px-2 py-1 bg-slate-50 dark:bg-dark-700 rounded text-xs border border-slate-200 dark:border-dark-600">
                    <span class="text-blue-500 flex-shrink-0">🔗</span>
                    <span class="flex-1 truncate text-slate-600 dark:text-slate-400">{{ url }}</span>
                    <button @click="removeSeedanceRefVideoUrl(idx)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center justify-center text-xs flex-shrink-0">✕</button>
                  </div>
                </div>
                <!-- 文件上传分隔 -->
                <div v-if="(seedanceRefVideos.length + seedanceRefVideoUrls.length) < 3" class="flex items-center gap-2 mb-1.5">
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                  <span class="text-xs text-slate-400">或</span>
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                </div>
                <div v-if="(seedanceRefVideos.length + seedanceRefVideoUrls.length) < 3" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceRefVideoInputRef?.click()">
                  <div class="text-2xl mb-1">🎥</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">点击上传视频 (mp4/mov, 最大50MB)</p>
                  <input ref="seedanceRefVideoInputRef" type="file" accept="video/mp4,video/quicktime" multiple @change="handleSeedanceRefVideos" class="hidden" />
                </div>
                <div v-if="seedanceRefVideoPreviews.length > 0" class="space-y-1.5 mt-1.5">
                  <div v-for="(vp, idx) in seedanceRefVideoPreviews" :key="idx" class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                    <div class="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                      <span class="text-lg">🎬</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs text-slate-700 dark:text-slate-300 truncate">{{ vp.name }}</p>
                      <p class="text-xs text-slate-500">{{ vp.size }} MB</p>
                    </div>
                    <button @click="removeSeedanceRefVideo(idx)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center justify-center text-xs">✕</button>
                  </div>
                </div>
              </div>

              <!-- 参考音频上传（multimodal_ref） -->
              <div v-if="seedanceMode === 'multimodal_ref'">
                <div class="flex items-center justify-between mb-1.5">
                  <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>🔊</span><span>参考音频</span>
                  </label>
                  <span class="text-xs text-slate-500">{{ seedanceRefAudios.length + seedanceRefAudioUrls.length }} / 3</span>
                </div>
                <!-- URL 输入 -->
                <div v-if="(seedanceRefAudios.length + seedanceRefAudioUrls.length) < 3" class="flex gap-1.5 mb-1.5">
                  <input v-model="seedanceRefAudioUrl" type="text" placeholder="粘贴音频 URL" class="flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-gray-400" @keydown.enter.prevent="addSeedanceRefAudioUrl" />
                  <button @click="addSeedanceRefAudioUrl" :disabled="!seedanceRefAudioUrl.trim()" class="px-2 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-200 dark:text-gray-900">添加</button>
                </div>
                <!-- 已添加的 URL 列表 -->
                <div v-if="seedanceRefAudioUrls.length > 0" class="space-y-1 mb-1.5">
                  <div v-for="(url, idx) in seedanceRefAudioUrls" :key="'aud-url-'+idx" class="flex items-center gap-2 px-2 py-1 bg-slate-50 dark:bg-dark-700 rounded text-xs border border-slate-200 dark:border-dark-600">
                    <span class="text-blue-500 flex-shrink-0">🔗</span>
                    <span class="flex-1 truncate text-slate-600 dark:text-slate-400">{{ url }}</span>
                    <button @click="removeSeedanceRefAudioUrl(idx)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center justify-center text-xs flex-shrink-0">✕</button>
                  </div>
                </div>
                <!-- 文件上传分隔 -->
                <div v-if="(seedanceRefAudios.length + seedanceRefAudioUrls.length) < 3" class="flex items-center gap-2 mb-1.5">
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                  <span class="text-xs text-slate-400">或</span>
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                </div>
                <div v-if="(seedanceRefAudios.length + seedanceRefAudioUrls.length) < 3" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceRefAudioInputRef?.click()">
                  <div class="text-2xl mb-1">🎵</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">点击上传音频 (wav/mp3, 最大15MB)</p>
                  <input ref="seedanceRefAudioInputRef" type="file" accept="audio/wav,audio/mpeg,audio/mp3" multiple @change="handleSeedanceRefAudios" class="hidden" />
                </div>
                <div v-if="seedanceRefAudioPreviews.length > 0" class="space-y-1.5 mt-1.5">
                  <div v-for="(ap, idx) in seedanceRefAudioPreviews" :key="idx" class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                    <div class="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                      <span class="text-sm">🎵</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs text-slate-700 dark:text-slate-300 truncate">{{ ap.name }}</p>
                      <p class="text-xs text-slate-500">{{ ap.size }} MB</p>
                    </div>
                    <button @click="removeSeedanceRefAudio(idx)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center justify-center text-xs">✕</button>
                  </div>
                </div>
              </div>

              <!-- Seedance 高级设置（可展开/折叠） -->
              <div class="border border-slate-200 dark:border-dark-600 rounded-lg overflow-hidden">
                <button
                  type="button"
                  @click="seedanceAdvancedOpen = !seedanceAdvancedOpen"
                  class="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-dark-700 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
                >
                  <span class="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>⚙️</span><span>高级设置</span>
                  </span>
                  <svg
                    class="w-4 h-4 text-slate-500 transition-transform duration-200"
                    :class="{ 'rotate-180': seedanceAdvancedOpen }"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div v-show="seedanceAdvancedOpen" class="px-3 py-3 border-t border-slate-200 dark:border-dark-600 space-y-3">
                  <!-- 分辨率 -->
                  <div>
                    <label class="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">分辨率</label>
                    <div class="flex space-x-2">
                      <button type="button" @click="seedanceResolution = '480p'"
                        :class="['flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-all', seedanceResolution === '480p' ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200' : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-gray-400']">
                        480p
                      </button>
                      <button type="button" @click="seedanceResolution = '720p'"
                        :class="['flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-all', seedanceResolution === '720p' ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200' : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-gray-400']">
                        720p
                      </button>
                    </div>
                  </div>
                  <!-- 宽高比 -->
                  <div>
                    <label class="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">宽高比</label>
                    <select v-model="seedanceRatio" class="input text-xs">
                      <option v-for="r in SEEDANCE_RATIOS" :key="r.value" :value="r.value">{{ r.label }}</option>
                    </select>
                  </div>
                  <!-- 时长滑块 -->
                  <div>
                    <label class="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                      <span>时长</span>
                      <span class="text-gray-700 dark:text-gray-300 font-semibold">{{ seedanceDuration }} 秒</span>
                    </label>
                    <input type="range" v-model.number="seedanceDuration" min="4" max="15" step="1"
                      class="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-gray-600" />
                    <div class="flex justify-between text-xs text-slate-400 mt-0.5">
                      <span>4s</span><span>15s</span>
                    </div>
                  </div>
                  <!-- 开关选项 -->
                  <div class="space-y-2">
                    <!-- 联网搜索增强（仅文生视频） -->
                    <label v-if="seedanceMode === 'text2video'" class="flex items-center justify-between cursor-pointer">
                      <span class="text-xs text-slate-600 dark:text-slate-400">🌐 联网搜索增强</span>
                      <div class="relative inline-flex items-center">
                        <input type="checkbox" v-model="seedanceWebSearch" class="sr-only peer" />
                        <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-gray-600"></div>
                      </div>
                    </label>
                    <!-- 水印 -->
                    <label class="flex items-center justify-between cursor-pointer">
                      <span class="text-xs text-slate-600 dark:text-slate-400">💧 水印</span>
                      <div class="relative inline-flex items-center">
                        <input type="checkbox" v-model="seedanceWatermark" class="sr-only peer" />
                        <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-gray-600"></div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 图生视频上传区域（非 Seedance 模型时显示） -->
            <div v-if="mode === 'image' && !isSeedanceModel" class="space-y-2.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>🖼️</span>
                  <span>上传参考图片</span>
                </label>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  <span class="font-semibold text-gray-700 dark:text-gray-300">{{ imageFiles.length }}</span> / {{ maxImagesForModel }}张
                </div>
              </div>
              
              <!-- 图片数量超限提示 -->
              <div v-if="imageFiles.length > maxImagesForModel" class="p-2 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg">
                <p class="text-xs text-gray-700 dark:text-gray-300">
                  ⚠️ 当前模型最多支持 {{ maxImagesForModel }} 张图片，请删除多余图片或切换模型
                </p>
              </div>
              
              <!-- 拖拽区域 -->
              <div 
                v-if="imageFiles.length < maxImagesForModel"
                @dragover="onDragOver"
                @dragleave="onDragLeave"
                @drop="onDrop"
                :class="{ 'border-gray-500 bg-gray-50 dark:bg-gray-800/30': isDragging }"
                class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-4 text-center transition-colors cursor-pointer hover:border-gray-400"
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
                    <div class="flex-shrink-0 w-6 h-6 bg-gray-200 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-full flex items-center justify-center text-xs font-bold">
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
                <span class="ml-2 text-sm opacity-90">(消耗{{ formatPoints(currentPointsCost) }}积分)</span>
              </span>
            </button>

            <!-- 并发限制提示 -->
            <div v-if="me" class="text-center">
              <p class="text-xs text-slate-500 dark:text-slate-400">
                <span v-if="userPackageInfo.hasPackage" class="text-gray-700 dark:text-gray-300">
                  ⚡ VIP用户
                </span>
                <span v-else class="text-slate-600 dark:text-slate-400">
                  👤 普通用户
                </span>
                <span class="mx-1">·</span>
                <span>最多支持 <span class="font-semibold text-gray-700 dark:text-gray-300">{{ me.concurrent_limit || 1 }}</span> 条并发任务</span>
              </p>
            </div>

            <!-- 未登录提示 -->
            <div v-if="!me" class="p-3 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800/30 dark:to-gray-900/30 border border-gray-300 dark:border-gray-700 rounded-lg">
              <div class="flex items-start space-x-2">
                <span class="text-lg">🎁</span>
                <div class="flex-1">
                  <p class="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1">
                    注册即送积分！
                  </p>
                  <p class="text-xs text-gray-700 dark:text-gray-400">
                    新用户注册可获得奖励积分，立即开始创作吧～
                  </p>
                  <a 
                    href="/" 
                    class="mt-2 inline-block px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white text-xs rounded-md transition-colors font-medium"
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
                  class="ml-2 px-3 py-1 bg-gray-700 hover:bg-gray-800 text-white text-xs rounded-md transition-colors whitespace-nowrap"
                >
                  立即登录
                </a>
                <!-- 如果是并发限制错误且是普通用户，显示升级按钮 -->
                <a 
                  v-else-if="error.includes('如需多并发') && !userPackageInfo.hasPackage"
                  href="/packages" 
                  class="ml-2 px-3 py-1 bg-gray-700 hover:bg-gray-800 text-white text-xs rounded-md transition-colors whitespace-nowrap"
                >
                  升级套餐
                </a>
              </p>
            </div>

            <!-- 成功提示 -->
            <div v-if="successMessage" class="p-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg">
              <p class="text-xs text-gray-700 dark:text-gray-300 flex items-center">
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
              <span class="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-full text-xs font-semibold">
                {{ gallery.length }}
              </span>
            </h2>
            <button 
              @click="loadHistory" 
              class="text-sm text-gray-600 dark:text-gray-400 hover:underline"
            >
              刷新
            </button>
          </div>

          <!-- 空状态 - 开始创作 -->
          <div v-if="gallery.length === 0" class="text-center py-20">
            <div class="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 rounded-2xl flex items-center justify-center shadow-lg">
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
                class="rounded-lg overflow-hidden bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-800/40 dark:via-gray-900/40 dark:to-gray-800/40 aspect-video relative">
                <!-- 动态背景动效 -->
                <div class="absolute inset-0 bg-gradient-to-br from-gray-200/50 via-gray-100/50 to-gray-200/50 dark:from-gray-700/20 dark:via-gray-800/20 dark:to-gray-700/20 animate-pulse"></div>
                
                <!-- 装饰性闪光元素 -->
                <div class="absolute inset-0 overflow-hidden opacity-30">
                  <div class="absolute top-1/4 left-1/4 w-32 h-32 bg-gray-300 dark:bg-gray-500/30 rounded-full blur-3xl animate-blob"></div>
                  <div class="absolute top-1/3 right-1/4 w-32 h-32 bg-gray-400 dark:bg-gray-400/30 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
                  <div class="absolute bottom-1/4 left-1/3 w-32 h-32 bg-gray-300 dark:bg-gray-500/30 rounded-full blur-3xl animate-blob animation-delay-4000"></div>
                </div>
                
                <div class="absolute inset-0 flex flex-col items-center justify-center z-10">
                  <!-- 旋转加载图标 -->
                  <svg class="animate-spin h-16 w-16 text-gray-500 mb-3 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  
                  <p class="text-slate-700 dark:text-slate-200 text-base font-bold mb-2">正在生成精彩视频...</p>
                  <p v-if="item.progress" class="text-gray-600 dark:text-gray-400 text-sm font-semibold mb-3 animate-pulse">{{ item.progress }}</p>
                  <p v-else class="text-slate-500 dark:text-slate-400 text-sm mb-3">AI正在为您创作中...</p>
                  
                  <!-- 进度条效果 -->
                  <div class="w-48 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-gray-400 via-gray-500 to-gray-400 rounded-full animate-loading-bar"></div>
                  </div>
                  
                  <p class="text-gray-500 dark:text-gray-400 text-xs mt-4 font-medium px-6 text-center">
                    ✨ 视频生成需要一定时间，您可以继续创作新视频
                  </p>
                </div>
              </div>
              
              <!-- 失败状态 -->
              <div v-else-if="isFailedStatus(item.status)" 
                class="rounded-lg overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/40 dark:to-gray-700/40 aspect-video relative">
                <div class="absolute inset-0 flex flex-col items-center justify-center p-4">
                  <div class="text-4xl mb-3">{{ isContentSafetyMsg(item.fail_reason) ? '🛡️' : item.status === 'timeout' ? '⏱️' : '❌' }}</div>
                  <p class="text-base font-semibold text-center" :class="isContentSafetyMsg(item.fail_reason) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'">{{ formatStatus(item.status) }}</p>
                  <p v-if="item.fail_reason" class="text-xs mt-2 text-center opacity-75" :class="isContentSafetyMsg(item.fail_reason) ? 'text-amber-500 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'">{{ item.fail_reason }}</p>
                  <p v-if="isContentSafetyMsg(item.fail_reason)" class="text-xs mt-1 text-center text-gray-500 dark:text-gray-400">请修改提示词或更换参考图片后重试</p>
                  <p v-else-if="item.status === 'timeout'" class="text-xs mt-1 text-center text-gray-500 dark:text-gray-400">生成时间过长，请稍后重试或简化提示词</p>
                  <p v-else-if="!item.fail_reason" class="text-gray-500 dark:text-gray-400 text-xs mt-2 text-center opacity-75">请稍后重试</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-3 font-medium">✓ 未扣除积分</p>
                </div>
              </div>
              
              <!-- 完成状态 -->
              <div v-else 
                class="rounded-lg overflow-hidden bg-black aspect-video relative cursor-pointer group" 
                @click="openVideoModal(item)"
              >
                <img
                  v-if="item.video_url && (item.cover_url || item.thumbnail_url)"
                  :src="item.cover_url || item.thumbnail_url"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
                <div
                  v-else-if="item.video_url"
                  class="w-full h-full bg-gray-900 flex items-center justify-center"
                >
                  <svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
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
                    class="w-full px-2 py-1 text-xs bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 rounded focus:outline-none focus:ring-1 focus:ring-gray-500 text-slate-600 dark:text-slate-300 placeholder-slate-400"
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
            class="relative bg-gray-700 hover:bg-gray-800 text-white rounded-l-2xl shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center"
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
              <div class="w-9 h-9 bg-gradient-to-br from-gray-500 to-gray-600 rounded-full flex items-center justify-center text-white shadow-md">
                <span class="text-lg">🎬</span>
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center">
                  历史记录
                  <span class="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-full text-xs font-semibold">
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
              class="group bg-white dark:bg-dark-800 rounded-xl p-3 border border-slate-200 dark:border-dark-700 hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 hover:shadow-lg"
            >
              <!-- 视频预览 -->
              <div 
                class="relative w-full aspect-video rounded-lg overflow-hidden cursor-pointer mb-3 group-hover:ring-2 group-hover:ring-gray-400 transition-all" 
                :class="item.video_url ? 'bg-black' : 'bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-800/40 dark:via-gray-900/40 dark:to-gray-800/40'"
                @click="openVideoModal(item)"
              >
                <img
                  v-if="item.video_url && (item.cover_url || item.thumbnail_url)"
                  :src="item.cover_url || item.thumbnail_url"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
                <div
                  v-else-if="item.video_url"
                  class="w-full h-full bg-gray-900 flex items-center justify-center"
                >
                  <svg class="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <!-- 生成中状态 -->
                <div v-else-if="isProcessingStatus(item.status)" class="absolute inset-0 flex flex-col items-center justify-center">
                  <!-- 动态背景 -->
                  <div class="absolute inset-0 bg-gradient-to-br from-gray-200/50 via-gray-100/50 to-gray-200/50 dark:from-gray-700/20 dark:via-gray-800/20 dark:to-gray-700/20 animate-pulse"></div>
                  
                  <!-- 内容 -->
                  <div class="relative z-10 text-center">
                    <!-- 加载旋转图标 -->
                    <svg class="animate-spin h-10 w-10 text-gray-500 mb-2 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p class="text-xs text-slate-700 dark:text-slate-300 font-semibold">正在生成中...</p>
                    <p v-if="item.progress" class="text-xs text-gray-600 dark:text-gray-400 mt-1 animate-pulse">{{ item.progress }}</p>
                    <p v-else class="text-xs text-slate-500 dark:text-slate-400 mt-1 opacity-75">AI正在创作中</p>
                  </div>
                </div>
                <!-- 失败状态 -->
                <div v-else-if="isFailedStatus(item.status)" class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/40 dark:to-gray-700/40">
                  <div class="text-3xl mb-2">{{ isContentSafetyMsg(item.fail_reason) ? '🛡️' : item.status === 'timeout' ? '⏱️' : '❌' }}</div>
                  <p class="text-xs font-semibold" :class="isContentSafetyMsg(item.fail_reason) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'">{{ formatStatus(item.status) }}</p>
                  <p v-if="item.fail_reason" class="text-xs mt-1 text-center px-4 line-clamp-2" :class="isContentSafetyMsg(item.fail_reason) ? 'text-amber-500 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'">{{ item.fail_reason }}</p>
                  <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 font-medium">✓ 未扣除积分</p>
                </div>
                <!-- 其他未知状态 - 默认显示为等待中 -->
                <div v-else class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/40 dark:to-gray-900/40">
                  <svg class="animate-spin h-8 w-8 text-gray-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                    class="w-full px-2 py-1 text-xs bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 rounded focus:outline-none focus:ring-1 focus:ring-gray-500 text-slate-600 dark:text-slate-300 placeholder-slate-400"
                  />
                </div>

                <!-- 失败原因 -->
                <div v-if="isFailedStatus(item.status)" class="text-xs p-2 rounded space-y-1" :class="isContentSafetyMsg(item.fail_reason) ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-100 dark:bg-gray-800/50'">
                  <p v-if="item.fail_reason" :class="isContentSafetyMsg(item.fail_reason) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'">{{ item.fail_reason }}</p>
                  <p v-if="isContentSafetyMsg(item.fail_reason)" class="text-gray-500 dark:text-gray-400">请修改提示词或更换参考图片后重试</p>
                  <p v-else-if="item.status === 'timeout'" class="text-gray-500 dark:text-gray-400">生成时间过长，请稍后重试或简化提示词</p>
                  <p class="text-gray-600 dark:text-gray-400 font-medium">✓ 未扣除积分</p>
                </div>

                <!-- 操作按钮 -->
                <div class="flex items-center gap-2 pt-2">
                  <!-- 再次生成按钮 -->
                  <button 
                    class="w-10 h-8 rounded-lg bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
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
                    class="w-10 h-8 rounded-lg bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
                    @click="deleteHistory(item)"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
            
            <!-- 加载更多 -->
            <div v-if="hasMoreVideoHistory" class="py-4 flex justify-center">
              <button 
                v-if="!loadingMoreVideoHistory"
                @click="loadMoreVideoHistory"
                class="px-4 py-2 text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
              >
                加载更多
              </button>
              <div v-else class="flex items-center gap-2 text-xs text-slate-500">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                加载中...
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
  @apply w-full px-3 py-2 border border-slate-300 dark:border-dark-600 rounded-lg bg-white dark:bg-dark-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all;
}

.btn-primary {
  @apply bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-300 hover:scale-[1.02];
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



