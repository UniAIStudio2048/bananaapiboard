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
import { useCanvasStore } from '@/stores/canvas'
import { useModelStatsStore } from '@/stores/canvas/modelStatsStore'
import { generateImageFromText, generateImageFromImage, pollTaskStatus, uploadImages, deductCropPoints, removeImageBackground } from '@/api/canvas/nodes'
import { registerTask, removeCompletedTask, getTasksByNodeId } from '@/stores/canvas/backgroundTaskManager'
import { formatPoints } from '@/utils/format'
import { getApiUrl, getModelDisplayName, isModelEnabled, getAvailableImageModels, getTenantHeaders } from '@/config/tenant'
import { useI18n } from '@/i18n'
import { showAlert, showInsufficientPointsDialog } from '@/composables/useCanvasDialog'
import { getImagePresets, incrementPresetUseCount, createImagePreset, updateImagePreset } from '@/api/canvas/image-presets'
import ImagePresetDialog from '../dialogs/ImagePresetDialog.vue'
import ImagePresetManager from '../dialogs/ImagePresetManager.vue'
import ImageCropper from '../ImageCropper.vue'
import Camera3DPanel from '../Camera3DPanel.vue'
import Pose3DViewer from '../Pose3DViewer.vue'
import CameraControlPanel from '../CameraControlPanel.vue'
import { generateCameraPrompt } from '@/config/canvas/cameraDatabase'
import { getCanvasThumbnailUrl, getThumbWidthForZoom, getOriginalImageUrl } from '@/utils/canvasThumbnail'
import { useImageHoverPreview } from '@/composables/useImageHoverPreview'
import PromptMentionPopup from '../PromptMentionPopup.vue'

const { t } = useI18n()

// 节点根元素引用（用于计算工具栏位置）
const nodeRef = ref(null)

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const emit = defineEmits(['updateNodeInternals'])

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')
const { onHoverStart, onHoverEnd } = useImageHoverPreview()

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals, findNode, getViewport, getSelectedNodes } = useVueFlow()

// 文件上传引用
const fileInputRef = ref(null)
const refImageInputRef = ref(null) // 参考图片上传引用
const pendingAction = ref(null) // 记录待执行的操作类型

// 标签编辑状态
const isEditingLabel = ref(false)
const labelInputRef = ref(null)
const localLabel = ref(props.data.label || 'Image')

// 本地状态
const isGenerating = ref(false)
const errorMessage = ref('')

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
const promptTextareaRef = ref(null) // 提示词输入框引用
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

// 是否显示模型统计（总是显示，无数据时显示 --）
function hasModelStats(modelName) {
  return true
}

// 预设选择器状态
const isPresetDropdownOpen = ref(false)
const presetDropdownUp = ref(true) // 预设下拉方向
const selectedPreset = ref('')
const tenantPresets = ref([]) // 租户全局预设
const userPresets = ref([]) // 用户自定义预设
const presetSelectorRef = ref(null)

// 图像预设对话框和管理器
const showImagePresetDialog = ref(false)
const showImagePresetManager = ref(false)
const editingImagePreset = ref(null)
const imagePresetManagerRef = ref(null)
const tempCustomPrompt = ref('') // 临时自定义提示词

// 相机控制状态
const showCameraControl = ref(false)
const cameraControlEnabled = ref(false)
const cameraSettings = ref({
  camera: '',
  cameraName: '',
  cameraType: 'DIGITAL',
  lens: '',
  lensName: '',
  focalLength: 35,
  aperture: 2.0,
  effects: [],
  prompt: ''
})

// 图片列表拖拽排序状态
const dragSortIndex = ref(-1)
const dragOverIndex = ref(-1)

// 图片编辑器状态
const showImageEditor = ref(false)
const editorInitialTool = ref('')

// 🚀 性能优化：画布拖拽状态（用于降低渲染质量）
const isCanvasDragging = ref(false)

// 🚀 动态缩略图：根据画布 zoom 级别调整图片分辨率
const currentThumbWidth = ref(getThumbWidthForZoom(canvasStore.viewport?.zoom || 1))
let thumbUpdateTimer = null

watch(() => canvasStore.viewport?.zoom, (newZoom) => {
  if (thumbUpdateTimer) clearTimeout(thumbUpdateTimer)
  thumbUpdateTimer = setTimeout(() => {
    const newWidth = getThumbWidthForZoom(newZoom || 1)
    if (newWidth !== currentThumbWidth.value) {
      currentThumbWidth.value = newWidth
    }
  }, 300)
})

function getZoomAwareThumbnailUrl(url) {
  if (currentThumbWidth.value <= 0) return getOriginalImageUrl(url)
  return getCanvasThumbnailUrl(url, currentThumbWidth.value)
}

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
    const data = await getImagePresets()
    tenantPresets.value = data.tenant || []
    userPresets.value = data.user || []
    console.log('[ImageNode] 图像预设已加载:', { tenant: tenantPresets.value.length, user: userPresets.value.length })
  } catch (error) {
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
    type: 'none'
  })

  // 2. 添加租户全局预设
  if (tenantPresets.value.length > 0) {
    presets.push(...tenantPresets.value.map(p => ({
      id: `tenant-${p.id}`,
      name: p.name,
      prompt: p.prompt,
      description: p.description,
      type: 'tenant-global',
      _rawId: p.id
    })))
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
      type: 'temp-custom'
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
  return preset ? preset.name : '无预设'
})

// 当前选中预设的提示词（用于拼接）
const currentPresetPrompt = computed(() => {
  if (!selectedPreset.value) return ''
  
  // 如果是临时自定义，返回临时提示词
  if (selectedPreset.value === 'temp-custom') {
    return tempCustomPrompt.value
  }
  
  const preset = availablePresets.value.find(p => p.id === selectedPreset.value)
  return preset?.prompt || ''
})

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
  if (!preset || preset.type === 'divider') return

  selectedPreset.value = presetId
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
      await updateImagePreset(editingImagePreset.value.id, data)
      console.log('[ImageNode] 图像预设已更新')
    } else {
      // 创建新预设
      const result = await createImagePreset(data)
      console.log('[ImageNode] 图像预设已创建')

      // 自动选择新创建的预设
      selectedPreset.value = `user-${result.id}`
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
  selectedPreset.value = 'temp-custom'
  console.log('[ImageNode] 使用临时自定义提示词')
}

