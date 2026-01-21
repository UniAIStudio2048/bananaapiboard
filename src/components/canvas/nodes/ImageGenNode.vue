<script setup>
/**
 * ImageGenNode.vue - 图片生成节点
 * 用于文生图和图生图
 */
import { ref, computed, inject, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { generateImageFromText, generateImageFromImage, pollTaskStatus } from '@/api/canvas/nodes'
import { getAvailableImageModels, getTenantHeaders } from '@/config/tenant'
import { useI18n } from '@/i18n'
import { showAlert, showInsufficientPointsDialog } from '@/composables/useCanvasDialog'
import { getImagePresets, createImagePreset, updateImagePreset, incrementPresetUseCount } from '@/api/canvas/image-presets'
import ImagePresetDialog from '../dialogs/ImagePresetDialog.vue'
import ImagePresetManager from '../dialogs/ImagePresetManager.vue'

const { t } = useI18n()

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// Vue Flow 实例 - 用于在节点尺寸变化时更新连线
const { updateNodeInternals } = useVueFlow()

// 模型下拉框状态
const isModelDropdownOpen = ref(false)

// 预设下拉框状态
const isPresetDropdownOpen = ref(false)
const selectedPreset = ref('')
const tenantPresets = ref([]) // 租户全局预设
const userPresets = ref([]) // 用户自定义预设
const showImagePresetDialog = ref(false)
const showImagePresetManager = ref(false)
const editingPreset = ref(null)
const tempCustomPrompt = ref('')
const presetManagerRef = ref(null)

// 本地状态
const isGenerating = ref(false)
const errorMessage = ref('')

// 生成参数
const selectedModel = ref(props.data.model || 'banana-pro')
const selectedResolution = ref(props.data.resolution || '1024')
const selectedAspectRatio = ref(props.data.aspectRatio || '1:1')
const selectedCount = ref(props.data.count || 1)

// 可用模型列表 - 从配置动态获取，支持新增模型自动同步
const models = computed(() => {
  return getAvailableImageModels()
})

const resolutions = [
  { value: '512', label: '512px' },
  { value: '768', label: '768px' },
  { value: '1024', label: '1K' },
  { value: '2048', label: '2K' }
]

const aspectRatios = [
  { value: '1:1', label: '1:1', icon: '□' },
  { value: '16:9', label: '16:9', icon: '▭' },
  { value: '9:16', label: '9:16', icon: '▯' },
  { value: '4:3', label: '4:3', icon: '▬' },
  { value: '3:4', label: '3:4', icon: '▮' }
]

const counts = [1, 2, 4, 8]

// 监听参数变化，保存到store
watch([selectedModel, selectedResolution, selectedAspectRatio, selectedCount], 
  ([model, resolution, aspectRatio, count]) => {
    canvasStore.updateNodeData(props.id, {
      model,
      resolution,
      aspectRatio,
      count
    })
  }
)

// 同步选中状态到 canvasStore（确保工具栏正确显示）
watch(() => props.selected, (isSelected) => {
  if (isSelected) {
    if (canvasStore.selectedNodeId !== props.id) {
      console.log('[ImageGenNode] 同步选中状态到 store:', props.id)
      canvasStore.selectNode(props.id)
    }
  }
}, { immediate: true })

// 节点尺寸 - 图片生成节点使用正方形
const nodeWidth = ref(props.data.width || 340)
const nodeHeight = ref(props.data.height || 340)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'image-gen-node': true,
  'selected': props.selected,
  'processing': props.data.status === 'processing',
  'success': props.data.status === 'success',
  'error': props.data.status === 'error',
  'resizing': isResizing.value
}))

// 节点内容样式
const contentStyle = computed(() => ({
  width: `${nodeWidth.value}px`,
  height: `${nodeHeight.value}px`
}))

// 是否有输出
const hasOutput = computed(() => 
  props.data.output?.urls?.length > 0 || props.data.output?.url
)

// 输出图片
const outputImages = computed(() => {
  if (props.data.output?.urls) return props.data.output.urls
  if (props.data.output?.url) return [props.data.output.url]
  return []
})

// 继承的数据（来自上游节点）
const inheritedText = computed(() => props.data.inheritedData?.content || '')
const inheritedImages = computed(() => props.data.inheritedData?.urls || [])

