<script setup>
/**
 * VideoNode.vue - 视频节点（统一设计）
 * 
 * 设计规范：
 * - 主体区域：空状态显示快捷操作，有输出显示视频预览
 * - 左侧(+)：可选参考图片输入（支持多图，如首帧/尾帧）
 * - 右侧(+)：输出连接
 * - 底部配置面板：选中时显示，包含提示词输入和生成参数
 */
import { ref, computed, inject, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { getTenantHeaders, isModelEnabled, getModelDisplayName, getApiUrl, getAvailableVideoModels } from '@/config/tenant'
import { uploadImages } from '@/api/canvas/nodes'
import { registerTask, subscribeTask, getTasksByNodeId, removeCompletedTask } from '@/stores/canvas/backgroundTaskManager'
import { useI18n } from '@/i18n'
import { showAlert, showInsufficientPointsDialog, showToast } from '@/composables/useCanvasDialog'
import VideoClipEditor from '@/components/canvas/VideoClipEditor.vue'
import KeyframeEditor from '@/components/canvas/KeyframeEditor.vue'

const { t, currentLanguage } = useI18n()

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals } = useVueFlow()

// 标签编辑状态
const isEditingLabel = ref(false)
const labelInputRef = ref(null)
const localLabel = ref(props.data.label || 'Video')

// 本地状态
const isGenerating = ref(false)
const errorMessage = ref('')
const promptText = ref(props.data.prompt || '')
const promptTextareaRef = ref(null)

// 模型下拉框状态
const isModelDropdownOpen = ref(false)

// 拖拽上传状态
const isDragOver = ref(false)
const dragCounter = ref(0)
const frameInputRef = ref(null)

// 图片列表拖拽排序状态
const dragSortIndex = ref(-1)
const dragOverIndex = ref(-1)

// 🚀 性能优化：画布拖拽状态（用于暂停视频播放）
const isCanvasDragging = ref(false)

// 生成模式：image（图生视频）, text（纯文本）
const generationMode = ref(props.data.generationMode || 'text')

// 获取默认模型（根据当前生成模式过滤后的第一个模型）
function getDefaultVideoModel(mode = 'text') {
  const allModels = getAvailableVideoModels()
  
  // 根据模式过滤模型
  const currentMode = mode === 'text' ? 't2v' : 'i2v'
  const filteredModels = allModels.filter(m => {
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
  
  return filteredModels.length > 0 ? filteredModels[0].value : 'sora2'
}

// 生成参数 - 默认使用根据当前生成模式过滤后的第一个模型
const selectedModel = ref(props.data.model || getDefaultVideoModel(props.data.generationMode || 'text'))
const selectedAspectRatio = ref(props.data.aspectRatio || '16:9')
const selectedDuration = ref(props.data.duration || '10')
const selectedCount = ref(props.data.count || 1)

// 生成次数选项循环：1 -> 2 -> 4 -> 1
const countOptions = [1, 2, 4]

// 用户最大并发数限制
const userConcurrentLimit = computed(() => {
  return userInfo?.value?.concurrent_limit || 1
})

// 切换生成次数
function toggleCount() {
  const currentIndex = countOptions.indexOf(selectedCount.value)
  const nextIndex = (currentIndex + 1) % countOptions.length
  const nextCount = countOptions[nextIndex]
  
  // 检查是否超过用户套餐限制
  if (nextCount > userConcurrentLimit.value) {
    alert(`您的套餐最大支持 ${userConcurrentLimit.value} 次并发，请升级套餐以使用更多并发`)
    return
  }
  
  selectedCount.value = nextCount
}

// 模型下拉框方法
const dropdownDirection = ref('down') // 'down' 或 'up'
const modelSelectorRef = ref(null)
const modelDropdownListRef = ref(null)

function toggleModelDropdown(event) {
  event.stopPropagation()

  // 计算下拉方向
  if (modelSelectorRef.value) {
    const rect = modelSelectorRef.value.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const dropdownHeight = 280 // 下拉列表的预估高度

    // 如果下方空间不足，则向上展开
    if (rect.bottom + dropdownHeight > viewportHeight && rect.top > dropdownHeight) {
      dropdownDirection.value = 'up'
    } else {
      dropdownDirection.value = 'down'
    }
  }

  isModelDropdownOpen.value = !isModelDropdownOpen.value
}

function selectModel(modelValue) {
  selectedModel.value = modelValue
  isModelDropdownOpen.value = false
}

function closeModelDropdown() {
  isModelDropdownOpen.value = false
}

// 点击外部关闭下拉框
function handleModelDropdownClickOutside(event) {
  const dropdown = event.target.closest('.model-selector-custom')
  if (!dropdown) {
    isModelDropdownOpen.value = false
  }
}

// 处理下拉列表的鼠标滚轮事件
function handleDropdownWheel(event) {
  event.stopPropagation()
  // 允许滚动事件正常传播到下拉列表，阻止传播到画布
}

// 自动调整提示词文本框高度
function autoResizeTextarea() {
  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  // 重置高度以获取正确的 scrollHeight
  textarea.style.height = 'auto'
  
  // 计算最小高度 (3行约63px) 和最大高度 (10行约210px)
  const minHeight = 63
  const maxHeight = 210
  const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))
  
  textarea.style.height = newHeight + 'px'
}

// 处理提示词框滚轮事件（阻止冒泡，让滚轮作用于文本框滚动条）
function handlePromptWheel(event) {
  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  // 检查是否有内容需要滚动
  const hasScroll = textarea.scrollHeight > textarea.clientHeight
  if (hasScroll) {
    // 阻止事件冒泡，让滚轮只作用于文本框
    event.stopPropagation()
  }
}

// 获取当前选中模型的显示名称
const selectedModelLabel = computed(() => {
  const model = models.value.find(m => m.value === selectedModel.value)
  return model ? model.label : selectedModel.value
})

// VEO3模型列表（不支持时长参数）
const VEO3_MODELS = ['veo3', 'veo3.1-fast', 'veo3.1-components', 'veo3.1', 'veo3.1-pro']

// 当前模型是否为VEO3系列（包括整合入口和所有子模型）
const isVeo3Model = computed(() => VEO3_MODELS.includes(selectedModel.value) || isVeoModel.value)

// Sora2模型列表（支持高级选项：trim、style、storyboard）
const SORA2_MODELS = ['sora2', 'sora2-pro', 'sora-2', 'sora-2-pro']

// 当前模型是否为Sora2系列
const isSora2Model = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  return modelName.includes('sora2') || modelName.includes('sora-2')
})

// Sora2 高级选项
const showSora2AdvancedOptions = ref(false)
const trimFirstFrame = ref(false)  // 是否去掉首帧
const storyboardMode = ref(false)  // 故事板模式
const selectedStyles = ref([])     // 选中的风格标签（英文值数组）

// Sora2 风格选项（支持多语言）
const SORA2_STYLE_OPTIONS = [
  { value: 'anime', labels: { 'zh-CN': '动漫', 'zh-TW': '動漫', 'en': 'Anime', 'ja': 'アニメ', 'ko': '애니메이션' } },
  { value: 'selfie', labels: { 'zh-CN': '自拍', 'zh-TW': '自拍', 'en': 'Selfie', 'ja': 'セルフィー', 'ko': '셀카' } },
  { value: 'golden', labels: { 'zh-CN': '金色', 'zh-TW': '金色', 'en': 'Golden', 'ja': 'ゴールデン', 'ko': '골든' } },
  { value: 'handheld', labels: { 'zh-CN': '手持', 'zh-TW': '手持', 'en': 'Handheld', 'ja': 'ハンドヘルド', 'ko': '핸드헬드' } },
  { value: 'festive', labels: { 'zh-CN': '节日', 'zh-TW': '節日', 'en': 'Festive', 'ja': 'フェスティブ', 'ko': '축제' } },
  { value: 'retro', labels: { 'zh-CN': '复古', 'zh-TW': '復古', 'en': 'Retro', 'ja': 'レトロ', 'ko': '레트로' } },
  { value: 'news', labels: { 'zh-CN': '新闻', 'zh-TW': '新聞', 'en': 'News', 'ja': 'ニュース', 'ko': '뉴스' } },
  { value: 'chaos', labels: { 'zh-CN': '混乱', 'zh-TW': '混亂', 'en': 'Chaos', 'ja': 'カオス', 'ko': '카오스' } },
  { value: 'vintage', labels: { 'zh-CN': '老式', 'zh-TW': '老式', 'en': 'Vintage', 'ja': 'ヴィンテージ', 'ko': '빈티지' } },
  { value: 'comic', labels: { 'zh-CN': '漫画', 'zh-TW': '漫畫', 'en': 'Comic', 'ja': 'コミック', 'ko': '만화' } }
]

// 获取当前语言的风格标签
const getStyleLabel = (style) => {
  const lang = currentLanguage.value || 'zh-CN'
  const langKey = lang.startsWith('zh') ? (lang.includes('TW') ? 'zh-TW' : 'zh-CN') : 
                  ['en', 'ja', 'ko'].includes(lang) ? lang : 'en'
  return style.labels[langKey] || style.labels['en']
}

// 切换风格标签选择
const toggleStyle = (styleValue) => {
  const index = selectedStyles.value.indexOf(styleValue)
  if (index > -1) {
    selectedStyles.value.splice(index, 1)
  } else {
    selectedStyles.value.push(styleValue)
  }
}

// 检查风格是否被选中
const isStyleSelected = (styleValue) => {
  return selectedStyles.value.includes(styleValue)
}

// ==================== Vidu 模型相关 ====================
// 当前模型是否为 Vidu 系列（原生 API，非腾讯 AIGC）
const isViduModel = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  const apiType = currentModelConfig.value?.apiType || ''
  // 腾讯 AIGC 的 Vidu 不支持原生 Vidu 的错峰、720P折扣等功能
  if (apiType === 'tencentaigc') return false
  return modelName.includes('vidu') || apiType === 'vidu'
})

// Vidu 图生视频模式选择
const viduMode = ref(props.data.viduMode || 'auto')  // auto, i2v, start-end, reference

// Vidu 错峰模式
const viduOffPeak = ref(props.data.viduOffPeak || false)

// Vidu 清晰度选择
const viduResolution = ref(props.data.viduResolution || '1080p')

// Vidu 模式选项
const VIDU_MODE_OPTIONS = [
  { value: 'auto', label: '自动选择', description: '根据图片数量自动选择', maxImages: 7 },
  { value: 'i2v', label: '首帧驱动', description: '单图生成视频', maxImages: 1 },
  { value: 'start-end', label: '首尾帧', description: '首帧到尾帧过渡', maxImages: 2, minImages: 2 },
  { value: 'reference', label: '多图参考', description: '综合多图元素创作', maxImages: 7 }
]

// ==================== Kling 模型相关 ====================
// 当前模型是否为 Kling（可灵）系列（原生 API，非腾讯 AIGC）
const isKlingModel = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  // 腾讯 AIGC 的 Kling 不支持原生 Kling 的摄像机控制等功能
  if (currentModelConfig.value?.apiType === 'tencentaigc') return false
  return modelName.includes('kling')
})

// 当前模型是否为腾讯 AIGC 模型
const isTencentAigcModel = computed(() => {
  return currentModelConfig.value?.apiType === 'tencentaigc'
})

// Kling 高级选项 - 摄像机控制
const showKlingAdvancedOptions = ref(false)
const klingCameraEnabled = ref(props.data.klingCameraEnabled || false)  // 是否启用摄像机控制
const klingCameraType = ref(props.data.klingCameraType || '')  // 运镜类型
const klingCameraConfig = ref(props.data.klingCameraConfig || 'horizontal')  // simple 模式下的配置类型（6选1）
const klingCameraValue = ref(props.data.klingCameraValue || 0)  // simple 模式下的数值 [-10, 10]

// Kling 运镜类型选项
const KLING_CAMERA_TYPES = [
  { value: '', label: '智能匹配', description: '根据文本/图片自动选择' },
  { value: 'simple', label: '简单运镜', description: '自定义单一方向运镜' },
  { value: 'down_back', label: '下移拉远', description: '镜头下压并后退' },
  { value: 'forward_up', label: '推进上移', description: '镜头前进并上仰' },
  { value: 'right_turn_forward', label: '右旋推进', description: '先右旋转后前进' },
  { value: 'left_turn_forward', label: '左旋推进', description: '先左旋并前进' }
]

// Kling simple 模式配置选项（6选1）
const KLING_CAMERA_CONFIGS = [
  { value: 'horizontal', label: '水平运镜', description: '沿x轴平移，负左正右' },
  { value: 'vertical', label: '垂直运镜', description: '沿y轴平移，负下正上' },
  { value: 'pan', label: '水平摇镜', description: '绕y轴旋转，负左正右' },
  { value: 'tilt', label: '垂直摇镜', description: '绕x轴旋转，负下正上' },
  { value: 'roll', label: '旋转运镜', description: '绕z轴旋转，负逆正顺' },
  { value: 'zoom', label: '变焦', description: '焦距变化，负拉近正推远' }
]

// Kling 2.6+ 音频相关选项
const klingSoundEnabled = ref(props.data.klingSoundEnabled || false)  // 是否生成声音
const klingVoiceList = ref(props.data.klingVoiceList || [])  // 音色列表（最多2个）
const klingVoiceInput = ref('')  // 音色ID输入框

// 检测是否是 Kling 2.6+ 版本（支持音频功能）
const isKling26Plus = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  // 检测 v2.6 或更高版本
  return modelName.includes('kling') && (
    modelName.includes('2.6') || 
    modelName.includes('2-6') ||
    modelName.includes('v2.6') ||
    modelName.includes('v2-6') ||
    // 未来版本
    modelName.includes('2.7') ||
    modelName.includes('2.8') ||
    modelName.includes('2.9') ||
    modelName.includes('3.0')
  )
})

// 检测是否是 Kling Pro 模式（只有 Pro 模式支持生成声音）
const isKlingProMode = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  // 检测模型名称中是否包含 pro
  return modelName.includes('kling') && modelName.includes('pro')
})

// 检测是否是 Kling 动作迁移模型（Motion Control）
const isKlingMotionControl = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  return modelName.includes('kling') && modelName.includes('motion')
})

// Kling 动作迁移相关参数
const klingMotionVideoUrl = ref(props.data.klingMotionVideoUrl || '')  // 参考视频URL
const klingMotionMode = ref(props.data.klingMotionMode || 'std')  // std 或 pro
const klingMotionVideoError = ref('')  // 视频验证错误信息
const klingMotionVideoDuration = ref(0)  // 参考视频时长（秒）
const klingMotionVideoLoading = ref(false)  // 视频加载中

// ==================== Seedance 模型相关 ====================
// 检测是否是豆包 Seedance 模型
const isSeedanceModel = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  const apiType = currentModelConfig.value?.apiType || ''
  return modelName.includes('seedance') || apiType === 'seedance'
})

// Seedance 高级选项显示控制
const showSeedanceAdvancedOptions = ref(false)

// Seedance 音频相关选项
const seedanceSoundEnabled = ref(props.data.seedanceSoundEnabled !== false)  // 是否生成声音，默认开启

// 验证参考视频时长（最大30秒）
const validateMotionVideoUrl = async (url) => {
  if (!url) {
    klingMotionVideoError.value = ''
    klingMotionVideoDuration.value = 0
    return
  }
  
  klingMotionVideoLoading.value = true
  klingMotionVideoError.value = ''
  
  try {
    // 使用 HTML5 video 元素获取视频时长
    const video = document.createElement('video')
    video.preload = 'metadata'
    
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => {
        klingMotionVideoDuration.value = Math.ceil(video.duration)
        if (video.duration > 30) {
          klingMotionVideoError.value = `视频时长 ${Math.ceil(video.duration)} 秒，超过最大限制 30 秒`
        } else {
          klingMotionVideoError.value = ''
        }
        resolve()
      }
      video.onerror = () => {
        klingMotionVideoError.value = '无法加载视频，请检查URL是否正确'
        reject(new Error('Video load failed'))
      }
      // 添加超时处理
      setTimeout(() => {
        if (!video.duration) {
          klingMotionVideoError.value = '视频加载超时，请检查URL'
          reject(new Error('Video load timeout'))
        }
      }, 10000)
      video.src = url
    })
  } catch (e) {
    console.error('[VideoNode] 验证视频失败:', e)
  } finally {
    klingMotionVideoLoading.value = false
  }
}

// 监听参考视频URL变化，自动验证
watch(klingMotionVideoUrl, (newUrl) => {
  if (newUrl) {
    validateMotionVideoUrl(newUrl)
  } else {
    klingMotionVideoError.value = ''
    klingMotionVideoDuration.value = 0
  }
}, { immediate: true })

// 添加音色到列表
const addKlingVoice = () => {
  const voiceId = klingVoiceInput.value.trim()
  if (!voiceId) return
  if (klingVoiceList.value.length >= 2) {
    console.log('[VideoNode] Kling 音色列表已满（最多2个）')
    return
  }
  if (klingVoiceList.value.includes(voiceId)) {
    console.log('[VideoNode] Kling 音色已存在:', voiceId)
    return
  }
  klingVoiceList.value.push(voiceId)
  klingVoiceInput.value = ''
}

// 移除音色
const removeKlingVoice = (voiceId) => {
  const index = klingVoiceList.value.indexOf(voiceId)
  if (index > -1) {
    klingVoiceList.value.splice(index, 1)
  }
}

// 构建 Kling camera_control 参数
const buildKlingCameraControl = () => {
  if (!klingCameraEnabled.value || !klingCameraType.value) {
    return null
  }
  
  const result = {
    type: klingCameraType.value
  }
  
  // 如果是 simple 类型，需要添加 config
  if (klingCameraType.value === 'simple') {
    const config = {
      horizontal: 0,
      vertical: 0,
      pan: 0,
      tilt: 0,
      roll: 0,
      zoom: 0
    }
    // 设置选中的配置项的值
    config[klingCameraConfig.value] = klingCameraValue.value
    result.config = config
  }
  
  return result
}

// 构建 Kling voice_list 参数
const buildKlingVoiceList = () => {
  if (!klingSoundEnabled.value || klingVoiceList.value.length === 0) {
    return null
  }
  return klingVoiceList.value.map(voiceId => ({ voice_id: voiceId }))
}

// 当前 Vidu 模式配置
const currentViduModeConfig = computed(() => {
  return VIDU_MODE_OPTIONS.find(m => m.value === viduMode.value) || VIDU_MODE_OPTIONS[0]
})

// Vidu 模式下的最大图片数量
const viduMaxImages = computed(() => {
  if (!isViduModel.value) return 9
  return currentViduModeConfig.value.maxImages
})

// ==================== VEO 模型相关 ====================
// 当前模型是否为 VEO 系列
const isVeoModel = computed(() => {
  return currentModelConfig.value?.isVeoModel === true
})

// VEO 图生视频模式选择
const veoMode = ref(props.data.veoMode || 'standard')  // fast, standard, components, pro

// VEO 清晰度选择
const veoResolution = ref(props.data.veoResolution || '1080p')

// VEO 模式选项（从模型配置获取）
const VEO_MODE_OPTIONS = computed(() => {
  return currentModelConfig.value?.veoModes || [
    { value: 'fast', label: 'fast首尾帧', description: '快速生成', actualModel: 'veo3.1-fast', maxImages: 2, pointsCost: 80 },
    { value: 'standard', label: '首尾帧', description: '标准质量', actualModel: 'veo3.1', maxImages: 2, pointsCost: 100 },
    { value: 'components', label: '多图参考', description: '最多3张图', actualModel: 'veo3.1-components', maxImages: 3, pointsCost: 120 },
    { value: 'pro', label: 'Pro首尾帧', description: '最高画质', actualModel: 'veo3.1-pro', maxImages: 2, pointsCost: 150 }
  ]
})

// VEO 清晰度选项（从模型配置获取）
// 注意：普通 VEO 模型只支持 1080p，4K 选项已单独作为 VEO 4K 组
const VEO_RESOLUTION_OPTIONS = computed(() => {
  return currentModelConfig.value?.veoResolutions || [
    { value: '1080p', label: '1080P', extraCost: 0 }
  ]
})

// 当前 VEO 模式配置
const currentVeoModeConfig = computed(() => {
  return VEO_MODE_OPTIONS.value.find(m => m.value === veoMode.value) || VEO_MODE_OPTIONS.value[0]
})

// 🔧 当前模式支持的清晰度选项（fast 模式不支持 4K）
const availableVeoResolutions = computed(() => {
  if (!isVeoModel.value) return []
  const allResolutions = VEO_RESOLUTION_OPTIONS.value
  const currentMode = currentVeoModeConfig.value
  
  // 如果当前模式有 supportedResolutions 限制，过滤
  if (currentMode.supportedResolutions && Array.isArray(currentMode.supportedResolutions)) {
    return allResolutions.filter(r => currentMode.supportedResolutions.includes(r.value))
  }
  return allResolutions
})

// VEO 模式下的最大图片数量
const veoMaxImages = computed(() => {
  if (!isVeoModel.value) return 9
  return currentVeoModeConfig.value.maxImages
})

// 获取 VEO 实际要使用的模型名称
const veoActualModel = computed(() => {
  if (!isVeoModel.value) return selectedModel.value
  return currentVeoModeConfig.value.actualModel || selectedModel.value
})

// 获取当前选中的模型对象
const currentModelConfig = computed(() => {
  return models.value.find(m => m.value === selectedModel.value) || {}
})

// 可用的时长选项（优先从模型配置的 durations 数组获取，兼容从 pointsCost 计算）
const availableDurations = computed(() => {
  // 优先使用模型配置中的 durations 数组
  if (currentModelConfig.value.durations && currentModelConfig.value.durations.length > 0) {
    return currentModelConfig.value.durations
  }
  
  // 兼容：如果模型支持时长计费，从 pointsCost 对象计算
  if (currentModelConfig.value.hasDurationPricing) {
    const pointsCostObj = currentModelConfig.value.pointsCost
    if (typeof pointsCostObj === 'object') {
      return Object.keys(pointsCostObj).filter(key => key !== 'hd_extra').sort((a, b) => Number(a) - Number(b))
    }
  }
  
  // 默认返回常用时长选项
  return ['10', '15']
})

// 可用模型列表（从配置动态获取，支持新增模型自动同步）
const models = computed(() => {
  const allModels = getAvailableVideoModels()
  
  // 如果有模型启用检查函数，则过滤
  let filteredModels = allModels
  if (typeof isModelEnabled === 'function') {
    filteredModels = allModels.filter(m => isModelEnabled(m.value, 'video'))
  }
  
  // 🔧 根据实际图片输入状态判断当前模式（而不是依赖可能过时的 generationMode）
  // 当有图片连接时，显示图生视频模型；否则显示文生视频模型
  // 注意：直接检查上游连接，避免依赖顺序问题
  const allEdges = [...canvasStore.edges]
  const allNodes = [...canvasStore.nodes]
  const IMAGE_TYPES = ['image', 'image-input', 'image-gen', 'flux-image', 'image-expand']
  const upstreamEdges = allEdges.filter(edge => edge.target === props.id)
  const hasImageInput = upstreamEdges.some(edge => {
    const sourceNode = allNodes.find(n => n.id === edge.source)
    return sourceNode && IMAGE_TYPES.includes(sourceNode.type)
  })
  const currentMode = hasImageInput ? 'i2v' : 't2v'
  
  const result = filteredModels.filter(m => {
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
  
  // 调试日志（仅在开发环境或需要时输出）
  if (process.env.NODE_ENV === 'development') {
    console.log('[VideoNode] models 计算属性更新:', {
      hasImageInput,
      currentMode,
      allModelsCount: allModels.length,
      filteredCount: result.length,
      modelNames: result.map(m => m.value)
    })
  }
  
  return result
})

const aspectRatios = [
  { value: '16:9', label: '16:9 横屏' },
  { value: '9:16', label: '9:16 竖屏' }
]

// 时长选项（动态计算）
const durations = computed(() => {
  return availableDurations.value.map(d => ({
    value: d,
    label: `${d}s`
  }))
})

// 处理后台任务完成事件
function handleBackgroundTaskComplete(event) {
  const { taskId, task } = event.detail
  // 只处理属于当前节点的任务
  if (task.nodeId !== props.id) return
  
  console.log(`[VideoNode] 后台任务完成事件: ${taskId}`, task)
  
  // 处理高清任务完成
  if (task.type === 'video-hd') {
    const videoUrl = task.result?.outputUrl || task.result?.url
    if (videoUrl) {
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        progress: null,
        output: {
          type: 'video',
          url: videoUrl,
          sourceUrl: task.metadata?.sourceUrl
        },
        pointsCost: task.result?.pointsCost || 0
      })
      showToast(`高清处理完成${task.result?.pointsCost > 0 ? `，消耗 ${task.result.pointsCost} 积分` : ''}`, 'success')
    }
    removeCompletedTask(taskId)
    return
  }
  
  // 获取视频URL（普通视频生成任务）
  const videoUrl = task.result?.video_url || task.result?.url
  if (videoUrl) {
    canvasStore.updateNodeData(props.id, {
      status: 'success',
      output: {
        type: 'video',
        url: videoUrl
      },
      taskId: taskId,
      soraTaskId: task.result?.task_id || taskId
    })
  }
  
  // 移除已完成的任务
  removeCompletedTask(taskId)
}

