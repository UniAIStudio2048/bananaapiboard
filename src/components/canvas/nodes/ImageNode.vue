<script setup>
defineOptions({
  inheritAttrs: false
})

/**
 * ImageNode.vue - 图片节点（统一设计）
 * 
 * 工作流设计：
 * - 初始状态：显示快捷操作（图生图、图生视频等）
 * - 点击"图生图"：触发上传，上传后当前节点变成图片预览，自动创建右侧输出节点
 * - 选中输出节点时：底部弹出配置面板
 */
import { ref, computed, inject, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore, useUploadManager } from '@/stores/canvas'
import { useModelStatsStore } from '@/stores/canvas/modelStatsStore'
import { useTeamStore } from '@/stores/team'
import { generateImageFromText, generateImageFromImage, pollTaskStatus, uploadImages, deductCropPoints, removeImageBackground } from '@/api/canvas/nodes'
import { getHistory } from '@/api/canvas/history'
import { extractVideoFrame } from '@/api/canvas/workflow'
import { createQuickSeedanceCharacterAsset, listAssetGroups, pollAssetStatus } from '@/api/canvas/volcengine-assets'
import { registerTask, removeCompletedTask, getTasksByNodeId, ensureTaskPolling } from '@/stores/canvas/backgroundTaskManager'
import { getTaskMediaUrl } from '@/utils/canvasTaskResult'
import { formatPoints } from '@/utils/format'
import { getTotalUserPoints } from '@/utils/points'
import { resolveAutoAspectRatio } from '@/utils/aspectRatio'
import { getApiUrl, getModelDisplayName, isModelEnabled, getAvailableImageModels, getTenantHeaders, isSeedanceFeaturesEnabled } from '@/config/tenant'
import {
  formatVideoGenerationElapsed,
  getVideoGenerationElapsedSeconds
} from '@/utils/videoGenerationProgress'
import { useI18n } from '@/i18n'
import { showAlert, showInsufficientPointsDialog, showToast } from '@/composables/useCanvasDialog'
import { getImagePresets, incrementPresetUseCount, createImagePreset, updateImagePreset, normalizePresetPointsCost } from '@/api/canvas/image-presets'
import ImagePresetDialog from '../dialogs/ImagePresetDialog.vue'
import ImagePresetManager from '../dialogs/ImagePresetManager.vue'
import ImageCropper from '../ImageCropper.vue'
import Camera3DPanel from '../Camera3DPanel.vue'
import Pose3DViewer from '../Pose3DViewer.vue'
import CameraControlPanel from '../CameraControlPanel.vue'
import { generateCameraPrompt } from '@/config/canvas/cameraDatabase'
import { getHighQualityCanvasPreviewUrl, getOriginalImageUrl, getVideoPosterUrl, onCanvasImageError, toSameOriginUrl } from '@/utils/canvasThumbnail'
import { getSmartImageUrl } from '@/utils/cloudMediaUrl'
import { isPreferredModelMediaUrl, normalizeModelImageUrls } from '@/utils/canvasModelMedia'
import { buildCanvasSubmitFingerprint, createCanvasDuplicateSubmitGuard } from '@/utils/canvasDuplicateSubmitGuard'
import { buildPromptSafetyDialog, isPromptSafetyBlockedError } from '@/utils/promptSafetyError'
import { useImageHoverPreview } from '@/composables/useImageHoverPreview'
import { useNodeVisibility } from '@/composables/useNodeVisibility'
import { isTextareaResizeHandlePointer } from '@/utils/promptTextareaResize'
import { createConfigPanelWheelZoom } from '@/utils/configPanelWheelZoom'
import { applyPromptEditorTextInput, getActivePromptMentionRange, getMentionPopupPosition, getPromptMediaTagCaretIndex, getPromptEditorSelectionRange, hasPromptEditorOrphanTextNodes, isPromptEditorSelectionAtMentionBoundary, removePromptEditorOrphanTextNodes, replacePromptEditorMentionText, restorePromptEditorSelection, serializePromptEditorContent, shouldDeferPromptEditorBoundaryBeforeInputForIme, snapPromptEditorCaretOutOfMention } from '@/utils/promptMention'
import {
  bindMediaMention,
  getMediaMentionKey,
  normalizeMediaMentionLabel,
  resolveMediaMentionItem,
  syncPromptMediaMentions
} from '@/utils/promptMediaBindings'
import { getElementCenterFlowPosition } from '@/utils/canvasConnectionPosition'
import { getBatchGridPositions } from '@/utils/canvasBatchLayout'
import { findBatchSafetyError } from '@/utils/canvasBatchFailures'
import { isPanoramaVrSupportedRatio } from '@/utils/canvasPanoramaExport'
import { persistNodePromptDraft } from '@/utils/canvasPromptDraft'
import { getSeedanceQuickAssetStatus } from '@/utils/seedanceQuickAsset'
import PromptMentionPopup from '../PromptMentionPopup.vue'
import PromptMediaTag from '../PromptMediaTag.vue'
import CanvasNodeImage from '../CanvasNodeImage.vue'
import PanoramaPreviewModal from '../PanoramaPreviewModal.vue'
import ModelIcon from '../../common/ModelIcon.vue'
import { smartDownload } from '@/api/client'

const { t } = useI18n()

// 节点根元素引用（用于计算工具栏位置 + 视口懒加载）
const nodeRef = ref(null)
const nodeWrapperRef = ref(null)
const { isVisible: isNodeVisible } = useNodeVisibility(nodeRef)

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const emit = defineEmits(['updateNodeInternals'])

const canvasStore = useCanvasStore()
const uploadManager = useUploadManager()
const teamStore = useTeamStore()
const userInfo = inject('userInfo')
const isCanvasViewportMoving = inject('isCanvasViewportMoving', ref(false))
const canvasStableZoom = inject('canvasStableZoom', null)
const canvasPromptInputScale = inject('canvasPromptInputScale', computed(() => ({ enabled: false, style: {} })))
const isPromptInputFixedScale = computed(() => !!canvasPromptInputScale.value?.enabled)
const promptInputFixedScaleStyle = computed(() => canvasPromptInputScale.value?.style || {})
const { onHoverStart, onVideoHoverStart, onHoverEnd } = useImageHoverPreview()

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals, findNode, setViewport, getViewport, getSelectedNodes } = useVueFlow()
let nodeGeometryObserver = null
let nodeInternalsUpdateRaf = null
let nodeInternalsUpdateQueued = false
let nodeGeometryDisposed = false

function scheduleNodeInternalsUpdate() {
  if (nodeGeometryDisposed || nodeInternalsUpdateQueued) return
  nodeInternalsUpdateQueued = true

  nextTick(() => {
    if (nodeGeometryDisposed) {
      nodeInternalsUpdateQueued = false
      return
    }
    nodeInternalsUpdateRaf = requestAnimationFrame(() => {
      if (!nodeGeometryDisposed) {
        updateNodeInternals(props.id)
      }
      nodeInternalsUpdateRaf = null
      nodeInternalsUpdateQueued = false
    })
  })
}

// 配置面板放大相关（与 VideoNode 保持一致的交互逻辑）
const configPanelRef = ref(null)
const isConfigPanelExpanded = ref(false)
const EXPANDED_CONFIG_PANEL_NODE_ZOOM = 1
const { configPanelScale, handleConfigPanelWheel, resetConfigPanelScale } = createConfigPanelWheelZoom()

// 文件上传引用
const fileInputRef = ref(null)
const refImageInputRef = ref(null) // 参考图片上传引用
const pendingAction = ref(null) // 记录待执行的操作类型
const REPLACE_OUTPUT_IMAGE_ACTION = 'replace-output-image'

// 标签编辑状态
const isEditingLabel = ref(false)
const labelInputRef = ref(null)
const localLabel = ref(props.data.label || 'Image')

// 本地状态
const isGenerating = ref(false)
const errorMessage = ref('')
const duplicateSubmitGuard = createCanvasDuplicateSubmitGuard()

function isContentSafetyError(msg) {
  if (!msg) return false
  const keywords = ['敏感', '安全', '拦截', '违规', 'sensitive', 'moderation', 'content safety', 'illegal']
  return keywords.some(k => msg.toLowerCase().includes(k.toLowerCase()))
}

function isTimeoutError(msg) {
  if (!msg) return false
  return msg.includes('超时') || msg.includes('timeout')
}

function getErrorHint(msg) {
  if (isContentSafetyError(msg)) return '请修改提示词或更换参考图片后重试'
  if (isTimeoutError(msg)) return '生成时间过长，请稍后重试或简化提示词'
  return ''
}

const promptText = ref(props.data.prompt || '')
const promptEditorRenderKey = ref(0)
const promptTextareaRef = ref(null) // 提示词输入框引用
const hasManualPromptTextareaSize = ref(false)
const promptMentionBindings = ref(props.data.promptMentionBindings || {})
const isDragOver = ref(false) // 拖拽悬停状态

// 文本框拖动自动滚动相关状态
const isTextareaDragging = ref(false)
const dragStartY = ref(0)
const autoScrollTimer = ref(null)
const autoScrollSpeed = ref(0)
const isRefDragOver = ref(false) // 参考图片区域拖拽状态
const refDragCounter = ref(0) // 参考图片拖拽计数器

// @ 提及弹出相关
const showMentionPopup = ref(false)
const mentionActiveIndex = ref(0)
const mentionPosition = ref({ top: 0, left: 0 })
let mentionStartPos = -1

// 模型下拉框状态
const isModelDropdownOpen = ref(false)

// 📊 模型成功率統計（使用集中式 Store，所有節點共享數據，10 分鐘輪詢）
const modelStatsStore = useModelStatsStore()
modelStatsStore.ensureStarted()
const elapsedTimeNow = ref(Date.now())
let elapsedTimeTimer = null

// 获取指定模型的成功率（代理到 Store）
function getModelSuccessRate(modelName) {
  return modelStatsStore.getImageModelRate(modelName)
}

// 计算信号格数 (1-4格)，无数据时默认满格
function getSignalLevel(modelName) {
  const rate = getModelSuccessRate(modelName)
  if (rate === null) return 4      // 当天未使用，默认满格
  if (rate >= 0.95) return 4
  if (rate >= 0.80) return 3
  if (rate >= 0.60) return 2
  if (rate > 0) return 1
  return 0
}

// 获取颜色类名，无数据时默认绿色
function getSignalClass(modelName) {
  const rate = getModelSuccessRate(modelName)
  if (rate === null) return 'excellent'  // 当天未使用，默认绿色
  if (rate >= 0.95) return 'excellent'
  if (rate >= 0.80) return 'good'
  return 'poor'
}

// 格式化成功率显示，无数据时显示 100%
function formatSuccessRate(modelName) {
  const rate = getModelSuccessRate(modelName)
  if (rate === null) return '100%'
  return Math.round(rate * 100) + '%'
}

function formatModelAvgDuration(modelName) {
  const seconds = modelStatsStore.getImageModelAvgDurationSeconds(modelName)
  return seconds === null ? '' : `${seconds}s`
}

function getImageProcessingTimingData(data = props.data) {
  return {
    processingStartedAt: data?.processingStartedAt,
    created_at: data?.created_at,
    createdAt: data?.createdAt
  }
}

function imageProcessingElapsedText(data = props.data) {
  return formatVideoGenerationElapsed(getVideoGenerationElapsedSeconds(getImageProcessingTimingData(data), elapsedTimeNow.value))
}

// 是否显示模型统计（总是显示，无数据时显示 --）
function hasModelStats(modelName) {
  return true
}

// 预设选择器状态
const isPresetDropdownOpen = ref(false)
const presetDropdownUp = ref(true) // 预设下拉方向
const selectedPreset = ref(props.data?.selectedPreset || '')
const tenantPresets = ref([]) // 租户全局预设
const userPresets = ref([]) // 用户自定义预设
const presetLoadError = ref('')
const presetSelectorRef = ref(null)

// 图像预设对话框和管理器
const showImagePresetDialog = ref(false)
const showImagePresetManager = ref(false)
const editingImagePreset = ref(null)
const imagePresetManagerRef = ref(null)
const tempCustomPrompt = ref(props.data?.tempCustomPrompt || (props.data?.selectedPreset === 'temp-custom' ? props.data?.selectedPresetPrompt || '' : '')) // 临时自定义提示词

function roundPoints(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.round(numeric * 100) / 100
}

function formatPresetOptionName(name, pointsCost = 0) {
  const normalizedCost = normalizePresetPointsCost(pointsCost)
  return normalizedCost > 0 ? `${name} (+${formatPoints(normalizedCost)}积分/张)` : name
}

// 相机控制状态
function defaultCameraSettings() {
  return {
    camera: '',
    cameraName: '',
    cameraType: 'DIGITAL',
    lens: '',
    lensName: '',
    focalLength: 35,
    aperture: 2.0,
    effects: [],
    prompt: ''
  }
}

const showCameraControl = ref(false)
const cameraControlEnabled = ref(props.data?.cameraControlEnabled === true)
const cameraSettings = ref({
  ...defaultCameraSettings(),
  ...(props.data?.cameraSettings || {}),
  prompt: props.data?.cameraSettings?.prompt || props.data?.cameraPrompt || ''
})

// 图片列表拖拽排序状态
const dragSortIndex = ref(-1)
const dragOverIndex = ref(-1)

// 图片编辑器状态
const showImageEditor = ref(false)
const editorInitialTool = ref('')

// 🚀 性能优化：画布拖拽状态（用于降低渲染质量）
const isCanvasDragging = ref(false)
const isCanvasMediaMoving = computed(() => isCanvasDragging.value || isCanvasViewportMoving.value)


// 🔧 Blob URL 内存管理 - 跟踪所有创建的 blob URL，用于组件卸载时清理
// 性能优化: 改用普通数组替代 ref([])，blob URL 跟踪不需要响应式，避免不必要的 Vue 追踪开销
let createdBlobUrls = []

// 🔧 Blob URL 到服务器 URL 的映射 - 用于在 blob URL 失效时获取已上传的服务器 URL
// 性能优化: 改用普通 Map 替代 ref(new Map())，映射关系不需要响应式
let blobToServerUrlMap = new Map()

// 创建并跟踪 blob URL
function createTrackedBlobUrl(blob) {
  const url = URL.createObjectURL(blob)
  createdBlobUrls.push(url)
  return url
}

// 释放并从跟踪列表中移除 blob URL
function revokeTrackedBlobUrl(url) {
  if (!url || !url.startsWith('blob:')) return
  try {
    URL.revokeObjectURL(url)
    const index = createdBlobUrls.indexOf(url)
    if (index > -1) {
      createdBlobUrls.splice(index, 1)
    }
  } catch (e) {
    console.warn('[ImageNode] 释放 blob URL 失败:', e)
  }
}

// 清理所有跟踪的 blob URL
function cleanupAllBlobUrls() {
  console.log('[ImageNode] 清理所有 blob URL，数量:', createdBlobUrls.length)
  createdBlobUrls.forEach(url => {
    try {
      URL.revokeObjectURL(url)
    } catch (e) {
      // 忽略错误
    }
  })
  createdBlobUrls = []
}

// 生成参数 - 默认使用模型列表第一个
const getDefaultModel = () => {
  const availableModels = getAvailableImageModels()
  return availableModels.length > 0 ? availableModels[0].value : 'nano-banana-2'
}
const selectedModel = ref(props.data.model || getDefaultModel())
const selectedResolution = ref(props.data.resolution || '1024')
const selectedAspectRatio = ref(props.data.aspectRatio || 'auto')
const selectedCount = ref(props.data.count || 1)
const imageSize = ref(props.data.imageSize || '4K') // 尺寸选项（仅 nano-banana-2）
const selectedQuality = ref('high')
const enableGroupGeneration = ref(props.data.enableGroupGeneration || false) // 组图生成开关
const maxGroupImages = ref(Math.max(2, Math.min(10, props.data.maxGroupImages || 3))) // 最大组图数量（限制在2-10之间，默认3）
const enableWebSearch = ref(props.data.enableWebSearch !== undefined ? props.data.enableWebSearch : true) // 联网搜索开关（默认开启）

// 组图数量增减控制
function incrementGroupImages() {
  if (maxGroupImages.value < 10) {
    maxGroupImages.value = Math.min(10, maxGroupImages.value + 1)
  }
}

function decrementGroupImages() {
  if (maxGroupImages.value > 2) {
    maxGroupImages.value = Math.max(2, maxGroupImages.value - 1)
  }
}

// MJ botType 选择（文生图和图生图模式：写实/动漫）
const botType = ref(props.data.botType || 'MID_JOURNEY')
const botTypeOptions = [
  { value: 'MID_JOURNEY', label: '写实' },
  { value: 'NIJI_JOURNEY', label: '动漫' }
]

// 生成次数选项循环：1 -> 2 -> 4 -> 1
const countOptions = [1, 2, 4]

// 用户最大并发数限制
const userConcurrentLimit = computed(() => {
  return userInfo?.value?.concurrent_limit || 1
})

// 切换生成次数
async function toggleCount() {
  const currentIndex = countOptions.indexOf(selectedCount.value)
  const nextIndex = (currentIndex + 1) % countOptions.length
  const nextCount = countOptions[nextIndex]

  // 检查是否超过用户套餐限制
  if (nextCount > userConcurrentLimit.value) {
    await showAlert(`您的套餐最大支持 ${userConcurrentLimit.value} 次并发，请升级套餐以使用更多并发`, '并发限制')
    return
  }

  selectedCount.value = nextCount
}

// 模型下拉框方法
const dropdownDirection = ref('down') // 'down' 或 'up'
const modelSelectorRef = ref(null)

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

// 处理下拉列表滚轮事件，阻止传播到画布
function handleDropdownWheel(event) {
  event.stopPropagation()
}

function handleModelDropdownClickOutside(event) {
  // 检查点击是否在下拉框外
  const dropdown = event.target.closest('.model-selector-custom')
  const presetDropdown = event.target.closest('.preset-selector-custom')
  if (!dropdown) {
    isModelDropdownOpen.value = false
  }
  if (!presetDropdown) {
    isPresetDropdownOpen.value = false
  }
}

// ========== 预设管理功能 ==========

// 加载图像预设
async function loadImagePresets() {
  try {
    presetLoadError.value = ''
    const data = await getImagePresets()
    tenantPresets.value = data.tenant || []
    userPresets.value = data.user || []
    console.log('[ImageNode] 图像预设已加载:', { tenant: tenantPresets.value.length, user: userPresets.value.length })
  } catch (error) {
    presetLoadError.value = error.message || '图像预设加载失败'
    tenantPresets.value = []
    userPresets.value = []
    console.error('[ImageNode] 加载图像预设失败:', error)
  }
}

// 可用预设列表
const availablePresets = computed(() => {
  const presets = []

  // 1. 添加"无预设"选项
  presets.push({
    id: '',
    name: '无预设',
    prompt: '',
    type: 'none',
    pointsCost: 0
  })

  if (presetLoadError.value) {
    presets.push({
      id: 'preset-load-error',
      name: '预设加载失败',
      description: presetLoadError.value,
      type: 'error'
    })
  }

  // 2. 添加租户全局预设
  if (tenantPresets.value.length > 0) {
    presets.push(...tenantPresets.value.map(p => {
      const pointsCost = normalizePresetPointsCost(p.pointsCost ?? p.points_cost)
      return {
        id: `tenant-${p.id}`,
        name: formatPresetOptionName(p.name, pointsCost),
        prompt: p.prompt,
        description: p.description,
        type: 'tenant-global',
        pointsCost,
        _rawId: p.id
      }
    }))
  }

  // 3. 添加用户自定义预设
  if (userPresets.value.length > 0) {
    presets.push({ id: 'divider-user', type: 'divider', label: '我的预设' })
    presets.push(...userPresets.value.map(p => ({
      id: `user-${p.id}`,
      name: `📝 ${p.name}`,
      prompt: p.prompt,
      description: p.description,
      type: 'user-custom',
      pointsCost: 0,
      _rawId: p.id
    })))
  }

  // 4. 添加临时自定义（如果正在使用）
  if (selectedPreset.value === 'temp-custom') {
    if (presets.length > 0) {
      presets.push({ id: 'divider-temp', type: 'divider' })
    }
    presets.push({
      id: 'temp-custom',
      name: '📌 临时自定义',
      type: 'temp-custom',
      pointsCost: 0
    })
  }

  // 5. 添加操作选项
  presets.push({ id: 'divider-actions', type: 'divider' })
  presets.push({
    id: 'action-new',
    name: '➕ 新建自定义预设',
    type: 'action'
  })
  presets.push({
    id: 'action-manage',
    name: '⚙️ 管理我的预设',
    type: 'action'
  })

  return presets
})

// 当前选中预设的显示名称
const selectedPresetLabel = computed(() => {
  if (!selectedPreset.value) {
    return '无预设'
  }

  // 检查是否是用户自定义预设
  if (selectedPreset.value.startsWith('user-')) {
    const userPreset = userPresets.value.find(p => `user-${p.id}` === selectedPreset.value)
    if (userPreset) return `📝 ${userPreset.name}`
  }

  // 检查是否是临时自定义
  if (selectedPreset.value === 'temp-custom') {
    return '📌 临时自定义'
  }

  const preset = availablePresets.value.find(p => p.id === selectedPreset.value)
  if (preset) return preset.name
  return props.data?.selectedPresetName || '无预设'
})

// 当前选中预设的提示词（用于拼接）
const currentPresetPrompt = computed(() => {
  if (!selectedPreset.value) return ''
  
  // 如果是临时自定义，返回临时提示词
  if (selectedPreset.value === 'temp-custom') {
    return tempCustomPrompt.value
  }
  
  const preset = availablePresets.value.find(p => p.id === selectedPreset.value)
  return preset?.prompt || props.data?.selectedPresetPrompt || ''
})

const selectedPresetPointsCost = computed(() => {
  if (!selectedPreset.value?.startsWith('tenant-')) return 0
  const preset = availablePresets.value.find(p => p.id === selectedPreset.value)
  return normalizePresetPointsCost(preset?.pointsCost ?? props.data?.selectedPresetPointsCost)
})

function buildSelectedPresetDataPatch(preset = null) {
  const resolvedPreset = preset || availablePresets.value.find(p => p.id === selectedPreset.value)
  const isTenantPreset = selectedPreset.value.startsWith('tenant-')
  const presetPrompt = selectedPreset.value === 'temp-custom'
    ? tempCustomPrompt.value
    : (resolvedPreset?.prompt || props.data?.selectedPresetPrompt || '')
  const presetName = selectedPreset.value === 'temp-custom'
    ? '📌 临时自定义'
    : (selectedPreset.value ? (resolvedPreset?.name || props.data?.selectedPresetName || '') : '')
  const presetType = selectedPreset.value === 'temp-custom'
    ? 'temp-custom'
    : (resolvedPreset?.type || props.data?.selectedPresetType || (selectedPreset.value ? 'snapshot' : 'none'))

  return {
    selectedPreset: selectedPreset.value,
    selectedPresetPrompt: presetPrompt,
    selectedPresetName: presetName,
    selectedPresetType: presetType,
    selectedPresetRawId: isTenantPreset ? (resolvedPreset?._rawId || '') : '',
    selectedPresetPointsCost: isTenantPreset ? normalizePresetPointsCost(resolvedPreset?.pointsCost ?? 0) : 0,
    tempCustomPrompt: selectedPreset.value === 'temp-custom' ? tempCustomPrompt.value : ''
  }
}

function persistSelectedPreset(presetId, preset = null) {
  selectedPreset.value = presetId || ''
  canvasStore.updateNodeData(props.id, buildSelectedPresetDataPatch(preset))
}

// 检测下拉菜单方向（基于元素位置和屏幕空间）
function checkDropdownDirection(element, dropdownHeight = 300) {
  if (!element) return true // 默认向上
  const rect = element.getBoundingClientRect()
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom
  // 如果下方空间足够或下方空间比上方大，则向下弹出
  return spaceBelow < dropdownHeight && spaceAbove > spaceBelow
}

// 切换预设下拉菜单
function togglePresetDropdown(event) {
  event?.stopPropagation()
  if (!isPresetDropdownOpen.value) {
    presetDropdownUp.value = checkDropdownDirection(presetSelectorRef.value, 350)
  }
  isPresetDropdownOpen.value = !isPresetDropdownOpen.value
  isModelDropdownOpen.value = false
}

// 选择预设
function selectPreset(presetId) {
  // 处理操作类型的选项
  if (presetId === 'action-new') {
    openImagePresetDialog()
    isPresetDropdownOpen.value = false
    return
  }

  if (presetId === 'action-manage') {
    openImagePresetManager()
    return
  }

  // 忽略分隔线
  if (presetId?.startsWith('divider-')) {
    return
  }

  const preset = availablePresets.value.find(p => p.id === presetId)
  if (!preset || preset.type === 'divider' || preset.type === 'error') return

  persistSelectedPreset(presetId, preset)
  isPresetDropdownOpen.value = false

  // 增加使用次数（异步，不等待）
  if (preset._rawId) {
    incrementPresetUseCount(preset._rawId)
  }

  console.log('[ImageNode] 已选择预设:', preset.name, '提示词:', preset.prompt)
}

// ========== 图像预设管理功能 ==========

// 打开自定义预设对话框（新建）
function openImagePresetDialog() {
  editingImagePreset.value = null
  showImagePresetDialog.value = true
}

// 打开自定义预设对话框（编辑）
function editImagePreset(preset) {
  editingImagePreset.value = preset
  showImagePresetDialog.value = true
  showImagePresetManager.value = false
}

// 提交图像预设（保存并使用）
async function handleImagePresetSubmit(data) {
  try {
    if (editingImagePreset.value) {
      // 更新现有预设
      const updatedPreset = await updateImagePreset(editingImagePreset.value.id, data)
      if (selectedPreset.value === `user-${updatedPreset.id}`) {
        persistSelectedPreset(selectedPreset.value, {
          ...updatedPreset,
          name: `📝 ${updatedPreset.name}`,
          type: 'user-custom'
        })
      }
      console.log('[ImageNode] 图像预设已更新')
    } else {
      // 创建新预设
      const result = await createImagePreset(data)
      console.log('[ImageNode] 图像预设已创建')

      // 自动选择新创建的预设
      persistSelectedPreset(`user-${result.id}`, {
        ...result,
        name: `📝 ${result.name}`,
        type: 'user-custom'
      })
    }

    // 重新加载预设列表
    await loadImagePresets()

    // 如果预设管理器打开，刷新它
    if (imagePresetManagerRef.value) {
      imagePresetManagerRef.value.loadPresets()
    }

    // 关闭对话框
    showImagePresetDialog.value = false
  } catch (error) {
    console.error('[ImageNode] 保存图像预设失败:', error)
    alert(error.message || '保存失败，请重试')
  }
}

// 临时使用自定义提示词（不保存）
function handleImagePresetTempUse(data) {
  tempCustomPrompt.value = data.prompt
  persistSelectedPreset('temp-custom', {
    id: 'temp-custom',
    name: '📌 临时自定义',
    prompt: tempCustomPrompt.value,
    type: 'temp-custom'
  })
  console.log('[ImageNode] 使用临时自定义提示词')
}

// 打开预设管理器
function openImagePresetManager() {
  showImagePresetManager.value = true
  isPresetDropdownOpen.value = false
}

// 从管理器中选择预设
function handlePresetSelect(preset) {
  persistSelectedPreset(`user-${preset.id}`, {
    ...preset,
    name: `📝 ${preset.name}`,
    type: 'user-custom'
  })
  showImagePresetManager.value = false
}

// ========== 相机控制功能 ==========

// 打开相机控制面板
function openCameraControl() {
  showCameraControl.value = true
}

// 处理相机控制保存
function handleCameraControlSave(settings) {
  cameraSettings.value = { ...settings }
  cameraControlEnabled.value = true
  showCameraControl.value = false
  canvasStore.updateNodeData(props.id, {
    cameraControlEnabled: true,
    cameraSettings: { ...settings },
    cameraPrompt: settings.prompt || ''
  })
  console.log('[ImageNode] 相机控制已保存:', settings)
}

// 关闭相机控制面板
function closeCameraControl() {
  showCameraControl.value = false
}

// 禁用相机控制
function disableCameraControl() {
  const emptyCameraSettings = defaultCameraSettings()
  cameraControlEnabled.value = false
  cameraSettings.value = emptyCameraSettings
  canvasStore.updateNodeData(props.id, {
    cameraControlEnabled: false,
    cameraSettings: emptyCameraSettings,
    cameraPrompt: null
  })
}

// 组件挂载时添加全局点击事件监听
// 🚀 性能优化：监听画布拖拽事件
function handleCanvasDragStart() {
  isCanvasDragging.value = true
}
function handleCanvasDragEnd() {
  isCanvasDragging.value = false
}

// 配置面板放大：把节点居中到视口中心，方便放大后查看
function centerNodeInViewport() {
  const nodeEl = nodeRef.value
  const paneEl = nodeEl?.closest?.('.vue-flow')
  if (!nodeEl || !paneEl || !getViewport || !setViewport) return

  const nodeRect = nodeEl.getBoundingClientRect()
  const paneRect = paneEl.getBoundingClientRect()
  const viewport = getViewport()
  const targetZoom = EXPANDED_CONFIG_PANEL_NODE_ZOOM
  const nodeCenterFlowX = (nodeRect.left - paneRect.left + nodeRect.width / 2 - viewport.x) / viewport.zoom
  const nodeCenterFlowY = (nodeRect.top - paneRect.top + nodeRect.height / 2 - viewport.y) / viewport.zoom

  setViewport({
    x: paneRect.width / 2 - nodeCenterFlowX * targetZoom,
    y: paneRect.height / 2 - nodeCenterFlowY * targetZoom,
    zoom: targetZoom
  }, { duration: 420 })
}

function toggleConfigPanelExpanded() {
  const nextExpanded = !isConfigPanelExpanded.value
  if (nextExpanded) {
    resetConfigPanelScale()
    centerNodeInViewport()
  }
  isConfigPanelExpanded.value = nextExpanded
  if (nextExpanded) {
    nextTick(() => {
      promptTextareaRef.value?.focus()
    })
  }
}

function collapseConfigPanel() {
  isConfigPanelExpanded.value = false
  resetConfigPanelScale()
}

function invalidateCanvasHistory() {
  window.dispatchEvent(new CustomEvent('canvas-history-invalidate', {
    detail: { source: 'image-node', nodeId: props.id }
  }))
}

function handleConfigPanelOutsideMouseDown(event) {
  if (!isConfigPanelExpanded.value) return
  if (configPanelRef.value?.contains(event.target)) return
  if (event.target.closest('.prompt-mention-popup')) return
  collapseConfigPanel()
}

function collectImageTaskOutputUrls(result) {
  const urls = []
  const pushUrl = (url) => {
    if (typeof url !== 'string') return
    const trimmed = url.trim()
    if (trimmed && !urls.includes(trimmed)) urls.push(trimmed)
  }

  pushUrl(getTaskMediaUrl(result, 'image'))
  pushUrl(result?.url)
  if (Array.isArray(result?.urls)) {
    result.urls.forEach(pushUrl)
  }
  if (Array.isArray(result?.images)) {
    result.images.forEach(item => {
      if (typeof item === 'string') pushUrl(item)
      else pushUrl(item?.url || item?.image_url || item?.outputUrl || item?.output_url)
    })
  }

  return urls
}

function normalizeExtraImageNodeUrls(items) {
  const urls = []
  const pushUrl = (url) => {
    if (typeof url !== 'string') return
    const trimmed = url.trim()
    if (trimmed && !urls.includes(trimmed)) urls.push(trimmed)
  }

  if (Array.isArray(items)) {
    items.forEach(item => {
      if (typeof item === 'string') pushUrl(item)
      else pushUrl(item?.url || item?.image_url || item?.outputUrl || item?.output_url)
    })
  }

  return urls.map(url => ({ url }))
}

function collectExtraImageNodeUrls(result, outputUrls = collectImageTaskOutputUrls(result)) {
  const extraUrls = []
  const pushUrl = (url) => {
    if (typeof url !== 'string') return
    const trimmed = url.trim()
    if (trimmed && trimmed !== outputUrls[0] && !extraUrls.includes(trimmed)) extraUrls.push(trimmed)
  }

  if (Array.isArray(result?._groupImageUrls)) {
    result._groupImageUrls.forEach(item => {
      if (typeof item === 'string') pushUrl(item)
      else pushUrl(item?.url || item?.image_url || item?.outputUrl || item?.output_url)
    })
  }

  outputUrls.slice(1).forEach(pushUrl)

  return extraUrls.map(url => ({ url }))
}

function hasExistingGroupImageNodes() {
  const groupNodeIds = Array.isArray(props.data?.groupNodeIds) ? props.data.groupNodeIds : []
  return groupNodeIds.some(nodeId => canvasStore.nodes.some(node => node.id === nodeId))
}

// 🔧 后台任务事件处理 - 统一使用 backgroundTaskManager 轮询，避免双重轮询导致页面卡顿
function handleBackgroundTaskComplete(event) {
  const { taskId, task } = event.detail
  // 只处理属于当前节点的任务
  if (task.nodeId !== props.id) return

  if (task.type !== 'image' && task.type !== 'image-hd' && task.type !== 'image-panorama') return
  
  console.log(`[ImageNode] 后台任务完成: ${taskId}`, task)

  if (task.type === 'image-hd' || task.type === 'image-panorama') {
    // 用 getTaskMediaUrl 全字段兜底（覆盖 data.url / data.output_url / images[]/outputs[] 等嵌套字段），
    // 避免后端实际生成完成、但因字段命名差异导致前端拿不到 URL 而误判失败。
    const imageUrl = getTaskMediaUrl(task.result, 'image') || task.result?.outputUrl || task.result?.url
    if (imageUrl) {
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        progress: null,
        output: { type: 'image', urls: [imageUrl] },
        pointsCost: task.result?.pointsCost || 0,
        ...(task.type === 'image-hd' ? { hdUpscaled: true } : { panoramaGenerated: true })
      })
      showToast(`${task.type === 'image-hd' ? '图片高清' : '全景图生成'}完成${task.result?.pointsCost > 0 ? `，消耗 ${formatPoints(task.result.pointsCost)} 积分` : ''}`, 'success')
    } else {
      canvasStore.updateNodeData(props.id, { status: 'error', error: task.type === 'image-hd' ? '高清完成但未获取到图片' : '全景图生成完成但未获取到图片' })
    }
    removeCompletedTask(taskId)
    return
  }
  
  // 获取主图URL（文生图/图生图）
  // 用 getTaskMediaUrl 兜底，确保能从嵌套字段（data.url / images[].url 等）抽到 URL，
  // 与 Canvas.vue / VideoNode 的提取逻辑保持一致。
  const outputUrls = collectImageTaskOutputUrls(task.result)
  if (outputUrls.length > 0) {
    canvasStore.updateNodeData(props.id, {
      status: 'success',
      output: { type: 'image', urls: [outputUrls[0]], url: outputUrls[0] }
    })
    invalidateCanvasHistory()
  } else {
    console.warn(`[ImageNode] 任务完成但无图片URL: ${taskId}`, task.result)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: '生成完成但未获取到图片'
    })
  }
  
  // 🔥 组图处理：为每张额外图片创建独立节点
  const extraImageUrls = collectExtraImageNodeUrls(task.result, outputUrls)
  if (extraImageUrls.length > 0 && !hasExistingGroupImageNodes()) {
    console.log(`[ImageNode] 组图生成完成，创建 ${extraImageUrls.length} 个额外节点`)
    createGroupImageNodes(extraImageUrls, task)
  }
  
  removeCompletedTask(taskId)
}

/**
 * 🔥 为组图的每张额外图片创建独立的画布节点
 */
function createGroupImageNodes(groupImageUrls, task) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  const normalizedGroupImageUrls = normalizeExtraImageNodeUrls(groupImageUrls)
  if (normalizedGroupImageUrls.length === 0) return
  
  const nodeWidth = 320
  const nodeGap = 40
  const startX = currentNode.position.x + nodeWidth + nodeGap
  const startY = currentNode.position.y
  
  const createdNodeIds = []
  
  for (let i = 0; i < normalizedGroupImageUrls.length; i++) {
    const { url } = normalizedGroupImageUrls[i]
    const newNodeId = `${props.id}_group_${i + 1}_${Date.now()}`
    
    const newNode = canvasStore.addNode({
      id: newNodeId,
      type: 'image',
      position: {
        x: startX + i * (nodeWidth + nodeGap),
        y: startY
      },
      data: {
        label: `组图 ${i + 2}`,
        status: 'success',
        model: selectedModel.value,
        aspectRatio: selectedAspectRatio.value,
        imageSize: imageSize.value,
        prompt: promptText.value,
        taskId: task.taskId,
        taskType: task.type || 'image',
        output: {
          type: 'image',
          urls: [url]
        }
      }
    })
    
    createdNodeIds.push(newNodeId)
    console.log(`[ImageNode] 组图节点 ${i + 2} 已创建 | ID: ${newNodeId} | URL: ${url?.substring(0, 60)}...`)
  }
  
  // 更新主节点的组图关联信息
  if (createdNodeIds.length > 0) {
    canvasStore.updateNodeData(props.id, {
      groupNodeIds: createdNodeIds,
      isGroupParent: true
    })
  }
}

function handleBackgroundTaskFailed(event) {
  const { taskId, task } = event.detail
  if (task.nodeId !== props.id) return

  if (task.type !== 'image' && task.type !== 'image-hd' && task.type !== 'image-panorama' && task.type !== 'image-cutout') return
  
  console.log(`[ImageNode] 后台任务失败: ${taskId}`, task)

  const outputUrls = task.type === 'image' ? collectImageTaskOutputUrls(task.result) : []
  if (outputUrls.length > 0) {
    canvasStore.updateNodeData(props.id, {
      status: 'success',
      error: null,
      progress: null,
      output: { type: 'image', urls: [outputUrls[0]], url: outputUrls[0] }
    })
    invalidateCanvasHistory()
    removeCompletedTask(taskId)
    return
  }

  if (task.type === 'image-hd' || task.type === 'image-panorama' || task.type === 'image-cutout') {
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      progress: null,
      error: task.error || (task.type === 'image-cutout' ? '抠图处理失败' : (task.type === 'image-panorama' ? '生成全景图失败' : '高清处理失败'))
    })
    showToast(task.error || (task.type === 'image-cutout' ? '图片抠图失败' : (task.type === 'image-panorama' ? '生成全景图失败，未扣除积分' : '图片高清失败，未扣除积分')), 'error')
    removeCompletedTask(taskId)
    return
  }
  
  const errorMsg = task.error || '图片生成失败'
  canvasStore.updateNodeData(props.id, {
    status: 'error',
    error: errorMsg
  })
  errorMessage.value = errorMsg
  
  removeCompletedTask(taskId)
}

function handleBackgroundTaskProgress(event) {
  const { taskId, task } = event.detail
  if (task.nodeId !== props.id) return

  if (task.type !== 'image' && task.type !== 'image-hd' && task.type !== 'image-panorama' && task.type !== 'image-cutout') return
  
  const progress = task.result?.progress || task.progress
  if (progress) {
    canvasStore.updateNodeData(props.id, {
      progress: task.type === 'image-hd'
        ? '高清处理中...'
        : (task.type === 'image-panorama'
          ? '全景图生成中...'
        : (task.type === 'image-cutout' ? '抠图处理中...' : (task.result?.status === 'processing' ? '生成中...' : progress))
        )
    })
  }
}

// 网络错误事件：BTM 连续多次轮询失败时触发，给节点显示"网络异常，重试中..."
// 而不是用户长时间看不到任何反馈。
function handleBackgroundTaskNetworkError(event) {
  const { task, message } = event.detail || {}
  if (!task || task.nodeId !== props.id) return
  if (task.type !== 'image' && task.type !== 'image-hd' && task.type !== 'image-panorama' && task.type !== 'image-cutout') return
  // 仅在节点仍处于生成中时覆盖 progress 文案；终态不打扰
  const currentStatus = props.data?.status
  if (currentStatus !== 'processing' && currentStatus !== 'pending') return
  canvasStore.updateNodeData(props.id, {
    progress: '网络异常，重试中...',
    _networkRetrying: true,
    _networkRetryMessage: message || '网络连接异常'
  })
}

// 网络恢复事件：BTM 再次轮询成功时触发，清掉重试中提示，恢复原 progress。
function handleBackgroundTaskNetworkRecovered(event) {
  const { task } = event.detail || {}
  if (!task || task.nodeId !== props.id) return
  if (task.type !== 'image' && task.type !== 'image-hd' && task.type !== 'image-panorama' && task.type !== 'image-cutout') return
  if (!props.data?._networkRetrying) return
  canvasStore.updateNodeData(props.id, {
    progress: task.type === 'image-hd' ? '高清处理中...' : (task.type === 'image-panorama' ? '全景图生成中...' : (task.type === 'image-cutout' ? '抠图处理中...' : '生成中...')),
    _networkRetrying: false,
    _networkRetryMessage: null
  })
}

// 检查并恢复已完成的后台任务
function checkAndRestoreBackgroundTasks() {
  const recoverableTaskId = props.data?.taskId
  const shouldReconnectServerTask = recoverableTaskId &&
    (props.data?.status === 'error' || props.data?.status === 'processing' || props.data?.status === 'pending') &&
    props.data?.extractedFromVideo !== true &&
    props.data?.sourceType !== 'multiangle' &&
    props.data?.localProcessing !== 'spot-heal'

  if (shouldReconnectServerTask) {
    const reconnectedTask = ensureTaskPolling({
      taskId: recoverableTaskId,
      type: props.data?.taskType || 'image',
      nodeId: props.id,
      tabId: canvasStore.getCurrentTab?.()?.id || canvasStore.activeTabId
    })
    if (reconnectedTask && (reconnectedTask.status === 'pending' || reconnectedTask.status === 'processing')) {
      canvasStore.updateNodeData(props.id, {
        status: 'processing',
        error: null,
        progress: props.data?.taskType === 'image-hd'
          ? '高清处理中...'
          : (props.data?.taskType === 'image-panorama'
            ? '全景图生成中...'
            : (props.data?.taskType === 'image-cutout' ? '抠图处理中...' : '生成中...'))
      })
    }
  }

  const nodeTasks = getTasksByNodeId(props.id)
  const ZOMBIE_THRESHOLD = 15 * 60 * 1000 // 15 分钟
  
  for (const task of nodeTasks) {
    if (task.type !== 'image' && task.type !== 'image-hd' && task.type !== 'image-panorama' && task.type !== 'image-cutout') continue
    
    if (task.status === 'completed') {
      const imageUrl = (task.type === 'image-hd' || task.type === 'image-panorama' || task.type === 'image-cutout')
        ? (getTaskMediaUrl(task.result, 'image') || task.result?.outputUrl || task.result?.url)
        : (getTaskMediaUrl(task.result, 'image') || task.result?.url || task.result?.urls?.[0])
      const outputUrls = task.type === 'image'
        ? collectImageTaskOutputUrls(task.result)
        : (imageUrl ? [imageUrl] : [])
      if (outputUrls.length > 0) {
        canvasStore.updateNodeData(props.id, {
          status: 'success',
          progress: null,
          output: { type: 'image', urls: [outputUrls[0]], url: outputUrls[0] },
          ...(task.type === 'image-hd' ? { hdUpscaled: true, pointsCost: task.result?.pointsCost || 0 } : {}),
          ...(task.type === 'image-panorama' ? { panoramaGenerated: true, pointsCost: task.result?.pointsCost || 0 } : {}),
          ...(task.type === 'image-cutout' ? { cutoutResult: true, isTransparent: task.result?.isTransparent, cutoutBgType: task.result?.bgType } : {})
        })
        const extraImageUrls = task.type === 'image'
          ? collectExtraImageNodeUrls(task.result, outputUrls)
          : []
        if (extraImageUrls.length > 0 && !hasExistingGroupImageNodes()) {
          console.log(`[ImageNode] 恢复组图任务，创建 ${extraImageUrls.length} 个额外节点`)
          createGroupImageNodes(extraImageUrls, task)
        }
      } else {
        canvasStore.updateNodeData(props.id, {
          status: 'error',
          error: task.type === 'image-hd' ? '高清完成但未获取到图片' : (task.type === 'image-panorama' ? '全景图生成完成但未获取到图片' : (task.type === 'image-cutout' ? '抠图完成但未获取到图片' : '生成完成但未获取到图片'))
        })
      }
      removeCompletedTask(task.taskId)
    } else if (task.status === 'failed') {
      canvasStore.updateNodeData(props.id, {
        status: 'error',
        error: task.error || (task.type === 'image-hd' ? '高清处理失败' : (task.type === 'image-panorama' ? '生成全景图失败' : (task.type === 'image-cutout' ? '抠图处理失败' : '图片生成失败')))
      })
      removeCompletedTask(task.taskId)
    } else if ((task.status === 'processing' || task.status === 'pending') && task.createdAt) {
      if (task.type === 'image-hd' || task.type === 'image-panorama' || task.type === 'image-cutout') continue
      const taskAge = Date.now() - task.createdAt
      if (taskAge > ZOMBIE_THRESHOLD) {
        console.log(`[ImageNode] 检测到僵尸任务 ${task.taskId} (${Math.round(taskAge/60000)}分钟), 标记失败`)
        task.status = 'failed'
        task.error = '任务超时，请重试'
        canvasStore.updateNodeData(props.id, {
          status: 'error',
          error: '任务超时，请重试'
        })
        removeCompletedTask(task.taskId)
      }
    }
  }
  
  // 如果节点状态是 processing 但没有任何关联的后台任务，说明轮询丢失了
  // 多角度生成节点有独立轮询机制（pollMultiangleTask），不走 backgroundTaskManager
  if (props.data?.status === 'processing' && props.data?.extractedFromVideo !== true && props.data?.sourceType !== 'multiangle' && props.data?.localProcessing !== 'spot-heal' && props.data?.taskType !== 'image-hd' && props.data?.taskType !== 'image-panorama' && props.data?.taskType !== 'image-cutout' && nodeTasks.filter(t => (t.type === 'image' || t.type === 'image-hd' || t.type === 'image-panorama' || t.type === 'image-cutout') && (t.status === 'processing' || t.status === 'pending')).length === 0) {
    console.log(`[ImageNode] 节点 ${props.id} 状态为 processing 但无关联任务, 重置为 error`)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: '任务丢失，请重新生成'
    })
  }
}

onMounted(() => {
  nodeGeometryDisposed = false
  elapsedTimeTimer = setInterval(() => {
    elapsedTimeNow.value = Date.now()
  }, 1000)
  document.addEventListener('click', handleModelDropdownClickOutside)
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('mousedown', handleConfigPanelOutsideMouseDown)
  document.addEventListener('keydown', handlePreviewKeydown, true)
  // 加载图像预设
  loadImagePresets()
  // 📊 模型成功率統計已由 modelStatsStore 集中管理（10 分鐘輪詢）
  // 初始化时调整文本框高度（如果有预设文本）
  nextTick(() => {
    autoResizeTextarea()
    scheduleNodeInternalsUpdate()
  })
  if (typeof ResizeObserver !== 'undefined') {
    nodeGeometryObserver = new ResizeObserver(() => {
      scheduleNodeInternalsUpdate()
    })
    if (nodeWrapperRef.value) {
      nodeGeometryObserver.observe(nodeWrapperRef.value)
    }
  }
  // 🚀 性能优化：监听画布拖拽事件
  window.addEventListener('canvas-drag-start', handleCanvasDragStart)
  window.addEventListener('canvas-drag-end', handleCanvasDragEnd)
  
  // 🔧 监听后台任务事件 - 避免双重轮询
  window.addEventListener('background-task-complete', handleBackgroundTaskComplete)
  window.addEventListener('background-task-failed', handleBackgroundTaskFailed)
  window.addEventListener('background-task-progress', handleBackgroundTaskProgress)
  window.addEventListener('background-task-network-error', handleBackgroundTaskNetworkError)
  window.addEventListener('background-task-network-recovered', handleBackgroundTaskNetworkRecovered)
  
  // 检查是否有已完成的后台任务需要恢复
  checkAndRestoreBackgroundTasks()
})

// 组件卸载时移除监听
onUnmounted(() => {
  nodeGeometryDisposed = true
  nodeInternalsUpdateQueued = false
  if (elapsedTimeTimer) {
    clearInterval(elapsedTimeTimer)
    elapsedTimeTimer = null
  }
  document.removeEventListener('click', handleModelDropdownClickOutside)
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('mousedown', handleConfigPanelOutsideMouseDown)
  document.removeEventListener('keydown', handlePreviewKeydown, true)
  if (nodeGeometryObserver) {
    nodeGeometryObserver.disconnect()
    nodeGeometryObserver = null
  }
  if (nodeInternalsUpdateRaf) {
    cancelAnimationFrame(nodeInternalsUpdateRaf)
    nodeInternalsUpdateRaf = null
  }
  // 🚀 性能优化：移除画布拖拽事件监听
  window.removeEventListener('canvas-drag-start', handleCanvasDragStart)
  window.removeEventListener('canvas-drag-end', handleCanvasDragEnd)
  
  // 🔧 移除后台任务事件监听
  window.removeEventListener('background-task-complete', handleBackgroundTaskComplete)
  window.removeEventListener('background-task-failed', handleBackgroundTaskFailed)
  window.removeEventListener('background-task-progress', handleBackgroundTaskProgress)
  window.removeEventListener('background-task-network-error', handleBackgroundTaskNetworkError)
  window.removeEventListener('background-task-network-recovered', handleBackgroundTaskNetworkRecovered)
  
})

// 检查是否有图片输入（用于判断文生图/图生图模式）
const hasImageInput = computed(() => {
  if (props.data?.sourceImages?.length > 0) return true

  const upstreamEdges = canvasStore.edgesByTarget.get(props.id) || []
  const nodeIndex = canvasStore.nodesById

  for (const edge of upstreamEdges) {
    const sourceNode = nodeIndex.get(edge.source)
    if (!sourceNode) continue

    const hasOutput = sourceNode.data?.output?.urls?.length > 0 ||
                      sourceNode.data?.output?.url ||
                      sourceNode.data?.sourceImages?.length > 0
    if (hasOutput) return true

    if (sourceNode.type === 'image' || sourceNode.type === 'imageGeneration') {
      return true
    }
  }
  return false
})

// 用于 botType 显示判断：检查是否有实际的参考图片
const hasReferenceImages = computed(() => {
  if (props.data?.sourceImages?.length > 0) return true

  const upstreamEdges = canvasStore.edgesByTarget.get(props.id) || []
  const nodeIndex = canvasStore.nodesById

  for (const edge of upstreamEdges) {
    const node = nodeIndex.get(edge.source)
    if (!node?.data) continue

    if (node.data.output?.urls?.length > 0 ||
        node.data.output?.url ||
        node.data.sourceImages?.length > 0) {
      return true
    }
  }
  return false
})

// 可用选项 - 从配置动态获取，支持新增模型自动同步，根据是否有参考图片过滤
const models = computed(() => {
  // 只有真正有图片输入时才是图生图模式，文本输入仍然是文生图模式
  const currentMode = hasImageInput.value ? 'i2i' : 't2i'
  return getAvailableImageModels(currentMode)
})

const selectedModelConfig = computed(() => {
  return models.value.find(m => m.value === selectedModel.value) || null
})

const selectedModelLabel = computed(() => {
  return selectedModelConfig.value?.label || selectedModel.value
})

const selectedModelIcon = computed(() => {
  return selectedModelConfig.value?.icon || '▶'
})

// 历史工作流只读预览可能引用当前租户未启用的旧模型，补一个兼容配置避免只读链路误报 warning
const modelLookupList = computed(() => {
  const currentModels = models.value || []
  const currentSelection = selectedModel.value
  if (!currentSelection || currentModels.some(m => m.value === currentSelection)) {
    return currentModels
  }

  return [
    {
      value: currentSelection,
      label: getModelDisplayName(currentSelection, 'image') || currentSelection,
      description: '历史工作流模型（当前租户未启用）',
      hasResolutionPricing: false,
      pointsCost: 1,
      supportedModes: 'both',
      isLegacyPreviewModel: true
    },
    ...currentModels
  ]
})

// 判断当前模型是否是 wan2.7 系列（通义万相）
const isWan27Model = computed(() => {
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  const apiType = currentModel?.apiType || ''
  const modelName = selectedModel.value?.toLowerCase() || ''
  return apiType === 'dashscope' || apiType === 'wan2.7-image' || modelName.includes('wan2.7')
})

// 判断当前模型是否是 MJ 类型（通过模型名称判断，更可靠）
const isMJModel = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  // 匹配 mjv7、midjourney-vector、mjvector 等 MJ 相关模型
  const isMJ = modelName.includes('mjv7') || 
               modelName.includes('midjourney') || 
               modelName.includes('mjvector') ||
               modelName.includes('mj-')
  return isMJ
})

// 辅助函数：检查是否是 Seedream 5.0 Lite 模型
function checkIsSeedream50Lite(model) {
  if (!model) return false
  const modelName = (model.name || model.label || model.value || '').toLowerCase()
  const modelValue = (model.value || '').toLowerCase()
  const actualModel = (model.actualModel || '').toLowerCase()
  const searchText = `${modelName} ${modelValue} ${actualModel}`
  return searchText.includes('seedream-5.0') || searchText.includes('seedream-5-0') || searchText.includes('5-0-260128')
}

// 辅助函数：检查是否是 Seedream 4.5 模型（包括即梦4.5/jimeng-4.5）
function checkIsSeedream45(model) {
  if (!model) return false
  
  const apiType = (model.apiType || '').toLowerCase()
  const modelName = (model.name || model.label || model.value || '').toLowerCase()
  const modelValue = (model.value || '').toLowerCase()
  
  // 合并所有可能的文本字段进行搜索
  const searchText = `${apiType} ${modelName} ${modelValue}`.toLowerCase()
  
  // 检查是否是 seedream 类型（放宽条件：即使 apiType 不是 seedream，只要名称包含 seedream 也识别）
  const isSeedream = apiType === 'seedream' || searchText.includes('seedream')
  
  // 如果明确包含"即梦"或"jimeng"，也认为是 seedream 类型
  const hasJimengKeyword = searchText.includes('即梦') || searchText.includes('jimeng')
  
  if (!isSeedream && !hasJimengKeyword) {
    return false
  }
  
  // 检查是否是 4.5 版本
  // 支持多种命名方式：seedream-4.5, seedream4.5, 即梦4.5, 即梦, jimeng-4.5, jimeng4.5 等
  // 如果包含"即梦"或"jimeng"，默认认为是 4.5 版本
  const isSeedream45 = (
    searchText.includes('seedream-4.5') || 
    searchText.includes('seedream4.5') ||
    searchText.includes('4.5') ||
    hasJimengKeyword  // 包含"即梦"或"jimeng"就认为是 4.5
  )
  
  return isSeedream45
}

// 检测是否是 Seedream 4.5 模型（组图生成仅对 Seedream 4.5 有效）
const isSeedream45Model = computed(() => {
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  const result = checkIsSeedream45(currentModel)
  
  // 详细调试信息
  if (currentModel) {
    const modelText = `${selectedModel.value} ${currentModel.label || ''} ${currentModel.name || ''}`.toLowerCase()
    const shouldLog = result || modelText.includes('seedream') || modelText.includes('即梦') || modelText.includes('jimeng')
    
    if (shouldLog) {
      console.log('[ImageNode] 🔍 模型识别调试:', {
        selectedModel: selectedModel.value,
        modelValue: currentModel.value,
        modelName: currentModel.name,
        modelLabel: currentModel.label,
        apiType: currentModel.apiType,
        isSeedream45: result,
        checkResult: checkIsSeedream45(currentModel),
        allModelData: currentModel
      })
    }
  }

  return result
})

// Seedream 高级选项显示控制
const showSeedreamAdvancedOptions = ref(false)

// 检测是否是 Seedream 5.0 Lite 模型
const isSeedream50LiteModel = computed(() => {
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  return checkIsSeedream50Lite(currentModel)
})

// 限制 maxGroupImages 在 2-10 之间
watch(maxGroupImages, (newVal) => {
  if (newVal < 2) {
    maxGroupImages.value = 2
  } else if (newVal > 10) {
    maxGroupImages.value = 10
  }
})

// 默认尺寸选项配置（当模型配置中没有指定积分时使用）
const defaultSizePricing = { '1K': 3, '2K': 4, '4K': 5 }

// 获取当前模型的尺寸选项（从模型配置中读取积分）
const imageSizes = computed(() => {
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  const pointsCost = currentModel?.pointsCost
  const apiType = currentModel?.apiType
  const resolutionEnabled = currentModel?.resolutionEnabled || {}

  // Seedream 5.0 只支持 2K 和 3K
  const isSeedream50 = checkIsSeedream50Lite(currentModel)
  // Seedream 4.5（包括即梦4.5/jimeng-4.5）不支持 1K，只支持 2K 和 4K
  const isSeedream45 = checkIsSeedream45(currentModel)
  // wan2.7 图生图模式不支持 4K，只支持 1K 和 2K
  const isWan27I2I = isWan27Model.value && hasImageInput.value
  let supportedSizes = isSeedream50
    ? ['2K', '3K']
    : isSeedream45
      ? ['2K', '4K']
      : isWan27I2I
        ? ['1K', '2K']
        : ['1K', '2K', '4K']

  // 根据 9000 端口的 resolutionEnabled 配置过滤尺寸选项
  if (Object.keys(resolutionEnabled).length > 0) {
    supportedSizes = supportedSizes.filter(size => {
      const key = size.toLowerCase()
      const enabled = resolutionEnabled[key] ?? resolutionEnabled[size]
      // 显式设为 false 时隐藏，未配置或为 true 时保留
      return enabled !== false
    })
  }

  // 如果是按分辨率计费且 pointsCost 是对象
  if (currentModel?.hasResolutionPricing && typeof pointsCost === 'object') {
    return supportedSizes.map(size => ({
      value: size,
      label: size,
      points: pointsCost[size.toLowerCase()] || pointsCost[size] || defaultSizePricing[size]
    }))
  }

  // 默认尺寸配置
  return supportedSizes.map(size => ({
    value: size,
    label: size,
    points: defaultSizePricing[size]
  }))
})

// 是否显示尺寸选项（从模型配置中读取 hasResolutionPricing）
const showResolutionOption = computed(() => {
  if (isMJModel.value) return false
  if (imageSizes.value.length === 0) return false
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  return currentModel?.hasResolutionPricing || (currentModel?.pointsCost && typeof currentModel.pointsCost === 'object') || false
})

const showQualityOption = computed(() => {
  return false
})

// 是否显示预设选项（MJ模型时隐藏，因为不起作用）
const showPresetOption = computed(() => {
  return !isMJModel.value
})

// 是否显示摄影机控制选项（所有模型都支持，包括 MJ 模型）
const showCameraControlOption = computed(() => {
  return true
})

const aspectRatios = [
  { value: 'auto', label: 'Auto (自动)' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '21:9', label: '21:9' }
]

const availableImageAspectRatios = computed(() => {
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  const configuredRatios = Array.isArray(currentModel?.aspectRatios)
    ? currentModel.aspectRatios.map(ratio => typeof ratio === 'string' ? ratio : ratio?.value).filter(Boolean)
    : []
  if (configuredRatios.length === 0) return aspectRatios
  const configuredSet = new Set(configuredRatios)
  const filtered = aspectRatios.filter(ratio => configuredSet.has(ratio.value))
  return filtered.length > 0 ? filtered : aspectRatios
})

// 监听模型变化，如果模型不支持1K且当前选择1K，自动切换到2K
watch([selectedModel, imageSizes, availableImageAspectRatios], () => {
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  const apiType = currentModel?.apiType
  
  // Seedream 4.5（包括即梦4.5/jimeng-4.5）不支持 1K，如果当前选择1K，自动切换到2K
  const isSeedream45 = checkIsSeedream45(currentModel)
  if (isSeedream45 && imageSize.value === '1K') {
    imageSize.value = '2K'
    console.log('[ImageNode] Seedream 4.5 不支持 1K，已自动切换到 2K')
  }
  
  // 如果当前选择的尺寸不在可用尺寸列表中，切换到第一个可用尺寸
  const availableSizes = imageSizes.value.map(s => s.value)
  if (!availableSizes.includes(imageSize.value)) {
    imageSize.value = availableSizes[0] || '2K'
    console.log('[ImageNode] 当前尺寸不可用，已切换到:', imageSize.value)
  }

  const availableRatios = availableImageAspectRatios.value.map(ratio => ratio.value)
  if (!availableRatios.includes(selectedAspectRatio.value)) {
    selectedAspectRatio.value = availableRatios[0] || '1:1'
    console.log('[ImageNode] 当前比例不可用，已切换到:', selectedAspectRatio.value)
  }
}, { immediate: true })

// 计算单次积分消耗（不考虑组图和批次）
const basePointsCost = computed(() => {
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  
  // 按分辨率计费的模型
  if (currentModel?.hasResolutionPricing) {
    const sizeOption = imageSizes.value.find(s => s.value === imageSize.value)
    return sizeOption?.points || defaultSizePricing['1K']
  }
  
  // 其他模型使用固定积分
  const pointsCost = currentModel?.pointsCost
  // 如果 pointsCost 是数字则直接使用，否则默认为 1
  return typeof pointsCost === 'number' ? pointsCost : 1
})

// 计算当前积分消耗（考虑组图和批次）
const currentPointsCost = computed(() => {
  const groupCount = enableGroupGeneration.value && isSeedream45Model.value
    ? Math.max(2, Math.min(10, maxGroupImages.value || 3))
    : 1
  const presetPointsCost = selectedPresetPointsCost.value
  const outputCount = groupCount * selectedCount.value

  return roundPoints((basePointsCost.value + presetPointsCost) * outputCount)
})

// 节点尺寸
const nodeWidth = ref(props.data.width || 380)
const nodeHeight = ref(props.data.height || 320)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })
// 用于 resize 节流的 requestAnimationFrame ID
let resizeRafId = null

// 节点样式类
// 是否只有单张输出图片
const hasSingleOutput = computed(() => {
  return hasOutput.value && outputImages.value.length === 1
})

const nodeClass = computed(() => ({
  'canvas-node': true,
  'image-node': true,
  'selected': props.selected,
  'processing': props.data.status === 'processing',
  'success': props.data.status === 'success',
  'error': props.data.status === 'error',
  'resizing': isResizing.value,
  'is-source-node': isSourceNode.value, // 是否为源节点（上传的图片）
  'has-single-output': hasSingleOutput.value && props.data.status !== 'processing' // 是否只有单张输出（无边框显示）
}))

// 节点内容样式
// 注意：源节点和单图输出节点不使用 minHeight，让边框自适应图片尺寸
const contentStyle = computed(() => {
  const isSourceOrSingleOutput = (isSourceNode.value || hasSingleOutput.value) && props.data.status !== 'processing'
  return {
    width: `${nodeWidth.value}px`,
    // 源节点和单图输出节点不设置 minHeight，让高度自适应图片
    ...(isSourceOrSingleOutput ? {} : { minHeight: `${nodeHeight.value}px` })
  }
})

// 判断是否为源节点（只显示上传的图片，不显示配置面板）
const isSourceNode = computed(() => {
  return props.data.nodeRole === 'source'
})

// 判断是否来自历史记录或资产（不显示上传按钮）
const isFromHistoryOrAsset = computed(() => {
  return props.data.fromHistory === true || props.data.fromAsset === true
})

// 判断是否有上游连接（用于显示输出状态而非快捷操作）
// 动态检查是否真的有上游连接边，而不是依赖存储的状态
const hasUpstream = computed(() => {
  // 检查是否有连接到当前节点的边
  const hasIncomingEdge = canvasStore.edges.some(edge => edge.target === props.id)
  return hasIncomingEdge
})

// 继承的提示词（来自文本节点）
const inheritedPrompt = computed(() => {
  if (props.data.inheritedData?.type === 'text') {
    return props.data.inheritedData.content || ''
  }
  return ''
})

// 是否有输出（生成结果）
const hasOutput = computed(() => 
  props.data.output?.urls?.length > 0 || props.data.output?.url
)

// 是否有上传的图片（源图）
const hasSourceImage = computed(() => 
  props.data.sourceImages?.length > 0
)

// 是否有数据丢失（旧格式迁移时 blob URL 失效）
const hasDataLost = computed(() => props.data._dataLost === true)
const dataLostReason = computed(() => props.data._lostReason || '本地临时文件已失效')

// 是否正在上传中
const isUploading = computed(() => props.data.isUploading === true)

// 是否上传失败
const uploadFailed = computed(() => props.data.uploadFailed === true)

// ========== 图片工具栏相关 ==========
// 拖动和缩放状态
const isDragging = ref(false)

// 拖动检测相关
const isMouseDown = ref(false) // 是否在节点上按下了鼠标
const dragStartPos = ref({ x: 0, y: 0 })
const hasMoved = ref(false)
const DRAG_THRESHOLD = 5 // 移动超过5px才算拖动

// 是否显示工具栏（单独选中且有图片内容）- 与 TextNode 保持一致
// 使用 store 中的选中状态作为备选，确保响应及时
const showToolbar = computed(() => {
  if (props.data?.readonly) return false
  // 优先使用 props.selected，同时检查 store 中的选中状态
  const isSelected = props.selected || canvasStore.selectedNodeId === props.id
  if (!isSelected) return false
  // 检查是否多选（使用 Vue Flow 或 store 的状态）
  const isMultiSelect = getSelectedNodes.value.length > 1 || canvasStore.selectedNodeIds.length > 1
  if (isMultiSelect) return false
  return hasOutput.value || hasSourceImage.value
})

// 是否显示底部配置面板 - 与 TextNode 保持一致，单独选中即显示
// 修改：源节点也显示配置面板，以便添加参考图片
// 使用 store 中的选中状态作为备选，确保响应及时
const showConfigPanel = computed(() => {
  // 优先使用 props.selected，同时检查 store 中的选中状态
  const isSelected = props.selected || canvasStore.selectedNodeId === props.id
  if (!isSelected) return false
  // 检查是否多选（使用 Vue Flow 或 store 的状态）
  const isMultiSelect = getSelectedNodes.value.length > 1 || canvasStore.selectedNodeIds.length > 1
  return !isMultiSelect
})

watch(showConfigPanel, (val) => {
  if (!val) {
    showMentionPopup.value = false
    isConfigPanelExpanded.value = false
  }
})


// 获取当前图片URL（用于工具栏操作）
const currentImageUrl = computed(() => {
  if (props.data?.nodeRole === 'source' && hasSourceImage.value) {
    return sourceImages.value[0]
  }
  if (hasOutput.value) {
    return outputImages.value[0]
  }
  if (hasSourceImage.value) {
    return sourceImages.value[0]
  }
  return null
})

function getCanvasNodeSwitchImageUrl(node) {
  const data = node?.data || {}
  if (data.nodeRole === 'source' && Array.isArray(data.sourceImages) && data.sourceImages[0]) return data.sourceImages[0]
  if (Array.isArray(data.output?.urls) && data.output.urls[0]) return data.output.urls[0]
  if (data.output?.url) return data.output.url
  if (Array.isArray(data.sourceImages) && data.sourceImages[0]) return data.sourceImages[0]
  if (data.imageUrl) return data.imageUrl
  if (data.url) return data.url
  return null
}

const canvasPreviewImages = computed(() => {
  const imageNodeTypes = new Set(['image', 'image-input', 'image-gen', 'text-to-image', 'image-to-image', 'grid-preview'])
  return canvasStore.nodes
    .filter(node => imageNodeTypes.has(node?.type) || node?.data?.type === 'image')
    .map(node => ({
      id: node.id,
      url: getCanvasNodeSwitchImageUrl(node)
    }))
    .filter(item => Boolean(item.url))
})

const seedanceFeaturesEnabled = computed(() => isSeedanceFeaturesEnabled())
const isQuickSeedanceSubmitting = ref(false)
const seedanceQuickAssetStatus = computed(() => getSeedanceQuickAssetStatus(props.data))
const showSeedanceQuickBadge = computed(() => seedanceQuickAssetStatus.value === 'approved' || seedanceQuickAssetStatus.value === 'expired')
const seedanceQuickBadgeText = computed(() => seedanceQuickAssetStatus.value === 'expired' ? '已失效' : '已过审')

async function resolveQuickSeedanceImageUrl(rawUrl) {
  const url = getOriginalImageUrl(rawUrl)
  if (!url) throw new Error('未找到图片')
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`读取本地图片失败: ${response.status}`)
    const blob = await response.blob()
    const file = new File([blob], `seedance_quick_${Date.now()}.png`, { type: blob.type || 'image/png' })
    const uploaded = await uploadImages([file])
    if (!uploaded?.[0]) throw new Error('上传图片失败')
    return uploaded[0]
  }
  return url
}

function updateSeedanceQuickAsset(partial) {
  canvasStore.updateNodeData(props.id, {
    seedanceQuickAsset: {
      ...(props.data.seedanceQuickAsset || {}),
      ...partial
    }
  })
}

async function getQuickSeedanceProviderType() {
  const result = await listAssetGroups({ pageSize: 1 })
  return result.activeProvider || ''
}

async function handleQuickSeedanceReview() {
  if (isQuickSeedanceSubmitting.value) return
  if (!currentImageUrl.value) {
    showToast('未找到图片', 'warning')
    return
  }
  if (seedanceQuickAssetStatus.value === 'approved') {
    showToast('该图片已过审，可直接连接 Seedance 2.0 视频节点使用', 'info')
    return
  }

  isQuickSeedanceSubmitting.value = true
  try {
    const url = await resolveQuickSeedanceImageUrl(currentImageUrl.value)
    const spaceParams = teamStore.getSpaceParams('current')
    const providerType = await getQuickSeedanceProviderType()
    const result = await createQuickSeedanceCharacterAsset({
      URL: url,
      Name: `Seedance快捷角色_${props.id || Date.now()}`,
      sourceNodeId: props.id || null,
      providerType,
      spaceType: spaceParams.spaceType,
      teamId: spaceParams.teamId
    })

    const assetId = result.quickAsset?.assetId || result.asset?.Id || result.Id
    if (!assetId) throw new Error('快捷资产接口返回数据异常')
    const quickProviderType = result.quickAsset?.providerType
    const isQuickOpenApiPro = quickProviderType === 'seedance_openapi_pro' || quickProviderType === 'bytefor'
    const initialFaceCode = result.quickAsset?.faceCode || result.asset?.FaceCode || result.asset?.faceCode || assetId

    updateSeedanceQuickAsset({
      assetId,
      assetUri: result.quickAsset?.assetUri || (isQuickOpenApiPro ? `face:${initialFaceCode}` : `asset://${assetId}`),
      groupId: result.quickAsset?.groupId || result.asset?.GroupId,
      status: result.quickAsset?.status || 'Processing',
      providerType: quickProviderType,
      faceCode: isQuickOpenApiPro ? initialFaceCode : undefined,
      assetUrl: result.asset?.URL || url,
      reviewedAt: null,
      expiresAt: result.quickAsset?.expiresAt,
      ttlDays: result.quickAsset?.ttlDays || 15
    })
    showToast('已提交 Seedance 角色过审，审核通过后会标记“已过审”', 'info')

    const { promise } = pollAssetStatus(assetId, { interval: 5000, timeout: 2700000, providerType })
    promise.then((finalAsset) => {
      const finalFaceCode = finalAsset.FaceCode || finalAsset.faceCode || initialFaceCode
      updateSeedanceQuickAsset({
        assetId: finalAsset.Id || assetId,
        assetUri: isQuickOpenApiPro ? `face:${finalFaceCode}` : `asset://${finalAsset.Id || assetId}`,
        groupId: finalAsset.GroupId || result.quickAsset?.groupId || result.asset?.GroupId,
        status: finalAsset.Status || 'Active',
        providerType: quickProviderType,
        faceCode: isQuickOpenApiPro ? finalFaceCode : undefined,
        assetUrl: finalAsset.URL || url,
        reviewedAt: new Date().toISOString(),
        expiresAt: result.quickAsset?.expiresAt
      })
      if ((finalAsset.Status || 'Active') === 'Active') {
        showToast('Seedance 角色已过审', 'success')
      }
    }).catch((error) => {
      console.error('[ImageNode] Seedance 快捷过审轮询失败:', error)
      updateSeedanceQuickAsset({ status: 'Processing' })
      showToast(error.message?.includes('超时') ? 'Seedance 角色仍在审核中' : `Seedance 角色过审失败：${error.message || '未知错误'}`, error.message?.includes('超时') ? 'info' : 'error')
    })
  } catch (error) {
    console.error('[ImageNode] Seedance 快捷过审失败:', error)
    showToast(`提交 Seedance 过审失败：${error.message || '未知错误'}`, 'error')
  } finally {
    isQuickSeedanceSubmitting.value = false
  }
}

// 全景 VR 预览状态
const showPanoramaPreview = ref(false)
const isPanoramaCandidate = ref(false)
let panoramaDimensionRequestId = 0

async function detectPanoramaImage(url) {
  const requestId = ++panoramaDimensionRequestId
  isPanoramaCandidate.value = false
  if (!url) return

  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const loadUrl = getSmartImageUrl(url)
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = loadUrl
    })
    if (requestId !== panoramaDimensionRequestId) return
    isPanoramaCandidate.value = isPanoramaVrSupportedRatio(img.naturalWidth, img.naturalHeight)
    img.src = ''
  } catch (error) {
    if (requestId === panoramaDimensionRequestId) {
      console.warn('[ImageNode] 全景图尺寸检测失败:', error)
      isPanoramaCandidate.value = false
    }
  }
}

function openPanoramaPreview() {
  if (!currentImageUrl.value || !isPanoramaCandidate.value) return
  showPanoramaPreview.value = true
}

function closePanoramaPreview() {
  showPanoramaPreview.value = false
}

function resolvePanoramaImageUrl(url) {
  return getSmartImageUrl(url)
}

// 工具栏预览弹窗
const showPreviewModal = ref(false)
const previewImageUrl = ref('')
const previewNodeId = ref('')
const showImageEditMenu = ref(false)

// 预览缩放和拖动状态
const previewScale = ref(1)
const previewPosition = ref({ x: 0, y: 0 })
const previewIsDragging = ref(false)
const previewDragStart = ref({ x: 0, y: 0 })
const previewLastPosition = ref({ x: 0, y: 0 })

const currentCanvasPreviewIndex = computed(() => {
  if (!previewNodeId.value) return -1
  return canvasPreviewImages.value.findIndex(item => item.id === previewNodeId.value)
})

const canPreviewPreviousCanvasImage = computed(() => currentCanvasPreviewIndex.value > 0)
const canPreviewNextCanvasImage = computed(() => {
  return currentCanvasPreviewIndex.value >= 0 && currentCanvasPreviewIndex.value < canvasPreviewImages.value.length - 1
})

// 工具栏事件处理 - 进入编辑模式（使用新的 Fabric.js + vue-advanced-cropper 方案）
function enterEditMode(tool) {
  if (!currentImageUrl.value) {
    console.warn('[ImageNode] 没有可编辑的图片')
    return
  }
  // 调用 canvasStore 进入编辑模式
  canvasStore.enterEditMode(props.id, tool)
  console.log('[ImageNode] 进入编辑模式，工具:', tool)
}

function handleToolbarRepaint() {
  console.log('[ImageNode] 工具栏：重绘', props.id)
  enterEditMode('repaint') // 使用蒙版绘制进行重绘
}

function handleToolbarErase() {
  console.log('[ImageNode] 工具栏：擦除', props.id)
  enterEditMode('erase') // 使用蒙版绘制进行擦除
}

function handleToolbarSpotHeal() {
  console.log('[ImageNode] 工具栏：污点修复', props.id)
  enterEditMode('spot-heal')
}

function handleToolbarEnhance() {
  console.log('[ImageNode] 工具栏：调色', props.id)
  enterEditMode('enhance') // 调色混色器
}

function handleToolbarEditMenuClick() {
  if (!currentImageUrl.value) return
  if (!showImageEditMenu.value) {
    showImageEditMenu.value = true
    return
  }
  showImageEditMenu.value = false
  handleToolbarEnhance()
}

function closeImageEditMenu() {
  showImageEditMenu.value = false
}

function runImageEditAction(handler) {
  showImageEditMenu.value = false
  handler()
}

const isImageHDProcessing = ref(false)
const isPanoramaGenerating = ref(false)

async function handleToolbarImageHD() {
  if (!currentImageUrl.value) {
    showToast('没有可处理的图片', 'error')
    return
  }
  if (isImageHDProcessing.value) {
    showToast('正在处理中，请稍候', 'warning')
    return
  }
  const token = localStorage.getItem('token')
  try {
    isImageHDProcessing.value = true
    let imageUrlForHD = currentImageUrl.value

    if (imageUrlForHD.startsWith('blob:')) {
      showToast('上传图片到云端...', 'info')
      const response = await fetch(imageUrlForHD)
      const blob = await response.blob()
      const file = new File([blob], `hd_source_${Date.now()}.png`, { type: blob.type || 'image/png' })
      const urls = await uploadImages([file])
      if (!urls?.length) throw new Error('图片上传失败')
      imageUrlForHD = urls[0]
    } else if (needsReupload(imageUrlForHD)) {
      showToast('上传图片到云端...', 'info')
      imageUrlForHD = await reuploadToCloud(imageUrlForHD)
    } else if (imageUrlForHD.startsWith('data:image/')) {
      // 交给后端解析 base64
    } else if (imageUrlForHD.startsWith('/api/')) {
      imageUrlForHD = getApiUrl(imageUrlForHD)
    }

    showToast('提交高清任务...', 'info')
    const res = await fetch(getApiUrl('/api/images/hd-upscale'), {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        imageUrl: imageUrlForHD,
        nodeId: props.id
      })
    })
    const result = await res.json()
    if (!res.ok) {
      if (result.error === 'insufficient_points') {
        showToast('当前积分余额不足', 'error')
      } else if (result.error === 'hd_not_configured') {
        await showAlert(result.message || '图片高清功能未配置，请联系管理员', '提示')
      } else {
        showToast(result.message || '提交失败', 'error')
      }
      isImageHDProcessing.value = false
      return
    }

    showToast('高清任务已提交，后台处理中...', 'success')
    isImageHDProcessing.value = false

    const newNodeId = createImageHDProcessingNode(result.taskId)
    if (!newNodeId) return
    const currentTab = canvasStore.getCurrentTab()
    registerTask({
      taskId: result.taskId,
      type: 'image-hd',
      nodeId: newNodeId,
      tabId: currentTab?.id,
      metadata: {
        sourceUrl: currentImageUrl.value,
        sourceNodeId: props.id
      }
    })
  } catch (e) {
    console.error('[ImageNode] 图片高清失败:', e)
    showToast(e.message || '图片高清失败', 'error')
    isImageHDProcessing.value = false
  }
}

function createImageHDProcessingNode(taskId) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null
  const newNodeId = `ihd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + (nodeWidth.value || 300) + 100,
    y: currentNode.position.y
  }
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      label: '高清放大',
      title: '高清放大',
      status: 'processing',
      processingStartedAt: Date.now(),
      progress: '高清处理中...',
      taskId,
      taskType: 'image-hd',
      sourceType: 'image-hd',
      hdUpscaled: true,
      sourceNodeId: props.id
    }
  })
  canvasStore.addEdge({
    id: `edge-${props.id}-${newNodeId}-${Date.now()}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input',
    type: 'smoothstep'
  })
  return newNodeId
}

async function handleToolbarGeneratePanorama() {
  if (!currentImageUrl.value) {
    showToast('没有可处理的图片', 'error')
    return
  }
  if (isPanoramaGenerating.value) {
    showToast('正在处理中，请稍候', 'warning')
    return
  }
  const token = localStorage.getItem('token')
  try {
    isPanoramaGenerating.value = true
    let imageUrlForPanorama = currentImageUrl.value

    if (imageUrlForPanorama.startsWith('blob:')) {
      showToast('上传图片到云端...', 'info')
      const response = await fetch(imageUrlForPanorama)
      const blob = await response.blob()
      const file = new File([blob], `panorama_source_${Date.now()}.png`, { type: blob.type || 'image/png' })
      const urls = await uploadImages([file])
      if (!urls?.length) throw new Error('图片上传失败')
      imageUrlForPanorama = urls[0]
    } else if (needsReupload(imageUrlForPanorama)) {
      showToast('上传图片到云端...', 'info')
      imageUrlForPanorama = await reuploadToCloud(imageUrlForPanorama)
    } else if (imageUrlForPanorama.startsWith('/api/')) {
      imageUrlForPanorama = getApiUrl(imageUrlForPanorama)
    }

    showToast('提交全景图任务...', 'info')
    const res = await fetch(getApiUrl('/api/images/panorama-generate'), {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        imageUrl: imageUrlForPanorama,
        nodeId: props.id
      })
    })
    const result = await res.json()
    if (!res.ok) {
      if (result.error === 'insufficient_points') {
        showToast('当前积分余额不足', 'error')
      } else if (result.error === 'panorama_not_configured') {
        await showAlert(result.message || '生成全景图功能未配置，请联系管理员', '提示')
      } else {
        showToast(result.message || '提交失败', 'error')
      }
      isPanoramaGenerating.value = false
      return
    }

    showToast('全景图任务已提交，后台处理中...', 'success')
    isPanoramaGenerating.value = false

    const newNodeId = createPanoramaProcessingNode(result.taskId)
    if (!newNodeId) return
    const currentTab = canvasStore.getCurrentTab()
    registerTask({
      taskId: result.taskId,
      type: 'image-panorama',
      nodeId: newNodeId,
      tabId: currentTab?.id,
      metadata: {
        sourceUrl: currentImageUrl.value,
        sourceNodeId: props.id
      }
    })
  } catch (e) {
    console.error('[ImageNode] 生成全景图失败:', e)
    showToast(e.message || '生成全景图失败', 'error')
    isPanoramaGenerating.value = false
  }
}

function createPanoramaProcessingNode(taskId) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null
  const newNodeId = `pano_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + (nodeWidth.value || 300) + 100,
    y: currentNode.position.y + 80
  }
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      label: '生成全景图',
      title: '生成全景图',
      status: 'processing',
      processingStartedAt: Date.now(),
      progress: '全景图生成中...',
      taskId,
      taskType: 'image-panorama',
      sourceType: 'image-panorama',
      panoramaGenerated: true,
      sourceNodeId: props.id
    }
  })
  canvasStore.addEdge({
    id: `edge-${props.id}-${newNodeId}-${Date.now()}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input',
    type: 'smoothstep'
  })
  return newNodeId
}

// 抠图状态
const isRemovingBackground = ref(false)
const removeBgProgress = ref(0)
const showCutoutOptions = ref(false)
const cutoutBgColor = ref('transparent') // 'transparent' | 'white' | 'green' | 'custom'
const cutoutCustomColor = ref('#0066ff')

// 3D 相机角度控制状态
const show3DCamera = ref(false)
const cameraAngles = ref({
  horizontal: props.data?.cameraAngle?.horizontal || 0,
  vertical: props.data?.cameraAngle?.vertical || 0,
  zoom: props.data?.cameraAngle?.zoom || 5,
  prompt: props.data?.cameraPrompt || ''
})
const multianglePointsCost = ref(0) // 多角度生成积分消耗

// 3D 姿态分析状态
const showPose3DViewer = ref(false)

// 预设背景颜色
const cutoutBgPresets = [
  { id: 'transparent', label: '透明', color: null, icon: '🔲' },
  { id: 'white', label: '白底', color: '#ffffff', icon: '⬜' },
  { id: 'green', label: '绿幕', color: '#00ff00', icon: '🟩' },
  { id: 'custom', label: '自定义', color: null, icon: '🎨' }
]

// 点击抠图按钮 - 显示选项弹窗
function handleToolbarCutout() {
  console.log('[ImageNode] 工具栏：抠图', props.id)
  
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
  if (!imageUrl) {
    console.warn('[ImageNode] 抠图：没有图片')
    showAlert('提示', '请先上传或生成图片')
    return
  }
  
  if (isRemovingBackground.value) {
    console.warn('[ImageNode] 抠图：正在处理中')
    return
  }
  
  // 显示选项弹窗
  showCutoutOptions.value = true
}

// 选择背景颜色并开始抠图
async function startCutoutWithBg(bgType) {
  cutoutBgColor.value = bgType
  showCutoutOptions.value = false
  
  let imageUrl = currentImageUrl.value || sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
  if (!imageUrl) return
  
  isRemovingBackground.value = true
  removeBgProgress.value = 0
  
  try {
    console.log('[ImageNode] 提交后端抠图任务，背景:', bgType)

    if (imageUrl.startsWith('blob:')) {
      showToast('上传图片到云端...', 'info')
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const file = new File([blob], `cutout_source_${Date.now()}.png`, { type: blob.type || 'image/png' })
      const urls = await uploadImages([file])
      if (!urls?.length) throw new Error('图片上传失败')
      imageUrl = urls[0]
    } else if (needsReupload(imageUrl)) {
      showToast('上传图片到云端...', 'info')
      imageUrl = await reuploadToCloud(imageUrl)
    } else if (imageUrl.startsWith('/api/')) {
      imageUrl = getApiUrl(imageUrl)
    }

    removeBgProgress.value = 20
    const bgColor = bgType === 'custom' ? cutoutCustomColor.value : null
    const result = await removeImageBackground(imageUrl, bgType, bgColor, props.id)

    if (!result.success || !result.taskId) {
      throw new Error('抠图任务提交失败')
    }

    const newNodeId = createCutoutProcessingNode(result.taskId, bgType)
    if (!newNodeId) {
      throw new Error('创建抠图结果节点失败')
    }

    const currentTab = canvasStore.getCurrentTab()
    registerTask({
      taskId: result.taskId,
      type: 'image-cutout',
      nodeId: newNodeId,
      tabId: currentTab?.id,
      metadata: {
        sourceUrl: imageUrl,
        sourceNodeId: props.id,
        bgType
      }
    })

    showToast('抠图任务已提交，后台处理中...', 'success')
    removeBgProgress.value = 100
  } catch (error) {
    console.error('[ImageNode] 抠图失败:', error)
    showAlert('抠图失败', error.message || '处理过程中出现错误，请重试')
  } finally {
    isRemovingBackground.value = false
    removeBgProgress.value = 0
  }
}

function createCutoutProcessingNode(taskId, bgType) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null

  const bgLabel = bgType === 'transparent' ? '透明' : 
                  bgType === 'white' ? '白底' : 
                  bgType === 'green' ? '绿幕' : '自定义底'

  const newNodeId = `cutout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + (nodeWidth.value || 300) + 100,
    y: currentNode.position.y
  }

  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      label: `抠图-${bgLabel}`,
      title: `抠图-${bgLabel}`,
      status: 'processing',
      processingStartedAt: Date.now(),
      progress: '抠图处理中...',
      taskId,
      taskType: 'image-cutout',
      sourceType: 'image-cutout',
      sourceNodeId: props.id,
      cutoutResult: true,
      cutoutBgType: bgType
    }
  })

  canvasStore.addEdge({
    id: `edge-${props.id}-${newNodeId}-${Date.now()}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input',
    type: 'smoothstep'
  })

  return newNodeId
}

// 关闭抠图选项弹窗
function closeCutoutOptions() {
  showCutoutOptions.value = false
}

// 点击外部区域关闭抠图选项弹窗
function handleClickOutside(event) {
  if (showImageEditMenu.value) {
    const menu = event.target.closest('.image-edit-dropdown')
    const trigger = event.target.closest('.image-edit-menu-wrapper')
    if (!menu && !trigger) {
      closeImageEditMenu()
    }
  }
  if (showCutoutOptions.value) {
    const popup = document.querySelector('.cutout-options-popup')
    const trigger = document.querySelector('.toolbar-btn-wrapper .toolbar-btn')
    if (popup && trigger && !popup.contains(event.target) && !trigger.contains(event.target)) {
      closeCutoutOptions()
    }
  }
  // 关闭宫格裁剪菜单（忽略打开后200ms内的点击）
  if (gridCropMenuType.value && Date.now() - gridCropMenuOpenTime > 200) {
    const dropdown = event.target.closest('.grid-crop-dropdown')
    const triggerBtn = event.target.closest('.toolbar-btn-wrapper')
    if (!dropdown && !triggerBtn) {
      closeGridCropMenu()
    }
  }
}


function handleToolbarExpand() {
  console.log('[ImageNode] 工具栏：扩图(旧)', props.id)
  enterEditMode('expand') // 智能扩图（待接入 AI API）
}

// 新版扩图 - 点击扩图按钮（复用裁剪组件，进入扩图模式）
function handleToolbarOutpaint() {
  console.log('[ImageNode] 工具栏：扩图', props.id)
  
  const imageUrl = currentImageUrl.value
  if (!imageUrl) {
    console.warn('[ImageNode] 扩图：没有图片')
    showAlert('提示', '请先上传或生成图片')
    return
  }
  
  // 直接复用裁剪组件（支持扩图模式）
  cropperImageUrl.value = imageUrl
  cropperMode.value = 'outpaint' // 设置为扩图模式
  showCropper.value = true
}

// 宫格裁剪状态（通用）
const isGridCropping = ref(false)

// 4宫格裁剪状态（保留兼容）
const isGrid4Cropping = ref(false)

// 宫格裁剪选项菜单状态（统一入口）
const gridCropMenuType = ref(null) // null | 'selecting' | 'grid4' | 'grid9' | 'grid16' | 'grid25'
const gridCropSelectedSize = ref(null) // { cols, rows, count, label, type }

// 扩图状态（复用裁剪组件）
const isOutpainting = ref(false)

// 独立裁剪组件状态
const showCropper = ref(false)
const cropperImageUrl = ref('')
const cropperMode = ref('crop') // 'crop' | 'outpaint'

// 获取可用于 canvas 操作的图片 URL（统一走 cloudMediaUrl 的 getSmartImageUrl）

// 辅助函数：等待下一帧渲染完成（用于异步分批创建节点，防止浏览器崩溃）
function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

// 辅助函数：通过 fetch 下载图片并转为 Image 对象
async function fetchImageAsBlob(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status} ${response.statusText}`)
  }
  const blob = await response.blob()
  const blobUrl = URL.createObjectURL(blob)
  const img = new Image()
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = blobUrl
    })
  } catch (e) {
    URL.revokeObjectURL(blobUrl)
    throw e
  }
  URL.revokeObjectURL(blobUrl)
  return img
}

// 辅助函数：加载图片用于 Canvas 操作（解决 CORS/代理加载失败问题）
// 带重试机制和多种降级策略
async function loadImageForCanvas(imageUrl) {
  // blob URL / data URL：直接加载，无 CORS 问题
  if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = imageUrl
    })
    return img
  }
  
  const proxiedUrl = getSmartImageUrl(imageUrl)
  const isProxied = proxiedUrl !== imageUrl
  
  // 策略1: 通过代理 fetch（带重试）
  const MAX_RETRIES = 3
  let lastError = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[ImageNode] loadImageForCanvas: 尝试 ${attempt}/${MAX_RETRIES}`, proxiedUrl?.substring(0, 100))
      return await fetchImageAsBlob(proxiedUrl)
    } catch (e) {
      lastError = e
      console.warn(`[ImageNode] loadImageForCanvas: 尝试 ${attempt} 失败:`, e.message)
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt))
      }
    }
  }
  
  // 策略2: 若代理 URL 失败，尝试直接 fetch 原始 URL
  if (isProxied) {
    try {
      console.log('[ImageNode] loadImageForCanvas: 代理失败，尝试直接 fetch 原始 URL')
      return await fetchImageAsBlob(imageUrl)
    } catch (e) {
      console.warn('[ImageNode] loadImageForCanvas: 直接 fetch 也失败:', e.message)
    }
  }
  
  // 策略3: 使用 Image crossOrigin 加载（某些 CDN 支持 CORS）
  try {
    console.log('[ImageNode] loadImageForCanvas: 尝试 crossOrigin 加载')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = imageUrl
    })
    return img
  } catch (e) {
    console.warn('[ImageNode] loadImageForCanvas: crossOrigin 加载也失败:', e.message)
  }
  
  throw lastError || new Error('图片加载失败，请检查网络连接后重试')
}

// ========== 宫格裁剪选项菜单（统一入口） ==========

// 宫格尺寸选项
const gridCropSizeOptions = [
  { cols: 2, rows: 2, count: 4, label: '4宫格', type: 'grid4' },
  { cols: 3, rows: 3, count: 9, label: '9宫格', type: 'grid9' },
  { cols: 4, rows: 4, count: 16, label: '16宫格', type: 'grid16' },
  { cols: 5, rows: 5, count: 25, label: '25宫格', type: 'grid25' }
]

// 显示宫格裁剪选项菜单（第一步：选择宫格大小）
let gridCropMenuOpenTime = 0
function showGridCropMenu(type) {
  if (type === 'selecting') {
    gridCropMenuType.value = 'selecting'
    gridCropSelectedSize.value = null
  } else {
    gridCropMenuType.value = type
  }
  gridCropMenuOpenTime = Date.now()
}

// 选择宫格大小后进入第二步（选择操作）
function selectGridCropSize(sizeOption) {
  gridCropSelectedSize.value = sizeOption
  gridCropMenuType.value = sizeOption.type
}

// 返回宫格大小选择
function backToGridSizeSelect() {
  gridCropMenuType.value = 'selecting'
  gridCropSelectedSize.value = null
}

// 关闭宫格裁剪选项菜单
function closeGridCropMenu() {
  gridCropMenuType.value = null
  gridCropSelectedSize.value = null
}

// 执行仅裁剪（通用）
function handleGridCropOnly() {
  const size = gridCropSelectedSize.value
  if (!size) return
  closeGridCropMenu()
  handleGenericGridCrop(size.cols, size.rows)
}

// 执行裁剪并创建分镜格子（通用）
async function handleGridCropToStoryboard() {
  const size = gridCropSelectedSize.value
  if (!size) return
  closeGridCropMenu()
  await createStoryboardFromCrop(size.cols, size.rows)
}

// 通用宫格裁剪 - 将图片裁剪成 cols*rows 份并创建组
async function handleGenericGridCrop(cols, rows) {
  const count = cols * rows
  const gridType = `grid${count}`
  console.log(`[ImageNode] 工具栏：${count}宫格裁剪`, props.id)
  
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
  if (!imageUrl) {
    console.warn(`[ImageNode] ${count}宫格裁剪：没有图片`)
    showAlert('提示', '请先上传或生成图片')
    return
  }
  
  if (isGridCropping.value) {
    console.warn(`[ImageNode] ${count}宫格裁剪：正在处理中`)
    return
  }
  
  isGridCropping.value = true
  
  try {
    // 先扣除积分（使用 grid4/grid9 类型，16/25宫格复用 grid9 积分）
    try {
      const deductType = count <= 4 ? 'grid4' : 'grid9'
      const deductResult = await deductCropPoints(deductType)
      if (deductResult.pointsCost > 0) {
        console.log(`[ImageNode] ${count}宫格裁剪：已扣除 ${deductResult.pointsCost}积分`)
      }
    } catch (deductError) {
      console.error(`[ImageNode] ${count}宫格裁剪：积分扣除失败`, deductError)
      showAlert('积分不足', deductError.message || '积分不足，无法执行裁剪操作')
      isGridCropping.value = false
      return
    }
    
    // 加载图片
    console.log(`[ImageNode] ${count}宫格裁剪：加载图片`, imageUrl?.substring(0, 80))
    const img = await loadImageForCanvas(imageUrl)
    console.log(`[ImageNode] ${count}宫格裁剪：图片加载成功 ${img.naturalWidth}x${img.naturalHeight}`)
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / cols)
    const cellHeight = Math.floor(imgHeight / rows)
    
    const nodeWidth = 300
    const nodeHeight = Math.ceil(nodeWidth * (cellHeight / cellWidth)) + 40
    const gap = 20
    
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const offsetX = (currentNode?.data?.width || 380) + 80
    
    const newNodeIds = []
    const timestamp = Date.now()
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col
        
        const canvas = document.createElement('canvas')
        canvas.width = cellWidth
        canvas.height = cellHeight
        const ctx = canvas.getContext('2d')
        
        ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight)
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        const blobUrl = URL.createObjectURL(blob)
        
        canvas.width = 0
        canvas.height = 0
        
        const nodeId = `grid-crop-${timestamp}-${index}`
        const nodeX = baseX + offsetX + col * (nodeWidth + gap)
        const nodeY = baseY + row * (nodeHeight + gap)
        
        canvasStore.addNode({
          id: nodeId,
          type: 'image',
          position: { x: nodeX, y: nodeY },
          data: {
            label: `裁剪 ${row + 1}-${col + 1}`,
            nodeRole: 'source',
            sourceImages: [blobUrl],
            isGenerated: true,
            fromGridCrop: true,
            isUploading: true
          }
        })
        
        const cropFile = new File([blob], `grid-crop-${index}.png`, { type: 'image/png' })
        uploadImageFileAsync(cropFile, blobUrl, nodeId)
        
        newNodeIds.push(nodeId)
        
        await nextFrame()
        console.log(`[ImageNode] ${count}宫格裁剪：已创建节点 ${index + 1}/${count}`)
      }
    }
    
    img.src = ''
    
    if (newNodeIds.length === count) {
      await nextFrame()
      canvasStore.createGroup(newNodeIds, `${count}宫格裁剪`)
    }
    
    console.log(`[ImageNode] ${count}宫格裁剪完成，创建了`, newNodeIds.length, '个节点，正在后台上传到云端')
    
  } catch (error) {
    console.error(`[ImageNode] ${count}宫格裁剪失败:`, error)
    showAlert('裁剪失败', error.message || '宫格裁剪失败，请重试')
  }finally {
    isGridCropping.value = false
  }
}

// 裁剪图片并创建分镜格子节点
async function createStoryboardFromCrop(cols, rows) {
  const count = cols * rows
  const gridType = count <= 4 ? 'grid4' : 'grid9'
  
  console.log(`[ImageNode] createStoryboardFromCrop 开始: ${cols}x${rows}`)
  
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
  console.log('[ImageNode] 分镜裁剪图片URL:', imageUrl ? imageUrl.substring(0, 80) + '...' : '无')
  if (!imageUrl) {
    showAlert('提示', '请先上传或生成图片')
    return
  }
  
  try {
    // 先扣除积分
    try {
      console.log(`[ImageNode] ${cols}x${rows}分镜：开始扣除积分...`)
      const deductResult = await deductCropPoints(gridType)
      console.log(`[ImageNode] ${cols}x${rows}分镜：积分扣除结果`, deductResult)
      if (deductResult.pointsCost > 0) {
        console.log(`[ImageNode] ${cols}x${rows}分镜：已扣除 ${deductResult.pointsCost} 积分`)
      }
    } catch (deductError) {
      console.error(`[ImageNode] ${cols}x${rows}分镜：积分扣除失败`, deductError)
      showAlert('提示', deductError.message || '积分不足，无法执行裁剪操作')
      return
    }
    
    // 加载图片（使用 fetch+Blob 方式，避免 crossOrigin 加载失败）
    console.log(`[ImageNode] ${cols}x${rows}分镜：开始加载图片...`)
    const img = await loadImageForCanvas(imageUrl)
    console.log(`[ImageNode] ${cols}x${rows}分镜：图片加载成功 ${img.naturalWidth}x${img.naturalHeight}`)
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / cols)
    const cellHeight = Math.floor(imgHeight / rows)
    
    // 自动匹配比例
    const cellRatio = cellWidth / cellHeight
    let aspectRatio = '16:9'
    const ratioTests = [
      { name: '16:9', val: 16/9 },
      { name: '9:16', val: 9/16 },
      { name: '1:1', val: 1 },
      { name: '4:3', val: 4/3 },
      { name: '3:4', val: 3/4 }
    ]
    let minDiff = Infinity
    for (const r of ratioTests) {
      const diff = Math.abs(cellRatio - r.val)
      if (diff < minDiff) {
        minDiff = diff
        aspectRatio = r.name
      }
    }
    
    // 先声明分镜节点ID
    const storyboardNodeId = `storyboard-${Date.now()}`
    const gridSize = `${cols}x${rows}`
    
    // 裁剪所有图片
    const croppedUrls = []
    const uploadTasks = []
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col
        const canvas = document.createElement('canvas')
        canvas.width = cellWidth
        canvas.height = cellHeight
        const ctx = canvas.getContext('2d')
        
        ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight)
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        const blobUrl = URL.createObjectURL(blob)
        croppedUrls.push(blobUrl)
        
        // 收集上传任务，稍后执行
        const file = new File([blob], `storyboard-${index}.png`, { type: 'image/png' })
        uploadTasks.push({ file, index, blobUrl })
      }
    }
    
    // 清理原图引用
    img.src = ''
    
    // 填充图片数组
    const imagesArray = Array(count).fill(null)
    croppedUrls.forEach((url, i) => {
      imagesArray[i] = url
    })
    
    // 创建分镜格子节点（紧贴原节点右侧）
    // 使用 store 中的节点位置（与其他节点创建逻辑保持一致）
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const flowNode = findNode(props.id)
    const actualWidth = flowNode?.dimensions?.width || (nodeWidth.value || 300)
    const offsetX = actualWidth + 60
    
    canvasStore.addNode({
      id: storyboardNodeId,
      type: 'storyboard',
      position: { x: baseX + offsetX, y: baseY },
      data: {
        title: `${cols}x${rows}分镜`,
        gridSize: gridSize,
        aspectRatio: aspectRatio,
        gridScale: 1,
        images: imagesArray,
        output: null,
        nodeWidth: 720
      }
    })
    
    console.log(`[ImageNode] 创建分镜格子完成: ${storyboardNodeId}`)
    
    // 节点创建完成后，后台异步上传裁剪图到云端
    for (const task of uploadTasks) {
      ;(async (t) => {
        try {
          const urls = await uploadImages([t.file])
          if (urls?.length > 0) {
            const node = canvasStore.nodes.find(n => n.id === storyboardNodeId)
            if (node && node.data?.images) {
              const newImages = [...node.data.images]
              newImages[t.index] = urls[0]
              canvasStore.updateNodeData(storyboardNodeId, { images: newImages })
            }
            // 等待 Vue 响应式更新传播到 StoryboardNode 后再回收 blob URL
            await nextTick()
            try { URL.revokeObjectURL(t.blobUrl) } catch(e) {}
          }
        } catch(err) {
          console.error('[ImageNode] 分镜图片上传失败:', err)
        }
      })(task)
    }
    
  } catch (error) {
    console.error('[ImageNode] 创建分镜格子失败:', error)
    showAlert('错误', '创建分镜格子失败，请重试')
  }
}

async function handlePanoramaExport(payload) {
  if (!payload?.frames?.length) return

  try {
    if (payload.mode === 'storyboard') {
      createPanoramaStoryboard(payload)
    } else {
      createPanoramaImageNodes(payload)
    }
    showToast('全景视角已输出到画布', 'success')
  } catch (error) {
    console.error('[ImageNode] 全景视角输出失败:', error)
    showAlert('输出失败', error.message || '全景视角输出失败，请重试')
  }
}

function getPanoramaBasePosition() {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  const flowNode = findNode(props.id)
  const baseX = currentNode?.position?.x || 0
  const baseY = currentNode?.position?.y || 0
  const actualWidth = flowNode?.dimensions?.width || (nodeWidth.value || 380)
  return {
    x: baseX + actualWidth + 80,
    y: baseY
  }
}

function createPanoramaImageNodes(payload) {
  const base = getPanoramaBasePosition()
  const timestamp = Date.now()
  const ratio = payload.width / payload.height
  const cardWidth = payload.mode === 'current-view' ? 360 : 300
  const cardHeight = Math.round(cardWidth / ratio) + 44
  const cols = payload.frames.length === 1 ? 1 : 2
  const gap = 24
  const nodeIds = []

  payload.frames.forEach((frame, index) => {
    const blobUrl = createTrackedBlobUrl(frame.blob)
    const nodeId = `panorama-view-${timestamp}-${index}`
    const col = index % cols
    const row = Math.floor(index / cols)

    canvasStore.addNode({
      id: nodeId,
      type: 'image',
      position: {
        x: base.x + col * (cardWidth + gap),
        y: base.y + row * (cardHeight + gap)
      },
      data: {
        label: frame.label || `全景视角 ${index + 1}`,
        title: frame.label || `全景视角 ${index + 1}`,
        nodeRole: 'source',
        sourceImages: [blobUrl],
        isGenerated: true,
        fromPanorama: true,
        panoramaProjection: payload.projection,
        panoramaRatio: payload.ratio,
        isUploading: true
      }
    })

    nodeIds.push(nodeId)
    const file = new File([frame.blob], `panorama-${timestamp}-${index}.png`, { type: 'image/png' })
    uploadPanoramaFrameAsync({ file, blobUrl, nodeId, targetType: 'image' })
  })

  if (nodeIds.length > 1) {
    nextTick(() => canvasStore.createGroup(nodeIds, '全景视角'))
  }
}

function createPanoramaStoryboard(payload) {
  const base = getPanoramaBasePosition()
  const timestamp = Date.now()
  const nodeId = `panorama-storyboard-${timestamp}`
  const images = payload.frames.map(frame => createTrackedBlobUrl(frame.blob))

  canvasStore.addNode({
    id: nodeId,
    type: 'storyboard',
    position: base,
    data: {
      title: payload.storyboardGridSize === '2x2' ? '全景4宫格' : '全景12宫格',
      gridSize: payload.storyboardGridSize || '2x2',
      aspectRatio: payload.ratio,
      gridScale: 1,
      images,
      output: null,
      nodeWidth: 720,
      fromPanorama: true,
      panoramaProjection: payload.projection,
      isUploading: true
    }
  })

  payload.frames.forEach((frame, index) => {
    const file = new File([frame.blob], `panorama-storyboard-${timestamp}-${index}.png`, { type: 'image/png' })
    uploadPanoramaFrameAsync({
      file,
      blobUrl: images[index],
      nodeId,
      targetType: 'storyboard',
      index
    })
  })
}

async function uploadPanoramaFrameAsync({ file, blobUrl, nodeId, targetType, index }) {
  try {
    const urls = await uploadImages([file])
    if (!urls?.length) throw new Error('上传结果为空')

    const serverUrl = urls[0]
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (!node) return

    if (targetType === 'storyboard') {
      const nextImages = [...(node.data?.images || [])]
      nextImages[index] = serverUrl
      const allUploaded = nextImages.every(url => url && !url.startsWith('blob:'))
      canvasStore.updateNodeData(nodeId, {
        images: nextImages,
        isUploading: !allUploaded
      })
    } else {
      const nextSourceImages = (node.data?.sourceImages || []).map(url => url === blobUrl ? serverUrl : url)
      canvasStore.updateNodeData(nodeId, {
        sourceImages: nextSourceImages,
        isUploading: false
      })
    }

    await nextTick()
    revokeTrackedBlobUrl(blobUrl)
  } catch (error) {
    console.error('[ImageNode] 全景视角上传失败:', error)
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (node) {
      canvasStore.updateNodeData(nodeId, { isUploading: false, uploadFailed: true })
    }
  }
}

// 9宫格裁剪 - 将图片裁剪成9份并创建组（优化版：异步分批创建，防止浏览器崩溃）
async function handleToolbarGridCrop() {
  console.log('[ImageNode] 工具栏：9宫格裁剪', props.id)
  
  // 获取当前节点的图片URL（优先使用sourceImages，然后是output）
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
  if (!imageUrl) {
    console.warn('[ImageNode] 9宫格裁剪：没有图片')
    showAlert('提示', '请先上传或生成图片')
    return
  }
  
  if (isGridCropping.value) {
    console.warn('[ImageNode] 9宫格裁剪：正在处理中')
    return
  }
  
  isGridCropping.value = true
  
  try {
    // 先扣除积分
    try {
      const deductResult = await deductCropPoints('grid9')
      if (deductResult.pointsCost > 0) {
        console.log(`[ImageNode] 9宫格裁剪：已扣除 ${deductResult.pointsCost} 积分`)
      }
    } catch (deductError) {
      console.error('[ImageNode] 9宫格裁剪：积分扣除失败', deductError)
      showAlert('积分不足', deductError.message || '积分不足，无法执行裁剪操作')
      isGridCropping.value = false
      return
    }
    
    // 加载图片（使用 fetch+Blob 方式，避免 crossOrigin 加载失败）
    console.log('[ImageNode] 9宫格裁剪：加载图片', imageUrl?.substring(0, 80))
    const img = await loadImageForCanvas(imageUrl)
    console.log(`[ImageNode] 9宫格裁剪：图片加载成功 ${img.naturalWidth}x${img.naturalHeight}`)
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / 3)
    const cellHeight = Math.floor(imgHeight / 3)
    
    const nodeWidth = 300
    const nodeHeight = Math.ceil(nodeWidth * (cellHeight / cellWidth)) + 40
    const gap = 20
    
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const offsetX = (currentNode?.data?.width || 380) + 80
    
    // 🔧 优化：异步分批裁剪和创建节点，防止浏览器崩溃
    const newNodeIds = []
    const timestamp = Date.now()
    
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const index = row * 3 + col
        
        // 创建 canvas 并裁剪
        const canvas = document.createElement('canvas')
        canvas.width = cellWidth
        canvas.height = cellHeight
        const ctx = canvas.getContext('2d')
        
        ctx.drawImage(
          img,
          col * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          cellWidth,
          cellHeight
        )
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        const blobUrl = URL.createObjectURL(blob)
        
        canvas.width = 0
        canvas.height = 0
        
        // 创建节点（先使用 blob URL 显示，后台上传后替换）
        const nodeId = `grid-crop-${timestamp}-${index}`
        const nodeX = baseX + offsetX + col * (nodeWidth + gap)
        const nodeY = baseY + row * (nodeHeight + gap)
        
        canvasStore.addNode({
          id: nodeId,
          type: 'image',
          position: { x: nodeX, y: nodeY },
          data: {
            label: `裁剪 ${row + 1}-${col + 1}`,
            nodeRole: 'source',
            sourceImages: [blobUrl],
            isGenerated: true,
            fromGridCrop: true,
            isUploading: true
          }
        })
        
        newNodeIds.push(nodeId)
        
        // 🔧 后台异步上传裁剪图到云端
        const cropFile = new File([blob], `grid-crop-${index}.png`, { type: 'image/png' })
        uploadImageFileAsync(cropFile, blobUrl, nodeId)
        
        // 🔧 优化：每创建一个节点后，等待下一帧渲染，让浏览器有时间处理
        await nextFrame()
        
        console.log(`[ImageNode] 9宫格裁剪：已创建节点 ${index + 1}/9`)
      }
    }
    
    // 清理原图引用
    img.src = ''
    
    // 创建包含这9个节点的组
    if (newNodeIds.length === 9) {
      await nextFrame() // 等待所有节点渲染完成
      canvasStore.createGroup(newNodeIds, '9宫格裁剪')
    }
    
    console.log('[ImageNode] 9宫格裁剪完成，创建了', newNodeIds.length, '个节点，正在后台上传到云端')
    
  } catch (error) {
    console.error('[ImageNode] 9宫格裁剪失败:', error)
    showAlert('裁剪失败', error.message || '9宫格裁剪失败，请重试')
  } finally {
    isGridCropping.value = false
  }
}

// 4宫格裁剪 - 将图片裁剪成4份并创建组 (2x2布局)（优化版：异步分批创建，防止浏览器崩溃）
async function handleToolbarGrid4Crop() {
  console.log('[ImageNode] 工具栏：4宫格裁剪', props.id)
  
  // 获取当前节点的图片URL（优先使用sourceImages，然后是output）
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
  if (!imageUrl) {
    console.warn('[ImageNode] 4宫格裁剪：没有图片')
    showAlert('提示', '请先上传或生成图片')
    return
  }
  
  if (isGrid4Cropping.value) {
    console.warn('[ImageNode] 4宫格裁剪：正在处理中')
    return
  }
  
  isGrid4Cropping.value = true
  
  try {
    // 先扣除积分
    try {
      const deductResult = await deductCropPoints('grid4')
      if (deductResult.pointsCost > 0) {
        console.log(`[ImageNode] 4宫格裁剪：已扣除 ${deductResult.pointsCost} 积分`)
      }
    } catch (deductError) {
      console.error('[ImageNode] 4宫格裁剪：积分扣除失败', deductError)
      showAlert('积分不足', deductError.message || '积分不足，无法执行裁剪操作')
      isGrid4Cropping.value = false
      return
    }
    
    // 加载图片（使用 fetch+Blob 方式，避免 crossOrigin 加载失败）
    console.log('[ImageNode] 4宫格裁剪：加载图片', imageUrl?.substring(0, 80))
    const img = await loadImageForCanvas(imageUrl)
    console.log(`[ImageNode] 4宫格裁剪：图片加载成功 ${img.naturalWidth}x${img.naturalHeight}`)
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / 2)
    const cellHeight = Math.floor(imgHeight / 2)
    
    const nodeWidth = 300
    const nodeHeight = Math.ceil(nodeWidth * (cellHeight / cellWidth)) + 40
    const gap = 20
    
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const offsetX = (currentNode?.data?.width || 380) + 80
    
    // 🔧 优化：异步分批裁剪和创建节点，防止浏览器崩溃
    const newNodeIds = []
    const timestamp = Date.now()
    
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const index = row * 2 + col
        
        // 创建 canvas 并裁剪
        const canvas = document.createElement('canvas')
        canvas.width = cellWidth
        canvas.height = cellHeight
        const ctx = canvas.getContext('2d')
        
        ctx.drawImage(
          img,
          col * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          cellWidth,
          cellHeight
        )
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        const blobUrl = URL.createObjectURL(blob)
        
        canvas.width = 0
        canvas.height = 0
        
        // 创建节点（先使用 blob URL 显示，后台上传后替换）
        const nodeId = `grid4-crop-${timestamp}-${index}`
        const nodeX = baseX + offsetX + col * (nodeWidth + gap)
        const nodeY = baseY + row * (nodeHeight + gap)
        
        canvasStore.addNode({
          id: nodeId,
          type: 'image',
          position: { x: nodeX, y: nodeY },
          data: {
            label: `裁剪 ${row + 1}-${col + 1}`,
            nodeRole: 'source',
            sourceImages: [blobUrl],
            isGenerated: true,
            fromGridCrop: true,
            isUploading: true
          }
        })
        
        // 🔧 后台异步上传裁剪图到云端
        const cropFile = new File([blob], `grid4-crop-${index}.png`, { type: 'image/png' })
        uploadImageFileAsync(cropFile, blobUrl, nodeId)
        
        newNodeIds.push(nodeId)
        
        // 🔧 优化：每创建一个节点后，等待下一帧渲染，让浏览器有时间处理
        await nextFrame()
        
        console.log(`[ImageNode] 4宫格裁剪：已创建节点 ${index + 1}/4`)
      }
    }
    
    // 清理原图引用
    img.src = ''
    
    // 创建包含这4个节点的组
    if (newNodeIds.length === 4) {
      await nextFrame() // 等待所有节点渲染完成
      canvasStore.createGroup(newNodeIds, '4宫格裁剪')
    }
    
    console.log('[ImageNode] 4宫格裁剪完成，创建了', newNodeIds.length, '个节点')
    
  } catch (error) {
    console.error('[ImageNode] 4宫格裁剪失败:', error)
    showAlert('裁剪失败', error.message || '4宫格裁剪失败，请重试')
  } finally {
    isGrid4Cropping.value = false
  }
}

// ========== 3D 相机角度控制 ==========
// 获取多角度积分配置
async function fetchMultiangleConfig() {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch(getApiUrl('/api/settings/app'), {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...getTenantHeaders()
      }
    })
    if (response.ok) {
      const data = await response.json()
      console.log('[ImageNode] 获取到设置:', data)
      const config = data.image_multiangle_config || {}
      multianglePointsCost.value = config.points_cost || 0
      console.log('[ImageNode] 多角度积分消耗:', multianglePointsCost.value)
    } else {
      console.warn('[ImageNode] 获取设置失败:', response.status)
    }
  } catch (e) {
    console.warn('[ImageNode] 获取多角度配置失败:', e)
  }
}

// 打开/关闭3D相机面板
function handleToolbar3DCamera() {
  console.log('[ImageNode] 工具栏：角度切换', props.id)
  // 打开面板时获取积分配置
  if (!show3DCamera.value) {
    fetchMultiangleConfig()
  }
  show3DCamera.value = !show3DCamera.value
}

// 相机角度更新回调
function handleCameraUpdate(data) {
  cameraAngles.value = data
  console.log('[ImageNode] 相机角度更新:', data)
}

// 应用相机角度
function handleCameraApply(data) {
  cameraAngles.value = data
  // 将提示词保存到节点数据中
  canvasStore.updateNodeData(props.id, {
    cameraAngle: {
      horizontal: data.horizontal,
      vertical: data.vertical,
      zoom: data.zoom
    },
    cameraPrompt: data.prompt
  })
  show3DCamera.value = false
  console.log('[ImageNode] 应用相机角度:', data.prompt)
}

// 多角度生成开始处理（任务提交后立即调用）
async function handleMultiangleGenerateStart(data) {
  console.log('[ImageNode] 多角度生成任务已提交:', data)
  
  // 获取当前节点信息
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 创建新的图像节点，显示生成中状态
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + (nodeWidth.value || 300) + 100,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      label: '多角度生成中...',
      title: '多角度生成',
      status: 'processing',
      processingStartedAt: Date.now(),
      cameraAngle: data.angles,
      cameraPrompt: data.prompt,
      sourceType: 'multiangle',
      multiangleTaskId: data.taskId
    }
  })
  
  // 连接节点
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input',
    type: 'smoothstep'
  })
  
  show3DCamera.value = false
  
  // 后台轮询任务状态
  pollMultiangleTask(data.taskId, newNodeId)
}

// 轮询多角度任务状态
async function pollMultiangleTask(taskId, nodeId) {
  const token = localStorage.getItem('token')
  if (!token) return
  
  const pollInterval = 2000
  const maxPolls = 450 // 最多轮询15分钟
  let pollCount = 0
  
  while (pollCount < maxPolls) {
    await new Promise(resolve => setTimeout(resolve, pollInterval))
    pollCount++
    
    try {
      const response = await fetch(getApiUrl(`/api/images/multiangle/task/${taskId}`), {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...getTenantHeaders()
        }
      })
      
      if (!response.ok) continue
      
      const statusData = await response.json()
      
      if (statusData.status === 'completed') {
        // 更新节点为完成状态
        canvasStore.updateNodeData(nodeId, {
          label: 'Multiangle',
          status: 'completed',
          output: {
            url: statusData.outputUrl || statusData.url,
            urls: [statusData.outputUrl || statusData.url]
          }
        })
        console.log('[ImageNode] 多角度生成完成:', statusData.outputUrl)
        return
        
      } else if (statusData.status === 'failed' || statusData.status === 'timeout') {
        // 更新节点为失败状态
        canvasStore.updateNodeData(nodeId, {
          label: '生成失败',
          status: 'error',
          error: statusData.error || '生成失败'
        })
        console.error('[ImageNode] 多角度生成失败:', statusData.error)
        return
      }
      
    } catch (error) {
      console.warn('[ImageNode] 轮询任务状态失败:', error)
    }
  }
  
  // 超时处理
  canvasStore.updateNodeData(nodeId, {
    label: '生成超时',
    status: 'error',
    error: '生成超时，请重试'
  })
}

// 多角度生成成功处理（保留兼容旧逻辑）
function handleMultiangleGenerateSuccess(data) {
  console.log('[ImageNode] 多角度生成成功:', data)
  
  // 获取当前节点信息
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 创建新的图像节点显示生成结果
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + (nodeWidth.value || 300) + 100,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      label: 'Multiangle',
      title: 'Multiangle',
      output: {
        url: data.outputUrl,
        urls: [data.outputUrl]
      },
      cameraAngle: data.angles,
      cameraPrompt: data.prompt,
      sourceType: 'multiangle'
    }
  })
  
  // 连接节点
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input',
    type: 'smoothstep'
  })
  
  show3DCamera.value = false
}

// 多角度生成失败处理
function handleMultiangleGenerateError(data) {
  console.error('[ImageNode] 多角度生成失败:', data.error)
  // 错误已在 Camera3DPanel 中显示
}

// 关闭相机面板
function handleCameraClose() {
  show3DCamera.value = false
}

// ========== 3D 姿态分析 ==========
function handleToolbarPose3D() {
  console.log('[ImageNode] 工具栏：姿态分析', props.id)
  showPose3DViewer.value = true
}

function handlePose3DClose() {
  showPose3DViewer.value = false
}

function handlePose3DApplyAngle(data) {
  console.log('[ImageNode] 应用姿态分析角度:', data)
  // 将角度信息保存到节点数据
  canvasStore.updateNodeData(props.id, {
    poseAngle: {
      azimuth: data.azimuth,
      elevation: data.elevation,
      distance: data.distance
    },
    posePrompt: data.prompt,
    poseDescription: data.description
  })
  showPose3DViewer.value = false
  
  // 显示提示
  showAlert(`已应用视角：${data.description}`, '成功')
}

function handleToolbarAnnotate() {
  console.log('[ImageNode] 工具栏：标注', props.id)
  enterEditMode('annotate') // 涂鸦标注
}

function handleToolbarCrop() {
  console.log('[ImageNode] 工具栏：裁剪', props.id)
  
  // 获取当前图片URL
  const imageUrl = currentImageUrl.value
  if (!imageUrl) {
    showAlert('提示', '请先上传或生成图片')
    return
  }
  
  // 打开新的裁剪组件
  cropperImageUrl.value = imageUrl
  cropperMode.value = 'crop' // 设置为裁剪模式
  showCropper.value = true
}

// 处理裁剪保存 - 创建新的图像节点
function handleCropSave(result) {
  console.log('[ImageNode] 裁剪/扩图完成', result)
  
  // 获取当前节点位置
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) {
    showCropper.value = false
    cropperImageUrl.value = ''
    return
  }
  
  // 在当前节点右侧创建新节点
  const newNodeId = `crop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + 380,
    y: currentNode.position.y
  }
  
  // 创建新的图像节点
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: {
      label: result.isExpanded ? '扩图' : '裁剪',
      output: {
        url: result.dataUrl,
        urls: [result.dataUrl]
      },
      sourceNodeId: props.id,
      cropInfo: {
        width: result.width,
        height: result.height,
        isExpanded: result.isExpanded
      }
    }
  })
  
  console.log('[ImageNode] 已创建新节点:', newNodeId, `${result.width}x${result.height}`, result.isExpanded ? '(扩图)' : '(裁剪)')
  
  // 关闭裁剪组件
  showCropper.value = false
  cropperImageUrl.value = ''
}

// 处理裁剪取消
function handleCropCancel() {
  showCropper.value = false
  cropperImageUrl.value = ''
}

// 处理扩图生成请求
async function handleOutpaint(data) {
  console.log('[ImageNode] 扩图请求', data)

  // 关闭裁剪组件
  showCropper.value = false
  cropperImageUrl.value = ''

  // 获取当前节点位置
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) {
    showAlert('错误', '无法找到当前节点')
    return
  }

  try {
    // 1. 先将dataUrl转换为File对象
    const response = await fetch(data.dataUrl)
    const blob = await response.blob()
    const file = new File([blob], 'outpaint_source.png', { type: 'image/png' })

    // 2. 上传图片
    const uploadedUrls = await uploadImages([file])
    if (!uploadedUrls || uploadedUrls.length === 0) {
      throw new Error('图片上传失败')
    }
    const uploadedImageUrl = uploadedUrls[0]
    console.log('[ImageNode] 扩图源图已上传:', uploadedImageUrl)

    // 3. 在当前节点右侧创建等待中的输出节点
    const newNodeId = `outpaint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newNodePosition = {
      x: currentNode.position.x + 380,
      y: currentNode.position.y
    }

    // 创建等待中的节点（不显示系统提示词）
    canvasStore.addNode({
      id: newNodeId,
      type: 'image',
      position: newNodePosition,
      data: {
        label: '扩图',
        sourceNodeId: props.id,
        status: 'processing', // 使用 processing 状态显示"生成中"
        processingStartedAt: Date.now(),
        progress: '生成中...',
        model: 'gemini-3-pro-image-preview',
        resolution: data.size || '2K',
        outpaintInfo: {
          width: data.width,
          height: data.height,
          originalWidth: data.originalWidth,
          originalHeight: data.originalHeight
        }
      }
    })

    // 创建连接边
    canvasStore.addEdge({
      id: `edge_${props.id}_${newNodeId}`,
      source: props.id,
      target: newNodeId,
      type: 'default'
    })

    console.log('[ImageNode] 已创建扩图节点和连接边 | 节点ID:', newNodeId)

    // 4. 调用 nano-banana-pro API 生成扩图
    const generateResult = await generateImageFromImage({
      prompt: data.systemPrompt,
      userPrompt: '扩图', // 用户原始输入：简单标记为"扩图"，不显示系统提示词
      images: [uploadedImageUrl],
      model: 'gemini-3-pro-image-preview',
      image_size: data.size || '2K', // 用户选择的分辨率
      aspectRatio: 'auto'
    })

    console.log('[ImageNode] 扩图任务已提交:', generateResult)

    // 5. 注册后台任务轮询
    // 🔧 修复：统一使用 backgroundTaskManager 进行轮询，避免双重轮询导致页面卡顿
    if (generateResult.task_id) {
      const taskId = generateResult.task_id
      const currentTab = canvasStore.getCurrentTab()
      
      // 注册到后台任务管理器（backgroundTaskManager 会自动轮询并通过事件通知）
      registerTask({
        taskId,
        type: 'image',
        nodeId: newNodeId,
        tabId: currentTab?.id,
        metadata: {
          prompt: data.systemPrompt,
          model: 'gemini-3-pro-image-preview',
          imageSize: data.size || '2K'
        }
      })
      
      // ⚠️ 不再调用 pollTaskStatus，使用 backgroundTaskManager 统一轮询
      // 新创建的 newNodeId 节点会自动监听 background-task 事件
      console.log('[ImageNode] 扩图任务已注册到后台任务管理器:', taskId)
    } else if (generateResult.url) {
      // 直接返回结果（同步模式）
      canvasStore.updateNodeData(newNodeId, {
        status: 'completed',
        output: {
          url: generateResult.url,
          urls: generateResult.urls || [generateResult.url]
        }
      })
      console.log('[ImageNode] 扩图完成（同步）:', generateResult.url)
    }

  } catch (error) {
    console.error('[ImageNode] 扩图失败:', error)
    showAlert('扩图失败', error.message || '请稍后重试')
  }
}

// 旧的编辑器相关函数（保留兼容性，可稍后移除）
function openImageEditor(tool = '') {
  // 现在调用新的编辑模式
  enterEditMode(tool)
}

// 关闭图片编辑器
function closeImageEditor() {
  showImageEditor.value = false
  editorInitialTool.value = ''
}

// 保存编辑后的图片
async function handleEditorSave(data) {
  console.log('[ImageNode] 编辑器保存图片', data)
  
  if (!data?.dataUrl) {
    console.warn('[ImageNode] 没有图片数据')
    return
  }
  
  try {
    // 将 dataUrl 转换为 Blob
    const response = await fetch(data.dataUrl)
    const blob = await response.blob()
    
    // 创建 File 对象
    const file = new File([blob], `edited_${Date.now()}.png`, { type: 'image/png' })
    
    // 上传图片
    const uploadResult = await uploadImages([file])
    
    if (uploadResult?.urls?.length > 0) {
      const newUrl = uploadResult.urls[0]
      
      // 更新节点数据
      if (hasOutput.value) {
        // 如果是输出图片，更新输出
        canvasStore.updateNodeData(props.id, {
          output: {
            ...props.data.output,
            urls: [newUrl, ...(props.data.output?.urls?.slice(1) || [])]
          }
        })
      } else if (hasSourceImage.value) {
        // 如果是源图片，更新源图片
        canvasStore.updateNodeData(props.id, {
          sourceImages: [newUrl, ...(props.data.sourceImages?.slice(1) || [])]
        })
      }
      
      console.log('[ImageNode] 图片已更新:', newUrl)
    }
  } catch (error) {
    console.error('[ImageNode] 保存图片失败:', error)
    await showAlert('保存图片失败，请重试', '错误')
  }
  
  closeImageEditor()
}

// 保存蒙版（用于 AI 重绘/擦除）
function handleEditorSaveMask(data) {
  console.log('[ImageNode] 编辑器保存蒙版', data)
  // TODO: 实现蒙版发送到 AI 接口进行重绘/擦除
  closeImageEditor()
}

let isDownloading = false
async function handleToolbarDownload() {
  if (isDownloading) return
  const activeImageUrl = showPreviewModal.value && previewImageUrl.value ? previewImageUrl.value : currentImageUrl.value
  if (!activeImageUrl) {
    showToast('没有可下载的图片', 'warning')
    return
  }
  
  isDownloading = true
  const filename = `image_${props.id || Date.now()}.png`
  showToast('正在下载图片...', 'info')
  
  try {
    const imageUrl = getOriginalImageUrl(activeImageUrl)
    console.log('[ImageNode] 开始下载:', imageUrl?.substring(0, 100))
    
    if (imageUrl.startsWith('data:')) {
      const blob = await dataUrlToBlob(imageUrl)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      showToast('下载完成', 'success')
      return
    }
    
    await smartDownload(imageUrl, filename)
    showToast('已开始下载', 'success')
  } catch (error) {
    console.error('[ImageNode] 下载图片失败:', error)
    showToast('下载失败，请重试', 'error')
  } finally {
    isDownloading = false
  }
}

// 将 dataUrl 转换为 Blob 对象
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const base64 = parts[1]
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mime })
}

function handleToolbarPreview() {
  if (!currentImageUrl.value) return
  previewImageUrl.value = getOriginalImageUrl(currentImageUrl.value)
  previewNodeId.value = props.id
  showPreviewModal.value = true
}

function closePreviewModal() {
  showPreviewModal.value = false
  previewImageUrl.value = ''
  previewNodeId.value = ''
  resetPreviewState()
}

function switchCanvasPreviewImage(offset) {
  const nextIndex = currentCanvasPreviewIndex.value + offset
  const nextItem = canvasPreviewImages.value[nextIndex]
  if (!nextItem) return
  previewNodeId.value = nextItem.id
  previewImageUrl.value = getOriginalImageUrl(nextItem.url)
  resetPreviewState()
}

function handlePreviewKeydown(event) {
  if (!showPreviewModal.value) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()
    void handleToolbarDownload()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePreviewModal()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    switchCanvasPreviewImage(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    switchCanvasPreviewImage(1)
  }
}

// 重置预览状态
function resetPreviewState() {
  previewScale.value = 1
  previewPosition.value = { x: 0, y: 0 }
  previewIsDragging.value = false
}

// 处理滚轮缩放
function handlePreviewWheel(event) {
  event.preventDefault()
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.min(Math.max(previewScale.value + delta, 0.5), 5)
  previewScale.value = newScale
}

// 处理鼠标按下（开始拖动）
function handlePreviewMouseDown(event) {
  if (event.button !== 0) return // 只响应左键
  previewIsDragging.value = true
  previewDragStart.value = { x: event.clientX, y: event.clientY }
  previewLastPosition.value = { ...previewPosition.value }
  event.preventDefault()
}

// 处理鼠标移动（拖动中）
function handlePreviewMouseMove(event) {
  if (!previewIsDragging.value) return
  const dx = event.clientX - previewDragStart.value.x
  const dy = event.clientY - previewDragStart.value.y
  previewPosition.value = {
    x: previewLastPosition.value.x + dx,
    y: previewLastPosition.value.y + dy
  }
}

// 处理鼠标释放（结束拖动）
function handlePreviewMouseUp() {
  previewIsDragging.value = false
}

// 放大
function handleZoomIn() {
  previewScale.value = Math.min(previewScale.value + 0.25, 5)
}

// 缩小
function handleZoomOut() {
  previewScale.value = Math.max(previewScale.value - 0.25, 0.5)
}

// 重置缩放
function handleZoomReset() {
  previewScale.value = 1
  previewPosition.value = { x: 0, y: 0 }
}

// 添加到我的资产
async function handleAddToAssets() {
  const activeImageUrl = showPreviewModal.value && previewImageUrl.value ? previewImageUrl.value : currentImageUrl.value
  if (!activeImageUrl) return
  
  try {
    const { saveAsset } = await import('@/api/canvas/assets')
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `画布图片_${timestamp}`
    
    await saveAsset({
      type: 'image',
      name: fileName,
      url: activeImageUrl,
      thumbnail_url: activeImageUrl,
      source_node_id: previewNodeId.value || props.id || null,
      tags: ['画布', '预览保存']
    })
    
    console.log('[ImageNode] 已添加到资产库:', fileName)
    showSuccessToast('已成功添加到我的资产！')
  } catch (error) {
    console.error('[ImageNode] 添加到资产失败:', error)
    showErrorToast('添加失败，请重试')
  }
}

// 简单的提示函数
function showSuccessToast(message) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: rgba(34, 197, 94, 0.9);
    color: white;
    border-radius: 8px;
    font-size: 14px;
    z-index: 999999;
    animation: fadeInOut 2s ease forwards;
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2000)
}

function showErrorToast(message) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    border-radius: 8px;
    font-size: 14px;
    z-index: 999999;
    animation: fadeInOut 2s ease forwards;
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2000)
}

// 节点拖动开始（记录起始位置）
function handleNodeDragStart(event) {
  isMouseDown.value = true
  dragStartPos.value = { x: event.clientX, y: event.clientY }
  hasMoved.value = false
  isDragging.value = false // 初始不设置为拖动状态
}

// 节点拖动中（检测是否真的在移动）
function handleNodeDragMove(event) {
  // 只有在节点上按下鼠标后才检测拖动
  if (!isMouseDown.value) return
  
  const dx = Math.abs(event.clientX - dragStartPos.value.x)
  const dy = Math.abs(event.clientY - dragStartPos.value.y)
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  // 只有移动超过阈值才认为是拖动
  if (distance > DRAG_THRESHOLD && !hasMoved.value) {
    hasMoved.value = true
    isDragging.value = true
  }
}

// 节点拖动结束
function handleNodeDragEnd() {
  // 只有在节点上按下过鼠标才处理
  if (!isMouseDown.value) return
  
  // 如果真正移动了，恢复状态
  if (hasMoved.value) {
    isDragging.value = false
  }
  
  // 重置状态
  isMouseDown.value = false
  dragStartPos.value = { x: 0, y: 0 }
  hasMoved.value = false
}

// 组件挂载时添加拖动监听
onMounted(() => {
  // 监听节点拖动事件
  if (nodeRef.value) {
    nodeRef.value.addEventListener('mousedown', handleNodeDragStart)
    document.addEventListener('mousemove', handleNodeDragMove)
    document.addEventListener('mouseup', handleNodeDragEnd)
  }
  
  // 检查是否需要提取视频尾帧
  if (props.data.needsFrameExtraction && props.data.videoUrl) {
    extractLastFrameFromVideo()
  }
})

// 组件卸载时移除监听
onUnmounted(() => {
  // 移除拖动监听
  if (nodeRef.value) {
    nodeRef.value.removeEventListener('mousedown', handleNodeDragStart)
  }
  document.removeEventListener('mousemove', handleNodeDragMove)
  document.removeEventListener('mouseup', handleNodeDragEnd)
})

// 输出图片
const outputImages = computed(() => {
  if (props.data.output?.urls) return props.data.output.urls
  if (props.data.output?.url) return [props.data.output.url]
  return []
})

// 源图片（上传的）
const sourceImages = computed(() => props.data.sourceImages || [])

const previewDevicePixelRatio = computed(() => {
  if (typeof window === 'undefined') return 1
  return window.devicePixelRatio || 1
})

function getNodePreviewImageUrl(url) {
  // 用稳定 zoom（去抖 220ms）计算 LOD，避免连续缩放时 src 频繁切换
  const z = canvasStableZoom?.value ?? canvasStore.viewport?.zoom ?? 1
  return getHighQualityCanvasPreviewUrl(toSameOriginUrl(url), {
    zoom: z,
    nodeWidth: nodeWidth.value || 380,
    devicePixelRatio: previewDevicePixelRatio.value,
    preferLowQuality: isCanvasMediaMoving.value
  })
}

const outputPreviewImages = computed(() => outputImages.value.map(getNodePreviewImageUrl))
const sourcePreviewImages = computed(() => sourceImages.value.map(getNodePreviewImageUrl))

// 源图加载失败兜底：URL 失效（CDN/签名过期、cos-proxy bid 丢失等）时
// 也要保证用户能重新上传，避免节点陷入"图片裂了又删不掉只能整个删除"的死锁
const sourceImageLoadFailed = ref(false)
let sourceImageErrorCount = 0

function handleSourceImageError() {
  // CanvasNodeImage 内部 autoFallback 会先尝试一次 onCanvasImageError 回退到原图，
  // 这里只在第二次错误（回退也失败）时才视为彻底失败，避免误判网络抖动
  sourceImageErrorCount += 1
  if (sourceImageErrorCount >= 2) {
    sourceImageLoadFailed.value = true
  }
}

watch(() => sourceImages.value[0], () => {
  sourceImageErrorCount = 0
  sourceImageLoadFailed.value = false
})

watch(currentImageUrl, (url) => {
  detectPanoramaImage(url)
}, { immediate: true })

const VIDEO_NODE_TYPES = [
  'video', 'video-input', 'video-gen',
  'text-to-video', 'image-to-video', 'audio-to-video'
]

// 继承的参考图片（来自左侧连接的节点，支持多图和自定义顺序）
// 使用 canvasStore 的边索引 O(1) 查找，避免全量遍历 O(N*E)
const referenceImages = computed(() => {
  const upstreamEdges = canvasStore.edgesByTarget.get(props.id) || []
  if (upstreamEdges.length === 0) return []

  const nodeIndex = canvasStore.nodesById
  const upstreamImages = []

  for (const edge of upstreamEdges) {
    const node = nodeIndex.get(edge.source)
    if (!node?.data) continue
    if (VIDEO_NODE_TYPES.includes(node.type)) continue

    // 源节点优先使用 sourceImages，与画布显示一致
    if (node.data.nodeRole === 'source' && node.data.sourceImages?.length > 0) {
      upstreamImages.push(...node.data.sourceImages)
    }
    // 非源节点优先使用输出结果
    else if (node.data.output?.urls?.length > 0) {
      upstreamImages.push(...node.data.output.urls)
    } else if (node.data.output?.url) {
      upstreamImages.push(node.data.output.url)
    }
    // 兜底使用源图片
    else if (node.data.sourceImages?.length > 0) {
      upstreamImages.push(...node.data.sourceImages)
    }
  }

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

const referenceVideos = computed(() => {
  const upstreamEdges = canvasStore.edgesByTarget.get(props.id) || []
  if (upstreamEdges.length === 0) return []

  const nodeIndex = canvasStore.nodesById
  const upstreamVideos = []

  for (const edge of upstreamEdges) {
    const node = nodeIndex.get(edge.source)
    if (!node?.data || !VIDEO_NODE_TYPES.includes(node.type)) continue

    if (node.data.output?.url) {
      upstreamVideos.push(node.data.output.url)
    } else if (node.data.output?.urls?.length > 0) {
      upstreamVideos.push(...node.data.output.urls.filter(Boolean))
    } else if (node.data.sourceVideo) {
      upstreamVideos.push(node.data.sourceVideo)
    } else if (node.data.videoUrl) {
      upstreamVideos.push(node.data.videoUrl)
    }
  }

  const customOrder = props.data.videoOrder || []
  if (customOrder.length > 0 && upstreamVideos.length > 0) {
    const orderedVideos = []
    const remainingVideos = [...upstreamVideos]

    for (const url of customOrder) {
      const index = remainingVideos.indexOf(url)
      if (index !== -1) {
        orderedVideos.push(url)
        remainingVideos.splice(index, 1)
      }
    }

    orderedVideos.push(...remainingVideos)
    return orderedVideos
  }

  return upstreamVideos
})

function findUpstreamNodeByVideoUrl(url) {
  const upstreamEdges = canvasStore.edgesByTarget.get(props.id) || []
  const nodeIndex = canvasStore.nodesById

  for (const edge of upstreamEdges) {
    const node = nodeIndex.get(edge.source)
    if (!node?.data || !VIDEO_NODE_TYPES.includes(node.type)) continue

    if (node.data.output?.url === url ||
        node.data.output?.urls?.includes(url) ||
        node.data.sourceVideo === url ||
        node.data.videoUrl === url) {
      return node
    }
  }

  return null
}

function getReferenceVideoThumbnail(url) {
  const sourceNode = findUpstreamNodeByVideoUrl(url)
  if (!sourceNode?.data) return ''

  return sourceNode.data.thumbnailUrl ||
    sourceNode.data.thumbnail_url ||
    sourceNode.data.output?.thumbnailUrl ||
    sourceNode.data.output?.thumbnail_url ||
    sourceNode.data.coverUrl ||
    sourceNode.data.cover_url ||
    ''
}

function getReferenceVideoPreviewSrc(url) {
  const thumbnail = getReferenceVideoThumbnail(url)
  if (thumbnail) return toSameOriginUrl(thumbnail)
  return getVideoPosterUrl(toSameOriginUrl(url), 384)
}

const failedReferenceVideoPreviewUrls = ref(new Set())

function shouldShowReferenceVideoImage(url) {
  return !!getReferenceVideoPreviewSrc(url) && !failedReferenceVideoPreviewUrls.value.has(url)
}

function handleReferenceVideoPreviewError(url) {
  failedReferenceVideoPreviewUrls.value = new Set([...failedReferenceVideoPreviewUrls.value, url])
}

const referenceMediaList = computed(() => {
  const list = []
  referenceVideos.value.forEach((url, i) => {
    list.push({
      type: 'video',
      index: i + 1,
      url,
      label: `视频${i + 1}`,
      key: getMediaMentionKey({ type: 'video', url }),
      thumbnailUrl: getReferenceVideoThumbnail(url)
    })
  })
  referenceImages.value.forEach((url, i) => {
    list.push({
      type: 'image',
      index: i + 1,
      url,
      label: `图片${i + 1}`,
      key: getMediaMentionKey({ type: 'image', url })
    })
  })
  return list
})

function updatePromptMentionBindings(bindings) {
  promptMentionBindings.value = bindings || {}
  canvasStore.updateNodeData(props.id, {
    promptMentionBindings: promptMentionBindings.value
  })
}

function syncPromptMentionsWithMedia() {
  const result = syncPromptMediaMentions(promptText.value, promptMentionBindings.value, referenceMediaList.value)
  if (result.text !== promptText.value) {
    promptText.value = result.text
  }
  updatePromptMentionBindings(result.bindings)
}

const highlightedPromptSegments = computed(() => {
  if (!promptText.value) return []
  const segments = []
  const regex = /【?@(视频|图片)\d+】?/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(promptText.value)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: promptText.value.slice(lastIndex, match.index),
        isTag: false,
        start: lastIndex,
        end: match.index
      })
    }
    segments.push({
      text: match[0],
      isTag: true,
      media: getMediaForPromptTag(match[0]),
      start: match.index,
      end: regex.lastIndex
    })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < promptText.value.length) {
    segments.push({
      text: promptText.value.slice(lastIndex),
      isTag: false,
      start: lastIndex,
      end: promptText.value.length
    })
  }
  return segments
})
function getMediaForPromptTag(text) {
  const match = String(text || '').match(/^【?@(视频|图片)(\d+)】?$/)
  if (!match) return null
  const typeMap = { 视频: 'video', 图片: 'image' }
  const index = Number(match[2])
  return referenceMediaList.value.find(item => item.type === typeMap[match[1]] && item.index === index) || null
}

function handlePromptTagHover(media, event) {
  if (media?.type === 'video' && media.url) {
    onVideoHoverStart(media.url, event)
    return
  }
  if (media?.url) onHoverStart(media.url, event)
}

// 点击 chip 时，把 textarea 的光标精准定位到该 chip 字符串的开始或结束位置
// 修复 chip 视觉宽度与 textarea 字符宽度不一致导致光标无法定位的问题
function handlePromptTagMousedown(seg, event) {
  event.preventDefault()
  event.stopPropagation()
  const editor = promptTextareaRef.value
  if (!editor) return
  const tagSegments = highlightedPromptSegments.value.filter(item => item.isTag)
  const segmentIndex = tagSegments.findIndex(item =>
    item === seg ||
    (item.start === seg.start && item.end === seg.end && item.text === seg.text)
  )
  const targetIndex = getPromptMediaTagCaretIndex({
    segments: tagSegments,
    segmentIndex,
    clickX: event.clientX,
    tagRects: Array.from(editor.querySelectorAll('[data-prompt-mention]')).map(el => el.getBoundingClientRect())
  })
  editor.focus()
  nextTick(() => {
    if (editor && Number.isFinite(targetIndex)) {
      restorePromptEditorSelection(editor, targetIndex, targetIndex)
    }
  })
}

function getPromptEditorCaretViewportRect(editor = promptTextareaRef.value) {
  if (!editor || typeof window === 'undefined') return null
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer)) return null
  const rect = range.getBoundingClientRect()
  if (rect && Number.isFinite(rect.left) && (rect.width || rect.height)) return rect
  return editor.getBoundingClientRect()
}

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return getTotalUserPoints(userInfo.value)
})

// 快捷操作 - 初始状态显示 - 使用翻译键
const quickActions = [
  { icon: '↑', labelKey: 'canvas.imageNode.uploadImage', action: () => triggerUpload('upload-image') },
  { icon: '↑', labelKey: 'canvas.imageNode.imageToImage', action: () => triggerUpload('image-to-image') },
  { icon: '↑', labelKey: 'canvas.imageNode.imageToVideo', action: () => triggerUpload('image-to-video') },
  { icon: '⊡', labelKey: 'canvas.imageNode.changeBackground', action: () => triggerUpload('change-background') },
  { icon: '▷', labelKey: 'canvas.imageNode.firstFrameVideo', action: () => triggerUpload('first-frame-video') }
]

// 监听参数变化，保存到store
watch([selectedModel, selectedResolution, selectedAspectRatio, selectedCount, promptText, imageSize, botType], 
  ([model, resolution, aspectRatio, count, prompt, size, bot]) => {
    canvasStore.updateNodeData(props.id, {
      model,
      resolution,
      aspectRatio,
      count,
      prompt,
      imageSize: size,
      botType: bot
    })
  }
)

// 同步 label 变化
watch(() => props.data.label, (newLabel) => {
  if (newLabel !== undefined && newLabel !== localLabel.value) {
    localLabel.value = newLabel
  }
})

// 同步选中状态到 canvasStore（确保工具栏正确显示）
watch(() => props.selected, (isSelected) => {
  if (isSelected) {
    // 当节点被 VueFlow 选中时，确保 store 也同步更新
    if (canvasStore.selectedNodeId !== props.id) {
      console.log('[ImageNode] 同步选中状态到 store:', props.id)
      canvasStore.selectNode(props.id)
    }
    // 节点选中时，自动调整文本框高度以适应已有文本
    nextTick(() => {
      autoResizeTextarea()
    })
  } else {
    // 节点取消选中时，关闭抠图选项弹窗
    if (showCutoutOptions.value) {
      closeCutoutOptions()
    }
  }
}, { immediate: true })

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
  const newLabel = localLabel.value.trim() || 'Image'
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
    localLabel.value = props.data.label || 'Image'
  }
}

// 上传图片到当前节点（不创建新节点）
function handleUploadImageFlow(blobUrl) {
  canvasStore.updateNodeData(props.id, {
    nodeRole: 'source',
    sourceImages: [blobUrl],
    uploadFailed: false,
    uploadError: null,
    _dataLost: false,
    _lostReason: null,
    isUploading: true
  })

  const edges = canvasStore.edges.filter(e => e.source === props.id)
  edges.forEach(edge => {
    canvasStore.updateNodeData(edge.target, {
      referenceImages: [blobUrl]
    })
  })
}

function handleReplaceOutputImageFlow(blobUrl) {
  canvasStore.updateNodeData(props.id, {
    nodeRole: props.data.nodeRole || 'output',
    status: 'success',
    output: {
      ...(props.data.output || {}),
      type: 'image',
      url: blobUrl,
      urls: [blobUrl]
    },
    uploadFailed: false,
    uploadError: null,
    _dataLost: false,
    _lostReason: null,
    isUploading: false
  })
}

// 触发文件上传
function triggerUpload(actionType) {
  pendingAction.value = actionType
  fileInputRef.value?.click()
}

function triggerReplaceOutputUpload() {
  pendingAction.value = REPLACE_OUTPUT_IMAGE_ACTION
  fileInputRef.value?.click()
}

// 处理文件上传 - 优化为异步上传，秒加载体验
async function handleFileUpload(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  const actionType = pendingAction.value
  
  // 重置 input
  event.target.value = ''
  pendingAction.value = null
  
  try {
    // 🚀 优化：立即使用 blob URL 显示图片（秒加载）
    const blobUrl = createTrackedBlobUrl(file)
    console.log('[ImageNode] 秒加载 - 使用 blob URL 预览:', blobUrl)
    
    // 立即执行流程，使用 blob URL 显示
    if (actionType === 'upload-image') {
      handleUploadImageFlow(blobUrl)
    } else if (actionType === REPLACE_OUTPUT_IMAGE_ACTION) {
      handleReplaceOutputImageFlow(blobUrl)
    } else if (actionType === 'image-to-image') {
      await handleImageToImageFlow(blobUrl)
    } else if (actionType === 'image-to-video') {
      await handleImageToVideoFlow(blobUrl)
    } else if (actionType === 'change-background') {
      await handleChangeBackgroundFlow(blobUrl)
    } else if (actionType === 'first-frame-video') {
      await handleFirstFrameVideoFlow(blobUrl)
    }
    
    // 🔄 后台异步上传到服务器（不阻塞UI）
    uploadImageFileAsync(file, blobUrl, props.id)
    
  } catch (error) {
    console.error('[ImageNode] 上传失败:', error)
    await showAlert('图片上传失败，请重试', '错误')
  }
}

// 后台异步上传图片 - 上传完成后静默更新节点URL（不阻塞UI）
async function uploadImageFileAsync(file, blobUrl, nodeId) {
  try {
    console.log('[ImageNode] 后台异步上传开始:', file.name, '大小:', (file.size / 1024).toFixed(2), 'KB')
    
    const urls = await uploadImages([file])
    if (urls && urls.length > 0) {
      const serverUrl = urls[0]
      console.log('[ImageNode] 后台上传成功，服务器URL:', serverUrl)
      
      // 🔧 重要：在释放 blob URL 之前，先保存映射关系
      // 这样即使 blob URL 失效，也可以通过映射找到服务器 URL
      blobToServerUrlMap.set(blobUrl, serverUrl)
      console.log('[ImageNode] 保存 blob->server 映射:', blobUrl.substring(0, 30), '->', serverUrl.substring(0, 60))
      
      // 静默更新节点中的 URL（将 blob URL 替换为服务器 URL）
      const currentNode = canvasStore.nodes.find(n => n.id === nodeId)
      if (currentNode) {
        // 🔧 上传成功后清除上传状态
        canvasStore.updateNodeData(nodeId, { isUploading: false })
        
        // 检查并更新 sourceImages 中的 blob URL
        if (currentNode.data?.sourceImages?.includes(blobUrl)) {
          const updatedSourceImages = currentNode.data.sourceImages.map(
            url => url === blobUrl ? serverUrl : url
          )
          canvasStore.updateNodeData(nodeId, { sourceImages: updatedSourceImages })
          console.log('[ImageNode] 已静默更新 sourceImages:', blobUrl.substring(0, 30), '->', serverUrl.substring(0, 60))
        }
        
        // 也检查 output.url / output.urls（如果图片被移到了输出中）
        if (currentNode.data?.output?.url === blobUrl || currentNode.data?.output?.urls?.includes(blobUrl)) {
          const updatedOutput = {
            ...currentNode.data.output,
            ...(currentNode.data.output.url === blobUrl ? { url: serverUrl } : {})
          }
          if (Array.isArray(updatedOutput.urls)) {
            updatedOutput.urls = updatedOutput.urls.map(
              url => url === blobUrl ? serverUrl : url
            )
          }
          canvasStore.updateNodeData(nodeId, { 
            output: updatedOutput
          })
          console.log('[ImageNode] 已静默更新 output.url/output.urls')
        }
      }
      
      // 同时更新所有下游节点中引用该 blob URL 的地方
      updateDownstreamBlobReferences(blobUrl, serverUrl)
      
      // 释放 blob URL 内存（从跟踪列表中移除）
      revokeTrackedBlobUrl(blobUrl)
    }
  } catch (error) {
    console.warn('[ImageNode] 后台上传失败，保持使用 blob URL:', error.message)
    const currentNode = canvasStore.nodes.find(n => n.id === nodeId)
    if (currentNode) {
      canvasStore.updateNodeData(nodeId, {
        isUploading: false,
        uploadFailed: true,
        uploadError: error.message
      })
      uploadManager.registerFailedUpload(`img_${nodeId}_${Date.now()}`, {
        nodeId, file, type: 'image', blobUrl,
        field: 'sourceImages',
        error: error.message
      })
    }
  }
}

// 更新所有下游节点中引用该 blob URL 的地方
function updateDownstreamBlobReferences(blobUrl, serverUrl) {
  // 遍历所有节点，查找并更新引用该 blob URL 的地方
  for (const node of canvasStore.nodes) {
    let updated = false
    const updates = {}
    
    // 检查 sourceImages
    if (node.data?.sourceImages?.includes(blobUrl)) {
      updates.sourceImages = node.data.sourceImages.map(
        url => url === blobUrl ? serverUrl : url
      )
      updated = true
    }
    
    // 检查 output.url / output.urls
    if (node.data?.output?.url === blobUrl || node.data?.output?.urls?.includes(blobUrl)) {
      updates.output = {
        ...node.data.output,
        ...(node.data.output.url === blobUrl ? { url: serverUrl } : {})
      }
      if (Array.isArray(updates.output.urls)) {
        updates.output.urls = updates.output.urls.map(url => url === blobUrl ? serverUrl : url)
      }
      updated = true
    }
    
    // 检查 referenceImages
    if (node.data?.referenceImages?.includes(blobUrl)) {
      updates.referenceImages = node.data.referenceImages.map(
        url => url === blobUrl ? serverUrl : url
      )
      updated = true
    }
    
    if (updated) {
      canvasStore.updateNodeData(node.id, updates)
      console.log('[ImageNode] 更新下游节点 blob 引用:', node.id)
    }
  }
}

// 上传图片文件 - 立即上传到服务器获取 URL（同步版本，用于编辑等场景）
// 注意：不再回退到 base64，因为 base64 会导致工作流数据过大无法保存
async function uploadImageFile(file) {
  // 立即上传到服务器获取真正的 URL
  console.log('[ImageNode] 上传图片文件到服务器:', file.name, '大小:', (file.size / 1024).toFixed(2), 'KB')
  
  const urls = await uploadImages([file])
  if (urls && urls.length > 0) {
    console.log('[ImageNode] 图片上传成功，URL:', urls[0])
    return urls[0]
  }
  throw new Error('图片上传失败，请检查网络连接后重试')
}

// 图生图流程
async function handleImageToImageFlow(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 1. 当前节点变成源节点（显示上传的图片）
  // 🔧 同时清除上传失败/数据丢失状态，避免重新上传后仍显示错误
  canvasStore.updateNodeData(props.id, {
    nodeRole: 'source',
    sourceImages: [imageUrl],
    title: t('canvas.nodes.image'),
    // 清除错误状态
    uploadFailed: false,
    uploadError: null,
    _dataLost: false,
    _lostReason: null,
    isUploading: true  // 标记正在后台上传
  })
  
  // 2. 创建右侧的输出节点
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x + nodeWidth.value + 100,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    data: { 
      title: t('canvas.nodes.image'),
      nodeRole: 'output', // 输出节点
      referenceImages: [imageUrl] // 传递参考图
    }
  })
  
  // 3. 自动连线
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  // 4. 选中新创建的输出节点
  canvasStore.selectNode(newNodeId)
}

// 图生视频流程
async function handleImageToVideoFlow(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 当前节点变成源节点
  canvasStore.updateNodeData(props.id, {
    nodeRole: 'source',
    sourceImages: [imageUrl]
  })
  
  // 创建视频节点
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  canvasStore.addNode({
    id: newNodeId,
    type: 'video',
    position: {
      x: currentNode.position.x + nodeWidth.value + 100,
      y: currentNode.position.y
    },
    data: { 
      title: t('canvas.nodes.video'),
      referenceImages: [imageUrl]
    }
  })
  
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  canvasStore.selectNode(newNodeId)
}

// 换背景流程
async function handleChangeBackgroundFlow(imageUrl) {
  // 类似图生图，但使用特定的处理类型
  await handleImageToImageFlow(imageUrl)
  // TODO: 可以设置特定的处理参数
}

// 首帧图生视频流程
async function handleFirstFrameVideoFlow(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  canvasStore.updateNodeData(props.id, {
    nodeRole: 'source',
    sourceImages: [imageUrl]
  })
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  canvasStore.addNode({
    id: newNodeId,
    type: 'video',
    position: {
      x: currentNode.position.x + nodeWidth.value + 100,
      y: currentNode.position.y
    },
    data: { 
      title: t('canvas.nodes.video'),
      generationMode: 'first',
      referenceImages: [imageUrl]
    }
  })
  
  canvasStore.addEdge({
    id: `edge_${props.id}_${newNodeId}`,
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  canvasStore.selectNode(newNodeId)
}

// 提取视频尾帧
async function extractLastFrameFromVideo() {
  try {
    console.log('[ImageNode] 开始提取视频尾帧:', props.data.videoUrl)

    if (!canExtractVideoFrameLocally(props.data.videoUrl)) {
      const duration = await loadVideoDuration(props.data.videoUrl)
      const result = await extractVideoFrame({
        videoUrl: props.data.videoUrl,
        time: Math.max(0, duration - 0.12),
        mode: 'last',
        nodeId: props.id
      })

      canvasStore.updateNodeData(props.id, {
        sourceImages: [result.url],
        output: {
          type: 'image',
          url: result.url,
          urls: [result.url]
        },
        nodeRole: 'source',
        needsFrameExtraction: false,
        isUploading: false,
        extractedFrameTime: result.time
      })
      console.log('[ImageNode] 尾帧提取成功，已上传到云端:', result.url)
      return
    }

    // blob/data 视频仍走本地秒显 + 后台上传，保持本地上传体验。
    const video = document.createElement('video')
    video.src = props.data.videoUrl
    
    // 等待视频元数据加载
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve
      video.onerror = reject
      video.load()
    })
    
    // 跳转到最后一帧
    video.currentTime = video.duration - 0.1 // 倒数第0.1秒
    
    // 等待帧加载
    await new Promise((resolve) => {
      video.onseeked = resolve
    })
    
    // 创建 Canvas 并绘制当前帧
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    // 🔧 改进：转为 Blob → blob URL 显示 → 后台上传云端（不再存储 base64）
    const frameBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    const frameBlobUrl = URL.createObjectURL(frameBlob)
    
    console.log('[ImageNode] 尾帧提取成功，正在上传到云端')
    
    // 更新节点数据（使用 blob URL 先显示）
    canvasStore.updateNodeData(props.id, {
      sourceImages: [frameBlobUrl],
      nodeRole: 'source',
      needsFrameExtraction: false, // 标记已完成
      isUploading: true
    })
    
    // 🔧 后台异步上传到云端
    const frameFile = new File([frameBlob], `frame_${Date.now()}.jpg`, { type: 'image/jpeg' })
    uploadImageFileAsync(frameFile, frameBlobUrl, props.id)
    
  } catch (error) {
    console.error('[ImageNode] 提取视频尾帧失败:', error)
    errorMessage.value = '提取视频尾帧失败: ' + error.message
  }
}

function loadVideoDuration(videoUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('读取视频时长超时'))
    }, 10000)

    function cleanup() {
      clearTimeout(timeout)
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
    }

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = Number(video.duration) || 0
      cleanup()
      if (duration > 0) {
        resolve(duration)
      } else {
        reject(new Error('无法读取视频时长'))
      }
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('读取视频时长失败'))
    }
    video.src = videoUrl
    video.load()
  })
}

function canExtractVideoFrameLocally(videoUrl) {
  return !!videoUrl && (videoUrl.startsWith('blob:') || videoUrl.startsWith('data:'))
}

// 重新上传（源节点用）
function handleReupload() {
  pendingAction.value = 'image-to-image'
  fileInputRef.value?.click()
}

// 更新源图片（不创建新节点）- 优化为秒加载
async function updateSourceImage(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  event.target.value = ''
  
  try {
    // 🚀 立即使用 blob URL 显示（秒加载）
    const blobUrl = createTrackedBlobUrl(file)
    console.log('[ImageNode] 更新图片 - 秒加载 blob URL:', blobUrl)
    
    // 🔧 同时清除上传失败状态
    canvasStore.updateNodeData(props.id, {
      sourceImages: [blobUrl],
      uploadFailed: false,
      uploadError: null,
      _dataLost: false,
      _lostReason: null,
      isUploading: true
    })
    
    // 同时更新下游节点的参考图
    const edges = canvasStore.edges.filter(e => e.source === props.id)
    edges.forEach(edge => {
      canvasStore.updateNodeData(edge.target, {
        referenceImages: [blobUrl]
      })
    })
    
    // 🔄 后台异步上传
    uploadImageFileAsync(file, blobUrl, props.id)
    
  } catch (error) {
    console.error('[ImageNode] 更新图片失败:', error)
  }
}

// 获取上游节点的所有提示词（支持多个文本节点连接）
function getUpstreamPrompts() {
  const prompts = []
  
  // 查找所有连接到当前节点的上游边
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  if (upstreamEdges.length === 0) return prompts
  
  // 遍历所有上游节点，收集文本内容
  for (const edge of upstreamEdges) {
    const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
    if (!sourceNode) continue
    
    // 只处理文本节点
    if (sourceNode.type === 'text-input' || sourceNode.type === 'text') {
      // 文本节点：优先获取 LLM 响应，其次是手写文本
      const content = sourceNode.data?.llmResponse || sourceNode.data?.text || ''
      if (content) {
        // 去除 HTML 标签，只保留纯文本
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = content
        const cleanText = (tempDiv.textContent || tempDiv.innerText || '').trim()
        if (cleanText) {
          prompts.push(cleanText)
        }
      }
    }
  }
  
  return prompts
}

// 获取上游节点的最新数据（保留兼容性）
function getUpstreamPrompt() {
  const prompts = getUpstreamPrompts()
  return prompts.length > 0 ? prompts.join('\n') : ''
}

// 并发间隔时间（毫秒）
const CONCURRENT_INTERVAL = 5000

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 将 base64 转换为 File 对象
function base64ToFile(base64String, filename = 'image.png') {
  // 解析 base64 数据
  const arr = base64String.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

// 上传 base64 图片到服务器获取 URL
async function uploadBase64Images(base64Images) {
  const files = base64Images.map((img, index) => 
    base64ToFile(img, `reference_${index + 1}.png`)
  )
  
  console.log('[ImageNode] 上传 base64 图片到服务器...', files.length, '张')
  const urls = await uploadImages(files)
  console.log('[ImageNode] 图片上传成功，获取 URL:', urls)
  return urls
}

// 判断是否是有效的 URL（HTTP/HTTPS 或相对路径）
function isValidUrl(str) {
  if (!str || typeof str !== 'string') return false
  // HTTP/HTTPS URL
  if (str.startsWith('http://') || str.startsWith('https://')) return true
  // 相对路径 URL（以 / 开头，如 /api/images/file/xxx）
  if (str.startsWith('/api/') || str.startsWith('/storage/')) return true
  return false
}

// 判断是否是 base64 数据
function isBase64Image(str) {
  if (!str || typeof str !== 'string') return false
  return str.startsWith('data:')
}

// 判断是否是 blob URL
function isBlobUrl(str) {
  if (!str || typeof str !== 'string') return false
  return str.startsWith('blob:')
}

// 获取图片源的字节大小
async function getImageSourceSize(imageSource) {
  if (isBase64Image(imageSource)) {
    const base64Data = imageSource.split(',')[1]
    if (!base64Data) return 0
    return Math.ceil(base64Data.length * 3 / 4)
  } else if (isBlobUrl(imageSource)) {
    try {
      const response = await fetch(imageSource)
      const blob = await response.blob()
      return blob.size
    } catch {
      return 0
    }
  } else if (isValidUrl(imageSource)) {
    try {
      try {
        const headResponse = await fetch(imageSource, { method: 'HEAD' })
        const contentLength = headResponse.headers.get('content-length')
        if (contentLength) return parseInt(contentLength, 10)
      } catch { /* HEAD 不可用，回退到全量获取 */ }
      const response = await fetch(imageSource)
      const blob = await response.blob()
      return blob.size
    } catch {
      return 0
    }
  }
  return 0
}

// 压缩单张图片到目标字节大小（优先保持像素尺寸不变，先降质量再缩尺寸）
function compressImageToTargetSize(imageSource, targetSizeBytes) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = async () => {
      const origWidth = img.width
      const origHeight = img.height
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      // Phase 1: 保持原始尺寸，逐步降低 JPEG 质量
      canvas.width = origWidth
      canvas.height = origHeight
      ctx.drawImage(img, 0, 0, origWidth, origHeight)

      let quality = 0.92
      let blob = null

      while (quality >= 0.1) {
        blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality))
        if (blob && blob.size <= targetSizeBytes) {
          console.log(`[ImageNode] 压缩成功 (质量=${quality.toFixed(2)}): ${origWidth}x${origHeight}, ${(blob.size / 1024 / 1024).toFixed(2)}MB`)
          resolve(blob)
          return
        }
        quality -= 0.05
      }

      // Phase 2: 质量已最低，需要按比例缩小尺寸
      if (blob && blob.size > targetSizeBytes) {
        let scale = Math.sqrt(targetSizeBytes / blob.size) * 0.9
        let attempts = 0

        while (scale > 0.1 && attempts < 10) {
          const newWidth = Math.round(origWidth * scale)
          const newHeight = Math.round(origHeight * scale)
          canvas.width = newWidth
          canvas.height = newHeight
          ctx.clearRect(0, 0, newWidth, newHeight)
          ctx.drawImage(img, 0, 0, newWidth, newHeight)

          blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85))
          if (blob && blob.size <= targetSizeBytes) {
            console.log(`[ImageNode] 压缩成功 (缩放=${scale.toFixed(2)}): ${newWidth}x${newHeight}, ${(blob.size / 1024 / 1024).toFixed(2)}MB`)
            resolve(blob)
            return
          }
          scale *= 0.85
          attempts++
        }
      }

      console.warn(`[ImageNode] 压缩未完全达标，最终大小: ${blob ? (blob.size / 1024 / 1024).toFixed(2) : '?'}MB`)
      resolve(blob)
    }

    img.onerror = () => {
      console.warn('[ImageNode] 压缩失败：图片加载失败', imageSource?.substring?.(0, 60))
      resolve(null)
    }

    img.src = imageSource
  })
}

// 需要前端预压缩的图像模型 API 类型及其对应的单张最大字节数
// 默认传原图，仅对有严格大小要求的 API 类型做前端预压缩
const IMAGE_API_TYPE_LIMITS = {
  'kling': 10 * 1024 * 1024,
  'tencentaigc': 5 * 1024 * 1024,
}

function shouldCompressForImageApiType(apiType) {
  return apiType in IMAGE_API_TYPE_LIMITS
}

function getImageLimitForApiType(apiType) {
  return IMAGE_API_TYPE_LIMITS[apiType] || 0
}

// 根据模型 API 类型决定是否压缩图片
// 默认传原图，仅对有严格大小要求的 API 类型做前端预压缩
async function compressImagesIfNeeded(images, apiType) {
  if (!images || images.length === 0) return images

  if (!shouldCompressForImageApiType(apiType)) {
    console.log(`[ImageNode] API 类型 "${apiType}" 无需前端压缩，传递原图`)
    return images
  }

  const MAX_SIZE = getImageLimitForApiType(apiType)
  console.log(`[ImageNode] API 类型 "${apiType}" 需要压缩，限制 ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB/张`)

  const sizes = await Promise.all(images.map(img => getImageSourceSize(img)))
  console.log('[ImageNode] 输入图片大小检测:', sizes.map(s => (s / 1024 / 1024).toFixed(2) + 'MB'))

  const result = []
  let anyCompressed = false

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const size = sizes[i]

    if (size <= MAX_SIZE || size === 0) {
      result.push(img)
      continue
    }

    console.log(`[ImageNode] 开始压缩图片 ${i + 1}: ${(size / 1024 / 1024).toFixed(2)}MB -> 目标 ${(MAX_SIZE / 1024 / 1024).toFixed(2)}MB`)

    try {
      const compressedBlob = await compressImageToTargetSize(img, MAX_SIZE)

      if (compressedBlob) {
        anyCompressed = true

        if (isBase64Image(img)) {
          const base64 = await new Promise(r => {
            const reader = new FileReader()
            reader.onload = () => r(reader.result)
            reader.readAsDataURL(compressedBlob)
          })
          result.push(base64)
          console.log(`[ImageNode] 图片 ${i + 1} 压缩完成 (base64): ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB`)
        } else if (isBlobUrl(img)) {
          const newBlobUrl = URL.createObjectURL(compressedBlob)
          result.push(newBlobUrl)
          console.log(`[ImageNode] 图片 ${i + 1} 压缩完成 (blob): ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB`)
        } else {
          const file = new File([compressedBlob], `compressed_${Date.now()}_${i}.jpg`, { type: 'image/jpeg' })
          const urls = await uploadImages([file])
          if (urls && urls.length > 0) {
            result.push(urls[0])
            console.log(`[ImageNode] 图片 ${i + 1} 压缩+上传完成: ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB -> ${urls[0].substring(0, 60)}`)
          } else {
            result.push(img)
            console.warn(`[ImageNode] 图片 ${i + 1} 压缩后上传失败，使用原图`)
          }
        }
      } else {
        result.push(img)
        console.warn(`[ImageNode] 图片 ${i + 1} 压缩失败，使用原图`)
      }
    } catch (error) {
      console.error(`[ImageNode] 图片 ${i + 1} 压缩异常:`, error)
      result.push(img)
    }
  }

  if (anyCompressed) {
    const newSizes = await Promise.all(result.map(img => getImageSourceSize(img)))
    const newTotalSize = newSizes.reduce((sum, s) => sum + s, 0)
    const totalSize = sizes.reduce((sum, s) => sum + s, 0)
    console.log('[ImageNode] 压缩完成，总大小:', (newTotalSize / 1024 / 1024).toFixed(2) + 'MB',
      '(压缩前:', (totalSize / 1024 / 1024).toFixed(2) + 'MB)')
  }

  return result
}

// 在所有节点中查找某个 blob URL 是否已被替换为服务器 URL
// 当 blob URL 失效时，可以通过这个函数找到已上传的服务器 URL
function findServerUrlForBlobInNodes(blobUrl) {
  // 遍历所有节点的所有图片 URL 数组
  for (const node of canvasStore.nodes) {
    // 检查 sourceImages - 查找与 blob URL 位置相关的服务器 URL
    // 由于 blob URL 被替换时位置不变，我们检查节点是否曾经有这个 blob URL
    // 如果节点有服务器 URL 但没有 blob URL，可能是已经替换过了
    
    // 检查 output.urls
    if (node.data?.output?.urls) {
      for (const url of node.data.output.urls) {
        // 如果找到了非 blob 的 URL，可能是我们要找的
        if (url && !isBlobUrl(url) && isValidUrl(url)) {
          // 这个逻辑需要更精确，暂时跳过
        }
      }
    }
  }
  
  // 如果映射表中没有，也尝试从上游节点获取最新的 HTTP URL
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  for (const edge of upstreamEdges) {
    const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
    if (!sourceNode?.data) continue
    
    // 获取该节点的所有 HTTP URL（排除 blob URL）
    const httpUrls = []
    if (sourceNode.data.output?.urls) {
      httpUrls.push(...sourceNode.data.output.urls.filter(u => u && !isBlobUrl(u) && isValidUrl(u)))
    }
    if (sourceNode.data.sourceImages) {
      httpUrls.push(...sourceNode.data.sourceImages.filter(u => u && !isBlobUrl(u) && isValidUrl(u)))
    }
    
    // 如果有 HTTP URL，返回第一个
    if (httpUrls.length > 0) {
      console.log('[ImageNode] 从上游节点找到替代 URL:', httpUrls[0].substring(0, 60))
      return httpUrls[0]
    }
  }
  
  return null
}

// 判断是否是七牛云 CDN URL（公开可访问的 URL）
function isQiniuCdnUrl(str) {
  return isPreferredModelMediaUrl(str)
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
  console.log('[ImageNode] 重新上传图片到云端:', url)
  
  try {
    // 获取图片内容
    let fetchUrl = url
    if (url.startsWith('/api/')) {
      // 相对路径，转换为完整 URL
      fetchUrl = getApiUrl(url)
    }
    
    console.log('[ImageNode] 获取图片:', fetchUrl)
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
      console.log('[ImageNode] 重新上传成功，新 URL:', urls[0])
      return urls[0]
    }
    throw new Error('上传返回空 URL')
  } catch (error) {
    console.error('[ImageNode] 重新上传失败:', error)
    // 失败时返回原 URL，让后端尝试处理
    return url
  }
}

// 处理参考图片 URL，确保 AI 模型可以访问
async function ensureAccessibleUrls(imageUrls) {
  const accessibleUrls = []
  
  for (const url of imageUrls) {
    if (isQiniuCdnUrl(url)) {
      // 已经是七牛云 URL，直接使用
      console.log('[ImageNode] 使用七牛云 URL:', url.substring(0, 60))
      accessibleUrls.push(url)
    } else if (url.startsWith('blob:')) {
      // 🔧 修复：blob URL 无法被外部 AI 服务访问，必须上传到云端
      console.log('[ImageNode] blob URL 需要上传到云端:', url.substring(0, 60))
      try {
        // 从 blob URL 获取图片数据
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`获取 blob 图片失败: ${response.status}`)
        }
        const blob = await response.blob()
        const file = new File([blob], `blob_${Date.now()}.png`, { type: blob.type || 'image/png' })
        
        // 上传到服务器（服务器会上传到云存储）
        const urls = await uploadImages([file])
        if (urls && urls.length > 0) {
          console.log('[ImageNode] blob 上传成功，新 URL:', urls[0])
          accessibleUrls.push(urls[0])
        } else {
          console.error('[ImageNode] blob 上传失败：返回空结果')
          // blob URL 无法回退，跳过这张图片
        }
      } catch (error) {
        console.error('[ImageNode] blob URL 处理失败:', error)
        // blob URL 无法回退，跳过这张图片
      }
    } else if (needsReupload(url)) {
      // 需要重新上传到云端
      console.log('[ImageNode] 需要重新上传:', url.substring(0, 60))
      const newUrl = await reuploadToCloud(url)
      accessibleUrls.push(newUrl)
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // 其他 HTTP URL，假设可访问
      accessibleUrls.push(url)
    } else if (url.startsWith('/api/') || url.startsWith('/storage/')) {
      // 相对路径，转换为完整 URL
      const fullUrl = getApiUrl(url)
      // 检查是否需要重新上传
      if (needsReupload(fullUrl)) {
        const newUrl = await reuploadToCloud(url)
        accessibleUrls.push(newUrl)
      } else {
        accessibleUrls.push(fullUrl)
      }
    } else if (url.startsWith('data:image/')) {
      // 🔧 修复：base64 图片也需要上传到云端（某些 AI 服务不支持 base64）
      console.log('[ImageNode] base64 图片需要上传到云端')
      try {
        // 将 base64 转换为 Blob
        const matches = url.match(/^data:image\/(\w+);base64,(.+)$/)
        if (matches) {
          const imageType = matches[1]
          const base64Data = matches[2]
          const byteCharacters = atob(base64Data)
          const byteNumbers = new Array(byteCharacters.length)
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }
          const byteArray = new Uint8Array(byteNumbers)
          const blob = new Blob([byteArray], { type: `image/${imageType}` })
          const file = new File([blob], `base64_${Date.now()}.${imageType}`, { type: blob.type })
          
          const urls = await uploadImages([file])
        if (urls && urls.length > 0) {
          console.log('[ImageNode] base64 上传成功，新 URL:', urls[0])
          accessibleUrls.push(urls[0])
          } else {
            console.error('[ImageNode] base64 上传失败：返回空结果')
          }
        } else {
          console.error('[ImageNode] base64 格式不正确，跳过')
        }
      } catch (error) {
        console.error('[ImageNode] base64 处理失败:', error)
      }
    } else {
      // 其他格式，尝试直接使用
      console.warn('[ImageNode] 未知 URL 格式:', url.substring(0, 60))
      accessibleUrls.push(url)
    }
  }
  
  return normalizeModelImageUrls(accessibleUrls).filter(isPreferredModelMediaUrl)
}

// 获取上游节点的实时图片数据（直接从 store 获取，确保数据最新）
function getUpstreamImagesRealtime() {
  const upstreamImages = []
  const upstreamEdges = canvasStore.edges.filter(e => e.target === props.id)
  
  console.log('[ImageNode] getUpstreamImagesRealtime - 检查上游边数:', upstreamEdges.length)
  
  for (const edge of upstreamEdges) {
    // 直接从 store 的 nodes 数组中获取最新数据
    const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
    if (!sourceNode) {
      console.log('[ImageNode] 未找到上游节点:', edge.source)
      continue
    }
    
    console.log('[ImageNode] 检查上游节点:', {
      id: sourceNode.id,
      type: sourceNode.type,
      hasOutput: !!sourceNode.data?.output,
      outputUrls: sourceNode.data?.output?.urls,
      sourceImages: sourceNode.data?.sourceImages
    })
    
    // 源节点优先使用 sourceImages，与画布显示一致
    if (sourceNode.data?.nodeRole === 'source' && sourceNode.data?.sourceImages?.length > 0) {
      console.log('[ImageNode] 源节点从 sourceImages 获取图片:', sourceNode.data.sourceImages.length, '张')
      upstreamImages.push(...sourceNode.data.sourceImages)
    } else if (sourceNode.data?.output?.urls?.length > 0) {
      console.log('[ImageNode] 从 output.urls 获取图片:', sourceNode.data.output.urls.length, '张')
      upstreamImages.push(...sourceNode.data.output.urls)
    } else if (sourceNode.data?.output?.url) {
      console.log('[ImageNode] 从 output.url 获取图片')
      upstreamImages.push(sourceNode.data.output.url)
    } else if (sourceNode.data?.sourceImages?.length > 0) {
      console.log('[ImageNode] 从 sourceImages 获取图片:', sourceNode.data.sourceImages.length, '张')
      upstreamImages.push(...sourceNode.data.sourceImages)
    } else {
      console.log('[ImageNode] 上游节点没有可用的图片数据')
    }
  }
  
  console.log('[ImageNode] 实时获取上游图片总数:', upstreamImages.length)
  return upstreamImages
}

// 单次生成请求
// @param {string} finalPrompt - 最终提示词（包含预设提示词）
// @param {string} userPrompt - 用户原始输入（不含预设提示词，用于历史记录显示）
async function sendImageGenerateRequest(finalPrompt, userPrompt = null) {
  // 直接从 store 获取上游节点的最新图片数据（确保数据实时性）
  const currentReferenceImages = getUpstreamImagesRealtime()
  
  // 如果实时获取为空，尝试使用 computed 属性作为后备
  const finalReferenceImages = currentReferenceImages.length > 0 
    ? currentReferenceImages 
    : referenceImages.value
  
  console.log('[ImageNode] ========== 开始生成 ==========')
  console.log('[ImageNode] 实时获取的参考图:', currentReferenceImages.length, '张')
  console.log('[ImageNode] computed 属性的参考图:', referenceImages.value.length, '张')
  console.log('[ImageNode] 最终使用的参考图:', finalReferenceImages)
  
  // 仅对有严格大小要求的模型 API 类型做前端预压缩，其他类型传原图
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  const currentApiType = currentModel?.apiType || ''
  const normalizedReferenceImages = normalizeModelImageUrls(finalReferenceImages)
  const imagesToProcess = await compressImagesIfNeeded(normalizedReferenceImages, currentApiType)
  
  // 解析比例：auto 模式下根据是否有参考图自动确定比例
  let resolvedAspectRatio = selectedAspectRatio.value
  if (resolvedAspectRatio === 'auto') {
    const firstImageSrc = imagesToProcess.length > 0 ? imagesToProcess[0] : null
    resolvedAspectRatio = await resolveAutoAspectRatio(firstImageSrc)
  }

  // 构建基础参数
  const selectedTenantPresetId = selectedPreset.value.startsWith('tenant-')
    ? (availablePresets.value.find(p => p.id === selectedPreset.value)?._rawId || props.data?.selectedPresetRawId || '')
    : ''
  const baseParams = {
    prompt: finalPrompt || '保持原图风格',
    userPrompt: userPrompt || finalPrompt || '',
    model: selectedModel.value,
    aspectRatio: resolvedAspectRatio,
    aspectRatioMode: selectedAspectRatio.value,
    count: 1, // 单次请求固定为1
    // 所有模型都传递 image_size 参数
    image_size: imageSize.value || '2K',
    quality: 'high',
    // MJ 模型的 botType 参数（写实/动漫）
    ...(isMJModel.value && { botType: botType.value }),
    // Seedream 组图生成参数
    enableGroupGeneration: enableGroupGeneration.value,
    maxGroupImages: maxGroupImages.value,
    imagePresetId: selectedTenantPresetId,
    // Seedream 5.0 Lite 联网搜索参数
    ...(isSeedream50LiteModel.value && { webSearch: enableWebSearch.value })
  }
  
  if (imagesToProcess.length > 0) {
    // 图生图模式：需要确保所有图片都是有效的 URL
    let imageUrls = []
    
    // 分离不同类型的图片
    const base64Images = []
    const blobUrls = []
    const httpUrls = []
    
    for (const img of imagesToProcess) {
      if (isBase64Image(img)) {
        base64Images.push(img)
      } else if (isBlobUrl(img)) {
        blobUrls.push(img)
      } else if (isValidUrl(img)) {
        httpUrls.push(img)
      } else {
        // 未知格式，记录警告但跳过
        console.warn('[ImageNode] 未知图片格式，跳过:', img?.substring?.(0, 80) || img)
      }
    }
    
    console.log('[ImageNode] 参考图片分类:', {
      base64Count: base64Images.length,
      blobCount: blobUrls.length,
      httpUrlCount: httpUrls.length
    })
    
    // 上传 base64 图片
    if (base64Images.length > 0) {
      try {
        console.log('[ImageNode] 上传 base64 图片到服务器...')
        const uploadedUrls = await uploadBase64Images(base64Images)
        if (uploadedUrls && uploadedUrls.length > 0) {
          imageUrls.push(...uploadedUrls)
          console.log('[ImageNode] base64 图片上传成功:', uploadedUrls.length, '张')
        }
      } catch (e) {
        console.error('[ImageNode] base64 图片上传失败:', e)
        throw new Error('参考图片上传失败，请重试')
      }
    }
    
    // 处理 blob URL：需要先转换为 File 再上传
    if (blobUrls.length > 0) {
      console.log('[ImageNode] 处理 blob URL...', blobUrls.length, '个')
      let processedCount = 0
      let failedCount = 0
      
      for (const blobUrl of blobUrls) {
        try {
          // 🔧 优先检查映射表中是否已有服务器 URL（blob URL 可能已被异步上传并 revoke）
          const cachedServerUrl = blobToServerUrlMap.get(blobUrl)
          if (cachedServerUrl) {
            console.log('[ImageNode] 从映射表获取服务器 URL:', cachedServerUrl.substring(0, 60))
            imageUrls.push(cachedServerUrl)
            processedCount++
            continue
          }
          
          // 尝试 fetch blob URL
          const response = await fetch(blobUrl)
          if (!response.ok) {
            throw new Error(`Fetch failed: ${response.status}`)
          }
          const blob = await response.blob()
          const file = new File([blob], `blob_image_${Date.now()}.png`, { type: blob.type || 'image/png' })
          const urls = await uploadImages([file])
          if (urls && urls.length > 0) {
            imageUrls.push(urls[0])
            // 保存到映射表
            blobToServerUrlMap.set(blobUrl, urls[0])
            processedCount++
          }
        } catch (e) {
          console.warn('[ImageNode] blob URL 处理失败，尝试查找替代 URL:', blobUrl.substring(0, 30), e.message)
          
          // 🔧 blob URL 失效时的降级策略：
          // 1. 再次检查映射表（可能在处理过程中被更新）
          const fallbackUrl = blobToServerUrlMap.get(blobUrl)
          if (fallbackUrl) {
            console.log('[ImageNode] 使用映射表中的服务器 URL:', fallbackUrl.substring(0, 60))
            imageUrls.push(fallbackUrl)
            processedCount++
            continue
          }
          
          // 2. 查找上游节点是否已有对应的服务器 URL
          const serverUrlFromNode = findServerUrlForBlobInNodes(blobUrl)
          if (serverUrlFromNode) {
            console.log('[ImageNode] 从节点数据找到服务器 URL:', serverUrlFromNode.substring(0, 60))
            imageUrls.push(serverUrlFromNode)
            processedCount++
            continue
          }
          
          // 3. 都没找到，记录失败
          failedCount++
          console.error('[ImageNode] 无法找到 blob URL 的替代 URL:', blobUrl.substring(0, 30))
        }
      }
      
      console.log('[ImageNode] blob URL 处理完成:', processedCount, '成功,', failedCount, '失败')
      
      if (processedCount === 0 && failedCount > 0 && imageUrls.length === 0 && httpUrls.length === 0) {
        throw new Error('参考图片已失效（blob URL 过期），请重新上传图片或刷新页面后重试')
      }
    }
    
    // 添加已有的 URL
    imageUrls.push(...httpUrls)
    
    // 验证最终的 URL 列表
    if (imageUrls.length === 0) {
      throw new Error('没有有效的参考图片URL')
    }
    
    console.log('[ImageNode] 图生图请求 - 处理前的参考图片 URLs:', {
      count: imageUrls.length,
      urls: imageUrls
    })
    
    // 🔥 关键：确保所有 URL 都是 AI 模型可以访问的（七牛云 CDN URL）
    // 如果是本地服务器的相对路径，需要重新上传到七牛云
    const accessibleUrls = await ensureAccessibleUrls(imageUrls)
    if (accessibleUrls.length === 0) {
      throw new Error('参考图片未能转换为可访问 URL，请重新上传后重试')
    }
    
    console.log('[ImageNode] 图生图请求 - 处理后的可访问 URLs:', {
      count: accessibleUrls.length,
      urls: accessibleUrls
    })
    
    // 构建完整的请求参数
    const requestParams = {
      ...baseParams,
      images: accessibleUrls
    }
    
    console.log('[ImageNode] 发送图生图请求，完整参数:', JSON.stringify(requestParams, null, 2))
    
    return await generateImageFromImage(requestParams)
  } else {
    // 文生图
    console.log('[ImageNode] 文生图请求:', baseParams)
    return await generateImageFromText(baseParams)
  }
}

// 创建堆叠的输出节点（多批次生成时）
function createStackedOutputNodes(count, basePosition) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return []
  
  const createdNodes = []
  const stackOffset = 8 // 堆叠偏移量
  
  for (let i = 1; i < count; i++) {
    const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const stackPosition = {
      x: currentNode.position.x + stackOffset * i,
      y: currentNode.position.y + stackOffset * i
    }
    
    canvasStore.addNode({
      id: newNodeId,
      type: 'image',
      position: stackPosition,
      zIndex: -i, // 堆叠在后面
      data: {
        title: `Image ${i + 1}`,
        nodeRole: 'output',
        status: 'pending',
        isStackedNode: true,
        stackIndex: i,
        parentNodeId: props.id,
        prompt: props.data.prompt,
        model: selectedModel.value,
        aspectRatio: selectedAspectRatio.value,
        imageSize: imageSize.value,
        referenceImages: referenceImages.value
      }
    })
    
    createdNodes.push(newNodeId)
  }
  
  // 更新主节点的堆叠信息
  canvasStore.updateNodeData(props.id, {
    stackedNodeIds: createdNodes,
    isStackParent: true
  })
  
  return createdNodes
}

// 单个节点执行生成任务（后台轮询，不阻塞UI）
// @param {string} nodeId - 节点ID
// @param {string} finalPrompt - 最终提示词（包含预设）
// @param {number} taskIndex - 任务索引
// @param {string} userPrompt - 用户原始输入（不含预设，用于历史记录显示）
function isNativeFetchNetworkError(error) {
  if (error?.code) return false
  const message = error?.message || ''
  return error?.name === 'TypeError' && (
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('Load failed')
  )
}

function normalizeHistoryPrompt(value) {
  return String(value || '').trim()
}

function isHistoryTextMatch(historyText, requestText) {
  const historyValue = normalizeHistoryPrompt(historyText)
  const requestValue = normalizeHistoryPrompt(requestText)
  if (!historyValue || !requestValue) return false
  return historyValue === requestValue ||
    historyValue.includes(requestValue) ||
    requestValue.includes(historyValue) ||
    historyValue.startsWith(requestValue.slice(0, 30)) ||
    requestValue.startsWith(historyValue.slice(0, 30))
}

function isHistoryPromptMatch(item, { prompt, userPrompt }) {
  const requestPrompts = [userPrompt, prompt].map(normalizeHistoryPrompt).filter(Boolean)
  const historyPrompts = [item?.prompt, item?.fullPrompt, item?.user_prompt].map(normalizeHistoryPrompt).filter(Boolean)
  if (!requestPrompts.length || !historyPrompts.length) return false
  return historyPrompts.some(historyText => requestPrompts.some(requestText => isHistoryTextMatch(historyText, requestText)))
}

function isHistoryModelMatch(historyModel, model) {
  const historyValue = String(historyModel || '').trim().toLowerCase()
  const modelValue = String(model || '').trim().toLowerCase()
  if (!historyValue || !modelValue) return true
  return historyValue === modelValue || historyValue.includes(modelValue) || modelValue.includes(historyValue)
}

function pickBestHistoryMatch(items, { prompt, userPrompt, submittedAt, model }) {
  const minCreatedAt = submittedAt - 60000
  return items
    .filter(item => item?.type === 'image' && item?.url)
    .map(item => ({
      item,
      createdAt: item.created_at ? new Date(item.created_at).getTime() : 0
    }))
    .filter(({ item, createdAt }) => (
      Number.isFinite(createdAt) &&
      createdAt >= minCreatedAt &&
      isHistoryPromptMatch(item, { prompt, userPrompt })
    ))
    .sort((a, b) => {
      const aLate = a.createdAt >= submittedAt ? 1 : 0
      const bLate = b.createdAt >= submittedAt ? 1 : 0
      if (aLate !== bLate) return bLate - aLate
      const aDistance = Math.abs(a.createdAt - submittedAt)
      const bDistance = Math.abs(b.createdAt - submittedAt)
      if (aDistance !== bDistance) return aDistance - bDistance
      const aModelMatch = isHistoryModelMatch(a.item.model, model) ? 1 : 0
      const bModelMatch = isHistoryModelMatch(b.item.model, model) ? 1 : 0
      if (aModelMatch !== bModelMatch) return bModelMatch - aModelMatch
      return b.createdAt - a.createdAt
    })[0]?.item || null
}

async function reconcileNodeFromHistory(nodeId, { prompt, userPrompt, submittedAt, model }) {
  const maxAttempts = 6
  const intervalMs = 5000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await delay(intervalMs)

    try {
      const spaceParams = teamStore.getSpaceParams('current')
      const data = await getHistory({
        type: 'image',
        spaceType: spaceParams.spaceType,
        ...(spaceParams.teamId ? { teamId: spaceParams.teamId } : {}),
        limit: 20,
        noCache: true
      })
      const history = Array.isArray(data?.history) ? data.history : []
      const matched = pickBestHistoryMatch(history, { prompt, userPrompt, submittedAt, model })

      if (matched?.url) {
        canvasStore.updateNodeData(nodeId, {
          status: 'success',
          progress: null,
          error: null,
          _reconciling: false,
          output: { type: 'image', urls: [matched.url], url: matched.url }
        })
        invalidateCanvasHistory()
        return true
      }
    } catch (historyError) {
      // 历史接口本身可能抖动，继续下一轮核对。
      console.warn('[ImageNode] 历史对账失败，继续重试:', historyError)
    }
  }

  canvasStore.updateNodeData(nodeId, {
    status: 'error',
    progress: null,
    _reconciling: false,
    error: '网络异常，未能确认生成结果，请查看历史记录'
  })
  return false
}

async function executeNodeGeneration(nodeId, finalPrompt, taskIndex, userPrompt = null) {
  const targetNode = canvasStore.nodes.find(n => n.id === nodeId)
  const submittedAt = targetNode?.data?.processingStartedAt || Date.now()
  try {
    canvasStore.updateNodeData(nodeId, {
      status: 'processing',
      progress: '生成中...',
      processingStartedAt: submittedAt,
      taskType: 'image',
      safetyError: null
    })

    const result = await sendImageGenerateRequest(finalPrompt, userPrompt)
    
    if (result.task_id || result.id) {
      const taskId = result.task_id || result.id
      console.log(`[ImageNode] 任务 ${taskIndex + 1} 已提交:`, taskId)
      
      // 注册到后台任务管理器（即使用户离开画布也继续执行）
      // 🔧 修复：统一使用 backgroundTaskManager 进行轮询，避免双重轮询导致页面卡顿
      const currentTab = canvasStore.getCurrentTab()
      registerTask({
        taskId,
        type: 'image',
        nodeId,
        tabId: currentTab?.id,
        metadata: {
          prompt: finalPrompt,
          model: selectedModel.value,
          imageSize: imageSize.value
        }
      })

      // 立即把 taskId 写回节点 data，确保刷新/离开画布后仍能由 zombie 恢复机制
      // 续上轮询，否则节点会永久停在"生成中"。
      canvasStore.updateNodeData(nodeId, {
        taskId,
        taskType: 'image'
      })

      // ⚠️ 不再调用 pollTaskStatus，使用 backgroundTaskManager 统一轮询
      // backgroundTaskManager 会通过事件通知任务状态变化
      // 事件监听已在 onMounted 中设置：background-task-complete/failed/progress
      
      // 任务已提交，立即返回 taskId（不等待轮询结果）
      return taskId
    } else if (result.url) {
      canvasStore.updateNodeData(nodeId, {
        status: 'success',
        output: { type: 'image', urls: [result.url] }
      })
      return result.url
    }
    
    throw new Error('未获取到生成结果')
  } catch (error) {
    const errorDetail = {
      name: error.name,
      message: error.message,
      code: error.code,
      safety: error.safety,
      payload: error.payload,
      stack: error.stack,
      model: selectedModel.value,
      hasReferenceImages: referenceImages.value.length > 0,
      referenceImageCount: referenceImages.value.length
    }
    console.error(`[ImageNode] 任务 ${taskIndex + 1} 失败:`, error)
    console.error(`[ImageNode] 错误详情:`, errorDetail)
    if (!isNativeFetchNetworkError(error)) {
      if (isPromptSafetyBlockedError(error)) {
        canvasStore.updateNodeData(nodeId, {
          status: 'error',
          error: error.message,
          safetyError: {
            code: error.code,
            message: error.message,
            safety: error.safety,
            payload: error.payload
          }
        })
      } else {
        canvasStore.updateNodeData(nodeId, {
          status: 'error',
          error: error.message
        })
      }
      return { error: error.message, detail: errorDetail }
    }

    // 原生 fetch 丢包可能发生在后端已受理之后，先从历史记录自动对账。
    canvasStore.updateNodeData(nodeId, {
      status: 'processing',
      progress: '网络波动，正在核对结果...',
      _reconciling: true
    })
    const reconciled = await reconcileNodeFromHistory(nodeId, {
      prompt: finalPrompt,
      userPrompt,
      submittedAt,
      model: selectedModel.value
    })
    return reconciled
      ? { reconciled: true }
      : { error: '网络异常，未能确认生成结果，请查看历史记录', detail: errorDetail }
  }
}

const NEW_OUTPUT_NODE_VERTICAL_GAP = 80

function parseAspectRatioValue(value) {
  const match = String(value || '').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { width, height }
}

function getCurrentNodeDisplayHeight(currentNode) {
  const measuredHeight = Number(currentNode.dimensions?.height || 0)
  const savedHeight = Number(currentNode.data?.nodeHeight || currentNode.data?.height || nodeHeight.value || 0)
  const displayWidth = Number(currentNode.dimensions?.width || currentNode.data?.nodeWidth || currentNode.data?.width || nodeWidth.value || 380)
  const naturalWidth = Number(currentNode.data?.originalWidth || currentNode.data?.imageWidth || 0)
  const naturalHeight = Number(currentNode.data?.originalHeight || currentNode.data?.imageHeight || 0)
  const naturalMediaHeight = naturalWidth > 0 && naturalHeight > 0
    ? displayWidth * (naturalHeight / naturalWidth)
    : 0
  const ratio = parseAspectRatioValue(currentNode.data?.aspectRatio || selectedAspectRatio.value)
  const ratioMediaHeight = ratio
    ? displayWidth * (ratio.height / ratio.width)
    : 0

  return Math.ceil(Math.max(measuredHeight, savedHeight, naturalMediaHeight, ratioMediaHeight, nodeHeight.value || 320))
}

function hasExistingMediaContent() {
  return props.data?.sourceImages?.length > 0 ||
    props.data?.output?.urls?.length > 0 ||
    props.data?.output?.url ||
    props.data?.generatedImage ||
    props.data?.imageUrl
}

// 创建新的图像节点用于接收新任务（当前节点已有内容或正在生成中时使用）
function createNewOutputNode() {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return null
  
  const displayHeight = getCurrentNodeDisplayHeight(currentNode)
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x,
    y: currentNode.position.y + displayHeight + NEW_OUTPUT_NODE_VERTICAL_GAP
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: newNodePosition,
    zIndex: (currentNode.zIndex || 0) + 1,
    data: {
      title: t('canvas.nodes.image'),
      nodeRole: 'output',
      status: 'idle',
      prompt: promptText.value,
      model: selectedModel.value,
      aspectRatio: selectedAspectRatio.value,
      imageSize: imageSize.value,
      referenceImages: referenceImages.value,
      // 复制上游连接
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
  
  console.log('[ImageNode] 创建新输出节点:', newNodeId)
  return newNodeId
}

// 开始生成（输出节点用）
async function handleGenerate(options = {}) {
  const { fromGroup = false, retry = false } = options
  // 动态获取上游节点的最新提示词（可能有多个文本节点连接）
  const upstreamPrompt = getUpstreamPrompt()
  const userPrompt = promptText.value.trim()
  
  // 获取预设的提示词（如果有选择预设）
  const presetPrompt = currentPresetPrompt.value
  
  // 拼接提示词：上游提示词 + 用户输入的提示词 + 预设提示词
  // 预设提示词附加在最后，用逗号分隔
  let basePrompt = ''
  if (upstreamPrompt && userPrompt) {
    basePrompt = `${upstreamPrompt}\n${userPrompt}`
  } else {
    basePrompt = upstreamPrompt || userPrompt
  }
  
  // 将预设提示词拼接到后面
  let finalPrompt = basePrompt
  if (presetPrompt) {
    if (basePrompt) {
      finalPrompt = `${basePrompt}, ${presetPrompt}`
    } else {
      finalPrompt = presetPrompt
    }
  }
  
  // 将相机控制提示词拼接到最后
  if (cameraControlEnabled.value && cameraSettings.value.prompt) {
    if (finalPrompt) {
      finalPrompt = `${finalPrompt}, ${cameraSettings.value.prompt}`
    } else {
      finalPrompt = cameraSettings.value.prompt
    }
  }
  
  // MJ 模型选择动漫时，自动追加 --niji 7 参数
  if (isMJModel.value && botType.value === 'NIJI_JOURNEY') {
    if (finalPrompt && !finalPrompt.includes('--niji')) {
      finalPrompt = `${finalPrompt} --niji 7`
    } else if (!finalPrompt) {
      finalPrompt = '--niji 7'
    }
  }
  
  console.log('[ImageNode] 生成参数:', {
    userPrompt,
    upstreamPrompt,
    presetPrompt,
    cameraPrompt: cameraControlEnabled.value ? cameraSettings.value.prompt : null,
    finalPrompt,
    selectedPreset: selectedPreset.value,
    model: selectedModel.value,
    imageSize: imageSize.value,
    count: selectedCount.value,
    currentStatus: props.data.status
  })

  if (referenceImages.value.length === 0 && !finalPrompt) {
    if (fromGroup) {
      // 编组执行模式：静默处理
      // 如果节点自身有图片数据（输入节点），标记为 completed 让下游继续
      const hasOwnData = props.data?.sourceImages?.length > 0 ||
                         props.data?.output?.urls?.length > 0 ||
                         props.data?.output?.url
      if (hasOwnData) {
        console.log(`[ImageNode] 编组执行：节点 ${props.id} 为输入节点，已有数据，标记完成`)
        canvasStore.updateNodeData(props.id, { status: 'completed' })
      } else {
        console.log(`[ImageNode] 编组执行跳过节点 ${props.id}：无提示词且无参考图`)
        canvasStore.updateNodeData(props.id, { status: 'skipped' })
      }
      return
    }
    await showAlert('请输入提示词或连接参考图片', '提示')
    return
  }

  if (selectedModelConfig.value?.usable === false) {
    const message = selectedModelConfig.value.accessMessage || '需要购买对应套餐后使用'
    if (fromGroup) {
      console.log(`[ImageNode] 编组执行跳过节点 ${props.id}：模型需要套餐权限`)
      canvasStore.updateNodeData(props.id, { status: 'skipped' })
      return
    }
    await showAlert(message, '模型权限')
    return
  }

  // 检查总积分是否足够
  const totalCost = currentPointsCost.value
  if (userPoints.value < totalCost) {
    if (fromGroup) {
      console.log(`[ImageNode] 编组执行跳过节点 ${props.id}：积分不足`)
      canvasStore.updateNodeData(props.id, { status: 'skipped' })
      return
    }
    await showInsufficientPointsDialog(totalCost, userPoints.value, selectedCount.value)
    return
  }

  // 检查并发限制
  if (selectedCount.value > userConcurrentLimit.value) {
    if (fromGroup) {
      console.log(`[ImageNode] 编组执行跳过节点 ${props.id}：超出并发限制`)
      canvasStore.updateNodeData(props.id, { status: 'skipped' })
      return
    }
    await showAlert(`您的套餐最大支持 ${userConcurrentLimit.value} 次并发，请升级套餐`, '并发限制')
    // 点击确认后，恢复为默认的 1x
    selectedCount.value = 1
    return
  }

  if (!fromGroup && !retry) {
    const duplicateResult = duplicateSubmitGuard.check(buildCanvasSubmitFingerprint({
      nodeId: props.id,
      nodeType: 'image',
      prompt: finalPrompt,
      model: selectedModel.value,
      aspectRatio: selectedAspectRatio.value,
      imageSize: imageSize.value,
      selectedCount: selectedCount.value,
      referenceImages: referenceImages.value,
      enableGroupGeneration: enableGroupGeneration.value,
      maxGroupImages: maxGroupImages.value
    }))
    if (duplicateResult.blocked) {
      await showAlert(duplicateResult.message, '重复提交')
      return
    }
  }
  
  isGenerating.value = true
  errorMessage.value = ''
  
  const generateCount = selectedCount.value

  if (generateCount > 1) {
    canvasStore.saveHistory({ force: true })
  }
  
  const targetNode = (!fromGroup && !retry && props.data.status === 'processing')
    ? canvasStore.duplicateNodeWithIncomingEdges(props.id, {
        offset: { x: 40, y: 40 },
        skipHistory: generateCount > 1
      })
    : null
  const targetNodeId = targetNode?.id || props.id
  
  // 多批次生成时，创建网格输出节点并建立可视编组
  let allNodeIds = [targetNodeId]
  if (generateCount > 1) {
    const currentNode = canvasStore.nodes.find(n => n.id === targetNodeId)
    if (currentNode) {
      const displayWidth = Math.ceil(Number(
        currentNode.dimensions?.width ||
        currentNode.data?.nodeWidth ||
        currentNode.data?.width ||
        nodeWidth.value ||
        380
      ))
      const displayHeight = getCurrentNodeDisplayHeight(currentNode)
      const positions = getBatchGridPositions({
        origin: currentNode.position,
        count: generateCount,
        nodeWidth: displayWidth,
        nodeHeight: displayHeight
      })

      for (let i = 1; i < generateCount; i++) {
        const stackedNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        canvasStore.addNode({
          id: stackedNodeId,
          type: 'image',
          position: positions[i],
          data: {
            title: `Image ${i + 1}`,
            nodeRole: 'output',
            status: 'pending',
            width: displayWidth,
            height: displayHeight,
            prompt: promptText.value,
            model: selectedModel.value,
            aspectRatio: selectedAspectRatio.value,
            imageSize: imageSize.value,
            referenceImages: referenceImages.value
          }
        }, true)
        allNodeIds.push(stackedNodeId)
      }

      canvasStore.createVisibleGroup(allNodeIds, `图片生成 ×${generateCount}`, {
        skipHistory: true,
        defaultWidth: displayWidth,
        defaultHeight: displayHeight
      })
      canvasStore.saveHistory({ force: true })
      console.log('[ImageNode] 创建批量生成编组:', allNodeIds)
    }
  }
  
  // 更新目标节点状态
  canvasStore.updateNodeData(targetNodeId, { 
    status: 'processing',
    nodeRole: 'output',
    output: null,
    generatedImage: null,
    imageUrl: null,
    error: null,
    processingStartedAt: Date.now(),
    progress: generateCount > 1 ? `并行生成 ${generateCount} 张...` : '生成中...'
  })
  
  try {
    // 提交所有任务（任务提交后立即返回，不等待完成）
    // basePrompt 是用户原始输入（不含预设提示词），用于历史记录显示
    const submitPromises = allNodeIds.map((nodeId, index) =>
      executeNodeGeneration(nodeId, finalPrompt, index, basePrompt)
    )
    
    // 等待所有任务提交完成（不是等待任务结果完成）
    const allResults = await Promise.all(submitPromises)
    const successResults = allResults.filter(r => r !== null && !r?.error)
    const failedResults = allResults.filter(r => r?.error)
    const batchSafetyError = findBatchSafetyError(failedResults)
    
    console.log('[ImageNode] 全部任务已提交:', successResults.length, '/', generateCount, 
      failedResults.length > 0 ? '失败详情:' : '', failedResults)
    
    if (successResults.length > 0 && batchSafetyError) {
      const dialog = buildPromptSafetyDialog(batchSafetyError)
      errorMessage.value = dialog.message
      await showAlert(dialog.message, dialog.title, dialog.detail)
    }

    if (successResults.length === 0) {
      const primaryFailure = batchSafetyError
        ? { error: batchSafetyError.message, detail: batchSafetyError }
        : failedResults[0]
      const firstError = primaryFailure?.error || '未知错误'
      const detail = primaryFailure?.detail || {}
      console.error('[ImageNode] 所有任务都失败，首个错误:', firstError, detail)
      const err = new Error(firstError)
      if (detail) {
        err.detail = detail
        err.code = detail.code
        err.safety = detail.safety
        err.payload = detail.payload
      }
      throw err
    }
    
    // 任务提交成功后，立即恢复按钮状态，允许用户继续发起新任务
    isGenerating.value = false
    
  } catch (error) {
    console.error('[ImageNode] 生成失败:', error)
    isGenerating.value = false
    if (error.code === 'concurrent_limit_exceeded') {
      await showAlert(error.message, '并发限制')
      return
    }
    if (isPromptSafetyBlockedError(error)) {
      const dialog = buildPromptSafetyDialog(error)
      errorMessage.value = dialog.message
      canvasStore.updateNodeData(targetNodeId, {
        status: 'error',
        error: dialog.message
      })
      await showAlert(dialog.message, dialog.title, dialog.detail)
      return
    }
    errorMessage.value = error.message || '生成失败'
    canvasStore.updateNodeData(targetNodeId, {
      status: 'error',
      error: error.message
    })
  }
}

// 🔧 已弃用：保留原来的单次生成逻辑作为备用
// ⚠️ 此函数使用旧的 pollTaskStatus 轮询方式，可能导致双重轮询
// 如需启用，请改用 backgroundTaskManager 事件机制
async function handleGenerateSingle() {
  const upstreamPrompt = getUpstreamPrompt()
  const finalPrompt = promptText.value.trim() || upstreamPrompt

  if (referenceImages.value.length === 0 && !finalPrompt) {
    await showAlert('请输入提示词或连接参考图片', '提示')
    return
  }
  
  isGenerating.value = true
  errorMessage.value = ''
  
  canvasStore.updateNodeData(props.id, { 
    status: 'processing',
    processingStartedAt: Date.now(),
    progress: '生成中...'
  })
  
  try {
    const allResults = []
    const generateCount = selectedCount.value
    
    for (let i = 0; i < generateCount; i++) {
      if (i > 0) {
        await delay(CONCURRENT_INTERVAL)
      }
      
      const result = await sendImageGenerateRequest(finalPrompt)
      
      if (result.task_id || result.id) {
        const taskId = result.task_id || result.id
        
        if (i === generateCount - 1) {
          // 🔧 修复：超时时间从 5 分钟改为 12 分钟
          const finalResult = await pollTaskStatus(taskId, 'image', {
            interval: 2000,
            timeout: 15 * 60 * 1000 // 15 分钟
          })
          
          const imageUrl = finalResult.url || finalResult.urls?.[0] || finalResult.images?.[0]
          if (imageUrl) {
            allResults.push(imageUrl)
          }
        }
      } else if (result.url) {
        allResults.push(result.url)
      } else if (result.urls || result.images) {
        const urls = result.urls || result.images || []
        allResults.push(...(Array.isArray(urls) ? urls : [urls]))
      }
    }
    
    // 更新节点输出
    if (allResults.length > 0) {
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        output: {
          type: 'image',
          urls: allResults
        }
      })
      invalidateCanvasHistory()
    } else {
      throw new Error('生成完成但未返回图片URL')
    }
    
  } catch (error) {
    console.error('[ImageNode] 生成失败:', error)
    if (isPromptSafetyBlockedError(error)) {
      const dialog = buildPromptSafetyDialog(error)
      errorMessage.value = dialog.message
      canvasStore.updateNodeData(props.id, {
        status: 'error',
        error: dialog.message
      })
      await showAlert(dialog.message, dialog.title, dialog.detail)
      return
    }
    errorMessage.value = error.message || '生成失败'
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message
    })
  } finally {
    isGenerating.value = false
  }
}

function handleOutputImageError(event, imgUrl, index) {
  const img = event.target
  if (!img) return
  // 第一次失败：先尝试回退到原图（缩略图参数失败时最常见原因）
  if (!img.dataset.fallbackTried) {
    const currentSrc = img.getAttribute('src')
    const originalSrc = getOriginalImageUrl(currentSrc)
    if (originalSrc && originalSrc !== currentSrc) {
      img.dataset.fallbackTried = '1'
      img.src = originalSrc
      return
    }
  }
  // 第二次失败：原图也加载不出来（极少见），走老的时间戳防缓存重试
  console.warn(`[ImageNode] 输出图片加载失败: ${imgUrl?.substring(0, 80)}`, { nodeId: props.id, index })
  if (imgUrl && !img.dataset.retried) {
    img.dataset.retried = 'true'
    setTimeout(() => {
      img.src = imgUrl + (imgUrl.includes('?') ? '&' : '?') + '_t=' + Date.now()
    }, 1000)
  }
}

// 重新生成
function handleRegenerate() {
  handleGenerate({ retry: true })
}

// 处理键盘事件
function handleKeyDown(event) {
  if (showMentionPopup.value) {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      mentionActiveIndex.value = Math.max(0, mentionActiveIndex.value - 1)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      mentionActiveIndex.value = Math.min(referenceMediaList.value.length - 1, mentionActiveIndex.value + 1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (referenceMediaList.value[mentionActiveIndex.value]) {
        handleMentionSelect(referenceMediaList.value[mentionActiveIndex.value])
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      showMentionPopup.value = false
      return
    }
  }

  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    handleGenerate()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    insertPromptEditorPlainText('\n')
  }
}

function handlePromptPaste(event) {
  event.preventDefault()
  const text = (event.clipboardData || window.clipboardData)?.getData('text/plain') || ''
  if (!text) return
  insertPromptEditorPlainText(text)
}

function insertPromptEditorPlainText(text) {
  const editor = promptTextareaRef.value
  if (!editor) return

  const currentText = serializePromptEditorContent(editor)
  if (currentText !== promptText.value) {
    promptText.value = currentText
  }
  const { start, end } = getPromptEditorSelectionRange(editor)
  const before = promptText.value.slice(0, start)
  const after = promptText.value.slice(end)
  const scrollPosition = { scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft }
  promptText.value = before + text + after
  promptEditorRenderKey.value += 1
  nextTick(() => {
    const nextEditor = promptTextareaRef.value || editor
    removePromptEditorOrphanTextNodes(nextEditor)
    const nextPos = start + text.length
    restorePromptEditorSelection(nextEditor, nextPos, nextPos)
    nextEditor.scrollTop = scrollPosition.scrollTop
    nextEditor.scrollLeft = scrollPosition.scrollLeft
    autoResizeTextarea()
  })
}

// 自动调整文本框高度
function autoResizeTextarea() {
  if (hasManualPromptTextareaSize.value) return

  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  // 重置高度以获取正确的 scrollHeight
  textarea.style.height = 'auto'
  
  // 计算最小高度 (4行约96px) 和最大高度 (8行约200px)
  const minHeight = 96
  const maxHeight = 200
  const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))
  
  textarea.style.height = newHeight + 'px'
}

// 监听 promptText 变化，自动调整高度
watch(promptText, () => {
  persistNodePromptDraft(canvasStore, props.id, 'prompt', promptText.value)
  nextTick(() => {
    autoResizeTextarea()
  })
})

watch(
  () => referenceMediaList.value.map(item => `${item.key}:${item.label}`).join('|'),
  () => {
    syncPromptMentionsWithMedia()
  }
)

// 文本框拖动自动滚动功能
const isAutoScrolling = ref(false) // 是否正在自动滚动（用于显示光标）

function startTextareaAutoScroll(event) {
  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  // 只响应左键
  if (event.button !== 0) return

  if (isTextareaResizeHandlePointer(event, textarea)) {
    hasManualPromptTextareaSize.value = true
    return
  }

  isTextareaDragging.value = true
  dragStartY.value = event.clientY
  
  document.addEventListener('mousemove', handleTextareaDragMove)
  document.addEventListener('mouseup', stopTextareaAutoScroll)
}

function handleTextareaDragMove(event) {
  if (!isTextareaDragging.value) return
  
  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  const deltaY = event.clientY - dragStartY.value
  const threshold = 10 // 移动超过10px才开始滚动
  
  if (Math.abs(deltaY) > threshold) {
    // 计算滚动速度，拖动越远速度越快（最大每帧滚动8px）
    const speed = Math.min(Math.abs(deltaY - threshold) * 0.15, 8)
    autoScrollSpeed.value = deltaY > 0 ? speed : -speed
    
    // 设置自动滚动状态，改变光标
    if (!isAutoScrolling.value) {
      isAutoScrolling.value = true
      document.body.style.cursor = 'all-scroll'
      textarea.style.cursor = 'all-scroll'
    }
    
    // 启动自动滚动定时器
    if (!autoScrollTimer.value) {
      autoScrollTimer.value = setInterval(() => {
        if (textarea && autoScrollSpeed.value !== 0) {
          textarea.scrollTop += autoScrollSpeed.value
        }
      }, 16) // 约60fps
    }
  } else {
    // 在阈值内，停止滚动并恢复光标
    autoScrollSpeed.value = 0
    if (isAutoScrolling.value) {
      isAutoScrolling.value = false
      document.body.style.cursor = ''
      textarea.style.cursor = ''
    }
  }
}

function stopTextareaAutoScroll() {
  isTextareaDragging.value = false
  autoScrollSpeed.value = 0
  
  // 恢复光标
  if (isAutoScrolling.value) {
    isAutoScrolling.value = false
    document.body.style.cursor = ''
    const textarea = promptTextareaRef.value
    if (textarea) {
      textarea.style.cursor = ''
    }
  }
  
  if (autoScrollTimer.value) {
    clearInterval(autoScrollTimer.value)
    autoScrollTimer.value = null
  }

  document.removeEventListener('mousemove', handleTextareaDragMove)
  document.removeEventListener('mouseup', stopTextareaAutoScroll)
}

// 组件卸载时清理定时器和光标状态
onUnmounted(() => {
  if (autoScrollTimer.value) {
    clearInterval(autoScrollTimer.value)
    autoScrollTimer.value = null
  }
  // 恢复光标状态
  if (isAutoScrolling.value) {
    document.body.style.cursor = ''
  }
  
  // 🔧 清理所有跟踪的 blob URL，防止内存泄漏
  cleanupAllBlobUrls()
})

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
      nodeWidth.value = Math.max(280, resizeStart.value.width + deltaX / zoom)
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

// 右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: 'image', position: { x: 0, y: 0 }, data: props.data }
  )
}

// 左侧快捷操作菜单显示状态
const showLeftMenu = ref(false)

// 左侧快捷操作列表（图片节点的上游输入）- 使用翻译键
const leftQuickActions = [
  { icon: 'Aa', labelKey: 'canvas.imageNode.prompt', action: () => createUpstreamNode('text-input', t('canvas.imageNode.prompt')) },
  { icon: '◫', labelKey: 'canvas.imageNode.refImage', action: () => createUpstreamNode('image-input', t('canvas.imageNode.refImage')) }
]

// 添加按钮交互
function handleAddLeftClick(event) {
  event.stopPropagation()
  showLeftMenu.value = !showLeftMenu.value
}

// 创建上游节点（连接到当前节点的左侧）
function createUpstreamNode(nodeType, title) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 在左侧创建新节点
  const newNodePosition = {
    x: currentNode.position.x - 450,
    y: currentNode.position.y
  }
  
  // 创建节点数据
  const nodeData = { title }
  
  // 创建新节点
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  canvasStore.addNode({
    id: newNodeId,
    type: nodeType,
    position: newNodePosition,
    data: nodeData
  })
  
  // 创建连接：新节点 → 当前节点
  canvasStore.addEdge({
    id: `edge_${newNodeId}_${props.id}`,
    source: newNodeId,
    target: props.id
  })
  
  // 更新当前节点状态
  canvasStore.updateNodeData(props.id, {
    hasUpstream: true,
    inheritedFrom: newNodeId
  })
  
  // 关闭菜单
  showLeftMenu.value = false
  
  console.log('[ImageNode] 创建上游节点:', { nodeType, title, newNodeId })
}

// 监听点击外部关闭左侧菜单
watch(showLeftMenu, (newValue) => {
  if (newValue) {
    // 延迟添加监听器，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', closeLeftMenu)
    }, 100)
  } else {
    document.removeEventListener('click', closeLeftMenu)
  }
})

// 监听编组整组执行触发
watch(() => props.data.executeTriggered, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal && props.data.triggeredByGroup) {
    // 由编组触发的执行
    console.log(`[ImageNode] 编组触发执行: ${props.id}`)
    // 调用已有的 handleGenerate 方法，传入编组模式标记
    handleGenerate({ fromGroup: true })
  }
})

// 关闭左侧菜单
function closeLeftMenu() {
  showLeftMenu.value = false
}

// ========== 右侧添加按钮交互（单击/长按拖拽） ==========
const LONG_PRESS_DURATION = 300 // 长按阈值（毫秒）
const addRightBtnRef = ref(null)
let pressTimer = null
let isLongPress = false
let pressStartPos = { x: 0, y: 0 }

// 右侧添加按钮 - 鼠标按下（开始检测长按）
function handleAddRightMouseDown(event) {
  event.stopPropagation()
  event.preventDefault()

  console.log('[ImageNode] +号按钮 mousedown', { nodeId: props.id, nodeType: canvasStore.nodes.find(n => n.id === props.id)?.type, status: props.data.status })

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

  console.log('[ImageNode] +号按钮 mouseup', { isLongPress, nodeId: props.id, isDragging: canvasStore.isDraggingConnection })

  if (!isLongPress) {
    // 短按：打开节点选择器
    console.log('[ImageNode] 短按打开 NodeSelector', { nodeId: props.id })
    canvasStore.openNodeSelector(
      { x: event.clientX, y: event.clientY },
      'node',
      props.id
    )
  }
  // 确保拖拽状态被清理（防止卡死）
  if (isLongPress && canvasStore.isDraggingConnection) {
    // 长按拖拽场景：如果 handleGlobalDragConnectionEnd 没有处理，这里兜底
    // 正常情况下 capture 阶段的 handler 会先处理，这里不会执行
  }
}

// 开始拖拽连线 - 直接调用 store 方法
function startDragConnection(event) {
  const buttonPosition = getElementCenterFlowPosition(addRightBtnRef.value, getViewport())
  if (buttonPosition) {
    canvasStore.startDragConnection(props.id, 'output', buttonPosition)
    return
  }

  console.warn('[ImageNode] 无法获取右侧 + 按钮中心，取消拖拽连线', { nodeId: props.id })
}

// 下载图片
function downloadImage() {
  const images = hasOutput.value ? outputImages.value : sourceImages.value
  if (images.length > 0) {
    window.open(images[0], '_blank')
  }
}

// ========== 参考图片管理 ==========
// 触发参考图片上传
function triggerRefImageUpload() {
  console.log('[ImageNode] 触发参考图片上传, refImageInputRef:', refImageInputRef.value)
  if (refImageInputRef.value) {
    refImageInputRef.value.click()
  } else {
    console.error('[ImageNode] refImageInputRef 未绑定!')
  }
}

// 处理参考图片上传
async function handleRefImageUpload(event) {
  const files = event.target.files
  if (!files || files.length === 0) return
  
  // 先将 FileList 转换为数组，避免重置 input 后 FileList 被清空
  // 因为 FileList 是 live collection，重置 input.value 会导致其清空
  const fileArray = Array.from(files)
  
  console.log('[ImageNode] 处理参考图片上传，文件数量:', fileArray.length)
  event.target.value = '' // 重置 input
  
  try {
    for (const file of fileArray) {
      console.log('[ImageNode] 文件信息:', {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      })
      
      // 放宽条件：只要文件名是图片格式就允许上传
      const isImageByName = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name)
      const isImageByType = file.type && file.type.startsWith('image/')
      
      console.log('[ImageNode] 文件类型检查:', {
        isImageByName,
        isImageByType,
        willUpload: isImageByName || isImageByType
      })
      
      if (isImageByName || isImageByType) {
        console.log('[ImageNode] 开始上传图片:', file.name)
        const imageUrl = await uploadImageFile(file)
        console.log('[ImageNode] 图片上传成功，URL:', imageUrl, '准备创建上游节点')
        
        // 确保在下一个tick执行，避免可能的时序问题
        await nextTick()
        
        try {
          console.log('[ImageNode] 即将调用 createUpstreamImageNode')
          createUpstreamImageNode(imageUrl)
          console.log('[ImageNode] createUpstreamImageNode 调用完成')
        } catch (nodeError) {
          console.error('[ImageNode] 创建上游节点失败:', nodeError)
          console.error('[ImageNode] 错误堆栈:', nodeError.stack)
        }
      } else {
        console.warn('[ImageNode] 文件不是图片格式，已跳过:', file.name, '类型:', file.type)
      }
    }
  } catch (error) {
    console.error('[ImageNode] 参考图片上传失败:', error)
    console.error('[ImageNode] 错误详情:', error.message)
    console.error('[ImageNode] 错误堆栈:', error.stack)
  }
}

// 创建上游图片节点
function createUpstreamImageNode(imageUrl) {
  console.log('[ImageNode] createUpstreamImageNode 被调用，imageUrl:', imageUrl, '当前节点ID:', props.id)
  
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) {
    console.error('[ImageNode] 无法找到当前节点:', props.id)
    return
  }
  
  const existingUpstreamCount = canvasStore.edges.filter(e => e.target === props.id).length
  const offsetY = existingUpstreamCount * 200
  
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const newNodePosition = {
    x: currentNode.position.x - 450,
    y: currentNode.position.y + offsetY - 100
  }
  
  console.log('[ImageNode] 准备创建新节点，ID:', newNodeId, '位置:', newNodePosition)
  
  // 使用 image-input 类型，与拖拽上传和文件选择器保持一致
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
  
  console.log('[ImageNode] 节点创建完成，准备添加连接边')
  
  canvasStore.addEdge({
    id: `edge_${newNodeId}_${props.id}`,
    source: newNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  console.log('[ImageNode] 连接边添加完成')
  
  const currentOrder = props.data.imageOrder || [...referenceImages.value]
  canvasStore.updateNodeData(props.id, {
    imageOrder: [...currentOrder, imageUrl],
    hasUpstream: true
  })
  
  console.log('[ImageNode] 上游节点创建完成，imageOrder 已更新')
}

// 删除参考图片（仅断开连线，不删除上游节点）
function removeReferenceImage(index) {
  const currentImages = [...(referenceImages.value || [])]
  const removedImage = currentImages[index]
  currentImages.splice(index, 1)
  
  canvasStore.updateNodeData(props.id, {
    imageOrder: currentImages,
    hasUpstream: currentImages.length > 0 || referenceVideos.value.length > 0
  })
  
  const edgesToRemove = []
  
  canvasStore.edges.forEach(edge => {
    if (edge.target === props.id) {
      const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
      if (!sourceNode?.data) return
      
      const isMatch =
        sourceNode.data.sourceImages?.includes(removedImage) ||
        sourceNode.data.output?.url === removedImage ||
        sourceNode.data.output?.urls?.includes(removedImage)
      
      if (isMatch) {
        edgesToRemove.push(edge.id)
      }
    }
  })
  
  edgesToRemove.forEach(edgeId => canvasStore.removeEdge(edgeId))
}

function removeReferenceVideo(index) {
  const currentVideos = [...(referenceVideos.value || [])]
  const removedVideo = currentVideos[index]
  currentVideos.splice(index, 1)

  canvasStore.updateNodeData(props.id, {
    videoOrder: currentVideos,
    hasUpstream: currentVideos.length > 0 || referenceImages.value.length > 0
  })

  const edgesToRemove = []

  canvasStore.edges.forEach(edge => {
    if (edge.target === props.id) {
      const sourceNode = canvasStore.nodes.find(n => n.id === edge.source)
      if (!sourceNode?.data || !VIDEO_NODE_TYPES.includes(sourceNode.type)) return

      const isMatch =
        sourceNode.data.sourceVideo === removedVideo ||
        sourceNode.data.videoUrl === removedVideo ||
        sourceNode.data.output?.url === removedVideo ||
        sourceNode.data.output?.urls?.includes(removedVideo)

      if (isMatch) {
        edgesToRemove.push(edge.id)
      }
    }
  })

  edgesToRemove.forEach(edgeId => canvasStore.removeEdge(edgeId))
}

// ========== 参考图片 @引用 ==========
/**
 * 点击参考图片缩略图，在提示词光标处插入 @图片N 标记
 */
function insertMediaTag(media) {
  const resolvedMedia = resolveMediaMentionItem(media, referenceMediaList.value)
  const mentionMedia = resolvedMedia || media
  const tag = `@${normalizeMediaMentionLabel(mentionMedia.label)}`
  const editor = promptTextareaRef.value
  if (!editor) {
    const result = replacePromptEditorMentionText({
      text: promptText.value,
      mentionStart: promptText.value.length,
      caret: promptText.value.length,
      replacement: tag,
      appendSpace: true
    })
    promptText.value = result.text
    updatePromptMentionBindings(bindMediaMention(promptMentionBindings.value, mentionMedia))
    return
  }

  const { start, end } = getPromptEditorSelectionRange(editor)
  const currentText = serializePromptEditorContent(editor)
  if (currentText !== promptText.value) {
    promptText.value = currentText
  }
  const activeMention = start === end ? getActivePromptMentionRange(currentText, start) : null
  const scrollPosition = { scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft }
  let resultText, resultCursor
  if (activeMention) {
    const result = replacePromptEditorMentionText({
      text: currentText,
      mentionStart: activeMention.start,
      caret: activeMention.end,
      replacement: tag,
      appendSpace: true
    })
    resultText = result.text
    resultCursor = result.cursor
  } else {
    const before = currentText.slice(0, start)
    const after = currentText.slice(end)
    const prefix = before.length > 0 && before[before.length - 1] !== ' ' && before[before.length - 1] !== '\n' ? ' ' : ''
    const suffix = !after || (after[0] !== ' ' && after[0] !== '\n') ? ' ' : ''
    resultText = before + prefix + tag + suffix + after
    resultCursor = start + prefix.length + tag.length + suffix.length
  }
  promptText.value = resultText
  promptEditorRenderKey.value += 1
  updatePromptMentionBindings(bindMediaMention(promptMentionBindings.value, mentionMedia))

  nextTick(() => {
    const nextEditor = promptTextareaRef.value || editor
    removePromptEditorOrphanTextNodes(nextEditor)
    restorePromptEditorSelection(nextEditor, resultCursor, resultCursor)
    nextEditor.scrollTop = scrollPosition.scrollTop
    nextEditor.scrollLeft = scrollPosition.scrollLeft
  })
}

// IME 中文输入法 composition 状态：composition 期间浏览器会持续触发 input，
// 此时序列化得到的是临时拼音串、再调用 restorePromptEditorSelection 会破坏 IME 选区，
// 因此必须在 composition 期间直接 return，等 compositionend 后再统一处理一次
let isPromptInputComposing = false

function handlePromptCompositionStart() {
  const editor = promptTextareaRef.value
  if (editor) snapPromptEditorCaretOutOfMention(editor)
  isPromptInputComposing = true
}

function handlePromptCompositionEnd(event) {
  isPromptInputComposing = false
  handlePromptInput(event)
}

function handlePromptBeforeInput(event) {
  if (isPromptInputComposing || event?.isComposing) return
  if (event.inputType !== 'insertText' || typeof event.data !== 'string' || !event.data) return
  if (shouldDeferPromptEditorBoundaryBeforeInputForIme(event)) return
  const editor = event.currentTarget || event.target
  snapPromptEditorCaretOutOfMention(editor)
  if (!isPromptEditorSelectionAtMentionBoundary(editor)) return

  const selectionRange = getPromptEditorSelectionRange(editor)
  const currentText = serializePromptEditorContent(editor)
  const next = applyPromptEditorTextInput({
    text: currentText,
    selection: selectionRange,
    data: event.data
  })

  event.preventDefault()
  promptText.value = next.text
  promptEditorRenderKey.value += 1
  showMentionPopup.value = false
  autoResizeTextarea()
  nextTick(() => {
    const nextEditor = promptTextareaRef.value
    if (nextEditor) {
      nextEditor.focus()
      restorePromptEditorSelection(nextEditor, next.cursor, next.cursor)
      autoResizeTextarea()
    }
  })
}

function handlePromptInput(event) {
  if (isPromptInputComposing || event?.isComposing) return
  const editor = event.target
  const selectionRange = getPromptEditorSelectionRange(editor)
  const text = serializePromptEditorContent(editor)
  const wasNonEmpty = !!promptText.value
  if (text !== promptText.value) {
    promptText.value = text
  }
  autoResizeTextarea()
  const shouldRemountEditor = hasPromptEditorOrphanTextNodes(editor) ||
    Array.from(editor.childNodes).some(node => node.nodeType === 1 && node.tagName !== 'SPAN')

  // 当 contenteditable 内容从非空被清空时，浏览器可能已经移除了 Vue 管理的 <span>
  // 子节点（或留下 <br>），导致 Vue 的 vnode 引用失效，下一次 patch 时会抛出
  // "Cannot set properties of null (setting 'vnode')"，并打断 vue-flow 整棵渲染树，
  // 表现为节点无法拖动、连线错位。这里通过 bump renderKey 强制 Vue 重新挂载 prompt-input，
  // 让 vnode 树与真实 DOM 重新对齐。
  if (wasNonEmpty && !text.trim()) {
    promptText.value = ''
    promptEditorRenderKey.value += 1
    showMentionPopup.value = false
    nextTick(() => {
      const nextEditor = promptTextareaRef.value
      if (nextEditor) {
        nextEditor.focus()
        restorePromptEditorSelection(nextEditor, 0, 0)
      }
    })
    return
  }

  if (shouldRemountEditor) {
    promptEditorRenderKey.value += 1
    nextTick(() => {
      const nextEditor = promptTextareaRef.value
      if (nextEditor) {
        nextEditor.focus()
        restorePromptEditorSelection(nextEditor, selectionRange.start, selectionRange.end)
      }
    })
  } else {
    nextTick(() => {
      removePromptEditorOrphanTextNodes(editor)
      restorePromptEditorSelection(editor, selectionRange.start, selectionRange.end)
    })
  }

  const cursorIndex = selectionRange.start
  const textBeforeCursor = text.slice(0, cursorIndex)

  const atIndex = textBeforeCursor.lastIndexOf('@')

  if (atIndex !== -1 && referenceMediaList.value.length > 0) {
    const query = textBeforeCursor.slice(atIndex + 1)

    // 已完成的引用（如 @图片1）不再弹窗
    if (/^(?:视频|图片|音频)\d/.test(query)) {
      showMentionPopup.value = false
      return
    }

    if (query.length < 4 && !/\s/.test(query)) {
      showMentionPopup.value = true
      mentionStartPos = atIndex
      mentionActiveIndex.value = 0

      mentionPosition.value = getMentionPopupPosition({
        caretRect: getPromptEditorCaretViewportRect(editor),
        fallbackRect: editor.getBoundingClientRect()
      })
      return
    }
  }

  showMentionPopup.value = false
}

function handleMentionSelect(media) {
  const editor = promptTextareaRef.value
  if (editor && mentionStartPos >= 0) {
    const resolvedMedia = resolveMediaMentionItem(media, referenceMediaList.value)
    const mentionMedia = resolvedMedia || media
    const tag = `@${normalizeMediaMentionLabel(mentionMedia.label)}`
    const selection = getPromptEditorSelectionRange(editor)
    const currentText = serializePromptEditorContent(editor)
    if (currentText !== promptText.value) {
      promptText.value = currentText
    }
    const result = replacePromptEditorMentionText({
      text: currentText,
      mentionStart: mentionStartPos,
      caret: selection.start,
      replacement: tag,
      appendSpace: true
    })
    const scrollPosition = { scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft }
    promptText.value = result.text
    promptEditorRenderKey.value += 1
    updatePromptMentionBindings(bindMediaMention(promptMentionBindings.value, mentionMedia))
    showMentionPopup.value = false
    mentionStartPos = -1
    nextTick(() => {
      const nextEditor = promptTextareaRef.value || editor
      removePromptEditorOrphanTextNodes(nextEditor)
      restorePromptEditorSelection(nextEditor, result.cursor, result.cursor)
      nextEditor.scrollTop = scrollPosition.scrollTop
      nextEditor.scrollLeft = scrollPosition.scrollLeft
    })
    return
  }
  showMentionPopup.value = false
  mentionStartPos = -1
  insertMediaTag(media)
}

// ========== 参考图片拖拽排序 ==========
function handleImageMouseDown(event) {
  event.stopPropagation()
}

function handleImageDragStart(event, index) {
  event.stopPropagation()
  dragSortIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', index.toString())
  event.target.classList.add('dragging')
}

function handleImageDragOver(event, index) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
}

function handleImageDragLeave(event) {
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
  
  const images = [...(referenceImages.value || [])]
  const [draggedImage] = images.splice(dragIndex, 1)
  images.splice(dropIndex, 0, draggedImage)
  
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

// ========== 参考图片区域拖拽上传 ==========
function handleRefDragEnter(event) {
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  
  if (event.dataTransfer?.types?.includes('Files')) {
    refDragCounter.value++
    isRefDragOver.value = true
  }
}

function handleRefDragOver(event) {
  event.preventDefault()
  
  if (dragSortIndex.value !== -1) {
    event.dataTransfer.dropEffect = 'move'
    return
  }
  
  if (event.dataTransfer?.types?.includes('Files')) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleRefDragLeave(event) {
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  refDragCounter.value--
  if (refDragCounter.value === 0) {
    isRefDragOver.value = false
  }
}

async function handleRefDrop(event) {
  if (dragSortIndex.value !== -1) return
  
  event.preventDefault()
  event.stopPropagation()
  isRefDragOver.value = false
  refDragCounter.value = 0
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  try {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const imageUrl = await uploadImageFile(file)
        createUpstreamImageNode(imageUrl)
      }
    }
  } catch (error) {
    console.error('[ImageNode] 拖拽上传失败:', error)
  }
}

// ========== 拖拽上传图片 ==========
const dragCounter = ref(0) // 用于正确处理子元素的拖拽事件

function handleDragEnter(event) {
  event.preventDefault()
  event.stopPropagation()
  dragCounter.value++
  isDragOver.value = true
}

function handleDragOver(event) {
  event.preventDefault()
  event.stopPropagation()
  // 设置拖拽效果
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave(event) {
  event.preventDefault()
  event.stopPropagation()
  dragCounter.value--
  if (dragCounter.value === 0) {
    isDragOver.value = false
  }
}

async function handleDrop(event) {
  event.preventDefault()
  event.stopPropagation()
  isDragOver.value = false
  dragCounter.value = 0
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  
  // 检查是否为图片文件
  if (!file.type.startsWith('image/')) {
    await showAlert('请拖入图片文件', '提示')
    return
  }
  
  try {
    const imageUrl = await uploadImageFile(file)
    
    // 更新节点图片
    canvasStore.updateNodeData(props.id, {
      nodeRole: 'source',
      sourceImages: [imageUrl]
    })
    
    // 同时更新下游节点的参考图
    const edges = canvasStore.edges.filter(e => e.source === props.id)
    edges.forEach(edge => {
      canvasStore.updateNodeData(edge.target, {
        referenceImages: [imageUrl]
      })
    })
  } catch (error) {
    console.error('[ImageNode] 拖拽上传失败:', error)
    await showAlert('图片上传失败，请重试', '错误')
  }
}
</script>

<template>
  <div ref="nodeRef" :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 隐藏的文件上传 input -->
    <input 
      ref="fileInputRef"
      type="file" 
      accept="image/*"
      style="display: none"
      @change="isSourceNode ? updateSourceImage($event) : handleFileUpload($event)"
    />
    
    <!-- 隐藏的参考图片上传 input（使用唯一ID避免冲突） -->
    <input 
      :id="`ref-image-upload-${id}`"
      ref="refImageInputRef"
      type="file" 
      accept="image/*"
      multiple
      style="display: none"
      @change="handleRefImageUpload"
    />
    
    <!-- 图片工具栏（高清为左侧第一项） -->
    <div v-show="showToolbar" class="image-toolbar">
      <button
        class="toolbar-btn toolbar-btn-hd"
        :class="{ 'is-processing': isImageHDProcessing }"
        title="高清放大"
        :disabled="isImageHDProcessing"
        @mousedown.stop.prevent="handleToolbarImageHD"
        @click.stop.prevent
      >
        <svg v-if="!isImageHDProcessing" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="12" y="15" text-anchor="middle" font-size="8" font-weight="bold" fill="currentColor" stroke="none">HD</text>
        </svg>
        <svg v-else class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
        <span>{{ isImageHDProcessing ? '处理中...' : '高清' }}</span>
      </button>
      <button
        class="toolbar-btn panorama-generate-btn"
        :class="{ 'is-processing': isPanoramaGenerating }"
        title="生成全景图"
        :disabled="isPanoramaGenerating"
        @mousedown.stop.prevent="handleToolbarGeneratePanorama"
        @click.stop.prevent
      >
        <svg v-if="!isPanoramaGenerating" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8s-1.1 5.7-3.3 8M12 4c-2.2 2.3-3.3 5-3.3 8s1.1 5.7 3.3 8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg v-else class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
        <span>{{ isPanoramaGenerating ? '生成中...' : '生成全景图' }}</span>
      </button>
      <div class="toolbar-btn-wrapper image-edit-menu-wrapper">
        <button
          class="toolbar-btn"
          :class="{ active: showImageEditMenu }"
          title="编辑"
          @mousedown.stop.prevent="handleToolbarEditMenuClick"
          @click.stop.prevent
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>编辑</span>
          <svg class="toolbar-dropdown-arrow" :class="{ open: showImageEditMenu }" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <div v-if="showImageEditMenu" class="image-edit-dropdown" @click.stop.prevent @mousedown.stop.prevent>
          <button class="image-edit-dropdown-item" @click="runImageEditAction(handleToolbarEnhance)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>编辑</span>
          </button>
          <button class="image-edit-dropdown-item" @click="runImageEditAction(handleToolbarRepaint)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>重绘</span>
          </button>
          <button class="image-edit-dropdown-item" @click="runImageEditAction(handleToolbarErase)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18.364 5.636a9 9 0 1 1-12.728 0M12 3v9" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4.5 16.5l3-3 3 3-3 3-3-3z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>擦除</span>
          </button>
          <button class="image-edit-dropdown-item" @click="runImageEditAction(handleToolbarSpotHeal)">
            <svg data-icon="spot-heal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14.7 6.3a4 4 0 0 1 0 5.7l-6.4 6.4a4 4 0 0 1-5.7-5.7L9 6.3a4 4 0 0 1 5.7 0z" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M6.5 14.5l3 3M16 4l1-2M19 7l2-1M18 11l2 1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>污点修复</span>
          </button>
          <button
            class="image-edit-dropdown-item"
            :class="{ 'is-processing': isRemovingBackground }"
            :disabled="isRemovingBackground"
            @click="runImageEditAction(handleToolbarCutout)"
          >
            <svg v-if="!isRemovingBackground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="12" cy="12" r="5" stroke-dasharray="3 2"/>
            </svg>
            <svg v-else class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
            </svg>
            <span>{{ isRemovingBackground ? `${removeBgProgress}%` : '抠图' }}</span>
          </button>
          <button
            class="image-edit-dropdown-item"
            :class="{ 'is-processing': isOutpainting }"
            :disabled="isOutpainting"
            @click="runImageEditAction(handleToolbarOutpaint)"
          >
            <svg v-if="!isOutpainting" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="6" y="6" width="12" height="12" rx="1" stroke-dasharray="3 2"/>
              <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" stroke-linecap="round"/>
            </svg>
            <svg v-else class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
            </svg>
            <span>扩图</span>
          </button>
        </div>

        <!-- 抠图选项弹窗 -->
        <Transition name="cutout-popup">
          <div v-if="showCutoutOptions" class="cutout-options-popup" @click.stop>
            <button class="cutout-close-btn" @click="closeCutoutOptions">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="cutout-options-grid">
              <button
                v-for="preset in cutoutBgPresets"
                :key="preset.id"
                class="cutout-option-btn"
                :class="{ 'is-custom': preset.id === 'custom' }"
                @click="preset.id === 'custom' ? null : startCutoutWithBg(preset.id)"
                :title="preset.label"
              >
                <span
                  class="cutout-color-preview"
                  :class="{
                    'transparent-preview': preset.id === 'transparent',
                    'custom-preview': preset.id === 'custom'
                  }"
                  :style="preset.color ? { background: preset.color } : {}"
                >
                  <!-- 自定义颜色的黑白灰SVG icon -->
                  <svg v-if="preset.id === 'custom'" class="custom-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <!-- 调色板形状 -->
                    <path d="M12 2L3 7l9 5 9-5-9-5z" stroke="#888" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3 7v10l9 5 9-5V7" stroke="#888" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- 黑白灰颜色点 -->
                    <circle cx="7.5" cy="11.5" r="1.8" fill="#1a1a1a"/>
                    <circle cx="12" cy="11.5" r="1.8" fill="#666"/>
                    <circle cx="16.5" cy="11.5" r="1.8" fill="#bbb"/>
                  </svg>
                </span>

                <!-- 自定义颜色选择器 -->
                <input
                  v-if="preset.id === 'custom'"
                  type="color"
                  v-model="cutoutCustomColor"
                  class="cutout-color-input"
                  @change="startCutoutWithBg('custom')"
                  title="点击选择颜色"
                />
              </button>
            </div>
          </div>
        </Transition>
      </div>
      <div class="toolbar-btn-wrapper" style="position:relative">
        <button class="toolbar-btn" title="宫格裁剪" @mousedown.stop.prevent="showGridCropMenu('selecting')" @click.stop.prevent>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="9" y1="3" x2="9" y2="21" stroke-linecap="round"/>
            <line x1="15" y1="3" x2="15" y2="21" stroke-linecap="round"/>
            <line x1="3" y1="9" x2="21" y2="9" stroke-linecap="round"/>
            <line x1="3" y1="15" x2="21" y2="15" stroke-linecap="round"/>
          </svg>
          <span>宫格裁剪</span>
        </button>
        <!-- 宫格裁剪菜单：第一步选择宫格大小 -->
        <div v-if="gridCropMenuType === 'selecting'" class="grid-crop-dropdown nodrag nowheel" @click.stop.prevent @mousedown.stop.prevent @pointerdown.stop.prevent>
          <div class="grid-crop-dropdown-title">选择宫格</div>
          <button
            v-for="opt in gridCropSizeOptions"
            :key="opt.type"
            class="grid-crop-dropdown-item"
            @click.stop.prevent="selectGridCropSize(opt)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <template v-if="opt.cols === 2">
                <line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>
              </template>
              <template v-else-if="opt.cols === 3">
                <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
              </template>
              <template v-else-if="opt.cols === 4">
                <line x1="7.2" y1="3" x2="7.2" y2="21"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="16.8" y1="3" x2="16.8" y2="21"/>
                <line x1="3" y1="7.2" x2="21" y2="7.2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="16.8" x2="21" y2="16.8"/>
              </template>
              <template v-else>
                <line x1="6.6" y1="3" x2="6.6" y2="21"/><line x1="10.2" y1="3" x2="10.2" y2="21"/><line x1="13.8" y1="3" x2="13.8" y2="21"/><line x1="17.4" y1="3" x2="17.4" y2="21"/>
                <line x1="3" y1="6.6" x2="21" y2="6.6"/><line x1="3" y1="10.2" x2="21" y2="10.2"/><line x1="3" y1="13.8" x2="21" y2="13.8"/><line x1="3" y1="17.4" x2="21" y2="17.4"/>
              </template>
            </svg>
            <div class="dropdown-item-text">
              <span>{{ opt.label }}裁剪</span>
              <span class="dropdown-hint">{{ opt.cols }}×{{ opt.rows }} 网格</span>
            </div>
          </button>
          <button class="grid-crop-dropdown-cancel" @click.stop.prevent="closeGridCropMenu">取消</button>
        </div>
        <!-- 宫格裁剪菜单：第二步选择操作 -->
        <div v-if="gridCropMenuType && gridCropMenuType !== 'selecting' && gridCropSelectedSize" class="grid-crop-dropdown nodrag nowheel" @click.stop.prevent @mousedown.stop.prevent @pointerdown.stop.prevent>
          <div class="grid-crop-dropdown-title grid-crop-dropdown-title-back" @click.stop.prevent="backToGridSizeSelect">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:4px;">
              <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ gridCropSelectedSize.label }}裁剪
          </div>
          <button class="grid-crop-dropdown-item" @click.stop.prevent="handleGridCropOnly">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>
            </svg>
            <div class="dropdown-item-text">
              <span>仅裁剪</span>
              <span class="dropdown-hint">创建独立图片节点</span>
            </div>
          </button>
          <button class="grid-crop-dropdown-item" @click.stop.prevent="handleGridCropToStoryboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="2" width="20" height="20" rx="2"/>
              <rect x="5" y="5" width="5" height="5" rx="0.5"/><rect x="14" y="5" width="5" height="5" rx="0.5"/>
              <rect x="5" y="14" width="5" height="5" rx="0.5"/><rect x="14" y="14" width="5" height="5" rx="0.5"/>
            </svg>
            <div class="dropdown-item-text">
              <span>创建分镜格子</span>
              <span class="dropdown-hint">自动填充到分镜节点</span>
            </div>
          </button>
          <button class="grid-crop-dropdown-cancel" @click.stop.prevent="closeGridCropMenu">取消</button>
        </div>
      </div>
      <button
        v-if="isPanoramaCandidate"
        class="toolbar-btn panorama-vr-btn"
        title="全景VR预览"
        @mousedown.stop.prevent="openPanoramaPreview"
        @click.stop.prevent
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8s-1.1 5.7-3.3 8M12 4c-2.2 2.3-3.3 5-3.3 8s1.1 5.7 3.3 8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>全景VR</span>
      </button>
      <button class="toolbar-btn" :class="{ active: show3DCamera }" title="3D相机角度" @mousedown.stop.prevent="handleToolbar3DCamera" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <!-- 相机机身 -->
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- 镜头 -->
          <circle cx="12" cy="13" r="4"/>
          <!-- 角度指示 -->
          <path d="M12 9V6" stroke-linecap="round" opacity="0.6"/>
          <path d="M16 13h3" stroke-linecap="round" opacity="0.6"/>
        </svg>
        <span>角度</span>
      </button>
      <button class="toolbar-btn disabled" title="姿态检测（功能开发中）" disabled @mousedown.stop.prevent @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <!-- 人物骨架 -->
          <circle cx="12" cy="4" r="2"/>
          <line x1="12" y1="6" x2="12" y2="14"/>
          <line x1="12" y1="8" x2="8" y2="12"/>
          <line x1="12" y1="8" x2="16" y2="12"/>
          <line x1="12" y1="14" x2="9" y2="20"/>
          <line x1="12" y1="14" x2="15" y2="20"/>
          <!-- 3D 旋转箭头 -->
          <path d="M20 8c0-2-1.5-3-3-3" stroke-linecap="round" opacity="0.6"/>
          <path d="M19 5l1 3 3-1" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
        </svg>
        <span>姿态</span>
      </button>
      <button
        v-if="seedanceFeaturesEnabled"
        class="toolbar-btn seedance-review-btn"
        :class="{ 'is-processing': isQuickSeedanceSubmitting || seedanceQuickAssetStatus === 'processing', active: seedanceQuickAssetStatus === 'approved' }"
        :disabled="isQuickSeedanceSubmitting || seedanceQuickAssetStatus === 'processing'"
        title="提交 Seedance 角色过审"
        @mousedown.stop.prevent="handleQuickSeedanceReview"
        @click.stop.prevent
      >
        <svg v-if="isQuickSeedanceSubmitting || seedanceQuickAssetStatus === 'processing'" class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 3l7 4v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V7l7-4z" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 12l2 2 4-5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{{ seedanceQuickAssetStatus === 'approved' ? '已过审' : seedanceQuickAssetStatus === 'processing' ? '审核中' : '过审' }}</span>
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn icon-only" title="标注" @mousedown.stop.prevent="handleToolbarAnnotate" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="toolbar-btn icon-only" title="裁剪" @mousedown.stop.prevent="handleToolbarCrop" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 2v4M6 18v4M2 6h4M18 6h4M18 18h-8a2 2 0 01-2-2V6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 6h10a2 2 0 012 2v10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="toolbar-btn icon-only" title="下载" @mousedown.stop.prevent @click.stop.prevent="handleToolbarDownload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="toolbar-btn icon-only" title="放大预览" @mousedown.stop.prevent="handleToolbarPreview" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div v-if="showSeedanceQuickBadge" class="seedance-review-badge" :class="{ expired: seedanceQuickAssetStatus === 'expired' }">
      {{ seedanceQuickBadgeText }}
    </div>

    <PanoramaPreviewModal
      v-if="showPanoramaPreview && currentImageUrl"
      :image-url="currentImageUrl"
      :load-image-url="resolvePanoramaImageUrl"
      @close="closePanoramaPreview"
      @export="handlePanoramaExport"
    />
    
    <!-- 3D 相机角度控制面板 -->
    <Teleport to="body">
      <Transition name="camera-panel">
        <Camera3DPanel
          v-if="show3DCamera"
          :image-url="currentImageUrl"
          :initial-angles="cameraAngles"
          :points-cost="multianglePointsCost"
          @update="handleCameraUpdate"
          @apply="handleCameraApply"
          @close="handleCameraClose"
          @generate-start="handleMultiangleGenerateStart"
          @generate-success="handleMultiangleGenerateSuccess"
          @generate-error="handleMultiangleGenerateError"
        />
      </Transition>
    </Teleport>
    
    <!-- 3D 姿态分析面板 -->
    <Pose3DViewer
      :visible="showPose3DViewer"
      :image-url="currentImageUrl"
      @close="handlePose3DClose"
      @apply-angle="handlePose3DApplyAngle"
    />
    
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
    <div class="node-wrapper" ref="nodeWrapperRef">
      <!-- 左侧输入端口 -->
      <Handle
        type="target"
        :position="Position.Left"
        id="input"
        class="node-handle node-handle-hidden"
        :style="{ position: 'absolute', left: '-34px', top: '50%', transform: 'translateY(-50%)' }"
      />

      <!-- 左侧添加按钮 -->
      <button 
        class="node-add-btn node-add-btn-left"
        title="添加上游输入"
        @click="handleAddLeftClick"
      >
        +
      </button>
      
      <!-- 左侧快捷操作菜单 -->
      <div v-if="showLeftMenu" class="left-quick-menu" @click.stop>
        <div 
          v-for="(action, index) in leftQuickActions" 
          :key="index"
          class="left-quick-menu-item"
          @click="action.action"
        >
          <span class="left-menu-icon">{{ action.icon }}</span>
          <span class="left-menu-label">{{ t(action.labelKey) }}</span>
        </div>
      </div>
      
      <!-- 节点卡片 -->
      <div 
        class="node-card" 
        :class="{ 
          'drag-over': isDragOver,
          'is-processing': data.status === 'processing',
          'is-stacked': data.isStackedNode
        }"
        :style="contentStyle"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <!-- 彗星环绕发光特效（生成中显示） -->
        <svg v-if="data.status === 'processing'" class="comet-border" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <!-- 彗星渐变 -->
            <linearGradient :id="'comet-gradient-' + id" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="transparent" />
              <stop offset="70%" stop-color="rgba(74, 222, 128, 0.3)" />
              <stop offset="90%" stop-color="rgba(74, 222, 128, 0.8)" />
              <stop offset="100%" stop-color="#4ade80" />
            </linearGradient>
            <!-- 发光滤镜 -->
            <filter :id="'comet-glow-' + id" x="-50%" y="-50%" width="200%" height="200%">
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
            :stroke="'url(#comet-gradient-' + id + ')'" 
            stroke-width="2"
            stroke-linecap="round"
            :filter="'url(#comet-glow-' + id + ')'"
          />
        </svg>
        <!-- ========== 源节点：显示上传的图片 ========== -->
        <template v-if="isSourceNode && hasSourceImage">
          <!-- 上传按钮（右上角）- 本地上传或图片加载失败时显示，确保失效图也能重新上传 -->
          <button v-if="!isFromHistoryOrAsset || sourceImageLoadFailed" class="upload-overlay-btn" @click="handleReupload">
            <span class="upload-icon">↑</span>
            <span>{{ sourceImageLoadFailed ? '重新上传' : '上传' }}</span>
          </button>
          
          <!-- 拖拽覆盖层 -->
          <div v-if="isDragOver" class="drag-overlay">
            <div class="drag-hint">
              <span class="drag-icon">📷</span>
              <span>放开以更换图片</span>
            </div>
          </div>
          
          <!-- 图片预览 -->
          <div class="source-image-preview" :class="{ 'low-quality': isCanvasDragging }">
            <div
              v-if="sourceImageLoadFailed"
              class="source-image-failed"
              @click="handleReupload"
            >
              <div class="failed-icon">⚠️</div>
              <div class="failed-text">图片加载失败</div>
              <div class="failed-hint">点击此处重新上传</div>
            </div>
            <CanvasNodeImage
              v-else-if="isNodeVisible"
              :src="sourcePreviewImages[0]"
              alt="上传的图片"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              @error="handleSourceImageError"
              @load="scheduleNodeInternalsUpdate"
            />
            <div v-else class="image-placeholder" />
          </div>
        </template>
        
        <!-- ========== 输出节点：显示生成结果或空状态 ========== -->
        <template v-else>
          <!-- 主内容区域 -->
          <div class="node-content">
            <!-- 加载中状态 - 简洁文字显示 -->
            <div v-if="data.status === 'processing'" class="preview-loading">
              <span class="processing-text">{{ data.progress || '生成中' }}</span>
              <span class="processing-duration-text">{{ imageProcessingElapsedText(data) }}</span>
            </div>
            
            <!-- 错误状态 -->
            <div v-else-if="data.status === 'error'" class="preview-error" :class="{ 'content-safety': isContentSafetyError(data.error || errorMessage), 'timeout-error': isTimeoutError(data.error || errorMessage) }">
              <div class="error-icon">{{ isContentSafetyError(data.error || errorMessage) ? '🛡️' : isTimeoutError(data.error || errorMessage) ? '⏱️' : '❌' }}</div>
              <div class="error-text">{{ data.error || errorMessage || '生成失败' }}</div>
              <div v-if="getErrorHint(data.error || errorMessage)" class="error-hint">{{ getErrorHint(data.error || errorMessage) }}</div>
            </div>
            
            <!-- 数据丢失状态（旧格式 blob URL 失效） -->
            <div v-else-if="hasDataLost" class="preview-error data-lost">
              <div class="error-icon">⚠️</div>
              <div class="error-text">{{ dataLostReason }}</div>
              <button class="retry-btn" @click="triggerUpload('image-to-image')">重新上传</button>
            </div>
            
            <!-- 上传中状态 -->
            <div v-else-if="isUploading" class="preview-loading upload-progress">
              <span class="processing-text">上传中...</span>
            </div>
            
            <!-- 上传失败状态 -->
            <div v-else-if="uploadFailed" class="preview-error upload-failed">
              <div class="error-icon">⚠️</div>
              <div class="error-text">文件上传失败，保存时数据可能丢失</div>
              <button class="retry-btn" @click="triggerUpload('image-to-image')">重新上传</button>
            </div>
            
            <!-- 输出预览 -->
            <div 
              v-else-if="hasOutput" 
              class="preview-images"
              :class="{ 
                'single-image': outputImages.length === 1,
                'transparent-bg': props.data?.isTransparent || props.data?.cutoutResult,
                'low-quality': isCanvasDragging
              }"
            >
              <button
                type="button"
                class="preview-output-image-btn output-image-action-btn"
                title="全图预览"
                aria-label="全图预览"
                @mousedown.stop.prevent
                @click.stop="handleToolbarPreview"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M4 8V4m0 0h4M4 4l5 5" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M20 8V4m0 0h-4m4 0l-5 5" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M4 16v4m0 0h4m-4 0l5-5" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M20 16v4m0 0h-4m4 0l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button
                v-if="!props.data?.readonly"
                type="button"
                class="replace-output-image-btn output-image-action-btn"
                title="替换图片"
                aria-label="替换图片"
                @mousedown.stop.prevent
                @click.stop="triggerReplaceOutputUpload"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3 21v-5h5" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M21 3v5h-5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <template v-for="(img, index) in outputImages.slice(0, 4)" :key="img || index">
                <CanvasNodeImage
                  v-if="isNodeVisible"
                  :src="outputPreviewImages[index]"
                  :alt="`生成结果 ${index + 1}`"
                  class="preview-image"
                  :class="{ 'transparent-image': props.data?.isTransparent || props.data?.cutoutResult }"
                  :loading="isCanvasDragging ? 'lazy' : 'eager'"
                  decoding="async"
                  fetchpriority="low"
                  :auto-fallback="false"
                  @error="handleOutputImageError($event, img, index)"
                  @load="scheduleNodeInternalsUpdate"
                />
                <div v-else class="image-placeholder preview-image" />
              </template>
              <div v-if="data._editSaving" class="edit-saving-badge">
                <svg class="edit-saving-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
                保存中
              </div>
            </div>
            
            <!-- 有上游连接时 - 显示等待状态 -->
            <div v-else-if="hasUpstream" class="ready-state">
              <div class="ready-icon">
                <!-- SVG 黑白图标 -->
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="8.5" cy="10" r="1.5" fill="currentColor"/>
                  <path d="M3 15L7 11L10 14L15 9L21 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
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
        </template>
        
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
      
      <!-- 右侧输出端口 -->
      <Handle
        type="source"
        :position="Position.Right"
        id="output"
        class="node-handle node-handle-hidden"
        :style="{ position: 'absolute', right: '-34px', top: '50%', transform: 'translateY(-50%)' }"
      />

      <!-- 右侧添加按钮 - 单击打开选择器，长按/拖拽连线 -->
      <button 
        ref="addRightBtnRef"
        class="node-add-btn node-add-btn-right nodrag"
        title="单击：添加节点 | 长按/拖拽：连接到其他节点"
        @mousedown="handleAddRightMouseDown"
      >
        +
      </button>
    </div>
    
    <!-- 底部配置面板（仅输出节点选中时显示，拖动和缩放时隐藏） -->
    <Teleport to="body" :disabled="!isConfigPanelExpanded">
    <div
      v-if="showConfigPanel"
      ref="configPanelRef"
      class="config-panel"
      :class="{
        'config-panel-readonly': props.data?.readonly,
        'config-panel-expanded': isConfigPanelExpanded,
        'canvas-fixed-prompt-panel': isPromptInputFixedScale && !isConfigPanelExpanded
      }"
      :style="[{ '--config-panel-scale': configPanelScale }, promptInputFixedScaleStyle]"
      @mousedown.stop
      @wheel="handleConfigPanelWheel($event, isConfigPanelExpanded)"
    >
      <button
        class="config-expand-btn"
        type="button"
        :title="isConfigPanelExpanded ? '缩小输入面板' : '放大输入面板'"
        :aria-label="isConfigPanelExpanded ? '缩小输入面板' : '放大输入面板'"
        @click.stop="toggleConfigPanelExpanded"
      >
        <svg v-if="!isConfigPanelExpanded" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 3h6v6" />
          <path d="M21 3l-7 7" />
          <path d="M9 21H3v-6" />
          <path d="M3 21l7-7" />
        </svg>
        <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 14h6v6" />
          <path d="M10 14l-7 7" />
          <path d="M20 10h-6V4" />
          <path d="M14 10l7-7" />
        </svg>
      </button>
      <!-- 参考图片预览（支持拖拽上传和排序） -->
      <div 
        class="panel-frames"
        :class="{ 'drag-over': isRefDragOver }"
        @mousedown.stop
        @dragenter="handleRefDragEnter"
        @dragover="handleRefDragOver"
        @dragleave="handleRefDragLeave"
        @drop="handleRefDrop"
      >
        <div class="panel-frames-header">
          <span class="panel-frames-label">参考图片</span>
          <span class="panel-frames-hint">拖拽图片到此处 · 拖动调整顺序</span>
        </div>
        <div class="panel-frames-list">
          <div
            v-for="(video, index) in referenceVideos"
            :key="'video-' + index"
            class="panel-frame-item panel-frame-video panel-frame-clickable"
            :title="`点击插入 @视频${index + 1}`"
            @click="insertMediaTag({ type: 'video', index: index + 1, label: `视频${index + 1}` })"
            @mouseenter="onVideoHoverStart(video, $event)"
            @mouseleave="onHoverEnd"
          >
            <img
              v-if="shouldShowReferenceVideoImage(video)"
              :src="getReferenceVideoPreviewSrc(video)"
              class="video-thumb"
              alt="参考视频封面"
              loading="lazy"
              decoding="async"
              @error="handleReferenceVideoPreviewError(video)"
            />
            <video
              v-else
              :src="toSameOriginUrl(video)"
              class="video-thumb"
              muted
              preload="metadata"
              @loadeddata="$event.target.currentTime = 0.1"
            ></video>
            <span class="panel-frame-label">{{ index + 1 }}</span>
            <span class="panel-frame-tag-badge">@视频{{ index + 1 }}</span>
            <button class="panel-frame-remove" @click.stop="removeReferenceVideo(index)">×</button>
          </div>
          <!-- 现有图片（支持拖拽排序）- 点击插入 @图片N 标记 -->
          <div
            v-for="(img, index) in referenceImages"
            :key="img + index"
            class="panel-frame-item"
            :class="{
              'drag-over': dragOverIndex === index,
              'dragging': dragSortIndex === index,
              'panel-frame-clickable': true
            }"
            draggable="true"
            :title="`点击插入 @图片${index + 1}`"
            @mousedown="handleImageMouseDown"
            @click="insertMediaTag({ type: 'image', index: index + 1, label: `图片${index + 1}` })"
            @dragstart="handleImageDragStart($event, index)"
            @dragover="handleImageDragOver($event, index)"
            @dragleave="handleImageDragLeave"
            @drop="handleImageDrop($event, index)"
            @dragend="handleImageDragEnd"
            @mouseenter="onHoverStart(img, $event)"
            @mouseleave="onHoverEnd"
          >
            <CanvasNodeImage v-if="isNodeVisible" :src="getNodePreviewImageUrl(img)" :alt="`图片 ${index + 1}`" loading="lazy" decoding="async" fetchpriority="low" />
            <div v-else class="image-placeholder" />
            <span class="panel-frame-label">{{ index + 1 }}</span>
            <span class="panel-frame-tag-badge">@图片{{ index + 1 }}</span>
            <button class="panel-frame-remove" @click.stop="removeReferenceImage(index)">×</button>
          </div>
          <!-- 添加按钮（直接点击触发文件选择） -->
          <div 
            class="panel-frame-add"
            @click.stop="triggerRefImageUpload"
            @mousedown.stop
          >
            <span class="add-icon">+</span>
            <span class="add-text">添加</span>
          </div>
        </div>
        <!-- 拖拽覆盖层 -->
        <div v-if="isRefDragOver" class="panel-drag-overlay">
          <span>释放以添加图片</span>
        </div>
      </div>
      
      <!-- 提示词输入 -->
      <div class="prompt-section">
        <div class="prompt-input-wrapper">
          <div
            :key="promptEditorRenderKey"
            ref="promptTextareaRef"
            class="prompt-input nodrag"
            :class="{ 'is-empty': !promptText }"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            :data-placeholder="referenceImages.length > 0 ? '输入提示词，点击上方图片插入 @图片 引用\n例：让@图片1中的人物换上红色衣服（Ctrl+Enter 生成，Enter 换行）' : '描述你想要生成的内容，并在下方调整生成参数。(Ctrl+Enter 生成，Enter 换行)'"
            @keydown="handleKeyDown"
            @beforeinput="handlePromptBeforeInput"
            @input="handlePromptInput"
            @paste="handlePromptPaste"
            @compositionstart="handlePromptCompositionStart"
            @compositionend="handlePromptCompositionEnd"
            @focus="autoResizeTextarea"
            @wheel.stop
            @mousedown.stop="startTextareaAutoScroll"
            @pointerdown.stop
            @touchstart.stop
            @touchmove.stop
            @touchend.stop
            @touchcancel.stop
            @dblclick.stop
          >
            <span
              v-for="(seg, i) in highlightedPromptSegments"
              :key="i"
              class="prompt-highlight-segment"
              :class="{ 'is-prompt-tag-slot': seg.isTag }"
              :data-prompt-segment-index="i"
              :data-prompt-segment-start="seg.start"
              :data-prompt-segment-end="seg.end"
              :data-prompt-mention="seg.isTag ? seg.text : undefined"
              :contenteditable="seg.isTag ? 'false' : undefined"
            ><PromptMediaTag v-if="seg.isTag" :text="seg.text" :media="seg.media" @mouseenter="handlePromptTagHover(seg.media, $event)" @mouseleave="onHoverEnd" /><template v-else>{{ seg.text }}</template></span>
          </div>
        </div>
        <PromptMentionPopup
          :visible="showMentionPopup"
          :items="referenceMediaList"
          :active-index="mentionActiveIndex"
          :position="mentionPosition"
          @select="handleMentionSelect"
          @update:active-index="mentionActiveIndex = $event"
        />
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
              <ModelIcon :icon="selectedModelIcon" :label="selectedModelLabel" class="model-icon" />
              <span class="model-name">{{ selectedModelLabel }}</span>
              <span class="select-arrow" :class="{ 'arrow-up': isModelDropdownOpen }">▾</span>
            </div>
            
            <!-- 下拉选项列表 -->
            <Transition name="dropdown-fade">
              <div 
                v-if="isModelDropdownOpen" 
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
                    <ModelIcon :icon="m.icon" :label="m.label" class="model-item-icon" />
                    <div class="model-item-content">
                      <div class="model-item-header">
                        <span class="model-item-label">{{ m.label }}</span>
                      </div>
                      <div v-if="m.description" class="model-item-desc">
                        {{ m.description }}
                      </div>
                    </div>
                    <div class="model-item-meta">
                        <div 
                          v-if="hasModelStats(m.value)"
                          class="model-signal-indicator"
                          :class="getSignalClass(m.value)"
                        >
                          <div class="signal-bars">
                            <span class="bar bar-1" :class="{ active: getSignalLevel(m.value) >= 1 }"></span>
                            <span class="bar bar-2" :class="{ active: getSignalLevel(m.value) >= 2 }"></span>
                            <span class="bar bar-3" :class="{ active: getSignalLevel(m.value) >= 3 }"></span>
                            <span class="bar bar-4" :class="{ active: getSignalLevel(m.value) >= 4 }"></span>
                          </div>
                          <span class="signal-percent">{{ formatSuccessRate(m.value) }}</span>
                          <span v-if="formatModelAvgDuration(m.value)" class="model-duration-text">
                            {{ formatModelAvgDuration(m.value) }}
                          </span>
                        </div>
                        <span v-if="m.points" class="model-item-points">{{ m.points }}点</span>
                      </div>
                    </div>
                </div>
              </div>
            </Transition>
          </div>
          
          <!-- 比例选择（下拉框） -->
          <div class="ratio-selector">
            <span class="ratio-icon">📐</span>
            <select v-model="selectedAspectRatio" class="ratio-select-input">
              <option v-for="ratio in availableImageAspectRatios" :key="ratio.value" :value="ratio.value">
                {{ ratio.label }}
              </option>
            </select>
          </div>
          
          <!-- 预设选择器（MJ模型时隐藏） -->
          <div v-if="showPresetOption" class="preset-selector-custom" ref="presetSelectorRef" @click.stop>
            <div class="preset-selector-trigger" @click="togglePresetDropdown">
              <span class="preset-icon">◈</span>
              <span class="preset-name">{{ selectedPresetLabel }}</span>
              <span class="select-arrow" :class="{ 'arrow-up': isPresetDropdownOpen }">▾</span>
            </div>
            
            <!-- 预设下拉列表 -->
            <Transition name="dropdown-fade">
              <div v-if="isPresetDropdownOpen" class="preset-dropdown-list" :class="{ 'dropdown-up': presetDropdownUp, 'dropdown-down': !presetDropdownUp }" @wheel.stop>
                <div
                  v-for="preset in availablePresets"
                  :key="preset.id"
                  :class="{
                    'preset-dropdown-item': preset.type !== 'divider',
                    'preset-dropdown-divider': preset.type === 'divider',
                    'preset-action': preset.type === 'action',
                    'preset-dropdown-error': preset.type === 'error',
                    'active': selectedPreset === preset.id
                  }"
                  @click="selectPreset(preset.id)"
                >
                  <template v-if="preset.type !== 'divider'">
                    <div class="preset-item-main">
                      <span class="preset-item-label">{{ preset.name }}</span>
                    </div>
                    <div v-if="preset.description" class="preset-item-desc">
                      {{ preset.description }}
                    </div>
                  </template>
                  <template v-else>
                    <span class="divider-label">{{ preset.label }}</span>
                  </template>
                </div>
              </div>
            </Transition>
          </div>
          
          <!-- 摄影机控制开关 -->
          <div v-if="showCameraControlOption" class="camera-control-toggle">
            <button 
              class="camera-toggle-btn"
              :class="{ active: cameraControlEnabled }"
              @click="openCameraControl"
              title="摄影机控制 - 选择电影机、镜头、焦段、光圈"
            >
              <span class="toggle-icon">🎬</span>
              <span class="toggle-label">摄影机控制</span>
              <span v-if="cameraControlEnabled" class="toggle-indicator"></span>
            </button>
            <!-- 快速关闭按钮 -->
            <button 
              v-if="cameraControlEnabled" 
              class="camera-close-btn"
              @click.stop="disableCameraControl"
              title="关闭摄影机控制"
            >
              ✕
            </button>
          </div>
          
          <!-- MJ 模型 botType 切换器（写实/动漫）- 文生图和图生图模式都支持 -->
          <div v-if="isMJModel" class="bot-type-selector">
            <div 
              v-for="option in botTypeOptions" 
              :key="option.value"
              class="bot-type-chip"
              :class="{ active: botType === option.value }"
              @click="botType = option.value"
              :title="option.value === 'MID_JOURNEY' ? 'Midjourney 写实风格' : 'Niji Journey 动漫风格'"
            >
              {{ option.label }}
            </div>
          </div>
          
          <!-- 尺寸切换（根据模型配置显示） -->
          <div v-if="showResolutionOption" class="param-chip-group">
            <div 
              v-for="size in imageSizes" 
              :key="size.value"
              class="param-chip"
              :class="{ active: imageSize === size.value }"
              @click="imageSize = size.value"
            >
              {{ size.label }}
            </div>
          </div>

          <!-- gpt-image-2 质量选项 -->
          <div v-if="showQualityOption" class="param-chip-group">
            <div 
              v-for="q in [{ value: 'auto', label: 'Auto' }, { value: 'low', label: '快速' }, { value: 'medium', label: '标准' }, { value: 'high', label: '高质量' }]" 
              :key="q.value"
              class="param-chip"
              :class="{ active: selectedQuality === q.value }"
              @click="selectedQuality = q.value"
            >
              {{ q.label }}
            </div>
          </div>
        </div>
        
        <div class="config-right">
          <!-- 数量（可点击切换） -->
          <span 
            class="count-display clickable" 
            @click="toggleCount"
            :title="`点击切换：1x → 2x → 4x（当前套餐最大 ${userConcurrentLimit}x）`"
          >
            {{ selectedCount }}x
          </span>
          
          <!-- 积分消耗显示 -->
          <span class="points-cost-display">
            {{ formatPoints(currentPointsCost) }} {{ t('imageGen.points') }}
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
      
      <!-- Seedream 4.5 高级选项 - 组图生成 -->
      <template v-if="isSeedream45Model || isSeedream50LiteModel">
        <!-- 展开/收起按钮 -->
        <button class="sora2-collapse-trigger" @click="showSeedreamAdvancedOptions = !showSeedreamAdvancedOptions">
          <span class="sora2-collapse-icon" :class="{ 'expanded': showSeedreamAdvancedOptions }">∧</span>
          <span>{{ showSeedreamAdvancedOptions ? '收起' : '扩展' }}</span>
        </button>

        <!-- 高级选项内容 -->
        <Transition name="slide-down">
          <div v-if="showSeedreamAdvancedOptions" class="sora2-advanced-options seedream-advanced">
            <!-- 联网搜索开关（仅 Seedream 5.0 Lite） -->
            <div v-if="isSeedream50LiteModel" class="sora2-option-row">
              <span class="sora2-option-label">🔍 联网搜索</span>
              <label class="sora2-toggle-switch">
                <input type="checkbox" v-model="enableWebSearch" />
                <span class="sora2-toggle-slider"></span>
              </label>
            </div>

            <!-- 组图生成开关 -->
            <div class="sora2-option-row">
              <span class="sora2-option-label">🖼️ 组图生成 
                <span v-if="enableGroupGeneration" class="kling-sound-multiplier">
                  ({{ maxGroupImages }}x)
                </span>
              </span>
              <label class="sora2-toggle-switch">
                <input type="checkbox" v-model="enableGroupGeneration" />
                <span class="sora2-toggle-slider"></span>
              </label>
            </div>
            
            <!-- 组图数量控制（+-按钮） -->
            <div v-if="enableGroupGeneration" class="seedream-group-input-row">
              <span class="seedream-group-label">组图数量:</span>
              <div class="number-control">
                <button 
                  class="number-btn minus-btn" 
                  @click="decrementGroupImages"
                  :disabled="maxGroupImages <= 2"
                  title="减少"
                >
                  −
                </button>
                <span class="number-value">{{ maxGroupImages }}</span>
                <button 
                  class="number-btn plus-btn" 
                  @click="incrementGroupImages"
                  :disabled="maxGroupImages >= 10"
                  title="增加"
                >
                  +
                </button>
              </div>
            </div>
            
            <div class="seedream-group-hint">
              💡 开启后一次生成多张图片，积分消耗 = 组图数量 × 批次数 × 单次积分
            </div>
          </div>
        </Transition>
      </template>
    </div>
    </Teleport>
    
    <!-- 放大预览弹窗（使用 Teleport 渲染到 body） -->
    <Teleport to="body">
      <!-- 放大预览弹窗 -->
      <Transition name="modal-fade">
        <div 
          v-if="showPreviewModal" 
          class="preview-modal-overlay" 
          @click="closePreviewModal"
          @wheel.prevent="handlePreviewWheel"
          @mousemove="handlePreviewMouseMove"
          @mouseup="handlePreviewMouseUp"
          @mouseleave="handlePreviewMouseUp"
        >
          <!-- 关闭按钮 -->
          <button class="preview-close-btn" @click.stop="closePreviewModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <button
            class="preview-nav-btn preview-nav-prev"
            type="button"
            :disabled="!canPreviewPreviousCanvasImage"
            @click.stop="switchCanvasPreviewImage(-1)"
            title="上一张"
            aria-label="上一张"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <button
            class="preview-nav-btn preview-nav-next"
            type="button"
            :disabled="!canPreviewNextCanvasImage"
            @click.stop="switchCanvasPreviewImage(1)"
            title="下一张"
            aria-label="下一张"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          
          <!-- 缩放控制按钮 -->
          <div class="preview-zoom-controls" @click.stop>
            <button class="zoom-btn" @click="handleZoomOut" title="缩小">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35M8 11h6"/>
              </svg>
            </button>
            <span class="zoom-level">{{ Math.round(previewScale * 100) }}%</span>
            <button class="zoom-btn" @click="handleZoomIn" title="放大">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
              </svg>
            </button>
            <button class="zoom-btn reset" @click="handleZoomReset" title="重置">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
          
          <!-- 图片容器 -->
          <div 
            class="preview-image-container" 
            @click.stop
            @mousedown="handlePreviewMouseDown"
            :class="{ dragging: previewIsDragging }"
          >
            <img 
              :src="previewImageUrl" 
              alt="预览图片" 
              class="preview-image" 
              :style="{
                transform: `translate(${previewPosition.x}px, ${previewPosition.y}px) scale(${previewScale})`,
                cursor: previewIsDragging ? 'grabbing' : (previewScale > 1 ? 'grab' : 'default')
              }"
              draggable="false"
            />
          </div>
          
          <!-- 底部操作按钮 -->
          <div class="preview-actions" @click.stop>
            <button class="preview-action-btn" @click="handleToolbarDownload">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>下载</span>
            </button>
            <button class="preview-action-btn add-asset-btn" @click="handleAddToAssets">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>加入资产</span>
            </button>
          </div>
          
          <!-- 操作提示 -->
          <div class="preview-hint">
            滚轮缩放 · 拖动查看细节
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>

  <!-- 图像预设对话框 -->
  <ImagePresetDialog
    :isOpen="showImagePresetDialog"
    :preset="editingImagePreset"
    @close="showImagePresetDialog = false"
    @submit="handleImagePresetSubmit"
    @temp-use="handleImagePresetTempUse"
  />

  <!-- 图像预设管理器 -->
  <ImagePresetManager
    ref="imagePresetManagerRef"
    :isOpen="showImagePresetManager"
    @close="showImagePresetManager = false"
    @create="openImagePresetDialog"
    @edit="editImagePreset"
    @refresh="loadImagePresets"
    @select="handlePresetSelect"
  />
  
  <!-- 相机控制面板 -->
  <CameraControlPanel
    :visible="showCameraControl"
    :initialSettings="cameraSettings"
    @close="closeCameraControl"
    @save="handleCameraControlSave"
  />
  
  <!-- 独立裁剪/扩图组件 -->
  <ImageCropper
    :visible="showCropper"
    :imageUrl="cropperImageUrl"
    :mode="cropperMode"
    @save="handleCropSave"
    @cancel="handleCropCancel"
    @outpaint="handleOutpaint"
  />
  
</template>

<style scoped>
.image-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: visible;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  contain: layout style;
}

.image-placeholder {
  width: 100%;
  height: 100%;
  min-height: 80px;
  background: rgba(128, 128, 128, 0.08);
}

/* 覆盖全局 .canvas-node.selected 样式，选中效果由内部控制 */
.image-node.selected {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

/* ========== 图片工具栏（与 TextNode 的 format-toolbar 保持一致） ========== */
.image-toolbar {
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

.image-toolbar .toolbar-btn-hd {
  color: #c4b5fd;
}
.image-toolbar .toolbar-btn-hd:hover:not(:disabled) {
  color: #ddd6fe;
}
.image-toolbar .toolbar-btn-hd:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.image-toolbar .toolbar-btn {
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
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.image-toolbar .toolbar-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.image-toolbar .toolbar-btn.active {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.image-toolbar .toolbar-btn.is-processing {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  cursor: wait;
}

.image-toolbar .panorama-vr-btn {
  color: #facc15;
}

.image-toolbar .panorama-vr-btn:hover {
  color: #fde68a;
  background: rgba(250, 204, 21, 0.12);
}

.image-toolbar .seedance-review-btn {
  color: #86efac;
}

.image-toolbar .seedance-review-btn:hover:not(:disabled) {
  color: #bbf7d0;
  background: rgba(34, 197, 94, 0.14);
}

.image-toolbar .seedance-review-btn.active {
  background: rgba(34, 197, 94, 0.22);
  border-color: rgba(34, 197, 94, 0.5);
  color: #bbf7d0;
}

.seedance-review-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 12;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(5, 46, 22, 0.82);
  color: #4ade80;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
}

.seedance-review-badge.expired {
  background: rgba(69, 26, 3, 0.86);
  color: #fbbf24;
}

/* 3D相机面板动画 */
.camera-panel-enter-active,
.camera-panel-leave-active {
  transition: all 0.25s ease;
}

.camera-panel-enter-from,
.camera-panel-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.image-toolbar .toolbar-btn.is-processing:hover {
  background: rgba(59, 130, 246, 0.2);
}

.image-toolbar .toolbar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.3);
}
.image-toolbar .toolbar-btn:disabled:hover {
  background: transparent;
}

/* 工具栏按钮包装器 - 用于弹窗定位 */
.image-toolbar .toolbar-btn-wrapper {
  position: relative;
}

.image-toolbar .toolbar-dropdown-arrow {
  width: 12px;
  height: 12px;
  opacity: 0.7;
  transition: transform 0.15s ease;
}

.image-toolbar .toolbar-dropdown-arrow.open {
  transform: rotate(180deg);
}

.image-edit-dropdown {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 126px;
  padding: 6px;
  background: #202020;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 9999;
  pointer-events: auto;
}

.image-edit-dropdown::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 10px;
  height: 10px;
  background: #202020;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  transform: translateX(-50%) rotate(45deg);
}

.image-edit-dropdown-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #d1d5db;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.image-edit-dropdown-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.image-edit-dropdown-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.image-edit-dropdown-item.is-processing {
  color: #60a5fa;
}

.image-edit-dropdown-item svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* ========== 宫格裁剪下拉菜单 ========== */
.grid-crop-dropdown {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  background: #202020;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 8px;
  min-width: 210px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 9999;
  pointer-events: auto;
}

.grid-crop-dropdown::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: rgba(32, 32, 32, 0.98);
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.grid-crop-dropdown-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  padding: 4px 10px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 4px;
}

.grid-crop-dropdown-title-back {
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: color 0.15s;
}

.grid-crop-dropdown-title-back:hover {
  color: rgba(255, 255, 255, 0.7);
}

.grid-crop-dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  text-align: left;
  pointer-events: auto;
  position: relative;
  z-index: 1;
}

.grid-crop-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.grid-crop-dropdown-item svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.6);
}

.dropdown-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.grid-crop-dropdown-cancel {
  display: block;
  width: 100%;
  padding: 8px 10px;
  margin-top: 4px;
  background: transparent;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}

.grid-crop-dropdown-cancel:hover {
  color: rgba(255, 255, 255, 0.8);
}

/* ========== 宫格裁剪下拉菜单 - 白昼模式 ========== */
:root.canvas-theme-light .grid-crop-dropdown {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .grid-crop-dropdown::after {
  background: rgba(255, 255, 255, 0.98);
  border-right-color: rgba(0, 0, 0, 0.1);
  border-bottom-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .grid-crop-dropdown-title {
  color: rgba(0, 0, 0, 0.45);
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .grid-crop-dropdown-item {
  color: rgba(0, 0, 0, 0.85);
}

:root.canvas-theme-light .grid-crop-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .grid-crop-dropdown-item svg {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .dropdown-hint {
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .grid-crop-dropdown-cancel {
  border-top-color: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .grid-crop-dropdown-cancel:hover {
  color: rgba(0, 0, 0, 0.7);
}

/* 抠图选项弹窗 */
.cutout-options-popup {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(32, 32, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 12px;
  width: 260px;
  min-width: 260px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.cutout-options-popup::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: rgba(32, 32, 32, 0.98);
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.cutout-close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s, color 0.15s;
  z-index: 1;
}

.cutout-close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.cutout-close-btn svg {
  width: 14px;
  height: 14px;
}

.cutout-options-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.cutout-option-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
  position: relative;
}

.cutout-option-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.cutout-option-btn:active {
  transform: scale(0.95);
}

.cutout-color-preview {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cutout-color-preview.transparent-preview {
  background:
    linear-gradient(45deg, #555 25%, transparent 25%),
    linear-gradient(-45deg, #555 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #555 75%),
    linear-gradient(-45deg, transparent 75%, #555 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
  background-color: #888;
}

.cutout-color-preview.custom-preview {
  background: linear-gradient(135deg, #333 0%, #666 50%, #999 100%);
}

.custom-icon {
  width: 20px;
  height: 20px;
  color: rgba(255, 255, 255, 0.9);
}

.cutout-option-btn.is-custom {
  position: relative;
  overflow: hidden;
}

.cutout-color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.cutout-options-hint {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
}

/* 弹窗动画 */
.cutout-popup-enter-active,
.cutout-popup-leave-active {
  transition: all 0.2s ease;
}

.cutout-popup-enter-from,
.cutout-popup-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.image-toolbar .toolbar-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.image-toolbar .toolbar-btn.icon-only {
  padding: 6px;
}

.image-toolbar .toolbar-btn.icon-only span {
  display: none;
}

.image-toolbar .toolbar-divider {
  width: 1px;
  height: 20px;
  background: #3a3a3a;
  margin: 0 6px;
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
  transition: background-color 0.2s ease;
  user-select: none;
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
  flex-direction: column;
}

/* 节点卡片 - 无边框设计 */
.node-card {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  contain: content;
}

/* 源节点（有图片）- 无边框 */
.image-node.is-source-node .node-card {
  background: transparent;
  border: none;
  overflow: visible;
}

/* 有输出结果且为单图时 - 无边框 */
.image-node.has-single-output .node-card {
  background: transparent;
  border: none;
  overflow: visible;
}

.image-node:hover .node-card {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.image-node.is-source-node:hover .node-card,
.image-node.has-single-output:hover .node-card {
  border-color: transparent;
}

/* 选中状态 - 与 TextNode 保持一致 */
.image-node.selected .node-card {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* 源节点和单图输出选中时 - 边框显示在图片上，不显示在 node-card 上 */
.image-node.is-source-node.selected .node-card,
.image-node.has-single-output.selected .node-card {
  border-color: transparent !important;
  box-shadow: none !important;
}

/* ========== 彗星环绕发光特效（生成中） ========== */
.node-card.is-processing {
  position: relative;
  overflow: visible;
  contain: none;
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
  will-change: stroke-dashoffset;
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
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.node-card.is-stacked:hover {
  opacity: 1;
  transform: scale(1);
  z-index: 10;
}

/* 拖拽悬停状态 */
.node-card.drag-over {
  border-color: var(--canvas-accent-success, #22c55e);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
}

/* 拖拽覆盖层 */
.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(34, 197, 94, 0.15);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  pointer-events: none; /* 防止阻止拖拽事件 */
}

.drag-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--canvas-accent-success, #22c55e);
  font-size: 14px;
  font-weight: 500;
}

.drag-icon {
  font-size: 32px;
}

/* ========== 源节点样式 - 无边框设计 ========== */
.source-image-preview {
  width: 100%;
  /* 不设置固定高度，让容器自适应图片尺寸 */
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  overflow: hidden;
}

.source-image-preview img {
  width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  pointer-events: none;
  /* 添加轻微阴影增加层次感 */
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.2s ease, border 0.2s ease;
  /* 选中时边框通过 border 实现，避免溢出 */
  border: 2px solid transparent;
}

/* 源节点选中时 - 图片发光效果 */
.image-node.is-source-node.selected .source-image-preview img {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 0 20px rgba(59, 130, 246, 0.3);
}

.upload-overlay-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  color: var(--canvas-text-primary, #fff);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.upload-overlay-btn:hover {
  background: rgba(50, 50, 50, 0.95);
  border-color: var(--canvas-accent-primary, #3b82f6);
}

.upload-icon {
  font-size: 14px;
}

/* 源图加载失败覆盖层 */
.source-image-failed {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(20, 20, 20, 0.85);
  color: var(--canvas-text-primary, #fff);
  cursor: pointer;
  border-radius: 12px;
  text-align: center;
  padding: 16px;
  transition: background-color 0.2s ease;
}

.source-image-failed:hover {
  background: rgba(40, 40, 40, 0.92);
}

.source-image-failed .failed-icon {
  font-size: 32px;
}

.source-image-failed .failed-text {
  font-size: 14px;
  font-weight: 500;
}

.source-image-failed .failed-hint {
  font-size: 12px;
  opacity: 0.75;
}

/* ========== 输出节点样式 ========== */
.node-content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 240px; /* 确保节点内容区域有足够高度 */
  content-visibility: auto;
  contain-intrinsic-size: 300px 300px;
}

/* 预览状态 - 简洁文字 */
.preview-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border-radius: 12px;
  min-height: 200px; /* 确保生成中状态有足够高度 */
}

.processing-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--canvas-text-secondary, #888);
  letter-spacing: 2px;
}

.processing-duration-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--canvas-accent-primary, #4ade80);
  letter-spacing: 0;
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
  min-height: 200px; /* 确保错误状态有足够高度 */
}

.error-icon {
  font-size: 24px;
}

.error-text {
  font-size: 12px;
  color: var(--canvas-accent-error, #ef4444);
  max-width: 200px;
}

.error-hint {
  font-size: 11px;
  color: var(--canvas-text-secondary, #a0a0a0);
  max-width: 200px;
  line-height: 1.4;
}

.preview-error.content-safety .error-text {
  color: #f59e0b;
}

.preview-error.content-safety .error-icon {
  color: #f59e0b;
}

.preview-error.timeout-error .error-text {
  color: #f97316;
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

/* 输出预览 - 无边框设计 */
.preview-images {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  padding: 8px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.output-image-action-btn {
  position: absolute;
  top: 10px;
  z-index: 8;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(20, 20, 20, 0.78);
  color: #fff;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition: opacity 0.16s ease, transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
}

.replace-output-image-btn {
  right: 10px;
}

.preview-output-image-btn {
  right: 52px;
}

.output-image-action-btn svg {
  width: 17px;
  height: 17px;
}

.preview-images:hover .output-image-action-btn,
.output-image-action-btn:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.output-image-action-btn:hover,
.output-image-action-btn:focus-visible {
  background: rgba(40, 40, 40, 0.92);
  border-color: var(--canvas-accent-primary, #3b82f6);
  outline: none;
}

.edit-saving-badge {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 12px;
  pointer-events: none;
  z-index: 5;
}

.edit-saving-spinner {
  width: 14px;
  height: 14px;
  animation: edit-save-spin 0.8s linear infinite;
}

@keyframes edit-save-spin {
  to { transform: rotate(360deg); }
}

.preview-image {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.preview-image:hover {
  transform: scale(1.02);
}

/* 透明图背景 - 棋盘格 */
.preview-images.transparent-bg {
  background: 
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
  background-color: #444;
  border-radius: 12px;
}

.preview-image.transparent-image {
  background: transparent;
}

/* 单图时 - 全尺寸无边框展示 */
.preview-images.single-image {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  /* 不设置固定高度，让容器自适应图片尺寸 */
}

.preview-images.single-image .preview-image {
  /* 图片始终填满容器宽度，高度按比例自适应 */
  width: 100%;
  height: auto;
  aspect-ratio: auto;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.2s ease, border 0.2s ease;
  /* 选中时边框通过 border 实现，避免 box-shadow 超出图片 */
  border: 2px solid transparent;
}

/* 单张输出选中时 - 图片边框效果 */
.image-node.has-single-output.selected .preview-images.single-image .preview-image {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.4),
    0 0 20px rgba(59, 130, 246, 0.3);
}

/* 准备状态（有上游连接） */
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
  padding: 8px;
}

.hint-text {
  color: var(--canvas-text-tertiary, #666);
  font-size: 13px;
  margin-bottom: 12px;
}

.quick-action {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 14px;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.quick-action:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #fff);
}

.action-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
}

/* ========== 底部配置面板 ========== */
.config-panel {
  position: absolute;
  top: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  width: min(max(100%, 780px), 90vw);
  min-width: 0;
  max-width: 90vw;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 12px;
  overflow: visible; /* 允许下拉框超出显示 */
  z-index: 1000;
  pointer-events: auto;
}

.config-panel-expanded {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 70vw;
  min-width: 70vw;
  max-width: calc(100vw - 32px);
  height: 70vh;
  max-height: calc(100vh - 32px);
  transform: translate(-50%, -50%) scale(var(--config-panel-scale, 1));
  transform-origin: center center;
  overflow-y: auto;
  overscroll-behavior: contain;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
  z-index: 5000;
}

.config-expand-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--canvas-text-secondary, #a0a0a0);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  z-index: 5;
}

.config-expand-btn:hover {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.45);
  color: var(--canvas-text-primary, #ffffff);
}

.config-panel-expanded .config-expand-btn {
  background: rgba(59, 130, 246, 0.18);
  border-color: rgba(59, 130, 246, 0.5);
  color: var(--canvas-text-primary, #ffffff);
}

.config-panel-expanded .panel-frames {
  padding-right: 48px;
}

.config-panel-expanded .prompt-input {
  min-height: 320px;
  max-height: calc(70vh - 220px);
}

/* 参考图片面板 */
.panel-frames {
  padding: 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
  position: relative;
  transition: background-color 0.2s ease, border-color 0.2s ease;
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
  transition: border-color 0.2s ease;
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

.panel-frame-video {
  background: var(--canvas-bg-secondary, #1a1a1a);
}

.panel-frame-video .video-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  display: block;
}

.panel-frame-label {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
  text-align: left;
  pointer-events: none;
  z-index: 2;
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

/* @图片N 标签徽章（与视频节点 Kling O1 风格一致） */
.panel-frame-tag-badge {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.65);
  color: #f9fafb;
  font-size: 9px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 3px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3;
}

/* 可点击的缩略图 */
.panel-frame-clickable {
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  position: relative;
  overflow: visible;
}

.panel-frame-clickable:hover {
  transform: scale(1.08);
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.3);
  z-index: 2;
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
  transition: border-color 0.2s, background-color 0.2s;
  background: transparent;
  box-sizing: border-box;
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
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--canvas-accent-success, #22c55e);
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  pointer-events: none;
}

.prompt-section {
  padding: 16px 12px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.prompt-input-wrapper {
  position: relative;
  overflow: hidden;
}

.prompt-input {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 96px;
  max-height: min(50vh, 420px);
  background: transparent;
  border: none;
  outline: none;
  color: var(--canvas-text-primary, #fff);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  overflow-y: auto;
  transition: height 0.15s ease;
  padding: 4px 0;
  cursor: text;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
}

.prompt-input.is-empty:empty::before {
  content: attr(data-placeholder);
  position: absolute;
  top: 4px;
  left: 0;
  right: 0;
  color: var(--canvas-text-placeholder, #4a4a4a);
  pointer-events: none;
  white-space: pre-wrap;
}

.prompt-highlight-segment.is-prompt-tag-slot {
  display: inline-flex;
  align-items: center;
  vertical-align: baseline;
  box-sizing: border-box;
  user-select: all;
  -webkit-user-select: all;
}

.prompt-highlight-segment.is-prompt-tag-slot :deep(.prompt-media-tag-chip) {
  flex-shrink: 0;
}

.prompt-media-tag {
  background: rgba(255, 255, 255, 0.12);
  color: var(--canvas-text-primary, #fff);
  border-radius: 3px;
  padding: 1px 2px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.45);
  pointer-events: auto;
}

/* 提示词框滚动条样式 - 黑白灰风格 */
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
  transition: background 0.2s;
}

.prompt-input::-webkit-scrollbar-thumb:hover {
  background: rgba(180, 180, 180, 0.8);
}

.prompt-input::-webkit-scrollbar-thumb:active {
  background: rgba(200, 200, 200, 0.9);
}

/* Firefox 滚动条样式 */
.prompt-input {
  scrollbar-width: thin;
  scrollbar-color: rgba(150, 150, 150, 0.6) rgba(60, 60, 60, 0.3);
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
  gap: 8px;
  flex-wrap: nowrap;
  min-height: 48px;
  overflow: visible;
}

.config-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  min-width: 0;
}

.config-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  flex-shrink: 0;
  flex-wrap: nowrap;
  max-width: 100%;
  margin-left: auto;
  min-width: 0;
}

/* 模型选择器（自定义下拉框）- 扁平化设计，与 VideoNode 统一 */
.model-selector-custom {
  position: relative;
  z-index: 100;
  flex: 0 1 150px;
  min-width: 0;
  max-width: 100%;
}

.model-selector-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  min-height: 32px;
  min-width: 0;
  max-width: 100%;
}

.model-selector-trigger:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

.model-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1;
  filter: grayscale(1);
}

.model-icon-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
  display: block;
}

.model-icon-text {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1;
}

.model-name {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  width: max-content;
  min-width: 220px;
  max-width: min(420px, calc(100vw - 32px));
  max-height: 480px;
  overflow-y: auto;
  overflow-x: hidden;
  background: linear-gradient(135deg, rgba(18, 18, 22, 0.95), rgba(28, 28, 35, 0.92));
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  z-index: 1000;
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
  padding: 12px 14px;
  margin-bottom: 0;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.model-dropdown-item:last-child {
  margin-bottom: 0;
  border-bottom: 0;
}

.model-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.model-dropdown-item.active {
  background: rgba(255, 255, 255, 0.07);
  border-bottom-color: rgba(255, 255, 255, 0.1);
  box-shadow: none;
}

.model-item-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.model-item-content {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.model-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 8px;
}

.model-item-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 14px;
  filter: grayscale(1);
}

.model-item-label {
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-item-points {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.07);
  padding: 2px 6px;
  border-radius: 4px;
}

/* 📊 模型成功率信号指示器 */
.model-signal-indicator {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
  width: 54px;
}

.signal-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.signal-bars .bar {
  width: 4px;
  border-radius: 1px;
  background: rgba(156, 163, 175, 0.5);
  transition: background-color 0.2s ease, height 0.2s ease;
}

.signal-bars .bar-1 { height: 5px; }
.signal-bars .bar-2 { height: 8px; }
.signal-bars .bar-3 { height: 11px; }
.signal-bars .bar-4 { height: 14px; }

.signal-percent {
  font-size: 11px;
  font-weight: 500;
  min-width: 28px;
  text-align: right;
  color: #9ca3af;
}

.model-duration-text {
  flex-basis: 100%;
  font-size: 10px;
  line-height: 1;
  color: #9ca3af;
  text-align: right;
}

/* 优秀 >= 95%：绿色 */
.model-signal-indicator.excellent .bar.active {
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
}
.model-signal-indicator.excellent .signal-percent {
  color: #22c55e;
}

/* 良好 80-95%：黄色 */
.model-signal-indicator.good .bar.active {
  background: #eab308;
  box-shadow: 0 0 4px rgba(234, 179, 8, 0.4);
}
.model-signal-indicator.good .signal-percent {
  color: #eab308;
}

/* 较差 < 80%：红色 */
.model-signal-indicator.poor .bar.active {
  background: #ef4444;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);
}
.model-signal-indicator.poor .signal-percent {
  color: #ef4444;
}

/* 无数据：灰色 */
.model-signal-indicator.none .bar {
  background: rgba(156, 163, 175, 0.6);
}
.model-signal-indicator.none .signal-percent {
  color: #9ca3af;
}

.model-item-desc {
  display: block;
  font-size: 13px;
  color: var(--canvas-text-tertiary, #888);
  line-height: 1.4;
  white-space: normal;
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

/* 向上展开时的动画 */
.model-dropdown-list.dropdown-up.dropdown-fade-enter-from,
.model-dropdown-list.dropdown-up.dropdown-fade-leave-to {
  transform: translateY(8px);
}

/* 比例选择器 - 与 VideoNode 统一的扁平化设计 */
.ratio-selector {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 3px;
  padding: 4px 7px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
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

/* 预设选择器样式 - 与 VideoNode 统一的扁平化设计 */
.preset-selector-custom {
  position: relative;
  flex: 0 1 96px;
  min-width: 0;
  max-width: 100%;
}

.preset-selector-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  user-select: none;
  min-height: 32px;
  min-width: 0;
  max-width: 100%;
}

.preset-selector-trigger:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
}

.preset-icon {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.preset-name {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-dropdown-list {
  position: absolute;
  left: 0;
  min-width: 220px;
  max-height: 350px;
  overflow-y: auto;
  background: #141414;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  z-index: 1000;
}

/* 向上展开（默认） */
.preset-dropdown-list.dropdown-up {
  bottom: calc(100% + 4px);
  top: auto;
}

/* 向下展开 */
.preset-dropdown-list.dropdown-down {
  top: calc(100% + 4px);
  bottom: auto;
}

/* 滚动条样式 */
.preset-dropdown-list::-webkit-scrollbar {
  width: 6px;
}

.preset-dropdown-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 3px;
}

.preset-dropdown-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.preset-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.preset-dropdown-item {
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.preset-dropdown-item:last-child {
  border-bottom: none;
}

.preset-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.preset-dropdown-item.preset-dropdown-error {
  cursor: default;
}

.preset-dropdown-item.preset-dropdown-error:hover {
  background: transparent;
}

.preset-dropdown-item.active {
  background: rgba(59, 130, 246, 0.15);
}

.preset-dropdown-divider {
  padding: 6px 12px;
  pointer-events: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.02);
}

.divider-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preset-item-main {
  display: flex;
  align-items: center;
}

.preset-item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--canvas-text-primary, #fff);
}

.preset-item-desc {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  appearance: none;
  padding-right: 2px;
}

.preset-dropdown-error .preset-item-label {
  color: #f87171;
}

.preset-dropdown-error .preset-item-desc {
  color: rgba(248, 113, 113, 0.72);
}

/* 操作选项样式 */
.preset-dropdown-item.preset-action {
  color: var(--primary-color, #8b5cf6);
}

.preset-dropdown-item.preset-action:hover {
  background: rgba(139, 92, 246, 0.12);
}

.preset-dropdown-item.preset-action .preset-item-label {
  color: var(--primary-color, #8b5cf6);
}

/* 摄影机控制开关样式 - 与 VideoNode 扁平化设计统一 */
.camera-control-toggle {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.camera-toggle-btn {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  position: relative;
  min-height: 32px;
}

.camera-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
}

.camera-toggle-btn.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: rgba(59, 130, 246, 0.9);
}

.camera-toggle-btn .toggle-icon {
  font-size: 12px;
}

.camera-toggle-btn .toggle-label {
  font-weight: 500;
}

.camera-toggle-btn .toggle-indicator {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  border: 2px solid var(--canvas-bg-primary, #0a0a0a);
}

.camera-close-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 50%;
  color: #ef4444;
  font-size: 10px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  padding: 0;
  line-height: 1;
}

.camera-close-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

/* 亮色主题适配 */
:root.canvas-theme-light .camera-toggle-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.6);
}

:root.canvas-theme-light .camera-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.15);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .camera-toggle-btn.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: #2563eb;
}

:root.canvas-theme-light .camera-toggle-btn .toggle-indicator {
  border-color: #ffffff;
}

.ratio-select-input option {
  background: #1a1a1a;
  color: #ffffff;
  padding: 8px;
}

.ratio-select-input:hover {
  color: rgba(255, 255, 255, 1);
}

/* 参数选择芯片 - 与 VideoNode 扁平化设计统一 */
.param-chip {
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  user-select: none;
  min-height: 32px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
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
  flex-wrap: nowrap;
  flex-shrink: 0;
  gap: 4px;
}

/* MJ botType 选择器样式 - 支持亮/暗主题 */
.bot-type-selector {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--canvas-bg-tertiary, rgba(0, 0, 0, 0.06));
  border-radius: 6px;
}

.bot-type-chip {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
  color: var(--canvas-text-secondary, #666);
}

.bot-type-chip:hover {
  color: var(--canvas-text-primary, #333);
}

.bot-type-chip.active {
  background: var(--canvas-accent-primary, #3b82f6);
  color: #fff;
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
  transition: background-color 0.2s ease, border-color 0.2s ease;
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
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--canvas-accent-primary, #3b82f6);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
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

/* ========== 端口样式 - 位置与+按钮对齐（但视觉隐藏） ========== */
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
.image-node.resizing .node-card {
  transition: none !important;
}

/* ========== 添加按钮 ========== */
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
  transition: opacity 0.2s ease, transform 0.2s ease, background-color 0.2s ease;
  z-index: 10;
}

.node-wrapper:hover .node-add-btn,
.image-node.selected .node-add-btn {
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

/* ========== 左侧快捷操作菜单 ========== */
.left-quick-menu {
  position: absolute;
  left: -180px;
  top: 50%;
  transform: translateY(-50%);
  background: var(--canvas-bg-secondary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 12px;
  padding: 8px;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  animation: slideInLeft 0.2s ease;
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

.left-quick-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  color: var(--canvas-text-secondary, #ccc);
}

.left-quick-menu-item:hover {
  background: var(--canvas-bg-tertiary, #2a2a2a);
  color: var(--canvas-text-primary, #fff);
}

.left-menu-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.left-menu-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

/* ========== Resize Handles ========== */
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

/* ========== Seedream 4.5 扩展选项样式 ========== */
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
  transition: color 0.2s, background-color 0.2s;
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

.sora2-advanced-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid #2a2a2a;
  background: rgba(0, 0, 0, 0.2);
}

.seedream-advanced {
  border-color: #3b82f6;
}

.sora2-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sora2-option-label {
  font-size: 13px;
  color: #cccccc;
  font-weight: 500;
}

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

.kling-sound-multiplier {
  color: #fbbf24;
  font-weight: 600;
  font-size: 11px;
}

.seedream-group-input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}

.seedream-group-label {
  font-size: 12px;
  color: #aaaaaa;
}

/* 数字控制（+-按钮） */
.number-control {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  overflow: hidden;
}

.number-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #cccccc;
  font-size: 18px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  user-select: none;
}

.number-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.number-btn:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.number-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.number-value {
  min-width: 40px;
  padding: 0 12px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  border-left: 1px solid #3a3a3a;
  border-right: 1px solid #3a3a3a;
}

/* 白昼模式样式 */
:root.canvas-theme-light .number-control {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .number-btn {
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .number-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
  color: #1c1917;
}

:root.canvas-theme-light .number-value {
  color: #1c1917;
  border-left-color: rgba(0, 0, 0, 0.1);
  border-right-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .seedream-group-label {
  color: rgba(0, 0, 0, 0.6);
}

.seedream-group-hint {
  font-size: 11px;
  color: #3b82f6;
  line-height: 1.4;
  padding: 6px 8px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
  margin-top: 8px;
}

/* 动画 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 500px;
  opacity: 1;
}
</style>

<!-- 预览弹窗样式（非 scoped，因为使用 Teleport 渲染到 body） -->
<style>
/* ========== 预览弹窗 ========== */
.preview-modal-overlay {
  position: fixed;
  inset: 0;
  background: #000000;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
  cursor: default;
  overflow: hidden;
}

/* 图片容器 */
.preview-image-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.preview-image-container.dragging {
  cursor: grabbing !important;
}

.preview-modal-overlay .preview-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  transition: transform 0.1s ease-out;
  user-select: none;
  -webkit-user-drag: none;
}

/* 关闭按钮 */
.preview-modal-overlay .preview-close-btn {
  position: fixed;
  top: 24px;
  right: 24px;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease, transform 0.2s ease;
  z-index: 10;
}

.preview-modal-overlay .preview-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.preview-modal-overlay .preview-close-btn svg {
  width: 20px;
  height: 20px;
}

.preview-modal-overlay .preview-nav-btn {
  position: fixed;
  top: 50%;
  z-index: 10;
  width: 60px;
  height: 92px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.44);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transform: translateY(-50%);
  transition: background-color 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
}

.preview-modal-overlay .preview-nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
  transform: translateY(-50%) scale(1.04);
}

.preview-modal-overlay .preview-nav-btn:disabled {
  opacity: 0.28;
  cursor: default;
}

.preview-modal-overlay .preview-nav-btn svg {
  width: 32px;
  height: 32px;
}

.preview-modal-overlay .preview-nav-prev {
  left: 7vw;
}

.preview-modal-overlay .preview-nav-next {
  right: 7vw;
}

/* 缩放控制 */
.preview-zoom-controls {
  position: fixed;
  top: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  z-index: 10;
}

.zoom-btn {
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.zoom-btn.reset {
  margin-left: 4px;
}

.zoom-btn svg {
  width: 18px;
  height: 18px;
}

.zoom-level {
  min-width: 50px;
  text-align: center;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  font-family: 'SF Mono', 'Monaco', monospace;
}

/* 底部操作按钮 */
.preview-modal-overlay .preview-actions {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  z-index: 10;
}

.preview-modal-overlay .preview-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.preview-modal-overlay .preview-action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.preview-modal-overlay .preview-action-btn svg {
  width: 18px;
  height: 18px;
}

.preview-modal-overlay .preview-action-btn.add-asset-btn {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
}

.preview-modal-overlay .preview-action-btn.add-asset-btn:hover {
  background: rgba(59, 130, 246, 0.5);
}

/* 操作提示 */
.preview-hint {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
}

/* 弹窗动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .preview-image,
.modal-fade-leave-to .preview-image {
  transform: scale(0.9);
}

/* Toast动画 */
@keyframes fadeInOut {
  0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  15% { opacity: 1; transform: translateX(-50%) translateY(0); }
  85% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   ImageNode 白昼模式样式适配
   ======================================== */
:root.canvas-theme-light .image-node .quick-actions-title {
  color: #f59e0b;
}

:root.canvas-theme-light .image-node .quick-action {
  color: #57534e;
}

:root.canvas-theme-light .image-node .quick-action:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #1c1917;
}

:root.canvas-theme-light .image-node .config-panel {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .config-panel-expanded {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.18) !important;
}

:root.canvas-theme-light .config-panel-expanded .config-expand-btn {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: #2563eb;
}

:root.canvas-theme-light .config-panel-expanded .panel-frames,
:root.canvas-theme-light .config-panel-expanded .config-row,
:root.canvas-theme-light .config-panel-expanded .sora2-collapse-trigger,
:root.canvas-theme-light .config-panel-expanded .sora2-advanced-options {
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .config-panel-expanded .panel-frames-label {
  color: #57534e;
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .config-panel-expanded .panel-frames-hint,
:root.canvas-theme-light .config-panel-expanded .sora2-collapse-trigger {
  color: #78716c;
}

:root.canvas-theme-light .config-panel-expanded .panel-frame-add {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
  color: #78716c;
}

:root.canvas-theme-light .config-panel-expanded .panel-frame-add:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.15);
  color: #57534e;
}

:root.canvas-theme-light .config-panel-expanded .prompt-input,
:root.canvas-theme-light .config-panel-expanded .prompt-media-tag,
:root.canvas-theme-light .config-panel-expanded .model-name,
:root.canvas-theme-light .config-panel-expanded .model-icon-text {
  color: #1c1917;
}

:root.canvas-theme-light .config-panel-expanded .prompt-input.is-empty:empty::before,
:root.canvas-theme-light .config-panel-expanded .model-item-desc {
  color: #78716c;
}

:root.canvas-theme-light .config-panel-expanded .model-selector-trigger,
:root.canvas-theme-light .config-panel-expanded .preset-selector-trigger,
:root.canvas-theme-light .config-panel-expanded .ratio-selector,
:root.canvas-theme-light .config-panel-expanded .param-chip {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .config-panel-expanded .model-selector-trigger:hover,
:root.canvas-theme-light .config-panel-expanded .preset-selector-trigger:hover,
:root.canvas-theme-light .config-panel-expanded .ratio-selector:hover,
:root.canvas-theme-light .config-panel-expanded .param-chip:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .config-panel-expanded .select-arrow,
:root.canvas-theme-light .config-panel-expanded .preset-icon,
:root.canvas-theme-light .config-panel-expanded .ratio-icon,
:root.canvas-theme-light .config-panel-expanded .points-cost-display {
  color: #78716c;
}

:root.canvas-theme-light .config-panel-expanded .preset-name,
:root.canvas-theme-light .config-panel-expanded .ratio-select-input {
  color: #1c1917;
}

:root.canvas-theme-light .config-panel-expanded .count-display {
  color: #57534e;
}

:root.canvas-theme-light .config-panel-expanded .count-display.clickable {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .config-panel-expanded .count-display.clickable:hover {
  border-color: rgba(59, 130, 246, 0.4);
  color: #2563eb;
}

:root.canvas-theme-light .config-panel-expanded .points-cost-display {
  color: #b45309;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.2);
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-list {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-item {
  border-bottom-color: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-item.active {
  background: rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-divider {
  border-bottom-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .config-panel-expanded .divider-label,
:root.canvas-theme-light .config-panel-expanded .preset-item-desc {
  color: #78716c;
}

:root.canvas-theme-light .config-panel-expanded .preset-item-label {
  color: #1c1917;
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-item.preset-action,
:root.canvas-theme-light .config-panel-expanded .preset-dropdown-item.preset-action .preset-item-label {
  color: #8b5cf6;
}

:root.canvas-theme-light .config-panel-expanded .preset-dropdown-item.preset-action:hover {
  background: rgba(139, 92, 246, 0.08);
}

:root.canvas-theme-light .config-panel-expanded .param-chip.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.4);
  color: #2563eb;
}

:root.canvas-theme-light .config-panel-expanded .sora2-collapse-trigger:hover {
  color: #57534e;
  background: rgba(0, 0, 0, 0.03);
}

:root.canvas-theme-light .config-panel-expanded .sora2-advanced-options {
  background: rgba(0, 0, 0, 0.03);
}

:root.canvas-theme-light .config-panel-expanded .sora2-option-label {
  color: #44403c;
}

:root.canvas-theme-light .config-panel-expanded .sora2-toggle-slider {
  background-color: #d6d3d1;
}

:root.canvas-theme-light .config-panel-expanded .sora2-toggle-slider:before {
  background-color: #78716c;
}

:root.canvas-theme-light .image-node .panel-frames {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .image-node .panel-frames-label {
  color: #57534e;
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .image-node .panel-frames-hint {
  color: #a8a29e;
}

:root.canvas-theme-light .image-node .panel-frame-add {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
  color: #78716c;
}

:root.canvas-theme-light .image-node .panel-frame-add:hover {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.15);
  color: #57534e;
}

:root.canvas-theme-light .image-node .prompt-area {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .image-node .prompt-input {
  color: #1c1917;
}

:root.canvas-theme-light .image-node .prompt-media-tag {
  color: #1c1917;
}

:root.canvas-theme-light .image-node .prompt-input.is-empty:empty::before {
  color: #a8a29e;
}

:root.canvas-theme-light .image-node .model-selector-trigger {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .model-selector-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .image-node .model-icon {
  color: #57534e;
  background: transparent;
  border-color: transparent;
}

:root.canvas-theme-light .image-node .model-icon-text {
  color: #1c1917;
}

:root.canvas-theme-light .image-node .model-name {
  color: #1c1917;
}

:root.canvas-theme-light .image-node .select-arrow {
  color: #78716c;
}

:root.canvas-theme-light .image-node .model-dropdown-list {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(250, 248, 245, 0.78));
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

:root.canvas-theme-light .image-node .model-dropdown-item {
  border-bottom-color: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .image-node .model-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .image-node .model-dropdown-item.active {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .image-node .model-item-name {
  color: #1c1917;
}

:root.canvas-theme-light .image-node .model-item-desc {
  color: #78716c;
}

:root.canvas-theme-light .image-node .ratio-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .image-node .ratio-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .image-node .ratio-btn.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

:root.canvas-theme-light .image-node .count-selector {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .image-node .points-display {
  color: #78716c;
}

:root.canvas-theme-light .image-node .points-cost {
  color: #f59e0b;
}

:root.canvas-theme-light .image-node .ready-status {
  color: #57534e;
}

:root.canvas-theme-light .image-node .ready-hint {
  color: #a8a29e;
}

:root.canvas-theme-light .image-node .empty-state {
  color: #57534e;
}

:root.canvas-theme-light .image-node .model-dropdown-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .image-node .model-dropdown-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .model-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

/* 模型下拉菜单项 - 白昼模式 */
:root.canvas-theme-light .image-node .model-item-label {
  color: #1c1917;
}

:root.canvas-theme-light .image-node .model-item-icon {
  color: #57534e;
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .image-node .model-item-points {
  color: rgba(28, 25, 23, 0.62);
  background: rgba(0, 0, 0, 0.05);
}

/* 尺寸选择器 - 白昼模式 */
:root.canvas-theme-light .image-node .size-selector {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .size-btn {
  color: #57534e;
  background: transparent;
}

:root.canvas-theme-light .image-node .size-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .image-node .size-btn.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

:root.canvas-theme-light .image-node .size-label {
  color: #57534e;
}

:root.canvas-theme-light .image-node .size-points {
  color: #f59e0b;
}

/* 添加按钮 - 白昼模式 */
:root.canvas-theme-light .image-node .add-frame-btn {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.1);
  color: #78716c;
}

:root.canvas-theme-light .image-node .add-frame-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
  color: #57534e;
}

:root.canvas-theme-light .image-node .add-label {
  color: #f59e0b;
}

/* 比例选择器 - 白昼模式（与 VideoNode 统一） */
:root.canvas-theme-light .image-node .ratio-selector {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .ratio-selector:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .image-node .ratio-icon {
  color: #78716c;
}

:root.canvas-theme-light .image-node .ratio-select-input {
  background: transparent;
  color: #1c1917;
}

:root.canvas-theme-light .image-node .ratio-select-input option {
  background: #ffffff;
  color: #1c1917;
}

:root.canvas-theme-light .image-node .ratio-select-input:hover {
  color: #1c1917;
}

/* 参数选择芯片 - 白昼模式（与 VideoNode 统一） */
:root.canvas-theme-light .image-node .param-chip {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .image-node .param-chip:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
  color: #1c1917;
}

:root.canvas-theme-light .image-node .param-chip.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

/* 生成按钮 - 白昼模式 */
:root.canvas-theme-light .image-node .generate-btn:disabled {
  background: rgba(0, 0, 0, 0.1);
}

/* 积分显示 - 白昼模式 */
:root.canvas-theme-light .image-node .points-cost-display {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.2);
}

:root.canvas-theme-light .image-node .points-value {
  color: #f59e0b;
}

:root.canvas-theme-light .image-node .points-label {
  color: #78716c;
}

/* 批次显示 - 白昼模式 */
:root.canvas-theme-light .image-node .count-display {
  color: #57534e;
}

:root.canvas-theme-light .image-node .count-display.clickable {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .image-node .count-display.clickable:hover {
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

:root.canvas-theme-light .image-node .image-toolbar .toolbar-btn-hd {
  color: #6d28d9;
}
:root.canvas-theme-light .image-node .image-toolbar .toolbar-btn-hd:hover:not(:disabled) {
  color: #5b21b6;
}

/* 图片节点工具栏 - 白昼模式 */
:root.canvas-theme-light .image-node .image-toolbar {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .image-toolbar .toolbar-btn {
  color: #57534e;
}

:root.canvas-theme-light .image-node .image-toolbar .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

:root.canvas-theme-light .image-node .image-toolbar .toolbar-divider {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .image-toolbar .image-edit-dropdown {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
}

:root.canvas-theme-light .image-node .image-toolbar .image-edit-dropdown::after {
  background: rgba(255, 255, 255, 0.98);
  border-right-color: rgba(0, 0, 0, 0.1);
  border-bottom-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .image-toolbar .image-edit-dropdown-item {
  color: #57534e;
}

:root.canvas-theme-light .image-node .image-toolbar .image-edit-dropdown-item:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

/* 上传按钮 - 白昼模式 */
:root.canvas-theme-light .image-node .upload-overlay-btn {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .image-node .upload-overlay-btn:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

:root.canvas-theme-light .image-node .output-image-action-btn {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(0, 0, 0, 0.12);
  color: #57534e;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
}

:root.canvas-theme-light .image-node .output-image-action-btn:hover,
:root.canvas-theme-light .image-node .output-image-action-btn:focus-visible {
  background: #fff;
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

/* 节点标签 - 白昼模式 */
:root.canvas-theme-light .image-node .node-label {
  color: #f59e0b;
}

/* 预设选择器 - 白昼模式 */
:root.canvas-theme-light .image-node .preset-selector-trigger {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .preset-selector-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .image-node .preset-icon {
  color: #57534e;
}

:root.canvas-theme-light .image-node .preset-name {
  color: #1c1917;
}

:root.canvas-theme-light .image-node .preset-selector-trigger .select-arrow {
  color: #78716c;
}

/* 预设下拉列表 - 白昼模式 */
:root.canvas-theme-light .image-node .preset-dropdown-list {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .image-node .preset-dropdown-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .image-node .preset-dropdown-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .preset-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .image-node .preset-dropdown-item {
  border-bottom-color: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .image-node .preset-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .image-node .preset-dropdown-item.active {
  background: rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .image-node .preset-dropdown-divider {
  border-bottom-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.02);
}

:root.canvas-theme-light .image-node .divider-label {
  color: #78716c;
}

:root.canvas-theme-light .image-node .preset-item-label {
  color: #1c1917;
}

:root.canvas-theme-light .image-node .preset-item-desc {
  color: #78716c;
}

:root.canvas-theme-light .image-node .preset-dropdown-item.preset-action {
  color: #8b5cf6;
}

:root.canvas-theme-light .image-node .preset-dropdown-item.preset-action:hover {
  background: rgba(139, 92, 246, 0.08);
}

:root.canvas-theme-light .image-node .preset-dropdown-item.preset-action .preset-item-label {
  color: #8b5cf6;
}

:root.canvas-theme-light .image-node .preset-dropdown-item.preset-dropdown-error:hover {
  background: transparent;
}

:root.canvas-theme-light .image-node .preset-dropdown-error .preset-item-label {
  color: #dc2626;
}

:root.canvas-theme-light .image-node .preset-dropdown-error .preset-item-desc {
  color: #b91c1c;
}

/* 🚀 性能优化：拖拽时降低图片渲染质量 */
.source-image-preview.low-quality,
.preview-images.low-quality {
  /* 使用 CSS 优化渲染性能 */
  will-change: transform;
  transform: translateZ(0);
}

.source-image-preview.low-quality img,
.preview-images.low-quality img {
  /* 降低图片渲染质量 */
  image-rendering: pixelated;
  /* 禁用图片平滑处理 */
  -webkit-filter: blur(0);
  filter: blur(0);
  /* 使用更低的合成模式 */
  backface-visibility: hidden;
  transform: translateZ(0);
}

/* 只读预览模式 */
.config-panel-readonly {
  pointer-events: none;
  opacity: 0.85;
}
.config-panel-readonly .generate-btn {
  opacity: 0.4;
  cursor: not-allowed;
}
.config-panel-readonly .panel-frame-add,
.config-panel-readonly .panel-frame-remove,
.config-panel-readonly select,
.config-panel-readonly input,
.config-panel-readonly button,
.config-panel-readonly .model-selector-custom,
.config-panel-readonly .config-select {
  opacity: 0.6;
  cursor: not-allowed;
}

</style>