// 积分消耗
const pointsCost = computed(() => props.data.estimatedCost || 3)

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 图片编辑工具 - 黑白灰简洁风格
const editTools = [
  { icon: '⟲', label: '重绘', action: 'repaint' },
  { icon: '○', label: '擦除', action: 'erase' },
  { icon: '↑', label: '增强', action: 'upscale' },
  { icon: '⊡', label: '抠图', action: 'cutout' },
  { icon: '⊞', label: '扩图', action: 'expand' }
]

// 监听图片加载，自适应尺寸
function handleImageLoad(event, index) {
  if (index !== 0) return // 只根据第一张图片调整
  
  const img = event.target
  const aspectRatio = img.naturalWidth / img.naturalHeight
  
  // 如果是默认尺寸（1:1），则根据图片比例调整
  if (Math.abs(nodeWidth.value - nodeHeight.value) < 50 && nodeWidth.value < 380) {
    if (aspectRatio > 1) {
      nodeHeight.value = nodeWidth.value / aspectRatio
    } else if (aspectRatio < 1) {
      nodeWidth.value = nodeHeight.value * aspectRatio
    }
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

// 调整尺寸中
function handleResizeMove(event) {
  if (!isResizing.value) return
  
  const deltaX = event.clientX - resizeStart.value.x
  const deltaY = event.clientY - resizeStart.value.y
  
  const viewport = canvasStore.viewport
  const zoom = viewport.zoom || 1
  
  const scaledDeltaX = deltaX / zoom
  const scaledDeltaY = deltaY / zoom
  
  if (resizeHandle.value === 'right' || resizeHandle.value === 'corner') {
    nodeWidth.value = Math.max(200, resizeStart.value.width + scaledDeltaX)
  }
  
  if (resizeHandle.value === 'bottom' || resizeHandle.value === 'corner') {
    nodeHeight.value = Math.max(200, resizeStart.value.height + scaledDeltaY)
  }
  
  // 实时更新连线位置
  updateNodeInternals(props.id)
}

// 结束调整尺寸
function handleResizeEnd() {
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

// 获取当前选中预设的提示词（用于拼接到用户输入后面）
const currentPresetPrompt = computed(() => {
  if (!selectedPreset.value) return ''
  
  // 临时自定义使用 tempCustomPrompt
  if (selectedPreset.value === 'temp-custom') {
    return tempCustomPrompt.value
  }
  
  // 从可用预设列表中查找
  const preset = availablePresets.value.find(p => p.id === selectedPreset.value)
  return preset?.prompt || ''
})

// 开始生成
async function handleGenerate() {
  // 检查积分
  if (userPoints.value < pointsCost.value) {
    await showInsufficientPointsDialog(pointsCost.value, userPoints.value, selectedCount.value)
    return
  }

  // 获取用户输入的基础提示词
  const userPrompt = inheritedText.value || props.data.text || ''
  
  // 获取预设的提示词（如果有选择预设）
  const presetPrompt = currentPresetPrompt.value
  
  // 拼接提示词：用户输入 + 预设提示词
  // 预设提示词附加在用户提示词后面，用逗号分隔
  let finalPrompt = userPrompt
  if (presetPrompt) {
    if (userPrompt) {
      // 用户有输入，则拼接预设提示词到后面
      finalPrompt = `${userPrompt}, ${presetPrompt}`
    } else {
      // 用户没有输入，直接使用预设提示词
      finalPrompt = presetPrompt
    }
  }
  
  console.log('[ImageGenNode] 生成提示词:', { userPrompt, presetPrompt, finalPrompt })
  
  // 检查输入
  if (!finalPrompt && inheritedImages.value.length === 0) {
    await showAlert('请先输入提示词或选择预设，或上传参考图片', '提示')
    return
  }
  
  isGenerating.value = true
  errorMessage.value = ''
  
  // 更新状态为处理中
  canvasStore.updateNodeData(props.id, { status: 'processing' })
  
  try {
    let result
    const nodeType = props.data.type || 'text-to-image'
    
    // 根据节点类型调用不同的 API
    if (nodeType === 'image-to-image' || inheritedImages.value.length > 0) {
      // 图生图
      result = await generateImageFromImage({
        prompt: finalPrompt || '保持原图风格',
        images: inheritedImages.value,
        model: props.data.model || 'nano-banana-2',
        size: props.data.size || '1K',
        aspectRatio: props.data.aspectRatio || 'auto'
      })
    } else {
      // 文生图
      result = await generateImageFromText({
        prompt: finalPrompt,
        model: props.data.model || 'nano-banana-2',
        size: props.data.size || '1K',
        aspectRatio: props.data.aspectRatio || 'auto',
        count: 1
      })
    }
    
    console.log('[ImageGenNode] 生成任务已提交:', result)
    
    // 如果是异步任务，需要轮询状态
    if (result.task_id || result.id) {
      const taskId = result.task_id || result.id
      canvasStore.updateNodeData(props.id, { taskId })
      
      // 任务提交成功，立即恢复按钮状态
      isGenerating.value = false
      
      // 后台轮询任务状态（不阻塞UI）
      pollTaskStatus(taskId, 'image', {
        interval: 2000,
        timeout: 300000,
        onProgress: (status) => {
          console.log('[ImageGenNode] 任务进度:', status)
        }
      }).then(finalResult => {
        // 更新节点输出
        const urls = finalResult.urls || finalResult.images || []
        canvasStore.updateNodeData(props.id, {
          status: 'success',
          output: {
            type: 'image',
            urls: Array.isArray(urls) ? urls : [urls]
          }
        })
      }).catch(error => {
        console.error('[ImageGenNode] 轮询失败:', error)
        canvasStore.updateNodeData(props.id, {
          status: 'error',
          error: error.message
        })
      })
    } else if (result.urls || result.images) {
      // 直接返回结果
      const urls = result.urls || result.images || []
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        output: {
          type: 'image',
          urls: Array.isArray(urls) ? urls : [urls]
        }
      })
      isGenerating.value = false
    } else {
      throw new Error('生成结果格式异常')
    }
    
  } catch (error) {
    console.error('[ImageGenNode] 生成失败:', error)
    errorMessage.value = error.message || '生成失败'
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message
    })
    isGenerating.value = false
  }
}