// 处理后台任务失败事件
function handleBackgroundTaskFailed(event) {
  const { taskId, task } = event.detail
  if (task.nodeId !== props.id) return
  
  console.log(`[VideoNode] 后台任务失败事件: ${taskId}`, task)
  
  // 处理高清任务失败
  if (task.type === 'video-hd') {
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      progress: null,
      error: task.error || '高清处理失败'
    })
    showToast(task.error || '高清处理失败，未扣除积分', 'error')
    removeCompletedTask(taskId)
    return
  }
  
  canvasStore.updateNodeData(props.id, {
    status: 'error',
    error: task.error || '视频生成失败'
  })
  
  removeCompletedTask(taskId)
}

// 处理后台任务进度事件
function handleBackgroundTaskProgress(event) {
  const { taskId, task } = event.detail
  if (task.nodeId !== props.id) return
  
  // 更新进度（支持高清任务和普通视频任务）
  const progress = task.result?.progress || task.progress
  if (progress) {
    canvasStore.updateNodeData(props.id, {
      progress: progress
    })
  }
}

// 检查并恢复已完成的后台任务
function checkAndRestoreBackgroundTasks() {
  const nodeTasks = getTasksByNodeId(props.id)
  
  for (const task of nodeTasks) {
    console.log(`[VideoNode] 检查后台任务: ${task.taskId}`, task.status, task.type)
    
    if (task.status === 'completed') {
      // 处理高清任务完成
      if (task.type === 'video-hd') {
        const videoUrl = task.result?.outputUrl || task.result?.url
        if (videoUrl) {
          console.log(`[VideoNode] 恢复已完成的高清任务: ${task.taskId}`)
          canvasStore.updateNodeData(props.id, {
            status: 'success',
            progress: null,
            output: {
              type: 'video',
              url: videoUrl,
              sourceUrl: task.metadata?.sourceUrl
            },
            pointsCost: task.result?.pointsCost || 0
          })
          removeCompletedTask(task.taskId)
        }
        continue
      }
      
      // 普通视频任务
      const videoUrl = task.result?.video_url || task.result?.url
      if (videoUrl) {
        console.log(`[VideoNode] 恢复已完成的任务: ${task.taskId}`)
        canvasStore.updateNodeData(props.id, {
          status: 'success',
          output: {
            type: 'video',
            url: videoUrl
          },
          taskId: task.taskId,
          soraTaskId: task.result?.task_id || task.taskId
        })
        removeCompletedTask(task.taskId)
      }
    } else if (task.status === 'failed') {
      console.log(`[VideoNode] 恢复失败的任务: ${task.taskId}`)
      const errorMsg = task.type === 'video-hd' ? '高清处理失败' : '视频生成失败'
      canvasStore.updateNodeData(props.id, {
        status: 'error',
        progress: null,
        error: task.error || errorMsg
      })
      removeCompletedTask(task.taskId)
    } else if (task.status === 'processing' || task.status === 'pending') {
      // 任务仍在进行中，更新进度显示
      console.log(`[VideoNode] 任务仍在进行中: ${task.taskId}`)
      const progressText = task.type === 'video-hd' ? '高清处理中...' : '生成中...'
      if (props.data.status !== 'processing') {
        canvasStore.updateNodeData(props.id, {
          status: 'processing',
          progress: task.result?.progress || task.progress || progressText
        })
      }
    }
  }
}

// 初始化时确保时长选项有效
// 🚀 性能优化：监听画布拖拽事件
function handleCanvasDragStart() {
  isCanvasDragging.value = true
  // 暂停视频播放以提升拖拽性能
  const video = videoPlayerRef.value
  if (video && !video.paused) {
    video.pause()
  }
}
function handleCanvasDragEnd() {
  isCanvasDragging.value = false
}

onMounted(() => {
  // 如果当前模型支持时长选择，但当前选中的时长不在可用列表中，则重置为第一个可用时长
  if (availableDurations.value.length > 0 && !availableDurations.value.includes(selectedDuration.value)) {
    selectedDuration.value = availableDurations.value[0]
  }
  
  // 🔧 初始化时检查当前模型是否支持当前的生成模式（使用 nextTick 确保计算属性已更新）
  nextTick(() => {
    const modelsForCurrentMode = models.value
    const currentModelStillAvailable = modelsForCurrentMode.some(m => m.value === selectedModel.value)
    
    if (!currentModelStillAvailable && modelsForCurrentMode.length > 0) {
      // 当前模型不支持当前模式，切换到第一个支持的模型
      selectedModel.value = modelsForCurrentMode[0].value
      console.log('[VideoNode] 初始化时自动选择模型（根据生成模式）:', selectedModel.value, '当前模式:', generationMode.value)
    }
  })
  
  // 添加点击外部关闭下拉框的事件监听
  document.addEventListener('click', handleModelDropdownClickOutside)
  
  // 监听后台任务事件
  window.addEventListener('background-task-complete', handleBackgroundTaskComplete)
  window.addEventListener('background-task-failed', handleBackgroundTaskFailed)
  window.addEventListener('background-task-progress', handleBackgroundTaskProgress)
  
  // 🚀 性能优化：监听画布拖拽事件
  window.addEventListener('canvas-drag-start', handleCanvasDragStart)
  window.addEventListener('canvas-drag-end', handleCanvasDragEnd)
  
  // 检查是否有已完成的后台任务需要恢复
  checkAndRestoreBackgroundTasks()
  
  // 初始化时调整文本框高度（如果有长文本）
  nextTick(() => {
    autoResizeTextarea()
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleModelDropdownClickOutside)
  
  // 移除后台任务事件监听
  window.removeEventListener('background-task-complete', handleBackgroundTaskComplete)
  window.removeEventListener('background-task-failed', handleBackgroundTaskFailed)
  window.removeEventListener('background-task-progress', handleBackgroundTaskProgress)
  
  // 🚀 性能优化：移除画布拖拽事件监听
  window.removeEventListener('canvas-drag-start', handleCanvasDragStart)
  window.removeEventListener('canvas-drag-end', handleCanvasDragEnd)
})

// 节点尺寸 - 视频节点使用16:9比例
const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 280)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })
// 用于 resize 节流的 requestAnimationFrame ID
let resizeRafId = null

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'video-node': true,
  'selected': props.selected,
  'processing': props.data.status === 'processing',
  'success': props.data.status === 'success',
  'error': props.data.status === 'error',
  'resizing': isResizing.value,
  'has-output': hasOutput.value // 有输出时使用无边框设计
}))

// 是否有输出
const hasOutput = computed(() => !!props.data.output?.url)

// 处理视频 URL，确保使用相对路径（避免跨域问题）
const normalizedVideoUrl = computed(() => {
  const url = props.data.output?.url
  if (!url) return ''
  
  // 如果已经是相对路径，直接返回
  if (url.startsWith('/api/')) return url
  
  // 如果是完整 URL，提取相对路径部分
  const match = url.match(/\/api\/images\/file\/[a-zA-Z0-9-]+/)
  if (match) {
    return match[0]
  }
  
  // 其他情况保持原样
  return url
})

// 节点内容样式（有输出时不设置 min-height，让视频自适应）
const contentStyle = computed(() => {
  if (hasOutput.value) {
    return { width: `${nodeWidth.value}px` }
  }
  return {
    width: `${nodeWidth.value}px`,
    minHeight: `${nodeHeight.value}px`
  }
})

// 视频容器样式（根据选择的比例设置）
const videoWrapperStyle = computed(() => {
  const ratio = props.data.aspectRatio || selectedAspectRatio.value || '16:9'
  if (ratio === '9:16') {
    return { aspectRatio: '9 / 16' }
  }
  return { aspectRatio: '16 / 9' }
})

// 进度百分比（从 progress 字符串中提取数字）
const progressPercent = computed(() => {
  const progress = props.data.progress
  if (!progress) return 0
  
  // 尝试从 progress 字符串中提取百分比数字
  // 支持格式：50%, 50, "50%", "进度: 50%", "Processing 50%" 等
  const match = String(progress).match(/(\d+)%?/)
  if (match) {
    return Math.min(100, Math.max(0, parseInt(match[1], 10)))
  }
  
  // 如果是状态文本，给一个估计值
  const statusMap = {
    '排队中': 5,
    'pending': 5,
    'queued': 5,
    '准备中': 10,
    'not_start': 10,
    '生成中': 50,
    'processing': 50,
    'in_progress': 50,
    'running': 60
  }
  
  const lowerProgress = String(progress).toLowerCase()
  for (const [key, value] of Object.entries(statusMap)) {
    if (lowerProgress.includes(key.toLowerCase())) {
      return value
    }
  }
  
  return 0
})

// 判断进度文本是否为默认/无意义的文本（不需要单独显示）
const isDefaultProgress = computed(() => {
  const progress = props.data.progress
  if (!progress) return true
  
  const p = String(progress).toLowerCase().trim()
  // 这些是默认状态文本，不需要额外显示
  const defaultTexts = ['0%', '排队中...', '生成中...', '处理中...', 'pending', 'queued', 'processing']
  return defaultTexts.some(t => p === t.toLowerCase() || p.startsWith('并行生成'))
})

// 判断是否有上游连接（用于显示"已连接"状态）
// 动态检查是否真的有上游连接边，而不是依赖存储的状态
const hasUpstream = computed(() => {
  // 检查是否有连接到当前节点的边
  const hasIncomingEdge = canvasStore.edges.some(edge => edge.target === props.id)
  return hasIncomingEdge
})

// 收集上游节点的所有图片（不考虑顺序）
// 所有可能输出图片的节点类型
const IMAGE_NODE_TYPES = [
  'image-input',      // 图片输入节点
  'image',            // 通用图片节点
  'image-gen',        // 图片生成节点
  'text-to-image',    // 文生图节点
  'image-to-image',   // 图生图节点
  'image-repaint',    // 局部重绘
  'image-erase',      // 智能擦除
  'image-upscale',    // 超分放大
  'image-cutout',     // 智能抠图
  'image-expand'      // 图片扩展
]

// 参考图片（来自左侧输入，支持多张图片，支持自定义顺序）
// 优化版：减少不必要的计算和日志，提升加载性能
const referenceImages = computed(() => {
  const allEdges = [...canvasStore.edges]
  const allNodes = [...canvasStore.nodes]
  
  // 检查是否有上游连接
  const upstreamEdges = allEdges.filter(edge => edge.target === props.id)
  if (upstreamEdges.length === 0) {
    return []
  }

  // 收集上游图片
  const upstreamImages = []
  
  for (const edge of upstreamEdges) {
    const sourceNode = allNodes.find(n => n.id === edge.source)
    if (!sourceNode?.data || !IMAGE_NODE_TYPES.includes(sourceNode.type)) {
      continue
    }
    
    // 优先使用输出结果
    if (sourceNode.data.output?.urls?.length > 0) {
      upstreamImages.push(...sourceNode.data.output.urls)
    } else if (sourceNode.data.output?.url) {
      upstreamImages.push(sourceNode.data.output.url)
    }
    // 其次使用源图片
    else if (sourceNode.data.sourceImages?.length > 0) {
      upstreamImages.push(...sourceNode.data.sourceImages)
    }
  }

  // 如果有用户自定义的顺序，按顺序返回
  const customOrder = props.data.imageOrder || []
  if (customOrder.length > 0 && upstreamImages.length > 0) {
    const orderedImages = []
    const remainingImages = [...upstreamImages]

    for (const url of customOrder) {
      const index = remainingImages.indexOf(url)
      if (index !== -1) {
        orderedImages.push(url)
        remainingImages.splice(index, 1)
      }
    }

    orderedImages.push(...remainingImages)
    return orderedImages
  }

  return upstreamImages
})
const firstFrame = computed(() => referenceImages.value[0] || null)
const lastFrame = computed(() => referenceImages.value[1] || referenceImages.value[0] || null)

// 参考视频（来自上游视频节点）
const VIDEO_NODE_TYPES = ['video', 'video-input', 'video-gen']

const referenceVideos = computed(() => {
  const allEdges = [...canvasStore.edges]
  const allNodes = [...canvasStore.nodes]
  
  // 检查是否有上游连接
  const upstreamEdges = allEdges.filter(edge => edge.target === props.id)
  if (upstreamEdges.length === 0) {
    return []
  }

  // 收集上游视频
  const upstreamVideos = []
  
  for (const edge of upstreamEdges) {
    const sourceNode = allNodes.find(n => n.id === edge.source)
    if (!sourceNode?.data || !VIDEO_NODE_TYPES.includes(sourceNode.type)) {
      continue
    }
    
    // 获取视频输出URL
    if (sourceNode.data.output?.url) {
      upstreamVideos.push(sourceNode.data.output.url)
    } else if (sourceNode.data.sourceVideo) {
      upstreamVideos.push(sourceNode.data.sourceVideo)
    }
  }

  return upstreamVideos
})

// 是否有参考视频
const hasReferenceVideos = computed(() => referenceVideos.value.length > 0)

// 继承的文本提示词（来自上游文本节点）
// 只有在有上游连接时才使用继承数据
const inheritedPrompt = computed(() => {
  // 检查是否有上游连接
  const hasIncomingEdge = canvasStore.edges.some(edge => edge.target === props.id)
  if (!hasIncomingEdge) return ''

  const data = props.data.inheritedData
  if (data?.type === 'text' && data?.content) {
    return data.content
  }
  return ''
})

// 获取上游节点的最新数据（实时读取，不依赖缓存）
function getUpstreamData() {
  // 查找所有连接到当前节点的上游边
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  if (upstreamEdges.length === 0) return { prompts: [], images: [], videos: [] }
  
  let prompts = []  // 改为数组，支持多个文本节点
  let images = []
  let videos = []   // 新增：收集上游视频
  
  // 遍历所有上游节点，收集数据
  for (const edge of upstreamEdges) {
    const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
    if (!sourceNode) continue
    
    // 文本节点：获取文本内容（收集所有文本节点的内容）
    if (sourceNode.type === 'text-input' || sourceNode.type === 'text') {
      // 优先获取 LLM 响应，其次是手写文本
      const text = sourceNode.data?.llmResponse || sourceNode.data?.text || ''
      if (text) {
        // 去除 HTML 标签
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = text
        const cleanText = (tempDiv.textContent || tempDiv.innerText || '').trim()
        if (cleanText) {
          prompts.push(cleanText)
        }
      }
    }
    
    // 图片节点：获取图片（使用统一的图片节点类型列表）
    if (IMAGE_NODE_TYPES.includes(sourceNode.type)) {
      console.log('[VideoNode] 检测到图片节点:', {
        type: sourceNode.type,
        id: sourceNode.id,
        outputUrls: sourceNode.data?.output?.urls,
        outputUrl: sourceNode.data?.output?.url,
        sourceImages: sourceNode.data?.sourceImages
      })
      
      // 优先使用输出结果
      if (sourceNode.data?.output?.urls?.length > 0) {
        images = [...images, ...sourceNode.data.output.urls]
      } else if (sourceNode.data?.output?.url) {
        images.push(sourceNode.data.output.url)
      }
      // 其次使用源图片
      else if (sourceNode.data?.sourceImages?.length > 0) {
        images = [...images, ...sourceNode.data.sourceImages]
      }
    }
    
    // 视频节点：获取视频URL（用于动作迁移）
    if (sourceNode.type === 'video') {
      console.log('[VideoNode] 检测到视频节点:', {
        type: sourceNode.type,
        id: sourceNode.id,
        outputUrl: sourceNode.data?.output?.url
      })
      
      // 获取视频输出URL
      if (sourceNode.data?.output?.url) {
        videos.push(sourceNode.data.output.url)
      }
    }
  }
  
  console.log('[VideoNode] getUpstreamData 结果:', { prompts, images, videos })
  return { prompts, images, videos }
}

// 实时获取上游文本内容（用于显示在"上下文文字参考"区域）
const upstreamTextContent = computed(() => {
  const upstreamData = getUpstreamData()
  if (upstreamData.prompts.length === 0) return ''
  return upstreamData.prompts.join('\n\n---\n\n')
})

// 是否有上游文本（用于控制显示）
const hasUpstreamText = computed(() => {
  return upstreamTextContent.value.length > 0
})

// 获取上游视频URL（用于动作迁移模型）
const upstreamVideoUrl = computed(() => {
  const upstreamData = getUpstreamData()
  return upstreamData.videos.length > 0 ? upstreamData.videos[0] : ''
})

// 是否有上游视频（用于控制显示）
const hasUpstreamVideo = computed(() => {
  return upstreamVideoUrl.value.length > 0
})

// 积分消耗计算（从模型配置中读取）
const pointsCost = computed(() => {
  let cost = 1
  
  // VEO 模型：使用当前模式的积分配置
  if (isVeoModel.value) {
    cost = currentVeoModeConfig.value.pointsCost || 100
    // VEO 4K 清晰度额外费用
    const currentRes = VEO_RESOLUTION_OPTIONS.value.find(r => r.value === veoResolution.value)
    if (currentRes && currentRes.extraCost > 0) {
      cost += currentRes.extraCost
    }
    return cost
  }
  
  const modelPointsCost = currentModelConfig.value.pointsCost
  
  // 如果是按时长计费的模型
  if (currentModelConfig.value.hasDurationPricing && typeof modelPointsCost === 'object') {
    cost = modelPointsCost[selectedDuration.value] || 20
  } else {
    // 固定积分模型
    cost = typeof modelPointsCost === 'number' ? modelPointsCost : 1
  }
  
  // Vidu 720P清晰度折扣
  if (isViduModel.value && viduResolution.value === '720p') {
    const discount = currentModelConfig.value.resolution720Discount || 0.7
    cost = Math.ceil(cost * discount)
  }
  
  // Vidu 错峰模式折扣
  if (isViduModel.value && viduOffPeak.value) {
    const discount = currentModelConfig.value.offPeakDiscount || 0.7
    cost = Math.ceil(cost * discount)
  }
  
  // Kling 2.6+ Pro 声音模式：积分翻倍
  if (isKlingProMode.value && klingSoundEnabled.value) {
    cost = cost * 2
  }
  
  // Seedance 声音模式：积分翻倍
  if (isSeedanceModel.value && seedanceSoundEnabled.value) {
    cost = cost * 2
  }
  
  return cost
})

// 动作迁移模型每秒积分（用于显示 "X积分/s" 格式）
const motionCostPerSecond = computed(() => {
  if (!isKlingMotionControl.value) return 0
  const costPerSecond = currentModelConfig.value?.costPerSecond
  if (!costPerSecond) return 6  // 默认值
  // 根据当前选择的模式返回对应的每秒积分
  return costPerSecond[klingMotionMode.value] || costPerSecond.std || 6
})

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 模式标签显示
const modeLabel = computed(() => {
  // 根据是否有参考图片自动判断模式
  if (referenceImages.value.length > 0) {
    return '图生视频'
  }
  return '文生视频'
})

// 快捷操作 - 使用翻译键
const quickActions = [
  { 
    icon: '✎',
    labelKey: 'canvas.videoNode.textToVideo', 
    action: () => handleTextToVideo()
  },
  { 
    icon: '▢',
    labelKey: 'canvas.videoNode.imageToVideo', 
    action: () => handleImageToVideo()
  },
  { 
    icon: '▶',
    labelKey: 'canvas.videoNode.keyframesToVideo', 
    action: () => handleKeyframesToVideo()
  },
  { 
    icon: '↑',
    labelKey: 'canvas.videoNode.motionImitation', 
    action: () => handleMotionImitation()
  }
]