// 打开预设管理器
function openImagePresetManager() {
  showImagePresetManager.value = true
  isPresetDropdownOpen.value = false
}

// 从管理器中选择预设
function handlePresetSelect(preset) {
  selectedPreset.value = `user-${preset.id}`
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
  console.log('[ImageNode] 相机控制已保存:', settings)
}

// 关闭相机控制面板
function closeCameraControl() {
  showCameraControl.value = false
}

// 禁用相机控制
function disableCameraControl() {
  cameraControlEnabled.value = false
  cameraSettings.value = {
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

// 组件挂载时添加全局点击事件监听
// 🚀 性能优化：监听画布拖拽事件
function handleCanvasDragStart() {
  isCanvasDragging.value = true
}
function handleCanvasDragEnd() {
  isCanvasDragging.value = false
}

// 🔧 后台任务事件处理 - 统一使用 backgroundTaskManager 轮询，避免双重轮询导致页面卡顿
function handleBackgroundTaskComplete(event) {
  const { taskId, task } = event.detail
  // 只处理属于当前节点的任务
  if (task.nodeId !== props.id) return
  
  console.log(`[ImageNode] 后台任务完成: ${taskId}`, task)
  
  // 获取主图URL
  const imageUrl = task.result?.url || task.result?.urls?.[0]
  if (imageUrl) {
    canvasStore.updateNodeData(props.id, {
      status: 'success',
      output: { type: 'image', urls: [imageUrl] }
    })
  } else {
    console.warn(`[ImageNode] 任务完成但无图片URL: ${taskId}`, task.result)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: '生成完成但未获取到图片'
    })
  }
  
  // 🔥 组图处理：为每张额外的组图创建独立节点
  const groupImageUrls = task.result?._groupImageUrls
  if (groupImageUrls && Array.isArray(groupImageUrls) && groupImageUrls.length > 0) {
    console.log(`[ImageNode] 组图生成完成，创建 ${groupImageUrls.length} 个额外节点`)
    createGroupImageNodes(groupImageUrls, task)
  }
  
  removeCompletedTask(taskId)
}

/**
 * 🔥 为组图的每张额外图片创建独立的画布节点
 */
function createGroupImageNodes(groupImageUrls, task) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  const nodeWidth = 320
  const nodeGap = 40
  const startX = currentNode.position.x + nodeWidth + nodeGap
  const startY = currentNode.position.y
  
  const createdNodeIds = []
  
  for (let i = 0; i < groupImageUrls.length; i++) {
    const { url } = groupImageUrls[i]
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
  canvasStore.updateNodeData(props.id, {
    groupNodeIds: createdNodeIds,
    isGroupParent: true
  })
}

function handleBackgroundTaskFailed(event) {
  const { taskId, task } = event.detail
  if (task.nodeId !== props.id) return
  
  console.log(`[ImageNode] 后台任务失败: ${taskId}`, task)
  
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
  
  const progress = task.result?.progress || task.progress
  if (progress) {
    canvasStore.updateNodeData(props.id, {
      progress: task.result?.status === 'processing' ? '生成中...' : progress
    })
  }
}

// 检查并恢复已完成的后台任务
function checkAndRestoreBackgroundTasks() {
  const nodeTasks = getTasksByNodeId(props.id)
  
  for (const task of nodeTasks) {
    if (task.type !== 'image') continue
    
    if (task.status === 'completed') {
      const imageUrl = task.result?.url || task.result?.urls?.[0]
      if (imageUrl) {
        canvasStore.updateNodeData(props.id, {
          status: 'success',
          output: { type: 'image', urls: [imageUrl] }
        })
      } else {
        canvasStore.updateNodeData(props.id, {
          status: 'error',
          error: '生成完成但未获取到图片'
        })
      }
      removeCompletedTask(task.taskId)
    } else if (task.status === 'failed') {
      canvasStore.updateNodeData(props.id, {
        status: 'error',
        error: task.error || '图片生成失败'
      })
      removeCompletedTask(task.taskId)
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleModelDropdownClickOutside)
  document.addEventListener('click', handleClickOutside)
  // 加载图像预设
  loadImagePresets()
  // 📊 模型成功率統計已由 modelStatsStore 集中管理（10 分鐘輪詢）
  // 初始化时调整文本框高度（如果有预设文本）
  nextTick(() => {
    autoResizeTextarea()
  })
  // 🚀 性能优化：监听画布拖拽事件
  window.addEventListener('canvas-drag-start', handleCanvasDragStart)
  window.addEventListener('canvas-drag-end', handleCanvasDragEnd)
  
  // 🔧 监听后台任务事件 - 避免双重轮询
  window.addEventListener('background-task-complete', handleBackgroundTaskComplete)
  window.addEventListener('background-task-failed', handleBackgroundTaskFailed)
  window.addEventListener('background-task-progress', handleBackgroundTaskProgress)
  
  // 检查是否有已完成的后台任务需要恢复
  checkAndRestoreBackgroundTasks()
})

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleModelDropdownClickOutside)
  document.removeEventListener('click', handleClickOutside)
  // 🚀 性能优化：移除画布拖拽事件监听
  window.removeEventListener('canvas-drag-start', handleCanvasDragStart)
  window.removeEventListener('canvas-drag-end', handleCanvasDragEnd)
  
  // 🔧 移除后台任务事件监听
  window.removeEventListener('background-task-complete', handleBackgroundTaskComplete)
  window.removeEventListener('background-task-failed', handleBackgroundTaskFailed)
  window.removeEventListener('background-task-progress', handleBackgroundTaskProgress)
  
  // 清理缩略图更新定时器
  if (thumbUpdateTimer) {
    clearTimeout(thumbUpdateTimer)
    thumbUpdateTimer = null
  }
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
  
  // Seedream 5.0 只支持 2K 和 3K
  const isSeedream50 = checkIsSeedream50Lite(currentModel)
  // Seedream 4.5（包括即梦4.5/jimeng-4.5）不支持 1K，只支持 2K 和 4K
  const isSeedream45 = checkIsSeedream45(currentModel)
  // wan2.7 图生图模式不支持 4K，只支持 1K 和 2K
  const isWan27I2I = isWan27Model.value && hasImageInput.value
  const supportedSizes = isSeedream50
    ? ['2K', '3K']
    : isSeedream45
      ? ['2K', '4K']
      : isWan27I2I
        ? ['1K', '2K']
        : ['1K', '2K', '4K']
  
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

