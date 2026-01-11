<script setup>
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
import { generateImageFromText, generateImageFromImage, pollTaskStatus, uploadImages } from '@/api/canvas/nodes'
import { registerTask } from '@/stores/canvas/backgroundTaskManager'
import { getApiUrl, getModelDisplayName, isModelEnabled, getAvailableImageModels, getTenantHeaders } from '@/config/tenant'
import { useI18n } from '@/i18n'
import { showAlert, showInsufficientPointsDialog } from '@/composables/useCanvasDialog'
import { getImagePresets, incrementPresetUseCount, createImagePreset, updateImagePreset } from '@/api/canvas/image-presets'
import ImagePresetDialog from '../dialogs/ImagePresetDialog.vue'
import ImagePresetManager from '../dialogs/ImagePresetManager.vue'
import ImageCropper from '../ImageCropper.vue'
import { removeBackground } from '@imgly/background-removal'

const { t } = useI18n()

// 节点根元素引用（用于计算工具栏位置）
const nodeRef = ref(null)

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals } = useVueFlow()

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

// 模型下拉框状态
const isModelDropdownOpen = ref(false)

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

// 图片列表拖拽排序状态
const dragSortIndex = ref(-1)
const dragOverIndex = ref(-1)

// 图片编辑器状态
const showImageEditor = ref(false)
const editorInitialTool = ref('')

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

// MJ botType 选择（图生图模式：写实/动漫）
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

// 组件挂载时添加全局点击事件监听
onMounted(() => {
  document.addEventListener('click', handleModelDropdownClickOutside)
  document.addEventListener('click', handleClickOutside)
  // 加载图像预设
  loadImagePresets()
  // 初始化时调整文本框高度（如果有预设文本）
  nextTick(() => {
    autoResizeTextarea()
  })
})

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleModelDropdownClickOutside)
  document.removeEventListener('click', handleClickOutside)
})