// 文生视频：创建文本节点
function handleTextToVideo() {
  generationMode.value = 'text'
  
  // 获取当前节点位置
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在左侧创建文本节点
  const textNodePosition = {
    x: currentNode.position.x - 450,
    y: currentNode.position.y
  }
  
  const textNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: textNodeId,
    type: 'text-input',
    position: textNodePosition,
    data: {
      title: '视频描述',
      text: ''
    }
  })
  
  // 连接文本节点到视频节点
  canvasStore.addEdge({
    source: textNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 选中当前视频节点
  canvasStore.selectNode(props.id)
}

// 图生视频：创建1个图片节点
function handleImageToVideo() {
  generationMode.value = 'image'
  
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在左侧创建图片节点
  const imageNodePosition = {
    x: currentNode.position.x - 400,
    y: currentNode.position.y
  }
  
  const imageNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const defaultImage = '/logo.svg'
  
  canvasStore.addNode({
    id: imageNodeId,
    type: 'image-input',
    position: imageNodePosition,
    data: {
      title: '参考图片',
      sourceImages: [defaultImage],
      status: 'success'
    }
  })
  
  // 连接图片节点到视频节点
  canvasStore.addEdge({
    source: imageNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 选中当前视频节点
  canvasStore.selectNode(props.id)
}

// 首尾帧生视频：创建2个图片节点
function handleKeyframesToVideo() {
  generationMode.value = 'keyframes'
  
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  const defaultImage = '/logo.svg'
  
  // 创建首帧图片节点（上方）
  const firstFramePosition = {
    x: currentNode.position.x - 400,
    y: currentNode.position.y - 150
  }
  
  const firstFrameId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: firstFrameId,
    type: 'image-input',
    position: firstFramePosition,
    data: {
      title: '首帧',
      sourceImages: [defaultImage],
      status: 'success'
    }
  })
  
  // 连接首帧到视频节点
  canvasStore.addEdge({
    source: firstFrameId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 创建尾帧图片节点（下方）
  const lastFramePosition = {
    x: currentNode.position.x - 400,
    y: currentNode.position.y + 150
  }
  
  const lastFrameId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: lastFrameId,
    type: 'image-input',
    position: lastFramePosition,
    data: {
      title: '尾帧',
      sourceImages: [defaultImage],
      status: 'success'
    }
  })
  
  // 连接尾帧到视频节点
  canvasStore.addEdge({
    source: lastFrameId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 选中当前视频节点
  canvasStore.selectNode(props.id)
}

// 动作模仿：创建1个图片节点和1个视频节点（用于动作迁移模型）
function handleMotionImitation() {
  generationMode.value = 'motion'
  
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 自动选择动作迁移模型（查找包含 'kling' 和 'motion' 的模型）
  const motionControlModel = models.value.find(m => {
    const modelValue = m.value?.toLowerCase() || ''
    return modelValue.includes('kling') && modelValue.includes('motion')
  })
  
  if (motionControlModel) {
    selectedModel.value = motionControlModel.value
    console.log('[VideoNode] 自动选择动作迁移模型:', motionControlModel.value)
  } else {
    console.warn('[VideoNode] 未找到动作迁移模型，请检查租户配置')
  }
  
  const defaultImage = '/logo.svg'
  
  // 创建图片节点（上方 - 作为参考人物）
  const imagePosition = {
    x: currentNode.position.x - 450,
    y: currentNode.position.y - 180
  }
  
  const imageNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: imageNodeId,
    type: 'image-input',
    position: imagePosition,
    data: {
      title: '参考人物',
      sourceImages: [defaultImage],
      status: 'success'
    }
  })
  
  // 连接图片节点到视频节点
  canvasStore.addEdge({
    source: imageNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 创建视频输入节点（下方 - 作为动作参考视频）
  const videoPosition = {
    x: currentNode.position.x - 450,
    y: currentNode.position.y + 180
  }
  
  const videoNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  canvasStore.addNode({
    id: videoNodeId,
    type: 'video-input',
    position: videoPosition,
    data: {
      title: '动作视频',
      nodeRole: 'source',
      status: 'idle'
    }
  })
  
  // 连接视频节点到当前视频节点
  canvasStore.addEdge({
    source: videoNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 选中当前视频节点
  canvasStore.selectNode(props.id)
}

// 监听参数变化，保存到store
watch([selectedModel, selectedAspectRatio, selectedDuration, selectedCount, promptText, generationMode, viduOffPeak, viduResolution, veoMode, veoResolution, klingCameraEnabled, klingCameraType, klingCameraConfig, klingCameraValue, klingSoundEnabled, klingVoiceList, klingMotionVideoUrl, klingMotionMode, seedanceSoundEnabled], 
  ([model, aspectRatio, duration, count, prompt, mode, offPeak, resolution, veoMd, veoRes, klingCamEnabled, klingCamType, klingCamConfig, klingCamValue, klingSndEnabled, klingVoices, motionVideoUrl, motionMode, seedanceSndEnabled]) => {
    canvasStore.updateNodeData(props.id, {
      model,
      aspectRatio,
      duration,
      count,
      prompt,
      generationMode: mode,
      viduOffPeak: offPeak,
      viduResolution: resolution,
      veoMode: veoMd,
      veoResolution: veoRes,
      // Kling 摄像机控制参数
      klingCameraEnabled: klingCamEnabled,
      klingCameraType: klingCamType,
      klingCameraConfig: klingCamConfig,
      klingCameraValue: klingCamValue,
      // Kling 2.6+ 音频参数
      klingSoundEnabled: klingSndEnabled,
      klingVoiceList: klingVoices,
      // Kling 动作迁移参数
      klingMotionVideoUrl: motionVideoUrl,
      klingMotionMode: motionMode,
      // Seedance 音频参数
      seedanceSoundEnabled: seedanceSndEnabled
    })
  },
  { deep: true }  // 深度监听数组变化
)

// 🔧 监听 VEO 模式切换，如果当前清晰度不被支持，自动切换到支持的第一个清晰度
watch(veoMode, () => {
  if (!isVeoModel.value) return
  const currentMode = VEO_MODE_OPTIONS.value.find(m => m.value === veoMode.value)
  if (currentMode?.supportedResolutions && !currentMode.supportedResolutions.includes(veoResolution.value)) {
    // 🆕 优先切换到第一个支持的清晰度，而不是硬编码 1080p
    veoResolution.value = currentMode.supportedResolutions[0] || '1080p'
    console.log('[VideoNode] VEO 模式切换，清晰度重置为', veoResolution.value)
  }
})

// 🆕 监听模型切换，如果是 VEO 4K 组，自动设置清晰度为 4K
watch(selectedModel, () => {
  const modelConfig = currentModelConfig.value
  if (modelConfig?.isVeoModel && modelConfig?.isVeo4k) {
    // VEO 4K 组只支持 4K 清晰度
    veoResolution.value = '4k'
    // 设置默认模式
    if (modelConfig.defaultVeoMode) {
      veoMode.value = modelConfig.defaultVeoMode
    }
    console.log('[VideoNode] 切换到 VEO 4K 组，清晰度设为 4K')
  } else if (modelConfig?.isVeoModel && !modelConfig?.isVeo4k) {
    // 普通 VEO 模型，如果当前是 4K 且不支持，切换到 1080p
    const resolutions = modelConfig.veoResolutions || []
    const supports4k = resolutions.some(r => r.value === '4k')
    if (veoResolution.value === '4k' && !supports4k) {
      veoResolution.value = '1080p'
    }
    // 设置默认模式
    if (modelConfig.defaultVeoMode) {
      veoMode.value = modelConfig.defaultVeoMode
    }
  }
})

// 监听 promptText 变化，自动调整文本框高度
watch(promptText, () => {
  nextTick(() => {
    autoResizeTextarea()
  })
})

// 监听节点选中状态，选中时恢复正确的文本框高度
watch(() => props.selected, (isSelected) => {
  if (isSelected) {
    nextTick(() => {
      autoResizeTextarea()
    })
  }
})

// 同步 label 变化
watch(() => props.data.label, (newLabel) => {
  if (newLabel !== undefined && newLabel !== localLabel.value) {
    localLabel.value = newLabel
  }
})

// 双击标签进入编辑模式
function handleLabelDoubleClick(event) {
  event.stopPropagation()
  isEditingLabel.value = true
  nextTick(() => {
    if (labelInputRef.value) {
      labelInputRef.value.focus()
      labelInputRef.value.select()
    }
  })
}

// 保存标签
function saveLabelEdit() {
  isEditingLabel.value = false
  const newLabel = localLabel.value.trim() || 'Video'
  localLabel.value = newLabel
  canvasStore.updateNodeData(props.id, { label: newLabel })
}

// 标签输入框键盘事件
function handleLabelKeyDown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveLabelEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    isEditingLabel.value = false
    localLabel.value = props.data.label || 'Video'
  }
}

// 设置生成模式
function setGenerationMode(mode) {
  generationMode.value = mode
  canvasStore.selectNode(props.id)
}

// 🔧 监听 props.data.generationMode 变化，确保 generationMode 与 props 同步
watch(() => props.data.generationMode, (newMode) => {
  if (newMode && newMode !== generationMode.value) {
    generationMode.value = newMode
    console.log('[VideoNode] 从 props 同步 generationMode:', newMode)
  }
}, { immediate: true })

// 🔧 监听生成模式变化，检查当前模型是否支持新模式（immediate: true 确保初始化时也执行）
watch(generationMode, (newMode) => {
  console.log('[VideoNode] generationMode 变化:', newMode, '当前模型列表数量:', models.value.length)
  // 检查当前选中的模型是否在新模式的可用模型列表中
  const modelsForNewMode = models.value
  const currentModelStillAvailable = modelsForNewMode.some(m => m.value === selectedModel.value)
  
  if (!currentModelStillAvailable && modelsForNewMode.length > 0) {
    // 当前模型不支持新模式，切换到第一个支持的模型
    selectedModel.value = modelsForNewMode[0].value
    console.log('[VideoNode] 切换模式后自动选择模型:', selectedModel.value, '新模式:', newMode)
  }
}, { immediate: true })

// 并发间隔时间（毫秒）
const CONCURRENT_INTERVAL = 5000

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ========== URL 可访问性处理（确保 AI 模型可访问参考图片） ==========

// 判断是否是七牛云 CDN URL（公开可访问的 URL）
function isQiniuCdnUrl(str) {
  if (!str || typeof str !== 'string') return false
  return str.includes('files.nananobanana.cn') ||  // 项目的七牛云 CDN 域名
         str.includes('oss.nananobanana.cn') ||    // 项目的七牛云源站域名
         str.includes('qiniucdn.com') || 
         str.includes('clouddn.com') || 
         str.includes('qnssl.com') ||
         str.includes('qbox.me')
}

// 判断是否是需要重新上传的本地/相对路径 URL
function needsReupload(url) {
  if (!url || typeof url !== 'string') return false
  // 相对路径需要重新上传
  if (url.startsWith('/api/images/file/')) return true
  // 本地服务器 URL 需要重新上传（AI 模型无法访问）
  if (url.includes('nanobanana') && url.includes('/api/images/file/')) return true
  if (url.includes('localhost') && url.includes('/api/images/file/')) return true
  return false
}

// 将本地/相对路径的图片重新上传到七牛云获取公开 URL
async function reuploadToCloud(url) {
  console.log('[VideoNode] 重新上传图片到云端:', url)
  
  try {
    // 获取图片内容
    let fetchUrl = url
    if (url.startsWith('/api/')) {
      // 相对路径，转换为完整 URL
      fetchUrl = getApiUrl(url)
    }
    
    console.log('[VideoNode] 获取图片:', fetchUrl)
    const response = await fetch(fetchUrl, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`获取图片失败: ${response.status}`)
    }
    
    const blob = await response.blob()
    const file = new File([blob], `reupload_${Date.now()}.png`, { type: blob.type || 'image/png' })
    
    // 重新上传到服务器（服务器会上传到七牛云）
    const urls = await uploadImages([file])
    if (urls && urls.length > 0) {
      console.log('[VideoNode] 重新上传成功，新 URL:', urls[0])
      return urls[0]
    }
    
    throw new Error('上传返回空结果')
  } catch (error) {
    console.error('[VideoNode] 重新上传失败:', error)
    // 回退到原始 URL
    if (url.startsWith('/api/')) {
      return getApiUrl(url)
    }
    return url
  }
}

// 确保所有图片 URL 都是 AI 模型可访问的公开 URL
async function ensureAccessibleUrls(imageUrls) {
  const accessibleUrls = []
  
  for (const url of imageUrls) {
    if (isQiniuCdnUrl(url)) {
      // 已经是七牛云 URL，直接使用
      console.log('[VideoNode] 使用七牛云 URL:', url.substring(0, 60))
      accessibleUrls.push(url)
    } else if (needsReupload(url)) {
      // 需要重新上传到云端
      console.log('[VideoNode] 需要重新上传:', url.substring(0, 60))
      const newUrl = await reuploadToCloud(url)
      accessibleUrls.push(newUrl)
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // 其他 HTTP URL，假设可访问
      accessibleUrls.push(url)
    } else if (url.startsWith('/api/') || url.startsWith('/storage/')) {
      // 相对路径，检查是否需要重新上传
      if (needsReupload(url)) {
        const newUrl = await reuploadToCloud(url)
        accessibleUrls.push(newUrl)
      } else {
        const fullUrl = getApiUrl(url)
        accessibleUrls.push(fullUrl)
      }
    } else {
      // 其他格式（如 base64），尝试直接使用
      accessibleUrls.push(url)
    }
  }
  
  return accessibleUrls
}

// 单次生成请求
async function sendGenerateRequest(finalPrompt, finalImages) {
  const token = localStorage.getItem('token')
  
  // 构建请求数据
  const formData = new FormData()
  formData.append('prompt', finalPrompt || '根据图片生成视频')
  
  // VEO 模型：使用实际的模型名称
  if (isVeoModel.value) {
    formData.append('model', veoActualModel.value)
    formData.append('veo_resolution', veoResolution.value)
    console.log('[VideoNode] VEO 实际模型:', veoActualModel.value, '清晰度:', veoResolution.value)
  } else {
    formData.append('model', selectedModel.value)
  }
  
  formData.append('aspect_ratio', selectedAspectRatio.value)
  
  // VEO3 模型不需要时长参数
  if (!isVeo3Model.value) {
    formData.append('duration', selectedDuration.value)
  }
  
  // Sora2 模型特有参数
  if (isSora2Model.value) {
    // storyboard 故事板模式（默认关闭，开启时传 true）
    if (storyboardMode.value) {
      formData.append('storyboard', 'true')
    }
    // trim 参数（去掉首帧）
    if (trimFirstFrame.value) {
      formData.append('trim', 'true')
    }
    // style 参数（多选，逗号分隔）
    if (selectedStyles.value.length > 0) {
      formData.append('style', selectedStyles.value.join(','))
    }
  }
  
  // Vidu 模型特有参数：图生视频模式
  if (isViduModel.value && finalImages.length > 0 && viduMode.value !== 'auto') {
    formData.append('vidu_mode', viduMode.value)
    console.log('[VideoNode] Vidu 模式参数:', viduMode.value)
  }
  
  // Vidu 模型特有参数：错峰模式
  if (isViduModel.value && viduOffPeak.value) {
    formData.append('off_peak', 'true')
    console.log('[VideoNode] Vidu 错峰模式已开启')
  }
  
  // Vidu 模型特有参数：清晰度
  if (isViduModel.value) {
    formData.append('resolution', viduResolution.value)
    console.log('[VideoNode] Vidu 清晰度:', viduResolution.value)
  }
  
  // Kling 模型特有参数：摄像机控制
  if (isKlingModel.value && klingCameraEnabled.value) {
    const cameraControl = buildKlingCameraControl()
    if (cameraControl) {
      formData.append('camera_control', JSON.stringify(cameraControl))
      console.log('[VideoNode] Kling 摄像机控制:', cameraControl)
    }
  }
  
  // Kling 2.6+ 模型特有参数：声音和音色
  if (isKling26Plus.value) {
    // sound 参数
    formData.append('kling_sound', klingSoundEnabled.value ? 'on' : 'off')
    console.log('[VideoNode] Kling 生成声音:', klingSoundEnabled.value ? 'on' : 'off')
    
    // voice_list 参数
    if (klingSoundEnabled.value && klingVoiceList.value.length > 0) {
      const voiceList = buildKlingVoiceList()
      if (voiceList) {
        formData.append('kling_voice_list', JSON.stringify(voiceList))
        console.log('[VideoNode] Kling 音色列表:', voiceList)
      }
    }
  }
  
  // Kling 动作迁移模型特有参数
  if (isKlingMotionControl.value) {
    // 从上游视频节点获取参考视频
    const motionVideoUrl = upstreamVideoUrl.value
    if (!motionVideoUrl) {
      throw new Error('请连接一个视频节点作为参考视频来源')
    }
    // 参考视频 URL（来自上游视频节点）
    formData.append('kling_motion_video_url', motionVideoUrl)
    console.log('[VideoNode] Kling 动作迁移参考视频（来自上游节点）:', motionVideoUrl)
    // 模式参数
    formData.append('kling_motion_mode', klingMotionMode.value)
    console.log('[VideoNode] Kling 动作迁移模式:', klingMotionMode.value)
  }
  
  // Seedance 模型特有参数：声音生成
  if (isSeedanceModel.value) {
    formData.append('seedance_generate_audio', seedanceSoundEnabled.value ? 'true' : 'false')
    console.log('[VideoNode] Seedance 生成声音:', seedanceSoundEnabled.value)
  }
  
  // 如果有参考图片，添加图片 URL
  if (finalImages.length > 0) {
    for (const imageUrl of finalImages) {
      formData.append('image_urls', imageUrl)
    }
  }
  
  const response = await fetch('/api/videos/generate', {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.message || data.error || '生成失败')
  }
  
  return data
}

// 创建新的视频节点用于接收新任务（当前节点正在生成中时使用）
function createNewOutputNode() {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null
  
  const stackOffset = 20 // 偏移量
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + stackOffset,
    y: currentNode.position.y + stackOffset
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'video',
    position: newNodePosition,
    data: {
      title: t('canvas.nodes.video'),
      status: 'idle',
      prompt: promptText.value,
      model: selectedModel.value,
      aspectRatio: selectedAspectRatio.value,
      duration: selectedDuration.value,
      generationMode: generationMode.value,
      referenceImages: referenceImages.value,
      // 复制上游连接信息
      hasUpstream: props.data.hasUpstream,
      inheritedData: props.data.inheritedData,
      imageOrder: props.data.imageOrder
    }
  })
  
  // 复制上游连接到新节点
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  upstreamEdges.forEach(edge => {
    canvasStore.addEdge({
      id: `edge_${edge.source}_${newNodeId}`,
      source: edge.source,
      target: newNodeId,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle
    })
  })
  
  console.log('[VideoNode] 创建新输出节点:', newNodeId)
  return newNodeId
}

// 单个节点执行生成任务（后台轮询，不阻塞UI）
async function executeNodeGeneration(nodeId, finalPrompt, finalImages, taskIndex) {
  try {
    // 清除旧的任务 ID，避免角色创建时使用过期的 ID
    canvasStore.updateNodeData(nodeId, { 
      status: 'processing',
      progress: '排队中...',
      taskId: null,
      soraTaskId: null
    })
    
    const result = await sendGenerateRequest(finalPrompt, finalImages)
    const taskId = result.task_id || result.id
    
    if (taskId) {
      console.log(`[VideoNode] 任务 ${taskIndex + 1} 已提交:`, taskId)
      
      // 注册到后台任务管理器（即使用户离开画布也继续执行）
      const currentTab = canvasStore.getCurrentTab()
      registerTask({
        taskId,
        type: 'video',
        nodeId,
        tabId: currentTab?.id,
        metadata: {
          prompt: finalPrompt,
          model: selectedModel.value,
          aspectRatio: selectedAspectRatio.value
        }
      })
      
      // 后台轮询，不阻塞
      // 🔥 错峰模式传入特殊轮询策略参数
      const isOffPeakTask = isViduModel.value && viduOffPeak.value
      pollVideoTaskForNode(taskId, nodeId, isOffPeakTask, Date.now()).catch(error => {
        console.error(`[VideoNode] 任务 ${taskIndex + 1} 轮询失败:`, error)
        canvasStore.updateNodeData(nodeId, {
          status: 'error',
          error: error.message
        })
      })
      
      // 任务已提交，立即返回 taskId（不等待轮询结果）
      return taskId
    } else if (result.video_url || result.url) {
      canvasStore.updateNodeData(nodeId, {
        status: 'success',
        output: {
          type: 'video',
          url: result.video_url || result.url
        }
      })
      return result.video_url || result.url
    }
    
    throw new Error('未获取到生成结果')
  } catch (error) {
    console.error(`[VideoNode] 任务 ${taskIndex + 1} 失败:`, error)
    canvasStore.updateNodeData(nodeId, {
      status: 'error',
      error: error.message
    })
    return null
  }
}

// 计算错峰模式的轮询间隔
function getOffPeakPollInterval(taskCreatedAt) {
  const elapsed = Date.now() - taskCreatedAt
  const ONE_HOUR = 60 * 60 * 1000
  
  if (elapsed < ONE_HOUR) {
    // 前1小时：正常轮询（5秒）
    return 5000
  } else {
    // 1小时后：每10分钟轮询一次
    return 10 * 60 * 1000
  }
}

// 轮询视频任务状态（针对特定节点）
async function pollVideoTaskForNode(taskId, nodeId, isOffPeak = false, taskCreatedAt = null) {
  const token = localStorage.getItem('token')
  // 错峰模式：最长48小时；普通模式：45分钟（与后端超时一致）
  const MAX_POLL_TIME = isOffPeak ? 48 * 60 * 60 * 1000 : 45 * 60 * 1000
  const NORMAL_POLL_INTERVAL = 4000 // 普通模式4秒轮询一次
  const startTime = taskCreatedAt || Date.now()
  
  return new Promise((resolve, reject) => {
    // 轮询状态：用于处理临时URL等待云存储URL的场景
    const pollState = {
      waitedForCloudUrl: false,
      cloudUrlWaitCount: 0
    }
    
    const poll = async () => {
      try {
        // 检查超时
        if (Date.now() - startTime > MAX_POLL_TIME) {
          reject(new Error(isOffPeak ? '错峰模式生成超时（48小时），请联系客服' : '生成超时，请稍后在历史记录中查看'))
          return
        }
        
        // 计算本次轮询间隔
        const pollInterval = isOffPeak ? getOffPeakPollInterval(startTime) : NORMAL_POLL_INTERVAL
        
        const response = await fetch(`/api/videos/task/${taskId}`, {
          headers: { 
            ...getTenantHeaders(), 
            ...(token ? { Authorization: `Bearer ${token}` } : {}) 
          }
        })
        
        if (!response.ok) {
          reject(new Error('查询任务状态失败'))
          return
        }
        
        const data = await response.json()
        console.log(`[VideoNode] 节点 ${nodeId} 任务状态:`, data)
        
        // 更新进度
        canvasStore.updateNodeData(nodeId, { 
          progress: data.progress || '生成中...'
        })
        
        // 检查完成状态
        const status = (data.status || '').toLowerCase()
        if (status === 'completed' || status === 'success') {
          const videoUrl = data.video_url || data.url
          if (videoUrl) {
            // 检查是否是临时外部URL（如即梦视频的capcut.com URL）
            // 这些临时URL可能有跨域问题或会过期，需要等待后端上传到云存储
            const isTemporaryUrl = videoUrl.includes('capcut.com') || 
                                   videoUrl.includes('bytedance.com') ||
                                   videoUrl.includes('douyinvod.com')
            
            // 如果是临时URL，且还没有等待过云存储URL，继续轮询几次
            if (isTemporaryUrl && !pollState.waitedForCloudUrl) {
              pollState.cloudUrlWaitCount = (pollState.cloudUrlWaitCount || 0) + 1
              // 最多额外等待3次（约12秒），让后端完成异步上传
              if (pollState.cloudUrlWaitCount <= 3) {
                console.log(`[VideoNode] 检测到临时URL，等待云存储URL (第${pollState.cloudUrlWaitCount}次)...`)
                setTimeout(poll, pollInterval)
                return
              }
              pollState.waitedForCloudUrl = true
              console.log('[VideoNode] 云存储URL等待超时，使用临时URL')
            }
            
            canvasStore.updateNodeData(nodeId, {
              status: 'success',
              output: {
                type: 'video',
                url: videoUrl
              },
              // 保存任务 ID，用于角色创建等功能
              taskId: taskId,
              soraTaskId: data.task_id || taskId
            })
            resolve(videoUrl)
            return
          }
        }
        
        // 检查失败状态
        if (status === 'failed' || status === 'failure' || status === 'error') {
          reject(new Error(data.fail_reason || '视频生成失败'))
          return
        }
        
        // 继续轮询（错峰模式会动态调整间隔）
        if (isOffPeak) {
          const nextInterval = getOffPeakPollInterval(startTime)
          console.log(`[VideoNode] 错峰模式轮询 | 已过: ${Math.round((Date.now() - startTime) / 60000)}分钟 | 下次间隔: ${nextInterval / 1000}秒`)
          setTimeout(poll, nextInterval)
        } else {
          setTimeout(poll, pollInterval)
        }
        
      } catch (error) {
        reject(error)
      }
    }
    
    // 开始轮询
    poll()
  })
}

// 开始生成
async function handleGenerate() {
  // 动态获取上游节点的最新数据
  const upstreamData = getUpstreamData()
  const userPrompt = promptText.value.trim()
  
  // 拼接提示词：上游提示词（可能有多个）+ 用户输入的提示词
  const upstreamPromptText = upstreamData.prompts.join('\n')
  let finalPrompt = ''
  if (upstreamPromptText && userPrompt) {
    // 两者都有，拼接在一起
    finalPrompt = `${upstreamPromptText}\n${userPrompt}`
  } else {
    // 只有一个，使用其中一个或继承数据
    finalPrompt = upstreamPromptText || userPrompt || inheritedPrompt.value
  }
  
  // 合并参考图片：上游图片 > 继承图片 > 已设置的参考图
  let finalImages = upstreamData.images.length > 0 ? upstreamData.images : referenceImages.value
  
  console.log('[VideoNode] 生成参数（处理前）:', { 
    userPrompt,
    upstreamPrompts: upstreamData.prompts,
    upstreamPromptText,
    finalPrompt,
    upstreamImages: upstreamData.images,
    finalImages,
    model: selectedModel.value,
    duration: selectedDuration.value,
    count: selectedCount.value,
    currentStatus: props.data.status
  })
  
  if (!finalPrompt && finalImages.length === 0) {
    await showAlert('请输入提示词或连接参考图片', '提示')
    return
  }
  
  // 🔥 关键：确保所有参考图片都是 AI 模型可访问的公开 URL
  if (finalImages.length > 0) {
    console.log('[VideoNode] 处理参考图片 URL，确保可访问性...')
    finalImages = await ensureAccessibleUrls(finalImages)
    console.log('[VideoNode] 处理后的可访问 URLs:', finalImages)
  }
  
  // 检查总积分是否足够（单次消耗 * 次数）
  const totalCost = pointsCost.value * selectedCount.value
  if (userPoints.value < totalCost) {
    await showInsufficientPointsDialog(totalCost, userPoints.value, selectedCount.value)
    return
  }
  
  // 检查并发限制
  if (selectedCount.value > userConcurrentLimit.value) {
    await showAlert(`您的套餐最大支持 ${userConcurrentLimit.value} 次并发，请升级套餐`, '并发限制')
    return
  }
  
  isGenerating.value = true
  errorMessage.value = ''
  
  const generateCount = selectedCount.value
  
  // 🔥 核心逻辑：如果当前节点正在处理中，创建新节点来接收新任务
  let targetNodeId = props.id
  if (props.data.status === 'processing') {
    const newNodeId = createNewOutputNode()
    if (newNodeId) {
      targetNodeId = newNodeId
      // 选中新创建的节点
      canvasStore.selectNode(newNodeId)
      console.log('[VideoNode] 当前节点正在生成，创建新节点接收任务:', newNodeId)
    }
  }
  
  // 多批次生成时，创建堆叠的输出节点
  let allNodeIds = [targetNodeId]
  if (generateCount > 1) {
    // 对于目标节点创建额外的堆叠节点
    const currentNode = canvasStore.nodes.find(n => n.id === targetNodeId)
    if (currentNode) {
      for (let i = 1; i < generateCount; i++) {
        const stackedNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const stackOffset = 8
        canvasStore.addNode({
          id: stackedNodeId,
          type: 'video',
          position: {
            x: currentNode.position.x + stackOffset * i,
            y: currentNode.position.y + stackOffset * i
          },
          zIndex: -i,
          data: {
            title: `Video ${i + 1}`,
            status: 'pending',
            isStackedNode: true,
            stackIndex: i,
            parentNodeId: targetNodeId,
            prompt: promptText.value,
            model: selectedModel.value,
            aspectRatio: selectedAspectRatio.value,
            duration: selectedDuration.value,
            generationMode: generationMode.value,
            referenceImages: referenceImages.value
          }
        })
        allNodeIds.push(stackedNodeId)
      }
      console.log('[VideoNode] 创建堆叠节点:', allNodeIds.slice(1))
    }
  }
  
  // 更新目标节点状态，清除旧的任务 ID
  canvasStore.updateNodeData(targetNodeId, { 
    status: 'processing',
    progress: generateCount > 1 ? `并行生成 ${generateCount} 个视频...` : '排队中...',
    taskId: null,
    soraTaskId: null
  })
  
  try {
    // 提交所有任务（任务提交后立即返回，不等待完成）
    const submitPromises = allNodeIds.map((nodeId, index) => {
      return new Promise(async (resolve) => {
        // 间隔发送请求
        if (index > 0) {
          await delay(CONCURRENT_INTERVAL * index)
        }
        const result = await executeNodeGeneration(nodeId, finalPrompt, finalImages, index)
        resolve(result)
      })
    })
    
    // 等待所有任务提交完成（不是等待任务结果完成）
    const allResults = await Promise.all(submitPromises)
    const successResults = allResults.filter(r => r !== null)
    
    console.log('[VideoNode] 全部任务已提交:', successResults.length, '/', generateCount)
    
    if (successResults.length === 0) {
      throw new Error('所有任务提交都失败了')
    }
    
    // 任务提交成功后，立即恢复按钮状态，允许用户继续发起新任务
    isGenerating.value = false
    
    // 刷新用户积分
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
  } catch (error) {
    console.error('[VideoNode] 生成失败:', error)
    errorMessage.value = error.message || '生成失败'
    canvasStore.updateNodeData(targetNodeId, {
      status: 'error',
      error: error.message
    })
    isGenerating.value = false
  }
}

