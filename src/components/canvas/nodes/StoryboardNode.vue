<script setup>
/**
 * StoryboardNode.vue - 分镜格子节点
 *
 * 功能：
 * - 支持 2x2, 3x3, 4x4 格子布局（默认 3x3）
 * - 支持多种比例：16:9, 9:16, 3:4, 4:3, 1:1（默认 16:9）
 * - 每个格子可以拖放图片
 * - 格子之间可拖拽调整顺序
 * - 左侧 + 号接收上游节点图片输入（自动按顺序填充）
 * - 右侧 + 号输出拼接后的图片（最长边压缩到 3840px）
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { uploadImages } from '@/api/canvas/nodes'

const props = defineProps({
  id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'storyboard'
  },
  data: {
    type: Object,
    default: () => ({})
  },
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  },
  selected: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:data', 'delete'])
const canvasStore = useCanvasStore()
const { updateNodeInternals } = useVueFlow()

// ========== 节点标签 ==========
const localLabel = ref(props.data.title || '分镜格子')
const isEditingLabel = ref(false)
const labelInputRef = ref(null)

function startEditLabel() {
  isEditingLabel.value = true
  nextTick(() => {
    if (labelInputRef.value) {
      labelInputRef.value.focus()
      labelInputRef.value.select()
    }
  })
}

function finishEditLabel() {
  isEditingLabel.value = false
  if (!localLabel.value.trim()) {
    localLabel.value = '分镜格子'
  }
  updateNodeData()
}

function handleLabelKeydown(event) {
  if (event.key === 'Enter') {
    finishEditLabel()
  } else if (event.key === 'Escape') {
    localLabel.value = props.data.title || '分镜格子'
    isEditingLabel.value = false
  }
}

// ========== 格子配置 ==========
const gridSize = ref(props.data.gridSize || '3x3')
const aspectRatio = ref(props.data.aspectRatio || '16:9')

// 网格尺寸选项
const gridSizeOptions = [
  { value: '1x3', label: '1×3' },
  { value: '1x4', label: '1×4' },
  { value: '2x2', label: '2×2' },
  { value: '2x3', label: '2×3' },
  { value: '3x1', label: '3×1' },
  { value: '3x2', label: '3×2' },
  { value: '3x3', label: '3×3' },
  { value: '4x1', label: '4×1' },
  { value: '4x4', label: '4×4' }
]

// 比例选项
const aspectRatioOptions = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' }
]

// 下拉菜单显示状态
const showRatioDropdown = ref(false)
const showGridDropdown = ref(false)
const ratioDropdownRef = ref(null)
const gridDropdownRef = ref(null)

function toggleRatioDropdown(event) {
  event.stopPropagation()
  showRatioDropdown.value = !showRatioDropdown.value
  showGridDropdown.value = false
}

function toggleGridDropdown(event) {
  event.stopPropagation()
  showGridDropdown.value = !showGridDropdown.value
  showRatioDropdown.value = false
}

function selectRatio(value) {
  aspectRatio.value = value
  showRatioDropdown.value = false
}

function selectGrid(value) {
  gridSize.value = value
  showGridDropdown.value = false
}

// 点击外部关闭下拉
function handleClickOutsideDropdown(event) {
  if (ratioDropdownRef.value && !ratioDropdownRef.value.contains(event.target)) {
    showRatioDropdown.value = false
  }
  if (gridDropdownRef.value && !gridDropdownRef.value.contains(event.target)) {
    showGridDropdown.value = false
  }
}

// 布局配置映射
const layoutConfig = computed(() => {
  const configs = {
    '1x3': { cols: 3, rows: 1, count: 3 },
    '1x4': { cols: 4, rows: 1, count: 4 },
    '2x2': { cols: 2, rows: 2, count: 4 },
    '2x3': { cols: 3, rows: 2, count: 6 },
    '3x1': { cols: 1, rows: 3, count: 3 },
    '3x2': { cols: 2, rows: 3, count: 6 },
    '3x3': { cols: 3, rows: 3, count: 9 },
    '4x1': { cols: 1, rows: 4, count: 4 },
    '4x4': { cols: 4, rows: 4, count: 16 }
  }
  return configs[gridSize.value] || configs['3x3']
})

// ========== 图片数据 ==========
const gridCount = computed(() => layoutConfig.value.count)
const images = ref(Array(16).fill(null).map((_, i) => props.data.images?.[i] || null))

// ========== 编辑模式 ==========
const isEditMode = ref(false)

function enterEditMode() {
  isEditMode.value = true
}

function exitEditMode() {
  isEditMode.value = false
  // 清理拖拽状态
  editDragIndex.value = null
  editDropTargetIndex.value = null
  editDragGhostStyle.value = null
}

function handleNodeDblClick(event) {
  // 如果正在编辑标签名称，不进入编辑模式
  if (isEditingLabel.value) return

  // 双击会触发两次 click，这里确保预览计时器被取消
  if (clickPreviewTimer) {
    clearTimeout(clickPreviewTimer)
    clickPreviewTimer = null
  }

  event.stopPropagation()
  event.preventDefault()

  if (!isEditMode.value) {
    enterEditMode()
  } else {
    exitEditMode()
  }
}

// 按 Esc 退出编辑模式
function handleEditModeKeydown(event) {
  if (event.key === 'Escape' && isEditMode.value) {
    exitEditMode()
  }
}

// 点击节点外部退出编辑模式
const nodeRootRef = ref(null)
function handleClickOutsideNode(event) {
  if (isEditMode.value && nodeRootRef.value && !nodeRootRef.value.contains(event.target)) {
    exitEditMode()
  }
}

// ========== 编辑模式拖拽排序（自定义鼠标拖拽） ==========
const editDragIndex = ref(null)
const editDropTargetIndex = ref(null)
const editDragGhostStyle = ref(null)
const editDragImageSrc = ref(null)

function handleEditDragStart(event, index) {
  if (!isEditMode.value) return
  const url = images.value[index]
  if (!url) return

  event.stopPropagation()
  event.preventDefault()

  editDragIndex.value = index
  editDragImageSrc.value = url

  // 获取格子元素的位置以计算偏移
  const rect = event.currentTarget.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const offsetY = event.clientY - rect.top

  editDragGhostStyle.value = {
    left: (event.clientX - offsetX) + 'px',
    top: (event.clientY - offsetY) + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
    _offsetX: offsetX,
    _offsetY: offsetY
  }

  document.addEventListener('mousemove', handleEditDragMove)
  document.addEventListener('mouseup', handleEditDragEnd)
}

function handleEditDragMove(event) {
  if (editDragIndex.value === null) return

  const offsetX = editDragGhostStyle.value._offsetX
  const offsetY = editDragGhostStyle.value._offsetY

  editDragGhostStyle.value = {
    ...editDragGhostStyle.value,
    left: (event.clientX - offsetX) + 'px',
    top: (event.clientY - offsetY) + 'px'
  }

  // 检测鼠标悬停的目标格子
  const gridItems = nodeRootRef.value?.querySelectorAll('.grid-item')
  if (!gridItems) return

  let foundTarget = null
  gridItems.forEach((el, idx) => {
    const rect = el.getBoundingClientRect()
    if (
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom
    ) {
      foundTarget = idx
    }
  })

  editDropTargetIndex.value = (foundTarget !== null && foundTarget !== editDragIndex.value) ? foundTarget : null
}

function handleEditDragEnd(event) {
  document.removeEventListener('mousemove', handleEditDragMove)
  document.removeEventListener('mouseup', handleEditDragEnd)

  // 执行交换
  if (editDragIndex.value !== null && editDropTargetIndex.value !== null && editDragIndex.value !== editDropTargetIndex.value) {
    const fromIdx = editDragIndex.value
    const toIdx = editDropTargetIndex.value
    const temp = images.value[fromIdx]
    images.value[fromIdx] = images.value[toIdx]
    images.value[toIdx] = temp
    updateNodeData()
  }

  editDragIndex.value = null
  editDropTargetIndex.value = null
  editDragGhostStyle.value = null
  editDragImageSrc.value = null
}

// ========== 拖拽状态（普通模式） ==========
const dragIndex = ref(null)
const dragOverIndex = ref(null)
const isDragOver = ref(false)

// ========== 合并状态 ==========
const isMerging = ref(false)

// ========== 上传进度 ==========
const uploadingIndex = ref(null)
const fileInputRef = ref(null)
const currentUploadIndex = ref(null)

// ========== 输出图片 ==========
const outputImageUrl = ref(props.data.output?.url || null)

// ========== 全屏预览 ==========
const previewImageUrl = ref(null)
const previewVisible = ref(false)

// ========== 替换图片 ==========
const replaceInputRef = ref(null)
const replaceTargetIndex = ref(null)

// ========== 工具栏显示状态 ==========
// 工具栏只在选中时显示
const showToolbar = computed(() => {
  return props.selected === true
})

// ========== 节点尺寸 ==========
const nodeWidth = ref(props.data.nodeWidth || 300)
const nodeHeight = ref(props.data.nodeHeight || 400)
const minWidth = 120
const maxWidth = 600
const minHeight = 150
const maxHeight = 700

// ========== 根据比例自动调整高度 ==========
// 9:16 竖屏：高度是宽度的 16/9 倍
// 16:9 横屏：高度是宽度的 9/16 倍
const aspectRatioMap = {
  '16:9': 9/16,   // 横屏
  '9:16': 16/9,   // 竖屏
  '3:4': 4/3,     // 竖屏
  '4:3': 3/4,     // 横屏
  '1:1': 1        // 正方形
}

// 根据比例计算高度
const ratioHeight = computed(() => {
  const ratio = aspectRatioMap[aspectRatio.value] || 9/16
  return Math.round(nodeWidth.value * ratio)
})

// 监听比例变化，自动调整高度
watch(aspectRatio, () => {
  // 只有在用户没有手动调整过大小时，才自动调整
  // 这里简化处理：始终根据宽度和比例计算高度
  nodeHeight.value = ratioHeight.value
  updateNodeData()
})

// 初始高度设置
onMounted(() => {
  // 根据初始比例设置高度
  nodeHeight.value = ratioHeight.value
  if (props.data.nodeHeight) {
    nodeHeight.value = props.data.nodeHeight
  }
})

// ========== 拖拽缩放（右下角） ==========
const isResizing = ref(false)
const resizeStartX = ref(0)
const resizeStartY = ref(0)
const resizeStartWidth = ref(0)
const resizeStartHeight = ref(0)

function startResize(event) {
  isResizing.value = true
  resizeStartX.value = event.clientX
  resizeStartY.value = event.clientY
  resizeStartWidth.value = nodeWidth.value
  resizeStartHeight.value = nodeHeight.value
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  // 安全兜底：如果鼠标离开窗口等异常情况，3秒后自动恢复
  resizeSafetyTimer = setTimeout(() => {
    if (isResizing.value) {
      console.warn('[StoryboardNode] 缩放超时，强制恢复')
      stopResize()
    }
  }, 5000)
  event.stopPropagation()
  event.preventDefault()
}

// 安全计时器
let resizeSafetyTimer = null

function handleResize(event) {
  if (!isResizing.value) return
  
  // 安全检查：如果鼠标按钮已松开（如在窗口外松开），立即停止
  if (event.buttons === 0) {
    stopResize()
    return
  }
  
  const deltaX = event.clientX - resizeStartX.value
  const deltaY = event.clientY - resizeStartY.value
  const newWidth = Math.min(Math.max(resizeStartWidth.value + deltaX, minWidth), maxWidth)
  
  // 根据比例计算高度
  const ratio = aspectRatioMap[aspectRatio.value] || 9/16
  const newHeight = Math.round(newWidth * ratio)
  
  // 限制高度范围
  const constrainedHeight = Math.min(Math.max(newHeight, minHeight), maxHeight)
  
  nodeWidth.value = newWidth
  nodeHeight.value = constrainedHeight
}

function stopResize() {
  if (!isResizing.value) return
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  if (resizeSafetyTimer) {
    clearTimeout(resizeSafetyTimer)
    resizeSafetyTimer = null
  }
  updateNodeData()
  
  // 更新节点内部状态，确保连线位置跟随 Handle 位置变化
  nextTick(() => {
    updateNodeInternals(props.id)
  })
}

// ========== 预览功能 ==========
let clickPreviewTimer = null

function handleCellPreview(index, event) {
  event.stopPropagation()

  // 处理 click/dblclick 冲突：双击时会触发两次 click
  // 延迟打开预览，若在延迟窗口内触发了 dblclick，则取消预览
  if (clickPreviewTimer) {
    clearTimeout(clickPreviewTimer)
    clickPreviewTimer = null
  }

  clickPreviewTimer = setTimeout(() => {
    const url = images.value[index]
    if (url && !isEditMode.value) {
      previewImageUrl.value = url
      previewVisible.value = true
    }
    clickPreviewTimer = null
  }, 220)
}

function closePreview() {
  previewVisible.value = false
  previewImageUrl.value = null
}

// ========== 图片替换 ==========
function handleCellReplace(index, event) {
  event.stopPropagation()
  replaceTargetIndex.value = index
  replaceInputRef.value?.click()
}

async function handleReplaceFileSelect(event) {
  const file = event.target.files?.[0]
  if (!file || replaceTargetIndex.value === null) return

  const index = replaceTargetIndex.value
  uploadingIndex.value = index

  try {
    const urls = await uploadImages([file])
    if (urls?.length > 0) {
      images.value[index] = urls[0]
      updateNodeData()
    }
  } catch (error) {
    console.error('替换图片失败:', error)
  } finally {
    uploadingIndex.value = null
    replaceTargetIndex.value = null
    if (replaceInputRef.value) {
      replaceInputRef.value.value = ''
    }
  }
}

// ========== 上传功能 ==========
function triggerUpload(index) {
  currentUploadIndex.value = index
  fileInputRef.value?.click()
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0]
  if (!file || currentUploadIndex.value === null) return

  const index = currentUploadIndex.value
  uploadingIndex.value = index

  try {
    const urls = await uploadImages([file])
    if (urls?.length > 0) {
      images.value[index] = urls[0]
      updateNodeData()
    }
  } catch (error) {
    console.error('上传图片失败:', error)
  } finally {
    uploadingIndex.value = null
    currentUploadIndex.value = null
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

// ========== 拖拽排序 ==========
function handleDragEnter(event, index) {
  event.preventDefault()
  isDragOver.value = true
  dragOverIndex.value = index
}

function handleDragLeave(event) {
  event.preventDefault()
  isDragOver.value = false
  dragOverIndex.value = null
}

function handleDragEnd() {
  isDragOver.value = false
  dragOverIndex.value = null
  dragIndex.value = null
}

async function handleDrop(event, targetIndex) {
  event.preventDefault()
  isDragOver.value = false

  const imageUrl = event.dataTransfer.getData('imageUrl') ||
                   event.dataTransfer.getData('text/plain')

  if (imageUrl && dragIndex.value !== null && dragIndex.value !== targetIndex) {
    const temp = images.value[dragIndex.value]
    images.value[dragIndex.value] = images.value[targetIndex]
    images.value[targetIndex] = temp
    updateNodeData()
  }

  dragIndex.value = null
  dragOverIndex.value = null
}

function handleDragStart(event, index) {
  dragIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
}

// ========== 清除功能 ==========
function clearCell(index) {
  images.value[index] = null
  updateNodeData()
}

function clearAllCells() {
  // 二期需求：清空分镜格子时，需要断开左侧所有输入连线。
  // 约束：只要有连线，一定会有显示图片；因此清空必须同步断线，避免出现“有连线但无图”。
  canvasStore.disconnectNodeInputs(props.id)

  images.value = images.value.map(() => null)
  outputImageUrl.value = null
  updateNodeData()
}

// ========== 自动拼接并输出功能 ==========
// 将所有格子内的图片按顺序拼接，最长边自动压缩到 3840px
async function autoMergeAndOutput() {
  const validImages = images.value.slice(0, gridCount.value).filter(img => img !== null)
  if (validImages.length < 1) {
    alert('请至少上传1张图片进行输出')
    return
  }

  isMerging.value = true

  try {
    const cols = layoutConfig.value.cols
    const rows = layoutConfig.value.rows
    
    // 加载所有图片
    const imgElements = await Promise.all(
      images.value.slice(0, gridCount.value).map(url => {
        if (!url) return Promise.resolve(null)
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = url
        })
      })
    )

    // 计算每个格子的尺寸 (取第一张有效图片的尺寸作为基准，若无则默认为 1920x1080)
    const firstValidImg = imgElements.find(img => img !== null)
    const cellWidth = firstValidImg?.width || 1920
    const cellHeight = firstValidImg?.height || 1080
    
    // 计算拼接后的总尺寸
    const totalWidth = cols * cellWidth
    const totalHeight = rows * cellHeight
    
    // 压缩到最长边不超过 3840
    const maxDimension = 3840
    let finalWidth = totalWidth
    let finalHeight = totalHeight
    if (totalWidth > maxDimension || totalHeight > maxDimension) {
      const scale = maxDimension / Math.max(totalWidth, totalHeight)
      finalWidth = Math.floor(totalWidth * scale)
      finalHeight = Math.floor(totalHeight * scale)
    }
    
    const canvas = document.createElement('canvas')
    canvas.width = finalWidth
    canvas.height = finalHeight
    const ctx = canvas.getContext('2d')

    // 绘制背景（二期要求：空格子纯白色填充）
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, finalWidth, finalHeight)

    // 计算每个格子的缩放尺寸
    const scaledCellWidth = finalWidth / cols
    const scaledCellHeight = finalHeight / rows

    // 绘制每个图片
    imgElements.forEach((img, i) => {
      if (i >= gridCount.value) return
      
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = col * scaledCellWidth
      const y = row * scaledCellHeight

      if (img) {
        // 所见即所得：按格子比例进行 cover 裁切绘制（与 grid-item 的 object-fit: cover 一致）
        const destRatio = scaledCellWidth / scaledCellHeight
        const srcRatio = img.width / img.height

        let sx = 0
        let sy = 0
        let sWidth = img.width
        let sHeight = img.height

        if (srcRatio > destRatio) {
          // 源图更宽：裁掉左右
          sWidth = Math.round(img.height * destRatio)
          sx = Math.round((img.width - sWidth) / 2)
        } else if (srcRatio < destRatio) {
          // 源图更高：裁掉上下
          sHeight = Math.round(img.width / destRatio)
          sy = Math.round((img.height - sHeight) / 2)
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, scaledCellWidth, scaledCellHeight)
      } else {
        // 空格子已经在填充背景时处理为白色，这里可以不做处理或显式绘制白色
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(x, y, scaledCellWidth, scaledCellHeight)
      }
    })

    // 转换为 Blob 并上传
    canvas.toBlob(async (blob) => {
      try {
        const file = new File([blob], 'storyboard_output.png', { type: 'image/png' })
        const urls = await uploadImages([file])

        outputImageUrl.value = urls[0]
        updateNodeData()

        // 自动在右侧创建图像节点并连线
        createOutputNode(urls[0])
      } catch (error) {
        console.error('上传拼接图片失败:', error)
      } finally {
        isMerging.value = false
      }
    }, 'image/png', 0.95)
  } catch (error) {
    console.error('拼接失败:', error)
    isMerging.value = false
  }
}

// 在右侧创建输出图像节点
function createOutputNode(url) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  const newNodeId = `node_${Date.now()}`
  
  // 计算输出节点的初始宽高（保持与分镜格子相同的比例）
  const ratio = aspectRatioMap[aspectRatio.value] || 9/16
  const targetWidth = 380 // 默认宽度
  const targetHeight = Math.round(targetWidth * ratio)

  const nodePosition = {
    x: currentNode.position.x + (nodeWidth.value || 300) + 200,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: 'image',
    position: nodePosition,
    data: {
      title: '输出图像',
      output: { url: url },
      // 传递比例和尺寸信息，确保 ImageNode 初始显示正确
      aspectRatio: aspectRatio.value,
      width: targetWidth,
      height: targetHeight
    }
  })
  
  canvasStore.addEdge({
    source: props.id,
    target: newNodeId,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
}

// ========== 数据更新 ==========
function updateNodeData() {
  const data = {
    ...props.data,
    title: localLabel.value,
    gridSize: gridSize.value,
    aspectRatio: aspectRatio.value,
    images: images.value.slice(0, gridCount.value),
    output: outputImageUrl.value ? { url: outputImageUrl.value } : null,
    nodeWidth: nodeWidth.value,
    nodeHeight: nodeHeight.value
  }
  emit('update:data', data)
}

// ========== 监听外部数据变化 ==========
watch(() => props.data.images, (newImages) => {
  if (!newImages) return
  
  // 强制同步本地 images 数组，确保响应式
  const gridLimit = 16 
  for (let i = 0; i < gridLimit; i++) {
    const val = newImages[i] !== undefined ? newImages[i] : null
    if (images.value[i] !== val) {
      images.value[i] = val
    }
  }
}, { deep: true, immediate: true })

watch(gridSize, () => {
  if (images.value.length !== gridCount.value) {
    images.value = Array(16).fill(null).map((_, i) => images.value[i] || null)
  }
  updateNodeData()
})

watch(aspectRatio, () => {
  updateNodeData()
})

// ========== 生命周期 ==========
onMounted(() => {
  if (images.value.length !== gridCount.value) {
    images.value = Array(16).fill(null).map((_, i) => images.value[i] || null)
  }
  if (props.data.nodeWidth) {
    nodeWidth.value = props.data.nodeWidth
  }
  if (props.data.nodeHeight) {
    nodeHeight.value = props.data.nodeHeight
  }
  // 注册下拉菜单点击外部关闭
  document.addEventListener('click', handleClickOutsideDropdown)
  // 注册编辑模式事件
  document.addEventListener('keydown', handleEditModeKeydown)
  document.addEventListener('mousedown', handleClickOutsideNode)
})

onUnmounted(() => {
  // 清理 resize 事件监听（防止组件卸载时 resize 仍在进行）
  if (isResizing.value) {
    isResizing.value = false
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', stopResize)
  }
  if (resizeSafetyTimer) {
    clearTimeout(resizeSafetyTimer)
    resizeSafetyTimer = null
  }
  
  // 清理左侧菜单事件监听
  document.removeEventListener('click', closeLeftMenu)
  
  // 清理 blob URLs
  images.value.forEach(url => {
    if (url && url.startsWith('blob:')) {
      try { URL.revokeObjectURL(url) } catch (e) {}
    }
  })
  if (outputImageUrl.value?.startsWith('blob:')) {
    try { URL.revokeObjectURL(outputImageUrl.value) } catch (e) {}
  }
  // 移除下拉菜单事件监听
  document.removeEventListener('click', handleClickOutsideDropdown)
  // 移除编辑模式事件
  document.removeEventListener('keydown', handleEditModeKeydown)
  document.removeEventListener('mousedown', handleClickOutsideNode)
  // 清理编辑模式拖拽
  document.removeEventListener('mousemove', handleEditDragMove)
  document.removeEventListener('mouseup', handleEditDragEnd)
})

// ========== 连接状态 ==========
const sourceNodeLabel = computed(() => {
  const sourceId = props.data.sourceNodeId
  if (!sourceId) return null

  const nodes = canvasStore.nodes || []
  const node = nodes.find(n => n.id === sourceId)
  return node?.data?.label || node?.data?.title || sourceId
})

const hasInputConnection = computed(() => {
  const edges = canvasStore.edges || []
  return edges.some(e => e.target === props.id)
})

const hasOutputConnection = computed(() => {
  const edges = canvasStore.edges || []
  return edges.some(e => e.source === props.id)
})

// ========== 上游图片自动填充功能 ==========
// 使用 computed 收集所有上游节点的图片，确保响应式追踪
const upstreamImages = computed(() => {
  const edges = canvasStore.edges || []
  const upstreamEdges = edges.filter(e => e.target === props.id)
  
  const nodes = canvasStore.nodes || []
  const allImages = []
  
  // 1. 从上游连接的节点收集图片
  upstreamEdges.forEach(edge => {
    const node = nodes.find(n => n.id === edge.source)
    if (!node?.data) return
    
    // 优先级：output.urls > output.url > sourceImages
    if (node.data.output?.urls?.length > 0) {
      allImages.push(...node.data.output.urls)
    } else if (node.data.output?.url) {
      allImages.push(node.data.output.url)
    }
    // sourceImages（用户上传的图片）
    if (node.data.sourceImages?.length > 0) {
      allImages.push(...node.data.sourceImages)
    }
    // images 字段（某些节点类型如 storyboard 使用此字段）
    if (!allImages.length && node.data.images) {
      const nodeImages = node.data.images.filter(Boolean)
      if (nodeImages.length > 0) {
        allImages.push(...nodeImages)
      }
    }
  })
  
  // 2. 回退：检查 propagateData 写入的 inheritedData
  if (allImages.length === 0 && props.data.inheritedData) {
    const inherited = props.data.inheritedData
    if (inherited.urls?.length > 0) {
      allImages.push(...inherited.urls)
    } else if (inherited.url) {
      allImages.push(inherited.url)
    }
  }
  
  // 去重
  return [...new Set(allImages)]
})

// 监听上游图片变化，自动填充到空格子
// immediate: true 确保组件挂载时若已有连接也能立即填充
watch(upstreamImages, (newImages) => {
  if (!newImages || newImages.length === 0) return

  // A 模式：只有当存在“节点级 input”连线时，才自动把上游图片填充到空格
  const edges = canvasStore.edges || []
  const hasNodeLevelInput = edges.some(e => e.target === props.id && e.targetHandle === 'input')
  if (!hasNodeLevelInput) return
  
  // 逐张检查：只填充尚未出现在格子中的图片，避免重复
  let filled = false
  for (const imgUrl of newImages) {
    // 跳过已存在于格子中的图片
    if (images.value.some(cell => cell === imgUrl)) continue
    
    // 查找第一个空格子
    const emptyIndex = images.value.findIndex((cell, idx) => cell === null && idx < gridCount.value)
    if (emptyIndex === -1) break // 没有空格子了
    
    images.value[emptyIndex] = imgUrl
    filled = true
  }
  
  if (filled) {
    updateNodeData()
  }
}, { deep: true, immediate: true })

// ========== 左侧快捷操作菜单 ==========
const showLeftMenu = ref(false)

function handleInputClick(event) {
  event?.stopPropagation()
  showLeftMenu.value = !showLeftMenu.value
}

// 创建上游节点（连接到当前节点的左侧输入）
function createUpstreamNode(nodeType) {
  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return
  
  const newNodeId = `node_${Date.now()}`
  const nodePosition = {
    x: currentNode.position.x - 350,
    y: currentNode.position.y
  }
  
  canvasStore.addNode({
    id: newNodeId,
    type: nodeType,
    position: nodePosition,
    data: {
      label: nodeType === 'text-input' ? '提示词' : '图片',
      sourceImages: []
    }
  })
  
  canvasStore.addEdge({
    source: newNodeId,
    target: props.id,
    sourceHandle: 'output',
    targetHandle: 'input'
  })
  
  showLeftMenu.value = false
}

// 监听点击外部关闭左侧菜单
watch(showLeftMenu, (newValue) => {
  if (newValue) {
    setTimeout(() => {
      document.addEventListener('click', closeLeftMenu)
    }, 100)
  } else {
    document.removeEventListener('click', closeLeftMenu)
  }
})

function closeLeftMenu() {
  showLeftMenu.value = false
}

function handleOutputClick() {
  autoMergeAndOutput()
}

// ========== 计算格子尺寸 ==========
const cellSize = computed(() => {
  const cols = layoutConfig.value.cols
  const availableWidth = nodeWidth.value - 24 // 减去padding
  const cellWidth = Math.floor((availableWidth - 8) / cols)
  return Math.max(cellWidth, 35)
})

// ========== 是否显示格子（只要有图片） ==========
const hasAnyImage = computed(() => {
  return images.value.some(img => img !== null)
})
</script>

<template>
  <div
    ref="nodeRootRef"
    class="storyboard-node"
    :class="{ selected: selected, resizing: isResizing, 'has-image': hasAnyImage, 'edit-mode': isEditMode }"
    :style="{ width: nodeWidth + 'px' }"
    @dblclick="handleNodeDblClick"
  >

    <!-- ========== 顶部工具栏（选中时显示） ========== -->
    <!-- nodrag nowheel 防止工具栏交互触发 Vue Flow 拖拽/缩放 -->
    <div v-show="showToolbar" class="storyboard-toolbar nodrag nowheel" @mousedown.stop @pointerdown.stop>
      <!-- 比例选择（下拉） -->
      <div class="toolbar-section toolbar-dropdown-wrap" ref="ratioDropdownRef">
        <button class="toolbar-dropdown-trigger" @mousedown.stop.prevent="toggleRatioDropdown($event)" @click.stop.prevent>
          <span class="dropdown-label">比例</span>
          <span class="dropdown-value">{{ aspectRatio }}</span>
          <svg class="dropdown-arrow" :class="{ open: showRatioDropdown }" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 5l3 3 3-3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <Transition name="dropdown-fade">
          <div v-if="showRatioDropdown" class="toolbar-dropdown-menu nodrag nowheel" @mousedown.stop.prevent @pointerdown.stop.prevent>
            <button
              v-for="opt in aspectRatioOptions"
              :key="opt.value"
              class="toolbar-dropdown-item"
              :class="{ active: aspectRatio === opt.value }"
              @click.stop.prevent="selectRatio(opt.value)"
              @mousedown.stop.prevent
            >
              <span>{{ opt.label }}</span>
              <svg v-if="aspectRatio === opt.value" class="dropdown-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 6l3 3 5-5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </Transition>
      </div>

      <!-- 网格选择（下拉） -->
      <div class="toolbar-section toolbar-dropdown-wrap" ref="gridDropdownRef">
        <button class="toolbar-dropdown-trigger" @mousedown.stop.prevent="toggleGridDropdown($event)" @click.stop.prevent>
          <span class="dropdown-label">网格</span>
          <span class="dropdown-value">{{ gridSize.replace('x', '×') }}</span>
          <svg class="dropdown-arrow" :class="{ open: showGridDropdown }" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 5l3 3 3-3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <Transition name="dropdown-fade">
          <div v-if="showGridDropdown" class="toolbar-dropdown-menu nodrag nowheel" @mousedown.stop.prevent @pointerdown.stop.prevent>
            <button
              v-for="opt in gridSizeOptions"
              :key="opt.value"
              class="toolbar-dropdown-item"
              :class="{ active: gridSize === opt.value }"
              @click.stop.prevent="selectGrid(opt.value)"
              @mousedown.stop.prevent
            >
              <span>{{ opt.label }}</span>
              <svg v-if="gridSize === opt.value" class="dropdown-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 6l3 3 5-5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </Transition>
      </div>

      <!-- 操作按钮 -->
      <div class="toolbar-section toolbar-actions">
        <button
          class="toolbar-btn action-btn"
          :class="{ active: isEditMode }"
          @mousedown.stop.prevent="isEditMode ? exitEditMode() : enterEditMode()"
          @click.stop.prevent
          :title="isEditMode ? '退出编辑' : '进入编辑'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 20h9" stroke-linecap="round"/>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>{{ isEditMode ? '退出' : '编辑' }}</span>
        </button>
        <button
          class="toolbar-btn action-btn"
          :disabled="isMerging"
          @mousedown.stop.prevent="autoMergeAndOutput"
          @click.stop.prevent
          title="拼接输出"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21" stroke-linecap="round"/>
            <line x1="15" y1="3" x2="15" y2="21" stroke-linecap="round"/>
            <line x1="3" y1="9" x2="21" y2="9" stroke-linecap="round"/>
            <line x1="3" y1="15" x2="21" y2="15" stroke-linecap="round"/>
          </svg>
          <span>{{ isMerging ? '拼接中...' : '输出' }}</span>
        </button>
        <button class="toolbar-btn action-btn" @mousedown.stop.prevent="clearAllCells" @click.stop.prevent title="清空所有格子">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>清空</span>
        </button>
        <button class="toolbar-btn action-btn delete-btn" @mousedown.stop.prevent="emit('delete')" @click.stop.prevent title="删除节点">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>删除</span>
        </button>
      </div>
    </div>

    <!-- ========== 节点名称（双击编辑） ========== -->
    <div class="node-label-area nodrag" @dblclick.stop="startEditLabel">
      <input
        v-if="isEditingLabel"
        ref="labelInputRef"
        v-model="localLabel"
        class="node-label-input"
        @blur="finishEditLabel"
        @keydown="handleLabelKeydown"
        @mousedown.stop
        @pointerdown.stop
        maxlength="30"
      />
      <span v-else class="node-label-text" :title="localLabel">{{ localLabel }}</span>
    </div>

    <!-- ========== 节点主体 ========== -->
    <div class="node-wrapper">
    <!-- ========== 左侧输入端口 - 隐藏 Handle + 可见 + 按钮（同 ImageNode 模式） ========== -->
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
      @click="handleInputClick"
    >
      +
    </button>
    
    <!-- 左侧快捷操作菜单 -->
    <div v-if="showLeftMenu" class="left-quick-menu nodrag nowheel" @click.stop @mousedown.stop @pointerdown.stop>
      <div 
        class="left-quick-menu-item"
        @click.stop="createUpstreamNode('image')"
        @mousedown.stop
      >
        <span class="left-menu-icon">◫</span>
        <span class="left-menu-label">图片</span>
      </div>
    </div>

    <!-- ========== 中间格子区域（充满式布局） ========== -->
    <div class="node-card" :class="[{ 'node-card-edit': isEditMode }, isEditMode ? 'nodrag nowheel' : '']" :style="{ height: nodeHeight + 'px' }">
        <!-- 编辑模式提示条 -->
        <div v-if="isEditMode" class="edit-mode-bar nodrag nowheel">
          <span class="edit-mode-hint">拖拽图片调整顺序</span>
          <button class="edit-mode-exit-btn" @click.stop="exitEditMode" @mousedown.stop>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            退出
          </button>
        </div>

        <div class="grid-area">
          <div
            class="grid-box"
            :class="[`grid-${gridSize}`, `ratio-${aspectRatio.replace(':', '-')}`, { 'grid-edit-mode': isEditMode }]"
          >
            <div
              v-for="(url, index) in images.slice(0, gridCount)"
              :key="index"
              class="grid-item"
              :class="{
                'has-img': url,
                'drag-over': isEditMode ? editDropTargetIndex === index : dragOverIndex === index,
                'drag-source': isEditMode ? editDragIndex === index : dragIndex === index,
                'edit-draggable': isEditMode && url
              }"
              :draggable="!isEditMode && url !== null ? 'true' : 'false'"
              @dragstart="!isEditMode && handleDragStart($event, index)"
              @dragend="!isEditMode && handleDragEnd()"
              @dragover.prevent="!isEditMode && handleDragEnter($event, index)"
              @dragleave="!isEditMode && handleDragLeave($event)"
              @drop="!isEditMode && handleDrop($event, index)"
              @click="!isEditMode && triggerUpload(index)"
              @mousedown="isEditMode && handleEditDragStart($event, index)"
            >

              <!-- 无图片时显示 + -->
              <div v-if="!url" class="cell-plus">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19" stroke-linecap="round"/>
                  <line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round"/>
                </svg>
              </div>

              <!-- 有图片时显示图片 -->
              <img
                v-else
                :src="url"
                class="grid-img"
                :class="{ 'grid-img-edit': isEditMode }"
                @dblclick.stop.prevent="handleNodeDblClick"
                @click.stop="!isEditMode && handleCellPreview(index, $event)"
                @error="e => { e.target.style.display = 'none' }"
              />

              <!-- 格子级输入端口 (用于连线特定位置) -->
              <Handle
                type="target"
                :position="Position.Left"
                :id="`input-${index}`"
                class="cell-handle"
              />

              <!-- 上传中 -->
              <div v-if="uploadingIndex === index" class="upload-mask">
                <div class="spinner"></div>
              </div>

              <!-- 图片操作按钮（非编辑模式才显示） -->
              <div v-if="url && !isEditMode" class="img-actions">
                <button class="img-btn" @click.stop="handleCellReplace(index, $event)" title="替换图片">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 0 0-15.5-6.3" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3 4v6h6" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3 12a9 9 0 0 0 15.5 6.3" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M21 20v-6h-6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="img-btn" @click.stop="clearCell(index)" title="删除">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== 右侧添加按钮 + 输出端口 ========== -->
      <button 
        class="node-add-btn node-add-btn-right"
        title="点击输出拼接图片"
        @click="handleOutputClick"
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

    <!-- ========== 右下角拖拽手柄 ========== -->
    <div class="resize-handle resize-handle-corner nodrag nowheel" @mousedown.stop.prevent="startResize"></div>

    <!-- 底部提示文字 -->
    <div v-if="!isEditMode" class="node-bottom-hint">
      双击以进入编辑调整分镜顺序
    </div>

    <!-- ========== 全屏预览 ========== -->
    <Teleport to="body">
      <div v-if="previewVisible" class="preview-overlay" @click="closePreview">
        <button class="preview-close" @click="closePreview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <img v-if="previewImageUrl" :src="previewImageUrl" class="preview-img" @click.stop />
      </div>
    </Teleport>

    <!-- ========== 编辑模式拖拽幽灵 ========== -->
    <Teleport to="body">
      <div
        v-if="editDragGhostStyle && editDragImageSrc"
        class="edit-drag-ghost"
        :style="{
          left: editDragGhostStyle.left,
          top: editDragGhostStyle.top,
          width: editDragGhostStyle.width,
          height: editDragGhostStyle.height
        }"
      >
        <img :src="editDragImageSrc" class="edit-drag-ghost-img" />
      </div>
    </Teleport>

    <!-- 隐藏的文件输入 -->
    <input type="file" ref="fileInputRef" accept="image/*" class="hidden-input" @change="handleFileSelect" />
    <input type="file" ref="replaceInputRef" accept="image/*" class="hidden-input" @change="handleReplaceFileSelect" />
  </div>
</template>

<style scoped>
/* ========== 节点根元素 ========== */
.storyboard-node {
  position: relative;
  background: transparent;
  border-radius: 16px;
  overflow: visible;
  transition: all 0.2s;
}

