<script setup>
import { t as translateUi, currentLanguage as uiLanguage } from '@/i18n'

import { streamVideo as vStreamVideo } from '@/directives/streamVideo'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getMe, isQiniuCdnUrl, buildVideoDownloadUrl, uploadImages } from '@/api/client'
import { config as tenantConfig, getTenantHeaders, getModelDisplayName, isModelEnabled, getAvailableVideoModels, getApiUrl, getMediaUrl } from '@/config/tenant'
import { shouldHistoryDrawerOpenByDefault } from '@/utils/deviceDetection'
import { toSameOriginUrl } from '@/utils/canvasThumbnail'
import { getCosProxyUrl, isCosCdn, isVideoUrl as isVideoMediaFile } from '@/utils/cloudMediaUrl'
import { formatPoints } from '@/utils/format'
import { getTotalUserPoints } from '@/utils/points'
import { estimateWan3Points, readWan3ReferenceDuration } from '@/utils/wan3Billing'
import { applyNodeRateToPoints } from '@/utils/userGroupRate'
import { calculateVideoResolutionPrice, resolveVideoResolutionPricing, getEnabledVideoResolutionOptions } from '@/utils/videoResolutionPricing'
import { calculateSeedanceResolutionCost } from '@/utils/seedanceResolutionPricing'
import { normalizePromptLineEndings } from '@/utils/promptText'
import { pickConfiguredSubmode } from '@/utils/videoSubmodeDefaults'
import {
  getDefaultGenerationModeForVideoModel,
  getDefaultSeedance2ModeForVideoModel,
  isSeedanceSd2VideoModel,
  resolveVideoRequestModel
} from '@/utils/videoGenerationMode'
import { compressImage, getImageFileDimensions } from '@/utils/imageCompress'
import {
  SEEDANCE_MAX_AUDIOS,
  SEEDANCE_MAX_IMAGES,
  SEEDANCE_MAX_IMAGE_PIXELS,
  SEEDANCE_MAX_VIDEOS,
  readLocalVideoMetadata,
  validatePreparedSeedanceImage,
  validateSeedanceVideoMetadata,
  validateSeedanceModeInputs
} from '@/utils/seedanceMediaValidation'
import { resolveSeedance2Limits, validateSeedanceReferenceCounts } from '@/utils/seedance2Limits'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'
import { useModelStatsStore } from '@/stores/canvas/modelStatsStore'
import { useTeamStore } from '@/stores/team'
import { createQuickSeedanceCharacterAsset, pollAssetStatus } from '@/api/canvas/volcengine-assets'
import {
  appendSpaceParamsToFormData,
  buildSpaceHistoryUrl,
  getCurrentBeginnerSpaceParams
} from '@/utils/beginnerSpaceParams'
import {
  getVideoGenerationProgressText,
  hasVideoGenerationTimedOut,
  parseTaskCreatedAtForTimeout,
  shouldShowVideoGenerationTimeoutHint
} from '@/utils/videoGenerationProgress'

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

const isRunningHubAiAppVideoModel = computed(() => currentModelConfig.value?.apiType === 'runninghub-ai-app-video')
const isRunningHubAiAppVideoV31Model = computed(() => currentModelConfig.value?.apiType === 'runninghub-ai-app-video-v31')

// RunningHub 全能视频 V3.1 六种生成模式
const RUNNINGHUB_V31_MODES = [
  { value: 't2v', get label() { return translateUi('canvas.nodeTypes.textToVideo') }, icon: '✍️', needsImages: 0, needsAudio: false },
  { value: 'i2v', get label() { return translateUi('uiMessages.mcba35bf1fba8') }, icon: '🎬', needsImages: 1, needsAudio: false },
  { value: 'first_last_frame', get label() { return translateUi('uiMessages.mffac1f54a210') }, icon: '🖼️', needsImages: 2, needsAudio: false },
  { value: 'last_frame', get label() { return translateUi('uiMessages.m01d4729a767b') }, icon: '🔚', needsImages: 1, needsAudio: false },
  { value: 'multi_image', get label() { return translateUi('uiMessages.macf43c0bc42e') }, icon: '🗂️', needsImages: 1, maxImages: 3, needsAudio: false },
  { value: 'image_audio', get label() { return translateUi('uiMessages.mac958a0778ba') }, icon: '🎵', needsImages: 1, needsAudio: true }
]
const v31Mode = ref('t2v')
const v31AudioFile = ref(null)
const v31AudioInputRef = ref(null)
const v31ModeConfig = computed(() => RUNNINGHUB_V31_MODES.find(m => m.value === v31Mode.value) || RUNNINGHUB_V31_MODES[0])
const v31NeedsImages = computed(() => v31ModeConfig.value.needsImages > 0)
const v31NeedsAudio = computed(() => v31ModeConfig.value.needsAudio)

const videoResolutionOptions = computed(() => {
  const enabledPricingResolutions = getEnabledVideoResolutionOptions(currentModelConfig.value?.resolutionPricing)
  if (enabledPricingResolutions.length > 0) {
    return enabledPricingResolutions.map(value => ({ value, label: String(value || '').toUpperCase() }))
  }
  const displayResolutions = currentModelConfig.value?.displayResolutions
  if (Array.isArray(displayResolutions)) {
    return displayResolutions
      .map(value => ({ value, label: String(value || '').toUpperCase() }))
      .filter(option => option.value)
  }
  const configuredOptions = currentModelConfig.value?.resolutionOptions
  if (Array.isArray(configuredOptions) && configuredOptions.length > 0) {
    return configuredOptions.map(option => {
      const value = typeof option === 'string' ? option : option?.value
      return { value, label: String(option?.label || value || '').toUpperCase() }
    }).filter(option => option.value)
  }
  if (isViduModel.value) {
    return [{ value: '720p', label: '720P' }, { value: '1080p', label: '1080P' }]
  }
  return []
})

const hasVideoResolutionSelection = computed(() => videoResolutionOptions.value.length > 0)

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
          '16:9': translateUi('uiMessages.m848cb51e297f'),
          '9:16': translateUi('uiMessages.m1f7a6c75ad56'),
          '1:1': translateUi('uiMessages.m2c2c18d9f020'),
          '4:3': '4:3',
          '3:4': '3:4',
          '21:9': translateUi('uiMessages.mb8950982437a')
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
    { value: '16:9', get label() { return translateUi('uiMessages.m848cb51e297f') } },
    { value: '9:16', get label() { return translateUi('uiMessages.m1f7a6c75ad56') } }
  ]
})

// VEO3模型的图片数量限制
const maxImagesForModel = computed(() => {
  if (isRunningHubAiAppVideoV31Model.value) return v31ModeConfig.value.maxImages || v31ModeConfig.value.needsImages
  const configuredMaxImages = Number(currentModelConfig.value?.maxRefImages)
  if (Number.isFinite(configuredMaxImages) && configuredMaxImages > 0) return configuredMaxImages
  // components 版本支持最多 3 张图
  if (model.value === 'veo3.1-components' || model.value === 'veo3.1-components-4k') return 3
  // 其他 VEO3 模型支持最多 2 张图（首尾帧）
  if (VEO3_MODELS.includes(model.value)) return 2
  return 9 // 其他模型
})

// Seedance 2.x 参考素材上限（历史 2.5 记录即使未保存 seedanceConfig 也按模型 ID 回退）
const seedanceModelLimits = computed(() => resolveSeedance2Limits(currentModelConfig.value))
const seedanceMaxRefImages = computed(() => {
  if (!isMinimaxH3Model.value) return seedanceModelLimits.value.maxImages
  const configured = Number((isMinimaxH3Model.value
    ? currentModelConfig.value?.minimaxConfig
    : currentModelConfig.value?.seedanceConfig)?.maxImages)
  return Number.isFinite(configured) && configured > 0 ? configured : 9
})
const seedanceMaxRefVideos = computed(() => {
  if (!isMinimaxH3Model.value) return seedanceModelLimits.value.maxVideos
  const configured = Number((isMinimaxH3Model.value
    ? currentModelConfig.value?.minimaxConfig
    : currentModelConfig.value?.seedanceConfig)?.maxVideos)
  return Number.isFinite(configured) && configured > 0 ? configured : 3
})
const seedanceMaxRefAudios = computed(() => {
  if (!isMinimaxH3Model.value) return seedanceModelLimits.value.maxAudios
  const configured = Number((isMinimaxH3Model.value
    ? currentModelConfig.value?.minimaxConfig
    : currentModelConfig.value?.seedanceConfig)?.maxAudios)
  return Number.isFinite(configured) && configured > 0 ? configured : 3
})
const seedanceMinDuration = computed(() => {
  if (!isMinimaxH3Model.value) return seedanceModelLimits.value.minDuration
  const configured = Number(currentModelConfig.value?.seedanceConfig?.minDuration)
  return Number.isFinite(configured) && configured > 0 ? configured : 4
})
const seedanceMaxDuration = computed(() => {
  if (!isMinimaxH3Model.value) return seedanceModelLimits.value.maxDuration
  const configured = Number(currentModelConfig.value?.seedanceConfig?.maxDuration)
  return Number.isFinite(configured) && configured > 0 ? configured : 15
})

// 当前模型是否支持「自动时长」(auto)：seedanceConfig.autoDuration === true 时显示开关
const canAutoDuration = computed(() => currentModelConfig.value?.seedanceConfig?.autoDuration === true)
const watermark = ref(false) // 默认false，隐藏选项
const isPrivate = ref(true) // 默认true，隐藏选项

// ========== Seedance 2.0 相关状态 ==========
const seedanceMode = ref('text2video') // 当前选择的 Seedance 模式
const seedanceResolution = ref('720p') // 分辨率：480p / 720p / 1080p / 4k
const seedanceRatio = ref('adaptive') // 宽高比
const seedanceDuration = ref(5) // 时长：由当前 Seedance 模型配置决定
const seedanceAutoDuration = ref(true) // 自动时长（auto）：开启时传 -1 由模型决定
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

// ========== 阿里云百炼万相 3.0 相关状态 ==========
// 万相 3.0 与 Seedance 共用已验证的媒体选择器状态，但请求字段始终走自己的百炼协议。
const wan3Mode = ref('text2video')
const wan3ModeOpen = ref(true)
const wan3AdvancedOpen = ref(false)
const wan3Duration = ref(5)
const wan3GenerateAudio = ref(true)
const wan3PromptExtend = ref(false)
const wan3Watermark = ref(false)
const wan3Seed = ref('')
const wan3File = ref(null)
const wan3FileInputRef = ref(null)
const wan3Link = ref('')

// ========== Kling v3 Omni 相关状态 ==========
const klingV3OmniMode = ref('text2video')
const klingV3OmniModeOpen = ref(true)

// Kling v3 Omni 首帧/尾帧图片
const klingV3OmniFirstFrameFile = ref(null)
const klingV3OmniFirstFramePreview = ref('')
const klingV3OmniLastFrameFile = ref(null)
const klingV3OmniLastFramePreview = ref('')

// Kling v3 Omni 参考图片（主体控制/多镜头）
const klingV3OmniRefImages = ref([])
const klingV3OmniRefImagePreviews = ref([])
const klingV3OmniRefImageUrl = ref('')
const klingV3OmniRefImageUrls = ref([])

// Kling v3 Omni 参考视频
const klingV3OmniRefVideoUrl = ref('')
const klingV3OmniKeepSound = ref('yes')

// Kling v3 Omni 文件上传 refs
const klingV3OmniFirstFrameInputRef = ref(null)
const klingV3OmniLastFrameInputRef = ref(null)
const klingV3OmniRefImageInputRef = ref(null)

// Seedance 模式定义
const SEEDANCE_MODES = [
  { value: 'text2video', get label() { return translateUi('canvas.nodeTypes.textToVideo') }, icon: '✍️' },
  { value: 'image2video_first', get label() { return translateUi('uiMessages.m0eee51419641') }, icon: '🖼️' },
  { value: 'image2video_first_last', get label() { return translateUi('uiMessages.ma44f24ac18b3') }, icon: '🎞️' },
  { value: 'multimodal_ref', get label() { return translateUi('uiMessages.m5d7b7e77768b') }, icon: '🎨' },
  { value: 'video_edit', get label() { return translateUi('common.edit') }, icon: '✂️' },
  { value: 'video_extend', get label() { return translateUi('uiMessages.m2895115abd8a') }, icon: '⏩' }
]

const WAN3_MODES = [
  { value: 'text2video', get label() { return translateUi('canvas.nodeTypes.textToVideo') }, icon: '✍️' },
  { value: 'image2video_first', get label() { return translateUi('uiMessages.m0eee51419641') }, icon: '🖼️' },
  { value: 'image2video_first_last', get label() { return translateUi('uiMessages.ma44f24ac18b3') }, icon: '🎞️' },
  { value: 'multimodal_ref', get label() { return translateUi('uiMessages.mb5ea8197a734') }, icon: '🎨' },
  { value: 'file', get label() { return translateUi('uiMessages.m14fbb41e2e68') }, icon: '📄' },
  { value: 'link', get label() { return translateUi('uiMessages.m6ff9e899b83c') }, icon: '🔗' }
]

const WAN3_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/webp'])
const WAN3_DOCUMENT_EXTENSIONS = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.key', '.pages', '.numbers', '.md'])

const SEEDANCE_RATIOS = [
  { value: 'adaptive', get label() { return translateUi('uiMessages.m8f1f75950e38') } },
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
  return isSeedanceSd2VideoModel(modelConfig)
})

// MiniMax H3 官方直连也使用 Seedance 兼容的多模态参考素材字段
const isAtlasCloudVideoModel = computed(() => String(currentModelConfig.value?.apiType || '').startsWith('atlascloud-video'))
const isMinimaxH3Model = computed(() => currentModelConfig.value?.apiType === 'minimax-h3' || isAtlasCloudVideoModel.value)
const isReferenceVideoModel = computed(() => isSeedanceModel.value || isMinimaxH3Model.value)
const isWan3Model = computed(() => ['wan3', 'routerbee-wan3', 'atlascloud-wan3', 'wavespeed-wan3', 'siray-wan3', 'grsai-wan3'].includes(currentModelConfig.value?.apiType))

function getWan3Limit(name, maximum) {
  const configured = Number((currentModelConfig.value?.routerbeeConfig || currentModelConfig.value?.wan3Config)?.[name])
  return Number.isFinite(configured) && configured >= 0 ? Math.min(configured, maximum) : maximum
}

const wan3AvailableModes = computed(() => ['wavespeed-wan3', 'siray-wan3', 'grsai-wan3'].includes(currentModelConfig.value?.apiType) ? WAN3_MODES.filter(mode => !mode.apiType && !['file', 'link'].includes(mode.value)) : WAN3_MODES)

const wan3MaxRefImages = computed(() => getWan3Limit('maxImages', 10))
const wan3MaxRefVideos = computed(() => currentModelConfig.value?.apiType === 'grsai-wan3' ? 0 : getWan3Limit('maxVideos', 5))
const wan3MaxRefAudios = computed(() => getWan3Limit('maxAudios', 5))

// Seedance 可用的模式（从模型配置的 seedanceConfig.supportedModes 读取）
const seedanceAvailableModes = computed(() => {
  if (!isReferenceVideoModel.value) return []
  const config = isMinimaxH3Model.value
    ? currentModelConfig.value?.minimaxConfig
    : currentModelConfig.value?.seedanceConfig
  const supported = config?.supportedModes
  const defaultModes = isMinimaxH3Model.value
    ? SEEDANCE_MODES.filter(mode => ['text2video', 'image2video_first', 'image2video_first_last', 'multimodal_ref'].includes(mode.value))
    : SEEDANCE_MODES
  if (!supported) return defaultModes // 无配置则全部可用
  // supported 可以是数组 ['text2video', 'image2video_first'] 或对象 { text2video: true }
  if (Array.isArray(supported)) {
    return defaultModes.filter(m => supported.includes(m.value))
  } else if (typeof supported === 'object') {
    return defaultModes.filter(m => supported[m.value] === true)
  }
  return defaultModes
})

// Kling v3 Omni 模式定义
const KLING_V3_OMNI_MODES = [
  { value: 'text2video', get label() { return translateUi('canvas.nodeTypes.textToVideo') }, icon: '✍' },
  { value: 'image2video', get label() { return translateUi('canvas.nodeTypes.imageToVideo') }, icon: '🖼' },
  { value: 'first_last_frame', get label() { return translateUi('uiMessages.ma44f24ac18b3') }, icon: '🎞' },
  { value: 'subject_control', get label() { return translateUi('uiMessages.med8546148e1e') }, icon: '🎭' },
  { value: 'video_reference', get label() { return translateUi('uiMessages.mc85d51e6e4b6') }, icon: '📹' },
  { value: 'multi_shot', get label() { return translateUi('uiMessages.m4d5610ea36d3') }, icon: '🎬' }
]

// 当前模型是否为 Kling v3 Omni
const isKlingV3OmniModel = computed(() => {
  const modelConfig = currentModelConfig.value
  return modelConfig?.apiType === 'kling-v3-omni' || !!modelConfig?.isKlingV3OmniModel
})

// Kling v3 Omni 可用的模式
const klingV3OmniAvailableModes = computed(() => {
  if (!isKlingV3OmniModel.value) return []
  const modes = currentModelConfig.value?.klingV3OmniModes
  if (modes && Array.isArray(modes)) {
    return KLING_V3_OMNI_MODES.filter(m => modes.some(em => em.value === m.value))
  }
  return KLING_V3_OMNI_MODES
})

const loading = ref(false)
const error = ref('')
const successMessage = ref('')

const imageFiles = ref([])
const previewUrls = ref([])
const isDragging = ref(false)
const imageReviews = ref(new Map())
const reviewChannel = ref(null)
const reviewChannelMessage = ref('')
const isQuickImageReviewSubmitting = ref(false)
let reviewChannelRequestId = 0

const me = ref(null)
const history = ref([])
const gallery = ref([])
// 根据设备类型设置历史记录抽屉默认状态：手机默认收起，平板和电脑默认展开
const isHistoryDrawerOpen = ref(shouldHistoryDrawerOpenByDefault())
const pollingTimers = new Map()
const elapsedTimeNow = ref(Date.now())
let elapsedTimeTimer = null
const modelStatsStore = useModelStatsStore()
const teamStore = useTeamStore()

function getBeginnerSpaceParams() {
  return getCurrentBeginnerSpaceParams(teamStore)
}

async function initializeBeginnerSpace() {
  if (!me.value?.id) {
    teamStore.switchToPersonalSpace()
    return
  }
  teamStore.setCurrentUserId(me.value.id)
  await teamStore.restoreSpaceState()
}

async function handleBeginnerSpaceSwitched() {
  gallery.value = []
  history.value = []
  videoHistoryOffset.value = 0
  hasMoreVideoHistory.value = true
  await loadHistory(true)
}

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