// 轮询视频任务状态
async function pollVideoTask(taskId, isOffPeak = false, taskCreatedAt = null) {
  const token = localStorage.getItem('token')
  // 错峰模式：最长48小时；普通模式：10分钟
  const MAX_POLL_TIME = isOffPeak ? 48 * 60 * 60 * 1000 : 600000
  const NORMAL_POLL_INTERVAL = 4000 // 普通模式4秒轮询一次
  const startTime = taskCreatedAt || Date.now()
  
  // 轮询状态：用于处理临时URL等待云存储URL的场景
  const pollState = {
    waitedForCloudUrl: false,
    cloudUrlWaitCount: 0
  }
  
  const poll = async () => {
    try {
      // 计算本次轮询间隔
      const pollInterval = isOffPeak ? getOffPeakPollInterval(startTime) : NORMAL_POLL_INTERVAL
      
      // 检查超时
      if (Date.now() - startTime > MAX_POLL_TIME) {
        throw new Error(isOffPeak ? '错峰模式生成超时（48小时），请联系客服' : '生成超时，请稍后在历史记录中查看')
      }
      
      const response = await fetch(`/api/videos/task/${taskId}`, {
        headers: { 
          ...getTenantHeaders(), 
          ...(token ? { Authorization: `Bearer ${token}` } : {}) 
        }
      })
      
      if (!response.ok) {
        throw new Error('查询任务状态失败')
      }
      
      const data = await response.json()
      console.log('[VideoNode] 任务状态:', data)
      
      // 更新进度
      canvasStore.updateNodeData(props.id, { 
        progress: data.progress || '生成中...'
      })
      
      // 检查完成状态
      const status = (data.status || '').toLowerCase()
      if (status === 'completed' || status === 'success') {
        const videoUrl = data.video_url || data.url
        if (videoUrl) {
          // 检查是否是临时外部URL（如即梦视频的capcut.com URL）
          const isTemporaryUrl = videoUrl.includes('capcut.com') || 
                                 videoUrl.includes('bytedance.com') ||
                                 videoUrl.includes('douyinvod.com')
          
          // 如果是临时URL，且还没有等待过云存储URL，继续轮询几次
          if (isTemporaryUrl && !pollState.waitedForCloudUrl) {
            pollState.cloudUrlWaitCount++
            if (pollState.cloudUrlWaitCount <= 3) {
              console.log(`[VideoNode] 检测到临时URL，等待云存储URL (第${pollState.cloudUrlWaitCount}次)...`)
              setTimeout(poll, pollInterval)
              return
            }
            pollState.waitedForCloudUrl = true
            console.log('[VideoNode] 云存储URL等待超时，使用临时URL')
          }
          
          canvasStore.updateNodeData(props.id, {
            status: 'success',
            output: {
              type: 'video',
              url: videoUrl
            },
            // 保存任务 ID，用于角色创建等功能
            taskId: taskId,
            soraTaskId: data.task_id || taskId
          })
          isGenerating.value = false
          return
        }
      }
      
      // 检查失败状态
      if (status === 'failed' || status === 'failure' || status === 'error') {
        throw new Error(data.fail_reason || '视频生成失败')
      }
      
      // 继续轮询（错峰模式会动态调整间隔）
      if (isOffPeak) {
        const nextInterval = getOffPeakPollInterval(startTime)
        console.log(`[VideoNode] 错峰模式轮询 | 已过: ${Math.round((Date.now() - startTime) / 60000)}分钟 | 下次间隔: ${nextInterval / 1000}秒`)
        setTimeout(poll, nextInterval)
      } else {
        setTimeout(poll, pollInterval)
      }
      
    } catch (error) {
      console.error('[VideoNode] 轮询失败:', error)
      errorMessage.value = error.message || '生成失败'
      canvasStore.updateNodeData(props.id, {
        status: 'error',
        error: error.message
      })
      isGenerating.value = false
    }
  }
  
  // 开始轮询
  poll()
}

// 重新生成
function handleRegenerate() {
  canvasStore.updateNodeData(props.id, { 
    status: 'idle',
    output: null,
    error: null
  })
}

// 处理键盘事件
function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleGenerate()
  }
}

// 开始调整尺寸
function handleResizeStart(handle, event) {
  event.stopPropagation()
  event.preventDefault()
  
  isResizing.value = true
  resizeHandle.value = handle
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: nodeWidth.value,
    height: nodeHeight.value
  }
  
  document.addEventListener('mousemove', handleResizeMove)
  document.addEventListener('mouseup', handleResizeEnd)
}

function handleResizeMove(event) {
  if (!isResizing.value) return
  
  // 使用 requestAnimationFrame 节流，提高拖拽流畅度
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId)
  }
  
  const clientX = event.clientX
  const clientY = event.clientY
  
  resizeRafId = requestAnimationFrame(() => {
    if (!isResizing.value) return
    
    const deltaX = clientX - resizeStart.value.x
    const deltaY = clientY - resizeStart.value.y
    
    const viewport = canvasStore.viewport
    const zoom = viewport.zoom || 1
    
    if (resizeHandle.value === 'right' || resizeHandle.value === 'corner') {
      nodeWidth.value = Math.max(320, resizeStart.value.width + deltaX / zoom)
    }
    
    if (resizeHandle.value === 'bottom' || resizeHandle.value === 'corner') {
      nodeHeight.value = Math.max(200, resizeStart.value.height + deltaY / zoom)
    }
    
    // 实时更新连线位置
    updateNodeInternals(props.id)
    
    resizeRafId = null
  })
}

function handleResizeEnd() {
  // 取消未执行的 RAF
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId)
    resizeRafId = null
  }
  
  isResizing.value = false
  resizeHandle.value = null
  
  canvasStore.updateNodeData(props.id, {
    width: nodeWidth.value,
    height: nodeHeight.value
  })
  
  // 更新节点内部状态，确保连线位置跟随 Handle 位置变化
  nextTick(() => {
    updateNodeInternals(props.id)
  })
  
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
}

// ========== 首尾帧图片/视频拖拽上传 ==========
// 后台异步上传图片 - 上传完成后静默更新节点URL
async function uploadImageFileAsync(file, blobUrl, nodeId) {
  try {
    console.log('[VideoNode] 后台异步上传开始:', file.name)
    
    if (file.size > 10 * 1024 * 1024) {
      console.warn('[VideoNode] 文件过大，保持使用 blob URL')
      return
    }
    
    const urls = await uploadImages([file])
    if (urls && urls.length > 0) {
      const serverUrl = urls[0]
      console.log('[VideoNode] 后台上传成功，服务器URL:', serverUrl)
      
      // 静默更新节点中的 URL
      const currentNode = canvasStore.nodes.find(n => n.id === nodeId)
      if (currentNode?.data?.sourceImages?.includes(blobUrl)) {
        const updatedSourceImages = currentNode.data.sourceImages.map(
          url => url === blobUrl ? serverUrl : url
        )
        canvasStore.updateNodeData(nodeId, { sourceImages: updatedSourceImages })
        console.log('[VideoNode] 已静默更新 sourceImages')
      }
      
      // 释放 blob URL 内存
      URL.revokeObjectURL(blobUrl)
    }
  } catch (error) {
    console.warn('[VideoNode] 后台上传失败，保持使用 blob URL:', error.message)
  }
}

// 后台异步上传视频 - 上传完成后静默更新节点URL
async function uploadVideoFileAsync(file, blobUrl, nodeId) {
  try {
    console.log('[VideoNode] 后台异步上传视频开始:', file.name)
    
    // 视频文件可能较大，放宽限制到 100MB
    if (file.size > 100 * 1024 * 1024) {
      console.warn('[VideoNode] 视频文件过大，保持使用 blob URL')
      return
    }
    
    // 使用 FormData 上传视频
    const formData = new FormData()
    formData.append('video', file)
    
    const response = await fetch('/api/upload/video', {
      method: 'POST',
      headers: getTenantHeaders(),
      body: formData
    })
    
    if (response.ok) {
      const result = await response.json()
      const serverUrl = result.url || result.video_url
      if (serverUrl) {
        console.log('[VideoNode] 视频后台上传成功，服务器URL:', serverUrl)
        
        // 静默更新节点中的 URL
        const currentNode = canvasStore.nodes.find(n => n.id === nodeId)
        if (currentNode?.data?.sourceVideo === blobUrl) {
          canvasStore.updateNodeData(nodeId, { sourceVideo: serverUrl })
          console.log('[VideoNode] 已静默更新 sourceVideo')
        }
        
        // 释放 blob URL 内存
        URL.revokeObjectURL(blobUrl)
      }
    }
  } catch (error) {
    console.warn('[VideoNode] 视频后台上传失败，保持使用 blob URL:', error.message)
  }
}

// 触发文件选择并创建左侧图片节点
function triggerFrameUpload() {
  if (frameInputRef.value) {
    frameInputRef.value.click()
  }
}

// 处理文件选择 - 直接创建上游图片/视频节点（秒加载优化）
async function handleFrameFileChange(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  // 先将 FileList 转换为数组
  const fileArray = Array.from(files)
  
  console.log('[VideoNode] 处理参考文件上传，文件数量:', fileArray.length)
  event.target.value = '' // 重置 input
  
  try {
    for (const file of fileArray) {
      if (file.type.startsWith('image/')) {
        // 🚀 图片秒加载：立即使用 blob URL
        const blobUrl = URL.createObjectURL(file)
        console.log('[VideoNode] 图片秒加载 - blob URL:', blobUrl)
        
        // 立即创建上游节点（使用 blob URL）
        const nodeId = createUpstreamImageNode(blobUrl)
        
        // 🔄 后台异步上传
        if (nodeId) {
          uploadImageFileAsync(file, blobUrl, nodeId)
        }
      } else if (file.type.startsWith('video/')) {
        // 🎬 视频秒加载：立即使用 blob URL
        const blobUrl = URL.createObjectURL(file)
        console.log('[VideoNode] 视频秒加载 - blob URL:', blobUrl)
        
        // 立即创建上游视频节点（使用 blob URL）
        const nodeId = createUpstreamVideoNode(blobUrl)
        
        // 🔄 后台异步上传
        if (nodeId) {
          uploadVideoFileAsync(file, blobUrl, nodeId)
        }
      }
    }
  } catch (error) {
    console.error('[VideoNode] 上传失败:', error)
  }
}

// 创建上游图片节点 - 返回创建的节点ID
function createUpstreamImageNode(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null
  
  // 计算新节点位置（在当前节点左侧，根据已有上游节点数量垂直排列）
  const existingUpstreamCount = canvasStore.edges.filter(e => e.target === props.id).length
  const offsetY = existingUpstreamCount * 200
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x - 500,
    y: currentNode.position.y + offsetY - 100
  }
  
  // 创建图片节点 - 使用 image-input 类型，与拖拽上传和文件选择器保持一致
  canvasStore.addNode({
    id: newNodeId,
    type: 'image-input',
    position: newNodePosition,
    data: {
      title: `参考图 ${existingUpstreamCount + 1}`,
      nodeRole: 'source',
      sourceImages: [imageUrl]
    }
  })
  
  // 创建连接
  canvasStore.addEdge({
    id: `edge_${newNodeId}_${props.id}`,
    source: newNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  return newNodeId
  
  // 更新图片顺序
  const currentOrder = props.data.imageOrder || [...referenceImages.value]
  canvasStore.updateNodeData(props.id, {
    imageOrder: [...currentOrder, imageUrl],
    hasUpstream: true
  })
}

// 创建上游视频节点 - 返回创建的节点ID（用于视频参考/视频转视频）
function createUpstreamVideoNode(videoUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null
  
  // 计算新节点位置（在当前节点左侧，根据已有上游节点数量垂直排列）
  const existingUpstreamCount = canvasStore.edges.filter(e => e.target === props.id).length
  const offsetY = existingUpstreamCount * 200
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x - 500,
    y: currentNode.position.y + offsetY - 100
  }
  
  // 创建视频输入节点 - 使用 video-input 类型
  canvasStore.addNode({
    id: newNodeId,
    type: 'video-input',
    position: newNodePosition,
    data: {
      title: `参考视频 ${existingUpstreamCount + 1}`,
      nodeRole: 'source',
      sourceVideo: videoUrl,
      output: {
        type: 'video',
        url: videoUrl
      }
    }
  })
  
  // 创建连接
  canvasStore.addEdge({
    id: `edge_${newNodeId}_${props.id}`,
    source: newNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  return newNodeId
}

// 判断是否为外部文件拖拽（非内部排序）
function isExternalFileDrag(event) {
  const types = event.dataTransfer?.types || []
  // 如果是内部拖动排序，只有 text/plain
  // 如果是外部文件拖入，会有 Files
  return types.includes('Files') && !dragSortIndex.value !== -1 && dragSortIndex.value === -1
}

// 拖拽进入（仅处理外部文件）
function handleFrameDragEnter(event) {
  // 如果是内部排序拖拽，不处理
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  
  // 只在外部文件拖入时显示覆盖层
  if (event.dataTransfer?.types?.includes('Files')) {
    dragCounter.value++
    isDragOver.value = true
  }
}

// 拖拽悬停（仅处理外部文件）
function handleFrameDragOver(event) {
  event.preventDefault()
  
  // 如果是内部排序拖拽，设置为 move 效果
  if (dragSortIndex.value !== -1) {
    event.dataTransfer.dropEffect = 'move'
    return
  }
  
  // 外部文件拖入，设置为 copy 效果
  if (event.dataTransfer?.types?.includes('Files')) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

// 拖拽离开（仅处理外部文件）
function handleFrameDragLeave(event) {
  // 如果是内部排序拖拽，不处理
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  dragCounter.value--
  if (dragCounter.value === 0) {
    isDragOver.value = false
  }
}

// 拖拽放置 - 仅处理外部文件上传（支持图片和视频）
async function handleFrameDrop(event) {
  // 如果是内部排序拖拽，不在这里处理（由 handleImageDrop 处理）
  if (dragSortIndex.value !== -1) {
    return
  }
  
  event.preventDefault()
  event.stopPropagation()
  isDragOver.value = false
  dragCounter.value = 0
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  try {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // 🚀 图片秒加载：立即使用 blob URL
        const blobUrl = URL.createObjectURL(file)
        console.log('[VideoNode] 拖拽上传图片 - 秒加载 blob URL:', blobUrl)
        
        // 立即创建上游节点
        const nodeId = createUpstreamImageNode(blobUrl)
        
        // 🔄 后台异步上传
        if (nodeId) {
          uploadImageFileAsync(file, blobUrl, nodeId)
        }
      } else if (file.type.startsWith('video/')) {
        // 🎬 视频秒加载：立即使用 blob URL
        const blobUrl = URL.createObjectURL(file)
        console.log('[VideoNode] 拖拽上传视频 - 秒加载 blob URL:', blobUrl)
        
        // 立即创建上游视频节点
        const nodeId = createUpstreamVideoNode(blobUrl)
        
        // 🔄 后台异步上传
        if (nodeId) {
          uploadVideoFileAsync(file, blobUrl, nodeId)
        }
      }
    }
  } catch (error) {
    console.error('[VideoNode] 拖拽上传失败:', error)
  }
}

// 更新参考图片（并在左侧创建对应的图片节点）
// 删除某张参考图片
function removeReferenceImage(index) {
  const currentImages = [...(referenceImages.value || [])]
  const removedImage = currentImages[index]
  currentImages.splice(index, 1)
  
  // 更新图片顺序
  canvasStore.updateNodeData(props.id, {
    imageOrder: currentImages,
    hasUpstream: currentImages.length > 0
  })
  
  // 查找并删除对应的上游节点和连接
  const edgesToRemove = []
  const nodesToRemove = []
  
  canvasStore.edges.forEach(edge => {
    if (edge.target === props.id) {
      const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
      if (sourceNode?.data?.sourceImages?.includes(removedImage)) {
        edgesToRemove.push(edge.id)
        nodesToRemove.push(sourceNode.id)
      }
    }
  })
  
  // 删除连接和节点
  edgesToRemove.forEach(edgeId => canvasStore.removeEdge(edgeId))
  nodesToRemove.forEach(nodeId => canvasStore.removeNode(nodeId))
}

// ========== 图片列表拖拽排序 ==========
// 阻止图片项的 mousedown 事件冒泡，防止触发节点拖拽
function handleImageMouseDown(event) {
  event.stopPropagation()
}

function handleImageDragStart(event, index) {
  event.stopPropagation()
  dragSortIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index.toString())
  // 添加拖拽样式
  event.target.classList.add('dragging')
}

function handleImageDragOver(event, index) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
}

function handleImageDragLeave(event) {
  // 只在离开整个元素时才重置
  if (!event.currentTarget.contains(event.relatedTarget)) {
    dragOverIndex.value = -1
  }
}

function handleImageDrop(event, dropIndex) {
  event.preventDefault()
  const dragIndex = dragSortIndex.value
  
  if (dragIndex === -1 || dragIndex === dropIndex) {
    resetDragState()
    return
  }
  
  // 重新排序图片
  const images = [...(referenceImages.value || [])]
  const [draggedImage] = images.splice(dragIndex, 1)
  images.splice(dropIndex, 0, draggedImage)
  
  // 保存新的图片顺序到节点数据
  canvasStore.updateNodeData(props.id, {
    imageOrder: images
  })
  
  resetDragState()
}

function handleImageDragEnd(event) {
  event.target.classList.remove('dragging')
  resetDragState()
}

function resetDragState() {
  dragSortIndex.value = -1
  dragOverIndex.value = -1
}

// 右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: 'video', position: { x: 0, y: 0 }, data: props.data }
  )
}

// ========== 添加按钮交互（单击/长按） ==========
const LONG_PRESS_DURATION = 300 // 长按阈值（毫秒）
let pressTimer = null
let isLongPress = false
let pressStartPos = { x: 0, y: 0 }

// 左侧添加按钮
function handleAddLeftClick(event) {
  event.stopPropagation()
  canvasStore.openNodeSelector(
    { x: event.clientX, y: event.clientY },
    'node-left',
    props.id
  )
}

// 右侧添加按钮 - 鼠标按下（开始检测长按）
function handleAddRightMouseDown(event) {
  event.stopPropagation()
  event.preventDefault()
  
  isLongPress = false
  pressStartPos = { x: event.clientX, y: event.clientY }
  
  // 设置长按定时器
  pressTimer = setTimeout(() => {
    isLongPress = true
    // 长按：开始拖拽连线
    startDragConnection(event)
  }, LONG_PRESS_DURATION)
  
  // 添加鼠标移动和释放监听
  document.addEventListener('mousemove', handleAddRightMouseMove)
  document.addEventListener('mouseup', handleAddRightMouseUp)
}

// 右侧添加按钮 - 鼠标移动（如果移动了就开始连线）
function handleAddRightMouseMove(event) {
  const dx = event.clientX - pressStartPos.x
  const dy = event.clientY - pressStartPos.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  // 如果移动超过 5px，认为是拖拽，立即开始连线
  if (distance > 5 && !isLongPress) {
    clearTimeout(pressTimer)
    isLongPress = true
    startDragConnection(event)
  }
}

// 右侧添加按钮 - 鼠标释放
function handleAddRightMouseUp(event) {
  clearTimeout(pressTimer)
  document.removeEventListener('mousemove', handleAddRightMouseMove)
  document.removeEventListener('mouseup', handleAddRightMouseUp)
  
  if (!isLongPress) {
    // 短按：打开节点选择器
    canvasStore.openNodeSelector(
      { x: event.clientX, y: event.clientY },
      'node',
      props.id
    )
  }
}

// 开始拖拽连线 - 直接调用 store 方法
function startDragConnection(event) {
  // 获取当前节点在 store 中的数据
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) {
    console.warn('[VideoNode] 未找到当前节点')
    return
  }
  
  // 计算节点右侧输出端口的画布坐标（从节点位置计算）
  // 节点位置 + 节点宽度 + 偏移量 = +号按钮中心位置，Y 轴在节点中间 + 标签高度偏移
  const currentNodeWidth = props.data?.width || nodeWidth.value || 420
  const currentNodeHeight = props.data?.height || nodeHeight.value || 280
  const labelOffset = 28 // 标签高度偏移
  const handleOffset = 34 // +号按钮中心相对于节点卡片边缘的偏移量
  
  const outputX = currentNode.position.x + currentNodeWidth + handleOffset
  const outputY = currentNode.position.y + labelOffset + currentNodeHeight / 2
  
  console.log('[VideoNode] 开始拖拽连线，起始位置:', { outputX, outputY, nodePosition: currentNode.position })
  
  // 调用 store 开始拖拽连线，使用节点输出端口位置作为起点
  canvasStore.startDragConnection(props.id, 'output', { x: outputX, y: outputY })
}

// 兼容旧的点击事件（备用）
function handleAddRightClick(event) {
  event.stopPropagation()
}

// 视频播放器引用
const videoPlayerRef = ref(null)

// 全屏预览状态
const isFullscreenPreview = ref(false)

// 视频元数据加载完成
function handleVideoLoaded(event) {
  const video = event.target
  console.log('[VideoNode] 视频元数据加载完成:', {
    originalUrl: props.data.output?.url?.substring(0, 60),
    normalizedUrl: normalizedVideoUrl.value?.substring(0, 60),
    duration: video.duration,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    isCharacterNode: props.data?.isCharacterNode,
    clipStartTime: props.data?.clipStartTime
  })
  
  // 检测视频比例，如果是竖屏自动调整为 9:16
  if (video.videoWidth && video.videoHeight) {
    const isPortrait = video.videoHeight > video.videoWidth
    const currentRatio = props.data.aspectRatio || selectedAspectRatio.value
    
    // 如果视频是竖屏但当前比例是横屏，自动切换
    if (isPortrait && currentRatio !== '9:16') {
      console.log('[VideoNode] 检测到竖屏视频，自动切换为 9:16 比例')
      selectedAspectRatio.value = '9:16'
      // 调整节点尺寸为竖屏比例（保持宽度，调整高度）
      const portraitWidth = 280
      const portraitHeight = 498 // 约 9:16 比例
      nodeWidth.value = portraitWidth
      nodeHeight.value = portraitHeight
      // 更新节点数据
      canvasStore.updateNodeData(props.id, {
        aspectRatio: '9:16',
        width: portraitWidth,
        height: portraitHeight
      })
    }
    // 如果视频是横屏但当前比例是竖屏，自动切换
    else if (!isPortrait && currentRatio === '9:16') {
      console.log('[VideoNode] 检测到横屏视频，自动切换为 16:9 比例')
      selectedAspectRatio.value = '16:9'
      // 调整节点尺寸为横屏比例
      const landscapeWidth = 420
      const landscapeHeight = 280
      nodeWidth.value = landscapeWidth
      nodeHeight.value = landscapeHeight
      // 更新节点数据
      canvasStore.updateNodeData(props.id, {
        aspectRatio: '16:9',
        width: landscapeWidth,
        height: landscapeHeight
      })
    }
  }
  
  // 如果是角色节点（裁剪视频），设置到裁剪起始位置
  if (props.data?.isCharacterNode && props.data?.clipStartTime !== undefined) {
    video.currentTime = props.data.clipStartTime
  } else if (video.currentTime === 0) {
    // 普通视频设置到第一帧
    video.currentTime = 0.1
  }
}

// 视频可以播放时
function handleVideoCanPlay(event) {
  const video = event.target
  
  // 如果是角色节点（裁剪视频），确保在裁剪范围内
  if (props.data?.isCharacterNode && props.data?.clipStartTime !== undefined) {
    if (video.currentTime < props.data.clipStartTime) {
      video.currentTime = props.data.clipStartTime
    }
  } else if (video.currentTime === 0) {
    video.currentTime = 0.1
  }
}

// 视频时间更新 - 用于角色节点裁剪视频循环播放
function handleVideoTimeUpdate(event) {
  const video = event.target
  
  // 如果是角色节点（裁剪视频），在裁剪范围内循环播放
  if (props.data?.isCharacterNode && props.data?.clipEndTime !== undefined) {
    if (video.currentTime >= props.data.clipEndTime) {
      // 播放到结束时间，跳回起始时间
      video.currentTime = props.data.clipStartTime || 0
    }
  }
}

// 视频加载错误处理 - 自动重新获取最新视频URL
// 用于处理即梦等视频API返回临时URL后，后端异步上传到云存储的场景
let videoRetryCount = 0
const MAX_VIDEO_RETRY = 3