/* ========== 编辑模式 ========== */
.storyboard-node.edit-mode {
  z-index: 100;
}

/* 编辑模式提示条 */
.edit-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.edit-mode-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
  user-select: none;
}

.edit-mode-exit-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  font-size: 11px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid #444;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.edit-mode-exit-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border-color: #666;
}

/* 编辑模式下可拖拽格子 */
.grid-item.edit-draggable {
  cursor: grab;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.grid-item.edit-draggable:hover {
  transform: scale(1.03);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  z-index: 2;
}

.grid-item.edit-draggable:active {
  cursor: grabbing;
}

/* 编辑模式拖拽源半透明 */
.grid-edit-mode .grid-item.drag-source {
  opacity: 0.3;
  transform: scale(0.95);
}

/* 编辑模式拖拽目标高亮 */
.grid-edit-mode .grid-item.drag-over {
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.65), 0 0 12px rgba(0, 0, 0, 0.25);
  background: rgba(255, 255, 255, 0.06);
  transform: scale(1.05);
  z-index: 3;
}

/* 格子序号角标 */

/* 编辑模式拖拽幽灵 */
.edit-drag-ghost {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  border-radius: 8px;
  overflow: hidden;
  opacity: 0.85;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 2px #60a5fa;
  transform: scale(1.05);
  transition: none;
}