// 是否显示尺寸选项（从模型配置中读取 hasResolutionPricing，MJ模型时隐藏）
const showResolutionOption = computed(() => {
  // MJ 模型不显示尺寸选项（不起作用）
  if (isMJModel.value) return false
  const currentModel = modelLookupList.value.find(m => m.value === selectedModel.value)
  return currentModel?.hasResolutionPricing || false
})

// 是否显示预设选项（MJ模型时隐藏，因为不起作用）
const showPresetOption = computed(() => {
  return !isMJModel.value
})

// 是否显示摄影机控制选项（所有模型都支持，包括 MJ 模型）
const showCameraControlOption = computed(() => {
  return true
})

// 监听模型变化，如果模型不支持1K且当前选择1K，自动切换到2K
watch([selectedModel, imageSizes], () => {
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
  let cost = basePointsCost.value
  
  // 如果开启了组图生成，积分 = 组图数量 × 批次数 × 单次积分
  if (enableGroupGeneration.value && isSeedream45Model.value) {
    const groupCount = Math.max(2, Math.min(10, maxGroupImages.value || 3))
    cost = basePointsCost.value * groupCount * selectedCount.value
  } else {
    // 普通模式：积分 = 批次数 × 单次积分
    cost = basePointsCost.value * selectedCount.value
  }
  
  return cost
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
const showToolbar = computed(() => {
  if (props.data?.readonly) return false
  if (!props.selected) return false
  if (getSelectedNodes.value.length > 1) return false
  return hasOutput.value || hasSourceImage.value
})

// 是否显示底部配置面板 - 与 TextNode 保持一致，单独选中即显示
// 修改：源节点也显示配置面板，以便添加参考图片
const showConfigPanel = computed(() => {
  return props.selected === true && getSelectedNodes.value.length <= 1
})

watch(showConfigPanel, (val) => {
  if (!val) showMentionPopup.value = false
})


// 获取当前图片URL（用于工具栏操作）
const currentImageUrl = computed(() => {
  if (hasOutput.value) {
    return outputImages.value[0]
  }
  if (hasSourceImage.value) {
    return sourceImages.value[0]
  }
  return null
})

// 工具栏预览弹窗
const showPreviewModal = ref(false)
const previewImageUrl = ref('')

// 预览缩放和拖动状态
const previewScale = ref(1)
const previewPosition = ref({ x: 0, y: 0 })
const previewIsDragging = ref(false)
const previewDragStart = ref({ x: 0, y: 0 })
const previewLastPosition = ref({ x: 0, y: 0 })

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

function handleToolbarEnhance() {
  console.log('[ImageNode] 工具栏：增强', props.id)
  enterEditMode('enhance') // 图像增强（待接入 AI API）
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
  
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
  if (!imageUrl) return
  
  isRemovingBackground.value = true
  removeBgProgress.value = 0
  
  try {
    console.log('[ImageNode] 开始后端抠图处理，背景:', bgType)
    
    removeBgProgress.value = 30
    
    const bgColor = bgType === 'custom' ? cutoutCustomColor.value : null
    const result = await removeImageBackground(imageUrl, bgType, bgColor)
    
    removeBgProgress.value = 90
    
    if (!result.success || !result.url) {
      throw new Error('抠图返回结果异常')
    }
    
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    if (!currentNode) {
      throw new Error('找不到当前节点')
    }
    
    const newNodeId = `cutout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newNodePosition = {
      x: currentNode.position.x + 380,
      y: currentNode.position.y
    }
    
    const bgLabel = bgType === 'transparent' ? '透明' : 
                    bgType === 'white' ? '白底' : 
                    bgType === 'green' ? '绿幕' : '自定义底'
    
    const isTransparent = result.isTransparent
    
    canvasStore.addNode({
      id: newNodeId,
      type: 'image',
      position: newNodePosition,
      data: {
        label: `抠图-${bgLabel}`,
        output: {
          url: result.url,
          urls: [result.url]
        },
        sourceNodeId: props.id,
        isTransparent: isTransparent,
        cutoutResult: true,
        cutoutBgType: bgType
      }
    })
    
    removeBgProgress.value = 100
    console.log('[ImageNode] 后端抠图完成，已创建新节点:', newNodeId)
    
  } catch (error) {
    console.error('[ImageNode] 抠图失败:', error)
    showAlert('抠图失败', error.message || '处理过程中出现错误，请重试')
  } finally {
    isRemovingBackground.value = false
    removeBgProgress.value = 0
  }
}

// 关闭抠图选项弹窗
function closeCutoutOptions() {
  showCutoutOptions.value = false
}

// 点击外部区域关闭抠图选项弹窗
function handleClickOutside(event) {
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
  
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
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

/**
 * 获取可用于 canvas 操作的图片 URL
 * 对于外部 URL（跨域），使用后端代理绕过 CORS 限制
 */
function getProxiedImageUrl(imageUrl) {
  if (!imageUrl) return null
  
  // 如果是 data URL 或 blob URL，直接使用
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return imageUrl
  }
  
  // 如果是相对路径（本地存储），直接使用
  if (imageUrl.startsWith('/storage/') || imageUrl.startsWith('/api/')) {
    return imageUrl
  }
  
  // 检查是否是外部 URL（以 http:// 或 https:// 开头）
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    // 检查是否是同源（当前后端的域名）
    const currentHost = window.location.host
    try {
      const urlObj = new URL(imageUrl)
      // 如果是同一个域名，直接使用
      if (urlObj.host === currentHost) {
        return imageUrl
      }
    } catch (e) {
      // URL 解析失败，继续使用代理
    }
    
    // 外部 URL，使用代理接口绕过 CORS
    console.log('[ImageNode] 使用代理加载外部图片:', imageUrl.substring(0, 60) + '...')
    return `${getApiUrl('/api/images/proxy')}?url=${encodeURIComponent(imageUrl)}`
  }
  
  // 其他情况直接返回
  return imageUrl
}

// 辅助函数：等待下一帧渲染完成（用于异步分批创建节点，防止浏览器崩溃）
function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

// 辅助函数：加载图片用于 Canvas 操作（解决 CORS/代理加载失败问题）
// 优先使用 fetch+Blob 方式，避免 img.crossOrigin='anonymous' 导致的加载失败
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
  
  // 其他 URL：通过 fetch 获取二进制数据，转为 Blob URL 后加载（绕过 CORS）
  const proxiedUrl = getProxiedImageUrl(imageUrl)
  console.log('[ImageNode] loadImageForCanvas: fetch', proxiedUrl?.substring(0, 100))
  
  const response = await fetch(proxiedUrl)
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
  
  // 加载成功后释放 blob URL（图片数据已解码到内存中）
  URL.revokeObjectURL(blobUrl)
  return img
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
    const nodeHeight = 320
    const gap = 20
    
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const offsetX = 400
    
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
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
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
        
        const cropFile = new File([blob], `grid-crop-${index}.jpg`, { type: 'image/jpeg' })
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
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
        const blobUrl = URL.createObjectURL(blob)
        croppedUrls.push(blobUrl)
        
        // 收集上传任务，稍后执行
        const file = new File([blob], `storyboard-${index}.jpg`, { type: 'image/jpeg' })
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
    
    // 计算节点布局参数
    const nodeWidth = 300
    const nodeHeight = 320
    const gap = 20
    
    // 获取当前节点位置
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const offsetX = 400 // 在原节点右侧
    
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
        
        // 🔧 优化：使用 JPEG 格式并压缩，比 PNG 小很多（约减少 70% 体积）
        // 🔧 改进：转为 Blob 后上传云端，不再存储 base64 数据
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
        const blobUrl = URL.createObjectURL(blob)
        
        // 立即清理 canvas 引用，让 GC 可以回收
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
        const cropFile = new File([blob], `grid-crop-${index}.jpg`, { type: 'image/jpeg' })
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
    
    // 计算节点布局参数
    const nodeWidth = 300
    const nodeHeight = 320
    const gap = 20
    
    // 获取当前节点位置
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const offsetX = 400 // 在原节点右侧
    
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
        
        // 🔧 优化：使用 JPEG 格式并压缩，比 PNG 小很多（约减少 70% 体积）
        // 🔧 改进：转为 Blob 后上传云端，不再存储 base64 数据
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
        const blobUrl = URL.createObjectURL(blob)
        
        // 立即清理 canvas 引用，让 GC 可以回收
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
        const cropFile = new File([blob], `grid4-crop-${index}.jpg`, { type: 'image/jpeg' })
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
  } finally {
    isGrid4Cropping.value = false
  }
}

// ========== 3D 相机角度控制 ==========
// 获取多角度积分配置
async function fetchMultiangleConfig() {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch('/api/settings/app', {
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
      const response = await fetch(`/api/images/multiangle/task/${taskId}`, {
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
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
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

// 🔧 修复：使用 smartDownload 统一下载，解决跨域和扩展名不匹配问题
// 对于 dataUrl 格式的图片（如裁剪后的图片），直接在前端下载
async function handleToolbarDownload() {
  if (!currentImageUrl.value) return
  
  const filename = `image_${props.id || Date.now()}.png`
  
  try {
    const imageUrl = currentImageUrl.value
    
    // 如果是 dataUrl（base64），直接在前端转换为 Blob 下载
    if (imageUrl.startsWith('data:')) {
      console.log('[ImageNode] dataUrl 格式图片，使用前端直接下载')
      const blob = await dataUrlToBlob(imageUrl)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      return
    }
    
    // 🔧 使用 smartDownload：fetch+blob 方式，自动修正扩展名，解决跨域下载问题
    const { smartDownload } = await import('@/api/client')
    await smartDownload(imageUrl, filename)
    console.log('[ImageNode] 下载原图成功:', filename)
  } catch (error) {
    console.error('[ImageNode] 下载图片失败:', error)
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
  showPreviewModal.value = true
}

function closePreviewModal() {
  showPreviewModal.value = false
  previewImageUrl.value = ''
  resetPreviewState()
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
  if (!currentImageUrl.value) return
  
  try {
    const { saveAsset } = await import('@/api/canvas/assets')
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `画布图片_${timestamp}`
    
    await saveAsset({
      type: 'image',
      name: fileName,
      url: currentImageUrl.value,
      thumbnail_url: currentImageUrl.value,
      source_node_id: props.id || null,
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

    if (node.data.output?.urls?.length > 0) {
      upstreamImages.push(...node.data.output.urls)
    } else if (node.data.output?.url) {
      upstreamImages.push(node.data.output.url)
    } else if (node.data.sourceImages?.length > 0) {
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

const referenceMediaList = computed(() => {
  return referenceImages.value.map((url, i) => ({
    type: 'image',
    index: i + 1,
    url,
    label: `图片${i + 1}`
  }))
})

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
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

// 触发文件上传
function triggerUpload(actionType) {
  pendingAction.value = actionType
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
    
    // 单张超过20MB的图片压缩后再上传
    if (file.size > 20 * 1024 * 1024) {
      console.log('[ImageNode] 文件超过20MB，压缩后上传...')
      const tempBlobUrl = URL.createObjectURL(file)
      try {
        const compressedBlob = await compressImageToTargetSize(tempBlobUrl, 15 * 1024 * 1024)
        URL.revokeObjectURL(tempBlobUrl)
        if (compressedBlob) {
          file = new File([compressedBlob], file.name, { type: 'image/jpeg', lastModified: Date.now() })
          console.log('[ImageNode] 压缩后大小:', (file.size / 1024 / 1024).toFixed(2), 'MB')
        }
      } catch (e) {
        URL.revokeObjectURL(tempBlobUrl)
        console.warn('[ImageNode] 压缩失败，尝试上传原文件:', e.message)
      }
    }
    
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
        
        // 也检查 output.urls（如果图片被移到了输出中）
        if (currentNode.data?.output?.urls?.includes(blobUrl)) {
          const updatedOutputUrls = currentNode.data.output.urls.map(
            url => url === blobUrl ? serverUrl : url
          )
          canvasStore.updateNodeData(nodeId, { 
            output: { ...currentNode.data.output, urls: updatedOutputUrls }
          })
          console.log('[ImageNode] 已静默更新 output.urls')
        }
      }
      
      // 同时更新所有下游节点中引用该 blob URL 的地方
      updateDownstreamBlobReferences(blobUrl, serverUrl)
      
      // 释放 blob URL 内存（从跟踪列表中移除）
      revokeTrackedBlobUrl(blobUrl)
    }
  } catch (error) {
    console.warn('[ImageNode] 后台上传失败，保持使用 blob URL:', error.message)
    // 🔧 标记上传失败，让用户知道需要重新上传
    const currentNode = canvasStore.nodes.find(n => n.id === nodeId)
    if (currentNode) {
      canvasStore.updateNodeData(nodeId, {
        isUploading: false,
        uploadFailed: true,
        uploadError: error.message
      })
    }
    // 注意：blob URL 仍在跟踪列表中，会在组件卸载时清理
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
    
    // 检查 output.urls
    if (node.data?.output?.urls?.includes(blobUrl)) {
      updates.output = {
        ...node.data.output,
        urls: node.data.output.urls.map(url => url === blobUrl ? serverUrl : url)
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
  
  // 单张超过20MB的图片压缩后再上传
  if (file.size > 20 * 1024 * 1024) {
    console.log('[ImageNode] 文件超过20MB，压缩后上传...')
    const tempBlobUrl = URL.createObjectURL(file)
    try {
      const compressedBlob = await compressImageToTargetSize(tempBlobUrl, 15 * 1024 * 1024)
      URL.revokeObjectURL(tempBlobUrl)
      if (compressedBlob) {
        file = new File([compressedBlob], file.name, { type: 'image/jpeg', lastModified: Date.now() })
        console.log('[ImageNode] 压缩后大小:', (file.size / 1024 / 1024).toFixed(2), 'MB')
      }
    } catch (e) {
      URL.revokeObjectURL(tempBlobUrl)
      console.warn('[ImageNode] 压缩失败，尝试上传原文件:', e.message)
    }
  }
  
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
    
    // 使用 Canvas 提取最后一帧（前端处理）
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
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

// 批量检测和压缩图片（>3张检测总大小，单张>20MB也压缩）
async function compressImagesIfNeeded(images) {
  if (!images || images.length === 0) return images

  const imageCount = images.length

  const sizes = await Promise.all(images.map(img => getImageSourceSize(img)))
  const totalSize = sizes.reduce((sum, s) => sum + s, 0)

  console.log('[ImageNode] 图片压缩检测:', {
    imageCount,
    sizes: sizes.map(s => (s / 1024 / 1024).toFixed(2) + 'MB'),
    totalSize: (totalSize / 1024 / 1024).toFixed(2) + 'MB'
  })

  // 确定批量压缩目标（仅超过3张时检测总大小）
  let batchTargetSize = Infinity
  if (imageCount > 3) {
    if (totalSize > 40 * 1024 * 1024) {
      batchTargetSize = 6 * 1024 * 1024
      console.log('[ImageNode] 总大小超过40MB，每张压缩到6MB以内')
    } else if (totalSize > 30 * 1024 * 1024) {
      batchTargetSize = 8 * 1024 * 1024
      console.log('[ImageNode] 总大小超过30MB，每张压缩到8MB以内')
    }
  }

  const result = []
  let anyCompressed = false

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const size = sizes[i]

    let targetSize = batchTargetSize

    // 单张超过20MB，无论图片数量都压缩到15MB以内
    if (size > 20 * 1024 * 1024) {
      targetSize = Math.min(targetSize, 15 * 1024 * 1024)
      console.log(`[ImageNode] 图片 ${i + 1} 单张超过20MB (${(size / 1024 / 1024).toFixed(2)}MB)，需要压缩`)
    }

    if (size <= targetSize || size === 0) {
      result.push(img)
      continue
    }

    console.log(`[ImageNode] 开始压缩图片 ${i + 1}: ${(size / 1024 / 1024).toFixed(2)}MB -> 目标 ${(targetSize / 1024 / 1024).toFixed(2)}MB`)

    try {
      const compressedBlob = await compressImageToTargetSize(img, targetSize)

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
  if (!str || typeof str !== 'string') return false
  // 检查是否是七牛云的 CDN 域名
  return str.includes('files.nananobanana.cn') || 
         str.includes('qncdn.') ||
         str.includes('.qiniucdn.com') ||
         str.includes('.qbox.me')
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
            // 上传失败，尝试直接使用 base64（部分 AI 服务支持）
            accessibleUrls.push(url)
          }
        } else {
          // 格式不正确，尝试直接使用
          accessibleUrls.push(url)
        }
      } catch (error) {
        console.error('[ImageNode] base64 处理失败:', error)
        // 回退到直接使用 base64
        accessibleUrls.push(url)
      }
    } else {
      // 其他格式，尝试直接使用
      console.warn('[ImageNode] 未知 URL 格式:', url.substring(0, 60))
      accessibleUrls.push(url)
    }
  }
  
  return accessibleUrls
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
    
    // 优先级：output.urls > output.url > sourceImages
    if (sourceNode.data?.output?.urls?.length > 0) {
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
  
  // 压缩检测：超过3张检测总大小并压缩，单张超过20MB也压缩
  const imagesToProcess = await compressImagesIfNeeded(finalReferenceImages)
  
  // 构建基础参数
  const baseParams = {
    prompt: finalPrompt || '保持原图风格',
    userPrompt: userPrompt || finalPrompt || '', // 用户原始输入（不含预设，用于历史显示）
    model: selectedModel.value,
    aspectRatio: selectedAspectRatio.value,
    count: 1, // 单次请求固定为1
    // 所有模型都传递 image_size 参数
    image_size: imageSize.value || '2K',
    // MJ 模型的 botType 参数（写实/动漫）
    ...(isMJModel.value && { botType: botType.value }),
    // Seedream 组图生成参数
    enableGroupGeneration: enableGroupGeneration.value,
    maxGroupImages: maxGroupImages.value,
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
async function executeNodeGeneration(nodeId, finalPrompt, taskIndex, userPrompt = null) {
  try {
    canvasStore.updateNodeData(nodeId, { 
      status: 'processing',
      progress: '生成中...'
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
      stack: error.stack,
      model: selectedModel.value,
      hasReferenceImages: referenceImages.value.length > 0,
      referenceImageCount: referenceImages.value.length
    }
    console.error(`[ImageNode] 任务 ${taskIndex + 1} 失败:`, error)
    console.error(`[ImageNode] 错误详情:`, errorDetail)
    canvasStore.updateNodeData(nodeId, {
      status: 'error',
      error: error.message
    })
    return { error: error.message, detail: errorDetail }
  }
}

// 创建新的图像节点用于接收新任务（当前节点正在生成中时使用）
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
    type: 'image',
    position: newNodePosition,
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
  const { fromGroup = false } = options
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

  // 检查总积分是否足够（单次消耗 * 次数）
  const totalCost = currentPointsCost.value * selectedCount.value
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
      console.log('[ImageNode] 当前节点正在生成，创建新节点接收任务:', newNodeId)
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
          type: 'image',
          position: {
            x: currentNode.position.x + stackOffset * i,
            y: currentNode.position.y + stackOffset * i
          },
          zIndex: -i,
          data: {
            title: `Image ${i + 1}`,
            nodeRole: 'output',
            status: 'pending',
            isStackedNode: true,
            stackIndex: i,
            parentNodeId: targetNodeId,
            prompt: promptText.value,
            model: selectedModel.value,
            aspectRatio: selectedAspectRatio.value,
            imageSize: imageSize.value,
            referenceImages: referenceImages.value
          }
        })
        allNodeIds.push(stackedNodeId)
      }
      console.log('[ImageNode] 创建堆叠节点:', allNodeIds.slice(1))
    }
  }
  
  // 更新目标节点状态
  canvasStore.updateNodeData(targetNodeId, { 
    status: 'processing',
    progress: generateCount > 1 ? `并行生成 ${generateCount} 张...` : '生成中...'
  })
  
  try {
    // 提交所有任务（任务提交后立即返回，不等待完成）
    // basePrompt 是用户原始输入（不含预设提示词），用于历史记录显示
    const submitPromises = allNodeIds.map((nodeId, index) => {
      return new Promise(async (resolve) => {
        // 间隔发送请求
        if (index > 0) {
          await delay(CONCURRENT_INTERVAL * index)
        }
        const result = await executeNodeGeneration(nodeId, finalPrompt, index, basePrompt)
        resolve(result)
      })
    })
    
    // 等待所有任务提交完成（不是等待任务结果完成）
    const allResults = await Promise.all(submitPromises)
    const successResults = allResults.filter(r => r !== null && !r?.error)
    const failedResults = allResults.filter(r => r?.error)
    
    console.log('[ImageNode] 全部任务已提交:', successResults.length, '/', generateCount, 
      failedResults.length > 0 ? '失败详情:' : '', failedResults)
    
    if (successResults.length === 0) {
      const firstError = failedResults[0]?.error || '未知错误'
      const detail = failedResults[0]?.detail || {}
      console.error('[ImageNode] 所有任务都失败，首个错误:', firstError, detail)
      const err = new Error(firstError)
      if (detail) err.detail = detail
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
    } else {
      throw new Error('生成完成但未返回图片URL')
    }
    
  } catch (error) {
    console.error('[ImageNode] 生成失败:', error)
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
  console.warn(`[ImageNode] 输出图片加载失败: ${imgUrl?.substring(0, 80)}`, { nodeId: props.id, index })
  const img = event.target
  if (img && imgUrl && !img.dataset.retried) {
    img.dataset.retried = 'true'
    setTimeout(() => {
      img.src = imgUrl + (imgUrl.includes('?') ? '&' : '?') + '_t=' + Date.now()
    }, 1000)
  }
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

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleGenerate()
  }
}

// 自动调整文本框高度
function autoResizeTextarea() {
  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  // 重置高度以获取正确的 scrollHeight
  textarea.style.height = 'auto'
  
  // 计算最小高度 (2行约48px) 和最大高度 (8行约200px)
  const minHeight = 48
  const maxHeight = 200
  const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))
  
  textarea.style.height = newHeight + 'px'
}

// 监听 promptText 变化，自动调整高度
watch(promptText, () => {
  nextTick(() => {
    autoResizeTextarea()
  })
})

// 文本框拖动自动滚动功能
const isAutoScrolling = ref(false) // 是否正在自动滚动（用于显示光标）

function startTextareaAutoScroll(event) {
  const textarea = promptTextareaRef.value
  if (!textarea) return
  
  // 只响应左键
  if (event.button !== 0) return
  
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
  // 获取当前节点在 store 中的数据
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) {
    console.warn('[ImageNode] 未找到当前节点')
    return
  }
  
  // 计算节点右侧输出端口的画布坐标
  // 使用响应式的节点尺寸（最准确）
  const currentNodeWidth = nodeWidth.value || props.data?.width || 380
  const currentNodeHeight = nodeHeight.value || props.data?.height || 320
  const labelHeight = 28 // 节点标签高度
  const labelMarginBottom = 8 // 标签与卡片之间的间距
  const labelOffset = labelHeight + labelMarginBottom // 标签总偏移（高度 + 间距）
  const handleOffset = 34 // +号按钮中心相对于节点卡片边缘的偏移量
  
  const outputX = currentNode.position.x + currentNodeWidth + handleOffset
  const outputY = currentNode.position.y + labelOffset + currentNodeHeight / 2
  
  console.log('[ImageNode] 开始拖拽连线，起始位置:', { 
    outputX, 
    outputY, 
    nodePosition: currentNode.position,
    nodeWidth: currentNodeWidth,
    nodeHeight: currentNodeHeight
  })
  
  // 调用 store 开始拖拽连线，使用节点输出端口位置作为起点
  canvasStore.startDragConnection(props.id, 'output', { x: outputX, y: outputY })
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
    hasUpstream: currentImages.length > 0
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

// ========== 参考图片 @引用 ==========
/**
 * 点击参考图片缩略图，在提示词光标处插入 @图片N 标记
 */
function insertMediaTag(media) {
  const tag = `@${media.label}`
  const textarea = promptTextareaRef.value
  if (!textarea) {
    promptText.value += tag
    return
  }

  const start = textarea.selectionStart ?? promptText.value.length
  const end = textarea.selectionEnd ?? start
  const before = promptText.value.slice(0, start)
  const after = promptText.value.slice(end)
  promptText.value = before + tag + after

  nextTick(() => {
    textarea.focus()
    const newPos = start + tag.length
    textarea.setSelectionRange(newPos, newPos)
  })
}

function handlePromptInput(event) {
  autoResizeTextarea(event)

  const el = event.target
  const cursorIndex = el.selectionStart
  const text = el.value
  const textBeforeCursor = text.slice(0, cursorIndex)

  const atIndex = textBeforeCursor.lastIndexOf('@')

  if (atIndex !== -1 && referenceMediaList.value.length > 0) {
    const query = textBeforeCursor.slice(atIndex + 1)

    // 已完成的引用（如 @图片1）不再弹窗
    if (/^(?:视频|图片|音频)\d/.test(query)) {
      showMentionPopup.value = false
      return
    }

    // 只在用户刚输入 @ 或弹窗已为同一个 @ 打开时才显示
    const justTypedAt = event.data === '@'
    const popupStillActive = showMentionPopup.value && mentionStartPos === atIndex

    if ((justTypedAt || popupStillActive) && query.length < 4 && !/\s/.test(query)) {
      showMentionPopup.value = true
      mentionStartPos = atIndex
      mentionActiveIndex.value = 0

      // 定位到 config-row（控制栏）下方，不遮挡输入区
      const configRow = el.closest('.config-panel')?.querySelector('.config-row')
      const posRect = configRow ? configRow.getBoundingClientRect() : el.getBoundingClientRect()
      mentionPosition.value = {
        top: posRect.bottom + 8,
        left: el.getBoundingClientRect().left + 12
      }
      return
    }
  }

  showMentionPopup.value = false
}

function handleMentionSelect(media) {
  const textarea = promptTextareaRef.value
  if (!textarea) return

  const tag = `@${media.label}`
  const cursorPos = textarea.selectionStart
  const before = promptText.value.slice(0, mentionStartPos)
  const after = promptText.value.slice(cursorPos)
  promptText.value = before + tag + ' ' + after

  showMentionPopup.value = false

  nextTick(() => {
    textarea.focus()
    const newPos = mentionStartPos + tag.length + 1
    textarea.setSelectionRange(newPos, newPos)
    autoResizeTextarea({ target: textarea })
  })
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
    
    <!-- 图片工具栏（选中且有图片时显示）- 与 TextNode 保持一致 -->
    <div v-show="showToolbar" class="image-toolbar">
      <button class="toolbar-btn" title="重绘" @mousedown.stop.prevent="handleToolbarRepaint" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>重绘</span>
      </button>
      <button class="toolbar-btn" title="擦除" @mousedown.stop.prevent="handleToolbarErase" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18.364 5.636a9 9 0 11-12.728 0M12 3v9" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4.5 16.5l3-3 3 3-3 3-3-3z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>擦除</span>
      </button>
      <button class="toolbar-btn" title="编辑" @mousedown.stop.prevent="handleToolbarEnhance" @click.stop.prevent>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>编辑</span>
      </button>
      <div class="toolbar-btn-wrapper">
        <button 
          class="toolbar-btn" 
          :class="{ 'is-processing': isRemovingBackground }"
          title="抠图" 
          @click.stop="handleToolbarCutout"
          :disabled="isRemovingBackground"
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
      <button 
        class="toolbar-btn" 
        :class="{ 'is-processing': isOutpainting }"
        title="扩图" 
        @click.stop="handleToolbarOutpaint"
        :disabled="isOutpainting"
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
      <button class="toolbar-btn icon-only" title="下载" @mousedown.stop.prevent="handleToolbarDownload" @click.stop.prevent>
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
        <!-- 彗星环绕发光特效（生成中显示，性能模式下禁用） -->
        <svg v-if="data.status === 'processing' && canvasStore.performanceMode === 'full'" class="comet-border" viewBox="0 0 100 100" preserveAspectRatio="none">
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
          <!-- 上传按钮（右上角）- 只有本地上传的图片才显示，历史记录/资产中的不显示 -->
          <button v-if="!isFromHistoryOrAsset" class="upload-overlay-btn" @click="handleReupload">
            <span class="upload-icon">↑</span>
            <span>上传</span>
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
            <img :src="getZoomAwareThumbnailUrl(sourceImages[0])" alt="上传的图片" :loading="isCanvasDragging ? 'lazy' : 'eager'" />
          </div>
        </template>
        
        <!-- ========== 输出节点：显示生成结果或空状态 ========== -->
        <template v-else>
          <!-- 主内容区域 -->
          <div class="node-content">
            <!-- 加载中状态 - 简洁文字显示 -->
            <div v-if="data.status === 'processing'" class="preview-loading">
              <span class="processing-text">生成中</span>
            </div>
            
            <!-- 错误状态 -->
            <div v-else-if="data.status === 'error'" class="preview-error" :class="{ 'content-safety': isContentSafetyError(data.error || errorMessage), 'timeout-error': isTimeoutError(data.error || errorMessage) }">
              <div class="error-icon">{{ isContentSafetyError(data.error || errorMessage) ? '🛡️' : isTimeoutError(data.error || errorMessage) ? '⏱️' : '❌' }}</div>
              <div class="error-text">{{ data.error || errorMessage || '生成失败' }}</div>
              <div v-if="getErrorHint(data.error || errorMessage)" class="error-hint">{{ getErrorHint(data.error || errorMessage) }}</div>
              <button class="retry-btn" @click="handleRegenerate">重试</button>
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
              <img 
                v-for="(img, index) in outputImages.slice(0, 4)" 
                :key="img || index"
                :src="getZoomAwareThumbnailUrl(img)" 
                :alt="`生成结果 ${index + 1}`"
                class="preview-image"
                :class="{ 'transparent-image': props.data?.isTransparent || props.data?.cutoutResult }"
                :loading="isCanvasDragging ? 'lazy' : 'eager'"
                @error="handleOutputImageError($event, img, index)"
              />
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
    
    <!-- 底部配置面板（仅输出节点选中时显示，拖动和缩放时隐藏） -->
    <div v-show="showConfigPanel" class="config-panel" :class="{ 'config-panel-readonly': props.data?.readonly }" @mousedown.stop>
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
            <img :src="getZoomAwareThumbnailUrl(img)" :alt="`图片 ${index + 1}`" />
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
        <textarea
          ref="promptTextareaRef"
          v-model="promptText"
          class="prompt-input"
          :placeholder="referenceImages.length > 0 ? '输入提示词，点击上方图片插入 @图片 引用\n例：让@图片1中的人物换上红色衣服（Enter 生成，Shift+Enter 换行）' : '描述你想要生成的内容，并在下方调整生成参数。(按下Enter 生成，Shift+Enter 换行)'"
          rows="2"
          @keydown="handleKeyDown"
          @input="handlePromptInput"
          @focus="autoResizeTextarea"
          @wheel.stop
          @mousedown="startTextareaAutoScroll"
          @dblclick.stop
        ></textarea>
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
              <span class="model-icon">🍌</span>
              <span class="model-name">{{ models.find(m => m.value === selectedModel)?.label || selectedModel }}</span>
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
                    <span class="model-item-icon">{{ m.icon }}</span>
                    <span class="model-item-label">{{ m.label }}</span>
                    <!-- 📊 成功率信号指示器 -->
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
                    </div>
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
  /* 覆盖 canvas-node 的默认边框，只使用内部 node-card 的边框 */
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  contain: layout style;
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
  align-items: center;
  justify-content: center;
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
  width: max-content;
  min-width: max(100%, 520px);
  max-width: 90vw;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 12px;
  overflow: visible; /* 允许下拉框超出显示 */
  z-index: 1000;
  pointer-events: auto;
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

.prompt-input {
  width: 100%;
  min-height: 48px;
  max-height: 200px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--canvas-text-primary, #fff);
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  overflow-y: auto;
  transition: height 0.15s ease;
  padding: 4px 0;
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
  padding: 12px 16px;
  gap: 16px;
  flex-wrap: nowrap;
}

.config-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.config-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

/* 模型选择器（自定义下拉框） */
.model-selector-custom {
  position: relative;
  z-index: 100;
}

.model-selector-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.model-selector-trigger:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.model-icon {
  font-size: 14px;
}

.model-name {
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
}

.select-arrow {
  color: var(--canvas-text-tertiary, #999);
  font-size: 10px;
  margin-left: -4px;
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
  max-height: 480px;
  overflow-y: auto;
  background: linear-gradient(135deg, rgba(18, 18, 22, 0.95), rgba(28, 28, 35, 0.92));
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
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
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.model-dropdown-item:last-child {
  border-bottom: none;
}

.model-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.model-dropdown-item.active {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(139, 92, 246, 0.06));
}

.model-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-item-icon {
  font-size: 14px;
}

.model-item-label {
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  flex: 1;
}

.model-item-points {
  font-size: 11px;
  color: #ffc107;
  background: rgba(255, 193, 7, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

/* 📊 模型成功率信号指示器 */
.model-signal-indicator {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  margin-left: auto;
  margin-right: 8px;
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
  margin-top: 4px;
  padding-left: 22px;
  font-size: 11px;
  color: var(--canvas-text-tertiary, #888);
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

/* 向上展开时的动画 */
.model-dropdown-list.dropdown-up.dropdown-fade-enter-from,
.model-dropdown-list.dropdown-up.dropdown-fade-leave-to {
  transform: translateY(8px);
}

/* 比例选择器 */
.ratio-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.ratio-selector:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.ratio-icon {
  font-size: 12px;
}

.ratio-select-input {
  background: rgba(0, 0, 0, 0.4);
  border: none;
  color: #ffffff;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  padding: 2px 4px;
  border-radius: 4px;
  -webkit-appearance: none;
  -moz-appearance: none;
}

/* 预设选择器样式 */
.preset-selector-custom {
  position: relative;
}

.preset-selector-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
  user-select: none;
}

.preset-selector-trigger:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.preset-icon {
  font-size: 14px;
  color: #888;
}

.preset-name {
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
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

/* 摄影机控制开关样式 */
.camera-control-toggle {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.camera-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  position: relative;
}

.camera-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}

.camera-toggle-btn.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}

.camera-toggle-btn .toggle-icon {
  font-size: 14px;
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
  background: rgba(0, 0, 0, 0.6);
}

/* 参数选择芯片 */
.param-chip {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 6px;
  color: var(--canvas-text-secondary, #888);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s, color 0.2s;
  user-select: none;
}

.param-chip:hover {
  border-color: var(--canvas-border-active, #4a4a4a);
  color: var(--canvas-text-primary, #fff);
}

.param-chip.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-accent-primary, #3b82f6);
}

.param-chip-group {
  display: flex;
  gap: 6px;
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
  font-size: 14px;
  color: var(--canvas-text-secondary, #888);
  font-weight: 500;
}

.count-display.clickable {
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  transition: border-color 0.2s, color 0.2s;
}

.count-display.clickable:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-accent-primary, #3b82f6);
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
  transition: background-color 0.2s, transform 0.2s, box-shadow 0.2s;
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

:root.canvas-theme-light .image-node .prompt-input::placeholder {
  color: #a8a29e;
}

:root.canvas-theme-light .image-node .model-selector-trigger {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .model-selector-trigger:hover {
  border-color: rgba(0, 0, 0, 0.2);
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
  background: rgba(139, 92, 246, 0.08);
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
}

:root.canvas-theme-light .image-node .model-item-points {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
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

/* 比例选择器 - 白昼模式 */
:root.canvas-theme-light .image-node .ratio-selector {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-node .ratio-selector:hover {
  border-color: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .image-node .ratio-select-input {
  background: rgba(0, 0, 0, 0.06);
  color: #1c1917;
}

:root.canvas-theme-light .image-node .ratio-select-input option {
  background: #ffffff;
  color: #1c1917;
}

:root.canvas-theme-light .image-node .ratio-select-input:hover {
  background: rgba(0, 0, 0, 0.1);
}

/* 参数选择芯片 - 白昼模式 */
:root.canvas-theme-light .image-node .param-chip {
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .image-node .param-chip:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.15);
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