async function handleVideoError(event) {
  const video = event.target
  const error = video.error
  const taskId = props.data?.taskId || props.data?.soraTaskId
  
  console.error('[VideoNode] 视频加载失败:', {
    originalUrl: props.data.output?.url?.substring(0, 60),
    normalizedUrl: normalizedVideoUrl.value?.substring(0, 60),
    errorCode: error?.code,
    errorMessage: error?.message,
    taskId,
    retryCount: videoRetryCount
  })
  
  // 如果有任务ID且还有重试次数，尝试重新获取最新的视频URL
  if (taskId && videoRetryCount < MAX_VIDEO_RETRY) {
    videoRetryCount++
    console.log(`[VideoNode] 尝试重新获取视频URL (第${videoRetryCount}次)...`)
    
    try {
      // 等待2秒后重试（给后端时间完成异步上传）
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/videos/task/${taskId}`, {
        headers: { 
          ...getTenantHeaders(), 
          ...(token ? { Authorization: `Bearer ${token}` } : {}) 
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        const newVideoUrl = data.video_url || data.url
        
        // 如果获取到新的视频URL且与当前不同，更新节点
        if (newVideoUrl && newVideoUrl !== props.data.output?.url) {
          console.log('[VideoNode] 获取到新的视频URL:', newVideoUrl.substring(0, 60))
          canvasStore.updateNodeData(props.id, {
            output: {
              type: 'video',
              url: newVideoUrl
            }
          })
          // 重置重试计数（新URL可能也需要重试）
          videoRetryCount = 0
          return
        }
      }
    } catch (e) {
      console.error('[VideoNode] 重新获取视频URL失败:', e.message)
    }
  }
  
  // 超过最大重试次数，显示错误状态
  if (videoRetryCount >= MAX_VIDEO_RETRY) {
    console.error('[VideoNode] 视频重试次数已达上限，标记为错误状态')
    // 不直接更新为错误状态，保留视频预览区域让用户可以手动重试
  }
}

// 鼠标进入视频区域 - 自动播放（带声音）
function handleVideoMouseEnter() {
  // 🚀 性能优化：拖拽时不自动播放视频
  if (isCanvasDragging.value) return
  
  const video = videoPlayerRef.value
  if (video && video.paused) {
    video.muted = false // 悬停播放时取消静音，播放声音
    video.play().catch(e => {
      // 如果带声音播放失败（浏览器自动播放策略），则尝试静音播放
      console.log('[VideoNode] 带声音播放失败，尝试静音播放:', e.message)
      video.muted = true
      video.play().catch(err => {
        console.log('[VideoNode] 静音播放也失败:', err.message)
      })
    })
  }
}

// 鼠标离开视频区域 - 暂停并回到起始位置
function handleVideoMouseLeave() {
  const video = videoPlayerRef.value
  if (video && !video.paused) {
    video.pause()
    // 如果是角色节点，回到裁剪起始位置；否则回到第一帧
    if (props.data?.isCharacterNode && props.data?.clipStartTime !== undefined) {
      video.currentTime = props.data.clipStartTime
    } else {
      video.currentTime = 0.1
    }
  }
}

// 打开全屏预览
function openFullscreenPreview() {
  if (normalizedVideoUrl.value) {
    isFullscreenPreview.value = true
  }
}

// 关闭全屏预览
function closeFullscreenPreview() {
  isFullscreenPreview.value = false
}

// ========== 视频工具栏 ==========
// 是否显示工具栏（选中且有视频内容）- 与 ImageNode 保持一致
const showToolbar = computed(() => {
  if (!props.selected) return false
  return hasOutput.value
})

// 视频裁剪编辑器状态
const showClipEditor = ref(false)

// 关键帧编辑器状态
const showKeyframeEditor = ref(false)

// 高清处理状态（仅用于按钮禁用状态，任务由 backgroundTaskManager 管理）
const isHDProcessing = ref(false)

// 工具栏处理函数 - 高清放大（异步任务模式）
async function handleToolbarHD() {
  console.log('[VideoNode] 工具栏：高清', props.id)
  
  const originalVideoUrl = props.data.output?.url
  if (!originalVideoUrl && !normalizedVideoUrl.value) {
    showToast('没有可处理的视频', 'error')
    return
  }
  
  if (isHDProcessing.value) {
    showToast('正在处理中，请稍候', 'warning')
    return
  }
  
  try {
    isHDProcessing.value = true
    const token = localStorage.getItem('token')
    
    // 获取要处理的视频 URL
    let videoUrlForHD = originalVideoUrl || normalizedVideoUrl.value
    
    // 检查是否是本地视频（blob URL 或 data URL 或相对路径）
    const isLocalVideo = videoUrlForHD.startsWith('blob:') || 
                         videoUrlForHD.startsWith('data:') ||
                         videoUrlForHD.startsWith('/api/')
    
    if (isLocalVideo) {
      showToast('上传视频到云端...', 'info')
      
      // 本地视频需要先上传到七牛云
      if (videoUrlForHD.startsWith('blob:')) {
        // 从 blob URL 获取视频并上传
        console.log('[VideoNode] 从 blob URL 获取视频数据...')
        let fileToUpload = props.data?.localFile
        
        if (!fileToUpload) {
          const response = await fetch(videoUrlForHD)
          const blob = await response.blob()
          fileToUpload = new File([blob], 'video.mp4', { type: blob.type || 'video/mp4' })
        }
        
        const formData = new FormData()
        formData.append('file', fileToUpload)
        
        const uploadResponse = await fetch('/api/videos/upload', {
          method: 'POST',
          headers: {
            ...getTenantHeaders(),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: formData
        })
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}))
          throw new Error(errorData.message || '视频上传失败')
        }
        
        const uploadResult = await uploadResponse.json()
        videoUrlForHD = uploadResult.url
        console.log('[VideoNode] blob视频上传成功:', videoUrlForHD)
        
      } else {
        // 相对路径或其他本地 URL，通过 API 上传到七牛云
        let videoUrlForApi = videoUrlForHD
        if (videoUrlForHD.startsWith('/api/')) {
          videoUrlForApi = getApiUrl(videoUrlForHD)
        }
        
        const uploadResponse = await fetch('/api/videos/upload-to-qiniu', {
          method: 'POST',
          headers: {
            ...getTenantHeaders(),
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ videoUrl: videoUrlForApi })
        })
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}))
          throw new Error(errorData.message || '视频上传失败')
        }
        
        const uploadResult = await uploadResponse.json()
        videoUrlForHD = uploadResult.url
        console.log('[VideoNode] 本地视频上传成功:', videoUrlForHD)
      }
    }
    
    showToast('提交高清处理任务...', 'info')
    
    // 提交异步任务（使用七牛云 URL）
    const response = await fetch('/api/videos/hd-upscale', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        videoUrl: videoUrlForHD,
        nodeId: props.id
      })
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      if (result.error === 'insufficient_points') {
        showToast('当前积分余额不足，任务提交失败', 'error')
      } else if (result.error === 'hd_not_configured') {
        showAlert('功能未配置', result.message || '视频高清功能未配置，请联系管理员')
      } else {
        showToast(result.message || '高清处理失败', 'error')
      }
      isHDProcessing.value = false
      return
    }
    
    // 获取任务 ID
    console.log('[VideoNode] 高清任务已提交:', result.taskId)
    showToast('高清任务已提交，后台处理中...', 'success')
    
    // 立即恢复按钮状态（任务在后台处理）
    isHDProcessing.value = false
    
    // 立即创建一个"生成中"状态的节点
    const hdResultNodeId = createHDProcessingNode(result.taskId)
    
    // 注册到后台任务管理器
    const currentTab = canvasStore.getCurrentTab()
    registerTask({
      taskId: result.taskId,
      type: 'video-hd',
      nodeId: hdResultNodeId, // 使用新创建的节点ID
      tabId: currentTab?.id,
      metadata: {
        sourceUrl: normalizedVideoUrl.value,
        sourceNodeId: props.id // 记录源节点ID
      }
    })
    
  } catch (error) {
    console.error('[VideoNode] 高清处理失败:', error)
    showToast(error.message || '高清处理失败', 'error')
    isHDProcessing.value = false
  }
}

// 注：高清任务轮询已由 backgroundTaskManager 统一处理，不再需要 VideoNode 内部轮询

// 创建高清处理中节点（立即显示在画布上）
function createHDProcessingNode(taskId) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null
  
  const newNodeId = `hd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + 380,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'video',
    position: newNodePosition,
    data: {
      label: '高清放大',
      title: '高清放大',
      status: 'processing',
      progress: '高清处理中...',
      taskId: taskId,
      taskType: 'video-hd',
      hdUpscaled: true,
      sourceNodeId: props.id,
      sourceUrl: normalizedVideoUrl.value
    }
  })
  
  // 创建从当前节点到新节点的连线
  const edgeId = `edge-${props.id}-${newNodeId}-${Date.now()}`
  canvasStore.addEdge({
    id: edgeId,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input',
    type: 'default'
  })
  
  console.log('[VideoNode] 创建高清处理中节点:', newNodeId)
  return newNodeId
}

// 创建高清结果节点（已废弃，改用 createHDProcessingNode + 后台任务管理器更新）
function createHDResultNode(outputUrl, pointsCost) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + 380,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'video',
    position: newNodePosition,
    data: {
      label: '高清放大',
      output: {
        url: outputUrl,
        sourceUrl: normalizedVideoUrl.value
      },
      hdUpscaled: true,
      sourceNodeId: props.id,
      pointsCost: pointsCost || 0
    }
  })
}

// 注：高清任务由 backgroundTaskManager 统一管理，组件卸载后任务继续在后台运行

function handleToolbarAnalyze() {
  console.log('[VideoNode] 工具栏：解析', props.id)
  // 待开发功能
}

function handleToolbarCreateCharacter() {
  console.log('[VideoNode] 工具栏：角色创建', props.id)
  if (!normalizedVideoUrl.value) return
  showClipEditor.value = true
}

// 工具栏：关键帧
function handleToolbarKeyframe() {
  console.log('[VideoNode] 工具栏：关键帧', props.id)
  if (!normalizedVideoUrl.value) return
  showKeyframeEditor.value = true
}

// 关闭关键帧编辑器
function closeKeyframeEditor() {
  showKeyframeEditor.value = false
}

// 确认创建关键帧节点
function handleConfirmKeyframes(data) {
  console.log('[VideoNode] 创建关键帧节点:', data)
  const { keyframes } = data
  
  if (!keyframes || keyframes.length === 0) return
  
  // 获取当前节点位置
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  const baseX = currentNode.position.x + (currentNode.style?.width || 380) + 80
  const baseY = currentNode.position.y
  const nodeGap = 220 // 节点间距
  
  // 依次创建图片节点
  const newNodeIds = []
  keyframes.forEach((kf, index) => {
    const newNodeId = `keyframe-${Date.now()}-${index}`
    const newNodePosition = {
      x: baseX,
      y: baseY + index * nodeGap
    }
    
    canvasStore.addNode({
      id: newNodeId,
      type: 'image',
      position: newNodePosition,
      data: {
        label: `关键帧 ${index + 1}`,
        title: `关键帧 ${index + 1}`,
        time: kf.time,
        urls: [kf.image],
        output: {
          type: 'image',
          urls: [kf.image]
        }
      }
    }, true)
    
    newNodeIds.push(newNodeId)
    
    // 创建从当前视频节点到新图片节点的连线
    const edgeId = `edge-${props.id}-${newNodeId}-${Date.now()}`
    canvasStore.addEdge({
      id: edgeId,
      source: props.id,
      target: newNodeId,
      sourceHandle: 'output',
      targetHandle: 'input'
    })
  })
  
  // 关闭编辑器
  closeKeyframeEditor()
  
  console.log('[VideoNode] 创建了', newNodeIds.length, '个关键帧节点')
}

// 关闭裁剪编辑器
function closeClipEditor() {
  showClipEditor.value = false
}

// 确认创建角色
async function handleConfirmCreateCharacter(clipData) {
  console.log('[VideoNode] 确认创建角色:', clipData)
  
  // 立即关闭裁剪编辑器，返回画布
  showClipEditor.value = false
  
  // 在后台异步执行创建过程
  executeCharacterCreation(clipData)
}

// 后台执行角色创建
async function executeCharacterCreation(clipData) {
  console.log('[VideoNode] 开始后台创建角色:', clipData)
  
  try {
    const token = localStorage.getItem('token')
    
    // 1. 首先裁剪视频（获取真正裁剪后的视频文件）
    console.log('[VideoNode] 开始裁剪视频片段...')
    let clippedVideoUrl = null
    
    try {
      const clipResponse = await fetch('/api/videos/clip', {
        method: 'POST',
        headers: {
          ...getTenantHeaders(),
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          videoUrl: clipData.videoUrl,
          startTime: clipData.startTime,
          endTime: clipData.endTime
        })
      })
      
      if (clipResponse.ok) {
        const clipResult = await clipResponse.json()
        clippedVideoUrl = clipResult.url
        console.log('[VideoNode] 视频裁剪成功:', clippedVideoUrl)
      } else {
        console.warn('[VideoNode] 视频裁剪失败，使用原始视频 URL 带时间范围')
        // 裁剪失败时，回退到使用媒体片段 URL
        clippedVideoUrl = `${clipData.videoUrl}#t=${clipData.startTime},${clipData.endTime}`
      }
    } catch (clipError) {
      console.warn('[VideoNode] 视频裁剪出错，使用原始视频 URL:', clipError.message)
      clippedVideoUrl = `${clipData.videoUrl}#t=${clipData.startTime},${clipData.endTime}`
    }
    
    // 更新 clipData，使用裁剪后的视频 URL
    const updatedClipData = {
      ...clipData,
      clippedVideoUrl: clippedVideoUrl
    }
    
    // 获取用户选择的创建模式（sora 或 url）
    const createMode = clipData.createMode || 'url'
    const soraTaskId = props.data?.soraTaskId || props.data?.taskId
    let qiniuVideoUrl = null
    let useTaskId = false
    
    // 根据用户选择的创建模式决定使用哪种方式
    if (createMode === 'sora' && soraTaskId) {
      // 用户选择 Sora 模式且有任务ID
      console.log('[VideoNode] 用户选择 Sora 模式，使用任务 ID:', soraTaskId)
      useTaskId = true
      // 使用裁剪后的视频 URL
      qiniuVideoUrl = clippedVideoUrl
    } else {
      // 用户选择 URL 模式，或没有任务ID时强制使用 URL 模式
      console.log('[VideoNode] 使用 URL 模式，需要上传视频到七牛云...')
      
      // 检查是否是本地视频（通过拖放上传的 Object URL 或 base64）
      const isLocalVideo = props.data?.isLocalVideo || 
                           clipData.videoUrl.startsWith('blob:') || 
                           clipData.videoUrl.startsWith('data:')
      
      if (isLocalVideo) {
        // 本地视频需要先上传到服务器
        console.log('[VideoNode] 检测到本地视频，准备上传...')
        
        let fileToUpload = props.data?.localFile
        
        // 如果没有 localFile 但有 blob URL，需要先 fetch 获取 blob
        if (!fileToUpload && clipData.videoUrl.startsWith('blob:')) {
          console.log('[VideoNode] 从 blob URL 获取视频数据...')
          const response = await fetch(clipData.videoUrl)
          const blob = await response.blob()
          fileToUpload = new File([blob], 'video.mp4', { type: blob.type || 'video/mp4' })
        }
        
        if (!fileToUpload) {
          throw new Error('无法获取本地视频文件')
        }
        
        const formData = new FormData()
        formData.append('file', fileToUpload)
        
        const uploadResponse = await fetch('/api/videos/upload', {
          method: 'POST',
          headers: {
            ...getTenantHeaders(),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: formData
        })
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}))
          throw new Error(errorData.message || '本地视频上传失败')
        }
        
        const uploadResult = await uploadResponse.json()
        qiniuVideoUrl = uploadResult.url
        console.log('[VideoNode] 本地视频上传成功:', qiniuVideoUrl)
      } else {
        // 远程 URL，通过 API 上传到七牛云
        let videoUrlForApi = clipData.videoUrl
        if (clipData.videoUrl.startsWith('/api/')) {
          // 相对路径，需要先获取完整 URL
          videoUrlForApi = getApiUrl(clipData.videoUrl)
        }
        
        // 上传视频到七牛云获取公开 URL
        const uploadResponse = await fetch('/api/videos/upload-to-qiniu', {
          method: 'POST',
          headers: {
            ...getTenantHeaders(),
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            videoUrl: videoUrlForApi
          })
        })
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json()
          throw new Error(errorData.message || '视频上传失败')
        }
        
        const uploadResult = await uploadResponse.json()
        qiniuVideoUrl = uploadResult.url
        console.log('[VideoNode] 视频上传成功:', qiniuVideoUrl)
      }
    }
    
    // 3. 调用角色创建 API
    console.log('[VideoNode] 调用角色创建 API...')
    
    // 获取角色名称（用户输入或默认值）
    const characterName = clipData.characterName || '角色创建1'
    
    // 构建请求体 - 使用角色名称作为 prompt
    const requestBody = {
      timestamps: clipData.timestamps,
      prompt: characterName
    }
    
    // 优先使用任务 ID，否则使用视频 URL
    if (useTaskId && soraTaskId) {
      requestBody.character = soraTaskId // 使用任务 ID 作为 character 参数
      console.log('[VideoNode] 使用 Sora 任务 ID 创建角色:', soraTaskId, '名称:', characterName)
    } else {
      requestBody.videoUrl = qiniuVideoUrl
      console.log('[VideoNode] 使用上传的视频 URL 创建角色:', qiniuVideoUrl, '名称:', characterName)
    }
    
    const createResponse = await fetch('/api/sora/characters/create', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(requestBody)
    })
    
    if (!createResponse.ok) {
      const errorData = await createResponse.json()
      throw new Error(errorData.message || '角色创建失败')
    }
    
    const createResult = await createResponse.json()
    console.log('[VideoNode] 角色创建结果:', createResult)
    
    // 4. 在右侧创建新的视频节点显示裁剪片段
    const characterId = createResult.id || createResult.character_id
    // 使用裁剪后的视频 URL（如果裁剪成功），否则使用原始 URL
    const displayVideoUrl = updatedClipData.clippedVideoUrl || qiniuVideoUrl || clipData.videoUrl
    createCharacterOutputNode(characterId, displayVideoUrl, updatedClipData, createResult)
    
    // 5. 显示创建中提示
    showToast('Sora角色创建中，预计需要1-3分钟...', 'info', 5000)
    
    // 6. 延迟后开始轮询（角色训练需要时间，立即查询会失败）
    setTimeout(() => {
      pollCharacterStatus(characterId, displayVideoUrl, clipData)
    }, 8000) // 等待8秒后再开始轮询
    
  } catch (error) {
    console.error('[VideoNode] 角色创建失败:', error)
    // 显示错误 Toast 通知
    showToast(error.message || '角色创建失败', 'error', 3000)
  }
}

// 创建角色输出节点
function createCharacterOutputNode(characterId, videoUrl, clipData, apiResult) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + (props.data.width || 420) + 100,
    y: currentNode.position.y
  }
  
  // 解析裁剪时间
  const [startTime, endTime] = (clipData.timestamps || '0,3').split(',').map(Number)
  
  // 使用传入的视频 URL（已经是裁剪后的视频或带 #t= 的 URL）
  const clippedVideoUrl = clipData.clippedVideoUrl || videoUrl
  
  // 获取角色名称
  const characterName = clipData.characterName || '角色创建1'
  
  // 创建新的视频节点，显示裁剪后的视频片段
  // 节点标题使用角色名称
  canvasStore.addNode({
    id: newNodeId,
    type: 'video',
    position: newNodePosition,
    data: {
      label: characterName, // 使用角色名称作为标签
      title: characterName, // 使用角色名称作为标题
      status: 'success',
      output: {
        type: 'video',
        url: clippedVideoUrl // 使用裁剪后的视频 URL
      },
      characterId: characterId,
      characterName: characterName, // 保存角色名称
      characterData: apiResult,
      clipTimestamps: clipData.timestamps,
      clipStartTime: startTime,
      clipEndTime: endTime,
      originalVideoUrl: videoUrl, // 保存原始视频 URL
      isCharacterNode: true
    }
  })
  
  // 创建连接边
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  console.log('[VideoNode] 创建角色输出节点:', newNodeId)
}

// 轮询查询角色状态
async function pollCharacterStatus(characterId, displayVideoUrl, clipData) {
  const token = localStorage.getItem('token')
  const maxAttempts = 36 // 最多轮询36次
  const pollInterval = 10000 // 每10秒查询一次（总共约6分钟）
  let consecutiveErrors = 0
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`/api/sora/characters/${characterId}`, {
        method: 'GET',
        headers: {
          ...getTenantHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
      
      if (!response.ok) {
        consecutiveErrors++
        // 连续3次错误才报告，避免偶发网络问题
        if (consecutiveErrors >= 3) {
          console.warn('[VideoNode] 查询角色状态连续失败', consecutiveErrors, '次')
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        continue
      }
      
      consecutiveErrors = 0 // 重置错误计数
      const result = await response.json()
      
      if (result.status === 'completed') {
        // 角色创建完成，添加到资产库（传递裁剪信息）
        await addCharacterToAssets(characterId, displayVideoUrl, result, clipData)
        showToast('Sora角色已创建成功，请前往资产库查看', 'success', 3000)
        return
      } else if (result.status === 'failed') {
        // 角色创建失败，也添加到资产库（记录失败状态）
        const failReason = result.fail_reason || result.error || '未知错误'
        await addCharacterToAssets(characterId, displayVideoUrl, { ...result, fail_reason: failReason }, clipData)
        showToast('角色创建失败: ' + failReason, 'error', 5000)
        return
      }
      
      // 状态为 queued 或 processing，继续等待
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    } catch (error) {
      console.error('[VideoNode] 轮询出错:', error.message)
      consecutiveErrors++
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }
  
  // 超时 - 但角色可能仍在创建中
  showToast('角色创建超时，请稍后在资产库查看', 'warning', 3000)
}

// 添加角色到资产库
async function addCharacterToAssets(characterId, videoUrl, apiResult, clipData) {
  try {
    const token = localStorage.getItem('token')
    
    // 角色名称：优先使用用户输入的名称，其次使用 API 返回的 name
    const characterName = clipData?.characterName || apiResult.name || '角色创建1'
    // 角色 ID (username)：优先使用 API 返回的 username，其次使用 characterId
    const characterUsername = apiResult.username || characterId
    const avatarUrl = apiResult.avatar_url || videoUrl
    
    console.log('[VideoNode] 保存角色到资产库:', {
      characterName,
      characterUsername,
      apiResultName: apiResult.name,
      apiResultUsername: apiResult.username
    })
    
    // 解析裁剪时间信息
    const [clipStartTime, clipEndTime] = (clipData?.timestamps || '0,3').split(',').map(Number)
    // 使用已经裁剪好的视频 URL（如果存在）
    const clippedVideoUrl = clipData?.clippedVideoUrl || `${videoUrl}#t=${clipStartTime},${clipEndTime}`
    
    const response = await fetch('/api/canvas/assets', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        type: 'sora-character',
        name: characterName, // 角色名称（可编辑）
        url: clippedVideoUrl, // 使用裁剪后的视频 URL
        thumbnail_url: avatarUrl, // 缩略图使用 avatar
        metadata: {
          characterId: characterId, // 角色ID（不可编辑）
          name: characterName, // 角色名称（可编辑）
          username: characterUsername, // 角色ID/用户名（不可编辑）
          avatar_url: avatarUrl,
          video_url: apiResult.video_url || videoUrl,
          clipped_video_url: clippedVideoUrl, // 裁剪后的视频 URL
          original_video_url: videoUrl, // 原始视频 URL
          clip_start_time: clipStartTime, // 裁剪起始时间
          clip_end_time: clipEndTime, // 裁剪结束时间
          clip_timestamps: clipData?.timestamps, // 裁剪时间戳
          cameo_id: apiResult.cameo_id || null,
          sora_character_id: apiResult.sora_character_id || null,
          model: apiResult.model || 'character-training',
          status: apiResult.status || 'completed',
          fail_reason: apiResult.fail_reason || null, // 失败原因
          instruction_set_hint: apiResult.instruction_set_hint || '',
          created_at: apiResult.created_at || Date.now(),
          completed_at: apiResult.completed_at || Date.now()
        }
      })
    })
    
    if (response.ok) {
      console.log('[VideoNode] 角色已添加到资产库:', { 
        characterName, 
        characterUsername, 
        avatarUrl,
        clippedVideoUrl,
        clipStartTime,
        clipEndTime
      })
      // 通知资产面板刷新
      window.dispatchEvent(new CustomEvent('assets-updated'))
    }
  } catch (error) {
    console.error('[VideoNode] 添加资产失败:', error)
  }
}