// 重新生成
function handleRegenerate() {
  errorMessage.value = ''
  canvasStore.updateNodeData(props.id, { 
    status: 'idle',
    output: null,
    error: null
  })
  handleGenerate()
}

// 使用图片编辑工具
async function useTool(action) {
  console.log('使用工具:', action)
  await showAlert(`${action} 功能开发中...`, '提示')
}

// 下载图片
// - 七牛云 URL：直接使用 attname 参数下载（节省服务器流量）
// - 其他 URL：走后端代理下载（解决跨域问题）
async function downloadImage() {
  if (outputImages.value.length === 0) return
  
  const imageUrl = outputImages.value[0]
  const filename = `image_${props.id || Date.now()}.png`
  
  try {
    const { buildDownloadUrl, isQiniuCdnUrl } = await import('@/api/client')
    const downloadUrl = buildDownloadUrl(imageUrl, filename)
    
    // 七牛云 URL 直接下载
    if (isQiniuCdnUrl(imageUrl)) {
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
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
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('[ImageGenNode] 下载图片失败:', error)
    // 🔧 修复：使用新窗口打开下载链接，避免触发当前页面的 beforeunload 事件
    try {
      const { buildDownloadUrl } = await import('@/api/client')
      window.open(buildDownloadUrl(imageUrl, filename), '_blank')
    } catch (e) {
      console.error('[ImageGenNode] 所有下载方式都失败:', e)
    }
  }
}

// 打开右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: props.data.type || 'text-to-image', position: { x: 0, y: 0 }, data: props.data }
  )
}

// 右侧添加按钮
function handleAddClick(event) {
  event.stopPropagation()
  canvasStore.openNodeSelector(
    { x: event.clientX, y: event.clientY },
    'node',
    props.id
  )
}

// 模型下拉框方法
function toggleModelDropdown(event) {
  event.stopPropagation()
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
    console.log('[ImageGenNode] 图像预设已加载:', { tenant: tenantPresets.value.length, user: userPresets.value.length })
  } catch (error) {
    console.error('[ImageGenNode] 加载图像预设失败:', error)
  }
}