// 可用的时长选项（根据模型动态计算，VEO3模型和otuapi模型不支持时长选择）
const availableDurations = computed(() => {
  if (isVeo3Model.value) {
    return [] // VEO3模型不支持时长选择
  }
  // 优先使用模型配置中的 durations 数组
  const modelDurations = currentModelConfig.value?.durations
  if (modelDurations !== undefined && modelDurations !== null) {
    // 🔧 如果 durations 为空数组，表示该模型不支持时长选择（如 otuapi 模型）
    if (modelDurations.length === 0) {
      return []
    }
    // 🔧 确保时长为字符串格式（数据库配置可能返回数字）
    return modelDurations.map(d => String(d))
  }
  // 兜底：从积分配置中获取
  const config = pointsCostConfig.value[model.value] || {}
  return Object.keys(config).filter(key => key !== 'hd_extra').sort((a, b) => Number(a) - Number(b))
})

const totalPoints = computed(() => {
  return getTotalUserPoints(me.value)
})

const wan3UrlDurations = ref([])
watch(() => JSON.stringify(isWan3Model.value && wan3Mode.value === 'multimodal_ref' ? seedanceRefVideoUrls.value : []), async (urls, _, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  wan3UrlDurations.value = []
  const durations = await Promise.all(JSON.parse(urls).map(url => readWan3ReferenceDuration(toSameOriginUrl(url), controller.signal)))
  if (!controller.signal.aborted) wan3UrlDurations.value = durations
}, { immediate: true })