// 统一使用后端代理下载，解决跨域和第三方CDN预览问题
// 🔧 修复：确保下载原视频，去除七牛云压缩参数
async function handleToolbarDownload() {
  // 使用原始 URL（可能是七牛云地址），而不是 normalizedVideoUrl（可能被转换为相对路径）
  let videoUrl = props.data.output?.url
  if (!videoUrl) return
  
  const filename = `video_${props.id || Date.now()}.mp4`
  
  console.log('[VideoNode] 开始下载:', { url: videoUrl.substring(0, 60), filename })
  
  try {
    // 🔧 修复：使用 buildVideoDownloadUrl 构建下载链接，会自动清理七牛云压缩参数
    const { buildVideoDownloadUrl, isQiniuCdnUrl } = await import('@/api/client')
    const downloadUrl = buildVideoDownloadUrl(videoUrl, filename)
    
    // 七牛云 URL 直接下载（节省服务器流量）
    if (isQiniuCdnUrl(videoUrl)) {
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      console.log('[VideoNode] 七牛云直接下载原视频:', filename)
      setTimeout(() => document.body.removeChild(link), 100)
      return
    }
    
    // 其他 URL 走后端代理下载
    const response = await fetch(downloadUrl, {
      headers: getTenantHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const blob = await response.blob()
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    
    console.log('[VideoNode] 下载原视频成功:', filename)
    
    setTimeout(() => {
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    }, 100)
  } catch (error) {
    console.error('[VideoNode] 下载失败:', error)
    // 🔧 修复：使用新窗口打开下载链接，避免触发当前页面的 beforeunload 事件
    try {
      const { buildVideoDownloadUrl } = await import('@/api/client')
      const downloadUrl = buildVideoDownloadUrl(videoUrl, filename)
      // 使用 window.open 在新窗口打开，不会触发当前页面的离开提示
      window.open(downloadUrl, '_blank')
    } catch (e) {
      console.error('[VideoNode] 所有下载方式都失败:', e)
    }
  }
}

function handleToolbarPreview() {
  if (!normalizedVideoUrl.value) return
  openFullscreenPreview()
}
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 视频工具栏（选中且有视频时显示）- 与 ImageNode 保持一致 -->
    <div v-show="showToolbar" class="video-toolbar">
      <button 
        class="toolbar-btn" 
        :class="{ 'processing': isHDProcessing }"
        title="高清放大" 
        @mousedown.stop.prevent="handleToolbarHD"
        @click.stop.prevent
        :disabled="isHDProcessing"
      >
        <svg v-if="!isHDProcessing" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="12" y="15" text-anchor="middle" font-size="8" font-weight="bold" fill="currentColor" stroke="none">HD</text>
        </svg>
        <svg v-else class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
        <span>{{ isHDProcessing ? '处理中...' : '高清' }}</span>
      </button>
      <button class="toolbar-btn" title="解析" @mousedown.stop.prevent="handleToolbarAnalyze" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="14" y="3" width="7" height="7" rx="1" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="3" y="14" width="7" height="7" rx="1" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="14" y="14" width="7" height="7" rx="1" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>解析</span>
      </button>
      <button class="toolbar-btn" title="角色创建" @mousedown.stop.prevent="handleToolbarCreateCharacter" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="8" r="4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16 3l2 2-2 2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>角色创建</span>
      </button>
      <button class="toolbar-btn" title="关键帧" @mousedown.stop.prevent="handleToolbarKeyframe" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="6" width="20" height="12" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 6v12" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 9v6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M17 9v6" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
        </svg>
        <span>关键帧</span>
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn icon-only" title="下载" @mousedown.stop.prevent="handleToolbarDownload" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="toolbar-btn icon-only" title="全屏预览" @mousedown.stop.prevent="handleToolbarPreview" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
    
    <!-- 节点标签 -->
    <div 
      v-if="!isEditingLabel" 
      class="node-label"
      @dblclick="handleLabelDoubleClick"
      :title="'双击重命名'"
    >
      {{ localLabel }}
    </div>
    <input
      v-else
      ref="labelInputRef"
      v-model="localLabel"
      type="text"
      class="node-label-input"
      @blur="saveLabelEdit"
      @keydown="handleLabelKeyDown"
      @click.stop
      @mousedown.stop
    />
    
    <!-- 节点主体 -->
    <div class="node-wrapper">
      <!-- 左侧输入端口 -->
      <Handle
        type="target"
        :position="Position.Left"
        id="input"
        class="node-handle node-handle-hidden"
      />

      <!-- 左侧添加按钮 -->
      <button 
        class="node-add-btn node-add-btn-left"
        title="添加参考图片（首帧/尾帧）"
        @click="handleAddLeftClick"
      >
        +
      </button>
      
      <!-- 节点卡片 -->
      <div 
        class="node-card" 
        :class="{ 
          'is-processing': data.status === 'processing',
          'is-stacked': data.isStackedNode
        }"
        :style="contentStyle"
      >
        <!-- 彗星环绕发光特效（生成中显示） -->
        <svg v-if="data.status === 'processing'" class="comet-border" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <!-- 彗星渐变 -->
            <linearGradient id="comet-gradient-video" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="transparent" />
              <stop offset="70%" stop-color="rgba(74, 222, 128, 0.3)" />
              <stop offset="90%" stop-color="rgba(74, 222, 128, 0.8)" />
              <stop offset="100%" stop-color="#4ade80" />
            </linearGradient>
            <!-- 发光滤镜 -->
            <filter id="comet-glow-video" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <!-- 底层发光边框 -->
          <rect 
            x="1" y="1" width="98" height="98" rx="8" ry="8"
            fill="none" 
            stroke="rgba(74, 222, 128, 0.15)" 
            stroke-width="1"
          />
          <!-- 彗星轨迹 -->
          <rect 
            class="comet-path"
            x="1" y="1" width="98" height="98" rx="8" ry="8"
            fill="none" 
            stroke="url(#comet-gradient-video)" 
            stroke-width="2"
            filter="url(#comet-glow-video)"
          />
        </svg>
        
        <!-- 视频输出预览（无边框设计，悬停自动播放） -->
        <div 
          v-if="hasOutput" 
          class="video-output-wrapper"
          :style="videoWrapperStyle"
          @mouseenter="handleVideoMouseEnter"
          @mouseleave="handleVideoMouseLeave"
        >
          <video 
            ref="videoPlayerRef"
            preload="auto"
            muted
            :loop="!data?.isCharacterNode"
            class="video-player-output"
            playsinline
            webkit-playsinline
            x5-video-player-type="h5"
            x5-playsinline
            crossorigin="anonymous"
            @loadedmetadata="handleVideoLoaded"
            @canplay="handleVideoCanPlay"
            @timeupdate="handleVideoTimeUpdate"
            @error="handleVideoError"
          >
            <source :src="normalizedVideoUrl" type="video/mp4">
          </video>
          <!-- 播放指示器已移除：首帧不显示播放按钮 -->
          <div class="video-overlay-actions">
            <button class="overlay-action-btn" @click.stop="openFullscreenPreview" title="全屏预览">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            </button>
            <button class="overlay-action-btn" @click.stop="handleRegenerate" title="重新生成">
              ⟲
            </button>
          </div>
        </div>
        
        <!-- 主内容区域（非输出状态） -->
        <div v-else class="node-content">
          <!-- 加载中状态 -->
          <div v-if="data.status === 'processing'" class="preview-loading">
            <div class="loading-spinner"></div>
            <span class="loading-title">视频生成中...</span>
            <!-- 进度显示：优先显示百分比，其次显示状态文本 -->
            <span v-if="progressPercent > 0" class="progress-percent">{{ progressPercent }}%</span>
            <span v-else-if="data.progress && !isDefaultProgress" class="progress-text">{{ data.progress }}</span>
            <span class="loading-hint">预计 1-3 分钟</span>
          </div>
          
          <!-- 错误状态 -->
          <div v-else-if="data.status === 'error'" class="preview-error">
            <div class="error-icon">❌</div>
            <div class="error-text">{{ data.error || errorMessage || '生成失败' }}</div>
            <button class="retry-btn" @click="handleRegenerate">重试</button>
          </div>
          
          <!-- 有上游连接时 - 显示"已连接"等待状态 -->
          <div v-else-if="hasUpstream" class="ready-state">
            <div class="ready-icon">
              <!-- SVG 黑白视频图标 -->
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="6" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 10.5L21 7.5V16.5L16 13.5V10.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="6" cy="10" r="0.5" fill="currentColor"/>
              </svg>
            </div>
            <div class="ready-text">
              <template v-if="inheritedPrompt">
                <span class="prompt-preview">{{ inheritedPrompt.slice(0, 50) }}{{ inheritedPrompt.length > 50 ? '...' : '' }}</span>
              </template>
              <template v-else-if="referenceImages.length > 0">
                已连接参考图片
              </template>
              <template v-else>
                已连接，点击选中配置参数
              </template>
            </div>
            <div class="ready-hint">选中节点后在下方配置并生成</div>
          </div>
          
          <!-- 空状态 - 快捷操作 -->
          <div v-else class="empty-state">
            <div class="hint-text">{{ t('canvas.textNode.try') }}</div>
            <div 
              v-for="action in quickActions"
              :key="action.labelKey"
              class="quick-action"
              @click.stop="action.action"
            >
              <span class="action-icon">{{ action.icon }}</span>
              <span class="action-label">{{ t(action.labelKey) }}</span>
            </div>
          </div>
        </div>
        
        <!-- Resize Handles -->
        <div 
          class="resize-handle resize-handle-right"
          @mousedown="handleResizeStart('right', $event)"
        ></div>
        <div 
          class="resize-handle resize-handle-bottom"
          @mousedown="handleResizeStart('bottom', $event)"
        ></div>
        <div 
          class="resize-handle resize-handle-corner"
          @mousedown="handleResizeStart('corner', $event)"
        ></div>
      </div>
      
      <!-- 右侧添加按钮 - 单击打开选择器，长按/拖拽连线 -->
      <button 
        class="node-add-btn node-add-btn-right"
        title="单击：添加节点 | 长按/拖拽：连接到其他节点"
        @mousedown="handleAddRightMouseDown"
      >
        +
      </button>

      <!-- 右侧输出端口 -->
      <Handle
        type="source"
        :position="Position.Right"
        id="output"
        class="node-handle node-handle-hidden"
      />
    </div>
    
    <!-- 隐藏的文件上传 input（支持多选，支持图片和视频） -->
    <input 
      ref="frameInputRef"
      type="file" 
      accept="image/*,video/*"
      multiple
      class="hidden-file-input"
      @change="handleFrameFileChange"
    />
    
    <!-- 全屏预览模态框 -->
    <Teleport to="body">
      <div v-if="isFullscreenPreview" class="fullscreen-preview-overlay" @click="closeFullscreenPreview">
        <div class="fullscreen-preview-container" @click.stop>
          <video 
            controls 
            autoplay
            playsinline
            webkit-playsinline
            crossorigin="anonymous"
            class="fullscreen-video"
          >
            <source :src="normalizedVideoUrl" type="video/mp4">
          </video>
          <button class="fullscreen-close-btn" @click="closeFullscreenPreview">
            ✕
          </button>
        </div>
      </div>
    </Teleport>
    
    <!-- 视频裁剪编辑器（角色创建） -->
    <VideoClipEditor
      v-if="showClipEditor"
      :video-url="normalizedVideoUrl"
      :node-id="id"
      :sora-task-id="props.data?.soraTaskId || props.data?.taskId || ''"
      @close="closeClipEditor"
      @confirm="handleConfirmCreateCharacter"
    />
    
    <!-- 关键帧编辑器 -->
    <KeyframeEditor
      v-if="showKeyframeEditor"
      :video-url="normalizedVideoUrl"
      :node-id="id"
      @close="closeKeyframeEditor"
      @confirm="handleConfirmKeyframes"
    />
    
    <!-- 底部配置面板（选中时显示） -->
    <div v-show="selected" class="config-panel" @mousedown.stop>
      <!-- 参考图片预览（支持拖拽上传） -->
      <div 
        class="panel-frames"
        :class="{ 'drag-over': isDragOver }"
        @mousedown.stop
        @dragenter="handleFrameDragEnter"
        @dragover="handleFrameDragOver"
        @dragleave="handleFrameDragLeave"
        @drop="handleFrameDrop"
      >
        <div class="panel-frames-header">
          <span class="panel-frames-label">{{ hasReferenceVideos ? '参考视频/图片' : '参考图片' }}</span>
          <span class="panel-frames-hint">拖拽图片/视频到此处 · 拖动调整顺序</span>
        </div>
        <div class="panel-frames-list">
          <!-- 参考视频（来自上游视频节点） -->
          <div 
            v-for="(video, index) in referenceVideos"
            :key="'video-' + index"
            class="panel-frame-item panel-frame-video"
          >
            <video :src="video" muted preload="metadata" class="video-thumb"></video>
            <span class="panel-frame-label">▶</span>
          </div>
          <!-- 现有图片（支持拖拽排序） -->
          <div 
            v-for="(img, index) in referenceImages" 
            :key="img + index"
            class="panel-frame-item"
            :class="{ 
              'drag-over': dragOverIndex === index,
              'dragging': dragSortIndex === index
            }"
            draggable="true"
            @mousedown="handleImageMouseDown"
            @dragstart="handleImageDragStart($event, index)"
            @dragover="handleImageDragOver($event, index)"
            @dragleave="handleImageDragLeave"
            @drop="handleImageDrop($event, index)"
            @dragend="handleImageDragEnd"
          >
            <img :src="img" :alt="`图片 ${index + 1}`" />
            <span class="panel-frame-label">{{ index + 1 }}</span>
            <button class="panel-frame-remove" @click.stop="removeReferenceImage(index)">×</button>
          </div>
          <!-- 添加按钮 -->
          <div 
            class="panel-frame-add"
            @mousedown.stop
            @click.stop="triggerFrameUpload"
          >
            <span class="add-icon">+</span>
            <span class="add-text">添加</span>
          </div>
        </div>
        <!-- 拖拽覆盖层 -->
        <div v-if="isDragOver" class="panel-drag-overlay">
          <span>释放以添加图片/视频</span>
        </div>
      </div>
      
      <!-- 上下文文字参考（有上游文本时显示） -->
      <div v-if="hasUpstreamText" class="context-reference-section">
        <div class="context-reference-header">
          <span class="context-reference-icon">📝</span>
          <span class="context-reference-label">上下文文字参考</span>
          <span class="context-reference-hint">来自上游节点</span>
        </div>
        <div class="context-reference-content">
          {{ upstreamTextContent }}
        </div>
      </div>
      
      <!-- 模式标签 + 提示词输入 -->
      <div class="prompt-section">
        <textarea
          ref="promptTextareaRef"
          v-model="promptText"
          class="prompt-input"
          :placeholder="hasUpstreamText ? '可选：添加额外的提示词（将与上下文合并）' : '描述你想要生成的内容，并在下方调整生成参数。(按下Enter 生成，Shift+Enter 换行)'"
          rows="3"
          @keydown="handleKeyDown"
          @input="autoResizeTextarea"
          @wheel="handlePromptWheel"
        ></textarea>
      </div>
      
      <!-- 参数配置行 -->
      <div class="config-row">
        <div class="config-left">
          <!-- 模型选择器（自定义下拉框，支持显示描述） -->
          <div class="model-selector-custom" ref="modelSelectorRef" @click.stop>
            <div 
              class="model-selector-trigger"
              @click="toggleModelDropdown"
            >
              <span class="model-icon">{{ models.find(m => m.value === selectedModel)?.icon || '🎬' }}</span>
              <span class="model-name">{{ models.find(m => m.value === selectedModel)?.label || selectedModel }}</span>
              <span class="select-arrow" :class="{ 'arrow-up': isModelDropdownOpen }">▾</span>
            </div>
            
            <!-- 下拉选项列表 -->
            <Transition name="dropdown-fade">
              <div
                v-if="isModelDropdownOpen"
                ref="modelDropdownListRef"
                class="model-dropdown-list"
                :class="{ 'dropdown-up': dropdownDirection === 'up' }"
                @wheel="handleDropdownWheel"
              >
                <div
                  v-for="m in models"
                  :key="m.value"
                  class="model-dropdown-item"
                  :class="{ 'active': selectedModel === m.value }"
                  @click="selectModel(m.value)"
                >
                  <div class="model-item-main">
                    <span class="model-item-icon">{{ m.icon }}</span>
                    <span class="model-item-label">{{ m.label }}</span>
                    <span v-if="m.points" class="model-item-points">{{ m.points }}点</span>
                  </div>
                  <div v-if="m.description" class="model-item-desc">
                    {{ m.description }}
                  </div>
                </div>
              </div>
            </Transition>
          </div>
          
          <!-- 比例选择（下拉框） -->
          <div class="ratio-selector">
            <span class="ratio-icon">📐</span>
            <select v-model="selectedAspectRatio" class="ratio-select-input">
              <option v-for="ratio in aspectRatios" :key="ratio.value" :value="ratio.value">
                {{ ratio.label }}
              </option>
            </select>
          </div>
          
          <!-- 动作迁移模式切换（std/pro） -->
          <div v-if="isKlingMotionControl" class="param-chip-group">
            <div 
              class="param-chip"
              :class="{ active: klingMotionMode === 'std' }"
              @click="klingMotionMode = 'std'"
            >
              标准
            </div>
            <div 
              class="param-chip"
              :class="{ active: klingMotionMode === 'pro' }"
              @click="klingMotionMode = 'pro'"
            >
              专业
            </div>
          </div>
          
          <!-- 时长切换（VEO3模型和动作迁移模型不显示） -->
          <div v-if="!isVeo3Model && !isKlingMotionControl && durations.length > 0" class="param-chip-group">
            <div 
              v-for="d in durations" 
              :key="d.value"
              class="param-chip"
              :class="{ active: selectedDuration === d.value }"
              @click="selectedDuration = d.value"
            >
              {{ d.label }}
            </div>
          </div>
          
          <!-- Vidu 错峰模式开关 -->
          <label 
            v-if="isViduModel" 
            class="off-peak-toggle" 
            :class="{ active: viduOffPeak }"
            title="开启后享受折扣，但生成时间会有所延长，高峰时需要等位"
          >
            <input type="checkbox" v-model="viduOffPeak" />
            <span class="toggle-icon">🌙</span>
            <span class="toggle-text">错峰</span>
          </label>
          
          <!-- Vidu 清晰度切换 -->
          <div 
            v-if="isViduModel" 
            class="resolution-chip"
            :class="{ 'is-720p': viduResolution === '720p' }"
            @click="viduResolution = viduResolution === '1080p' ? '720p' : '1080p'"
            :title="viduResolution === '1080p' ? '点击切换到720P（享受折扣）' : '点击切换到1080P（高清）'"
          >
            {{ viduResolution === '1080p' ? '1080P' : '720P' }}
          </div>
        </div>
        
        <div class="config-right">
          <!-- 生成次数（可点击切换） -->
          <span 
            class="count-display clickable" 
            @click="toggleCount"
            :title="`点击切换：1x → 2x → 4x（当前套餐最大 ${userConcurrentLimit}x）`"
          >
            {{ selectedCount }}x
          </span>
          
          <!-- 积分消耗显示 -->
          <span class="points-cost-display">
            <template v-if="isKlingMotionControl">
              {{ motionCostPerSecond }}积分/s
            </template>
            <template v-else>
              {{ pointsCost }} {{ t('imageGen.points') }}
            </template>
          </span>
          
          <!-- 生成按钮 - 只在任务提交中禁用，节点生成中仍可点击发起新任务 -->
          <button 
            class="generate-btn"
            :disabled="isGenerating"
            @click="handleGenerate"
          >
            <span v-if="isGenerating" class="btn-loading">...</span>
            <svg v-else class="btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Sora2 高级选项 -->
      <template v-if="isSora2Model">
        <!-- 展开/收起按钮 -->
        <button class="sora2-collapse-trigger" @click="showSora2AdvancedOptions = !showSora2AdvancedOptions">
          <span class="sora2-collapse-icon" :class="{ 'expanded': showSora2AdvancedOptions }">∧</span>
          <span>{{ showSora2AdvancedOptions ? t('common.collapse') : t('common.expand') }}</span>
        </button>
        
        <!-- 高级选项内容 -->
        <Transition name="slide-down">
          <div v-if="showSora2AdvancedOptions" class="sora2-advanced-options">
            <!-- 去掉首帧开关 -->
            <div class="sora2-option-row">
              <span class="sora2-option-label">{{ t('canvas.videoNode.trimFirstFrame') }}</span>
              <label class="sora2-toggle-switch">
                <input type="checkbox" v-model="trimFirstFrame" />
                <span class="sora2-toggle-slider"></span>
              </label>
            </div>
            
            <!-- 故事板模式开关 -->
            <div class="sora2-option-row">
              <span class="sora2-option-label">{{ t('canvas.videoNode.storyboardMode') }}</span>
              <label class="sora2-toggle-switch">
                <input type="checkbox" v-model="storyboardMode" />
                <span class="sora2-toggle-slider"></span>
              </label>
            </div>
            
            <!-- 风格标签选择 -->
            <div class="sora2-option-row vertical">
              <div class="sora2-option-header">
                <span class="sora2-option-label">{{ t('canvas.videoNode.styleLabel') }}</span>
                <span class="sora2-tag-count">({{ selectedStyles.length }}/{{ SORA2_STYLE_OPTIONS.length }})</span>
              </div>
              <div class="sora2-style-tags">
                <button
                  v-for="style in SORA2_STYLE_OPTIONS"
                  :key="style.value"
                  @click="toggleStyle(style.value)"
                  :class="['sora2-style-tag', { selected: isStyleSelected(style.value) }]"
                >
                  {{ getStyleLabel(style) }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </template>
      
      <!-- Kling 高级选项 - 摄像机控制（动作迁移模型不显示） -->
      <template v-if="isKlingModel && !isKlingMotionControl">
        <!-- 展开/收起按钮 -->
        <button class="sora2-collapse-trigger" @click="showKlingAdvancedOptions = !showKlingAdvancedOptions">
          <span class="sora2-collapse-icon" :class="{ 'expanded': showKlingAdvancedOptions }">∧</span>
          <span>{{ showKlingAdvancedOptions ? '收起' : '扩展' }}</span>
        </button>
        
        <!-- 高级选项内容 -->
        <Transition name="slide-down">
          <div v-if="showKlingAdvancedOptions" class="sora2-advanced-options kling-advanced">
            <!-- 摄像机控制开关 -->
            <div class="sora2-option-row">
              <span class="sora2-option-label">🎥 摄像机控制</span>
              <label class="sora2-toggle-switch">
                <input type="checkbox" v-model="klingCameraEnabled" />
                <span class="sora2-toggle-slider"></span>
              </label>
            </div>
            
            <!-- 启用后显示运镜类型选择 -->
            <template v-if="klingCameraEnabled">
              <!-- 运镜类型选择 -->
              <div class="sora2-option-row vertical">
                <span class="sora2-option-label">运镜类型</span>
                <div class="kling-camera-types">
                  <button
                    v-for="type in KLING_CAMERA_TYPES"
                    :key="type.value"
                    @click="klingCameraType = type.value"
                    :class="['kling-camera-type-btn', { active: klingCameraType === type.value }]"
                    :title="type.description"
                  >
                    {{ type.label }}
                  </button>
                </div>
              </div>
              
              <!-- simple 类型时显示配置选项 -->
              <template v-if="klingCameraType === 'simple'">
                <!-- 配置类型选择（6选1）-->
                <div class="sora2-option-row vertical">
                  <span class="sora2-option-label">运镜方向</span>
                  <div class="kling-camera-configs">
                    <button
                      v-for="cfg in KLING_CAMERA_CONFIGS"
                      :key="cfg.value"
                      @click="klingCameraConfig = cfg.value"
                      :class="['kling-camera-config-btn', { active: klingCameraConfig === cfg.value }]"
                      :title="cfg.description"
                    >
                      {{ cfg.label }}
                    </button>
                  </div>
                </div>
                
                <!-- 数值滑块 -->
                <div class="sora2-option-row vertical">
                  <div class="kling-slider-header">
                    <span class="sora2-option-label">运镜强度</span>
                    <span class="kling-slider-value">{{ klingCameraValue }}</span>
                  </div>
                  <div class="kling-slider-container">
                    <span class="kling-slider-label">-10</span>
                    <input 
                      type="range" 
                      v-model.number="klingCameraValue" 
                      min="-10" 
                      max="10" 
                      step="1"
                      class="kling-slider"
                    />
                    <span class="kling-slider-label">+10</span>
                  </div>
                  <div class="kling-slider-hint">
                    {{ KLING_CAMERA_CONFIGS.find(c => c.value === klingCameraConfig)?.description || '' }}
                  </div>
                </div>
              </template>
              
              <!-- 其他运镜类型的说明 -->
              <div v-if="klingCameraType && klingCameraType !== 'simple'" class="kling-camera-tip">
                💡 {{ KLING_CAMERA_TYPES.find(t => t.value === klingCameraType)?.description || '' }}
              </div>
            </template>
            
            <!-- Kling 2.6+ Pro 音频选项（只有 Pro 模式支持声音生成）-->
            <template v-if="isKling26Plus && isKlingProMode">
              <div class="kling-section-divider"></div>
              
              <!-- 生成声音开关 -->
              <div class="sora2-option-row">
                <span class="sora2-option-label">🔊 生成声音 <span v-if="klingSoundEnabled" class="kling-sound-multiplier">(2x)</span></span>
                <label class="sora2-toggle-switch">
                  <input type="checkbox" v-model="klingSoundEnabled" />
                  <span class="sora2-toggle-slider"></span>
                </label>
              </div>
              
              <!-- 启用声音后显示音色配置 -->
              <template v-if="klingSoundEnabled">
                <!-- 音色列表 - 独立容器确保样式隔离 -->
                <div class="kling-voice-section">
                  <div class="kling-voice-title">
                    <span>音色列表</span>
                    <span class="kling-voice-count">({{ klingVoiceList.length }}/2)</span>
                  </div>
                  
                  <!-- 已添加的音色 -->
                  <div v-if="klingVoiceList.length > 0" class="kling-voice-tags">
                    <span 
                      v-for="voiceId in klingVoiceList" 
                      :key="voiceId" 
                      class="kling-voice-tag"
                    >
                      {{ voiceId }}
                      <button class="kling-voice-remove" @click="removeKlingVoice(voiceId)">×</button>
                    </span>
                  </div>
                  
                  <!-- 添加音色输入框 -->
                  <div v-if="klingVoiceList.length < 2" class="kling-voice-input-row">
                    <input 
                      type="text" 
                      v-model="klingVoiceInput"
                      placeholder="输入音色ID"
                      class="kling-voice-input"
                      @keyup.enter="addKlingVoice"
                    />
                    <button class="kling-voice-add-btn" @click="addKlingVoice" :disabled="!klingVoiceInput.trim()">
                      添加
                    </button>
                  </div>
                  
                  <div class="kling-voice-hint">
                    💡 在 prompt 中使用 @音色ID 引用音色，最多添加2个
                  </div>
                </div>
              </template>
            </template>
            
            <!-- Kling 动作迁移配置（Motion Control） -->
            <template v-if="isKlingMotionControl">
              <div class="kling-section-divider"></div>
              
              <div class="kling-motion-section">
                <div class="kling-motion-title">🎬 动作迁移配置</div>
                
                <!-- 参考视频来源提示 -->
                <div class="sora2-option-row vertical">
                  <div class="kling-motion-label-row">
                    <span class="sora2-option-label">参考视频</span>
                    <span v-if="hasUpstreamVideo" class="kling-motion-duration">✅ 已连接</span>
                    <span v-else class="kling-motion-error-tag">❌ 未连接</span>
                  </div>
                  <div v-if="hasUpstreamVideo" class="kling-motion-hint">
                    ✅ 参考视频来自上游视频节点，按实际秒数计费（最长30秒）
                  </div>
                  <div v-else class="kling-motion-error">
                    ⚠️ 请连接一个视频节点作为参考视频来源
                  </div>
                </div>
              </div>
            </template>
          </div>
        </Transition>
      </template>
      
      <!-- Seedance 高级选项 - 声音生成 -->
      <template v-if="isSeedanceModel">
        <!-- 展开/收起按钮 -->
        <button class="sora2-collapse-trigger" @click="showSeedanceAdvancedOptions = !showSeedanceAdvancedOptions">
          <span class="sora2-collapse-icon" :class="{ 'expanded': showSeedanceAdvancedOptions }">∧</span>
          <span>{{ showSeedanceAdvancedOptions ? '收起' : '扩展' }}</span>
        </button>
        
        <!-- 高级选项内容 -->
        <Transition name="slide-down">
          <div v-if="showSeedanceAdvancedOptions" class="sora2-advanced-options seedance-advanced">
            <!-- 生成声音开关 -->
            <div class="sora2-option-row">
              <span class="sora2-option-label">🔊 生成声音 <span v-if="seedanceSoundEnabled" class="kling-sound-multiplier">(2x)</span></span>
              <label class="sora2-toggle-switch">
                <input type="checkbox" v-model="seedanceSoundEnabled" />
                <span class="sora2-toggle-slider"></span>
              </label>
            </div>
            
            <div class="seedance-sound-hint">
              💡 开启后将同时生成视频音频，积分消耗翻倍
            </div>
          </div>
        </Transition>
      </template>
      
      <!-- Vidu 图生视频模式选择 -->
      <template v-if="isViduModel && referenceImages.length > 0">
        <div class="vidu-mode-section">
          <div class="vidu-mode-header">
            <span class="vidu-mode-label">🎬 图生视频模式</span>
            <span class="vidu-mode-hint">当前: {{ currentViduModeConfig.label }}</span>
          </div>
          <div class="vidu-mode-options">
            <button
              v-for="opt in VIDU_MODE_OPTIONS"
              :key="opt.value"
              @click="viduMode = opt.value"
              :class="['vidu-mode-btn', { active: viduMode === opt.value }]"
            >
              <span class="vidu-mode-btn-label">{{ opt.label }}</span>
              <span class="vidu-mode-btn-desc">{{ opt.maxImages === 7 ? '1-7张' : opt.minImages ? `${opt.minImages}张` : `${opt.maxImages}张` }}</span>
            </button>
          </div>
          <!-- 模式说明提示 -->
          <div v-if="viduMode === 'start-end'" class="vidu-mode-tip blue">
            💡 首尾帧模式：第1张图为视频起始帧，第2张图为结束帧
          </div>
          <div v-else-if="viduMode === 'reference'" class="vidu-mode-tip purple">
            💡 多图参考：AI 综合参考所有图片的风格、角色、场景创作
          </div>
          <!-- 图片数量验证提示 -->
          <div v-if="viduMode === 'i2v' && referenceImages.length > 1" class="vidu-mode-tip warning">
            ⚠️ 首帧驱动模式只支持1张图，将使用第1张图
          </div>
          <div v-if="viduMode === 'start-end' && referenceImages.length !== 2" class="vidu-mode-tip warning">
            ⚠️ 首尾帧模式需要恰好2张图片
          </div>
        </div>
      </template>
      
      <!-- VEO 模型模式选择 -->
      <template v-if="isVeoModel">
        <div class="veo-mode-section">
          <div class="veo-mode-header">
            <span class="veo-mode-label">🎬 VEO 模式</span>
            <span class="veo-mode-hint">当前: {{ currentVeoModeConfig.label }}</span>
          </div>
          <div class="veo-mode-options">
            <button
              v-for="opt in VEO_MODE_OPTIONS"
              :key="opt.value"
              @click="veoMode = opt.value"
              :class="['veo-mode-btn', { active: veoMode === opt.value }]"
            >
              <span class="veo-mode-btn-label">{{ opt.label }}</span>
              <span class="veo-mode-btn-desc">{{ opt.maxImages }}张</span>
            </button>
          </div>
          <!-- VEO 清晰度切换（根据模式动态显示可用选项） -->
          <div class="veo-resolution-section" v-if="availableVeoResolutions.length > 1">
            <span class="veo-resolution-label">清晰度</span>
            <div class="veo-resolution-options">
              <button
                v-for="res in availableVeoResolutions"
                :key="res.value"
                @click="veoResolution = res.value"
                :class="['veo-resolution-btn', { active: veoResolution === res.value }]"
              >
                {{ res.label }}
                <span v-if="res.extraCost > 0" class="extra-cost">+{{ res.extraCost }}</span>
              </button>
            </div>
          </div>
          <!-- 模式说明提示 -->
          <div v-if="veoMode === 'fast'" class="veo-mode-tip blue">
            ⚡ Fast模式：快速生成，适合预览和测试
          </div>
          <div v-else-if="veoMode === 'components'" class="veo-mode-tip purple">
            💡 多图参考：最多3张图，AI综合参考创作
          </div>
          <div v-else-if="veoMode === 'pro'" class="veo-mode-tip gold">
            🌟 Pro模式：最高画质，适合正式作品
          </div>
          <!-- 图片数量验证提示 -->
          <div v-if="referenceImages.length > 0 && referenceImages.length > currentVeoModeConfig.maxImages" class="veo-mode-tip warning">
            ⚠️ {{ currentVeoModeConfig.label }}最多支持{{ currentVeoModeConfig.maxImages }}张图
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.video-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 确保配置面板不影响节点的选中框计算 */
  overflow: visible;
  /* 覆盖 canvas-node 的默认边框，只使用内部 node-card 的边框 */
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

/* 节点标签 */
.node-label {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  user-select: none;
  white-space: pre-line; /* 支持多行标签 */
}

.node-label:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #ffffff);
}

