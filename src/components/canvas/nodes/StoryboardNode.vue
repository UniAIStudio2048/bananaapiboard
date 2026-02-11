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
const { updateNodeInternals, onConnectStart: onVFConnectStart, onConnectEnd: onVFConnectEnd, getViewport: getVFViewport } = useVueFlow()

// ========== 连线状态检测 ==========
// 检测是否有连线正在进行（Vue Flow 原生连线 或 自定义拖拽连线）
const isVFConnecting = ref(false)

onVFConnectStart(() => {
  isVFConnecting.value = true
})
onVFConnectEnd(() => {
  isVFConnecting.value = false
})

// 综合判断：任一连线方式进行中即为 true
const isAnyConnecting = computed(() => {
  return isVFConnecting.value || canvasStore.isDraggingConnection
})

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

// ========== 折叠模式 ==========
const isCollapsed = ref(false)
const collapseAnimating = ref(false)   // 收起/展开动画进行中
const collapseDirection = ref('')      // 'collapsing' | 'expanding'

function toggleCollapse() {
  if (collapseAnimating.value) return
  if (isCollapsed.value) {
    expandFromCollapsed()
  } else {
    collapseWithAnimation()
  }
}

// 收起动画：先播放动画，再切换到折叠视图
function collapseWithAnimation() {
  if (collapseAnimating.value) return
  collapseDirection.value = 'collapsing'
  collapseAnimating.value = true
  // 动画结束后切换到折叠态
  setTimeout(() => {
    isCollapsed.value = true
    collapseAnimating.value = false
    collapseDirection.value = ''
    // 折叠后刷新 handle 位置，让连线从统一左侧端口进入
    nextTick(() => updateNodeInternals(props.id))
  }, 400)
}

// 展开动画：先切换到展开视图，再播放动画
function expandFromCollapsed() {
  if (collapseAnimating.value) return
  isCollapsed.value = false
  collapseDirection.value = 'expanding'
  collapseAnimating.value = true
  // 展开后刷新 handle 位置，让连线回到各格子端口
  nextTick(() => updateNodeInternals(props.id))
  setTimeout(() => {
    collapseAnimating.value = false
    collapseDirection.value = ''
  }, 400)
}

// 有效图片数量
const validImageCount = computed(() => {
  return images.value.slice(0, gridCount.value).filter(img => img !== null).length
})

// 折叠时第一张有效图片
const firstImageUrl = computed(() => {
  return images.value.find(img => img !== null) || null
})

// 折叠时其余有效图片（用于堆叠动效，最多取2张做视觉层叠）
const stackImages = computed(() => {
  const valid = images.value.filter(img => img !== null)
  return valid.slice(1, 3) // 取第2、3张做堆叠背景
})

// 折叠时独立宽度（可缩放，持久化到 data）
const collapsedNodeWidth = ref(props.data.collapsedNodeWidth || null)

// 折叠时默认宽度：等于网格中单个格子的宽度（未手动缩放时使用）
const defaultCollapsedWidth = computed(() => {
  const cols = layoutConfig.value.cols
  return Math.round(nodeWidth.value / cols)
})

// 折叠时实际宽度：优先使用手动缩放值，否则用默认值
const collapsedWidth = computed(() => {
  return collapsedNodeWidth.value || defaultCollapsedWidth.value
})

// 折叠时高度：基于折叠宽度和比例
const collapsedHeight = computed(() => {
  const ratio = aspectRatioMap[aspectRatio.value] || 9/16
  return Math.round(collapsedWidth.value * ratio)
})

// 当前实际显示宽度（折叠时用折叠宽度，展开时用节点宽度）
const displayWidth = computed(() => {
  return isCollapsed.value ? collapsedWidth.value : nodeWidth.value
})