.edit-drag-ghost-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 编辑模式下图片禁止拖拽选择 */
.grid-img-edit {
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

/* ========== 顶部工具栏 ========== */
.storyboard-toolbar {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 20px;
  padding: 8px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  pointer-events: auto;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-label {
  font-size: 11px;
  color: #888;
  white-space: nowrap;
}

.toolbar-btn-group {
  display: flex;
  gap: 2px;
}

.toolbar-actions {
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid #3a3a3a;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 11px;
  color: #888;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.toolbar-btn.active {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-btn svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.action-btn {
  padding: 6px 10px;
}

.delete-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

/* ========== 下拉选择器 ========== */
.toolbar-dropdown-wrap {
  position: relative;
}

.toolbar-dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 11px;
  color: #ccc;
  background: #333;
  border: 1px solid #444;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.toolbar-dropdown-trigger:hover {
  background: #3a3a3a;
  border-color: #555;
  color: #fff;
}

.dropdown-label {
  color: #888;
  margin-right: 2px;
}

.dropdown-value {
  color: #60a5fa;
  font-weight: 500;
}

.dropdown-arrow {
  width: 10px;
  height: 10px;
  color: #666;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.toolbar-dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  z-index: 2000;
  min-width: 90px;
  max-height: 240px;
  overflow-y: auto;
}

.toolbar-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  font-size: 12px;
  color: #aaa;
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.toolbar-dropdown-item:hover {
  background: #3a3a3a;
  color: #fff;
}

.toolbar-dropdown-item.active {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.dropdown-check {
  width: 12px;
  height: 12px;
  color: #60a5fa;
  flex-shrink: 0;
}

/* 下拉菜单动画 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-4px);
}

.dropdown-fade-enter-to,
.dropdown-fade-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ========== 节点名称标签 ========== */
.node-label-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px 2px;
  min-height: 28px;
  cursor: default;
}

.node-label-text {
  font-size: 12px;
  color: #aaa;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  transition: color 0.15s;
}

.node-label-area:hover .node-label-text {
  color: #ccc;
}

.node-label-input {
  width: 100%;
  max-width: 200px;
  padding: 2px 8px;
  font-size: 12px;
  color: #fff;
  background: #333;
  border: 1px solid #555;
  border-radius: 6px;
  outline: none;
  text-align: center;
  transition: border-color 0.15s;
}

.node-label-input:focus {
  border-color: #60a5fa;
}

/* ========== 节点主体 ========== */
.node-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: v-bind('nodeWidth + "px"');
  height: v-bind('nodeHeight + "px"');
}