/* 标签编辑输入框 */
.node-label-input {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-accent-primary, #3b82f6);
  border-radius: 4px;
  padding: 4px 8px;
  outline: none;
  min-width: 60px;
  max-width: 200px;
}

/* 节点包装器 */
.node-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

/* 节点卡片 */
.node-card {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease;
}

.video-node:hover .node-card {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.video-node.selected .node-card {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* 有输出时 - 无边框设计，自适应内容高度 */
.video-node.has-output .node-card {
  background: transparent;
  border: none;
  overflow: visible;
  padding: 0;
  min-height: auto !important;
  height: auto !important;
}

.video-node.has-output:hover .node-card {
  border-color: transparent;
}

/* 有输出时选中状态 - 保持无边框，只显示视频容器的发光效果 */
.video-node.has-output.selected .node-card {
  background: transparent;
  border: none;
  box-shadow: none;
}

/* ========== 彗星环绕发光特效（生成中） ========== */
.node-card.is-processing {
  position: relative;
  overflow: visible;
}

.comet-border {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  pointer-events: none;
  z-index: 10;
  border-radius: 18px;
}

.comet-path {
  stroke-dasharray: 25 75;
  stroke-dashoffset: 0;
  animation: comet-rotate 2.5s linear infinite;
}

@keyframes comet-rotate {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* 处理中的节点边框发光 */
.node-card.is-processing {
  box-shadow: 
    0 0 10px rgba(74, 222, 128, 0.2),
    0 0 20px rgba(74, 222, 128, 0.1),
    inset 0 0 0 1px rgba(74, 222, 128, 0.3);
}

/* 堆叠节点样式 */
.node-card.is-stacked {
  opacity: 0.85;
  transform: scale(0.98);
  transition: all 0.3s ease;
}

.node-card.is-stacked:hover {
  opacity: 1;
  transform: scale(1);
  z-index: 10;
}

/* 主内容区域 */
.node-content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

/* 首尾帧预览 */
.frames-preview {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.frame-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.frame-item img {
  width: 80px;
  height: 45px;
  object-fit: cover;
  border-radius: 6px;
  background: var(--canvas-bg-secondary, #141414);
}

.frame-label {
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
}

/* 预览状态 */
.preview-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--canvas-border-default, #3a3a3a);
  border-top-color: var(--canvas-accent-primary, #3b82f6);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-hint {
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
}

.progress-percent {
  font-size: 24px;
  font-weight: 600;
  color: var(--canvas-accent-primary, #3b82f6);
  margin: 8px 0;
}

.progress-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--canvas-accent-primary, #4ade80);
  margin: 6px 0;
  opacity: 0.9;
}

.preview-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
}

.error-icon {
  font-size: 24px;
}

.error-text {
  font-size: 12px;
  color: var(--canvas-accent-error, #ef4444);
  max-width: 200px;
}

.retry-btn {
  margin-top: 8px;
  padding: 6px 16px;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 6px;
  background: transparent;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 12px;
  cursor: pointer;
}

.retry-btn:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-accent-primary, #3b82f6);
}

/* ========== 视频工具栏（与 ImageNode 的 image-toolbar 保持一致） ========== */
.video-toolbar {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 20px;
  padding: 6px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  pointer-events: auto;
}

.video-toolbar .toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: #888;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.video-toolbar .toolbar-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.video-toolbar .toolbar-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.video-toolbar .toolbar-btn.icon-only {
  padding: 6px;
}

.video-toolbar .toolbar-btn.icon-only span {
  display: none;
}

.video-toolbar .toolbar-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.video-toolbar .toolbar-btn.processing {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}

.video-toolbar .toolbar-btn .animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.video-toolbar .toolbar-divider {
  width: 1px;
  height: 20px;
  background: #3a3a3a;
  margin: 0 6px;
}

/* ========== 视频输出预览（无边框设计，悬停自动播放） ========== */
.video-output-wrapper {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  transition: box-shadow 0.2s ease;
  /* aspect-ratio 通过 style 绑定动态设置 */
}

/* 选中状态 - 视频容器发光效果 */
.video-node.selected .video-output-wrapper {
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 0 0 2px var(--canvas-accent-primary, #3b82f6),
    0 0 20px rgba(59, 130, 246, 0.3);
}

.video-player-output {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #000;
  border-radius: 12px;
  /* 跨浏览器兼容 */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

/* 播放指示器已移除 */

/* 悬浮操作按钮 */
.video-overlay-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 20;
}

.video-output-wrapper:hover .video-overlay-actions {
  opacity: 1;
}

.overlay-action-btn {
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: white;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.overlay-action-btn:hover {
  background: rgba(0, 0, 0, 0.9);
  border-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.overlay-action-btn:active {
  transform: scale(0.95);
}

/* ========== 旧版视频预览样式（保留用于其他状态） ========== */
.video-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.video-player {
  width: 100%;
  flex: 1;
  border-radius: 8px;
  background: #000;
}

.video-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  background: var(--canvas-bg-elevated, #242424);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 6px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-text-primary, #fff);
}

/* 已连接等待状态（与 ImageNode 一致） */
.ready-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 20px;
}

.ready-icon {
  font-size: 48px;
  opacity: 0.6;
  color: var(--canvas-text-tertiary, #666);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ready-text {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  max-width: 200px;
}

.prompt-preview {
  color: var(--canvas-text-primary, #fff);
  font-style: italic;
}

.ready-hint {
  color: var(--canvas-text-tertiary, #666);
  font-size: 12px;
}

/* 空状态 */
.empty-state {
  flex: 1;
  padding: 20px;
}

.hint-text {
  color: var(--canvas-text-tertiary, #666666);
  font-size: 13px;
  margin-bottom: 16px;
}

.quick-action {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.quick-action:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #ffffff);
}

.action-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
  margin-right: 8px;
}

.action-label {
  flex: 1;
}

/* 底部配置面板 - 扁平化设计，与图片节点对齐 */
.config-panel {
  position: absolute;
  top: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  min-width: max(100%, 520px);
  max-width: 90vw;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 12px;
  overflow: visible;
  animation: slideDown 0.2s ease;
  z-index: 1000;
  pointer-events: auto;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 配置面板中的参考图片 */
.panel-frames {
  padding: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
  position: relative;
  transition: all 0.2s ease;
}

.panel-frames.drag-over {
  background: rgba(34, 197, 94, 0.1);
  border-color: var(--canvas-accent-success, #22c55e);
}

.panel-frames-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.panel-frames-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-secondary, #888);
  padding: 4px 10px;
  background: var(--canvas-bg-tertiary, #2a2a2a);
  border-radius: 4px;
}

.panel-frames-hint {
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
}

.panel-frames-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.panel-frame-item {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--canvas-border-default, #3a3a3a);
  cursor: grab;
  transition: all 0.2s ease;
  user-select: none;
}

.panel-frame-item:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.panel-frame-item:active {
  cursor: grabbing;
}

.panel-frame-item.dragging {
  opacity: 0.4;
  transform: scale(0.9);
  border-color: var(--canvas-accent-primary, #3b82f6);
  z-index: 10;
}

.panel-frame-item.drag-over {
  transform: scale(1.05);
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4);
}

/* 拖拽排序时的位置指示器 */
.panel-frame-item.drag-over::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--canvas-accent-primary, #3b82f6);
  border-radius: 2px;
  z-index: 20;
  animation: pulse 0.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.panel-frame-item:hover .panel-frame-remove {
  opacity: 1;
}

.panel-frame-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

/* 视频参考缩略图 */
.panel-frame-video {
  background: var(--canvas-bg-secondary, #1a1a1a);
  cursor: default;
}

.panel-frame-video .video-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.panel-frame-video .panel-frame-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.6);
  color: white;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  pointer-events: none;
}

.panel-frame-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 10px;
  text-align: center;
  padding: 2px 0;
}

.panel-frame-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  font-size: 14px;
  font-weight: 600;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.panel-frame-remove:hover {
  background: #ef4444;
}

.panel-frame-add {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  border: 1px dashed var(--canvas-border-default, #3a3a3a);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
  background: transparent;
}

.panel-frame-add:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.1);
}

.panel-frame-add .add-icon {
  font-size: 20px;
  color: var(--canvas-text-tertiary, #666);
}

.panel-frame-add .add-text {
  font-size: 9px;
  color: var(--canvas-text-tertiary, #666);
}

.panel-frame-add:hover .add-icon,
.panel-frame-add:hover .add-text {
  color: var(--canvas-accent-primary, #3b82f6);
}

.panel-drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(34, 197, 94, 0.2);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--canvas-accent-success, #22c55e);
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  pointer-events: none;
}

/* 上下文文字参考区域 */
.context-reference-section {
  padding: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
  background: rgba(59, 130, 246, 0.05);
}

.context-reference-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.context-reference-icon {
  font-size: 14px;
}

.context-reference-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--canvas-accent-primary, #3b82f6);
}

.context-reference-hint {
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
  margin-left: auto;
}

.context-reference-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--canvas-text-secondary, #a0a0a0);
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 10px 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-section {
  padding: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.mode-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--canvas-text-primary, #fff);
  margin-bottom: 8px;
}

.prompt-input {
  width: 100%;
  min-height: 63px;
  max-height: 210px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--canvas-text-primary, #fff);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(150, 150, 150, 0.6) rgba(60, 60, 60, 0.3);
}

.prompt-input::-webkit-scrollbar {
  width: 6px;
}

.prompt-input::-webkit-scrollbar-track {
  background: rgba(60, 60, 60, 0.3);
  border-radius: 3px;
}

.prompt-input::-webkit-scrollbar-thumb {
  background: rgba(150, 150, 150, 0.6);
  border-radius: 3px;
}

.prompt-input::-webkit-scrollbar-thumb:hover {
  background: rgba(180, 180, 180, 0.8);
}

.prompt-input::-webkit-scrollbar-thumb:active {
  background: rgba(200, 200, 200, 0.9);
}

.prompt-input::placeholder {
  color: var(--canvas-text-placeholder, #4a4a4a);
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--canvas-border-subtle, #2a2a2a);
  gap: 12px;
  flex-wrap: nowrap;
  min-height: 48px;
}

.config-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.config-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* 模型选择器（自定义下拉框）- 扁平化设计 */
.model-selector-custom {
  position: relative;
  z-index: 100;
}

.model-selector-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 32px;
}

.model-selector-trigger:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

.model-icon {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1;
}

.model-name {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
}

.select-arrow {
  color: rgba(255, 255, 255, 0.5);
  font-size: 9px;
  margin-left: auto;
  transition: transform 0.2s;
}

.select-arrow.arrow-up {
  transform: rotate(180deg);
}

/* 下拉列表 - 黑白灰滚动条 */
.model-dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 220px;
  max-height: 360px; /* 增加高度，一次显示 6 个模型 */
  overflow-y: auto;
  background: rgba(20, 20, 20, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  z-index: 1000;
  backdrop-filter: blur(8px);
}

/* 向上展开时的样式 */
.model-dropdown-list.dropdown-up {
  top: auto;
  bottom: calc(100% + 4px);
}

/* 黑白灰滚动条样式 */
.model-dropdown-list::-webkit-scrollbar {
  width: 6px;
}

.model-dropdown-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 3px;
}

.model-dropdown-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  transition: background 0.2s;
}

.model-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.model-dropdown-list::-webkit-scrollbar-thumb:active {
  background: rgba(255, 255, 255, 0.35);
}

.model-dropdown-item {
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.model-dropdown-item:last-child {
  border-bottom: none;
}

.model-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.model-dropdown-item.active {
  background: rgba(255, 255, 255, 0.08);
}

.model-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-item-icon {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1;
}

.model-item-label {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
  flex: 1;
}

.model-item-points {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
}

.model-item-desc {
  margin-top: 4px;
  padding-left: 21px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

/* 下拉动画 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.model-dropdown-list.dropdown-up.dropdown-fade-enter-from,
.model-dropdown-list.dropdown-up.dropdown-fade-leave-to {
  transform: translateY(8px);
}

/* 兼容旧样式名称 */
.model-item-name {
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 2px;
}

.model-item-desc {
  color: var(--canvas-text-tertiary, #888);
  font-size: 11px;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}

/* 下拉面板滚动条 */
.model-dropdown-panel::-webkit-scrollbar {
  width: 5px;
}

.model-dropdown-panel::-webkit-scrollbar-track {
  background: transparent;
}

.model-dropdown-panel::-webkit-scrollbar-thumb {
  background: var(--canvas-border-default, #3a3a3a);
  border-radius: 3px;
}

.model-dropdown-panel::-webkit-scrollbar-thumb:hover {
  background: var(--canvas-border-active, #4a4a4a);
}

/* 比例选择器 - 扁平化设计 */
.ratio-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 32px;
}

.ratio-selector:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

.ratio-icon {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.ratio-select-input {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  cursor: pointer;
  outline: none;
  padding: 0;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}

.ratio-select-input option {
  background: #1a1a1a;
  color: #ffffff;
  padding: 8px;
}

.ratio-select-input:hover {
  color: rgba(255, 255, 255, 1);
}

/* 参数选择芯片 - 扁平化设计 */
.param-chip {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  min-height: 32px;
  display: flex;
  align-items: center;
}

.param-chip:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
}

.param-chip.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: rgba(59, 130, 246, 0.9);
}

.param-chip-group {
  display: flex;
  gap: 6px;
}

/* Vidu 错峰模式开关 */
.off-peak-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  min-height: 32px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.off-peak-toggle input {
  display: none;
}

.off-peak-toggle:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

.off-peak-toggle.active {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.4);
  color: rgb(165, 180, 252);
}

.off-peak-toggle .toggle-icon {
  font-size: 12px;
  line-height: 1;
}

/* Vidu 清晰度切换 */
.resolution-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  min-height: 32px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.resolution-chip:hover {
  border-color: rgba(255, 255, 255, 0.35);
  color: rgba(255, 255, 255, 0.8);
}

.resolution-chip.is-720p {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.5);
  color: rgb(110, 231, 183);
}

/* 白昼模式 - 清晰度切换 */
:root.canvas-theme-light .video-node .resolution-chip {
  background: transparent;
  border-color: rgba(0, 0, 0, 0.2);
  color: rgba(0, 0, 0, 0.6);
}

:root.canvas-theme-light .video-node .resolution-chip:hover {
  border-color: rgba(0, 0, 0, 0.35);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .video-node .resolution-chip.is-720p {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.45);
  color: rgb(5, 150, 105);
}

.off-peak-toggle .toggle-text {
  font-weight: 500;
}

/* 白昼模式 - 错峰开关 */
:root.canvas-theme-light .video-node .off-peak-toggle {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .video-node .off-peak-toggle:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .video-node .off-peak-toggle.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.4);
  color: #6366f1;
}

.count-display {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

.count-display.clickable {
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
  min-height: 32px;
  display: flex;
  align-items: center;
}

.count-display.clickable:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(59, 130, 246, 0.4);
  color: rgba(59, 130, 246, 0.9);
}

/* 积分消耗显示 - 黑白灰风格 */
.points-cost-display {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}

.generate-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--canvas-accent-primary, #3b82f6);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.generate-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 0 16px rgba(59, 130, 246, 0.5);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-arrow {
  stroke: white;
}

.btn-loading {
  font-size: 14px;
}

/* 端口样式 - 位置与+按钮对齐（但视觉隐藏） */
.node-handle {
  width: 1px;
  height: 1px;
  background: transparent;
  border: none;
  opacity: 0;
  pointer-events: none;
}

.node-handle-hidden {
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none;
}

/* 调整 Handle 位置与 + 按钮中心对齐 */
/* Handle 现已移入 node-wrapper，直接居中对齐 */
:deep(.vue-flow__handle.target) {
  left: -34px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.source) {
  right: -34px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

/* Resize 时禁用过渡，防止连线错位 */
.video-node.resizing .node-card {
  transition: none !important;
}

/* 添加按钮 */
.node-add-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.5);
  font-size: 22px;
  font-weight: 300;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 10;
}

.node-wrapper:hover .node-add-btn,
.video-node.selected .node-add-btn {
  opacity: 1;
}

.node-add-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-50%) scale(1.1);
}

.node-add-btn-left {
  left: -52px;
}

.node-add-btn-right {
  right: -52px;
}

/* Resize Handles */
.resize-handle {
  position: absolute;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 20;
}

.node-card:hover .resize-handle {
  opacity: 1;
}

.resize-handle-right {
  right: -2px;
  top: 0;
  width: 4px;
  height: 100%;
  cursor: ew-resize;
}

.resize-handle-right:hover {
  background: var(--canvas-accent-primary, #3b82f6);
}

.resize-handle-bottom {
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 4px;
  cursor: ns-resize;
}

.resize-handle-bottom:hover {
  background: var(--canvas-accent-primary, #3b82f6);
}

.resize-handle-corner {
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  background: var(--canvas-accent-primary, #3b82f6);
  border-radius: 2px;
}

/* 隐藏的文件输入 - 使用更可靠的隐藏方式 */
.hidden-file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
  z-index: -1;
}

/* ========== 全屏预览模态框 ========== */
.fullscreen-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(12px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fullscreen-preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  animation: scaleIn 0.25s ease;
}

@keyframes scaleIn {
  from { 
    opacity: 0;
    transform: scale(0.9);
  }
  to { 
    opacity: 1;
    transform: scale(1);
  }
}

.fullscreen-video {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 12px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
  background: #000;
}

.fullscreen-close-btn {
  position: absolute;
  top: -48px;
  right: 0;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: white;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.fullscreen-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   VideoNode 白昼模式样式适配
   ======================================== */

/* 节点卡片 - 白昼模式（无边框设计） */
:root.canvas-theme-light .video-node .node-card {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .video-node:hover .node-card {
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .video-node.selected .node-card {
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

:root.canvas-theme-light .video-node .config-panel {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .video-node .panel-frames {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .video-node .panel-frames-label {
  color: #57534e;
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .video-node .panel-frames-hint {
  color: #a8a29e;
}

/* 上下文文字参考 - 白昼模式 */
:root.canvas-theme-light .video-node .context-reference-section {
  background: rgba(59, 130, 246, 0.06);
}

:root.canvas-theme-light .video-node .context-reference-label {
  color: #3b82f6;
}

:root.canvas-theme-light .video-node .context-reference-hint {
  color: #a8a29e;
}

:root.canvas-theme-light .video-node .context-reference-content {
  background: rgba(0, 0, 0, 0.03);
  color: #57534e;
}

:root.canvas-theme-light .video-node .prompt-input {
  color: #1c1917;
  scrollbar-color: rgba(120, 120, 120, 0.5) rgba(200, 200, 200, 0.3);
}

:root.canvas-theme-light .video-node .prompt-input::placeholder {
  color: #a8a29e;
}

:root.canvas-theme-light .video-node .prompt-input::-webkit-scrollbar-track {
  background: rgba(200, 200, 200, 0.3);
}

:root.canvas-theme-light .video-node .prompt-input::-webkit-scrollbar-thumb {
  background: rgba(120, 120, 120, 0.5);
}

:root.canvas-theme-light .video-node .prompt-input::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 100, 100, 0.7);
}

:root.canvas-theme-light .video-node .model-selector-trigger {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .video-node .model-selector-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .video-node .model-name {
  color: #1c1917;
}

:root.canvas-theme-light .video-node .select-arrow {
  color: #78716c;
}

:root.canvas-theme-light .video-node .model-dropdown-list {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .video-node .model-dropdown-item {
  border-bottom-color: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .video-node .model-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .video-node .model-dropdown-item.active {
  background: rgba(245, 158, 11, 0.1);
}

:root.canvas-theme-light .video-node .model-item-name {
  color: #1c1917;
}

:root.canvas-theme-light .video-node .model-item-desc {
  color: #78716c;
}

:root.canvas-theme-light .video-node .count-selector {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .video-node .points-display {
  color: #78716c;
}

:root.canvas-theme-light .video-node .points-cost {
  color: #f59e0b;
}

:root.canvas-theme-light .video-node .ready-status {
  color: #57534e;
}

:root.canvas-theme-light .video-node .ready-hint {
  color: #a8a29e;
}

:root.canvas-theme-light .video-node .quick-action {
  color: #57534e;
}

:root.canvas-theme-light .video-node .quick-action:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #1c1917;
}

:root.canvas-theme-light .video-node .quick-actions-title {
  color: #f59e0b;
}

:root.canvas-theme-light .video-node .model-dropdown-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .video-node .model-dropdown-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .video-node .model-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

/* 模型下拉菜单项 - 白昼模式 */
:root.canvas-theme-light .video-node .model-item-label {
  color: #1c1917;
}

:root.canvas-theme-light .video-node .model-item-icon {
  color: #57534e;
}

:root.canvas-theme-light .video-node .model-item-points {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

/* 时长选择器 - 白昼模式 */
:root.canvas-theme-light .video-node .duration-selector {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .video-node .duration-btn {
  color: #57534e;
  background: transparent;
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .video-node .duration-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .video-node .duration-btn.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

:root.canvas-theme-light .video-node .duration-label {
  color: #57534e;
}

:root.canvas-theme-light .video-node .duration-points {
  color: #f59e0b;
}

/* 尺寸选择器 - 白昼模式 */
:root.canvas-theme-light .video-node .size-selector {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .video-node .size-btn {
  color: #57534e;
  background: transparent;
}

:root.canvas-theme-light .video-node .size-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .video-node .size-btn.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

:root.canvas-theme-light .video-node .size-label {
  color: #57534e;
}

/* 比例选择器 - 白昼模式 */
:root.canvas-theme-light .video-node .ratio-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .video-node .ratio-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .video-node .ratio-btn.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

/* 添加按钮 - 白昼模式 */
:root.canvas-theme-light .video-node .add-frame-btn {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
  color: #78716c;
}

:root.canvas-theme-light .video-node .add-frame-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
  color: #57534e;
}

:root.canvas-theme-light .video-node .add-label {
  color: #f59e0b;
}

:root.canvas-theme-light .video-node .panel-frame-add {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
  color: #78716c;
}

:root.canvas-theme-light .video-node .panel-frame-add:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.15);
  color: #57534e;
}

/* 比例选择器 - 白昼模式 */
:root.canvas-theme-light .video-node .ratio-selector {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .video-node .ratio-selector:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .video-node .ratio-icon {
  color: #78716c;
}

:root.canvas-theme-light .video-node .ratio-select-input {
  color: #1c1917;
}

:root.canvas-theme-light .video-node .ratio-select-input option {
  background: #ffffff;
  color: #1c1917;
}

/* 参数选择芯片 - 白昼模式 */
:root.canvas-theme-light .video-node .param-chip {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .video-node .param-chip:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
  color: #1c1917;
}

:root.canvas-theme-light .video-node .param-chip.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

:root.canvas-theme-light .video-node .count-display {
  color: #57534e;
}

/* 提示文字 - 白昼模式 */
:root.canvas-theme-light .video-node .prompt-hint {
  color: #a8a29e;
}

/* 生成按钮禁用 - 白昼模式 */
:root.canvas-theme-light .video-node .generate-btn:disabled {
  background: rgba(0, 0, 0, 0.1);
}

/* 积分显示 - 白昼模式 */
:root.canvas-theme-light .video-node .points-cost-display {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.2);
}

:root.canvas-theme-light .video-node .points-value {
  color: #f59e0b;
}

:root.canvas-theme-light .video-node .points-label {
  color: #78716c;
}

/* 批次显示 - 白昼模式 */
:root.canvas-theme-light .video-node .count-display {
  color: #57534e;
}

:root.canvas-theme-light .video-node .count-display.clickable {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .video-node .count-display.clickable:hover {
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

/* 视频节点工具栏 - 白昼模式 */
:root.canvas-theme-light .video-node .video-toolbar {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .video-node .video-toolbar .toolbar-btn {
  color: #57534e;
}

:root.canvas-theme-light .video-node .video-toolbar .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

:root.canvas-theme-light .video-node .video-toolbar .toolbar-divider {
  background: rgba(0, 0, 0, 0.1);
}

/* 节点标签 - 白昼模式 */
:root.canvas-theme-light .video-node .node-label {
  color: #3b82f6;
}

/* ==================== Sora2 高级选项样式 ==================== */

/* 展开/收起按钮 */
.sora2-collapse-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px 0;
  background: transparent;
  border: none;
  border-top: 1px solid #2a2a2a;
  color: #666666;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.sora2-collapse-trigger:hover {
  color: #888888;
  background: rgba(255, 255, 255, 0.02);
}

.sora2-collapse-icon {
  font-size: 10px;
  transition: transform 0.2s;
}

.sora2-collapse-icon.expanded {
  transform: rotate(180deg);
}

/* 高级选项容器 */
.sora2-advanced-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid #2a2a2a;
  background: rgba(0, 0, 0, 0.2);
}

/* 选项行 */
.sora2-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sora2-option-row.vertical {
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.sora2-option-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.sora2-option-label {
  font-size: 13px;
  color: #cccccc;
  font-weight: 500;
}

.sora2-tag-count {
  font-size: 11px;
  color: #555555;
  margin-left: auto;
}

/* 开关样式 */
.sora2-toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.sora2-toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.sora2-toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #333333;
  border-radius: 22px;
  transition: 0.3s;
}

.sora2-toggle-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: #666666;
  border-radius: 50%;
  transition: 0.3s;
}

.sora2-toggle-switch input:checked + .sora2-toggle-slider {
  background-color: #ffffff;
}

.sora2-toggle-switch input:checked + .sora2-toggle-slider:before {
  transform: translateX(18px);
  background-color: #000000;
}

/* 风格标签选择 */
.sora2-style-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
  max-width: 320px;
}

.sora2-style-tag {
  padding: 5px 10px;
  border: 1px solid #333333;
  background: #252525;
  color: #aaaaaa;
  font-size: 12px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.sora2-style-tag:hover {
  border-color: #555555;
  background: #2a2a2a;
  color: #ffffff;
}

.sora2-style-tag.selected {
  border-color: #666666;
  background: #ffffff;
  color: #000000;
  font-weight: 500;
}

/* 滑入动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  opacity: 1;
  max-height: 300px;
}

/* ==================== Kling 摄像机控制样式 ==================== */
.kling-advanced {
  max-height: none; /* 移除高度限制，允许内容自然撑开 */
}

.kling-camera-types,
.kling-camera-configs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.kling-camera-type-btn,
.kling-camera-config-btn {
  padding: 6px 10px;
  border: 1px solid #444444;
  border-radius: 6px;
  background: #1e1e1e;
  color: #a0a0a0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.kling-camera-type-btn:hover,
.kling-camera-config-btn:hover {
  border-color: #555555;
  background: #2a2a2a;
  color: #ffffff;
}

.kling-camera-type-btn.active,
.kling-camera-config-btn.active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}

.kling-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.kling-slider-value {
  font-size: 14px;
  font-weight: 600;
  color: #8b5cf6;
  min-width: 32px;
  text-align: right;
}

.kling-slider-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.kling-slider-label {
  font-size: 11px;
  color: #666666;
  min-width: 24px;
  text-align: center;
}

.kling-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(to right, #ef4444 0%, #444444 50%, #22c55e 100%);
  border-radius: 2px;
  cursor: pointer;
}

.kling-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #ffffff;
  border: 2px solid #8b5cf6;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.kling-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #ffffff;
  border: 2px solid #8b5cf6;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.kling-slider-hint {
  font-size: 11px;
  color: #666666;
  margin-top: 4px;
  text-align: center;
}

.kling-camera-tip {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: #a78bfa;
}

/* Kling 2.6+ 音频样式 */
.kling-section-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(139, 92, 246, 0.3), transparent);
  margin: 12px 0;
}

/* 音色列表独立容器 - 确保样式完全隔离 */
.kling-voice-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 0 12px 0; /* 增加底部内边距 */
  color: #cccccc;
  width: 100%;
}

.kling-voice-title {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
}

.kling-voice-title > span:first-child {
  color: #cccccc;
}

.kling-voice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #cccccc;
}

.kling-voice-header .sora2-option-label {
  color: #cccccc !important;
}

.kling-voice-title > span:first-child {
  color: #e5e5e5 !important;
  opacity: 1 !important;
}

.kling-voice-count {
  font-size: 12px;
  color: #a78bfa !important;
  opacity: 1 !important;
}

/* 确保音色列表区域的所有文字颜色正确 */
.kling-voice-section .kling-voice-input-row {
  display: flex;
  flex-direction: row;
  gap: 8px;
  width: 100%;
  color: #e0e0e0;
}

.kling-voice-section .kling-voice-input {
  flex: 1;
}

.kling-voice-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.kling-voice-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 4px;
  font-size: 12px;
  color: #a78bfa;
}

.kling-voice-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  background: transparent;
  border: none;
  color: #a78bfa;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.kling-voice-remove:hover {
  opacity: 1;
}

.kling-voice-input-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.kling-voice-input {
  flex: 1;
  padding: 6px 10px;
  background: #1e1e1e;
  border: 1px solid #444444;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}

.kling-voice-input:focus {
  border-color: #8b5cf6;
}

.kling-voice-input::placeholder {
  color: #666666;
}

.kling-voice-add-btn {
  padding: 6px 12px;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 6px;
  color: #a78bfa !important;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  opacity: 1 !important;
}

.kling-voice-add-btn:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.25);
  border-color: rgba(139, 92, 246, 0.5);
}

.kling-voice-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.kling-voice-hint {
  font-size: 11px;
  color: #666666 !important;
  line-height: 1.4;
}

.kling-sound-multiplier {
  color: #fbbf24;
  font-weight: 600;
  font-size: 11px;
}

/* Seedance 高级选项样式 */
.seedance-advanced {
  border-color: #f97316;
}

.seedance-sound-hint {
  font-size: 11px;
  color: #f97316;
  line-height: 1.4;
  padding: 6px 8px;
  background: rgba(249, 115, 22, 0.1);
  border-radius: 4px;
  margin-top: 8px;
}

/* Kling 白昼模式 */
:root.canvas-theme-light .kling-camera-type-btn,
:root.canvas-theme-light .kling-camera-config-btn {
  border-color: #e5e5e5;
  background: #f8f8f8;
  color: #666666;
}

:root.canvas-theme-light .kling-camera-type-btn:hover,
:root.canvas-theme-light .kling-camera-config-btn:hover {
  border-color: #d4d4d4;
  background: #f0f0f0;
  color: #333333;
}

:root.canvas-theme-light .kling-camera-type-btn.active,
:root.canvas-theme-light .kling-camera-config-btn.active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

:root.canvas-theme-light .kling-slider-value {
  color: #7c3aed;
}

:root.canvas-theme-light .kling-slider-label {
  color: #999999;
}

:root.canvas-theme-light .kling-slider-hint {
  color: #888888;
}

:root.canvas-theme-light .kling-camera-tip {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.2);
  color: #7c3aed;
}

/* Kling 2.6+ 音频 - 白昼模式 */
:root.canvas-theme-light .kling-section-divider {
  background: linear-gradient(to right, transparent, rgba(139, 92, 246, 0.2), transparent);
}

:root.canvas-theme-light .kling-voice-count {
  color: #7c3aed !important;
}

:root.canvas-theme-light .kling-voice-header .sora2-option-label {
  color: #1c1917 !important;
}

:root.canvas-theme-light .kling-voice-header {
  color: #1c1917;
}

:root.canvas-theme-light .kling-voice-section {
  color: #1c1917;
}

:root.canvas-theme-light .kling-voice-title {
  color: #1c1917;
}

:root.canvas-theme-light .kling-voice-title > span:first-child {
  color: #1c1917 !important;
}

:root.canvas-theme-light .kling-voice-count {
  color: #7c3aed !important;
}

:root.canvas-theme-light .kling-voice-add-btn {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.2);
  color: #7c3aed !important;
}

/* =============================================
   Kling 动作迁移样式（Motion Control）
   ============================================= */

/* 动作迁移配置区域 */
.kling-motion-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: rgba(139, 92, 246, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(139, 92, 246, 0.15);
}

.kling-motion-title {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 4px;
}

/* 必填标记 */
.kling-required {
  color: #ef4444;
  font-weight: bold;
}

/* 参考视频输入框 */
.kling-motion-input {
  width: 100%;
  padding: 8px 12px;
  background: rgba(30, 30, 30, 0.8);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 12px;
  transition: all 0.2s ease;
}

.kling-motion-input:focus {
  outline: none;
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(30, 30, 30, 0.95);
}

.kling-motion-input::placeholder {
  color: #888888;
}

/* 提示文字 */
.kling-motion-hint {
  font-size: 11px;
  color: #888888;
  line-height: 1.4;
}

/* 模式选择按钮组 */
.kling-motion-modes {
  display: flex;
  gap: 8px;
}

.kling-motion-mode-btn {
  flex: 1;
  padding: 8px 12px;
  background: rgba(30, 30, 30, 0.6);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 6px;
  color: #a0a0a0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.kling-motion-mode-btn:hover {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
}

.kling-motion-mode-btn.active {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.5);
  color: #e0e0e0;
}

/* 模式说明 */
.kling-motion-mode-hint {
  font-size: 11px;
  color: #888888;
  text-align: center;
  margin-top: 4px;
}

/* 标签行（包含标签和状态） */
.kling-motion-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

/* 加载中状态 */
.kling-motion-loading {
  font-size: 11px;
  color: #f59e0b;
}

/* 视频时长显示 */
.kling-motion-duration {
  font-size: 11px;
  color: #10b981;
}

/* 错误标签 */
.kling-motion-error-tag {
  font-size: 11px;
  color: #ef4444;
}

/* 错误信息 */
.kling-motion-error {
  font-size: 11px;
  color: #ef4444;
  margin-top: 4px;
}

/* 输入框错误状态 */
.kling-motion-input.has-error {
  border-color: #ef4444;
}

/* 白昼模式 - 动作迁移 */
:root.canvas-theme-light .kling-motion-section {
  background: rgba(139, 92, 246, 0.05);
  border-color: rgba(139, 92, 246, 0.1);
}

:root.canvas-theme-light .kling-motion-title {
  color: #1c1917;
}

:root.canvas-theme-light .kling-motion-input {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(139, 92, 246, 0.2);
  color: #1c1917;
}

:root.canvas-theme-light .kling-motion-input:focus {
  background: #ffffff;
  border-color: rgba(139, 92, 246, 0.4);
}

:root.canvas-theme-light .kling-motion-input::placeholder {
  color: #9ca3af;
}

:root.canvas-theme-light .kling-motion-hint {
  color: #6b7280;
}

:root.canvas-theme-light .kling-motion-mode-btn {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(139, 92, 246, 0.15);
  color: #6b7280;
}

:root.canvas-theme-light .kling-motion-mode-btn:hover {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.25);
}

:root.canvas-theme-light .kling-motion-mode-btn.active {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.4);
  color: #1c1917;
}