// 可用预设列表
const availablePresets = computed(() => {
  const presets = []

  // 1. 添加租户全局预设
  if (tenantPresets.value.length > 0) {
    presets.push(...tenantPresets.value.map(p => ({
      id: `tenant-${p.id}`,
      name: `🏢 ${p.name}`,
      prompt: p.prompt,
      description: p.description,
      type: 'tenant-global',
      _rawId: p.id
    })))
  }

  // 2. 添加分隔线
  if (presets.length > 0 && userPresets.value.length > 0) {
    presets.push({ id: 'divider-1', type: 'divider' })
  }

  // 3. 添加用户自定义预设
  if (userPresets.value.length > 0) {
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
      presets.push({ id: 'divider-2', type: 'divider' })
    }
    presets.push({
      id: 'temp-custom',
      name: '📌 临时自定义',
      type: 'temp-custom'
    })
  }

  // 5. 添加操作选项
  if (presets.length > 0) {
    presets.push({ id: 'divider-3', type: 'divider' })
  }
  presets.push({
    id: 'action-create',
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
    return '自动 (Auto)'
  }
  const preset = availablePresets.value.find(p => p.id === selectedPreset.value)
  return preset ? preset.name.replace(/^[📝🏢📌➕⚙️]\s/, '') : '自动 (Auto)'
})

// 切换预设下拉菜单
function togglePresetDropdown(event) {
  event?.stopPropagation()
  isPresetDropdownOpen.value = !isPresetDropdownOpen.value
  isModelDropdownOpen.value = false
}

// 选择预设
function selectPreset(presetId) {
  const preset = availablePresets.value.find(p => p.id === presetId)

  if (!preset) return

  // 处理特殊操作
  if (preset.type === 'action') {
    if (preset.id === 'action-create') {
      openImagePresetDialog()
    } else if (preset.id === 'action-manage') {
      openImagePresetManager()
    }
    isPresetDropdownOpen.value = false
    return
  }

  // 忽略分隔线
  if (preset.type === 'divider') return

  // 选择预设
  selectedPreset.value = presetId
  isPresetDropdownOpen.value = false

  // 使用预设的提示词更新继承数据
  if (preset.prompt) {
    canvasStore.updateNodeData(props.id, {
      inheritedData: {
        type: 'text',
        content: preset.prompt
      }
    })
  }

  // 增加使用次数（异步，不等待）
  if (preset._rawId) {
    incrementPresetUseCount(preset._rawId)
  }

  console.log('[ImageGenNode] 已选择预设:', preset.name)
}

// 打开自定义预设对话框（新建）
function openImagePresetDialog() {
  editingPreset.value = null
  showImagePresetDialog.value = true
}

// 打开自定义预设对话框（编辑）
function editImagePreset(preset) {
  editingPreset.value = preset
  showImagePresetDialog.value = true
  showImagePresetManager.value = false
}

// 打开预设管理器
function openImagePresetManager() {
  showImagePresetManager.value = true
  isPresetDropdownOpen.value = false
}

// 提交自定义预设（保存并使用）
async function handlePresetSubmit(data) {
  try {
    if (editingPreset.value) {
      // 更新现有预设
      await updateImagePreset(editingPreset.value._rawId, data)
      console.log('[ImageGenNode] 预设已更新')
    } else {
      // 创建新预设
      const result = await createImagePreset(data)
      console.log('[ImageGenNode] 预设已创建')

      // 自动选择新创建的预设
      selectedPreset.value = `user-${result.id}`

      // 使用预设的提示词
      canvasStore.updateNodeData(props.id, {
        inheritedData: {
          type: 'text',
          content: result.prompt
        }
      })
    }

    // 重新加载预设列表
    await loadImagePresets()

    // 如果预设管理器打开，刷新它
    if (presetManagerRef.value) {
      presetManagerRef.value.loadPresets()
    }

    // 关闭对话框
    showImagePresetDialog.value = false
  } catch (error) {
    console.error('[ImageGenNode] 保存预设失败:', error)
    alert(error.message || '保存失败，请重试')
  }
}

// 临时使用自定义提示词（不保存）
function handleTempUse(data) {
  tempCustomPrompt.value = data.prompt
  selectedPreset.value = 'temp-custom'

  // 使用临时提示词
  canvasStore.updateNodeData(props.id, {
    inheritedData: {
      type: 'text',
      content: data.prompt
    }
  })

  console.log('[ImageGenNode] 使用临时自定义提示词')
}