/* ========== Handle（隐藏，仅作为连接点） ========== */
.node-handle-hidden {
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none;
}

/* 调整 Handle 位置与 + 按钮中心对齐 */
:deep(.vue-flow__handle.target) {
  left: -52px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.source) {
  right: -52px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

/* ========== 添加按钮（同 ImageNode 风格） ========== */
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
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 10;
}

.node-wrapper:hover .node-add-btn,
.storyboard-node.selected .node-add-btn {
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
  background: var(--canvas-bg-secondary, #2a2a2a);
  border: 1px solid var(--canvas-border-subtle, #3a3a3a);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  min-width: 100px;
}

.left-quick-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--canvas-text-secondary, #aaa);
  font-size: 13px;
}

.left-quick-menu-item:hover {
  background: var(--canvas-border-active, #3a3a3a);
  color: #fff;
}

.left-menu-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.left-menu-label {
  white-space: nowrap;
}

/* ========== 节点卡片 ========== */
.node-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--canvas-bg-quaternary, #252525);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.node-card-edit {
  border-color: rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 8px 32px rgba(0, 0, 0, 0.35);
}

/* ========== 格子区域 ========== */
.grid-area {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.grid-box {
  display: grid;
  gap: 2px;
  background: transparent;
  padding: 4px;
  width: 100%;
  height: 100%;
}

/* 网格布局 - 充满式 */
.grid-1x3 { grid-template-columns: repeat(3, 1fr); grid-template-rows: 1fr; }
.grid-1x4 { grid-template-columns: repeat(4, 1fr); grid-template-rows: 1fr; }
.grid-2x2 { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
.grid-2x3 { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); }
.grid-3x1 { grid-template-columns: 1fr; grid-template-rows: repeat(3, 1fr); }
.grid-3x2 { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(3, 1fr); }
.grid-3x3 { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); }
.grid-4x1 { grid-template-columns: 1fr; grid-template-rows: repeat(4, 1fr); }
.grid-4x4 { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(4, 1fr); }

/* 比例 */
.grid-box.ratio-16-9 .grid-item { aspect-ratio: 16/9; }
.grid-box.ratio-9-16 .grid-item { aspect-ratio: 9/16; }
.grid-box.ratio-3-4 .grid-item { aspect-ratio: 3/4; }
.grid-box.ratio-4-3 .grid-item { aspect-ratio: 4/3; }
.grid-box.ratio-1-1 .grid-item { aspect-ratio: 1/1; }

/* 单个格子 */
.grid-item {
  position: relative;
  background: var(--canvas-bg-tertiary, #2a2a2a);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  min-height: 20px;
}

/* 格子级输入端口：动态调整感应区 */
.cell-handle {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;
  width: 12px !important;
  height: 12px !important;
  border-radius: 50% !important;
  background: var(--canvas-accent-primary, #3b82f6) !important;
  border: 2px solid #fff !important;
  opacity: 0;
  z-index: 5;
  pointer-events: auto !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 拖拽连线时，扩大所有格子的命中面积，方便“投喂” */
.storyboard-node.selected :deep(.cell-handle),
.storyboard-node:hover :deep(.cell-handle) {
  opacity: 0.3;
}

/* 连线悬停在特定格子上时：变成铺满状态，确保精准命中 */
.grid-item:hover .cell-handle {
  opacity: 0.8 !important;
  width: 80% !important;
  height: 80% !important;
  border-radius: 8px !important;
  background: rgba(59, 130, 246, 0.2) !important;
  border: 2px solid var(--canvas-accent-primary, #3b82f6) !important;
  transform: translate(-50%, -50%) scale(1.1) !important;
}

/* hover 时格子本身的边框提示 */
.grid-item:hover {
  box-shadow: inset 0 0 0 2px var(--canvas-accent-primary, #3b82f6);
  z-index: 10;
}


.grid-item.drag-over {
  background: var(--canvas-border-active, #4a4a4a);
  box-shadow: inset 0 0 0 2px var(--canvas-accent-primary, #3b82f6);
}

.grid-item.drag-source {
  opacity: 0.4;
}

/* + 号 */
.cell-plus {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--canvas-text-tertiary, #444);
  transition: color 0.2s;
}

.cell-plus svg {
  width: 16px;
  height: 16px;
}

.grid-item:hover .cell-plus {
  color: var(--canvas-text-secondary, #666);
}

/* 图片 */
.grid-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 上传遮罩 */
.upload-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--canvas-border-subtle, #444);
  border-top-color: var(--canvas-text-secondary, #888);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 图片操作按钮 */
.img-actions {
  position: absolute;
  top: 3px;
  right: 3px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.grid-item:hover .img-actions {
  opacity: 1;
}

.img-btn {
  width: 18px;
  height: 18px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: 4px;
  color: #bbb;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.img-btn:hover {
  background: rgba(50, 50, 50, 0.9);
  color: #fff;
}

.img-btn svg {
  width: 10px;
  height: 10px;
}

/* ========== 右下角拖拽手柄 ========== */
.resize-handle {
  position: absolute;
  opacity: 1;
  transition: opacity 0.2s ease;
  z-index: 20;
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

/* ========== Handle ========== */
.node-handle {
  width: 1px;
  height: 1px;
  background: transparent;
  border: none;
  opacity: 0;
  pointer-events: none;
}

/* ========== 隐藏输入 ========== */
.hidden-input {
  display: none;
}

/* 底部提示文字 */
.node-bottom-hint {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* ========== 全屏预览 ========== */
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  cursor: zoom-out;
}

.preview-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

.preview-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 32px;
  height: 32px;
  border: 1px solid var(--canvas-border-subtle, #444);
  border-radius: 50%;
  background: var(--canvas-bg-secondary, #2a2a2a);
  color: var(--canvas-text-secondary, #ccc);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.preview-close:hover {
  background: var(--canvas-border-active, #4a4a4a);
  color: #fff;
}

.preview-close svg {
  width: 14px;
  height: 14px;
}
</style>