// CSS v-bind 用：将 "16:9" 转为 "16/9"
const cssAspectRatio = computed(() => aspectRatio.value.replace(':', '/'))

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
  isDraggingOutside.value = false
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
const isDraggingOutside = ref(false) // 是否拖拽到了节点外部（准备拖出到画布）

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

  // 检测鼠标是否在节点外部（用于拖出到画布）
  const nodeRect = nodeRootRef.value?.getBoundingClientRect()
  if (nodeRect) {
    isDraggingOutside.value = (
      event.clientX < nodeRect.left ||
      event.clientX > nodeRect.right ||
      event.clientY < nodeRect.top ||
      event.clientY > nodeRect.bottom
    )
  }

  // 如果在节点外部，不需要检测目标格子
  if (isDraggingOutside.value) {
    editDropTargetIndex.value = null
    return
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

  const fromIdx = editDragIndex.value
  const imageUrl = fromIdx !== null ? images.value[fromIdx] : null

  // 情况1：拖拽到节点外部 → 在画布上创建图片节点，清空原格子
  if (isDraggingOutside.value && fromIdx !== null && imageUrl) {
    // 屏幕坐标转画布坐标
    const canvasContainer = document.querySelector('.vue-flow')
    if (canvasContainer) {
      const rect = canvasContainer.getBoundingClientRect()
      const viewport = getVFViewport()
      const canvasX = (event.clientX - rect.left - viewport.x) / viewport.zoom
      const canvasY = (event.clientY - rect.top - viewport.y) / viewport.zoom

      // 在画布上创建图片节点
      const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      canvasStore.addNode({
        id: newNodeId,
        type: 'image-input',
        position: { x: canvasX - 100, y: canvasY - 80 },
        data: {
          title: '图片',
          nodeRole: 'source',
          sourceImages: [imageUrl]
        }
      })

      // 清空原格子
      clearCell(fromIdx)
    }
  }
  // 情况2：拖拽到节点内部其他格子 → 交换位置
  else if (fromIdx !== null && editDropTargetIndex.value !== null && fromIdx !== editDropTargetIndex.value) {
    const toIdx = editDropTargetIndex.value
    const temp = images.value[fromIdx]
    images.value[fromIdx] = images.value[toIdx]
    images.value[toIdx] = temp
    // 同步交换两个格子对应的连线 targetHandle，否则删除图片时找不到对应连线
    canvasStore.swapCellEdges(props.id, fromIdx, toIdx)
    updateNodeData()
  }

  editDragIndex.value = null
  editDropTargetIndex.value = null
  editDragGhostStyle.value = null
  editDragImageSrc.value = null
  isDraggingOutside.value = false
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
const minWidth = 240
const maxWidth = 1200
const minHeight = 100
const maxHeight = 2400

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

// 根据比例和网格行列数计算节点高度
// 单个格子宽度 = nodeWidth / cols，格子高度 = 格子宽度 * cellRatio
// 节点总高度 = rows * 格子高度 = nodeWidth * (rows / cols) * cellRatio
const ratioHeight = computed(() => {
  const cellRatio = aspectRatioMap[aspectRatio.value] || 9/16
  const { rows, cols } = layoutConfig.value
  return Math.round(nodeWidth.value * (rows / cols) * cellRatio)
})

// 节点取消选中时自动退出编辑模式
watch(() => props.selected, (newVal) => {
  if (!newVal && isEditMode.value) {
    exitEditMode()
  }
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
  resizeStartWidth.value = isCollapsed.value ? collapsedWidth.value : nodeWidth.value
  resizeStartHeight.value = isCollapsed.value ? collapsedHeight.value : nodeHeight.value
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
  const ratio = aspectRatioMap[aspectRatio.value] || 9/16

  if (isCollapsed.value) {
    // 折叠模式：缩放折叠尺寸
    const minCollapsed = 80
    const maxCollapsed = 600
    const newWidth = Math.min(Math.max(resizeStartWidth.value + deltaX, minCollapsed), maxCollapsed)
    collapsedNodeWidth.value = newWidth
  } else {
    // 展开模式：缩放节点尺寸（高度需考虑行列比）
    const { rows, cols } = layoutConfig.value
    const newWidth = Math.min(Math.max(resizeStartWidth.value + deltaX, minWidth), maxWidth)
    const newHeight = Math.round(newWidth * (rows / cols) * ratio)
    const constrainedHeight = Math.min(Math.max(newHeight, minHeight), maxHeight)
    nodeWidth.value = newWidth
    nodeHeight.value = constrainedHeight
  }
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
    if (url) {
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
    // 同步交换两个格子对应的连线 targetHandle，否则删除图片时找不到对应连线
    canvasStore.swapCellEdges(props.id, dragIndex.value, targetIndex)
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

  // 直接同步写入 store，确保 node.data.images[index] 立即为 null
  // 不能只依赖 emit('update:data') 的异步传播，否则重新连线时 propagateData 读到旧值
  const node = canvasStore.nodes.find(n => n.id === props.id)
  if (node?.data?.images) {
    const storeImages = [...node.data.images]
    storeImages[index] = null
    canvasStore.updateNodeData(props.id, { images: storeImages })
  }

  // 断开该格子对应的输入连线（removeEdge 内部会进一步清理无连线的格子）
  canvasStore.disconnectNodeHandle(props.id, `input-${index}`)
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

    // 所见即所得：按用户选择的比例计算每个格子的尺寸
    const ratio = aspectRatioMap[aspectRatio.value] || 9/16  // 高度 = 宽度 × ratio
    const baseCellWidth = 1080
    const baseCellHeight = Math.round(baseCellWidth * ratio)
    
    // 计算拼接后的总尺寸
    const totalWidth = cols * baseCellWidth
    const totalHeight = rows * baseCellHeight
    
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

    // 所见即所得：空格子背景色跟随当前主题
    const isLightTheme = document.documentElement.classList.contains('canvas-theme-light')
    const emptyFill = isLightTheme ? '#ffffff' : '#1a1a1a'

    ctx.fillStyle = emptyFill
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
        ctx.fillStyle = emptyFill
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
    nodeHeight: nodeHeight.value,
    collapsedNodeWidth: collapsedNodeWidth.value
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
  // 网格行列变化后重新计算高度
  nodeHeight.value = ratioHeight.value
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
    :class="{ selected: selected, resizing: isResizing, 'has-image': hasAnyImage, 'edit-mode': isEditMode, 'connecting-active': isAnyConnecting }"
    :style="{ width: displayWidth + 'px' }"
    @dblclick="handleNodeDblClick"
  >

    <!-- ========== 顶部工具栏（选中时显示） ========== -->
    <!-- nodrag nowheel 防止工具栏交互触发 Vue Flow 拖拽/缩放 -->
    <div v-show="showToolbar" class="storyboard-toolbar nodrag nowheel" @mousedown.stop @pointerdown.stop>
      <!-- 比例选择（点击展开竖排列表） -->
      <div class="toolbar-section toolbar-popover-wrap" ref="ratioDropdownRef">
        <button class="toolbar-popover-trigger" @mousedown.stop.prevent="toggleRatioDropdown($event)" @click.stop.prevent>
          <span class="popover-label">比例</span>
          <span class="popover-value">{{ aspectRatio }}</span>
        </button>
        <Transition name="popover-fade">
          <div v-if="showRatioDropdown" class="toolbar-popover-menu nodrag nowheel" @mousedown.stop.prevent @pointerdown.stop.prevent>
            <button
              v-for="opt in aspectRatioOptions"
              :key="opt.value"
              class="toolbar-popover-item"
              :class="{ active: aspectRatio === opt.value }"
              @click.stop.prevent="selectRatio(opt.value)"
              @mousedown.stop.prevent
            >{{ opt.label }}</button>
          </div>
        </Transition>
      </div>

      <!-- 网格选择（点击展开竖排列表） -->
      <div class="toolbar-section toolbar-popover-wrap" ref="gridDropdownRef">
        <button class="toolbar-popover-trigger" @mousedown.stop.prevent="toggleGridDropdown($event)" @click.stop.prevent>
          <span class="popover-label">网格</span>
          <span class="popover-value">{{ gridSize.replace('x', '×') }}</span>
        </button>
        <Transition name="popover-fade">
          <div v-if="showGridDropdown" class="toolbar-popover-menu nodrag nowheel" @mousedown.stop.prevent @pointerdown.stop.prevent>
            <button
              v-for="opt in gridSizeOptions"
              :key="opt.value"
              class="toolbar-popover-item"
              :class="{ active: gridSize === opt.value }"
              @click.stop.prevent="selectGrid(opt.value)"
              @mousedown.stop.prevent
            >{{ opt.label }}</button>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>{{ isMerging ? '合成中...' : '合成' }}</span>
        </button>
        <button class="toolbar-btn action-btn" @mousedown.stop.prevent="clearAllCells" @click.stop.prevent title="清空所有格子">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>清空</span>
        </button>
        <button class="toolbar-btn action-btn" @mousedown.stop.prevent="toggleCollapse" @click.stop.prevent :title="isCollapsed ? '展开分镜' : '折叠分镜'">
          <svg v-if="!isCollapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 12h16M12 4v16" stroke-linecap="round" stroke-linejoin="round" transform="rotate(45 12 12)"/>
            <rect x="3" y="8" width="18" height="12" rx="2" stroke-linecap="round"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="3" x2="9" y2="21" stroke-linecap="round"/>
            <line x1="15" y1="3" x2="15" y2="21" stroke-linecap="round"/>
            <line x1="3" y1="9" x2="21" y2="9" stroke-linecap="round"/>
            <line x1="3" y1="15" x2="21" y2="15" stroke-linecap="round"/>
          </svg>
          <span>{{ isCollapsed ? '展开' : '折叠' }}</span>
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

    <!-- ========== 中间格子区域 ========== -->
    <div
      class="node-card"
      :class="[
        { 'node-card-edit': isEditMode, 'node-card-collapsed': isCollapsed },
        isEditMode ? 'nodrag nowheel' : ''
      ]"
      :style="{ height: isCollapsed ? collapsedHeight + 'px' : nodeHeight + 'px' }"
    >

        <!-- ===== 折叠视图：照片堆叠（第1张无边框，其他堆叠在后方） ===== -->
        <div v-if="isCollapsed" class="collapsed-view">
          <!-- 折叠时：所有格子级输入端口统一定位到左侧中间，保持连线不断 -->
          <Handle
            v-for="index in gridCount"
            :key="'collapsed-handle-' + (index - 1)"
            type="target"
            :position="Position.Left"
            :id="`input-${index - 1}`"
            class="collapsed-cell-handle"
          />
          <!-- 堆叠背景照片（从后往前） -->
          <div
            v-for="(url, si) in stackImages.slice().reverse()"
            :key="'stack-' + si"
            class="stack-photo"
            :class="'stack-layer-' + (stackImages.length - si)"
          >
            <img v-if="url" :src="url" class="stack-photo-img" />
          </div>
          <!-- 主图（第1张，最前面） -->
          <div class="stack-photo stack-main">
            <img v-if="firstImageUrl" :src="firstImageUrl" class="stack-photo-img" />
            <div v-else class="stack-empty">
              <svg class="cell-plus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <!-- 展开按钮 -->
            <button class="expand-btn nodrag nowheel" @click.stop="expandFromCollapsed" @mousedown.stop title="展开分镜">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="3" x2="9" y2="21" stroke-linecap="round"/>
                <line x1="15" y1="3" x2="15" y2="21" stroke-linecap="round"/>
                <line x1="3" y1="9" x2="21" y2="9" stroke-linecap="round"/>
                <line x1="3" y1="15" x2="21" y2="15" stroke-linecap="round"/>
              </svg>
            </button>
            <!-- 图片计数角标 -->
            <div v-if="validImageCount > 1" class="stack-count">{{ validImageCount }}</div>
          </div>
        </div>

        <!-- ===== 展开视图：正常网格（含收起/展开动画） ===== -->
        <div v-else class="grid-area" :class="{ 'anim-collapsing': collapseDirection === 'collapsing', 'anim-expanding': collapseDirection === 'expanding' }">
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
                'drag-over': isEditMode && editDropTargetIndex === index,
                'drag-source': isEditMode && editDragIndex === index,
                'edit-draggable': isEditMode && url
              }"
              @mousedown="isEditMode && handleEditDragStart($event, index)"
            >

              <!-- 无图片时显示 + 号，编辑模式下可点击上传 -->
              <div
                v-if="!url"
                class="cell-empty"
                :class="{ 'cell-empty-clickable': isEditMode }"
                @click.stop="isEditMode && triggerUpload(index)"
              >
                <svg class="cell-plus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>

              <!-- 有图片时显示图片 -->
              <img
                v-else
                :src="url"
                class="grid-img"
                :class="{ 'grid-img-edit': isEditMode }"
                @error="e => { e.target.style.display = 'none' }"
              />

              <!-- 格子级输入端口 (用于连线特定位置) -->
              <Handle
                type="target"
                :position="Position.Left"
                :id="`input-${index}`"
                class="cell-handle"
              />

              <!-- 编辑模式下的操作按钮：预览、替换、删除 -->
              <div v-if="url && isEditMode" class="edit-cell-actions nodrag nowheel" @mousedown.stop @pointerdown.stop>
                <button class="edit-cell-btn" @click.stop="handleCellPreview(index, $event)" title="预览">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
                <button class="edit-cell-btn" @click.stop="handleCellReplace(index, $event)" title="替换">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 0 0-15.5-6.3" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3 4v6h6" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3 12a9 9 0 0 0 15.5 6.3" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M21 20v-6h-6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="edit-cell-btn edit-cell-btn-delete" @click.stop="clearCell(index)" title="删除">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>

              <!-- 上传中 -->
              <div v-if="uploadingIndex === index" class="upload-mask">
                <div class="spinner"></div>
              </div>

            </div>
          </div>
        </div>
      </div>



      <!-- 右侧输出端口 -->
      <Handle
        type="source"
        :position="Position.Right"
        id="output"
        class="node-handle node-handle-hidden"
      />

      <!-- ========== 右下角拖拽手柄（在 node-wrapper 内，跟随 node-card 底部，仅选中时显示） ========== -->
      <div v-show="selected" class="resize-handle resize-handle-corner nodrag nowheel" :class="{ 'resize-handle-collapsed': isCollapsed }" @mousedown.stop.prevent="startResize"></div>
    </div>

    <!-- ========== 底部提示文字 ========== -->
    <div v-if="!isEditMode && !isCollapsed" class="storyboard-hint">双击以进入分镜编辑排序</div>



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
        :class="{ 'edit-drag-ghost-outside': isDraggingOutside }"
        :style="{
          left: editDragGhostStyle.left,
          top: editDragGhostStyle.top,
          width: editDragGhostStyle.width,
          height: editDragGhostStyle.height
        }"
      >
        <img :src="editDragImageSrc" class="edit-drag-ghost-img" />
        <div v-if="isDraggingOutside" class="edit-drag-ghost-hint">释放以创建图片节点</div>
      </div>
    </Teleport>

    <!-- 隐藏的文件输入 -->
    <input type="file" ref="fileInputRef" accept="image/*" class="hidden-input" @change="handleFileSelect" />
    <input type="file" ref="replaceInputRef" accept="image/*" class="hidden-input" @change="handleReplaceFileSelect" />
  </div>
</template>

<style scoped>
/* ========== 节点根元素（与 ImageNode 保持一致） ========== */
.storyboard-node {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: visible;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 覆盖全局 .canvas-node.selected 样式，选中效果由内部 node-card 控制 */
.storyboard-node.selected {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
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
  transition: box-shadow 0.2s ease, border-radius 0.2s ease, opacity 0.2s ease;
}

/* 拖拽到节点外部时的幽灵样式 */
.edit-drag-ghost-outside {
  box-shadow: 0 12px 40px rgba(59, 130, 246, 0.5), 0 0 0 2px #3b82f6;
  border-radius: 12px;
  opacity: 0.92;
  overflow: visible;
}

.edit-drag-ghost-hint {
  position: absolute;
  bottom: -28px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  color: #fff;
  background: rgba(59, 130, 246, 0.85);
  padding: 3px 10px;
  border-radius: 6px;
  backdrop-filter: blur(4px);
  pointer-events: none;
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

/* ========== 弹出选择器（比例 / 网格） ========== */
.toolbar-popover-wrap {
  position: relative;
}

.toolbar-popover-trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  font-size: 11px;
  color: #ccc;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.toolbar-popover-trigger:hover {
  background: #3a3a3a;
  color: #fff;
}

.popover-label {
  color: #888;
}

.popover-value {
  color: #e0e0e0;
  font-weight: 500;
}

.toolbar-popover-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  z-index: 2000;
  min-width: 64px;
}

.toolbar-popover-item {
  padding: 6px 14px;
  font-size: 12px;
  color: #aaa;
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
  text-align: center;
}

.toolbar-popover-item:hover {
  background: #3a3a3a;
  color: #fff;
}

.toolbar-popover-item.active {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

/* 弹出菜单动画 */
.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}

.popover-fade-enter-to,
.popover-fade-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ========== 节点名称标签（与 ImageNode 保持一致） ========== */
.node-label-area {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  cursor: default;
}

.node-label-text {
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
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-label-area:hover .node-label-text {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #ffffff);
}

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

/* ========== 节点主体（与 ImageNode 保持一致） ========== */
.node-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: v-bind('displayWidth + "px"');
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ========== Handle（隐藏，仅作为连接点） ========== */
.node-handle-hidden {
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none;
}

/* 折叠时统一左侧输入端口 */
.collapsed-input-handle {
  width: 8px !important;
  height: 8px !important;
  background: var(--canvas-accent-primary, #3b82f6) !important;
  border: 2px solid var(--canvas-bg-tertiary, #1a1a1a) !important;
  border-radius: 50% !important;
  left: -4px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  opacity: 1 !important;
  z-index: 10;
}

/* 折叠时所有格子 handle 统一叠放到左侧中间（不可见，仅作连线锚点） */
.collapsed-cell-handle {
  position: absolute !important;
  left: 0 !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 1px !important;
  height: 1px !important;
  background: transparent !important;
  border: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* 输出端口位置 */
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

/* ========== 节点卡片（与 ImageNode 保持一致） ========== */
.node-card {
  flex: none;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  transition: height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.2s ease,
              box-shadow 0.2s ease,
              background 0.2s ease;
  width: 100%;
}



/* 选中状态 - 与 ImageNode 保持一致 */
.storyboard-node.selected .node-card {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* 编辑模式时覆盖蓝色选中边框，只显示绿色发光 */
.storyboard-node.selected .node-card.node-card-edit {
  border-color: rgba(74, 222, 128, 0.6);
  box-shadow: 
    0 0 8px rgba(74, 222, 128, 0.35),
    0 0 20px rgba(74, 222, 128, 0.2),
    0 0 40px rgba(74, 222, 128, 0.1),
    inset 0 0 0 1px rgba(74, 222, 128, 0.3);
}

.node-card-edit {
  border-color: rgba(74, 222, 128, 0.6);
  overflow: visible;
  box-shadow: 
    0 0 8px rgba(74, 222, 128, 0.35),
    0 0 20px rgba(74, 222, 128, 0.2),
    0 0 40px rgba(74, 222, 128, 0.1),
    inset 0 0 0 1px rgba(74, 222, 128, 0.3);
  animation: edit-glow-pulse 2.5s ease-in-out infinite;
}

@keyframes edit-glow-pulse {
  0%, 100% {
    box-shadow: 
      0 0 8px rgba(74, 222, 128, 0.35),
      0 0 20px rgba(74, 222, 128, 0.2),
      0 0 40px rgba(74, 222, 128, 0.1),
      inset 0 0 0 1px rgba(74, 222, 128, 0.3);
  }
  50% {
    box-shadow: 
      0 0 12px rgba(74, 222, 128, 0.5),
      0 0 28px rgba(74, 222, 128, 0.3),
      0 0 50px rgba(74, 222, 128, 0.15),
      inset 0 0 0 1px rgba(74, 222, 128, 0.45);
  }
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
  gap: 1px;
  background: var(--canvas-border-subtle, rgba(255, 255, 255, 0.12));
  padding: 0;
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

/* 比例：由容器高度 + 1fr 行自动保证，不再给 grid-item 设 aspect-ratio */

/* 单个格子 */
.grid-item {
  position: relative;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border-radius: 0;
  overflow: hidden;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  min-height: 20px;
}

/* 格子级输入端口：默认隐藏，铺满整个格子作为连线落点 */
.cell-handle {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  transform: none !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 6px !important;
  background: transparent !important;
  border: none !important;
  opacity: 0;
  z-index: 5;
  pointer-events: none !important;
  transition: opacity 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

/* ===== 连线进行中：cell-handle 启用交互，接受连线落点 ===== */
.storyboard-node.connecting-active :deep(.cell-handle) {
  pointer-events: auto !important;
  opacity: 1;
  background: rgba(59, 130, 246, 0.05) !important;
}

/* 连线进行中 + 鼠标悬停在格子上：高亮反馈，提示用户可以松手 */
.storyboard-node.connecting-active .grid-item:hover :deep(.cell-handle) {
  background: rgba(59, 130, 246, 0.2) !important;
  box-shadow: inset 0 0 0 2px var(--canvas-accent-primary, #3b82f6) !important;
}



/* 连线进行中，格子 hover 边框由 cell-handle 负责，取消格子自身的 */
.storyboard-node.connecting-active .grid-item:hover {
  box-shadow: none;
}




/* 空格子 */
.cell-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cell-plus-icon {
  width: 20px;
  height: 20px;
  color: var(--canvas-text-secondary, #a0a0a0);
  opacity: 0.35;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

/* 编辑模式下空格子可点击 */
.cell-empty-clickable {
  cursor: pointer;
}

.cell-empty-clickable:hover .cell-plus-icon {
  opacity: 0.8;
  transform: scale(1.2);
}

/* ========== 折叠视图（照片堆叠效果） ========== */
.collapsed-view {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 堆叠照片公共样式 */
.stack-photo {
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(100% - 16px);
  aspect-ratio: v-bind(cssAspectRatio);
  overflow: hidden;
  transform-origin: center center;
}

.stack-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 主图（第1张）：无边框设计，直接铺满 */
.stack-main {
  z-index: 3;
  transform: translate(-50%, -50%);
  border-radius: 0;
  box-shadow: none;
  border: none;
}

/* 堆叠背景层1（第2张图）：轻微旋转+偏移，像照片堆叠 */
.stack-layer-1 {
  z-index: 2;
  transform: translate(-50%, -50%) rotate(3deg) scale(0.97);
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  opacity: 0.7;
}

/* 堆叠背景层2（第3张图）：更大旋转+偏移 */
.stack-layer-2 {
  z-index: 1;
  transform: translate(-50%, -50%) rotate(-4deg) scale(0.94);
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  opacity: 0.45;
}

/* 折叠时空状态 */
.stack-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  aspect-ratio: v-bind(cssAspectRatio);
}

/* 展开按钮（主图右上角） */
.expand-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.15s ease;
  padding: 0;
}

.expand-btn:not(:hover) {
  opacity: 0.7;
}

.expand-btn svg {
  width: 15px;
  height: 15px;
}

.expand-btn:hover {
  background: rgba(59, 130, 246, 0.8);
  color: #fff;
  transform: scale(1.1);
}

/* 图片计数角标 */
.stack-count {
  position: absolute;
  bottom: 8px;
  right: 8px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

/* ========== 收起/展开动画 ========== */
/* 收起动画：非第一张格子缩小、淡出到第一张位置 */
.anim-collapsing .grid-item:not(:first-child) {
  animation: collapse-to-first 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

/* 展开动画：非第一张格子从第一张位置展开到自身位置 */
.anim-expanding .grid-item:not(:first-child) {
  animation: expand-from-first 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

/* 收起时第一张格子保持不动，其他格子淡出 */
@keyframes collapse-to-first {
  0% {
    opacity: 1;
    transform: scale(1) translate(0, 0);
  }
  100% {
    opacity: 0;
    transform: scale(0.6);
  }
}

/* 展开时其他格子从缩小状态展开 */
@keyframes expand-from-first {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  100% {
    opacity: 1;
    transform: scale(1) translate(0, 0);
  }
}

/* 收起/展开时第一张格子始终可见 */
.anim-collapsing .grid-item:first-child,
.anim-expanding .grid-item:first-child {
  z-index: 5;
}

/* 折叠态 node-card 无边框无背景 */
.node-card-collapsed {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  overflow: visible;
}

.storyboard-node.selected .node-card-collapsed {
  border-color: transparent !important;
  box-shadow: none !important;
}

/* 白昼模式适配 */
:root.canvas-theme-light .expand-btn {
  background: rgba(255, 255, 255, 0.8);
  color: #333;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .expand-btn:hover {
  background: rgba(59, 130, 246, 0.85);
  color: #fff;
}

:root.canvas-theme-light .stack-count {
  background: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .node-card-collapsed {
  background: transparent !important;
  border-color: transparent !important;
}



/* 图片 */
.grid-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 上传遮罩 */
/* ========== 编辑模式格子操作按钮 ========== */
.edit-cell-actions {
  position: absolute;
  top: 3px;
  right: 3px;
  display: flex;
  gap: 3px;
  z-index: 10;
}

.edit-cell-btn {
  width: 22px;
  height: 22px;
  background: rgba(0, 0, 0, 0.65);
  border: none;
  border-radius: 5px;
  color: #ccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  backdrop-filter: blur(4px);
}

.edit-cell-btn:hover {
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  transform: scale(1.1);
}

.edit-cell-btn svg {
  width: 12px;
  height: 12px;
}

.edit-cell-btn-delete:hover {
  background: rgba(239, 68, 68, 0.8);
  color: #fff;
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







/* ========== 底部提示文字 ========== */
.storyboard-hint {
  text-align: center;
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666666);
  margin-top: 6px;
  user-select: none;
  pointer-events: none;
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

/* 折叠态缩放手柄：缩小一点，半透明，hover 时显现 */
.resize-handle-collapsed {
  width: 10px;
  height: 10px;
  opacity: 0.5;
  border-radius: 2px;
  transition: opacity 0.15s ease;
}

.resize-handle-collapsed:hover {
  opacity: 1;
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

/* ========== 白昼模式适配 ========== */

/* 工具栏 */
:root.canvas-theme-light .storyboard-toolbar {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .toolbar-actions {
  border-left-color: rgba(0, 0, 0, 0.1);
}

/* 工具栏按钮 */
:root.canvas-theme-light .toolbar-btn {
  color: #57534e;
}

:root.canvas-theme-light .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

:root.canvas-theme-light .toolbar-btn.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

/* 弹出触发器 */
:root.canvas-theme-light .toolbar-popover-trigger {
  color: #1c1917;
}

:root.canvas-theme-light .toolbar-popover-trigger:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

:root.canvas-theme-light .popover-label {
  color: #78716c;
}

:root.canvas-theme-light .popover-value {
  color: #1c1917;
}

/* 弹出菜单 */
:root.canvas-theme-light .toolbar-popover-menu {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .toolbar-popover-item {
  color: #57534e;
}

:root.canvas-theme-light .toolbar-popover-item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

:root.canvas-theme-light .toolbar-popover-item.active {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

/* 节点卡片 */
:root.canvas-theme-light .node-card {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .storyboard-node.selected .node-card {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15), 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* 节点标签 */
:root.canvas-theme-light .node-label-text {
  color: #57534e;
}

:root.canvas-theme-light .node-label-area:hover .node-label-text {
  background: rgba(0, 0, 0, 0.04);
  color: #1c1917;
}

:root.canvas-theme-light .node-label-input {
  color: #1c1917;
  background: #ffffff;
  border-color: var(--canvas-accent-primary, #3b82f6);
}

/* 格子区域 */
:root.canvas-theme-light .grid-box {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .grid-item {
  background: #ffffff;
}

/* 左侧快捷菜单 */
:root.canvas-theme-light .left-quick-menu {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .left-quick-menu-item {
  color: #57534e;
}

:root.canvas-theme-light .left-quick-menu-item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

/* 缩放手柄 */
:root.canvas-theme-light .resize-handle-corner {
  background: var(--canvas-accent-primary, #3b82f6);
}
</style>