// 组件挂载时添加全局点击事件监听
onMounted(() => {
  document.addEventListener('click', handleModelDropdownClickOutside)
  // 加载图像预设
  loadImagePresets()
})

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleModelDropdownClickOutside)
})
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 图片编辑工具栏（仅在有输出时显示） -->
    <div v-if="hasOutput" class="image-gen-toolbar">
      <button 
        v-for="tool in editTools" 
        :key="tool.action"
        class="toolbar-btn"
        :title="tool.label"
        @click="useTool(tool.action)"
      >
        {{ tool.icon }}
      </button>
      <div class="toolbar-divider"></div>
      <button class="toolbar-btn" title="下载" @click="downloadImage">↓</button>
      <button class="toolbar-btn" title="全屏">⤢</button>
    </div>
    
    <!-- 节点头部 -->
    <div class="canvas-node-header">
      <div class="canvas-node-title">
        <span class="icon">⬡</span>
        {{ data.title || '图片生成' }}
      </div>
      <div class="canvas-node-actions">
        <button class="canvas-node-action-btn" title="更多">≡</button>
        <button class="canvas-node-action-btn" title="关闭">×</button>
      </div>
    </div>
    
    <!-- 节点内容 -->
    <div class="canvas-node-content" :style="contentStyle">
      <!-- 预览区域 -->
      <div class="canvas-node-preview">
        <!-- 加载中 -->
        <div v-if="data.status === 'processing'" class="preview-loading">
          <div class="canvas-loading-spinner"></div>
          <span>生成中...</span>
        </div>
        
        <!-- 错误状态 -->
        <div v-else-if="data.status === 'error'" class="preview-error">
          <div class="error-icon">❌</div>
          <div class="error-text">{{ data.error || errorMessage || '生成失败' }}</div>
          <button class="retry-btn" @click="handleRegenerate">重试</button>
        </div>
        
        <!-- 生成结果 -->
        <img 
          v-else-if="hasOutput" 
          :src="outputImages[0]" 
          alt="生成结果"
          @load="handleImageLoad($event, 0)"
        />
        
        <!-- 等待输入 -->
        <div v-else class="canvas-node-preview-empty">
          <div v-if="inheritedText">
            <div class="inherited-label">继承的提示词：</div>
            <div class="inherited-text">{{ inheritedText.slice(0, 100) }}{{ inheritedText.length > 100 ? '...' : '' }}</div>
          </div>
          <div v-else>等待输入...</div>
        </div>
      </div>
      
      <!-- 参考图（如果有） -->
      <div v-if="inheritedImages.length > 0" class="reference-images">
        <div 
          v-for="(img, index) in inheritedImages.slice(0, 3)" 
          :key="index"
          class="reference-image"
        >
          <img :src="img" :alt="`参考图 ${index + 1}`" />
        </div>
        <span class="reference-label">参考图{{ inheritedImages.length > 1 ? `${inheritedImages.length}张` : '' }}风格</span>
      </div>
      
      <!-- 生成控制 -->
      <div class="gen-controls">
        <div class="gen-params">
          <span class="param-item">Banana Pro</span>
          <span class="param-item">1K</span>
          <span class="param-item">Auto</span>
          <span class="param-item">1x</span>
        </div>
        
        <div class="gen-actions">
          <!-- 积分显示 -->
          <span class="points-cost">{{ pointsCost }} {{ t('imageGen.points') }}</span>
          
          <!-- 生成按钮 - 只在任务提交中禁用 -->
          <button 
            v-if="!hasOutput"
            class="canvas-node-btn"
            :disabled="isGenerating"
            @click="handleGenerate"
          >
            {{ isGenerating ? '...' : '→ 生成' }}
          </button>
          
          <!-- 重新生成按钮 -->
          <button 
            v-else
            class="canvas-node-btn secondary"
            @click="handleRegenerate"
          >
            ⟲ 重新生成
          </button>
        </div>
      </div>
      
      <!-- Resize Handles 调节手柄 -->
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
    
    <!-- 输入端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 输出端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="node-handle node-handle-hidden"
    />
    
    <!-- 右侧添加按钮 -->
    <button 
      v-if="hasOutput"
      class="node-add-btn"
      title="创建下一个节点"
      @click="handleAddClick"
    >
      +
    </button>
    
    <!-- 底部配置面板 - 选中时显示 -->
    <div v-show="selected" class="config-panel">
      <div class="settings-header">
        <span class="settings-title">生成设置</span>
      </div>
      
      <div class="settings-body">
        <!-- 预设选择 -->
        <div class="setting-group">
          <label class="setting-label">预设</label>
          <!-- 预设选择器（自定义下拉框） -->
          <div class="preset-selector-custom" @click.stop>
            <div
              class="preset-selector-trigger"
              @click="togglePresetDropdown"
            >
              <span class="preset-name">{{ selectedPresetLabel }}</span>
              <span class="select-arrow" :class="{ 'arrow-up': isPresetDropdownOpen }">▾</span>
            </div>

            <!-- 下拉选项列表 -->
            <Transition name="dropdown-fade">
              <div v-if="isPresetDropdownOpen" class="preset-dropdown-list" @wheel="handleDropdownWheel">
                <div
                  v-for="preset in availablePresets"
                  :key="preset.id"
                  :class="{
                    'preset-dropdown-item': preset.type !== 'divider',
                    'preset-dropdown-divider': preset.type === 'divider',
                    'active': selectedPreset === preset.id,
                    'action-item': preset.type === 'action'
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
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <!-- 模型选择 -->
        <div class="setting-group">
          <label class="setting-label">模型</label>
          <!-- 模型选择器（自定义下拉框，支持显示描述） -->
          <div class="model-selector-custom" @click.stop>
            <div 
              class="model-selector-trigger"
              @click="toggleModelDropdown"
            >
              <span class="model-icon">{{ models.find(m => m.value === selectedModel)?.icon || '⬡' }}</span>
              <span class="model-name">{{ models.find(m => m.value === selectedModel)?.label || selectedModel }}</span>
              <span class="select-arrow" :class="{ 'arrow-up': isModelDropdownOpen }">▾</span>
            </div>
            
            <!-- 下拉选项列表 -->
            <Transition name="dropdown-fade">
              <div v-if="isModelDropdownOpen" class="model-dropdown-list" @wheel="handleDropdownWheel">
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
                  </div>
                  <div v-if="m.description" class="model-item-desc">
                    {{ m.description }}
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
        
        <!-- 分辨率选择 -->
        <div class="setting-group">
          <label class="setting-label">分辨率</label>
          <div class="setting-options">
            <button 
              v-for="res in resolutions" 
              :key="res.value"
              class="setting-option-btn"
              :class="{ active: selectedResolution === res.value }"
              @click="selectedResolution = res.value"
            >
              {{ res.label }}
            </button>
          </div>
        </div>
        
        <!-- 比例选择 -->
        <div class="setting-group">
          <label class="setting-label">比例</label>
          <div class="setting-options">
            <button 
              v-for="ratio in aspectRatios" 
              :key="ratio.value"
              class="setting-option-btn ratio-btn"
              :class="{ active: selectedAspectRatio === ratio.value }"
              @click="selectedAspectRatio = ratio.value"
              :title="ratio.label"
            >
              <span class="ratio-icon">{{ ratio.icon }}</span>
              <span class="ratio-label">{{ ratio.label }}</span>
            </button>
          </div>
        </div>
        
        <!-- 出图数量 -->
        <div class="setting-group">
          <label class="setting-label">数量</label>
          <div class="setting-options">
            <button 
              v-for="count in counts" 
              :key="count"
              class="setting-option-btn count-btn"
              :class="{ active: selectedCount === count }"
              @click="selectedCount = count"
            >
              {{ count }}张
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 图像预设对话框 -->
    <ImagePresetDialog
      :isOpen="showImagePresetDialog"
      :preset="editingPreset"
      @close="showImagePresetDialog = false"
      @submit="handlePresetSubmit"
      @temp-use="handleTempUse"
    />

    <!-- 图像预设管理器 -->
    <ImagePresetManager
      ref="presetManagerRef"
      :isOpen="showImagePresetManager"
      @close="showImagePresetManager = false"
      @create="openImagePresetDialog"
      @edit="editImagePreset"
      @refresh="loadImagePresets"
      @select="selectPreset"
    />
  </div>