const currentPointsCost = computed(() => {
  if (currentModelConfig.value?.apiType === 'heizhu-video') {
    const pricing = resolveVideoResolutionPricing(currentModelConfig.value.resolutionPricing, resolution.value)
    if (pricing) return Math.round(pricing.costPerSecond * Number(duration.value) * 100) / 100
  }
  if (isWan3Model.value) {
    if (wan3Mode.value === 'multimodal_ref' && (wan3UrlDurations.value.length !== seedanceRefVideoUrls.value.length ||
      wan3UrlDurations.value.some(seconds => !seconds))) return null
    const referenceDurations = wan3Mode.value === 'multimodal_ref' && currentModelConfig.value.apiType !== 'grsai-wan3'
      ? [...seedanceRefVideoPreviews.value.map(item => Number(item.duration)), ...wan3UrlDurations.value]
      : []
    const estimate = estimateWan3Points(currentModelConfig.value, resolution.value, wan3Duration.value, referenceDurations)
    return applyNodeRateToPoints(estimate, me.value?.user_group?.rate_video)
  }
  const configuredResolutionPrice = calculateVideoResolutionPrice(
    currentModelConfig.value?.resolutionPricing,
    resolution.value,
    isReferenceVideoModel.value ? seedanceDuration.value : duration.value
  )
  if (configuredResolutionPrice !== null) return configuredResolutionPrice

  const seedanceResolutionCost = calculateSeedanceResolutionCost({
    resolutionCosts: currentModelConfig.value?.seedanceConfig?.resolutionCosts,
    resolution: seedanceResolution.value,
    duration: seedanceDuration.value
  })
  if (seedanceResolutionCost !== null) return seedanceResolutionCost

  // VEO3模型使用固定积分
  if (isVeo3Model.value) {
    const veoConfig = pointsCostConfig.value[model.value]
    // 如果是数字直接返回，如果是对象取默认值
    return typeof veoConfig === 'number' ? veoConfig : (veoConfig || 100)
  }

  if (isRunningHubAiAppVideoModel.value || isRunningHubAiAppVideoV31Model.value) {
    const modelCfg = currentModelConfig.value
    const seconds = Number(duration.value)
    const costPerSecond = Number(modelCfg?.costPerSecond)
    const fixedCost = modelCfg?.resolutionFixedCosts?.[resolution.value]
    if (fixedCost !== undefined && fixedCost !== null && String(fixedCost).trim() !== '') {
      const fixedPoints = Number(fixedCost)
      if (Number.isFinite(fixedPoints) && fixedPoints >= 0) return Math.round(fixedPoints)
    }
    const multiplier = isRunningHubAiAppVideoV31Model.value
      ? 1
      : Number((modelCfg?.resolutionMultipliers || {})[resolution.value] ?? ({ '720p': 1, '1080p': 1.5, '4k': 2 }[resolution.value] ?? 1))
    return Math.round((Number.isFinite(seconds) ? seconds : 0) * (Number.isFinite(costPerSecond) ? costPerSecond : 1) * (Number.isFinite(multiplier) ? multiplier : 1))
  }
  
  const modelConfig = pointsCostConfig.value[model.value]
  // 如果 pointsCost 是数字（固定积分），直接使用
  // 如果是对象（按时长计费），取对应时长的积分
  let cost
  if (typeof modelConfig === 'number') {
    cost = modelConfig
  } else if (typeof modelConfig === 'object' && modelConfig !== null) {
    const costDuration = isReferenceVideoModel.value ? String(seedanceDuration.value) : duration.value
    cost = modelConfig[costDuration] || 40
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

function getDefaultSeedance2ModeForModel(modelConfig) {
  return getDefaultSeedance2ModeForVideoModel(modelConfig)
}

function getDefaultGenerationModeForModel(modelConfig) {
  return getDefaultGenerationModeForVideoModel(modelConfig)
}

function getFirstAvailableMode(preferredMode, availableModes, fallback = 'text2video') {
  return pickConfiguredSubmode(preferredMode, availableModes, fallback)
}

// 获取可用的视频模型列表（从配置动态获取，根据当前模式过滤）
// 🔧 新手模式禁用 VEO 整合，直接显示所有 VEO 子模型
const availableModels = computed(() => {
  const allModels = getAvailableVideoModels({ disableVeoMerge: true })
  
  // 过滤掉旧版 sora-2 和 sora-2-pro
  const filteredByVersion = allModels.filter(m => !['sora-2', 'sora-2-pro'].includes(m.value))
  
  // 🔧 根据当前模式过滤：text=t2v, image=i2v
  const currentMode = mode.value === 'text' ? 't2v' : 'i2v'
  
  return filteredByVersion.filter(m => {
    // Seedance 2.0 / MiniMax H3 / Ant / HappyHorse 模型始终显示（有自己的模式选择器）
    if (isSeedanceSd2VideoModel(m) || m.apiType === 'minimax-h3' || String(m.apiType || '').startsWith('atlascloud-video')) return true

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

function getModelPackageMessage(modelInfo) {
  return modelInfo?.accessMessage || translateUi('uiMessages.m861a77c9f9fb')
}

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
    'sora-2-33': translateUi('uiMessages.m4143964107e6'),
    'sora2-pro': 'Sora 2 Pro',
    'sora-2-duomi': translateUi('uiMessages.m5d0e60c3ae18'),
    // Sora 系列（旧版，已弃用）
    'sora-2': 'Sora 2',
    'sora-2-pro': 'Sora 2 Pro',
    // VEO 系列
    'veo3.1-components': 'VEO 3.1',
    'veo3.1': translateUi('uiMessages.md16c42eba9bb'),
    'veo3.1-pro': 'VEO 3.1 Pro',
    'veo3.1-4k': 'VEO 4K',
    'veo3.1-components-4k': translateUi('uiMessages.m5f6386b39ca5'),
    'veo3.1-pro-4k': 'VEO 4K Pro',
    'veo_3_1-fast': translateUi('uiMessages.m7c51680cf33b')
  }
  return defaultNames[modelKey] || modelKey
}

function formatPointsTitle() {
  if (!me.value) return ''
  return translateUi('uiMessages.m7c8f481340fa', { value1: (formatPoints(me.value.subuser_points || 0)), value2: (formatPoints(me.value.package_points || 0)), value3: (formatPoints(me.value.points || 0)) })
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
  const aspectRatios = modelConfig?.aspectRatios || [{ value: '16:9', get label() { return translateUi('uiMessages.m055a6b3a3de7') } }]
  const aspectValues = aspectRatios.map(ar => {
    // 兼容字符串和对象格式
    return typeof ar === 'string' ? ar : ar.value
  })
  if (aspectValues.length > 0 && !aspectValues.includes(aspectRatio.value)) {
    aspectRatio.value = aspectValues[0]
    console.log('[VideoGeneration] 方向已重置为:', aspectRatio.value)
  }

  const configuredPricingResolutions = getEnabledVideoResolutionOptions(modelConfig?.resolutionPricing)
  const displayResolutions = Array.isArray(modelConfig?.displayResolutions)
    ? modelConfig.displayResolutions.map(value => String(value)).filter(Boolean)
    : undefined
  const configuredResolutionOptions = configuredPricingResolutions.length > 0
    ? configuredPricingResolutions
    : (displayResolutions !== undefined
    ? displayResolutions
    : (Array.isArray(modelConfig?.resolutionOptions)
        ? modelConfig.resolutionOptions.map(option => typeof option === 'string' ? option : option?.value).filter(Boolean)
        : []))
  if (modelConfig?.apiType === 'runninghub-ai-app-video' && configuredResolutionOptions.length > 0) {
    resolution.value = configuredResolutionOptions[0]
  } else if (configuredResolutionOptions.length > 0 && !configuredResolutionOptions.includes(resolution.value)) {
    resolution.value = configuredResolutionOptions[0]
  }

  if (isSeedanceSd2VideoModel(modelConfig)) {
    const seedanceConfig = modelConfig.seedanceConfig || {}
    const isHappyHorse = modelConfig.apiType === 'happyhorse'
    seedanceResolution.value = configuredPricingResolutions[0] || seedanceConfig.resolution || (isHappyHorse ? '1080p' : '720p')
    seedanceRatio.value = seedanceConfig.ratio || (isHappyHorse ? '16:9' : 'adaptive')
    seedanceDuration.value = Number(seedanceConfig.duration || durations[0] || 5)
    // 按新模型 autoDuration 配置重置 auto 开关：支持 auto 默认开，否则关；video_edit 强制开由 watch(seedanceMode) 处理
    seedanceAutoDuration.value = seedanceConfig.autoDuration === true
    seedanceGenerateAudio.value = seedanceConfig.generateAudio !== false
    seedanceWatermark.value = seedanceConfig.watermark === true
    seedanceWebSearch.value = isHappyHorse ? false : seedanceConfig.webSearch === true
    if (!seedanceAvailableModes.value.some(m => m.value === seedanceMode.value)) {
      const defaultSeedanceMode = getDefaultSeedance2ModeForModel(modelConfig)
      seedanceMode.value = getFirstAvailableMode(defaultSeedanceMode, seedanceAvailableModes.value)
    }
  } else if (modelConfig?.apiType === 'minimax-h3' || String(modelConfig?.apiType || '').startsWith('atlascloud-video')) {
    const minimaxConfig = modelConfig.minimaxConfig || {}
    seedanceDuration.value = Number(minimaxConfig.duration || durations[0] || 5)
    // minimax-h3 不支持 auto 时长，强制关闭
    seedanceAutoDuration.value = false
    seedanceResolution.value = configuredPricingResolutions[0] || minimaxConfig.resolution || '2K'
    seedanceRatio.value = minimaxConfig.ratio || (isAtlasCloudVideoModel.value ? (aspectValues[0] || '16:9') : 'adaptive')
    seedanceGenerateAudio.value = false
    seedanceWatermark.value = false
    seedanceWebSearch.value = false
    const defaultMode = minimaxConfig.defaultMode || modelConfig.defaultMinimaxH3Mode || 'text2video'
    if (!seedanceAvailableModes.value.some(m => m.value === seedanceMode.value)) {
      seedanceMode.value = getFirstAvailableMode(defaultMode, seedanceAvailableModes.value)
    }
  } else if (['wan3', 'routerbee-wan3', 'atlascloud-wan3', 'wavespeed-wan3', 'siray-wan3', 'grsai-wan3'].includes(modelConfig?.apiType)) {
    const wan3Config = modelConfig.routerbeeConfig || modelConfig.wan3Config || {}
    wan3Duration.value = Number(wan3Config.duration || durations[0] || 5)
    wan3GenerateAudio.value = wan3Config.audio !== false
    wan3PromptExtend.value = wan3Config.promptExtend === true
    wan3Watermark.value = wan3Config.watermark === true
    wan3Seed.value = ''
    if (!wan3AvailableModes.value.some(item => item.value === wan3Mode.value)) {
      wan3Mode.value = 'text2video'
    }
  }
}, { immediate: true })

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
  // video_edit 必须强制 auto 时长（后端双保险）
  if (seedanceMode.value === 'video_edit') {
    seedanceAutoDuration.value = true
  }
})

watch(wan3Mode, () => {
  clearWan3Files()
})

// 监听 Kling v3 Omni 模式变化，清空上一个模式的文件
watch(klingV3OmniMode, () => {
  clearKlingV3OmniFiles()
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

function handleV31AudioChange(e) {
  const file = e.target.files?.[0]
  v31AudioFile.value = file || null
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
  clearImageReviews()
}

const reviewableImageFiles = computed(() => {
  if (isReferenceVideoModel.value) {
    if (seedanceMode.value === 'image2video_first') {
      return seedanceFirstFrameFile.value ? [seedanceFirstFrameFile.value] : []
    }
    if (seedanceMode.value === 'image2video_first_last') {
      return [seedanceFirstFrameFile.value, seedanceLastFrameFile.value].filter(Boolean)
    }
    return seedanceRefImages.value
  }
  if ((mode.value === 'image' || isRunningHubAiAppVideoV31Model.value) && !isKlingV3OmniModel.value) return imageFiles.value
  return []
})

const quickImageReviewSummary = computed(() => {
  const files = reviewableImageFiles.value
  if (files.length === 0) return ''
  const reviews = files.map(file => imageReviews.value.get(file)).filter(Boolean)
  const approved = reviews.filter(item => item.status === 'approved').length
  const processing = reviews.filter(item => item.status === 'processing').length
  const failed = reviews.filter(item => item.status === 'failed').length
  if (processing > 0) return translateUi('uiMessages.md65efdedf390', { value1: (processing), value2: (files.length) })
  if (failed > 0) return translateUi('uiMessages.me0f045e149cc', { value1: (failed), value2: (files.length) })
  if (approved === files.length) return translateUi('uiMessages.m7f8b553ad5ff', { value1: (approved), value2: (files.length) })
  return ''
})

function clearImageReviews() {
  reviewChannelRequestId += 1
  imageReviews.value = new Map()
  reviewChannel.value = null
  reviewChannelMessage.value = ''
}

function updateImageReview(file, patch) {
  const next = new Map(imageReviews.value)
  next.set(file, { ...(next.get(file) || {}), ...patch })
  imageReviews.value = next
}

function getQuickImageReviewSubmission(files = reviewableImageFiles.value) {
  const reviews = files.map(file => imageReviews.value.get(file))
  const hasReviews = reviews.some(Boolean)
  const hasProcessing = reviews.some(item => item?.status === 'processing')
  const allApproved = files.length > 0 && reviews.every(item => item?.status === 'approved' && item.assetUri)
  const channelId = allApproved ? reviews[0].channelId : ''
  const channelIndex = allApproved ? reviews[0].channelIndex : -1
  const sameChannel = allApproved && reviews.every(item => item.channelId === channelId && item.channelIndex === channelIndex)

  return {
    hasReviews,
    hasProcessing,
    approved: allApproved && sameChannel,
    channelId,
    channelIndex,
    assetUris: allApproved && sameChannel ? reviews.map(item => item.assetUri) : [],
    assetUrisByFile: new Map(files.map((file, index) => [file, reviews[index]?.assetUri || '']))
  }
}

function appendReviewChannel(formData, reviewSubmission) {
  if (!reviewSubmission.approved) return
  formData.append('review_channel_id', reviewSubmission.channelId)
  formData.append('review_channel_index', String(reviewSubmission.channelIndex))
}

async function loadReviewChannel() {
  const files = reviewableImageFiles.value
  const requestId = ++reviewChannelRequestId
  reviewChannel.value = null
  reviewChannelMessage.value = ''
  if (!me.value || files.length === 0) return null

  try {
    const token = localStorage.getItem('token')
    const response = await fetch(getApiUrl(`/api/videos/review-channel?model=${encodeURIComponent(model.value)}`), {
      headers: {
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.message || data.error || translateUi('uiMessages.me03d7829a8ec'))
    if (!data.channelId || !Number.isInteger(Number(data.channelIndex)) || !data.providerType) {
      throw new Error(translateUi('uiMessages.mccb8a37d49d7'))
    }
    if (requestId !== reviewChannelRequestId) return null
    reviewChannel.value = data
    return data
  } catch (reviewError) {
    if (requestId !== reviewChannelRequestId) return null
    reviewChannelMessage.value = reviewError.message || translateUi('uiMessages.m6657158a5712')
    return null
  }
}

async function handleQuickImageReview() {
  if (isQuickImageReviewSubmitting.value) return
  const files = reviewableImageFiles.value
  if (files.length === 0) return

  const channel = reviewChannel.value || await loadReviewChannel()
  if (!channel) {
    error.value = reviewChannelMessage.value || translateUi('uiMessages.m6657158a5712')
    return
  }

  isQuickImageReviewSubmitting.value = true
  try {
    for (const [index, file] of files.entries()) {
      const existing = imageReviews.value.get(file)
      if (existing?.status === 'approved' && existing.channelId === channel.channelId && existing.channelIndex === Number(channel.channelIndex)) continue
      if (existing?.status === 'processing') continue

      const [url] = await uploadImages([file])
      if (!url) throw new Error(translateUi('uiMessages.mdbd401fec5cd'))
      const result = await createQuickSeedanceCharacterAsset({
        URL: url,
        Name: translateUi('uiMessages.m92cc153f3da9', { value1: (Date.now()), value2: (index + 1) }),
        providerType: channel.providerType,
        spaceType: getBeginnerSpaceParams().spaceType,
        teamId: getBeginnerSpaceParams().teamId
      })
      const assetId = result.quickAsset?.assetId || result.asset?.Id || result.asset?.FaceCode || result.Id
      if (!assetId) throw new Error(translateUi('uiMessages.mf17ade8ae6b1'))

      const providerType = result.quickAsset?.providerType || channel.providerType
      const initialFaceCode = result.quickAsset?.faceCode || result.asset?.FaceCode || result.asset?.faceCode || assetId
      const isFaceReference = providerType === 'seedance_openapi_pro' || providerType === 'bytefor'
      updateImageReview(file, {
        status: 'processing',
        assetUri: result.quickAsset?.assetUri || (isFaceReference ? `face:${initialFaceCode}` : `asset://${assetId}`),
        channelId: channel.channelId,
        channelIndex: Number(channel.channelIndex),
        providerType
      })

      const { promise } = pollAssetStatus(assetId, {
        interval: 5000,
        timeout: 2700000,
        providerType,
        groupId: result.quickAsset?.groupId || result.asset?.GroupId
      })
      promise.then((asset) => {
        const finalFaceCode = asset.FaceCode || asset.faceCode || initialFaceCode
        updateImageReview(file, {
          status: 'approved',
          assetUri: isFaceReference ? `face:${finalFaceCode}` : `asset://${asset.Id || assetId}`
        })
      }).catch((pollError) => {
        console.error('[VideoGeneration] 图片过审轮询失败:', pollError)
        updateImageReview(file, { status: 'failed', error: pollError.message || translateUi('uiMessages.m68a5550b1ebe') })
      })
    }
    successMessage.value = translateUi('uiMessages.mb70fdc9b89fa')
  } catch (reviewError) {
    console.error('[VideoGeneration] 图片过审失败:', reviewError)
    error.value = translateUi('uiMessages.m9c9a03d3b62a', { value1: (reviewError.message || translateUi('canvas.unknownError')) })
  } finally {
    isQuickImageReviewSubmitting.value = false
  }
}

watch(
  [model, mode, () => reviewableImageFiles.value.length],
  ([, , imageCount]) => {
    if (imageCount > 0) {
      void loadReviewChannel()
      return
    }
    reviewChannel.value = null
    reviewChannelMessage.value = ''
  },
  { immediate: true }
)

// ========== Seedance 文件上传函数 ==========

async function prepareSeedanceImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return null
  const isWan3 = isWan3Model.value
  if (isWan3 && !WAN3_IMAGE_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
    throw new Error(translateUi('uiMessages.m541a91216f58'))
  }
  const compressed = await compressImage(file, {
    maxSizeMB: isWan3 ? 20 : 30,
    maxLongSide: isWan3Model.value ? 8000 : 6000,
    maxPixels: isWan3 ? 64_000_000 : SEEDANCE_MAX_IMAGE_PIXELS,
    quality: 0.88,
    minQuality: 0.45,
    preservePng: false,
    mimeType: 'image/jpeg'
  })
  const dimensions = await getImageFileDimensions(compressed)
  const message = isWan3 ? '' : validatePreparedSeedanceImage({
    width: dimensions?.width,
    height: dimensions?.height,
    size: compressed.size
  })
  if (message) throw new Error(message)
  if (isWan3) {
    const shortSide = Math.min(Number(dimensions?.width) || 0, Number(dimensions?.height) || 0)
    const longSide = Math.max(Number(dimensions?.width) || 0, Number(dimensions?.height) || 0)
    if (shortSide < 240 || longSide > 8000 || longSide / shortSide > 8) {
      throw new Error(translateUi('uiMessages.mf97231be0de3'))
    }
  }
  if (isWan3 && compressed.size > 20 * 1024 * 1024) {
    throw new Error(translateUi('uiMessages.m0ed77cfedfd0'))
  }
  return compressed
}

function getLocalMediaDuration(file, mediaType) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(mediaType)
    const url = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(url)
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      cleanup()
      resolve(Number.isFinite(el.duration) ? el.duration : 0)
    }
    el.onerror = () => {
      cleanup()
      reject(new Error(mediaType === 'audio' ? translateUi('uiMessages.m696a39979f43') : translateUi('uiMessages.m856c308013df')))
    }
    el.src = url
  })
}

async function handleSeedanceFirstFrame(e) {
  const file = e.target.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  try {
    const prepared = await prepareSeedanceImageFile(file)
    if (!prepared) return
    if (seedanceFirstFramePreview.value) URL.revokeObjectURL(seedanceFirstFramePreview.value)
    seedanceFirstFrameFile.value = prepared
    seedanceFirstFramePreview.value = URL.createObjectURL(prepared)
  } catch (err) {
    error.value = err.message || translateUi('uiMessages.m6122906e4aea')
  } finally {
    e.target.value = ''
  }
}

function removeSeedanceFirstFrame() {
  if (seedanceFirstFramePreview.value) URL.revokeObjectURL(seedanceFirstFramePreview.value)
  seedanceFirstFrameFile.value = null
  seedanceFirstFramePreview.value = ''
}

async function handleSeedanceLastFrame(e) {
  const file = e.target.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  try {
    const prepared = await prepareSeedanceImageFile(file)
    if (!prepared) return
    if (seedanceLastFramePreview.value) URL.revokeObjectURL(seedanceLastFramePreview.value)
    seedanceLastFrameFile.value = prepared
    seedanceLastFramePreview.value = URL.createObjectURL(prepared)
  } catch (err) {
    error.value = err.message || translateUi('uiMessages.m6122906e4aea')
  } finally {
    e.target.value = ''
  }
}

function removeSeedanceLastFrame() {
  if (seedanceLastFramePreview.value) URL.revokeObjectURL(seedanceLastFramePreview.value)
  seedanceLastFrameFile.value = null
  seedanceLastFramePreview.value = ''
}

async function handleSeedanceRefImages(e) {
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
  const MAX = isWan3Model.value ? wan3MaxRefImages.value : seedanceMaxRefImages.value
  const remaining = MAX - seedanceRefImages.value.length - seedanceRefImageUrls.value.length
  const selected = []
  try {
    for (const file of files.slice(0, remaining)) {
      const prepared = await prepareSeedanceImageFile(file)
      if (prepared) selected.push(prepared)
    }
    seedanceRefImages.value.push(...selected)
    seedanceRefImagePreviews.value.push(...selected.map(f => URL.createObjectURL(f)))
  } catch (err) {
    error.value = err.message || translateUi('uiMessages.m6122906e4aea')
  } finally {
    e.target.value = ''
  }
}

function removeSeedanceRefImage(idx) {
  URL.revokeObjectURL(seedanceRefImagePreviews.value[idx])
  seedanceRefImages.value.splice(idx, 1)
  seedanceRefImagePreviews.value.splice(idx, 1)
}

async function handleSeedanceRefVideos(e) {
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/'))
  const MAX = isWan3Model.value ? wan3MaxRefVideos.value : seedanceMaxRefVideos.value
  const remaining = MAX - seedanceRefVideos.value.length - seedanceRefVideoUrls.value.length
  const invalidFormat = files.find(f => !['video/mp4', 'video/quicktime'].includes(f.type))
  if (invalidFormat) {
    error.value = translateUi('uiMessages.mcdb1aecb1f02')
    e.target.value = ''
    return
  }
  const maxVideoBytes = ['seedance-2.0', 'seedance-2.5'].includes(currentModelConfig.value?.apiType)
    ? 200 * 1024 * 1024
    : isWan3Model.value ? 100 * 1024 * 1024 : 50 * 1024 * 1024
  const tooLarge = files.find(f => f.size > maxVideoBytes)
  if (tooLarge) {
    error.value = translateUi('uiMessages.mfa3b7cd8305f', { value1: maxVideoBytes / (1024 * 1024) })
    e.target.value = ''
    return
  }
  const selected = []
  let totalDuration = seedanceRefVideoPreviews.value.reduce((sum, item) => sum + (Number(item.duration) || 0), 0)
  try {
    for (const [index, file] of files.slice(0, remaining).entries()) {
      const metadata = await readLocalVideoMetadata(file)
      const wan3VideoInvalid = isWan3Model.value && (
        metadata.duration < 1 || metadata.duration > 15 ||
        metadata.width < 240 || metadata.height < 240 || metadata.width > 4096 || metadata.height > 4096 ||
        Math.max(metadata.width, metadata.height) / Math.min(metadata.width, metadata.height) > 8
      )
      if (isWan3Model.value ? wan3VideoInvalid : validateSeedanceVideoMetadata(metadata, {
        index: seedanceRefVideos.value.length + seedanceRefVideoUrls.value.length + index,
        apiType: currentModelConfig.value?.apiType,
        maxDuration: seedanceMaxDuration.value
      })) {
        error.value = isWan3Model.value
          ? translateUi('uiMessages.m9cf74bdf6904')
          : validateSeedanceVideoMetadata(metadata, {
            index: seedanceRefVideos.value.length + seedanceRefVideoUrls.value.length + index,
            apiType: currentModelConfig.value?.apiType,
            maxDuration: seedanceMaxDuration.value
          })
        e.target.value = ''
        return
      }
      const maxTotalDuration = isWan3Model.value ? 15 : seedanceModelLimits.value.maxReferenceVideoDuration
      if (totalDuration + metadata.duration > maxTotalDuration) {
        error.value = translateUi('uiMessages.mf222801ef042', { value1: (maxTotalDuration) })
        e.target.value = ''
        return
      }
      if (isWan3Model.value && totalDuration + metadata.duration + Number(wan3Duration.value) > 30) {
        error.value = translateUi('uiMessages.mfcc613bd4bda')
        e.target.value = ''
        return
      }
      totalDuration += metadata.duration
      selected.push({ file, ...metadata })
    }
  } catch (err) {
    error.value = err.message || translateUi('uiMessages.m856c308013df')
    e.target.value = ''
    return
  }
  for (const item of selected) {
    seedanceRefVideos.value.push(item.file)
    seedanceRefVideoPreviews.value.push({
      name: item.file.name,
      size: (item.file.size / 1024 / 1024).toFixed(2),
      duration: item.duration,
      width: item.width,
      height: item.height,
      url: URL.createObjectURL(item.file)
    })
  }
  e.target.value = ''
}

function removeSeedanceRefVideo(idx) {
  URL.revokeObjectURL(seedanceRefVideoPreviews.value[idx].url)
  seedanceRefVideos.value.splice(idx, 1)
  seedanceRefVideoPreviews.value.splice(idx, 1)
}

async function handleSeedanceRefAudios(e) {
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('audio/'))
  const MAX = isWan3Model.value ? wan3MaxRefAudios.value : seedanceMaxRefAudios.value
  const remaining = MAX - seedanceRefAudios.value.length - seedanceRefAudioUrls.value.length
  const invalidFormat = files.find(f => !['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'].includes(f.type))
  if (invalidFormat) {
    error.value = translateUi('uiMessages.m267770710e80')
    e.target.value = ''
    return
  }
  const tooLarge = files.find(f => f.size > 15 * 1024 * 1024)
  if (tooLarge) {
    error.value = translateUi('uiMessages.m8b3b28be30b4')
    e.target.value = ''
    return
  }
  const selected = []
  let totalDuration = seedanceRefAudioPreviews.value.reduce((sum, item) => sum + (Number(item.duration) || 0), 0)
  try {
    for (const file of files.slice(0, remaining)) {
      const dur = await getLocalMediaDuration(file, 'audio')
      const seedanceAudioMax = isWan3Model.value ? 15 : (seedanceModelLimits.value.maxReferenceMediaDuration || 15)
      if (isWan3Model.value ? (dur < 1 || dur > seedanceAudioMax) : (dur < 2 || dur > seedanceAudioMax)) {
        error.value = isWan3Model.value ? translateUi('uiMessages.m2c3db819d47b') : translateUi('uiMessages.m5c7acba7c630', { value1: (seedanceAudioMax) })
        e.target.value = ''
        return
      }
      const seedanceAudioTotalMax = isWan3Model.value ? 15 : (seedanceModelLimits.value.maxTotalReferenceMediaDuration || 15)
      if (totalDuration + dur > seedanceAudioTotalMax) {
        error.value = translateUi('uiMessages.m1c414bb36e0f', { value1: (seedanceAudioTotalMax) })
        e.target.value = ''
        return
      }
      totalDuration += dur
      selected.push({ file, duration: dur })
    }
  } catch (err) {
    error.value = err.message || translateUi('uiMessages.m696a39979f43')
    e.target.value = ''
    return
  }
  for (const item of selected) {
    seedanceRefAudios.value.push(item.file)
    seedanceRefAudioPreviews.value.push({
      name: item.file.name,
      size: (item.file.size / 1024 / 1024).toFixed(2),
      duration: item.duration
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
  const maxImages = isWan3Model.value ? wan3MaxRefImages.value : seedanceMaxRefImages.value
  if (seedanceRefImages.value.length + seedanceRefImageUrls.value.length >= maxImages) {
    error.value = translateUi('uiMessages.m1d90fa4a277f', { value1: (maxImages) })
    return
  }
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
  const maxVideos = isWan3Model.value ? wan3MaxRefVideos.value : seedanceMaxRefVideos.value
  if (seedanceRefVideos.value.length + seedanceRefVideoUrls.value.length >= maxVideos) {
    error.value = translateUi('uiMessages.mc3f1e409e062', { value1: (maxVideos) })
    return
  }
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
  const maxAudios = isWan3Model.value ? wan3MaxRefAudios.value : seedanceMaxRefAudios.value
  if (seedanceRefAudios.value.length + seedanceRefAudioUrls.value.length >= maxAudios) {
    error.value = translateUi('uiMessages.m8c25880b45b1', { value1: (maxAudios) })
    return
  }
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    seedanceRefAudioUrls.value.push(url)
    seedanceRefAudioUrl.value = ''
  }
}
function removeSeedanceRefAudioUrl(idx) {
  seedanceRefAudioUrls.value.splice(idx, 1)
}

function clearSeedanceFiles() {
  clearImageReviews()
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

function clearWan3Files() {
  clearSeedanceFiles()
  wan3File.value = null
  wan3Link.value = ''
}

function handleWan3File(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!WAN3_DOCUMENT_EXTENSIONS.has(extension)) {
    error.value = translateUi('uiMessages.m4a105c09dca8')
  } else if (file.size > 100 * 1024 * 1024) {
    error.value = translateUi('uiMessages.m364b7866badc')
  } else {
    wan3File.value = file
  }
  e.target.value = ''
}

function clearKlingV3OmniFiles() {
  klingV3OmniFirstFrameFile.value = null
  klingV3OmniFirstFramePreview.value = ''
  klingV3OmniLastFrameFile.value = null
  klingV3OmniLastFramePreview.value = ''
  klingV3OmniRefImages.value = []
  klingV3OmniRefImagePreviews.value = []
  klingV3OmniRefImageUrl.value = ''
  klingV3OmniRefImageUrls.value = []
  klingV3OmniRefVideoUrl.value = ''
  klingV3OmniKeepSound.value = 'yes'
}
function handleKlingV3OmniFirstFrame(e) {
  const file = e.target.files?.[0]
  if (!file) return
  klingV3OmniFirstFrameFile.value = file
  klingV3OmniFirstFramePreview.value = URL.createObjectURL(file)
}
function removeKlingV3OmniFirstFrame() {
  if (klingV3OmniFirstFramePreview.value) URL.revokeObjectURL(klingV3OmniFirstFramePreview.value)
  klingV3OmniFirstFrameFile.value = null
  klingV3OmniFirstFramePreview.value = ''
}
function handleKlingV3OmniLastFrame(e) {
  const file = e.target.files?.[0]
  if (!file) return
  klingV3OmniLastFrameFile.value = file
  klingV3OmniLastFramePreview.value = URL.createObjectURL(file)
}
function removeKlingV3OmniLastFrame() {
  if (klingV3OmniLastFramePreview.value) URL.revokeObjectURL(klingV3OmniLastFramePreview.value)
  klingV3OmniLastFrameFile.value = null
  klingV3OmniLastFramePreview.value = ''
}
function handleKlingV3OmniRefImage(e) {
  const files = Array.from(e.target.files || [])
  const maxImages = 7
  const remaining = maxImages - klingV3OmniRefImages.value.length - klingV3OmniRefImageUrls.value.length
  const toAdd = files.slice(0, remaining)
  for (const file of toAdd) {
    klingV3OmniRefImages.value.push(file)
    klingV3OmniRefImagePreviews.value.push(URL.createObjectURL(file))
  }
  if (e.target) e.target.value = ''
}
function removeKlingV3OmniRefImage(index) {
  if (klingV3OmniRefImagePreviews.value[index]) URL.revokeObjectURL(klingV3OmniRefImagePreviews.value[index])
  klingV3OmniRefImages.value.splice(index, 1)
  klingV3OmniRefImagePreviews.value.splice(index, 1)
}
function addKlingV3OmniRefImageUrl() {
  const url = klingV3OmniRefImageUrl.value.trim()
  if (!url) return
  klingV3OmniRefImageUrls.value.push(url)
  klingV3OmniRefImageUrl.value = ''
}
function removeKlingV3OmniRefImageUrl(index) {
  klingV3OmniRefImageUrls.value.splice(index, 1)
}

function formatStatus(status) {
  if (!status) return translateUi('uiMessages.mec0d9bdb00a4')
  const normalized = status.toString().toLowerCase()
  const map = {
    pending: translateUi('uiMessages.md6f766f2adf5'),
    not_start: translateUi('uiMessages.mb53be09930f4'),
    queued: translateUi('uiMessages.md6f766f2adf5'),
    processing: translateUi('uiMessages.m969ef41f7e5b'),
    in_progress: translateUi('uiMessages.m969ef41f7e5b'),
    running: translateUi('uiMessages.m969ef41f7e5b'),
    completed: translateUi('canvas.assetPanel.tagCompleted'),
    success: translateUi('canvas.assetPanel.tagCompleted'),
    failure: translateUi('canvas.audioNode.generateFailed'),
    failed: translateUi('canvas.audioNode.generateFailed'),
    error: translateUi('canvas.audioNode.generateFailed'),
    timeout: translateUi('uiMessages.mb60976e35087'),
    cancelled: translateUi('uiMessages.ma37778f17c5f'),
    file_expired: translateUi('uiMessages.mc5fe26aafac9')
  }
  return map[normalized] || status || translateUi('uiMessages.mec0d9bdb00a4')
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

function processingProgressText(item) {
  return getVideoGenerationProgressText(item, elapsedTimeNow.value)
}

function getAverageVideoGenerationSeconds(item) {
  const modelName = item?.model || model.value
  if (!modelName) return null

  const seconds = modelStatsStore.getVideoModelAvgDurationSeconds(modelName)
  if (seconds !== null) return seconds

  const modelConfig = availableModels.value.find(m => m.value === modelName)
  if (modelConfig?.isVeoModel && modelConfig?.veoModes?.length > 0) {
    const values = modelConfig.veoModes
      .map(mode => mode.actualModel ? modelStatsStore.getVideoModelAvgDurationSeconds(mode.actualModel) : null)
      .filter(value => value !== null)
    if (values.length > 0) {
      return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    }
  }

  return null
}

function showProcessingTimeoutHint(item) {
  const modelName = item?.model || model.value
  const modelConfig = availableModels.value.find(m => m.value === modelName) ||
    tenantConfig.video_models?.find(m => m.name === modelName || m.id === modelName)
  return shouldShowVideoGenerationTimeoutHint(
    { ...item, model: modelName },
    elapsedTimeNow.value,
    getAverageVideoGenerationSeconds(item),
    modelConfig
  )
}

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  return date.toLocaleString(uiLanguage.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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
    error.value = translateUi('uiMessages.m48144f96c150')
    return
  }
  if (!prompt.value.trim()) {
    // Seedance 非文生视频模式允许空提示词
    // Kling v3 Omni 非文生视频模式也允许空提示词
    const seedanceAllowEmpty = isReferenceVideoModel.value && seedanceMode.value !== 'text2video'
    const klingOmniAllowEmpty = isKlingV3OmniModel.value && klingV3OmniMode.value !== 'text2video'
    const wan3AllowEmpty = isWan3Model.value && wan3Mode.value !== 'text2video'
    if (!seedanceAllowEmpty && !klingOmniAllowEmpty && !wan3AllowEmpty) {
      error.value = translateUi('uiMessages.m673bfd286541')
      return
    }
  }
  if (mode.value === 'image' && !isReferenceVideoModel.value && !isWan3Model.value && !isKlingV3OmniModel.value && imageFiles.value.length === 0) {
    error.value = translateUi('uiMessages.mf472131d24a5')
    return
  }

  const selectedModelInfo = availableModels.value.find(m => m.value === model.value)
  if (selectedModelInfo?.usable === false) {
    error.value = getModelPackageMessage(selectedModelInfo)
    return
  }

  // Seedance 模式特定验证
  if (isReferenceVideoModel.value) {
    const sm = seedanceMode.value
    const imageCount = sm === 'image2video_first'
      ? (seedanceFirstFrameFile.value ? 1 : 0)
      : sm === 'image2video_first_last'
        ? (seedanceFirstFrameFile.value ? 1 : 0) + (seedanceLastFrameFile.value ? 1 : 0)
        : seedanceRefImages.value.length + seedanceRefImageUrls.value.length
    const videoCount = seedanceRefVideos.value.length + seedanceRefVideoUrls.value.length
    const audioCount = seedanceRefAudios.value.length + seedanceRefAudioUrls.value.length
    const seedanceReferenceCountMessage = validateSeedanceReferenceCounts({
      imageCount,
      videoCount,
      audioCount,
      limits: isMinimaxH3Model.value
        ? { maxImages: seedanceMaxRefImages.value, maxVideos: seedanceMaxRefVideos.value, maxAudios: seedanceMaxRefAudios.value }
        : seedanceModelLimits.value
    })
    if (seedanceReferenceCountMessage) {
      error.value = seedanceReferenceCountMessage
      return
    }
    const seedanceValidationMessage = validateSeedanceModeInputs({
      mode: sm,
      imageCount: Math.min(imageCount, SEEDANCE_MAX_IMAGES),
      videoCount: Math.min(videoCount, SEEDANCE_MAX_VIDEOS),
      audioCount: Math.min(audioCount, SEEDANCE_MAX_AUDIOS)
    })
    if (seedanceValidationMessage) {
      error.value = seedanceValidationMessage
      return
    }
  }

  if (isWan3Model.value) {
    const firstFrameCount = seedanceFirstFrameFile.value ? 1 : 0
    const lastFrameCount = seedanceLastFrameFile.value ? 1 : 0
    const imageCount = seedanceRefImages.value.length + seedanceRefImageUrls.value.length
    const videoCount = seedanceRefVideos.value.length + seedanceRefVideoUrls.value.length
    const audioCount = seedanceRefAudios.value.length + seedanceRefAudioUrls.value.length
    const hasFrame = firstFrameCount + lastFrameCount > 0
    const hasReference = imageCount + videoCount + audioCount > 0 || Boolean(wan3File.value) || Boolean(wan3Link.value.trim())

    if (wan3File.value && wan3Link.value.trim()) {
      error.value = translateUi('uiMessages.m069ddbb2a457')
      return
    }
    if (imageCount > wan3MaxRefImages.value || videoCount > wan3MaxRefVideos.value || audioCount > wan3MaxRefAudios.value) {
      error.value = translateUi('uiMessages.md9a7d6356f4b')
      return
    }
    if (hasFrame && hasReference) {
      error.value = translateUi('uiMessages.m2f14c75a3c53')
      return
    }
    if (wan3Mode.value === 'image2video_first' && !firstFrameCount) {
      error.value = translateUi('uiMessages.m898907da0844')
      return
    }
    if (wan3Mode.value === 'image2video_first_last' && (!firstFrameCount || !lastFrameCount)) {
      error.value = translateUi('uiMessages.m60ff66e10ba5')
      return
    }
    if (wan3Mode.value === 'multimodal_ref' && imageCount + videoCount + audioCount === 0) {
      error.value = translateUi('uiMessages.m3987d157bfe6')
      return
    }
    if (wan3Mode.value === 'file' && !wan3File.value) {
      error.value = translateUi('uiMessages.mb7d6d54bf857')
      return
    }
    if (wan3Mode.value === 'link' && !/^https?:\/\//i.test(wan3Link.value.trim())) {
      error.value = translateUi('uiMessages.me98314d41f6f')
      return
    }
    const requestedWan3Duration = Number(wan3Duration.value)
    if (!Number.isInteger(requestedWan3Duration) || requestedWan3Duration < 2 || requestedWan3Duration > 30) {
      error.value = translateUi('uiMessages.m98b4076a190d')
      return
    }
    const referenceVideoDuration = seedanceRefVideoPreviews.value.reduce((sum, item) => sum + (Number(item.duration) || 0), 0)
      + wan3UrlDurations.value.reduce((sum, seconds) => sum + (seconds || 0), 0)
    if (referenceVideoDuration + requestedWan3Duration > 30) {
      error.value = translateUi('uiMessages.mfcc613bd4bda')
      return
    }
    const normalizedSeed = wan3Seed.value.trim()
    if (normalizedSeed && (!/^\d+$/.test(normalizedSeed) || Number(normalizedSeed) > 2147483647)) {
      error.value = translateUi('uiMessages.m395ec91a9915')
      return
    }
  }

  // Kling v3 Omni 验证
  if (isKlingV3OmniModel.value) {
    const km = klingV3OmniMode.value
    if ((km === 'image2video' || km === 'first_last_frame') && !klingV3OmniFirstFrameFile.value && imageFiles.value.length === 0) {
      error.value = translateUi('uiMessages.m898907da0844')
      return
    }
    if (km === 'video_reference' && !klingV3OmniRefVideoUrl.value) {
      error.value = translateUi('uiMessages.m25854318b5ed')
      return
    }
  }

  // RunningHub 全能视频 V3.1 验证
  if (isRunningHubAiAppVideoV31Model.value) {
    const requiredImages = v31ModeConfig.value.needsImages
    const needsAudio = v31ModeConfig.value.needsAudio
    if (requiredImages > 0 && imageFiles.value.length === 0) {
      error.value = translateUi('uiMessages.mc45227f62945')
      return
    }
    if (v31Mode.value === 'first_last_frame' && imageFiles.value.length < 2) {
      error.value = translateUi('uiMessages.m4c1b50cc0de3')
      return
    }
    if (v31Mode.value === 'multi_image' && imageFiles.value.length > 3) {
      error.value = translateUi('uiMessages.m50b007f83320')
      return
    }
    if (needsAudio && !v31AudioFile.value) {
      error.value = translateUi('uiMessages.mf638bd270d3f')
      return
    }
  }

  const reviewSubmission = getQuickImageReviewSubmission()
  if (reviewSubmission.hasProcessing) {
    error.value = translateUi('uiMessages.mc74486adfd4b')
    return
  }
  if (reviewSubmission.hasReviews && !reviewSubmission.approved) {
    error.value = translateUi('uiMessages.mc6be21c34d65')
    return
  }

  loading.value = true
  
  // 保存当前输入，用于创建任务
  const currentPrompt = normalizePromptLineEndings(prompt.value).trim()
  const currentModel = model.value
  const requestModel = resolveVideoRequestModel(currentModelConfig.value, currentModel)
  const currentDuration = duration.value
  const requestedDuration = isReferenceVideoModel.value
    ? (seedanceAutoDuration.value ? '-1' : String(seedanceDuration.value))
    : isWan3Model.value ? String(wan3Duration.value) : currentDuration
  const currentAspectRatio = aspectRatio.value
  const pointsCost = currentPointsCost.value
  
  try {
    const formData = new FormData()
    formData.append('prompt', currentPrompt)
    formData.append('model', requestModel)
    formData.append('aspect_ratio', currentAspectRatio)
    formData.append('duration', requestedDuration)
    formData.append('hd', hd.value ? 'true' : 'false')
    formData.append('watermark', (isWan3Model.value ? wan3Watermark.value : watermark.value) ? 'true' : 'false')
    formData.append('private', isPrivate.value ? 'true' : 'false')
    appendSpaceParamsToFormData(formData, getBeginnerSpaceParams())
    
    // Vidu 错峰模式
    if (isViduModel.value && offPeak.value) {
      formData.append('off_peak', 'true')
    }
    
    // 模型能力驱动的清晰度参数
    if (hasVideoResolutionSelection.value && !isReferenceVideoModel.value) {
      formData.append('resolution', resolution.value)
    }
    
    if ((mode.value === 'image' || isRunningHubAiAppVideoV31Model.value) && !isReferenceVideoModel.value && !isWan3Model.value && !isKlingV3OmniModel.value) {
      if (reviewSubmission.approved) {
        formData.append('image_urls', JSON.stringify(reviewSubmission.assetUris))
      } else {
        for (const file of imageFiles.value) {
          formData.append('images', file)
        }
      }
    }

    // RunningHub 全能视频 V3.1 模式与音频
    if (isRunningHubAiAppVideoV31Model.value) {
      formData.append('video_mode', v31Mode.value)
      if (v31AudioFile.value) {
        formData.append('referenceAudios', v31AudioFile.value)
      }
    }

    // Seedance 2.0 参数
    if (isReferenceVideoModel.value) {
      const selectedSeedanceResolution = isAtlasCloudVideoModel.value || getEnabledVideoResolutionOptions(currentModelConfig.value?.resolutionPricing).length > 0
        ? resolution.value
        : seedanceResolution.value
      formData.append('seedance_mode', seedanceMode.value)
      formData.append('seedance_resolution', selectedSeedanceResolution)
      formData.append('seedance_ratio', seedanceRatio.value)
      formData.append('seedance_generate_audio', seedanceGenerateAudio.value ? 'true' : 'false')
      formData.append('web_search', seedanceWebSearch.value ? 'true' : 'false')
      formData.append('seedance_watermark', seedanceWatermark.value ? 'true' : 'false')

      // 首帧图片（文件上传字段名需与 multer 配置一致，使用驼峰命名）
      const firstFrameReviewUri = reviewSubmission.assetUrisByFile.get(seedanceFirstFrameFile.value)
      if (firstFrameReviewUri) {
        formData.append('first_frame_image', firstFrameReviewUri)
      } else if (seedanceFirstFrameFile.value) {
        formData.append('firstFrameImage', seedanceFirstFrameFile.value)
      }
      // 尾帧图片
      const lastFrameReviewUri = reviewSubmission.assetUrisByFile.get(seedanceLastFrameFile.value)
      if (lastFrameReviewUri) {
        formData.append('last_frame_image', lastFrameReviewUri)
      } else if (seedanceLastFrameFile.value) {
        formData.append('lastFrameImage', seedanceLastFrameFile.value)
      }
      // 多模态参考图片（文件上传）
      const reviewedReferenceImageUris = []
      for (const file of seedanceRefImages.value) {
        const reviewedUri = reviewSubmission.assetUrisByFile.get(file)
        if (reviewedUri) {
          reviewedReferenceImageUris.push(reviewedUri)
        } else {
          formData.append('referenceImages', file)
        }
      }
      const seedanceReferenceImageUrls = [...seedanceRefImageUrls.value, ...reviewedReferenceImageUris]
      if (seedanceReferenceImageUrls.length > 0) {
        formData.append('reference_images', JSON.stringify(seedanceReferenceImageUrls))
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

    if (isWan3Model.value) {
      formData.append('seedance_mode', wan3Mode.value)
      formData.append('wan3_audio', wan3GenerateAudio.value ? 'true' : 'false')
      formData.append('wan3_prompt_extend', wan3PromptExtend.value ? 'true' : 'false')
      if (wan3Seed.value.trim()) {
        formData.append('seed', wan3Seed.value.trim())
      }
      if (wan3Mode.value === 'image2video_first' || wan3Mode.value === 'image2video_first_last') {
        formData.append('firstFrameImage', seedanceFirstFrameFile.value)
      }
      if (wan3Mode.value === 'image2video_first_last') {
        formData.append('lastFrameImage', seedanceLastFrameFile.value)
      }
      if (wan3Mode.value === 'multimodal_ref') {
        for (const file of seedanceRefImages.value) {
          formData.append('referenceImages', file)
        }
        if (seedanceRefImageUrls.value.length > 0) {
          formData.append('reference_images', JSON.stringify(seedanceRefImageUrls.value))
        }
        for (const file of seedanceRefVideos.value) {
          formData.append('referenceVideos', file)
        }
        if (seedanceRefVideoUrls.value.length > 0) {
          formData.append('reference_videos', JSON.stringify(seedanceRefVideoUrls.value))
        }
        for (const file of seedanceRefAudios.value) {
          formData.append('referenceAudios', file)
        }
        if (seedanceRefAudioUrls.value.length > 0) {
          formData.append('reference_audios', JSON.stringify(seedanceRefAudioUrls.value))
        }
      }
      if (wan3Mode.value === 'file') {
        formData.append('wan3Files', wan3File.value)
      }
      if (wan3Mode.value === 'link') {
        formData.append('wan3_links', JSON.stringify([wan3Link.value.trim()]))
      }
    }

    // Kling v3 Omni 参数
    if (isKlingV3OmniModel.value) {
      formData.append('kling_omni_sub_mode', klingV3OmniMode.value)

      // 首帧图片
      if (klingV3OmniFirstFrameFile.value) {
        formData.append('image', klingV3OmniFirstFrameFile.value)
      }

      // 尾帧图片
      if (klingV3OmniMode.value === 'first_last_frame' && klingV3OmniLastFrameFile.value) {
        formData.append('last_frame_image', klingV3OmniLastFrameFile.value)
      }

      // 参考图片（主体控制/多镜头）
      if (['subject_control', 'multi_shot'].includes(klingV3OmniMode.value)) {
        for (const file of klingV3OmniRefImages.value) {
          formData.append('reference_images', file)
        }
        if (klingV3OmniRefImageUrls.value.length > 0) {
          formData.append('kling_omni_image_urls', JSON.stringify(klingV3OmniRefImageUrls.value))
        }
      }

      // 视频参考
      if (klingV3OmniMode.value === 'video_reference' && klingV3OmniRefVideoUrl.value) {
        formData.append('kling_omni_video_url', klingV3OmniRefVideoUrl.value)
        formData.append('kling_omni_video_refer_type', 'feature')
        formData.append('kling_omni_keep_sound', klingV3OmniKeepSound.value)
      }
    }

    appendReviewChannel(formData, reviewSubmission)

    console.log('[video] 请求参数:', {
      prompt: currentPrompt,
      model: currentModel,
      aspect_ratio: currentAspectRatio,
      duration: requestedDuration,
      hd: hd.value,
      mode: mode.value,
      imageCount: imageFiles.value.length,
      resolution: hasVideoResolutionSelection.value ? resolution.value : undefined,
      offPeak: isViduModel.value ? offPeak.value : undefined
    })
    
    const token = localStorage.getItem('token')
    console.log('[video] Token存在:', !!token)
    console.log('[video] 租户Headers:', getTenantHeaders())
    console.log('[video] 发起请求到 /api/videos/generate')
    
    // 立即清空输入框和图片，恢复UI状态
    clearImages()
    if (isReferenceVideoModel.value) clearSeedanceFiles()
    if (isWan3Model.value) clearWan3Files()
    if (isKlingV3OmniModel.value) clearKlingV3OmniFiles()
    v31AudioFile.value = null
    prompt.value = ''
    loading.value = false
    successMessage.value = translateUi('uiMessages.m10afb056f37d')
    
    // 异步发送请求，不阻塞UI
    const response = await fetch(getApiUrl('/api/videos/generate'), {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    })
    
    console.log('[video] 响应状态:', response.status, response.statusText)
    console.log('[video] 响应Headers:', Object.fromEntries(response.headers.entries()))
    
    let data
    try {
      data = await response.json()
    } catch (parseErr) {
      console.error('[video] 响应解析失败:', parseErr)
      throw new Error(translateUi('uiMessages.m87d273ac3364'))
    }
    console.log('[video] 响应数据:', data)
    if (!response.ok) {
      console.error('[video] 请求失败:', response.status, data)
      const err = new Error(getApiErrorMessage(data, translateUi('canvas.audioNode.generateFailed')))
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
      duration: requestedDuration,
      aspect_ratio: currentAspectRatio,
      status: data.status || 'pending',
      progress: data.progress || translateUi('uiMessages.md6f766f2adf5'),
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
    
    successMessage.value = translateUi('uiMessages.m33e91c627d90')
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
      error.value = translateUi('uiMessages.m8322d4dc5f1f')
    } else if (e.status === 401) {
      error.value = translateUi('uiMessages.meecc2ccc5175')
    } else if (e.status === 403 && e.body?.error === 'model_package_required') {
      error.value = e.body.message || translateUi('uiMessages.m861a77c9f9fb')
    } else if (e.status === 429) {
      // 并发限制错误
      const hasPackage = userPackageInfo.value.hasPackage
      const concurrentLimit = e.body?.concurrent_limit || userPackageInfo.value.concurrentLimit
      if (hasPackage) {
        error.value = translateUi('uiMessages.m4a0a9bbb3a58', { value1: (concurrentLimit) })
      } else {
        error.value = translateUi('uiMessages.mdce36ce096c2', { value1: (concurrentLimit) })
      }
    } else {
      error.value = e.message || translateUi('uiMessages.m7ab49f95fc44')
    }
  }
}

async function fetchTask(taskId) {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(getApiUrl(`/api/videos/task/${taskId}`), {
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

function startPolling(taskId, isOffPeakTask = false, taskCreatedAt = null) {
  if (!taskId || pollingTimers.has(taskId)) return
  
  const startTime = parseTaskCreatedAtForTimeout(taskCreatedAt) || Date.now()
  // 所有视频任务统一硬超时 40 分钟（与后端 VIDEO_TASK_TIMEOUT_MS 对齐）。
  const FORTY_MINUTES = 40 * 60 * 1000

  const scheduleNextPoll = () => {
    const timer = setTimeout(pollTask, 4000)
    pollingTimers.set(taskId, timer)
  }
  
  const pollTask = async () => {
    const taskData = await fetchTask(taskId)
    if (!taskData) {
      scheduleNextPoll()
      return
    }
    
    // 检查超时
    const maxTime = FORTY_MINUTES
    
    // 如果超时且还在处理中，标记为失败
    if (hasVideoGenerationTimedOut({ ...taskData, created_at: taskData.created_at || startTime }, Date.now(), maxTime)) {
      const createdAt = parseTaskCreatedAtForTimeout(taskData.created_at) || startTime
      const elapsed = Date.now() - createdAt
      console.log(`[VideoGeneration] 任务超时: ${taskId}, 已运行 ${Math.floor(elapsed / 1000 / 60)} 分钟, 错峰模式: ${isOffPeakTask}`)
      mergeTaskUpdate(taskId, {
        status: 'timeout',
        progress: translateUi('uiMessages.mb60976e35087'),
        fail_reason: translateUi('uiMessages.maaa706624ce5')
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

    const historyUrl = buildSpaceHistoryUrl('/api/videos/history', {
      limit: VIDEO_PAGE_SIZE,
      offset: videoHistoryOffset.value,
      ...getBeginnerSpaceParams()
    })
    const response = await fetch(getApiUrl(historyUrl), {
      headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    })

    if (!response.ok) return

    const data = await response.json()
    hasMoreVideoHistory.value = data.hasMore !== false && (data.videos || []).length === VIDEO_PAGE_SIZE

    const FORTY_MINUTES = 40 * 60 * 1000
    const now = Date.now()

    const allVideos = data.videos || []

    const videos = allVideos.map(item => {
      const video = {
        ...item,
        task_id: item.task_id || item.id,
        created_at: item.created_at || item.created
      }

      const isOffPeakTask = video.off_peak === 1 || video.off_peak === true
      const maxTime = FORTY_MINUTES

      if (hasVideoGenerationTimedOut(video, now, maxTime)) {
        video.status = 'timeout'
        video.progress = translateUi('uiMessages.mb60976e35087')
        video.fail_reason = translateUi('uiMessages.maaa706624ce5')
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
    // 所有视频任务统一 40 分钟超时
    const MAX_POLLING_TASKS = 5
    const pendingTasks = videos.filter(item => {
      const isOffPeakTask = item.off_peak === 1 || item.off_peak === true
      const maxTime = FORTY_MINUTES
      return isProcessingStatus(item.status) && !hasVideoGenerationTimedOut(item, now, maxTime)
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

function buildSafeVideoUrl(videoUrl) {
  if (!videoUrl) return ''
  // 展示链路优先使用原始媒体地址，确保走 CDN 域名
  return getMediaUrl(videoUrl)
}

function buildVideoProxyUrl(videoUrl) {
  if (!videoUrl) return ''
  if (isCosCdn(videoUrl) && isVideoMediaFile(videoUrl)) {
    const proxyUrl = getCosProxyUrl(videoUrl)
    if (proxyUrl) return getApiUrl(proxyUrl)
  }
  return toSameOriginUrl(videoUrl)
}

// 视频首帧缩略图提取（当 cover_url 不存在时的后备方案）
const videoThumbnails = ref({})
const videoThumbnailFailed = ref({})
const remoteThumbnailFailed = ref({})
const processingThumbnailCount = ref(0)
const MAX_CONCURRENT_THUMBNAILS = 3
const thumbnailQueue = ref([])
const THUMBNAIL_SEEK_CANDIDATES = [1.2, 0.3, 2.0]
const DEFAULT_VIDEO_POSTER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg)"/>
    <circle cx="320" cy="180" r="48" fill="rgba(59,130,246,0.25)" stroke="#60a5fa" stroke-width="2"/>
    <polygon points="306,154 306,206 350,180" fill="#93c5fd"/>
    <text x="320" y="252" fill="#cbd5e1" font-size="16" text-anchor="middle" font-family="Arial, sans-serif">视频封面加载中</text>
  </svg>`
)}` 

function buildThumbnailSeekCandidates(durationSec) {
  const duration = Number(durationSec)
  if (!Number.isFinite(duration) || duration <= 0) {
    return [...THUMBNAIL_SEEK_CANDIDATES]
  }
  const maxSeek = Math.max(0.1, duration - 0.1)
  const candidates = THUMBNAIL_SEEK_CANDIDATES
    .map(t => Math.min(t, maxSeek))
    .filter(t => t >= 0)
  return [...new Set(candidates)]
}

function getVideoFallbackPoster() {
  return DEFAULT_VIDEO_POSTER
}

function onVideoThumbnailError(item) {
  if (!item?.id) return
  remoteThumbnailFailed.value[item.id] = true
}

function isCanvasFrameTooDark(ctx, width, height) {
  try {
    const { data } = ctx.getImageData(0, 0, width, height)
    if (!data || data.length === 0) return false
    let samples = 0
    let darkSamples = 0
    const step = 40 // 每 10 像素采样一次（RGBA=4）
    for (let i = 0; i < data.length; i += step) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const alpha = data[i + 3]
      if (alpha === 0) continue
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (luminance < 22) darkSamples++
      samples++
    }
    if (samples === 0) return false
    return darkSamples / samples > 0.92
  } catch {
    return false
  }
}

function extractVideoThumbnail(item) {
  if (!item.video_url || item.cover_url || item.thumbnail_url) return
  if (videoThumbnails.value[item.id] || videoThumbnailFailed.value[item.id]) return

  if (processingThumbnailCount.value >= MAX_CONCURRENT_THUMBNAILS) {
    if (!thumbnailQueue.value.includes(item.id)) {
      thumbnailQueue.value.push(item.id)
    }
    return
  }

  processingThumbnailCount.value++

  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  video.crossOrigin = 'anonymous'

  const safeUrl = buildSafeVideoUrl(item.video_url)
  const proxyUrl = buildVideoProxyUrl(item.video_url)
  let retriedWithProxy = false
  let proxyBlobObjectUrl = ''
  let seekCandidates = [...THUMBNAIL_SEEK_CANDIDATES]
  let seekIndex = 0
  let seekStarted = false
  let extractionTimeoutId = null

  const scheduleExtractionTimeout = () => {
    if (extractionTimeoutId) clearTimeout(extractionTimeoutId)
    extractionTimeoutId = setTimeout(() => {
      if (!videoThumbnails.value[item.id] && !videoThumbnailFailed.value[item.id]) {
        videoThumbnailFailed.value[item.id] = true
        cleanup()
      }
    }, 30000)
  }

  const resetSeekState = () => {
    seekStarted = false
    seekIndex = 0
  }

  const revokeProxyBlobUrl = () => {
    if (!proxyBlobObjectUrl) return
    URL.revokeObjectURL(proxyBlobObjectUrl)
    proxyBlobObjectUrl = ''
  }

  const applyVideoSource = (src) => {
    scheduleExtractionTimeout()
    video.src = src
    video.load()
  }

  const loadProxyBlobSource = async () => {
    if (retriedWithProxy || !proxyUrl || proxyUrl === safeUrl) return false
    retriedWithProxy = true
    try {
      // 代理域返回 ACAO:*，这里必须使用匿名 CORS，避免凭证模式导致读流失败
      const response = await fetch(proxyUrl, { credentials: 'omit', mode: 'cors' })
      if (!response.ok) return false
      const blob = await response.blob()
      revokeProxyBlobUrl()
      proxyBlobObjectUrl = URL.createObjectURL(blob)
      resetSeekState()
      applyVideoSource(proxyBlobObjectUrl)
      return true
    } catch (error) {
      console.warn('[VideoGeneration] 代理源拉取失败:', error?.message || error)
      return false
    }
  }

  const cleanup = () => {
    if (extractionTimeoutId) {
      clearTimeout(extractionTimeoutId)
      extractionTimeoutId = null
    }
    revokeProxyBlobUrl()
    video.remove()
    processingThumbnailCount.value--
    if (thumbnailQueue.value.length > 0) {
      const nextId = thumbnailQueue.value.shift()
      const nextItem = history.value.find(h => h.id === nextId) || gallery.value.find(g => g.id === nextId)
      if (nextItem) extractVideoThumbnail(nextItem)
    }
  }

  const seekNextCandidate = () => {
    if (seekIndex >= seekCandidates.length) {
      videoThumbnailFailed.value[item.id] = true
      cleanup()
      return
    }
    const targetTime = seekCandidates[seekIndex++]
    try {
      video.currentTime = targetTime
    } catch {
      seekNextCandidate()
    }
  }

  const startSeeking = () => {
    if (seekStarted) return
    seekStarted = true
    seekCandidates = buildThumbnailSeekCandidates(video.duration)
    seekNextCandidate()
  }

  video.onloadedmetadata = startSeeking
  video.onloadeddata = startSeeking
  video.onseeked = async () => {
    try {
      const canvas = document.createElement('canvas')
      const w = video.videoWidth || 320
      const h = video.videoHeight || 180
      const maxDim = 480
      const scale = Math.min(1, maxDim / Math.max(w, h))
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      if (isCanvasFrameTooDark(ctx, canvas.width, canvas.height) && seekIndex < seekCandidates.length) {
        seekNextCandidate()
        return
      }
      videoThumbnails.value[item.id] = canvas.toDataURL('image/jpeg', 0.7)
    } catch (e) {
      const message = e?.message || ''
      const isTaintedCanvas = message.includes('Tainted canvases may not be exported')
      if (isTaintedCanvas && await loadProxyBlobSource()) {
        return
      }
      if (seekIndex < seekCandidates.length) {
        seekNextCandidate()
        return
      }
      console.warn('[VideoGeneration] 缩略图提取失败:', e.message)
      videoThumbnailFailed.value[item.id] = true
    }
    cleanup()
  }
  video.onerror = async () => {
    if (await loadProxyBlobSource()) {
      return
    }
    videoThumbnailFailed.value[item.id] = true
    cleanup()
  }
  applyVideoSource(safeUrl)
}

function getVideoThumbnail(item) {
  if (!remoteThumbnailFailed.value[item.id]) {
    if (item.cover_url) return getMediaUrl(item.cover_url)
    if (item.thumbnail_url) return getMediaUrl(item.thumbnail_url)
  }
  if (videoThumbnails.value[item.id]) return videoThumbnails.value[item.id]
  if (videoThumbnailFailed.value[item.id]) return getVideoFallbackPoster()
  if (item.video_url && isCompletedStatus(item.status)) {
    extractVideoThumbnail(item)
  }
  return null
}

async function deleteHistory(item) {
  if (!confirm(translateUi('uiMessages.mc65bbe43558f'))) return
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(getApiUrl(`/api/videos/history/${item.id}`), {
      method: 'DELETE',
      headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    })
    if (!response.ok) throw new Error(translateUi('errors.deleteFailed'))
    history.value = history.value.filter(v => v.id !== item.id)
    gallery.value = gallery.value.filter(v => v.id !== item.id)
  } catch (e) {
    console.error('deleteHistory error', e)
  }
}

// 走 startStreamDownload：浏览器原生下载栏（带进度），点击立即响应
async function downloadVideo(item) {
  if (!item?.video_url) return
  try {
    // 如果有备注，将备注添加到文件名开头（移除特殊字符）
    const notePrefix = item.note ? item.note.replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '_').slice(0, 30) + '_' : ''
    const promptPart = (item.prompt || 'video').slice(0, 20).replace(/[^a-zA-Z0-9\u4e00-\u9fa5-_]/g, '_')
    const filename = `${notePrefix}${promptPart}.mp4`
    
    const { startStreamDownload } = await import('@/api/client')
    startStreamDownload(item.video_url, filename)
  } catch (e) {
    console.error('download video error', e)
  }
}

// 更新视频备注
async function updateVideoNote(item, note) {
  if (!item || !item.id) return
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(getApiUrl(`/api/videos/history/${item.id}`), {
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
    const response = await fetch(getApiUrl(`/api/videos/history/${item.id}`), {
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
    successMessage.value = translateUi('uiMessages.md39e5343e7d7')
    
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
        successMessage.value = translateUi('uiMessages.mda5d3e54706f', { value1: (imageFiles.value.length) })
      } else {
        successMessage.value = translateUi('uiMessages.m9b4dcf06ccb7')
      }
    } catch (e) {
      console.error('[VideoGeneration] 加载参考图片失败:', e)
      successMessage.value = translateUi('uiMessages.m5c9d11d22a8f')
    }
  } else {
    mode.value = 'text'
    successMessage.value = translateUi('uiMessages.mb9a94a249e69')
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
  clearImageReviews()
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

  // 切换到 Seedance 模型时按配置的默认模式初始化，切换离开时清空 Seedance 文件
  const isSeedance = isSeedanceSd2VideoModel(modelCfg)
  if (isSeedance) {
    const defaultSeedanceMode = getDefaultSeedance2ModeForModel(modelCfg)
    seedanceMode.value = getFirstAvailableMode(defaultSeedanceMode, seedanceAvailableModes.value)
    mode.value = getDefaultGenerationModeForModel(modelCfg)
    seedanceResolution.value = modelCfg?.apiType === 'happyhorse' ? '1080p' : '720p'
    seedanceRatio.value = modelCfg?.apiType === 'happyhorse' ? '16:9' : 'adaptive'
    seedanceDuration.value = 5
    seedanceGenerateAudio.value = true
    seedanceWebSearch.value = false
    seedanceWatermark.value = false
  } else {
    clearSeedanceFiles()
  }

  // 切换到 Kling v3 Omni 模型时重置模式，切换离开时清空文件
  const isKlingOmni = modelCfg?.apiType === 'kling-v3-omni' || !!modelCfg?.isKlingV3OmniModel
  if (isKlingOmni) {
    klingV3OmniMode.value = 'text2video'
    clearKlingV3OmniFiles()
  } else {
    clearKlingV3OmniFiles()
  }

  // 切换到 RunningHub 全能视频 V3.1 时重置模式，切换离开时清空音频
  const isRunningHubV31 = modelCfg?.apiType === 'runninghub-ai-app-video-v31'
  v31Mode.value = isRunningHubV31 ? (modelCfg?.defaultVideoMode || 't2v') : v31Mode.value
  if (!isRunningHubV31) {
    v31AudioFile.value = null
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
  modelStatsStore.ensureStarted()

  elapsedTimeTimer = setInterval(() => {
    elapsedTimeNow.value = Date.now()
  }, 1000)

  // 加载视频配置（优先加载，以便后续计算积分）
  await loadVideoConfig()
  await refreshUser()
  await initializeBeginnerSpace()
  await loadHistory()

  // 选择一个启用的默认模型（从配置动态获取）
  const enabledModels = availableModels.value
  if (enabledModels.length > 0 && !enabledModels.find(m => m.value === model.value)) {
    model.value = enabledModels[0].value
    console.log('[VideoGeneration] 自动选择启用的模型:', model.value)
  }

  const initialModelConfig = availableModels.value.find(m => m.value === model.value)
  if (initialModelConfig) {
    mode.value = getDefaultGenerationModeForModel(initialModelConfig)
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
              
              successMessage.value = translateUi('uiMessages.m71b1a4a67951')
              setTimeout(() => { successMessage.value = '' }, 3000)
            }
          } catch (e) {
            console.error('[VideoGeneration] 加载图片失败:', e)
            error.value = translateUi('uiMessages.m3b2fa454f272')
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

  window.addEventListener('space-switched', handleBeginnerSpaceSwitched)
})

onUnmounted(() => {
  pollingTimers.forEach(timer => clearInterval(timer))
  pollingTimers.clear()
  if (elapsedTimeTimer) {
    clearInterval(elapsedTimeTimer)
    elapsedTimeTimer = null
  }
  clearImages()
  clearSeedanceFiles()
  window.removeEventListener('space-switched', handleBeginnerSpaceSwitched)
})
</script>

<template>
  <!-- 主容器 - 两栏布局（左侧控制面板 + 中间输出区，右侧抽屉独立） -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      
      <!-- 左侧控制面板 -->
      <div class="lg:col-span-3">
        <div class="card p-5 sticky top-24">
          <!-- 模式切换标签（非 Seedance / Kling v3 Omni / RunningHub V3.1 模型时显示） -->
          <div v-if="!isReferenceVideoModel && !isWan3Model && !isKlingV3OmniModel && !isRunningHubAiAppVideoV31Model" class="flex bg-slate-100 dark:bg-dark-700 rounded-xl p-1 mb-5">
            <button 
              @click="mode = 'image'" 
              :class="mode === 'image' 
                ? 'bg-white dark:bg-dark-600 shadow-md text-gray-800 dark:text-gray-200' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
              class="flex-1 flex items-center justify-center space-x-2 rounded-lg transition-all duration-200 font-medium py-3 px-4"
            >
              <span class="text-xl">🎬</span>
              <span class="text-sm">{{ translateUi('canvas.nodeTypes.imageToVideo') }}</span>
            </button>
            <button 
              @click="mode = 'text'" 
              :class="mode === 'text' 
                ? 'bg-white dark:bg-dark-600 shadow-md text-gray-800 dark:text-gray-200' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
              class="flex-1 flex items-center justify-center space-x-2 rounded-lg transition-all duration-200 font-medium py-3 px-4"
            >
              <span class="text-xl">✍️</span>
              <span class="text-sm">{{ translateUi('canvas.nodeTypes.textToVideo') }}</span>
            </button>
          </div>

          <!-- RunningHub 全能视频 V3.1 生成模式选择 -->
          <div v-if="isRunningHubAiAppVideoV31Model" class="mb-5">
            <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              <span>🎛️</span>
              <span>{{ translateUi('uiMessages.m29ccb4125180') }}</span>
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="m in RUNNINGHUB_V31_MODES"
                :key="m.value"
                @click="v31Mode = m.value"
                :class="v31Mode === m.value
                  ? 'bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border-purple-400/60 text-purple-300'
                  : 'bg-white dark:bg-dark-700 border-slate-200 dark:border-dark-600 text-slate-600 dark:text-slate-300 hover:border-purple-300'"
                class="flex items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-all duration-200"
              >
                <span>{{ m.icon }}</span>
                <span>{{ m.label }}</span>
              </button>
            </div>
            <p class="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              {{ translateUi('uiMessages.mf869688c681d') }}
            </p>
          </div>

          <div class="space-y-4">
            <!-- 模型选择 -->
            <div>
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>🤖</span>
                <span>{{ translateUi('imageGen.model') }}</span>
              </label>
              <select v-model="model" class="input text-sm">
                <option v-for="m in availableModels" :key="m.value" :value="m.value" :disabled="m.disabled">
                  {{ m.label }}{{ m.disabled ? translateUi('uiMessages.m5017edab92ad') : '' }}
                </option>
              </select>
            </div>

            <!-- 画面比例/方向 - 从模型配置动态获取（非 Seedance/Kling Omni 模型） -->
            <div v-if="!isReferenceVideoModel && !isKlingV3OmniModel">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>📐</span>
                <span>{{ translateUi('uiMessages.mfa1b9e0e2308') }}</span>
              </label>
              <select v-model="aspectRatio" class="input text-sm">
                <option 
                  v-for="ar in availableAspectRatios" 
                  :key="ar.value" 
                  :value="ar.value"
                >{{ ar.label }}</option>
              </select>
            </div>

            <!-- 视频长度（VEO3模型、Seedance模型和不支持时长选择的模型不显示） -->
            <div v-if="isWan3Model">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>⏱️</span>
                <span>{{ translateUi('uiMessages.mf71aceda4e17') }}</span>
              </label>
              <select v-model.number="wan3Duration" class="input text-sm">
                <option v-for="dur in availableDurations" :key="dur" :value="Number(dur)">
                  {{ translateUi('uiMessages.m8e9c8e4d3e42', { value1: (dur) }) }}
                </option>
              </select>
            </div>
            <div v-else-if="!isVeo3Model && !isReferenceVideoModel && !isKlingV3OmniModel && availableDurations.length > 0">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>⏱️</span>
                <span>{{ translateUi('uiMessages.mf71aceda4e17') }}</span>
              </label>
              <select v-model="duration" class="input text-sm">
                <option v-for="dur in availableDurations" :key="dur" :value="dur">
                  {{ translateUi('uiMessages.m8e9c8e4d3e42', { value1: (dur) }) }}
                </option>
              </select>
            </div>

            <!-- Vidu 错峰模式开关 -->
            <div v-if="isViduModel">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>🌙</span>
                <span>{{ translateUi('uiMessages.m6ed18b81206e') }}</span>
              </label>
              <div class="flex items-center space-x-3 p-2.5 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800/30 dark:to-gray-900/30 border border-gray-300 dark:border-gray-700 rounded-lg">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" v-model="offPeak" class="sr-only peer" />
                  <div class="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gray-400 dark:peer-focus:ring-gray-600 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-gray-600"></div>
                </label>
                <div class="flex-1">
                  <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {{ offPeak ? translateUi('uiMessages.m8a4ef3e48e4e') : translateUi('uiMessages.m6744b4c6a9aa') }}
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400 opacity-80">
                    {{ offPeak ? translateUi('uiMessages.m35fd53e25023') : translateUi('uiMessages.mc2fd786c4ef1') }}
                  </p>
                </div>
              </div>
            </div>
            
            <!-- 模型能力驱动的清晰度选择 -->
            <div v-if="hasVideoResolutionSelection">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>📺</span>
                <span>{{ translateUi('uiMessages.m0e22652107f5') }}</span>
              </label>
              <div class="flex space-x-2">
                <button
                  v-for="option in videoResolutionOptions"
                  :key="option.value"
                  type="button"
                  @click="resolution = option.value"
                  :class="[
                    'flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-all',
                    resolution === option.value
                      ? 'bg-white text-black border-white dark:bg-gray-200 dark:text-black dark:border-gray-200'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-gray-400'
                  ]"
                >
                  {{ option.label }}
                  <span v-if="isViduModel && option.value === '720p' && currentModelConfig?.resolution720Discount" class="ml-1 text-xs opacity-80">
                    {{ translateUi('uiMessages.ma2da9c827b9c', { value1: (Math.round(currentModelConfig.resolution720Discount * 100)) }) }}
                  </span>
                </button>
              </div>
            </div>
            
            <!-- VEO3模型提示（仅在图生视频模式下显示） -->
            <div v-if="isVeo3Model && mode === 'image'" class="p-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg">
              <p class="text-xs text-gray-700 dark:text-gray-300">
                <span class="font-semibold">{{ getModelName(model) }}</span> 
                <span v-if="model === 'veo3.1-components' || model === 'veo3.1-components-4k'">{{ translateUi('uiMessages.m72ab6d27e3f8') }}</span>
                <span v-else>{{ translateUi('uiMessages.m693dd773c04c') }}</span>
              </p>
            </div>

            <!-- 选项 -->
            <div v-if="isHdAvailable">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>⚙️</span>
                <span>{{ translateUi('uiMessages.mbb7486f4410f') }}</span>
              </label>
              <div class="space-y-2">
                <label class="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" v-model="hd" class="rounded accent-gray-600" />
                  <span>{{ translateUi('uiMessages.m3f300534e4a9', { value1: (formatPoints(pointsCostConfig.hd_extra)) }) }}</span>
                </label>
              </div>
            </div>

            <!-- 提示词 -->
            <div>
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                <span>📝</span>
                <span>{{ translateUi('directorStudio.inspector.prompt') }}</span>
              </label>
              <textarea
                v-model="prompt"
                rows="3"
                class="input text-sm resize-none"
                :placeholder="translateUi('uiMessages.me5869b6ffdcd')"
              ></textarea>
            </div>

            <!-- ========== Seedance 2.0 模式选择 ========== -->
            <div v-if="isReferenceVideoModel" class="space-y-3">
              <!-- 模式选择区域（可展开/折叠） -->
              <div class="border border-slate-200 dark:border-dark-600 rounded-lg overflow-hidden">
                <button
                  type="button"
                  @click="seedanceModeOpen = !seedanceModeOpen"
                  class="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-dark-700 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
                >
                  <span class="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>🎬</span>
                    <span>{{ translateUi('uiMessages.m29ccb4125180') }}</span>
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
                  <span>🖼️</span><span>{{ translateUi('uiMessages.m5f960b0d9032') }}</span>
                </label>
                <div v-if="!seedanceFirstFrameFile" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceFirstFrameInputRef?.click()">
                  <div class="text-2xl mb-1">📤</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m5030e7b4964b') }}</p>
                  <input ref="seedanceFirstFrameInputRef" type="file" accept="image/*" @change="handleSeedanceFirstFrame" class="hidden" />
                </div>
                <div v-else class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                  <div class="relative flex-shrink-0">
                    <img :src="seedanceFirstFramePreview" class="w-12 h-12 object-cover rounded" />
                    <span v-if="imageReviews.get(seedanceFirstFrameFile)?.status === 'approved'" class="absolute left-0 top-0 rounded-br bg-emerald-600 px-1 py-0.5 text-[10px] leading-none text-white">{{ translateUi('uiMessages.m93632ccd0ab5') }}</span>
                  </div>
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
                  <span>🖼️</span><span>{{ translateUi('uiMessages.m9b31d6cfb16f') }}</span>
                </label>
                <div v-if="!seedanceLastFrameFile" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceLastFrameInputRef?.click()">
                  <div class="text-2xl mb-1">📤</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m5b81cfad2635') }}</p>
                  <input ref="seedanceLastFrameInputRef" type="file" accept="image/*" @change="handleSeedanceLastFrame" class="hidden" />
                </div>
                <div v-else class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                  <div class="relative flex-shrink-0">
                    <img :src="seedanceLastFramePreview" class="w-12 h-12 object-cover rounded" />
                    <span v-if="imageReviews.get(seedanceLastFrameFile)?.status === 'approved'" class="absolute left-0 top-0 rounded-br bg-emerald-600 px-1 py-0.5 text-[10px] leading-none text-white">{{ translateUi('uiMessages.m93632ccd0ab5') }}</span>
                  </div>
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
                    <span>🖼️</span><span>{{ translateUi('imageGen.referenceImages') }}</span>
                  </label>
                  <span class="text-xs text-slate-500">{{ seedanceRefImages.length + seedanceRefImageUrls.length }} / {{ seedanceMode === 'multimodal_ref' ? seedanceMaxRefImages : 1 }}</span>
                </div>
                <!-- URL 输入 -->
                <div v-if="(seedanceRefImages.length + seedanceRefImageUrls.length) < (seedanceMode === 'multimodal_ref' ? seedanceMaxRefImages : 1)" class="flex gap-1.5 mb-1.5">
                  <input v-model="seedanceRefImageUrl" type="text" :placeholder="translateUi('uiMessages.m8f3a8805e38e')" class="flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-gray-400" @keydown.enter.prevent="addSeedanceRefImageUrl" />
                  <button @click="addSeedanceRefImageUrl" :disabled="!seedanceRefImageUrl.trim()" class="px-2 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-200 dark:text-gray-900">{{ translateUi('common.add') }}</button>
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
                <div v-if="(seedanceRefImages.length + seedanceRefImageUrls.length) < (seedanceMode === 'multimodal_ref' ? seedanceMaxRefImages : 1)" class="flex items-center gap-2 mb-1.5">
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                  <span class="text-xs text-slate-400">{{ translateUi('uiMessages.ma2123d69506f') }}</span>
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                </div>
                <div v-if="(seedanceRefImages.length + seedanceRefImageUrls.length) < (seedanceMode === 'multimodal_ref' ? seedanceMaxRefImages : 1)" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceRefImageInputRef?.click()">
                  <div class="text-2xl mb-1">📤</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.mda6865dbf5de') }}</p>
                  <input ref="seedanceRefImageInputRef" type="file" accept="image/*" multiple @change="handleSeedanceRefImages" class="hidden" />
                </div>
                <div v-if="seedanceRefImagePreviews.length > 0" class="space-y-1.5 mt-1.5 max-h-36 overflow-y-auto">
                  <div v-for="(url, idx) in seedanceRefImagePreviews" :key="idx" class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-1.5 border border-slate-200 dark:border-dark-600">
                    <div class="relative flex-shrink-0">
                      <img :src="url" class="w-10 h-10 object-cover rounded" />
                      <span v-if="imageReviews.get(seedanceRefImages[idx])?.status === 'approved'" class="absolute left-0 top-0 rounded-br bg-emerald-600 px-1 py-0.5 text-[10px] leading-none text-white">{{ translateUi('uiMessages.m93632ccd0ab5') }}</span>
                    </div>
                    <span class="flex-1 text-xs text-slate-600 dark:text-slate-300 truncate">{{ seedanceRefImages[idx]?.name }}</span>
                    <button @click="removeSeedanceRefImage(idx)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center justify-center text-xs">✕</button>
                  </div>
                </div>
              </div>

              <!-- 参考视频上传（multimodal_ref / video_edit / video_extend） -->
              <div v-if="seedanceMode === 'multimodal_ref' || seedanceMode === 'video_edit' || seedanceMode === 'video_extend'">
                <div class="flex items-center justify-between mb-1.5">
                  <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>🎥</span><span>{{ translateUi('canvas.videoNode.refVideo') }}</span>
                  </label>
                  <span class="text-xs text-slate-500">{{ seedanceRefVideos.length + seedanceRefVideoUrls.length }} / {{ seedanceMaxRefVideos }}</span>
                </div>
                <!-- URL 输入 -->
                <div v-if="(seedanceRefVideos.length + seedanceRefVideoUrls.length) < seedanceMaxRefVideos" class="flex gap-1.5 mb-1.5">
                  <input v-model="seedanceRefVideoUrl" type="text" :placeholder="translateUi('uiMessages.m5aea0dd864bb')" class="flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-gray-400" @keydown.enter.prevent="addSeedanceRefVideoUrl" />
                  <button @click="addSeedanceRefVideoUrl" :disabled="!seedanceRefVideoUrl.trim()" class="px-2 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-200 dark:text-gray-900">{{ translateUi('common.add') }}</button>
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
                <div v-if="(seedanceRefVideos.length + seedanceRefVideoUrls.length) < seedanceMaxRefVideos" class="flex items-center gap-2 mb-1.5">
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                  <span class="text-xs text-slate-400">{{ translateUi('uiMessages.ma2123d69506f') }}</span>
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                </div>
                <div v-if="(seedanceRefVideos.length + seedanceRefVideoUrls.length) < seedanceMaxRefVideos" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceRefVideoInputRef?.click()">
                  <div class="text-2xl mb-1">🎥</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m96688ce7f1ad') }}</p>
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
                    <span>🔊</span><span>{{ translateUi('canvas.audioNode.refAudio') }}</span>
                  </label>
                  <span class="text-xs text-slate-500">{{ seedanceRefAudios.length + seedanceRefAudioUrls.length }} / {{ seedanceMaxRefAudios }}</span>
                </div>
                <!-- URL 输入 -->
                <div v-if="(seedanceRefAudios.length + seedanceRefAudioUrls.length) < seedanceMaxRefAudios" class="flex gap-1.5 mb-1.5">
                  <input v-model="seedanceRefAudioUrl" type="text" :placeholder="translateUi('uiMessages.m90826b08f04e')" class="flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-gray-400" @keydown.enter.prevent="addSeedanceRefAudioUrl" />
                  <button @click="addSeedanceRefAudioUrl" :disabled="!seedanceRefAudioUrl.trim()" class="px-2 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-200 dark:text-gray-900">{{ translateUi('common.add') }}</button>
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
                <div v-if="(seedanceRefAudios.length + seedanceRefAudioUrls.length) < seedanceMaxRefAudios" class="flex items-center gap-2 mb-1.5">
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                  <span class="text-xs text-slate-400">{{ translateUi('uiMessages.ma2123d69506f') }}</span>
                  <div class="flex-1 border-t border-slate-200 dark:border-dark-600"></div>
                </div>
                <div v-if="(seedanceRefAudios.length + seedanceRefAudioUrls.length) < seedanceMaxRefAudios" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="seedanceRefAudioInputRef?.click()">
                  <div class="text-2xl mb-1">🎵</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.me6cc2bd54d0e') }}</p>
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
                    <span>⚙️</span><span>{{ translateUi('uiMessages.m44455611b910') }}</span>
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
                  <div v-if="!isAtlasCloudVideoModel && getEnabledVideoResolutionOptions(currentModelConfig?.resolutionPricing).length === 0">
                    <label class="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">{{ translateUi('directorStudio.inspector.resolution') }}</label>
                    <div class="flex space-x-2">
                      <button type="button" @click="seedanceResolution = '480p'"
                        :class="['flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-all', seedanceResolution === '480p' ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200' : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-gray-400']">
                        480p
                      </button>
                      <button type="button" @click="seedanceResolution = '720p'"
                        :class="['flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-all', seedanceResolution === '720p' ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200' : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-gray-400']">
                        720p
                      </button>
                      <button type="button" @click="seedanceResolution = '1080p'"
                        :class="['flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-all', seedanceResolution === '1080p' ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200' : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-gray-400']">
                        1080p
                      </button>
                      <button v-if="currentModelConfig?.apiType !== 'happyhorse'" type="button" @click="seedanceResolution = '4k'"
                        :class="['flex-1 py-1.5 px-2 text-xs font-medium rounded-lg border transition-all', seedanceResolution === '4k' ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200' : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-gray-400']">
                        4k
                      </button>
                    </div>
                  </div>
                  <!-- 宽高比 -->
                  <div>
                    <label class="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block">{{ translateUi('imageGen.aspectRatio') }}</label>
                    <select v-model="seedanceRatio" class="input text-xs">
                      <option v-for="r in (isAtlasCloudVideoModel ? availableAspectRatios : SEEDANCE_RATIOS)" :key="r.value" :value="r.value">{{ r.label }}</option>
                    </select>
                  </div>
                  <!-- 自动时长开关（模型支持 auto 且非 video_edit 时显示；video_edit 强制 auto） -->
                  <label v-if="canAutoDuration && seedanceMode !== 'video_edit'" class="flex items-center justify-between cursor-pointer mb-1">
                    <span class="text-xs text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m7eb3e82b5a06') }}</span>
                    <div class="relative inline-flex items-center">
                      <input type="checkbox" v-model="seedanceAutoDuration" class="sr-only peer" />
                      <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-gray-600"></div>
                    </div>
                  </label>
                  <!-- 时长滑块 -->
                  <div>
                    <label class="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                      <span>{{ translateUi('videoGen.duration') }}</span>
                      <span class="text-gray-700 dark:text-gray-300 font-semibold">{{ seedanceAutoDuration ? translateUi('imageGen.auto') : seedanceDuration + translateUi('uiMessages.m00fe8dda1fd7') }}</span>
                    </label>
                    <input v-if="!seedanceAutoDuration" type="range" v-model.number="seedanceDuration" :min="seedanceMinDuration" :max="seedanceMaxDuration" step="1"
                      class="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-gray-600" />
                    <div v-if="!seedanceAutoDuration" class="flex justify-between text-xs text-slate-400 mt-0.5">
                      <span>{{ seedanceMinDuration }}s</span><span>{{ seedanceMaxDuration }}s</span>
                    </div>
                  </div>
                  <!-- 开关选项 -->
                  <div v-if="!isAtlasCloudVideoModel" class="space-y-2">
                    <!-- 联网搜索增强（仅文生视频） -->
                    <label v-if="seedanceMode === 'text2video'" class="flex items-center justify-between cursor-pointer">
                      <span class="text-xs text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m742c4eae2a82') }}</span>
                      <div class="relative inline-flex items-center">
                        <input type="checkbox" v-model="seedanceWebSearch" class="sr-only peer" />
                        <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-gray-600"></div>
                      </div>
                    </label>
                    <!-- 水印 -->
                    <label class="flex items-center justify-between cursor-pointer">
                      <span class="text-xs text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mfa1845901c5f') }}</span>
                      <div class="relative inline-flex items-center">
                        <input type="checkbox" v-model="seedanceWatermark" class="sr-only peer" />
                        <div class="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-gray-600"></div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- ========== 阿里云百炼万相 3.0 输入模式 ========== -->
            <div v-if="isWan3Model" class="space-y-3">
              <div class="border border-amber-200 dark:border-amber-900/60 rounded-lg overflow-hidden">
                <button
                  type="button"
                  @click="wan3ModeOpen = !wan3ModeOpen"
                  class="w-full flex items-center justify-between px-3 py-2.5 bg-amber-50/70 dark:bg-amber-950/20 hover:bg-amber-100/70 dark:hover:bg-amber-950/35 transition-colors"
                >
                  <span class="flex items-center space-x-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                    <span>🎬</span>
                    <span>{{ translateUi('uiMessages.m3727f1272753') }}</span>
                    <span class="ml-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded text-xs">
                      {{ WAN3_MODES.find(item => item.value === wan3Mode)?.label }}
                    </span>
                  </span>
                  <svg class="w-4 h-4 text-amber-700 dark:text-amber-300 transition-transform duration-200" :class="{ 'rotate-180': wan3ModeOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div v-show="wan3ModeOpen" class="px-3 py-2.5 border-t border-amber-200 dark:border-amber-900/60">
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="item in wan3AvailableModes"
                      :key="item.value"
                      type="button"
                      @click="wan3Mode = item.value"
                      :class="[
                        'px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150',
                        wan3Mode === item.value
                          ? 'bg-amber-700 text-white border-amber-700 dark:bg-amber-300 dark:text-amber-950 dark:border-amber-300 shadow-sm'
                          : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-amber-400'
                      ]"
                    >
                      <span class="mr-1">{{ item.icon }}</span>{{ item.label }}
                    </button>
                  </div>
                </div>
              </div>

              <p class="text-xs text-amber-700 dark:text-amber-300">{{ translateUi('uiMessages.m360b73896012') }}</p>

              <div v-if="wan3Mode === 'image2video_first' || wan3Mode === 'image2video_first_last'" class="space-y-2.5">
                <div>
                  <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5"><span>🖼️</span><span>{{ translateUi('uiMessages.m5f960b0d9032') }}</span></label>
                  <div v-if="!seedanceFirstFrameFile" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-amber-400 transition-colors" @click="seedanceFirstFrameInputRef?.click()">
                    <div class="text-2xl mb-1">📤</div><p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m4d38998fb9c0') }}</p>
                    <input ref="seedanceFirstFrameInputRef" type="file" accept="image/jpeg,image/png,image/bmp,image/webp" @change="handleSeedanceFirstFrame" class="hidden" />
                  </div>
                  <div v-else class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                    <img :src="seedanceFirstFramePreview" class="w-12 h-12 object-cover rounded" />
                    <span class="flex-1 text-xs text-slate-700 dark:text-slate-300 truncate">{{ seedanceFirstFrameFile.name }}</span>
                    <button type="button" @click="removeSeedanceFirstFrame" class="w-6 h-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs">✕</button>
                  </div>
                </div>
                <div v-if="wan3Mode === 'image2video_first_last'">
                  <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5"><span>🖼️</span><span>{{ translateUi('uiMessages.m9b31d6cfb16f') }}</span></label>
                  <div v-if="!seedanceLastFrameFile" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-amber-400 transition-colors" @click="seedanceLastFrameInputRef?.click()">
                    <div class="text-2xl mb-1">📤</div><p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m4d38998fb9c0') }}</p>
                    <input ref="seedanceLastFrameInputRef" type="file" accept="image/jpeg,image/png,image/bmp,image/webp" @change="handleSeedanceLastFrame" class="hidden" />
                  </div>
                  <div v-else class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                    <img :src="seedanceLastFramePreview" class="w-12 h-12 object-cover rounded" />
                    <span class="flex-1 text-xs text-slate-700 dark:text-slate-300 truncate">{{ seedanceLastFrameFile.name }}</span>
                    <button type="button" @click="removeSeedanceLastFrame" class="w-6 h-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs">✕</button>
                  </div>
                </div>
              </div>

              <div v-if="wan3Mode === 'multimodal_ref'" class="space-y-3 rounded-lg border border-slate-200 dark:border-dark-600 p-3">
                <div>
                  <div class="flex items-center justify-between mb-1.5"><label class="text-xs font-semibold text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.md2cd6ae129ef') }}</label><span class="text-xs text-slate-500">{{ translateUi('uiMessages.m41c98be213fe', { value1: (seedanceRefImages.length + seedanceRefImageUrls.length), value2: (wan3MaxRefImages) }) }}</span></div>
                  <div class="flex gap-1.5"><input v-model="seedanceRefImageUrl" type="url" :placeholder="translateUi('uiMessages.m646dd01edd49')" class="input text-xs py-1.5" @keydown.enter.prevent="addSeedanceRefImageUrl" /><button type="button" @click="addSeedanceRefImageUrl" class="px-2 py-1.5 text-xs rounded-lg bg-amber-700 text-white hover:bg-amber-600">{{ translateUi('common.add') }}</button></div>
                  <div class="flex flex-wrap gap-1.5 mt-1.5">
                    <div v-for="(preview, index) in seedanceRefImagePreviews" :key="`wan3-image-${index}`" class="relative"><img :src="preview" class="w-12 h-12 object-cover rounded border border-slate-200 dark:border-dark-600" /><button type="button" @click="removeSeedanceRefImage(index)" class="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px]">✕</button></div>
                    <div v-for="(url, index) in seedanceRefImageUrls" :key="`wan3-image-url-${index}`" class="flex items-center gap-1 max-w-32 rounded border border-slate-200 dark:border-dark-600 px-1.5 py-1 text-xs text-slate-500"><span class="truncate">🔗 {{ url }}</span><button type="button" @click="removeSeedanceRefImageUrl(index)" class="text-red-500">✕</button></div>
                  </div>
                  <button v-if="seedanceRefImages.length + seedanceRefImageUrls.length < wan3MaxRefImages" type="button" @click="seedanceRefImageInputRef?.click()" class="mt-1.5 w-full py-2 border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg text-xs text-slate-500 hover:border-amber-400">{{ translateUi('uiMessages.m98e683ff244c') }}</button>
                  <input ref="seedanceRefImageInputRef" type="file" accept="image/jpeg,image/png,image/bmp,image/webp" multiple @change="handleSeedanceRefImages" class="hidden" />
                </div>

                <div v-if="wan3MaxRefVideos > 0">
                  <div class="flex items-center justify-between mb-1.5"><label class="text-xs font-semibold text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mc4b8adde8e05') }}</label><span class="text-xs text-slate-500">{{ translateUi('uiMessages.m70a1a7943f1d', { value1: (seedanceRefVideos.length + seedanceRefVideoUrls.length), value2: (wan3MaxRefVideos) }) }}</span></div>
                  <div class="flex gap-1.5"><input v-model="seedanceRefVideoUrl" type="url" :placeholder="translateUi('uiMessages.mb2fcab1db6cc')" class="input text-xs py-1.5" @keydown.enter.prevent="addSeedanceRefVideoUrl" /><button type="button" @click="addSeedanceRefVideoUrl" class="px-2 py-1.5 text-xs rounded-lg bg-amber-700 text-white hover:bg-amber-600">{{ translateUi('common.add') }}</button></div>
                  <div v-for="(item, index) in seedanceRefVideoPreviews" :key="`wan3-video-${index}`" class="flex items-center gap-2 mt-1.5 rounded border border-slate-200 dark:border-dark-600 px-2 py-1.5 text-xs"><span class="flex-1 truncate">{{ item.name }} · {{ item.duration.toFixed(1) }}s</span><button type="button" @click="removeSeedanceRefVideo(index)" class="text-red-500">{{ translateUi('user.removeCoupon') }}</button></div>
                  <div v-for="(url, index) in seedanceRefVideoUrls" :key="`wan3-video-url-${index}`" class="flex items-center gap-2 mt-1.5 rounded border border-slate-200 dark:border-dark-600 px-2 py-1.5 text-xs"><span class="flex-1 truncate">🔗 {{ url }}</span><button type="button" @click="removeSeedanceRefVideoUrl(index)" class="text-red-500">{{ translateUi('user.removeCoupon') }}</button></div>
                  <button v-if="seedanceRefVideos.length + seedanceRefVideoUrls.length < wan3MaxRefVideos" type="button" @click="seedanceRefVideoInputRef?.click()" class="mt-1.5 w-full py-2 border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg text-xs text-slate-500 hover:border-amber-400">{{ translateUi('uiMessages.meb0aa9f49793') }}</button>
                  <input ref="seedanceRefVideoInputRef" type="file" accept="video/mp4,video/quicktime" multiple @change="handleSeedanceRefVideos" class="hidden" />
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1.5"><label class="text-xs font-semibold text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mda3abb882b08') }}</label><span class="text-xs text-slate-500">{{ translateUi('uiMessages.m70a1a7943f1d', { value1: (seedanceRefAudios.length + seedanceRefAudioUrls.length), value2: (wan3MaxRefAudios) }) }}</span></div>
                  <div class="flex gap-1.5"><input v-model="seedanceRefAudioUrl" type="url" :placeholder="translateUi('uiMessages.md5c32e5c3901')" class="input text-xs py-1.5" @keydown.enter.prevent="addSeedanceRefAudioUrl" /><button type="button" @click="addSeedanceRefAudioUrl" class="px-2 py-1.5 text-xs rounded-lg bg-amber-700 text-white hover:bg-amber-600">{{ translateUi('common.add') }}</button></div>
                  <div v-for="(item, index) in seedanceRefAudioPreviews" :key="`wan3-audio-${index}`" class="flex items-center gap-2 mt-1.5 rounded border border-slate-200 dark:border-dark-600 px-2 py-1.5 text-xs"><span class="flex-1 truncate">{{ item.name }} · {{ item.duration.toFixed(1) }}s</span><button type="button" @click="removeSeedanceRefAudio(index)" class="text-red-500">{{ translateUi('user.removeCoupon') }}</button></div>
                  <div v-for="(url, index) in seedanceRefAudioUrls" :key="`wan3-audio-url-${index}`" class="flex items-center gap-2 mt-1.5 rounded border border-slate-200 dark:border-dark-600 px-2 py-1.5 text-xs"><span class="flex-1 truncate">🔗 {{ url }}</span><button type="button" @click="removeSeedanceRefAudioUrl(index)" class="text-red-500">{{ translateUi('user.removeCoupon') }}</button></div>
                  <button v-if="seedanceRefAudios.length + seedanceRefAudioUrls.length < wan3MaxRefAudios" type="button" @click="seedanceRefAudioInputRef?.click()" class="mt-1.5 w-full py-2 border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg text-xs text-slate-500 hover:border-amber-400">{{ translateUi('uiMessages.m744cda69190e') }}</button>
                  <input ref="seedanceRefAudioInputRef" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav" multiple @change="handleSeedanceRefAudios" class="hidden" />
                </div>
              </div>

              <div v-if="wan3Mode === 'file'">
                <label class="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">{{ translateUi('uiMessages.m53de98b94655') }}</label>
                <input ref="wan3FileInputRef" type="file" accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.key,.pages,.numbers,.md" class="hidden" @change="handleWan3File" />
                <div class="flex items-center gap-2"><button type="button" @click="wan3FileInputRef?.click()" class="px-3 py-2 text-xs font-medium rounded-lg bg-slate-200 dark:bg-dark-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300">{{ wan3File ? translateUi('uiMessages.m9b904c0e2faf') : translateUi('uiMessages.m822fb37dba29') }}</button><span v-if="wan3File" class="flex-1 text-xs text-slate-500 truncate">{{ wan3File.name }}</span><button v-if="wan3File" type="button" @click="wan3File = null" class="text-xs text-red-500">{{ translateUi('user.removeCoupon') }}</button></div>
                <p class="text-xs text-slate-500 mt-1">{{ translateUi('uiMessages.m36585e5bf721') }}</p>
              </div>

              <div v-if="wan3Mode === 'link'">
                <label class="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1.5">{{ translateUi('uiMessages.mbe579e6810a3') }}</label>
                <input v-model="wan3Link" type="url" class="input text-sm" placeholder="https://example.com/product" />
                <p class="text-xs text-slate-500 mt-1">{{ translateUi('uiMessages.mcbb638741e5c') }}</p>
              </div>

              <div class="border border-slate-200 dark:border-dark-600 rounded-lg overflow-hidden">
                <button type="button" @click="wan3AdvancedOpen = !wan3AdvancedOpen" class="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-dark-700 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors">
                  <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.m220c84b705f0') }}</span>
                  <span class="text-xs text-slate-500">{{ wan3AdvancedOpen ? translateUi('common.less') : translateUi('common.expand') }}</span>
                </button>
                <div v-show="wan3AdvancedOpen" class="px-3 py-3 border-t border-slate-200 dark:border-dark-600 space-y-2.5">
                  <label v-if="currentModelConfig?.apiType !== 'grsai-wan3'" class="flex items-center justify-between cursor-pointer"><span class="text-xs text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mb311c8ba2968') }}</span><input v-model="wan3GenerateAudio" type="checkbox" class="rounded accent-amber-600" /></label>
                  <label v-if="currentModelConfig?.apiType !== 'grsai-wan3'" class="flex items-center justify-between cursor-pointer"><span class="text-xs text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mad47a10ae688') }}</span><input v-model="wan3PromptExtend" type="checkbox" class="rounded accent-amber-600" /></label>
                  <label v-if="currentModelConfig?.apiType !== 'grsai-wan3'" class="flex items-center justify-between cursor-pointer"><span class="text-xs text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m6a6a8b31ada2') }}</span><input v-model="wan3Watermark" type="checkbox" class="rounded accent-amber-600" /></label>
                  <div><label class="text-xs text-slate-600 dark:text-slate-400 block mb-1">{{ translateUi('uiMessages.m82b5a4e61a42') }}</label><input v-model="wan3Seed" inputmode="numeric" class="input text-xs py-1.5" :placeholder="translateUi('uiMessages.m4920f0881182')" /></div>
                </div>
              </div>
            </div>

            <!-- ========== Kling v3 Omni 模式选择和参数 ========== -->
            <div v-if="isKlingV3OmniModel" class="space-y-3">
              <!-- 模式选择区域 -->
              <div class="border border-slate-200 dark:border-dark-600 rounded-lg overflow-hidden">
                <button
                  type="button"
                  @click="klingV3OmniModeOpen = !klingV3OmniModeOpen"
                  class="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-dark-700 hover:bg-slate-100 dark:hover:bg-dark-600 transition-colors"
                >
                  <span class="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>🎬</span>
                    <span>{{ translateUi('uiMessages.m29ccb4125180') }}</span>
                    <span class="ml-1 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                      {{ KLING_V3_OMNI_MODES.find(m => m.value === klingV3OmniMode)?.label }}
                    </span>
                  </span>
                  <svg
                    class="w-4 h-4 text-slate-500 transition-transform duration-200"
                    :class="{ 'rotate-180': klingV3OmniModeOpen }"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  v-show="klingV3OmniModeOpen"
                  class="px-3 py-2.5 border-t border-slate-200 dark:border-dark-600"
                >
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="m in klingV3OmniAvailableModes"
                      :key="m.value"
                      type="button"
                      @click="klingV3OmniMode = m.value"
                      :class="[
                        'px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150',
                        klingV3OmniMode === m.value
                          ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200 shadow-sm'
                          : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500 hover:border-gray-400 dark:hover:border-gray-500'
                      ]"
                    >
                      <span class="mr-1">{{ m.icon }}</span>{{ m.label }}
                    </button>
                  </div>
                </div>
              </div>
              <!-- 首帧图片上传（图生视频/首尾帧） -->
              <div v-if="['image2video', 'first_last_frame'].includes(klingV3OmniMode)">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  <span>🖼</span><span>{{ translateUi('uiMessages.m5f960b0d9032') }}</span>
                </label>
                <div v-if="!klingV3OmniFirstFrameFile" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="klingV3OmniFirstFrameInputRef?.click()">
                  <div class="text-2xl mb-1">📤</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m5030e7b4964b') }}</p>
                  <input ref="klingV3OmniFirstFrameInputRef" type="file" accept="image/*" @change="handleKlingV3OmniFirstFrame" class="hidden" />
                </div>
                <div v-else class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                  <img :src="klingV3OmniFirstFramePreview" class="w-12 h-12 object-cover rounded flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-slate-700 dark:text-slate-300 truncate">{{ klingV3OmniFirstFrameFile.name }}</p>
                    <p class="text-xs text-slate-500">{{ (klingV3OmniFirstFrameFile.size / 1024 / 1024).toFixed(2) }} MB</p>
                  </div>
                  <button @click="removeKlingV3OmniFirstFrame" class="w-6 h-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 flex items-center justify-center text-xs">✕</button>
                </div>
              </div>

              <!-- 尾帧图片上传（首尾帧） -->
              <div v-if="klingV3OmniMode === 'first_last_frame'">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  <span>🖼</span><span>{{ translateUi('uiMessages.m9b31d6cfb16f') }}</span>
                </label>
                <div v-if="!klingV3OmniLastFrameFile" class="border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors" @click="klingV3OmniLastFrameInputRef?.click()">
                  <div class="text-2xl mb-1">📤</div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m5b81cfad2635') }}</p>
                  <input ref="klingV3OmniLastFrameInputRef" type="file" accept="image/*" @change="handleKlingV3OmniLastFrame" class="hidden" />
                </div>
                <div v-else class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-2 border border-slate-200 dark:border-dark-600">
                  <img :src="klingV3OmniLastFramePreview" class="w-12 h-12 object-cover rounded flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-slate-700 dark:text-slate-300 truncate">{{ klingV3OmniLastFrameFile.name }}</p>
                    <p class="text-xs text-slate-500">{{ (klingV3OmniLastFrameFile.size / 1024 / 1024).toFixed(2) }} MB</p>
                  </div>
                  <button @click="removeKlingV3OmniLastFrame" class="w-6 h-6 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 flex items-center justify-center text-xs">✕</button>
                </div>
              </div>

              <!-- 参考图片（主体控制/多镜头） -->
              <div v-if="['subject_control', 'multi_shot'].includes(klingV3OmniMode)">
                <div class="flex items-center justify-between mb-1.5">
                  <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>🖼</span><span>{{ translateUi('imageGen.referenceImages') }}</span>
                  </label>
                  <span class="text-xs text-slate-500">{{ klingV3OmniRefImages.length + klingV3OmniRefImageUrls.length }} / 7</span>
                </div>
                <!-- URL 输入 -->
                <div v-if="(klingV3OmniRefImages.length + klingV3OmniRefImageUrls.length) < 7" class="flex gap-1.5 mb-1.5">
                  <input v-model="klingV3OmniRefImageUrl" type="text" :placeholder="translateUi('uiMessages.m8f3a8805e38e')" class="flex-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-gray-400" @keydown.enter.prevent="addKlingV3OmniRefImageUrl" />
                  <button @click="addKlingV3OmniRefImageUrl" :disabled="!klingV3OmniRefImageUrl.trim()" class="px-2 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-200 dark:text-gray-900">{{ translateUi('common.add') }}</button>
                </div>
                <!-- 已添加的图片列表 -->
                <div class="space-y-1">
                  <div v-for="(preview, i) in klingV3OmniRefImagePreviews" :key="'file-'+i" class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-1.5 border border-slate-200 dark:border-dark-600">
                    <img :src="preview" class="w-8 h-8 object-cover rounded flex-shrink-0" />
                    <span class="flex-1 text-xs text-slate-600 dark:text-slate-400 truncate">{{ klingV3OmniRefImages[i]?.name }}</span>
                    <button @click="removeKlingV3OmniRefImage(i)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs flex items-center justify-center">✕</button>
                  </div>
                  <div v-for="(url, i) in klingV3OmniRefImageUrls" :key="'url-'+i" class="flex items-center space-x-2 bg-slate-50 dark:bg-dark-700 rounded-lg p-1.5 border border-slate-200 dark:border-dark-600">
                    <span class="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center text-xs">🔗</span>
                    <span class="flex-1 text-xs text-slate-600 dark:text-slate-400 truncate">{{ url }}</span>
                    <button @click="removeKlingV3OmniRefImageUrl(i)" class="w-5 h-5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-xs flex items-center justify-center">✕</button>
                  </div>
                </div>
                <!-- 文件上传按钮 -->
                <button v-if="(klingV3OmniRefImages.length + klingV3OmniRefImageUrls.length) < 7" @click="klingV3OmniRefImageInputRef?.click()" class="mt-1.5 w-full py-2 border-2 border-dashed border-slate-300 dark:border-dark-600 rounded-lg text-xs text-slate-500 hover:border-gray-400 transition-colors">
                  {{ translateUi('uiMessages.m28e67169833c') }}
                </button>
                <input ref="klingV3OmniRefImageInputRef" type="file" accept="image/*" multiple @change="handleKlingV3OmniRefImage" class="hidden" />
                <p v-if="klingV3OmniMode === 'subject_control'" class="text-xs text-slate-500 mt-1">{{ translateUi('uiMessages.med6b0075347c') }}</p>
              </div>

              <!-- 视频参考 -->
              <div v-if="klingV3OmniMode === 'video_reference'">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  <span>📹</span><span>{{ translateUi('uiMessages.maef0b304e455') }}</span>
                </label>
                <input v-model="klingV3OmniRefVideoUrl" type="text" :placeholder="translateUi('uiMessages.m6c1168bfe120')" class="w-full px-2 py-1.5 text-xs border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                <div class="flex items-center gap-2 mt-1.5">
                  <span class="text-xs text-slate-500">{{ translateUi('uiMessages.m2e5803fb4b2f') }}</span>
                  <button @click="klingV3OmniKeepSound = 'yes'" :class="['px-2 py-1 text-xs rounded border', klingV3OmniKeepSound === 'yes' ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900' : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500']">{{ translateUi('common.yes') }}</button>
                  <button @click="klingV3OmniKeepSound = 'no'" :class="['px-2 py-1 text-xs rounded border', klingV3OmniKeepSound === 'no' ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900' : 'bg-white dark:bg-dark-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-dark-500']">{{ translateUi('common.no') }}</button>
                </div>
                <p class="text-xs text-slate-500 mt-1">{{ translateUi('uiMessages.m429e90ecc44a') }}</p>
              </div>
            </div>

            <!-- RunningHub V3.1 图像+音频模式音频上传 -->
            <div v-if="isRunningHubAiAppVideoV31Model && v31NeedsAudio" class="space-y-2.5 rounded-lg border border-slate-200 dark:border-dark-600 p-3">
              <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>🎵</span>
                <span>{{ translateUi('uiMessages.m11df0c5ebac3') }}</span>
              </label>
              <input ref="v31AudioInputRef" type="file" accept="audio/*,.mp3" class="hidden" @change="handleV31AudioChange" />
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="px-3 py-2 text-xs font-medium rounded-lg bg-slate-200 dark:bg-dark-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-dark-500 transition-colors"
                  @click="v31AudioInputRef?.click()"
                >
                  {{ v31AudioFile ? translateUi('uiMessages.m9b904c0e2faf') : translateUi('uiMessages.mbe5627dc4357') }}
                </button>
                <span v-if="v31AudioFile" class="text-xs text-slate-500 truncate">{{ v31AudioFile.name }}</span>
                <button
                  v-if="v31AudioFile"
                  type="button"
                  class="text-xs text-red-400 hover:text-red-300"
                  @click="v31AudioFile = null"
                >
                  {{ translateUi('user.removeCoupon') }}
                </button>
              </div>
              <p class="text-[11px] text-slate-400">{{ translateUi('uiMessages.mb54246462f31') }}</p>
            </div>

            <div v-if="reviewableImageFiles.length > 0" class="rounded-lg border border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-700/50 p-2.5 space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.m94f32023681f') }}</span>
                <button
                  v-if="reviewChannel"
                  type="button"
                  :disabled="isQuickImageReviewSubmitting || quickImageReviewSummary.startsWith('审核中')"
                  class="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-200 dark:text-gray-900"
                  @click="handleQuickImageReview"
                >
                  {{ isQuickImageReviewSubmitting ? translateUi('uiMessages.m2fb1db2875cb') : quickImageReviewSummary.startsWith('已过审') ? translateUi('uiMessages.m93632ccd0ab5') : translateUi('uiMessages.m1348c1c5227f') }}
                </button>
              </div>
              <p v-if="quickImageReviewSummary" class="text-xs text-slate-500 dark:text-slate-400">{{ quickImageReviewSummary }}</p>
              <p v-else-if="!reviewChannel" class="text-xs text-amber-600 dark:text-amber-400">{{ reviewChannelMessage || translateUi('uiMessages.ma4229f71dd53') }}</p>
            </div>

            <!-- 图生视频上传区域（非 Seedance 模型时显示） -->
            <div v-if="(mode === 'image' || (isRunningHubAiAppVideoV31Model && v31NeedsImages)) && !isReferenceVideoModel && !isKlingV3OmniModel" class="space-y-2.5">
              <div class="flex items-center justify-between">
                <label class="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <span>🖼️</span>
                  <span>{{ isRunningHubAiAppVideoV31Model ? (v31Mode === 'first_last_frame' ? translateUi('uiMessages.mcec3db74006b') : v31Mode === 'last_frame' ? translateUi('uiMessages.m775b657e8883') : v31Mode === 'multi_image' ? translateUi('uiMessages.m8506aadad100') : translateUi('imageGen.uploadImage')) : translateUi('canvas.nodeConfig.imageInput.desc') }}</span>
                </label>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  <span class="font-semibold text-gray-700 dark:text-gray-300">{{ imageFiles.length }}</span> {{ translateUi('uiMessages.m23edbeacb3e6', { value1: (maxImagesForModel) }) }}
                </div>
              </div>
              
              <!-- 图片数量超限提示 -->
              <div v-if="imageFiles.length > maxImagesForModel" class="p-2 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg">
                <p class="text-xs text-gray-700 dark:text-gray-300">
                  {{ translateUi('uiMessages.m99876dbef444', { value1: (maxImagesForModel) }) }}
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
                  {{ translateUi('uiMessages.mdb5925830bc3') }}
                </p>
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  {{ translateUi('uiMessages.m953f2678842b') }}
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
                  {{ translateUi('uiMessages.m009b49cc6af0', { value1: (imageFiles.length) }) }}
                </p>
              </div>

              <!-- 预览已上传的图片 -->
              <div v-if="previewUrls.length > 0" class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {{ translateUi('uiMessages.m5b75727ad998') }}
                  </span>
                  <button 
                    @click="clearImages"
                    class="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    {{ translateUi('imageGen.clearAll') }}
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
                    <div class="relative flex-shrink-0">
                      <img
                        :src="url"
                        class="w-12 h-12 object-cover rounded"
                      />
                      <span v-if="imageReviews.get(imageFiles[idx])?.status === 'approved'" class="absolute left-0 top-0 rounded-br bg-emerald-600 px-1 py-0.5 text-[10px] leading-none text-white">{{ translateUi('uiMessages.m93632ccd0ab5') }}</span>
                    </div>
                    
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
                      :title="translateUi('common.delete')"
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
                {{ translateUi('uiMessages.m2fb1db2875cb') }}
              </span>
              <span v-else class="inline-flex items-center justify-center w-full">
                <span class="mr-2">✨</span>
                <span>{{ translateUi('uiMessages.mf75d76706332') }}</span>
                <span v-if="currentPointsCost === null" class="ml-2 text-sm opacity-90">{{ wan3UrlDurations.length ? '暂无法读取参考视频时长' : '正在读取参考视频时长' }}</span>
                <span v-else class="ml-2 text-sm opacity-90">{{ isWan3Model ? '≈ ' : '' }}{{ translateUi('uiMessages.m181800f750b7', { value1: (formatPoints(currentPointsCost)) }) }}</span>
              </span>
            </button>

            <!-- 并发限制提示 -->
            <div v-if="me" class="text-center">
              <p class="text-xs text-slate-500 dark:text-slate-400">
                <span v-if="userPackageInfo.hasPackage" class="text-gray-700 dark:text-gray-300">
                  {{ translateUi('uiMessages.m2f37945f2f3a') }}
                </span>
                <span v-else class="text-slate-600 dark:text-slate-400">
                  {{ translateUi('uiMessages.m597691eaf852') }}
                </span>
                <span class="mx-1">·</span>
                <span>{{ translateUi('uiMessages.m44f95b8cfc53') }} <span class="font-semibold text-gray-700 dark:text-gray-300">{{ me.concurrent_limit || 1 }}</span> {{ translateUi('uiMessages.m3d333f0ded37') }}</span>
              </p>
            </div>

            <!-- 未登录提示 -->
            <div v-if="!me" class="p-3 bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800/30 dark:to-gray-900/30 border border-gray-300 dark:border-gray-700 rounded-lg">
              <div class="flex items-start space-x-2">
                <span class="text-lg">🎁</span>
                <div class="flex-1">
                  <p class="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1">
                    {{ translateUi('uiMessages.m09ecf857f810') }}
                  </p>
                  <p class="text-xs text-gray-700 dark:text-gray-400">
                    {{ translateUi('uiMessages.mc87ec99f0100') }}
                  </p>
                  <a 
                    href="/" 
                    class="mt-2 inline-block px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white text-xs rounded-md transition-colors font-medium"
                  >
                    {{ translateUi('uiMessages.m17e5403abcd9') }}
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
                  {{ translateUi('auth.loginNow') }}
                </a>
                <!-- 如果是并发限制错误且是普通用户，显示升级按钮 -->
                <a 
                  v-else-if="error.includes('如需多并发') && !userPackageInfo.hasPackage"
                  href="/packages" 
                  class="ml-2 px-3 py-1 bg-gray-700 hover:bg-gray-800 text-white text-xs rounded-md transition-colors whitespace-nowrap"
                >
                  {{ translateUi('packages.upgradePackage') }}
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
              <span>{{ translateUi('uiMessages.m0216ebe37b0c') }}</span>
              <span class="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-full text-xs font-semibold">
                {{ gallery.length }}
              </span>
            </h2>
            <button 
              @click="loadHistory" 
              class="text-sm text-gray-600 dark:text-gray-400 hover:underline"
            >
              {{ translateUi('common.refresh') }}
            </button>
          </div>

          <!-- 空状态 - 开始创作 -->
          <div v-if="gallery.length === 0" class="text-center py-20">
            <div class="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 rounded-2xl flex items-center justify-center shadow-lg">
              <span class="text-4xl">🎬</span>
            </div>
            <h3 class="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('landing.startCreating') }}
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {{ translateUi('uiMessages.mca9e5698d9c2') }}
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
                  
                  <p class="text-slate-700 dark:text-slate-200 text-base font-bold mb-2">{{ translateUi('uiMessages.m0a31eca0d17c') }}</p>
                  <p class="text-gray-600 dark:text-gray-400 text-sm font-semibold mb-3 animate-pulse">{{ processingProgressText(item) }}</p>
                  <p
                    v-if="showProcessingTimeoutHint(item)"
                    class="text-amber-600 dark:text-amber-400 text-xs mb-3 font-medium px-6 text-center"
                  >
                    {{ translateUi('uiMessages.m8f3563f204fe') }}
                  </p>
                  
                  <!-- 进度条效果 -->
                  <div class="w-48 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-gray-400 via-gray-500 to-gray-400 rounded-full animate-loading-bar"></div>
                  </div>
                  
                  <p class="text-gray-500 dark:text-gray-400 text-xs mt-4 font-medium px-6 text-center">
                    {{ translateUi('uiMessages.mb046bdd14bdd') }}
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
                  <p v-if="isContentSafetyMsg(item.fail_reason)" class="text-xs mt-1 text-center text-gray-500 dark:text-gray-400">{{ translateUi('uiMessages.mb8705a65f9cb') }}</p>
                  <p v-else-if="item.status === 'timeout'" class="text-xs mt-1 text-center text-gray-500 dark:text-gray-400">{{ translateUi('uiMessages.m303c84eb838d') }}</p>
                  <p v-else-if="!item.fail_reason" class="text-gray-500 dark:text-gray-400 text-xs mt-2 text-center opacity-75">{{ translateUi('uiMessages.m9ba4b48c2d18') }}</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-3 font-medium">{{ translateUi('uiMessages.m69e035ce772a') }}</p>
                </div>
              </div>
              
              <!-- 完成状态 -->
              <div v-else 
                class="rounded-lg overflow-hidden bg-black aspect-video relative cursor-pointer group" 
                @click="openVideoModal(item)"
              >
                <img
                  v-if="item.video_url && getVideoThumbnail(item)"
                  :src="getVideoThumbnail(item)"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  @error="onVideoThumbnailError(item)"
                />
                <video
                  v-else-if="item.video_url"
                  :src="buildSafeVideoUrl(item.video_url)" v-stream-video="buildSafeVideoUrl(item.video_url)"
                  preload="metadata"
                  muted
                  class="w-full h-full object-cover pointer-events-none"
                  @loadeddata="(e) => { e.target.currentTime = 0.1 }"
                />
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
                      :title="translateUi('uiMessages.mc76b7d003a01', { value1: (star) })"
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
                    :placeholder="translateUi('uiMessages.m5440e675ac57')"
                    class="w-full px-2 py-1 text-xs bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 rounded focus:outline-none focus:ring-1 focus:ring-gray-500 text-slate-600 dark:text-slate-300 placeholder-slate-400"
                  />
                </div>
                
                <div class="flex items-center gap-2 pt-2">
                  <button 
                    class="flex-1 btn-secondary text-xs py-2" 
                    @click="openVideoModal(item)"
                    :disabled="!item.video_url"
                  >
                    {{ translateUi('uiMessages.m13d61fea9f17') }}
                  </button>
                  <button 
                    class="flex-1 btn-secondary text-xs py-2" 
                    @click="downloadVideo(item)" 
                    :disabled="!item.video_url"
                  >
                    {{ translateUi('common.download') }}
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
            :title="translateUi('uiMessages.m7f0215625f0b')"
          >
            <span class="text-2xl mb-1">🎬</span>
            <span class="text-xs font-semibold">{{ translateUi('imageGen.history') }}</span>
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
                  {{ translateUi('imageGen.history') }}
                  <span class="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 rounded-full text-xs font-semibold">
                    {{ history.length }}
                  </span>
                </h3>
              </div>
            </div>
            <button
              @click="toggleHistoryDrawer"
              class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-700 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              :title="translateUi('common.close')"
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
              <p class="text-slate-500 dark:text-slate-400 text-sm font-medium">{{ translateUi('canvas.noHistoryWorkflows') }}</p>
              <p class="text-slate-400 dark:text-slate-500 text-xs mt-2">{{ translateUi('uiMessages.md36bf3e10ffc') }}</p>
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
                  v-if="item.video_url && getVideoThumbnail(item)"
                  :src="getVideoThumbnail(item)"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  @error="onVideoThumbnailError(item)"
                />
                <video
                  v-else-if="item.video_url"
                  :src="buildSafeVideoUrl(item.video_url)" v-stream-video="buildSafeVideoUrl(item.video_url)"
                  preload="metadata"
                  muted
                  class="w-full h-full object-cover pointer-events-none"
                  @loadeddata="(e) => { e.target.currentTime = 0.1 }"
                />
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
                    <p class="text-xs text-slate-700 dark:text-slate-300 font-semibold">{{ processingProgressText(item) }}</p>
                    <p
                      v-if="showProcessingTimeoutHint(item)"
                      class="text-xs text-amber-600 dark:text-amber-400 mt-1 px-3"
                    >
                      {{ translateUi('uiMessages.m8f3563f204fe') }}
                    </p>
                  </div>
                </div>
                <!-- 失败状态 -->
                <div v-else-if="isFailedStatus(item.status)" class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/40 dark:to-gray-700/40">
                  <div class="text-3xl mb-2">{{ isContentSafetyMsg(item.fail_reason) ? '🛡️' : item.status === 'timeout' ? '⏱️' : '❌' }}</div>
                  <p class="text-xs font-semibold" :class="isContentSafetyMsg(item.fail_reason) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'">{{ formatStatus(item.status) }}</p>
                  <p v-if="item.fail_reason" class="text-xs mt-1 text-center px-4 line-clamp-2" :class="isContentSafetyMsg(item.fail_reason) ? 'text-amber-500 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'">{{ item.fail_reason }}</p>
                  <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 font-medium">{{ translateUi('uiMessages.m69e035ce772a') }}</p>
                </div>
                <!-- 其他未知状态 - 默认显示为等待中 -->
                <div v-else class="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800/40 dark:to-gray-900/40">
                  <svg class="animate-spin h-8 w-8 text-gray-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div class="text-xs text-slate-700 dark:text-slate-300 font-semibold">{{ formatStatus(item.status) }}</div>
                  <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">{{ translateUi('common.pleaseWait') }}</div>
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
                      :title="translateUi('uiMessages.mc76b7d003a01', { value1: (star) })"
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
                    :placeholder="translateUi('uiMessages.m83be65a7a328')"
                    class="w-full px-2 py-1 text-xs bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 rounded focus:outline-none focus:ring-1 focus:ring-gray-500 text-slate-600 dark:text-slate-300 placeholder-slate-400"
                  />
                </div>

                <!-- 失败原因 -->
                <div v-if="isFailedStatus(item.status)" class="text-xs p-2 rounded space-y-1" :class="isContentSafetyMsg(item.fail_reason) ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-100 dark:bg-gray-800/50'">
                  <p v-if="item.fail_reason" :class="isContentSafetyMsg(item.fail_reason) ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'">{{ item.fail_reason }}</p>
                  <p v-if="isContentSafetyMsg(item.fail_reason)" class="text-gray-500 dark:text-gray-400">{{ translateUi('uiMessages.mb8705a65f9cb') }}</p>
                  <p v-else-if="item.status === 'timeout'" class="text-gray-500 dark:text-gray-400">{{ translateUi('uiMessages.m303c84eb838d') }}</p>
                  <p class="text-gray-600 dark:text-gray-400 font-medium">{{ translateUi('uiMessages.m69e035ce772a') }}</p>
                </div>

                <!-- 操作按钮 -->
                <div class="flex items-center gap-2 pt-2">
                  <!-- 再次生成按钮 -->
                  <button 
                    class="w-10 h-8 rounded-lg bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
                    @click="regenerateFromHistory(item)"
                    :title="translateUi('uiMessages.ma69bd20e41d4')"
                  >
                    🔄
                  </button>
                  <button 
                    class="flex-1 btn-secondary-small" 
                    @click="openVideoModal(item)"
                  >
                    <span class="mr-1">👁️</span>
                    {{ translateUi('uiMessages.m13d61fea9f17') }}
                  </button>
                  <button 
                    class="flex-1 btn-secondary-small" 
                    :disabled="!item.video_url" 
                    @click="downloadVideo(item)"
                    :class="{ 'opacity-50 cursor-not-allowed': !item.video_url }"
                  >
                    <span class="mr-1">⬇️</span>
                    {{ translateUi('common.download') }}
                  </button>
                  <button v-if="me && me.can_delete_history !== false"
                    class="w-10 h-8 rounded-lg bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
                    @click="deleteHistory(item)"
                    :title="translateUi('common.delete')"
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
                {{ translateUi('uiMessages.maf90a08fec8e') }}
              </button>
              <div v-else class="flex items-center gap-2 text-xs text-slate-500">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ translateUi('common.loading') }}
              </div>
            </div>
          </div>
        </div>
  </div>

  <!-- 视频预览模态框 -->
  <div v-if="showVideoModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" @click.self="closeVideoModal">
    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-dark-600">
        <h4 class="font-semibold text-slate-900 dark:text-white">{{ translateUi('uiMessages.m05608cc41def') }}</h4>
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
            :src="buildSafeVideoUrl(currentVideo.video_url)" v-stream-video="buildSafeVideoUrl(currentVideo.video_url)"
            controls 
            class="w-full h-full object-contain"
            playsinline
            @loadeddata="onVideoLoaded"
          ></video>
          <div v-else class="flex items-center justify-center h-full text-slate-400">
            <div class="text-center">
              <div class="text-5xl mb-3">⏳</div>
              <div class="text-lg">{{ translateUi('uiMessages.m33f0c2544c21') }}</div>
            </div>
          </div>
        </div>
        <div>
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-1">{{ translateUi('directorStudio.inspector.prompt') }}</p>
          <p class="text-base text-slate-900 dark:text-white whitespace-pre-wrap">{{ currentVideo?.prompt }}</p>
        </div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div class="flex items-center space-x-2">
            <span class="text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m2a845bd8e225') }}</span>
            <span class="text-slate-900 dark:text-white font-medium">{{ currentVideo?.model }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m1f8d1c34a451') }}</span>
            <span class="text-slate-900 dark:text-white font-medium">{{ currentVideo?.aspect_ratio }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.mdbfc1f8d10d3') }}</span>
            <span class="text-slate-900 dark:text-white font-medium">{{ currentVideo?.duration || duration }}s</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m86344fd28ab4') }}</span>
            <span :class="statusColor(currentVideo?.status)" class="font-medium">{{ formatStatus(currentVideo?.status) }}</span>
          </div>
        </div>
      </div>
      <div class="p-4 border-t border-slate-200 dark:border-dark-600 flex justify-end gap-3">
        <button class="btn-secondary px-6 py-2" @click="closeVideoModal">{{ translateUi('common.close') }}</button>
        <button 
          class="btn-primary px-6 py-2" 
          :disabled="!currentVideo?.video_url" 
          @click="downloadVideo(currentVideo)"
        >
          {{ translateUi('videoGen.downloadVideo') }}
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