// 检查是否有图片输入（用于判断文生图/图生图模式）
const hasImageInput = computed(() => {
  // 1. 首先检查节点自身是否有参考图片（用户拖拽添加的）
  if (props.data?.sourceImages?.length > 0) {
    return true
  }
  
  // 2. 然后检查上游连接的节点
  const allEdges = [...canvasStore.edges]
  const allNodes = [...canvasStore.nodes]
  const upstreamEdges = allEdges.filter(e => e.target === props.id)
  
  for (const edge of upstreamEdges) {
    const sourceNode = allNodes.find(n => n.id === edge.source)
    if (!sourceNode) continue
    
    // 检查上游节点是否有图片输出
    const hasOutput = sourceNode.data?.output?.urls?.length > 0 || 
                      sourceNode.data?.output?.url ||
                      sourceNode.data?.sourceImages?.length > 0
    if (hasOutput) return true
    
    // 检查是否是图片类型节点（非文本节点）
    if (sourceNode.type === 'image' || sourceNode.type === 'imageGeneration') {
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

// 判断当前模型是否是 MJ 类型（通过模型名称判断，更可靠）
const isMJModel = computed(() => {
  const modelName = selectedModel.value?.toLowerCase() || ''
  // 匹配 mjv7、midjourney-vector、mjvector 等 MJ 相关模型
  const isMJ = modelName.includes('mjv7') || 
               modelName.includes('midjourney') || 
               modelName.includes('mjvector') ||
               modelName.includes('mj-')
  console.log('[ImageNode] 当前模型:', selectedModel.value, '| isMJ:', isMJ)
  return isMJ
})

// 默认尺寸选项配置（当模型配置中没有指定积分时使用）
const defaultSizePricing = { '1K': 3, '2K': 4, '4K': 5 }

// 获取当前模型的尺寸选项（从模型配置中读取积分）
const imageSizes = computed(() => {
  const currentModel = models.value.find(m => m.value === selectedModel.value)
  const pointsCost = currentModel?.pointsCost
  
  // 如果是按分辨率计费且 pointsCost 是对象
  if (currentModel?.hasResolutionPricing && typeof pointsCost === 'object') {
    return [
      { value: '1K', label: '1K', points: pointsCost['1k'] || pointsCost['1K'] || defaultSizePricing['1K'] },
      { value: '2K', label: '2K', points: pointsCost['2k'] || pointsCost['2K'] || defaultSizePricing['2K'] },
      { value: '4K', label: '4K', points: pointsCost['4k'] || pointsCost['4K'] || defaultSizePricing['4K'] }
    ]
  }
  
  // 默认尺寸配置
  return [
    { value: '1K', label: '1K', points: defaultSizePricing['1K'] },
    { value: '2K', label: '2K', points: defaultSizePricing['2K'] },
    { value: '4K', label: '4K', points: defaultSizePricing['4K'] }
  ]
})

// 是否显示尺寸选项（从模型配置中读取 hasResolutionPricing，MJ模型时隐藏）
const showResolutionOption = computed(() => {
  // MJ 模型不显示尺寸选项（不起作用）
  if (isMJModel.value) return false
  const currentModel = models.value.find(m => m.value === selectedModel.value)
  return currentModel?.hasResolutionPricing || false
})

// 是否显示预设选项（MJ模型时隐藏，因为不起作用）
const showPresetOption = computed(() => {
  return !isMJModel.value
})

// 计算当前积分消耗
const currentPointsCost = computed(() => {
  const currentModel = models.value.find(m => m.value === selectedModel.value)
  
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
  'has-single-output': hasSingleOutput.value // 是否只有单张输出（无边框显示）
}))

// 节点内容样式
// 注意：源节点和单图输出节点不使用 minHeight，让边框自适应图片尺寸
const contentStyle = computed(() => {
  const isSourceOrSingleOutput = isSourceNode.value || hasSingleOutput.value
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

// ========== 图片工具栏相关 ==========
// 拖动和缩放状态
const isDragging = ref(false)

// 拖动检测相关
const isMouseDown = ref(false) // 是否在节点上按下了鼠标
const dragStartPos = ref({ x: 0, y: 0 })
const hasMoved = ref(false)
const DRAG_THRESHOLD = 5 // 移动超过5px才算拖动

// 是否显示工具栏（选中且有图片内容）- 与 TextNode 保持一致
const showToolbar = computed(() => {
  if (!props.selected) return false
  return hasOutput.value || hasSourceImage.value
})

// 是否显示底部配置面板 - 与 TextNode 保持一致，选中即显示
// 修改：源节点也显示配置面板，以便添加参考图片
const showConfigPanel = computed(() => {
  return props.selected === true
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
  
  // 获取当前节点的图片URL
  const imageUrl = sourceImages.value?.[0] || props.data?.output?.url || props.data?.output?.urls?.[0]
  if (!imageUrl) return
  
  isRemovingBackground.value = true
  removeBgProgress.value = 0
  
  try {
    console.log('[ImageNode] 开始抠图处理，背景:', bgType)
    
    // 首先将图片转换为 Blob（避免跨域问题）
    let imageInput = imageUrl
    
    if (imageUrl.startsWith('http') || imageUrl.startsWith('/')) {
      try {
        const response = await fetch(imageUrl)
        const blob = await response.blob()
        imageInput = blob
      } catch (fetchError) {
        console.warn('[ImageNode] 无法获取远程图片，尝试直接使用 URL:', fetchError)
      }
    }
    
    // 使用 @imgly/background-removal 进行抠图
    const resultBlob = await removeBackground(imageInput, {
      progress: (key, current, total) => {
        if (total > 0) {
          removeBgProgress.value = Math.round((current / total) * 100)
        }
        console.log('[ImageNode] 抠图进度:', key, `${current}/${total}`)
      },
      model: 'isnet_quint8',
      debug: false
    })
    
    // 根据选择的背景颜色处理结果
    let finalDataUrl
    let isTransparent = false
    
    if (bgType === 'transparent') {
      // 透明背景 - 直接使用结果
      const reader = new FileReader()
      finalDataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(resultBlob)
      })
      isTransparent = true
    } else {
      // 有颜色背景 - 合成背景色
      const bgColor = bgType === 'custom' ? cutoutCustomColor.value : 
                      bgType === 'white' ? '#ffffff' : 
                      bgType === 'green' ? '#00ff00' : '#ffffff'
      
      finalDataUrl = await compositeWithBackground(resultBlob, bgColor)
      isTransparent = false
    }
    
    // 获取当前节点位置
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    if (!currentNode) {
      throw new Error('找不到当前节点')
    }
    
    // 在当前节点右侧创建新节点
    const newNodeId = `cutout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newNodePosition = {
      x: currentNode.position.x + 380,
      y: currentNode.position.y
    }
    
    // 创建新的图像节点
    const bgLabel = bgType === 'transparent' ? '透明' : 
                    bgType === 'white' ? '白底' : 
                    bgType === 'green' ? '绿幕' : '自定义底'
    
    canvasStore.addNode({
      id: newNodeId,
      type: 'image',
      position: newNodePosition,
      data: {
        label: `抠图-${bgLabel}`,
        output: {
          url: finalDataUrl,
          urls: [finalDataUrl]
        },
        sourceNodeId: props.id,
        isTransparent: isTransparent,
        cutoutResult: true,
        cutoutBgType: bgType
      }
    })
    
    console.log('[ImageNode] 抠图完成，已创建新节点:', newNodeId)
    
  } catch (error) {
    console.error('[ImageNode] 抠图失败:', error)
    showAlert('抠图失败', error.message || '处理过程中出现错误，请重试')
  } finally {
    isRemovingBackground.value = false
    removeBgProgress.value = 0
  }
}

// 将透明图片与背景色合成
async function compositeWithBackground(blob, bgColor) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      
      // 填充背景色
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // 绘制抠图结果
      ctx.drawImage(img, 0, 0)
      
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
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

// 9宫格裁剪状态
const isGridCropping = ref(false)

// 4宫格裁剪状态
const isGrid4Cropping = ref(false)

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

// 9宫格裁剪 - 将图片裁剪成9份并创建组
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
    // 加载图片 - 使用代理URL绕过CORS限制
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const proxiedUrl = getProxiedImageUrl(imageUrl)
    console.log('[ImageNode] 9宫格裁剪：加载图片', proxiedUrl?.substring(0, 80))
    
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = (e) => {
        console.error('[ImageNode] 9宫格裁剪：图片加载失败', e)
        reject(e)
      }
      img.src = proxiedUrl
    })
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / 3)
    const cellHeight = Math.floor(imgHeight / 3)
    
    // 裁剪成9份
    const croppedImages = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
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
        
        const dataUrl = canvas.toDataURL('image/png')
        croppedImages.push({
          index: row * 3 + col,
          row,
          col,
          dataUrl
        })
      }
    }
    
    // 计算节点布局参数
    const nodeWidth = 300
    const nodeHeight = 320
    const gap = 20
    
    // 获取当前节点位置
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const offsetX = 400 // 在原节点右侧
    
    // 创建9个图片节点
    const newNodeIds = []
    for (const item of croppedImages) {
      const nodeId = `grid-crop-${Date.now()}-${item.index}`
      const nodeX = baseX + offsetX + item.col * (nodeWidth + gap)
      const nodeY = baseY + item.row * (nodeHeight + gap)
      
      canvasStore.addNode({
        id: nodeId,
        type: 'image',
        position: { x: nodeX, y: nodeY },
        data: {
          label: `裁剪 ${item.row + 1}-${item.col + 1}`,
          nodeRole: 'source',  // 必须设置为source才能显示sourceImages
          sourceImages: [item.dataUrl],  // 使用sourceImages数组存储裁剪后的图片
          isGenerated: true,
          fromGridCrop: true  // 标记来源
        }
      })
      
      newNodeIds.push(nodeId)
    }
    
    // 创建包含这9个节点的组
    if (newNodeIds.length === 9) {
      canvasStore.createGroup(newNodeIds, '9宫格裁剪')
    }
    
    console.log('[ImageNode] 9宫格裁剪完成，创建了', newNodeIds.length, '个节点')
    
  } catch (error) {
    console.error('[ImageNode] 9宫格裁剪失败:', error)
  } finally {
    isGridCropping.value = false
  }
}

// 4宫格裁剪 - 将图片裁剪成4份并创建组 (2x2布局)
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
    // 加载图片 - 使用代理URL绕过CORS限制
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const proxiedUrl = getProxiedImageUrl(imageUrl)
    console.log('[ImageNode] 4宫格裁剪：加载图片', proxiedUrl?.substring(0, 80))
    
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = (e) => {
        console.error('[ImageNode] 4宫格裁剪：图片加载失败', e)
        reject(e)
      }
      img.src = proxiedUrl
    })
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / 2)
    const cellHeight = Math.floor(imgHeight / 2)
    
    // 裁剪成4份 (2x2)
    const croppedImages = []
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
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
        
        const dataUrl = canvas.toDataURL('image/png')
        croppedImages.push({
          index: row * 2 + col,
          row,
          col,
          dataUrl
        })
      }
    }
    
    // 计算节点布局参数
    const nodeWidth = 300
    const nodeHeight = 320
    const gap = 20
    
    // 获取当前节点位置
    const currentNode = canvasStore.nodes.find(n => n.id === props.id)
    const baseX = currentNode?.position?.x || 0
    const baseY = currentNode?.position?.y || 0
    const offsetX = 400 // 在原节点右侧
    
    // 创建4个图片节点
    const newNodeIds = []
    for (const item of croppedImages) {
      const nodeId = `grid4-crop-${Date.now()}-${item.index}`
      const nodeX = baseX + offsetX + item.col * (nodeWidth + gap)
      const nodeY = baseY + item.row * (nodeHeight + gap)
      
      canvasStore.addNode({
        id: nodeId,
        type: 'image',
        position: { x: nodeX, y: nodeY },
        data: {
          label: `裁剪 ${item.row + 1}-${item.col + 1}`,
          nodeRole: 'source',  // 必须设置为source才能显示sourceImages
          sourceImages: [item.dataUrl],  // 使用sourceImages数组存储裁剪后的图片
          isGenerated: true,
          fromGridCrop: true  // 标记来源
        }
      })
      
      newNodeIds.push(nodeId)
    }
    
    // 创建包含这4个节点的组
    if (newNodeIds.length === 4) {
      canvasStore.createGroup(newNodeIds, '4宫格裁剪')
    }
    
    console.log('[ImageNode] 4宫格裁剪完成，创建了', newNodeIds.length, '个节点')
    
  } catch (error) {
    console.error('[ImageNode] 4宫格裁剪失败:', error)
  } finally {
    isGrid4Cropping.value = false
  }
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
    if (generateResult.task_id) {
      const taskId = generateResult.task_id
      const currentTab = canvasStore.getCurrentTab()
      
      // 注册到后台任务管理器
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
      
      // 后台轮询，不阻塞
      pollTaskStatus(taskId, 'image', {
        interval: 2000,
        timeout: 300000,
        onProgress: (progress) => {
          canvasStore.updateNodeData(newNodeId, {
            progress: progress.status === 'processing' ? '扩图生成中...' : progress.status
          })
        }
      }).then(finalResult => {
        const imageUrl = finalResult.url || finalResult.urls?.[0] || finalResult.images?.[0]
        if (imageUrl) {
          // 更新节点为完成状态
          canvasStore.updateNodeData(newNodeId, {
            status: 'success',
            output: {
              type: 'image',
              url: imageUrl,
              urls: [imageUrl]
            }
          })
          console.log('[ImageNode] 扩图完成:', imageUrl)
        } else {
          canvasStore.updateNodeData(newNodeId, {
            status: 'error',
            error: '未获取到扩图结果'
          })
        }
      }).catch(error => {
        console.error('[ImageNode] 扩图轮询失败:', error)
        canvasStore.updateNodeData(newNodeId, {
          status: 'error',
          error: error.message || '扩图生成失败'
        })
      })
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

// 统一使用后端代理下载，解决跨域和第三方CDN预览问题
// 对于 dataUrl 格式的图片（如裁剪后的图片），直接在前端下载
async function handleToolbarDownload() {
  if (!currentImageUrl.value) return
  
  const filename = `image_${props.id || Date.now()}.png`
  
  try {
    const imageUrl = currentImageUrl.value
    
    // 如果是 dataUrl（base64），直接在前端转换为 Blob 下载
    // 避免 URL 过长导致请求失败（dataUrl 通常几十KB到几MB）
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
    
    // 如果是 blob URL，直接使用
    if (imageUrl.startsWith('blob:')) {
      console.log('[ImageNode] blob URL 格式图片，使用前端直接下载')
      const response = await fetch(imageUrl)
      const blob = await response.blob()
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
    
    // 其他 URL 统一走后端代理下载，后端会设置 Content-Disposition: attachment 头
    const { getApiUrl } = await import('@/config/tenant')
    const downloadUrl = getApiUrl(`/api/images/download?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(filename)}`)
    
    const response = await fetch(downloadUrl, {
      headers: getTenantHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('[ImageNode] 下载图片失败:', error)
    // 如果 fetch 失败，使用后端代理页面下载
    try {
      const { getApiUrl } = await import('@/config/tenant')
      window.location.href = getApiUrl(`/api/images/download?url=${encodeURIComponent(currentImageUrl.value)}&filename=${encodeURIComponent(filename)}`)
    } catch (e) {
      console.error('[ImageNode] 所有下载方式都失败:', e)
    }
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
  previewImageUrl.value = currentImageUrl.value
  showPreviewModal.value = true
}

function closePreviewModal() {
  showPreviewModal.value = false
  previewImageUrl.value = ''
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
// 直接在 computed 中处理，确保响应式依赖被正确追踪
const referenceImages = computed(() => {
  // 强制访问响应式数据的长度，确保依赖追踪
  const allEdges = [...canvasStore.edges]
  const allNodes = [...canvasStore.nodes]
  
  // 优化：只处理与当前节点相关的边
  const upstreamEdges = allEdges.filter(e => e.target === props.id)
  if (upstreamEdges.length === 0) {
    return []
  }
  
  // 只收集上游节点的数据（而不是所有节点）
  const upstreamNodeIds = new Set(upstreamEdges.map(e => e.source))
  const upstreamImages = []
  
  for (const edge of upstreamEdges) {
    const node = allNodes.find(n => n.id === edge.source)
    if (!node?.data) continue
    
    // 优先级：output.urls > output.url > sourceImages
    if (node.data.output?.urls?.length > 0) {
      upstreamImages.push(...node.data.output.urls)
    } else if (node.data.output?.url) {
      upstreamImages.push(node.data.output.url)
    } else if (node.data.sourceImages?.length > 0) {
      upstreamImages.push(...node.data.sourceImages)
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

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 快捷操作 - 初始状态显示 - 使用翻译键
const quickActions = [
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
    const blobUrl = URL.createObjectURL(file)
    console.log('[ImageNode] 秒加载 - 使用 blob URL 预览:', blobUrl)
    
    // 立即执行流程，使用 blob URL 显示
    if (actionType === 'image-to-image') {
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
    
    // 检查文件大小（限制 10MB）
    if (file.size > 10 * 1024 * 1024) {
      console.warn('[ImageNode] 文件过大，保持使用 blob URL')
      return
    }
    
    const urls = await uploadImages([file])
    if (urls && urls.length > 0) {
      const serverUrl = urls[0]
      console.log('[ImageNode] 后台上传成功，服务器URL:', serverUrl)
      
      // 静默更新节点中的 URL（将 blob URL 替换为服务器 URL）
      const currentNode = canvasStore.nodes.find(n => n.id === nodeId)
      if (currentNode) {
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
      
      // 释放 blob URL 内存
      URL.revokeObjectURL(blobUrl)
    }
  } catch (error) {
    console.warn('[ImageNode] 后台上传失败，保持使用 blob URL:', error.message)
    // 上传失败时不影响用户体验，保持 blob URL 可用
    // 在提交任务时，后端会处理 blob URL 转换
  }
}

// 上传图片文件 - 立即上传到服务器获取 URL（同步版本，用于编辑等场景）
async function uploadImageFile(file) {
  try {
    // 立即上传到服务器获取真正的 URL
    console.log('[ImageNode] 上传图片文件到服务器:', file.name, '大小:', (file.size / 1024).toFixed(2), 'KB')
    
    // 检查文件大小（限制 10MB）
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('图片文件过大，请选择小于 10MB 的图片')
    }
    
    const urls = await uploadImages([file])
    if (urls && urls.length > 0) {
      console.log('[ImageNode] 图片上传成功，URL:', urls[0])
      return urls[0]
    }
    throw new Error('上传返回空URL')
  } catch (error) {
    console.error('[ImageNode] 图片上传失败，错误:', error.message)
    console.warn('[ImageNode] 尝试使用 base64 作为备选方案')
    
    // 如果上传失败，回退到 base64（作为备用方案）
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        console.log('[ImageNode] base64 转换成功')
        resolve(e.target.result)
      }
      reader.onerror = (err) => {
        console.error('[ImageNode] base64 转换失败:', err)
        reject(err)
      }
      reader.readAsDataURL(file)
    })
  }
}

// 图生图流程
async function handleImageToImageFlow(imageUrl) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  // 1. 当前节点变成源节点（显示上传的图片）
  canvasStore.updateNodeData(props.id, {
    nodeRole: 'source',
    sourceImages: [imageUrl],
    title: t('canvas.nodes.image')
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
    
    // 转换为 Base64
    const frameDataUrl = canvas.toDataURL('image/jpeg', 0.9)
    
    console.log('[ImageNode] 尾帧提取成功')
    
    // 更新节点数据
    canvasStore.updateNodeData(props.id, {
      sourceImages: [frameDataUrl],
      nodeRole: 'source',
      needsFrameExtraction: false // 标记已完成
    })
    
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
    const blobUrl = URL.createObjectURL(file)
    console.log('[ImageNode] 更新图片 - 秒加载 blob URL:', blobUrl)
    
    canvasStore.updateNodeData(props.id, {
      sourceImages: [blobUrl]
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
    } else {
      // 其他格式，尝试直接使用
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
    ...(isMJModel.value && { botType: botType.value })
  }
  
  if (finalReferenceImages.length > 0) {
    // 图生图模式：需要确保所有图片都是有效的 URL
    let imageUrls = []
    
    // 分离不同类型的图片
    const base64Images = []
    const blobUrls = []
    const httpUrls = []
    
    for (const img of finalReferenceImages) {
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
      try {
        console.log('[ImageNode] 处理 blob URL...')
        for (const blobUrl of blobUrls) {
          const response = await fetch(blobUrl)
          const blob = await response.blob()
          const file = new File([blob], `blob_image_${Date.now()}.png`, { type: blob.type || 'image/png' })
          const urls = await uploadImages([file])
          if (urls && urls.length > 0) {
            imageUrls.push(urls[0])
          }
        }
        console.log('[ImageNode] blob URL 处理成功:', blobUrls.length, '张')
      } catch (e) {
        console.error('[ImageNode] blob URL 处理失败:', e)
        throw new Error('参考图片处理失败，请重试')
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
      
      // 后台轮询，不阻塞（使用独立的 Promise，不 await）
      pollTaskStatus(taskId, 'image', {
        interval: 2000,
        timeout: 300000,
        onProgress: (progress) => {
          canvasStore.updateNodeData(nodeId, { 
            progress: progress.status === 'processing' ? '生成中...' : progress.status
          })
        }
      }).then(finalResult => {
        const imageUrl = finalResult.url || finalResult.urls?.[0] || finalResult.images?.[0]
        if (imageUrl) {
          canvasStore.updateNodeData(nodeId, {
            status: 'success',
            output: { type: 'image', urls: [imageUrl] }
          })
        } else {
          canvasStore.updateNodeData(nodeId, {
            status: 'error',
            error: '未获取到生成结果'
          })
        }
      }).catch(error => {
        console.error(`[ImageNode] 任务 ${taskIndex + 1} 轮询失败:`, error)
        canvasStore.updateNodeData(nodeId, {
          status: 'error',
          error: error.message
        })
      })
      
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
    console.error(`[ImageNode] 任务 ${taskIndex + 1} 失败:`, error)
    console.error(`[ImageNode] 错误详情:`, {
      name: error.name,
      message: error.message,
      stack: error.stack
    })
    canvasStore.updateNodeData(nodeId, {
      status: 'error',
      error: error.message
    })
    return null
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
async function handleGenerate() {
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
  
  console.log('[ImageNode] 生成参数:', {
    userPrompt,
    upstreamPrompt,
    presetPrompt,
    finalPrompt,
    selectedPreset: selectedPreset.value,
    model: selectedModel.value,
    imageSize: imageSize.value,
    count: selectedCount.value,
    currentStatus: props.data.status
  })

  if (referenceImages.value.length === 0 && !finalPrompt) {
    await showAlert('请输入提示词或连接参考图片', '提示')
    return
  }
  
  // 检查总积分是否足够（单次消耗 * 次数）
  const totalCost = currentPointsCost.value * selectedCount.value
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
    const successResults = allResults.filter(r => r !== null)
    
    console.log('[ImageNode] 全部任务已提交:', successResults.length, '/', generateCount)
    
    if (successResults.length === 0) {
      throw new Error('所有任务提交都失败了')
    }
    
    // 任务提交成功后，立即恢复按钮状态，允许用户继续发起新任务
    isGenerating.value = false
    
  } catch (error) {
    console.error('[ImageNode] 生成失败:', error)
    errorMessage.value = error.message || '生成失败'
    canvasStore.updateNodeData(targetNodeId, {
      status: 'error',
      error: error.message
    })
    isGenerating.value = false
  }
}

// 保留原来的单次生成逻辑作为备用
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
          const finalResult = await pollTaskStatus(taskId, 'image', {
            interval: 2000,
            timeout: 300000
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
    console.warn('[ImageNode] 未找到当前节点')
    return
  }
  
  // 计算节点右侧输出端口的画布坐标（从节点位置计算）
  // 节点位置 + 节点宽度 + 偏移量 = +号按钮中心位置，Y 轴在节点中间 + 标签高度偏移
  const currentNodeWidth = props.data?.width || nodeWidth.value || 380
  const currentNodeHeight = props.data?.height || nodeHeight.value || 320
  const labelOffset = 28 // 标签高度偏移
  const handleOffset = 34 // +号按钮中心相对于节点卡片边缘的偏移量
  
  const outputX = currentNode.position.x + currentNodeWidth + handleOffset
  const outputY = currentNode.position.y + labelOffset + currentNodeHeight / 2
  
  console.log('[ImageNode] 开始拖拽连线，起始位置:', { outputX, outputY, nodePosition: currentNode.position })
  
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

// 删除参考图片
function removeReferenceImage(index) {
  const currentImages = [...(referenceImages.value || [])]
  const removedImage = currentImages[index]
  currentImages.splice(index, 1)
  
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
  
  edgesToRemove.forEach(edgeId => canvasStore.removeEdge(edgeId))
  nodesToRemove.forEach(nodeId => canvasStore.removeNode(nodeId))
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
      <button class="toolbar-btn" title="重绘" @mousedown.prevent="handleToolbarRepaint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>重绘</span>
      </button>
      <button class="toolbar-btn" title="擦除" @mousedown.prevent="handleToolbarErase">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M18.364 5.636a9 9 0 11-12.728 0M12 3v9" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4.5 16.5l3-3 3 3-3 3-3-3z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>擦除</span>
      </button>
      <button class="toolbar-btn" title="增强" @mousedown.prevent="handleToolbarEnhance">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="12" y="15" text-anchor="middle" font-size="8" font-weight="bold" fill="currentColor" stroke="none">HD</text>
        </svg>
        <span>增强</span>
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
      <button class="toolbar-btn" title="9宫格裁剪" @mousedown.prevent="handleToolbarGridCrop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <!-- 外框 -->
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- 垂直分割线 -->
          <line x1="9" y1="3" x2="9" y2="21" stroke-linecap="round"/>
          <line x1="15" y1="3" x2="15" y2="21" stroke-linecap="round"/>
          <!-- 水平分割线 -->
          <line x1="3" y1="9" x2="21" y2="9" stroke-linecap="round"/>
          <line x1="3" y1="15" x2="21" y2="15" stroke-linecap="round"/>
        </svg>
        <span>9宫格裁剪</span>
      </button>
      <button class="toolbar-btn" title="4宫格裁剪" @mousedown.prevent="handleToolbarGrid4Crop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <!-- 外框 -->
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- 垂直分割线 (中间一条) -->
          <line x1="12" y1="3" x2="12" y2="21" stroke-linecap="round"/>
          <!-- 水平分割线 (中间一条) -->
          <line x1="3" y1="12" x2="21" y2="12" stroke-linecap="round"/>
        </svg>
        <span>4宫格裁剪</span>
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn icon-only" title="标注" @mousedown.prevent="handleToolbarAnnotate">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="toolbar-btn icon-only" title="裁剪" @mousedown.prevent="handleToolbarCrop">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 2v4M6 18v4M2 6h4M18 6h4M18 18h-8a2 2 0 01-2-2V6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 6h10a2 2 0 012 2v10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="toolbar-btn icon-only" title="下载" @mousedown.prevent="handleToolbarDownload">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="toolbar-btn icon-only" title="放大预览" @mousedown.prevent="handleToolbarPreview">
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
            <linearGradient id="comet-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="transparent" />
              <stop offset="70%" stop-color="rgba(74, 222, 128, 0.3)" />
              <stop offset="90%" stop-color="rgba(74, 222, 128, 0.8)" />
              <stop offset="100%" stop-color="#4ade80" />
            </linearGradient>
            <!-- 发光滤镜 -->
            <filter id="comet-glow" x="-50%" y="-50%" width="200%" height="200%">
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
            stroke="url(#comet-gradient)" 
            stroke-width="2"
            stroke-linecap="round"
            filter="url(#comet-glow)"
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
          <div class="source-image-preview">
            <img :src="sourceImages[0]" alt="上传的图片" />
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
            <div v-else-if="data.status === 'error'" class="preview-error">
              <div class="error-icon">❌</div>
              <div class="error-text">{{ data.error || errorMessage || '生成失败' }}</div>
              <button class="retry-btn" @click="handleRegenerate">重试</button>
            </div>
            
            <!-- 输出预览 -->
            <div 
              v-else-if="hasOutput" 
              class="preview-images"
              :class="{ 
                'single-image': outputImages.length === 1,
                'transparent-bg': props.data?.isTransparent || props.data?.cutoutResult
              }"
            >
              <img 
                v-for="(img, index) in outputImages.slice(0, 4)" 
                :key="index"
                :src="img" 
                :alt="`生成结果 ${index + 1}`"
                class="preview-image"
                :class="{ 'transparent-image': props.data?.isTransparent || props.data?.cutoutResult }"
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
    <div v-show="showConfigPanel" class="config-panel" @mousedown.stop>
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
          placeholder="描述你想要生成的内容，并在下方调整生成参数。(按下Enter 生成，Shift+Enter 换行)"
          rows="2"
          @keydown="handleKeyDown"
          @input="autoResizeTextarea"
          @focus="autoResizeTextarea"
          @wheel.stop
          @mousedown="startTextareaAutoScroll"
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
          
          <!-- MJ 模型 botType 切换器（写实/动漫） -->
          <div v-if="isMJModel && hasImageInput" class="bot-type-selector">
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
            {{ currentPointsCost * selectedCount }} {{ t('imageGen.points') }}
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
    </div>
    
    <!-- 放大预览弹窗（使用 Teleport 渲染到 body） -->
    <Teleport to="body">
      <!-- 放大预览弹窗 -->
      <Transition name="modal-fade">
        <div v-if="showPreviewModal" class="preview-modal-overlay" @click="closePreviewModal">
          <div class="preview-modal-content" @click.stop>
            <img :src="previewImageUrl" alt="预览图片" class="preview-image" />
            <button class="preview-close-btn" @click="closePreviewModal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="preview-actions">
              <button class="preview-action-btn" @click="handleToolbarDownload">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>下载</span>
              </button>
            </div>
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
  transition: all 0.15s ease;
  white-space: nowrap;
}

.image-toolbar .toolbar-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.image-toolbar .toolbar-btn.is-processing {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  cursor: wait;
}

.image-toolbar .toolbar-btn.is-processing:hover {
  background: rgba(59, 130, 246, 0.2);
}

.image-toolbar .toolbar-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* 工具栏按钮包装器 - 用于弹窗定位 */
.image-toolbar .toolbar-btn-wrapper {
  position: relative;
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
  transition: all 0.15s;
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
  transition: all 0.15s;
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
  transition: all 0.2s ease;
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
  transition: all 0.2s ease;
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
  backdrop-filter: blur(2px);
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
  max-width: 100%;
  max-height: 100%;
  width: auto;
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
  transition: all 0.2s ease;
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
}

/* 预览状态 - 简洁文字 */
.preview-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border-radius: 12px;
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
  /* 让图片自适应，不强制填充容器 */
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
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
  transition: all 0.15s ease;
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
  transition: all 0.2s;
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
  max-height: 240px;
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
  background: rgba(255, 193, 7, 0.12);
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
  transition: all 0.2s;
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
  transition: all 0.2s;
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
  background: rgba(20, 20, 20, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  z-index: 1000;
  backdrop-filter: blur(8px);
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
  transition: all 0.2s;
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

/* MJ botType 选择器样式 - 黑白灰风格 */
.bot-type-selector {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
}

.bot-type-chip {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  color: rgba(255, 255, 255, 0.5);
}

.bot-type-chip:hover {
  color: rgba(255, 255, 255, 0.8);
}

.bot-type-chip.active {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.95);
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
  transition: all 0.2s;
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
  transition: all 0.2s ease;
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
  transition: all 0.15s ease;
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
</style>

<!-- 预览弹窗样式（非 scoped，因为使用 Teleport 渲染到 body） -->
<style>
/* ========== 预览弹窗 ========== */
.preview-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
  cursor: zoom-out;
}

.preview-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
}

.preview-modal-content .preview-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.preview-modal-content .preview-close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.preview-modal-content .preview-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.preview-modal-content .preview-close-btn svg {
  width: 16px;
  height: 16px;
}

.preview-modal-content .preview-actions {
  position: absolute;
  bottom: -50px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
}

.preview-modal-content .preview-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preview-modal-content .preview-action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.preview-modal-content .preview-action-btn svg {
  width: 18px;
  height: 18px;
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
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .image-node .model-dropdown-item {
  border-bottom-color: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .image-node .model-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .image-node .model-dropdown-item.active {
  background: rgba(245, 158, 11, 0.1);
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

</style>