</template>

<style scoped>
.image-gen-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--canvas-bg-secondary);
  border-bottom: 1px solid var(--canvas-border-subtle);
  border-radius: var(--canvas-radius-md) var(--canvas-radius-md) 0 0;
}

.toolbar-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--canvas-radius-sm);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: var(--canvas-bg-elevated);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--canvas-border-subtle);
  margin: 0 4px;
}

.canvas-node-preview {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--canvas-text-secondary);
  font-size: 13px;
}

.preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  text-align: center;
}

.error-icon {
  font-size: 24px;
}

.error-text {
  font-size: 12px;
  color: var(--canvas-accent-error);
  max-width: 200px;
  word-break: break-word;
}

.retry-btn {
  margin-top: 8px;
  padding: 6px 16px;
  border: 1px solid var(--canvas-border-default);
  border-radius: var(--canvas-radius-sm);
  background: transparent;
  color: var(--canvas-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: var(--canvas-bg-elevated);
  color: var(--canvas-text-primary);
  border-color: var(--canvas-border-active);
}

.inherited-label {
  font-size: 11px;
  color: var(--canvas-text-tertiary);
  margin-bottom: 4px;
}

.inherited-text {
  font-size: 12px;
  color: var(--canvas-text-secondary);
  line-height: 1.4;
}

.reference-images {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border-subtle);
}