:root.canvas-theme-light .kling-motion-mode-hint {
  color: #6b7280;
}


:root.canvas-theme-light .kling-voice-tag {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.2);
  color: #7c3aed;
}

:root.canvas-theme-light .kling-voice-remove {
  color: #7c3aed;
}

:root.canvas-theme-light .kling-voice-input {
  background: #f8f8f8;
  border-color: #e5e5e5;
  color: #333333;
}

:root.canvas-theme-light .kling-voice-input:focus {
  border-color: #8b5cf6;
}

:root.canvas-theme-light .kling-voice-input::placeholder {
  color: #999999;
}

:root.canvas-theme-light .kling-voice-add-btn {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.2);
  color: #7c3aed;
}

:root.canvas-theme-light .kling-voice-add-btn:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.3);
}

:root.canvas-theme-light .kling-voice-hint {
  color: #888888 !important;
}

:root.canvas-theme-light .kling-sound-multiplier {
  color: #d97706;
}

/* Sora2 高级选项 - 白昼模式 */
:root.canvas-theme-light .sora2-collapse-trigger {
  border-top-color: rgba(0, 0, 0, 0.1);
  color: #78716c;
}

:root.canvas-theme-light .sora2-collapse-trigger:hover {
  color: #57534e;
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .sora2-advanced-options {
  border-top-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .sora2-option-label {
  color: #1c1917;
}

:root.canvas-theme-light .sora2-tag-count {
  color: #a8a29e;
}

:root.canvas-theme-light .sora2-toggle-slider {
  background-color: #e7e5e4;
}

:root.canvas-theme-light .sora2-toggle-slider:before {
  background-color: #a8a29e;
}

:root.canvas-theme-light .sora2-toggle-switch input:checked + .sora2-toggle-slider {
  background-color: #1c1917;
}

:root.canvas-theme-light .sora2-toggle-switch input:checked + .sora2-toggle-slider:before {
  background-color: #ffffff;
}

:root.canvas-theme-light .sora2-style-tag {
  border-color: rgba(0, 0, 0, 0.1);
  background: #f5f5f4;
  color: #57534e;
}

:root.canvas-theme-light .sora2-style-tag:hover {
  border-color: rgba(0, 0, 0, 0.2);
  background: #e7e5e4;
  color: #1c1917;
}

:root.canvas-theme-light .sora2-style-tag.selected {
  border-color: #1c1917;
  background: #1c1917;
  color: #ffffff;
}

/* ==================== Vidu 图生视频模式样式 ==================== */
.vidu-mode-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.vidu-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.vidu-mode-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--canvas-text-primary, #e0e0e0);
}

.vidu-mode-hint {
  font-size: 11px;
  color: var(--canvas-text-muted, #888);
}

.vidu-mode-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.vidu-mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: all 0.2s ease;
}

.vidu-mode-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
}

.vidu-mode-btn.active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.15);
}

.vidu-mode-btn-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--canvas-text-primary, #e0e0e0);
}

.vidu-mode-btn.active .vidu-mode-btn-label {
  color: #a78bfa;
}

.vidu-mode-btn-desc {
  font-size: 10px;
  color: var(--canvas-text-muted, #888);
  margin-top: 2px;
}

.vidu-mode-tip {
  font-size: 11px;
  padding: 8px 10px;
  border-radius: 6px;
  line-height: 1.4;
}

.vidu-mode-tip.blue {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.vidu-mode-tip.purple {
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}

.vidu-mode-tip.warning {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

/* Vidu 模式 - 白昼模式 */
:root.canvas-theme-light .vidu-mode-section {
  border-top-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .vidu-mode-label {
  color: #1c1917;
}

:root.canvas-theme-light .vidu-mode-hint {
  color: #78716c;
}

:root.canvas-theme-light .vidu-mode-btn {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .vidu-mode-btn:hover {
  border-color: rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .vidu-mode-btn.active {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.1);
}

:root.canvas-theme-light .vidu-mode-btn-label {
  color: #1c1917;
}

:root.canvas-theme-light .vidu-mode-btn.active .vidu-mode-btn-label {
  color: #7c3aed;
}

:root.canvas-theme-light .vidu-mode-btn-desc {
  color: #78716c;
}

:root.canvas-theme-light .vidu-mode-tip.blue {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}

:root.canvas-theme-light .vidu-mode-tip.purple {
  background: rgba(139, 92, 246, 0.08);
  border-color: rgba(139, 92, 246, 0.15);
  color: #7c3aed;
}

:root.canvas-theme-light .vidu-mode-tip.warning {
  background: rgba(217, 119, 6, 0.08);
  border-color: rgba(217, 119, 6, 0.15);
  color: #d97706;
}

/* ==================== VEO 模型模式样式 ==================== */
.veo-mode-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.veo-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.veo-mode-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--canvas-text-primary, #e0e0e0);
}

.veo-mode-hint {
  font-size: 11px;
  color: var(--canvas-text-muted, #888);
}

.veo-mode-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.veo-mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: all 0.2s ease;
}

.veo-mode-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
}

.veo-mode-btn.active {
  border-color: #ffffff;
  background: rgba(255, 255, 255, 0.15);
}

.veo-mode-btn-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--canvas-text-primary, #e0e0e0);
}

.veo-mode-btn.active .veo-mode-btn-label {
  color: #ffffff;
}

.veo-mode-btn-desc {
  font-size: 10px;
  color: var(--canvas-text-muted, #888);
  margin-top: 2px;
}

/* VEO 清晰度选择 */
.veo-resolution-section {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.veo-resolution-label {
  font-size: 12px;
  color: var(--canvas-text-secondary, #a0a0a0);
}

.veo-resolution-options {
  display: flex;
  gap: 6px;
}

.veo-resolution-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  color: var(--canvas-text-secondary, #a0a0a0);
  cursor: pointer;
  transition: all 0.2s ease;
}

.veo-resolution-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
}

.veo-resolution-btn.active {
  border-color: #ffffff;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.veo-resolution-btn .extra-cost {
  font-size: 10px;
  color: #a0a0a0;
  margin-left: 4px;
}

/* VEO 模式提示 */
.veo-mode-tip {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.4;
}

.veo-mode-tip.blue {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #a0a0a0;
}

.veo-mode-tip.purple {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #a0a0a0;
}

.veo-mode-tip.gold {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #d0d0d0;
}

.veo-mode-tip.warning {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #a0a0a0;
}

/* VEO 模式 - 白昼模式 */
:root.canvas-theme-light .veo-mode-section {
  border-top-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .veo-mode-label {
  color: #1c1917;
}

:root.canvas-theme-light .veo-mode-hint {
  color: #78716c;
}

:root.canvas-theme-light .veo-mode-btn {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .veo-mode-btn:hover {
  border-color: rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .veo-mode-btn.active {
  border-color: #1a1a1a;
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .veo-mode-btn-label {
  color: #1c1917;
}

:root.canvas-theme-light .veo-mode-btn.active .veo-mode-btn-label {
  color: #000000;
}

:root.canvas-theme-light .veo-mode-btn-desc {
  color: #78716c;
}

:root.canvas-theme-light .veo-resolution-btn {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
  color: #57534e;
}

:root.canvas-theme-light .veo-resolution-btn:hover {
  border-color: rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .veo-resolution-btn.active {
  border-color: #1a1a1a;
  background: rgba(0, 0, 0, 0.1);
  color: #000000;
}

:root.canvas-theme-light .veo-mode-tip.blue {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #525252;
}

:root.canvas-theme-light .veo-mode-tip.purple {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #525252;
}

:root.canvas-theme-light .veo-mode-tip.gold {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.12);
  color: #404040;
}

:root.canvas-theme-light .veo-mode-tip.warning {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #525252;
}
</style>