.reference-image {
  width: 48px;
  height: 48px;
  border-radius: var(--canvas-radius-sm);
  overflow: hidden;
  background: var(--canvas-bg-secondary);
}

.reference-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.reference-label {
  font-size: 12px;
  color: var(--canvas-text-tertiary);
}

.gen-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--canvas-border-subtle);
}

.gen-params {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-item {
  font-size: 11px;
  color: var(--canvas-text-tertiary);
  background: var(--canvas-bg-secondary);
  padding: 4px 8px;
  border-radius: 4px;
}

.gen-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 积分显示 - 黑白灰风格 */
.points-cost {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
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
:deep(.vue-flow__handle.target) {
  left: -39px !important;
  top: calc(50% + 14px) !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.source) {
  right: -39px !important;
  top: calc(50% + 14px) !important;
  transform: translateY(-50%) !important;
}

.node-add-btn {
  position: absolute;
  right: -52px;
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

.canvas-node:hover .node-add-btn,
.image-gen-node.selected .node-add-btn {
  opacity: 1;
}

.node-add-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-50%) scale(1.1);
}

/* 节点内容区域 */
.canvas-node-content {
  position: relative;
  overflow: hidden;
}

.image-gen-node.resizing .canvas-node-content {
  pointer-events: none;
  user-select: none;
}

/* Resize Handles 调节手柄 */
.resize-handle {
  position: absolute;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 20;
}

.canvas-node-content:hover .resize-handle {
  opacity: 1;
}

.resize-handle-right {
  right: -2px;
  top: 0;
  width: 4px;
  height: 100%;
  cursor: ew-resize;
  background: transparent;
}

.resize-handle-right:hover,
.resize-handle-right:active {
  background: var(--canvas-accent-primary, #3b82f6);
}

.resize-handle-bottom {
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 4px;
  cursor: ns-resize;
  background: transparent;
}

.resize-handle-bottom:hover,
.resize-handle-bottom:active {
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

/* 底部配置面板 */
.config-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 12px;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 100;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.settings-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--canvas-text-primary, #fff);
}

.settings-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-secondary, #a0a0a0);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.setting-select {
  padding: 8px 12px;
  background: var(--canvas-bg-secondary, #141414);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  color: var(--canvas-text-primary, #fff);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.setting-select:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
}

.setting-select:focus {
  outline: none;
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.setting-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.setting-option-btn {
  padding: 8px 16px;
  background: var(--canvas-bg-secondary, #141414);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.setting-option-btn:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: var(--canvas-text-primary, #fff);
}

.setting-option-btn.active {
  background: var(--canvas-accent-primary, #3b82f6);
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: white;
  font-weight: 600;
}

.ratio-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  min-width: 60px;
}

.ratio-icon {
  font-size: 16px;
}

.ratio-label {
  font-size: 11px;
}

.count-btn {
  min-width: 60px;
}

/* 模型选择器自定义样式 */
.model-selector-custom {
  position: relative;
  width: 100%;
}

.model-selector-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--canvas-bg-secondary, #141414);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.model-selector-trigger:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
}

.model-icon {
  font-size: 16px;
  line-height: 1;
}

.model-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--canvas-text-primary, #fff);
}

.select-arrow {
  font-size: 10px;
  color: var(--canvas-text-secondary, #a0a0a0);
  transition: transform 0.2s ease;
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
  transition: background 0.15s ease;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.model-dropdown-item:last-child {
  border-bottom: none;
}

.model-dropdown-item:hover {
  background: var(--canvas-bg-secondary, #252525);
}

.model-dropdown-item.active {
  background: rgba(59, 130, 246, 0.1);
}

.model-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-item-icon {
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  width: 16px;
  justify-content: center;
}

.model-item-icon-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.model-item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--canvas-text-primary, #fff);
}

.model-item-desc {
  margin-top: 4px;
  padding-left: 24px;
  font-size: 11px;
  color: var(--canvas-text-secondary, #a0a0a0);
  line-height: 1.4;
}

/* 预设选择器样式（与模型选择器类似） */
.preset-selector-custom {
  position: relative;
  width: 100%;
}

.preset-selector-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--canvas-bg-secondary, #141414);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.preset-selector-trigger:hover {
  border-color: var(--canvas-accent-primary, #3b82f6);
}

.preset-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--canvas-text-primary, #fff);
}

.preset-dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 240px;
  max-height: 280px;
  overflow-y: auto;
  background: rgba(20, 20, 20, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  z-index: 1000;
  backdrop-filter: blur(8px);
}

/* 黑白灰滚动条样式 */
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
  transition: background 0.2s;
}

.preset-dropdown-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.preset-dropdown-list::-webkit-scrollbar-thumb:active {
  background: rgba(255, 255, 255, 0.35);
}

.preset-dropdown-item {
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.preset-dropdown-item:last-child {
  border-bottom: none;
}

.preset-dropdown-item:hover {
  background: var(--canvas-bg-secondary, #252525);
}

.preset-dropdown-item.active {
  background: rgba(59, 130, 246, 0.1);
}

.preset-dropdown-item.action-item {
  color: var(--canvas-accent-primary, #3b82f6);
  font-weight: 500;
}

.preset-dropdown-item.action-item:hover {
  background: rgba(59, 130, 246, 0.1);
}

.preset-dropdown-divider {
  height: 1px;
  background: var(--canvas-border, rgba(255, 255, 255, 0.1));
  margin: 4px 0;
  pointer-events: none;
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
  color: var(--canvas-text-secondary, #a0a0a0);
  line-height: 1.4;
}

/* 下拉框动画 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   ImageGenNode 白昼模式样式适配
   ======================================== */

/* 配置面板 - 白昼模式 */
:root.canvas-theme-light .image-gen-node .config-panel {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .image-gen-node .settings-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .image-gen-node .settings-title {
  color: #1c1917;
}

:root.canvas-theme-light .image-gen-node .setting-label {
  color: #57534e;
}

/* 输入框和选择器 - 白昼模式 */
:root.canvas-theme-light .image-gen-node .setting-input,
:root.canvas-theme-light .image-gen-node .setting-select,
:root.canvas-theme-light .image-gen-node .setting-textarea {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.1);
  color: #1c1917;
}

:root.canvas-theme-light .image-gen-node .setting-input:focus,
:root.canvas-theme-light .image-gen-node .setting-select:focus,
:root.canvas-theme-light .image-gen-node .setting-textarea:focus {
  border-color: #3b82f6;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .image-gen-node .setting-input::placeholder,
:root.canvas-theme-light .image-gen-node .setting-textarea::placeholder {
  color: #a8a29e;
}

:root.canvas-theme-light .image-gen-node .setting-select option {
  background: #ffffff;
  color: #1c1917;
}

/* 复选框 - 白昼模式 */
:root.canvas-theme-light .image-gen-node .setting-checkbox {
  color: #1c1917;
}

/* 节点标题 - 白昼模式 */
:root.canvas-theme-light .image-gen-node .node-label {
  color: #f59e0b;
}
</style>

