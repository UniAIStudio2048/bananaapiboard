<script setup>
/**
 * NativeImageEditor.vue - 基于原生 Canvas API 的全功能图片编辑器
 * 
 * 功能特性:
 * - 裁剪 (Crop) - 支持自由裁剪和预设比例
 * - 翻转/旋转 (Flip/Rotate)
 * - 画笔绘图 (Draw)
 * - 形状工具 (Shape - 矩形、圆形、箭头)
 * - 文字工具 (Text)
 * - 滤镜效果 (Filter - 灰度、反色、模糊等)
 * - 调整工具 (Adjust - 亮度、对比度、饱和度)
 * - 撤销/重做
 * - 蒙版绘制 (用于 AI Inpainting)
 * - 编辑历史缓存（退出后再次进入可恢复）
 * 
 * 零外部依赖，纯原生实现
 * UI 风格：黑白灰，兼容画布深色/白昼模式
 */
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'

const props = defineProps({
  imageUrl: {
    type: String,
    required: true
  },
  initialTool: {
    type: String,
    default: ''
  },
  width: {
    type: Number,
    default: 1000
  },
  height: {
    type: Number,
    default: 700
  },
  // 缓存的编辑历史状态，用于恢复上次编辑
  cachedState: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['save', 'cancel'])

// DOM 引用
const containerRef = ref(null)
const mainCanvasRef = ref(null)
const overlayCanvasRef = ref(null)
const maskCanvasRef = ref(null) // 蒙版画布（独立图层）

// 状态
const isLoading = ref(true)
const currentMode = ref('')
const mainCtx = ref(null)
const overlayCtx = ref(null)
const maskCtx = ref(null) // 蒙版画布 context

// 原始图片
const originalImage = new Image()
originalImage.crossOrigin = 'anonymous'

// 画布尺寸
const canvasWidth = ref(800)
const canvasHeight = ref(600)

// 历史记录
const history = ref([])
const historyIndex = ref(-1)
const maxHistory = 30

// 绘图状态
const isDrawing = ref(false)
const lastX = ref(0)
const lastY = ref(0)

// 工具设置
const brushSize = ref(10)
const brushColor = ref('#FF0000')
const fontSize = ref(24)
const fontFamily = ref('Arial')
const textContent = ref('')
const selectedShape = ref('rect')
const strokeWidth = ref(3)

// 滤镜设置
const filters = ref({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  grayscale: 0,
  invert: 0,
  sepia: 0
})

// 裁剪状态
const cropRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const isCropping = ref(false)
const cropAspectRatio = ref('free')

// 旋转状态
const rotation = ref(0)
const flipX = ref(false)
const flipY = ref(false)

// 形状绘制状态
const shapeStart = ref({ x: 0, y: 0 })
const isDrawingShape = ref(false)

// 文字输入状态
const textPosition = ref({ x: 0, y: 0 })
const showTextInput = ref(false)

// 缩放状态
const zoomLevel = ref(1)
const minZoom = 0.25
const maxZoom = 4

// 笔刷光标状态
const cursorPosition = ref({ x: 0, y: 0 })
const showBrushCursor = ref(false)

// 标注功能状态
const annotations = ref([]) // 存储所有标注 { id, x, y, label }
const nextAnnotationLabel = ref('A') // 下一个标注的字母
const canvasBeforeAnnotations = ref(null) // 标注前的画布状态（用于删除/清除时恢复）

// 颜色预设
const colorPresets = [
  '#FF0000', '#FF6B00', '#FFD700', '#00FF00', 
  '#00BFFF', '#0000FF', '#8B00FF', '#FF1493',
  '#FFFFFF', '#808080', '#000000'
]

// 裁剪比例预设
const cropRatios = [
  { value: 'free', label: '自由' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
  { value: '3:2', label: '3:2' }
]

// 形状选项
const shapeOptions = [
  { value: 'rect', label: '矩形', icon: '⬜' },
  { value: 'circle', label: '圆形', icon: '⭕' },
  { value: 'arrow', label: '箭头', icon: '➡️' },
  { value: 'line', label: '直线', icon: '📏' }
]

// 计算当前滤镜 CSS
const filterStyle = computed(() => {
  return `
    brightness(${filters.value.brightness}%)
    contrast(${filters.value.contrast}%)
    saturate(${filters.value.saturation}%)
    blur(${filters.value.blur}px)
    grayscale(${filters.value.grayscale}%)
    invert(${filters.value.invert}%)
    sepia(${filters.value.sepia}%)
  `
})

// ==================== 编辑状态导出/导入 ====================

/**
 * 获取当前编辑状态（用于缓存）
 */
function getEditState() {
  return {
    history: history.value.map(h => ({ ...h })),
    historyIndex: historyIndex.value,
    filters: { ...filters.value },
    rotation: rotation.value,
    flipX: flipX.value,
    flipY: flipY.value,
    canvasWidth: canvasWidth.value,
    canvasHeight: canvasHeight.value,
    brushSize: brushSize.value,
    brushColor: brushColor.value,
    currentMode: currentMode.value
  }
}

/**
 * 从缓存状态恢复编辑
 */
async function restoreFromCachedState(state) {
  if (!state || !state.history || state.history.length === 0) return false
  
  try {
    // 先加载原始图片（用于 reset 功能）
    await loadImage(props.imageUrl)
    
    // 恢复画布尺寸
    canvasWidth.value = state.canvasWidth
    canvasHeight.value = state.canvasHeight
    
    // 恢复状态
    filters.value = { ...state.filters }
    rotation.value = state.rotation
    flipX.value = state.flipX
    flipY.value = state.flipY
    brushSize.value = state.brushSize || 10
    brushColor.value = state.brushColor || '#FF0000'
    
    // 恢复历史记录
    history.value = state.history.map(h => ({ ...h }))
    historyIndex.value = state.historyIndex
    
    // 等待 DOM 更新后再获取 context 和恢复画布内容
    await nextTick()
    setupCanvas()
    
    // 从当前历史位置恢复画布
    const currentState = history.value[historyIndex.value]
    if (currentState) {
      await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          if (mainCtx.value) {
            mainCtx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
            mainCtx.value.drawImage(img, 0, 0)
          }
          resolve()
        }
        img.onerror = resolve
        img.src = currentState.imageData
      })
    }
    
    console.log('[NativeImageEditor] 从缓存恢复编辑状态，历史记录:', history.value.length, '条')
    return true
  } catch (error) {
    console.error('[NativeImageEditor] 恢复缓存状态失败:', error)
    return false
  }
}

// 暴露方法给父组件
defineExpose({
  getEditState,
  restoreFromCachedState
})

// ==================== 初始化 ====================

async function init() {
  isLoading.value = true
  
  try {
    // 如果有缓存状态，优先从缓存恢复
    if (props.cachedState) {
      const restored = await restoreFromCachedState(props.cachedState)
      if (restored) {
        isLoading.value = false
        if (props.initialTool) {
          activateMode(props.initialTool)
        }
        return
      }
    }
    
    // 全新初始化
    await loadImage(props.imageUrl)
    await nextTick()  // 等待 canvas DOM 更新尺寸
    setupCanvas()
    drawImage()
    saveToHistory()
    isLoading.value = false
    
    if (props.initialTool) {
      activateMode(props.initialTool)
    }
  } catch (error) {
    console.error('[NativeImageEditor] 初始化失败:', error)
    isLoading.value = false
  }
}

// 加载图片
function loadImage(url) {
  return new Promise((resolve, reject) => {
    originalImage.onload = () => {
      // 计算适合的画布尺寸
      const maxWidth = props.width - 40
      const maxHeight = props.height - 200
      
      let w = originalImage.width
      let h = originalImage.height
      
      if (w > maxWidth) {
        h = h * (maxWidth / w)
        w = maxWidth
      }
      if (h > maxHeight) {
        w = w * (maxHeight / h)
        h = maxHeight
      }
      
      canvasWidth.value = Math.round(w)
      canvasHeight.value = Math.round(h)
      
      resolve()
    }
    originalImage.onerror = reject
    originalImage.src = url
  })
}

// 设置画布（同步获取 context，调用前需确保 DOM 已更新）
function setupCanvas() {
  if (mainCanvasRef.value) {
    mainCtx.value = mainCanvasRef.value.getContext('2d')
  }
  if (overlayCanvasRef.value) {
    overlayCtx.value = overlayCanvasRef.value.getContext('2d')
  }
  if (maskCanvasRef.value) {
    maskCtx.value = maskCanvasRef.value.getContext('2d')
    // 初始化蒙版画布为全黑（未涂抹区域）
    clearMaskCanvas()
  }
}

// 清空蒙版画布（全黑）
function clearMaskCanvas() {
  if (!maskCtx.value || !maskCanvasRef.value) return
  maskCtx.value.fillStyle = '#000000'
  maskCtx.value.fillRect(0, 0, maskCanvasRef.value.width, maskCanvasRef.value.height)
}

// 在 overlay 上渲染蒙版预览（半透明红色）
function renderMaskPreview() {
  if (!overlayCtx.value || !maskCanvasRef.value) return
  
  const ctx = overlayCtx.value
  const maskCanvas = maskCanvasRef.value
  
  // 清除 overlay
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
  
  // 获取蒙版数据
  const maskData = maskCtx.value.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
  const data = maskData.data
  
  // 创建临时画布来生成红色预览
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = maskCanvas.width
  tempCanvas.height = maskCanvas.height
  const tempCtx = tempCanvas.getContext('2d')
  const previewData = tempCtx.createImageData(maskCanvas.width, maskCanvas.height)
  
  // 将白色区域转换为半透明红色
  for (let i = 0; i < data.length; i += 4) {
    const brightness = data[i] // R 通道（黑白图片 RGB 相同）
    if (brightness > 128) {
      // 白色区域 -> 半透明红色
      previewData.data[i] = 255     // R
      previewData.data[i + 1] = 0   // G
      previewData.data[i + 2] = 0   // B
      previewData.data[i + 3] = 128 // A (半透明)
    } else {
      // 黑色区域 -> 透明
      previewData.data[i] = 0
      previewData.data[i + 1] = 0
      previewData.data[i + 2] = 0
      previewData.data[i + 3] = 0
    }
  }
  
  tempCtx.putImageData(previewData, 0, 0)
  ctx.drawImage(tempCanvas, 0, 0)
}

// 绘制图片到主画布
function drawImage() {
  if (!mainCtx.value) return
  
  const ctx = mainCtx.value
  const canvas = mainCanvasRef.value
  
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  
  // 应用变换
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotation.value * Math.PI) / 180)
  ctx.scale(flipX.value ? -1 : 1, flipY.value ? -1 : 1)
  ctx.translate(-canvas.width / 2, -canvas.height / 2)
  
  // 应用滤镜
  ctx.filter = filterStyle.value
  
  // 绘制图片
  ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height)
  
  ctx.restore()
}

// 保存到历史记录
function saveToHistory() {
  if (!mainCanvasRef.value) return
  
  // 删除当前位置之后的历史
  history.value = history.value.slice(0, historyIndex.value + 1)
  
  // 保存当前状态
  const imageData = mainCanvasRef.value.toDataURL('image/png')
  history.value.push({
    imageData,
    filters: { ...filters.value },
    rotation: rotation.value,
    flipX: flipX.value,
    flipY: flipY.value
  })
  
  // 限制历史记录数量
  if (history.value.length > maxHistory) {
    history.value.shift()
  } else {
    historyIndex.value++
  }
}

// 撤销
function undo() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    restoreFromHistory()
  }
}

// 重做
function redo() {
  if (historyIndex.value < history.value.length - 1) {
    historyIndex.value++
    restoreFromHistory()
  }
}

// 从历史记录恢复
function restoreFromHistory() {
  const state = history.value[historyIndex.value]
  if (!state) return
  
  const img = new Image()
  img.onload = () => {
    mainCtx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
    mainCtx.value.drawImage(img, 0, 0)
  }
  img.src = state.imageData
  
  filters.value = { ...state.filters }
  rotation.value = state.rotation
  flipX.value = state.flipX
  flipY.value = state.flipY
}

// 激活模式
function activateMode(mode) {
  // 如果切换模式，先应用当前操作
  if (currentMode.value === 'crop' && isCropping.value) {
    cancelCrop()
  }
  
  // 离开蒙版模式时清除预览（但保留蒙版数据）
  if (currentMode.value === 'mask' && mode !== 'mask') {
    clearOverlay()
  }
  
  currentMode.value = mode
  clearOverlay()
  
  if (mode === 'crop') {
    initCrop()
  }
  
  // 进入蒙版模式时初始化
  if (mode === 'mask') {
    // 如果蒙版画布还没有内容，初始化为全黑
    if (maskCanvasRef.value && maskCtx.value) {
      // 显示当前蒙版预览（如果有的话）
      renderMaskPreview()
    }
  }
}

// 退出当前模式
function exitMode() {
  currentMode.value = ''
  clearOverlay()
}

// 清除覆盖层
function clearOverlay() {
  if (overlayCtx.value) {
    overlayCtx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
  }
}

// ==================== 坐标转换辅助函数 ====================

// 获取画布坐标（考虑缩放）
function getCanvasCoords(e) {
  const rect = mainCanvasRef.value.getBoundingClientRect()
  // 缩放后的坐标需要除以缩放因子
  const x = (e.clientX - rect.left) / zoomLevel.value
  const y = (e.clientY - rect.top) / zoomLevel.value
  return { x, y }
}

// ==================== 绘图工具 ====================

function startDraw(e) {
  if (currentMode.value !== 'draw' && currentMode.value !== 'mask') return
  
  isDrawing.value = true
  const { x, y } = getCanvasCoords(e)
  lastX.value = x
  lastY.value = y
}

function draw(e) {
  if (!isDrawing.value) return
  if (currentMode.value !== 'draw' && currentMode.value !== 'mask') return
  
  const { x, y } = getCanvasCoords(e)
  
  if (currentMode.value === 'mask') {
    // 蒙版模式：在蒙版画布上绘制白色
    const ctx = maskCtx.value
    if (!ctx) return
    
    ctx.beginPath()
    ctx.moveTo(lastX.value, lastY.value)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#FFFFFF' // 白色表示涂抹区域
    ctx.lineWidth = brushSize.value
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    
    // 更新蒙版预览
    renderMaskPreview()
  } else {
    // 画笔模式：在主画布上绘制
    const ctx = mainCtx.value
    ctx.beginPath()
    ctx.moveTo(lastX.value, lastY.value)
    ctx.lineTo(x, y)
    ctx.strokeStyle = brushColor.value
    ctx.lineWidth = brushSize.value
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  
  lastX.value = x
  lastY.value = y
}

function endDraw() {
  if (isDrawing.value) {
    isDrawing.value = false
    // 蒙版模式不保存到主画布历史
    if (currentMode.value !== 'mask') {
      saveToHistory()
    }
  }
}

// ==================== 形状工具 ====================

function startShape(e) {
  if (currentMode.value !== 'shape') return
  
  isDrawingShape.value = true
  const { x, y } = getCanvasCoords(e)
  shapeStart.value = { x, y }
}

function drawShapePreview(e) {
  if (!isDrawingShape.value || currentMode.value !== 'shape') return
  
  const { x, y } = getCanvasCoords(e)
  
  clearOverlay()
  const ctx = overlayCtx.value
  ctx.strokeStyle = brushColor.value
  ctx.lineWidth = strokeWidth.value
  ctx.fillStyle = 'transparent'
  
  const startX = shapeStart.value.x
  const startY = shapeStart.value.y
  const width = x - startX
  const height = y - startY
  
  ctx.beginPath()
  
  switch (selectedShape.value) {
    case 'rect':
      ctx.strokeRect(startX, startY, width, height)
      break
    case 'circle':
      const radius = Math.sqrt(width * width + height * height) / 2
      const centerX = startX + width / 2
      const centerY = startY + height / 2
      ctx.arc(centerX, centerY, Math.abs(radius), 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'line':
      ctx.moveTo(startX, startY)
      ctx.lineTo(x, y)
      ctx.stroke()
      break
    case 'arrow':
      drawArrow(ctx, startX, startY, x, y)
      break
  }
}

function endShape(e) {
  if (!isDrawingShape.value || currentMode.value !== 'shape') return
  
  const { x, y } = getCanvasCoords(e)
  
  const ctx = mainCtx.value
  ctx.strokeStyle = brushColor.value
  ctx.lineWidth = strokeWidth.value
  
  const startX = shapeStart.value.x
  const startY = shapeStart.value.y
  const width = x - startX
  const height = y - startY
  
  ctx.beginPath()
  
  switch (selectedShape.value) {
    case 'rect':
      ctx.strokeRect(startX, startY, width, height)
      break
    case 'circle':
      const radius = Math.sqrt(width * width + height * height) / 2
      const centerX = startX + width / 2
      const centerY = startY + height / 2
      ctx.arc(centerX, centerY, Math.abs(radius), 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'line':
      ctx.moveTo(startX, startY)
      ctx.lineTo(x, y)
      ctx.stroke()
      break
    case 'arrow':
      drawArrow(ctx, startX, startY, x, y)
      break
  }
  
  isDrawingShape.value = false
  clearOverlay()
  saveToHistory()
}

function drawArrow(ctx, fromX, fromY, toX, toY) {
  const headLength = 15
  const angle = Math.atan2(toY - fromY, toX - fromX)
  
  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6))
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6))
  ctx.stroke()
}

// ==================== 文字工具 ====================

function handleTextClick(e) {
  if (currentMode.value !== 'text') return
  
  const { x, y } = getCanvasCoords(e)
  textPosition.value = { x, y }
  showTextInput.value = true
  textContent.value = ''
  
  nextTick(() => {
    const input = document.querySelector('.text-input-overlay input')
    if (input) input.focus()
  })
}

function addText() {
  if (!textContent.value.trim()) {
    showTextInput.value = false
    return
  }
  
  const ctx = mainCtx.value
  ctx.font = `${fontSize.value}px ${fontFamily.value}`
  ctx.fillStyle = brushColor.value
  ctx.fillText(textContent.value, textPosition.value.x, textPosition.value.y)
  
  showTextInput.value = false
  textContent.value = ''
  saveToHistory()
}

function cancelText() {
  showTextInput.value = false
  textContent.value = ''
}

// ==================== 标注工具 ====================

// 获取下一个字母标签
function getNextLabel() {
  const label = nextAnnotationLabel.value
  // 更新下一个字母
  if (label === 'Z') {
    nextAnnotationLabel.value = 'AA'
  } else if (label.length === 2 && label[1] === 'Z') {
    nextAnnotationLabel.value = String.fromCharCode(label.charCodeAt(0) + 1) + 'A'
  } else if (label.length === 2) {
    nextAnnotationLabel.value = label[0] + String.fromCharCode(label.charCodeAt(1) + 1)
  } else {
    nextAnnotationLabel.value = String.fromCharCode(label.charCodeAt(0) + 1)
  }
  return label
}

// 添加标注
function addAnnotation(e) {
  if (currentMode.value !== 'annotate') return
  
  const { x, y } = getCanvasCoords(e)
  const label = getNextLabel()
  
  // 第一个标注前保存画布状态（用于删除时恢复）
  if (annotations.value.length === 0) {
    canvasBeforeAnnotations.value = mainCanvasRef.value.toDataURL('image/png')
  }
  
  annotations.value.push({
    id: Date.now(),
    x,
    y,
    label
  })
  
  // 绘制标注到主画布
  drawAnnotationToCanvas(x, y, label)
  saveToHistory()
}

// 绘制标注到画布
function drawAnnotationToCanvas(x, y, label) {
  const ctx = mainCtx.value
  if (!ctx) return
  
  const pinSize = 24
  const pinHeight = 32
  
  // 绘制图钉主体（蓝色圆形）
  ctx.beginPath()
  ctx.arc(x, y - pinHeight + pinSize / 2, pinSize / 2, 0, Math.PI * 2)
  ctx.fillStyle = '#2563EB' // 蓝色
  ctx.fill()
  ctx.strokeStyle = '#1D4ED8'
  ctx.lineWidth = 2
  ctx.stroke()
  
  // 绘制图钉尖端
  ctx.beginPath()
  ctx.moveTo(x - 6, y - pinHeight + pinSize / 2 + 8)
  ctx.lineTo(x, y)
  ctx.lineTo(x + 6, y - pinHeight + pinSize / 2 + 8)
  ctx.fillStyle = '#2563EB'
  ctx.fill()
  
  // 绘制字母
  ctx.font = 'bold 14px Arial'
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y - pinHeight + pinSize / 2)
  
  // 恢复默认对齐
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
}

// 右键删除标注
function handleAnnotationRightClick(e) {
  if (currentMode.value !== 'annotate') return
  
  e.preventDefault()
  const { x, y } = getCanvasCoords(e)
  
  // 查找点击位置附近的标注（扩大检测范围）
  const clickRadius = 30
  const index = annotations.value.findIndex(ann => {
    const dx = ann.x - x
    const dy = (ann.y - 20) - y // 标注中心在标记点上方
    return Math.sqrt(dx * dx + dy * dy) < clickRadius
  })
  
  if (index !== -1) {
    annotations.value.splice(index, 1)
    // 重绘画布
    redrawAllAnnotations()
  }
}

// 重绘所有标注（删除后需要恢复原始画布并重绘）
function redrawAllAnnotations() {
  if (!canvasBeforeAnnotations.value) return
  
  const img = new Image()
  img.onload = () => {
    mainCtx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
    mainCtx.value.drawImage(img, 0, 0)
    // 重绘剩余标注
    annotations.value.forEach(ann => {
      drawAnnotationToCanvas(ann.x, ann.y, ann.label)
    })
    saveToHistory()
  }
  img.src = canvasBeforeAnnotations.value
}

// 清除所有标注
function clearAllAnnotations() {
  if (annotations.value.length === 0) return
  
  if (!canvasBeforeAnnotations.value) return
  
  // 恢复到标注前的画布状态
  const img = new Image()
  img.onload = () => {
    mainCtx.value.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
    mainCtx.value.drawImage(img, 0, 0)
    saveToHistory()
    
    // 清除标注数据
    annotations.value = []
    nextAnnotationLabel.value = 'A'
    canvasBeforeAnnotations.value = null
  }
  img.src = canvasBeforeAnnotations.value
}

// ==================== 裁剪工具 ====================

function initCrop() {
  isCropping.value = true
  // 初始裁剪框覆盖整个图片区域（保持原样）
  cropRect.value = {
    x: 0,
    y: 0,
    width: canvasWidth.value,
    height: canvasHeight.value
  }
  drawCropOverlay()
}

function drawCropOverlay() {
  if (!overlayCtx.value) return
  
  const ctx = overlayCtx.value
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
  
  // 半透明遮罩
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value)
  
  // 清除裁剪区域
  const { x, y, width, height } = cropRect.value
  ctx.clearRect(x, y, width, height)
  
  // 裁剪框边框
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, width, height)
  
  // 网格线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1
  
  // 垂直线
  ctx.beginPath()
  ctx.moveTo(x + width / 3, y)
  ctx.lineTo(x + width / 3, y + height)
  ctx.moveTo(x + width * 2 / 3, y)
  ctx.lineTo(x + width * 2 / 3, y + height)
  // 水平线
  ctx.moveTo(x, y + height / 3)
  ctx.lineTo(x + width, y + height / 3)
  ctx.moveTo(x, y + height * 2 / 3)
  ctx.lineTo(x + width, y + height * 2 / 3)
  ctx.stroke()
  
  // 角落控制点
  const cornerSize = 10
  ctx.fillStyle = '#fff'
  // 左上
  ctx.fillRect(x - cornerSize / 2, y - cornerSize / 2, cornerSize, cornerSize)
  // 右上
  ctx.fillRect(x + width - cornerSize / 2, y - cornerSize / 2, cornerSize, cornerSize)
  // 左下
  ctx.fillRect(x - cornerSize / 2, y + height - cornerSize / 2, cornerSize, cornerSize)
  // 右下
  ctx.fillRect(x + width - cornerSize / 2, y + height - cornerSize / 2, cornerSize, cornerSize)
}

let cropDragType = null
let cropStartPos = { x: 0, y: 0 }
let cropStartRect = { x: 0, y: 0, width: 0, height: 0 }

function startCropDrag(e) {
  if (!isCropping.value) return
  
  const { x, y } = getCanvasCoords(e)
  
  const { x: cx, y: cy, width: cw, height: ch } = cropRect.value
  const cornerSize = 15
  
  // 检测拖拽类型
  if (Math.abs(x - cx) < cornerSize && Math.abs(y - cy) < cornerSize) {
    cropDragType = 'nw'
  } else if (Math.abs(x - (cx + cw)) < cornerSize && Math.abs(y - cy) < cornerSize) {
    cropDragType = 'ne'
  } else if (Math.abs(x - cx) < cornerSize && Math.abs(y - (cy + ch)) < cornerSize) {
    cropDragType = 'sw'
  } else if (Math.abs(x - (cx + cw)) < cornerSize && Math.abs(y - (cy + ch)) < cornerSize) {
    cropDragType = 'se'
  } else if (x > cx && x < cx + cw && y > cy && y < cy + ch) {
    cropDragType = 'move'
  } else {
    cropDragType = null
    return
  }
  
  cropStartPos = { x, y }
  cropStartRect = { ...cropRect.value }
}

function moveCropDrag(e) {
  if (!cropDragType) return
  
  const { x, y } = getCanvasCoords(e)
  
  const dx = x - cropStartPos.x
  const dy = y - cropStartPos.y
  
  const newRect = { ...cropStartRect }
  
  switch (cropDragType) {
    case 'nw':
      newRect.x = Math.max(0, cropStartRect.x + dx)
      newRect.y = Math.max(0, cropStartRect.y + dy)
      newRect.width = cropStartRect.width - dx
      newRect.height = cropStartRect.height - dy
      break
    case 'ne':
      newRect.y = Math.max(0, cropStartRect.y + dy)
      newRect.width = cropStartRect.width + dx
      newRect.height = cropStartRect.height - dy
      break
    case 'sw':
      newRect.x = Math.max(0, cropStartRect.x + dx)
      newRect.width = cropStartRect.width - dx
      newRect.height = cropStartRect.height + dy
      break
    case 'se':
      newRect.width = cropStartRect.width + dx
      newRect.height = cropStartRect.height + dy
      break
    case 'move':
      newRect.x = Math.max(0, Math.min(canvasWidth.value - cropStartRect.width, cropStartRect.x + dx))
      newRect.y = Math.max(0, Math.min(canvasHeight.value - cropStartRect.height, cropStartRect.y + dy))
      break
  }
  
  // 确保最小尺寸
  if (newRect.width >= 50 && newRect.height >= 50) {
    // 限制边界
    newRect.width = Math.min(newRect.width, canvasWidth.value - newRect.x)
    newRect.height = Math.min(newRect.height, canvasHeight.value - newRect.y)
    
    // 应用比例约束
    if (cropAspectRatio.value !== 'free') {
      const [w, h] = cropAspectRatio.value.split(':').map(Number)
      const ratio = w / h
      
      if (cropDragType.includes('e') || cropDragType.includes('w')) {
        newRect.height = newRect.width / ratio
      } else {
        newRect.width = newRect.height * ratio
      }
    }
    
    cropRect.value = newRect
    drawCropOverlay()
  }
}

function endCropDrag() {
  cropDragType = null
}

function applyCrop() {
  if (!isCropping.value) return
  
  const { x, y, width, height } = cropRect.value
  
  // 创建临时画布
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = width
  tempCanvas.height = height
  const tempCtx = tempCanvas.getContext('2d')
  
  // 裁剪图片
  tempCtx.drawImage(mainCanvasRef.value, x, y, width, height, 0, 0, width, height)
  
  // 更新画布尺寸
  canvasWidth.value = width
  canvasHeight.value = height
  
  nextTick(() => {
    // 绘制裁剪后的图片
    mainCtx.value.clearRect(0, 0, width, height)
    mainCtx.value.drawImage(tempCanvas, 0, 0)
    
    // 更新原始图片
    const img = new Image()
    img.onload = () => {
      originalImage.src = tempCanvas.toDataURL('image/png')
    }
    img.src = tempCanvas.toDataURL('image/png')
    
    // 裁剪后重新初始化蒙版画布（清除之前的蒙版）
    nextTick(() => {
      clearMaskCanvas()
    })
    
    isCropping.value = false
    currentMode.value = ''
    clearOverlay()
    saveToHistory()
  })
}

function cancelCrop() {
  isCropping.value = false
  clearOverlay()
}

// ==================== 翻转/旋转 ====================

function flipHorizontal() {
  flipX.value = !flipX.value
  drawImage()
  saveToHistory()
}

function flipVertical() {
  flipY.value = !flipY.value
  drawImage()
  saveToHistory()
}

function rotateLeft() {
  rotation.value = (rotation.value - 90) % 360
  drawImage()
  saveToHistory()
}

function rotateRight() {
  rotation.value = (rotation.value + 90) % 360
  drawImage()
  saveToHistory()
}

// ==================== 滤镜 ====================

function applyFilters() {
  drawImage()
  saveToHistory()
}

function resetFilters() {
  filters.value = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    grayscale: 0,
    invert: 0,
    sepia: 0
  }
  drawImage()
  saveToHistory()
}

// ==================== 重置 ====================

function resetAll() {
  rotation.value = 0
  flipX.value = false
  flipY.value = false
  resetFilters()
  
  loadImage(props.imageUrl).then(() => {
    drawImage()
    history.value = []
    historyIndex.value = -1
    saveToHistory()
  })
}

// ==================== 保存/取消 ====================

function save() {
  const imageDataUrl = mainCanvasRef.value.toDataURL('image/png')
  
  // 检查是否有蒙版内容（蒙版画布不是全黑）
  let maskDataUrl = null
  if (maskCanvasRef.value && maskCtx.value) {
    const maskData = maskCtx.value.getImageData(0, 0, maskCanvasRef.value.width, maskCanvasRef.value.height)
    const data = maskData.data
    let hasMaskContent = false
    
    // 检查是否有白色像素（涂抹区域）
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 128) { // R 通道大于 128 说明有白色
        hasMaskContent = true
        break
      }
    }
    
    if (hasMaskContent) {
      maskDataUrl = maskCanvasRef.value.toDataURL('image/png')
    }
  }
  
  emit('save', {
    image: imageDataUrl,
    mask: maskDataUrl, // 黑白蒙版图片（涂抹区域白色，其他黑色）
    hasMask: !!maskDataUrl
  })
}

function cancel() {
  emit('cancel')
}

// ==================== 事件处理 ====================

function handleMouseDown(e) {
  if (currentMode.value === 'draw' || currentMode.value === 'mask') {
    startDraw(e)
  } else if (currentMode.value === 'shape') {
    startShape(e)
  } else if (currentMode.value === 'crop') {
    startCropDrag(e)
  }
}

function handleMouseMove(e) {
  // 更新笔刷/标注光标位置
  if (currentMode.value === 'draw' || currentMode.value === 'mask' || currentMode.value === 'annotate') {
    updateBrushCursor(e)
  }
  
  if (currentMode.value === 'draw' || currentMode.value === 'mask') {
    draw(e)
  } else if (currentMode.value === 'shape') {
    drawShapePreview(e)
  } else if (currentMode.value === 'crop') {
    moveCropDrag(e)
  }
}

// 更新笔刷光标位置
function updateBrushCursor(e) {
  if (!mainCanvasRef.value) return
  const { x, y } = getCanvasCoords(e)
  cursorPosition.value = { x, y }
}

// 鼠标进入画布
function handleMouseEnter() {
  if (currentMode.value === 'draw' || currentMode.value === 'mask' || currentMode.value === 'annotate') {
    showBrushCursor.value = true
  }
}

// 鼠标离开画布
function handleMouseLeave() {
  showBrushCursor.value = false
}

// 右键菜单处理
function handleContextMenu(e) {
  if (currentMode.value === 'annotate') {
    handleAnnotationRightClick(e)
  }
}

// 滚轮事件处理
function handleWheel(e) {
  e.preventDefault()
  
  if (e.ctrlKey || e.metaKey) {
    // Ctrl + 滚轮：缩放图像
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoomLevel.value + delta))
    zoomLevel.value = Math.round(newZoom * 100) / 100
  } else if (currentMode.value === 'draw' || currentMode.value === 'mask') {
    // 滚轮：调整笔刷大小
    const delta = e.deltaY > 0 ? -5 : 5
    brushSize.value = Math.max(1, Math.min(100, brushSize.value + delta))
  }
}

function handleMouseUp(e) {
  if (currentMode.value === 'draw' || currentMode.value === 'mask') {
    endDraw()
  } else if (currentMode.value === 'shape') {
    endShape(e)
  } else if (currentMode.value === 'crop') {
    endCropDrag()
  }
}

function handleClick(e) {
  if (currentMode.value === 'text') {
    handleTextClick(e)
  } else if (currentMode.value === 'annotate') {
    addAnnotation(e)
  }
}

// 生命周期
onMounted(() => {
  init()
  
  // 添加全局事件监听
  window.addEventListener('mouseup', handleMouseUp)
})

onUnmounted(() => {
  window.removeEventListener('mouseup', handleMouseUp)
})

// 监听图片URL变化
watch(() => props.imageUrl, (newUrl) => {
  if (newUrl) {
    init()
  }
})
</script>

<template>
  <div class="native-editor-wrapper" ref="containerRef">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <!-- 主工具 -->
      <div class="toolbar-section">
        <div class="toolbar-group">
          <button 
            class="tool-btn" 
            :class="{ active: currentMode === 'crop' }"
            @click="activateMode('crop')"
            title="裁剪"
          >
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 002 2h14"/><path d="M18 22V8a2 2 0 00-2-2H2"/></svg>
            </span>
            <span class="tool-label">裁剪</span>
          </button>
          
          <button class="tool-btn" @click="flipHorizontal" title="水平翻转">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v14a2 2 0 002 2h3"/><path d="M16 3h3a2 2 0 012 2v14a2 2 0 01-2 2h-3"/><line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 2"/></svg>
            </span>
            <span class="tool-label">水平翻转</span>
          </button>
          
          <button class="tool-btn" @click="flipVertical" title="垂直翻转">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V5a2 2 0 012-2h14a2 2 0 012 2v3"/><path d="M3 16v3a2 2 0 002 2h14a2 2 0 002-2v-3"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 2"/></svg>
            </span>
            <span class="tool-label">垂直翻转</span>
          </button>
          
          <button class="tool-btn" @click="rotateLeft" title="左旋转90°">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2v6h6"/><path d="M2.5 8a10 10 0 0119 2.5"/><path d="M12 22a10 10 0 01-8.5-4.5"/></svg>
            </span>
            <span class="tool-label">左旋</span>
          </button>
          
          <button class="tool-btn" @click="rotateRight" title="右旋转90°">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.5 8a10 10 0 00-19 2.5"/><path d="M12 22a10 10 0 008.5-4.5"/></svg>
            </span>
            <span class="tool-label">右旋</span>
          </button>
        </div>
        
        <div class="toolbar-divider"></div>
        
        <div class="toolbar-group">
          <button 
            class="tool-btn" 
            :class="{ active: currentMode === 'draw' }"
            @click="activateMode('draw')"
            title="画笔"
          >
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
            </span>
            <span class="tool-label">画笔</span>
          </button>
          
          <button 
            class="tool-btn" 
            :class="{ active: currentMode === 'annotate' }"
            @click="activateMode('annotate')"
            title="标注（右键删除）"
          >
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <span class="tool-label">标注</span>
          </button>
          
          <button 
            class="tool-btn" 
            :class="{ active: currentMode === 'shape' }"
            @click="activateMode('shape')"
            title="形状"
          >
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </span>
            <span class="tool-label">形状</span>
          </button>
          
          <button 
            class="tool-btn" 
            :class="{ active: currentMode === 'text' }"
            @click="activateMode('text')"
            title="文字"
          >
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            </span>
            <span class="tool-label">文字</span>
          </button>
          
          <button 
            class="tool-btn" 
            :class="{ active: currentMode === 'mask' }"
            @click="activateMode('mask')"
            title="蒙版（用于AI重绘）"
          >
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </span>
            <span class="tool-label">蒙版</span>
          </button>
        </div>
        
        <div class="toolbar-divider"></div>
        
        <div class="toolbar-group">
          <button 
            class="tool-btn" 
            :class="{ active: currentMode === 'filter' }"
            @click="activateMode('filter')"
            title="滤镜调整"
          >
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            </span>
            <span class="tool-label">滤镜</span>
          </button>
        </div>
        
        <div class="toolbar-divider"></div>
        
        <div class="toolbar-group">
          <button class="tool-btn" @click="undo" :disabled="historyIndex <= 0" title="撤销">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            </span>
            <span class="tool-label">撤销</span>
          </button>
          
          <button class="tool-btn" @click="redo" :disabled="historyIndex >= history.length - 1" title="重做">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.13-9.36L23 10"/></svg>
            </span>
            <span class="tool-label">重做</span>
          </button>
          
          <button class="tool-btn danger" @click="resetAll" title="重置">
            <span class="tool-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </span>
            <span class="tool-label">重置</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- 子工具栏 - 始终占位，固定高度，避免切换工具时画布区域跳动 -->
    <div class="sub-toolbar">
      <!-- 裁剪选项 -->
      <template v-if="currentMode === 'crop'">
        <div class="sub-control">
          <label>比例</label>
          <div class="ratio-btns">
            <button 
              v-for="ratio in cropRatios" 
              :key="ratio.value"
              class="ratio-btn"
              :class="{ active: cropAspectRatio === ratio.value }"
              @click="cropAspectRatio = ratio.value"
            >
              {{ ratio.label }}
            </button>
          </div>
        </div>
        <button class="sub-btn primary" @click="applyCrop">
          <span>&#10003;</span> 应用裁剪
        </button>
        <button class="sub-btn" @click="cancelCrop">
          取消
        </button>
      </template>
      
      <!-- 画笔/蒙版设置 -->
      <template v-if="['draw', 'mask'].includes(currentMode)">
        <div class="sub-control">
          <label>粗细</label>
          <input 
            type="range" 
            v-model.number="brushSize" 
            min="1" 
            max="100" 
            class="slider"
          />
          <span class="value">{{ brushSize }}px</span>
        </div>
        
        <div v-if="currentMode === 'draw'" class="sub-control colors">
          <label>颜色</label>
          <div class="color-presets">
            <button 
              v-for="color in colorPresets" 
              :key="color"
              class="color-btn"
              :class="{ active: brushColor === color }"
              :style="{ backgroundColor: color }"
              @click="brushColor = color"
            ></button>
          </div>
          <input 
            type="color" 
            v-model="brushColor" 
            class="color-picker"
          />
        </div>
        
        <div v-if="currentMode === 'mask'" class="mask-controls">
          <span class="mask-hint">涂抹区域将用于 AI 重绘（保存后生成黑白蒙版）</span>
          <button class="clear-mask-btn" @click="clearMaskCanvas(); renderMaskPreview();">
            清除蒙版
          </button>
        </div>
      </template>
      
      <!-- 标注设置 -->
      <template v-if="currentMode === 'annotate'">
        <div class="annotate-controls">
          <span class="annotate-hint">
            点击添加标注（{{ annotations.length }} 个）| 右键删除
          </span>
          <span class="next-label-preview">下一个: {{ nextAnnotationLabel }}</span>
          <button 
            class="clear-mask-btn" 
            @click="clearAllAnnotations"
            :disabled="annotations.length === 0"
          >
            清除全部
          </button>
        </div>
      </template>
      
      <!-- 形状设置 -->
      <template v-if="currentMode === 'shape'">
        <div class="sub-control">
          <label>形状</label>
          <div class="shape-btns">
            <button 
              v-for="shape in shapeOptions" 
              :key="shape.value"
              class="shape-btn"
              :class="{ active: selectedShape === shape.value }"
              @click="selectedShape = shape.value"
              :title="shape.label"
            >
              {{ shape.icon }}
            </button>
          </div>
        </div>
        
        <div class="sub-control">
          <label>粗细</label>
          <input 
            type="range" 
            v-model.number="strokeWidth" 
            min="1" 
            max="20" 
            class="slider"
          />
          <span class="value">{{ strokeWidth }}px</span>
        </div>
        
        <div class="sub-control colors">
          <label>颜色</label>
          <div class="color-presets">
            <button 
              v-for="color in colorPresets" 
              :key="color"
              class="color-btn"
              :class="{ active: brushColor === color }"
              :style="{ backgroundColor: color }"
              @click="brushColor = color"
            ></button>
          </div>
        </div>
      </template>
      
      <!-- 文字设置 -->
      <template v-if="currentMode === 'text'">
        <div class="sub-control">
          <label>字号</label>
          <input 
            type="range" 
            v-model.number="fontSize" 
            min="12" 
            max="100" 
            class="slider"
          />
          <span class="value">{{ fontSize }}px</span>
        </div>
        
        <div class="sub-control colors">
          <label>颜色</label>
          <div class="color-presets">
            <button 
              v-for="color in colorPresets" 
              :key="color"
              class="color-btn"
              :class="{ active: brushColor === color }"
              :style="{ backgroundColor: color }"
              @click="brushColor = color"
            ></button>
          </div>
        </div>
        
        <div class="text-hint">
          点击图片添加文字
        </div>
      </template>
      
      <!-- 滤镜设置 -->
      <template v-if="currentMode === 'filter'">
        <div class="filter-controls">
          <div class="filter-item">
            <label>亮度</label>
            <input type="range" v-model.number="filters.brightness" min="0" max="200" @change="applyFilters" />
            <span>{{ filters.brightness }}%</span>
          </div>
          <div class="filter-item">
            <label>对比度</label>
            <input type="range" v-model.number="filters.contrast" min="0" max="200" @change="applyFilters" />
            <span>{{ filters.contrast }}%</span>
          </div>
          <div class="filter-item">
            <label>饱和度</label>
            <input type="range" v-model.number="filters.saturation" min="0" max="200" @change="applyFilters" />
            <span>{{ filters.saturation }}%</span>
          </div>
          <div class="filter-item">
            <label>模糊</label>
            <input type="range" v-model.number="filters.blur" min="0" max="10" @change="applyFilters" />
            <span>{{ filters.blur }}px</span>
          </div>
          <div class="filter-item">
            <label>灰度</label>
            <input type="range" v-model.number="filters.grayscale" min="0" max="100" @change="applyFilters" />
            <span>{{ filters.grayscale }}%</span>
          </div>
          <div class="filter-item">
            <label>反色</label>
            <input type="range" v-model.number="filters.invert" min="0" max="100" @change="applyFilters" />
            <span>{{ filters.invert }}%</span>
          </div>
          <div class="filter-item">
            <label>复古</label>
            <input type="range" v-model.number="filters.sepia" min="0" max="100" @change="applyFilters" />
            <span>{{ filters.sepia }}%</span>
          </div>
        </div>
        <button class="sub-btn" @click="resetFilters">
          重置滤镜
        </button>
      </template>
      
      <!-- 无工具选中时的占位 -->
      <div v-if="!currentMode" class="sub-placeholder">
        选择工具开始编辑
      </div>
    </div>
    
    <!-- 画布区域 -->
    <div class="editor-canvas-container" @wheel.prevent="handleWheel">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>
      
      <!-- 缩放占位容器（保持正确的滚动区域） -->
      <div 
        class="zoom-container"
        :style="{ 
          width: canvasWidth * zoomLevel + 'px', 
          height: canvasHeight * zoomLevel + 'px'
        }"
      >
        <div 
          class="canvas-wrapper" 
          :class="{ 
            'brush-mode': currentMode === 'draw' || currentMode === 'mask',
            'annotate-mode': currentMode === 'annotate'
          }"
          :style="{ 
            width: canvasWidth + 'px', 
            height: canvasHeight + 'px',
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top left'
          }"
          @mouseenter="handleMouseEnter"
          @mouseleave="handleMouseLeave"
          @contextmenu="handleContextMenu"
        >
        <!-- 主画布 -->
        <canvas 
          ref="mainCanvasRef"
          :width="canvasWidth"
          :height="canvasHeight"
          class="main-canvas"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @click="handleClick"
        ></canvas>
        
        <!-- 蒙版画布（隐藏，仅用于存储蒙版数据） -->
        <canvas 
          ref="maskCanvasRef"
          :width="canvasWidth"
          :height="canvasHeight"
          class="mask-canvas"
        ></canvas>
        
        <!-- 覆盖层画布（用于预览、裁剪框、蒙版显示等） -->
        <canvas 
          ref="overlayCanvasRef"
          :width="canvasWidth"
          :height="canvasHeight"
          class="overlay-canvas"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @click="handleClick"
        ></canvas>
        
        <!-- 笔刷光标 -->
        <div 
          v-if="showBrushCursor && (currentMode === 'draw' || currentMode === 'mask')"
          class="brush-cursor"
          :style="{
            left: cursorPosition.x + 'px',
            top: cursorPosition.y + 'px',
            width: brushSize + 'px',
            height: brushSize + 'px'
          }"
        ></div>
        
        <!-- 标注光标（蓝色发光小点） -->
        <div 
          v-if="showBrushCursor && currentMode === 'annotate'"
          class="annotate-cursor"
          :style="{
            left: cursorPosition.x + 'px',
            top: cursorPosition.y + 'px'
          }"
        ></div>
        
        <!-- 文字输入框 -->
        <div 
          v-if="showTextInput" 
          class="text-input-overlay"
          :style="{ left: textPosition.x + 'px', top: textPosition.y + 'px' }"
        >
          <input 
            v-model="textContent" 
            type="text" 
            placeholder="输入文字..."
            :style="{ fontSize: fontSize + 'px', color: brushColor }"
            @keyup.enter="addText"
            @keyup.escape="cancelText"
          />
          <div class="text-input-actions">
            <button @click="addText">确定</button>
            <button @click="cancelText">取消</button>
          </div>
        </div>
      </div>
      </div>
    </div>
    
    <!-- 底部操作栏 -->
    <div class="editor-actions">
      <div class="action-info">
        <span v-if="history.length > 0">步骤 {{ historyIndex + 1 }}/{{ history.length }}</span>
        <span class="zoom-info">
          <button class="zoom-btn" @click="zoomLevel = Math.max(minZoom, zoomLevel - 0.25)">−</button>
          <span class="zoom-value">{{ Math.round(zoomLevel * 100) }}%</span>
          <button class="zoom-btn" @click="zoomLevel = Math.min(maxZoom, zoomLevel + 0.25)">+</button>
          <button class="zoom-btn reset" @click="zoomLevel = 1" title="重置缩放">⟲</button>
        </span>
      </div>
      <div class="action-buttons">
        <button class="action-btn cancel" @click="cancel">
          取消
        </button>
        <button class="action-btn primary" @click="save">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 黑白灰主题 - 兼容画布深色/白昼模式 ==================== */

.native-editor-wrapper {
  display: flex;
  flex-direction: column;
  background: var(--canvas-bg-secondary, #141414);
  border-radius: var(--canvas-radius-lg, 16px);
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  height: 100%;
  max-height: 100%;
  box-sizing: border-box;
}

/* 工具栏 - 固定高度 */
.editor-toolbar {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  padding: 10px 16px;
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
  overflow-x: auto;
  flex-shrink: 0;
  box-sizing: border-box;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: max-content;
}

.toolbar-group {
  display: flex;
  gap: 3px;
}

.toolbar-divider {
  width: 1px;
  height: 36px;
  background: var(--canvas-border-default, #3a3a3a);
  margin: 0 6px;
  flex-shrink: 0;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--canvas-radius-sm, 6px);
  color: var(--canvas-text-secondary, #a0a0a0);
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 56px;
}

.tool-btn:hover:not(:disabled) {
  background: var(--canvas-bg-elevated, #242424);
  color: var(--canvas-text-primary, #ffffff);
}

.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tool-btn.active {
  background: var(--canvas-bg-elevated, #242424);
  border-color: var(--canvas-border-active, #4a4a4a);
  color: var(--canvas-text-primary, #ffffff);
  box-shadow: inset 0 0 0 1px var(--canvas-border-active, #4a4a4a);
}

.tool-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.3);
  color: var(--canvas-accent-error, #ef4444);
}

.tool-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-icon svg {
  width: 18px;
  height: 18px;
}

.tool-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

/* 子工具栏 - 固定高度，内容横向滚动，避免切换工具时布局跳动 */
.sub-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: var(--canvas-bg-primary, #0a0a0a);
  border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a);
  height: 46px;
  min-height: 46px;
  max-height: 46px;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
  /* 隐藏滚动条但保持滚动功能 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.sub-toolbar::-webkit-scrollbar {
  display: none;
}

.sub-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sub-control label {
  font-size: 12px;
  color: var(--canvas-text-tertiary, #666666);
  min-width: 40px;
}

.sub-control .value {
  font-size: 12px;
  color: var(--canvas-text-secondary, #a0a0a0);
  min-width: 50px;
}

.slider {
  width: 100px;
  accent-color: var(--canvas-text-secondary, #a0a0a0);
  height: 4px;
}

.color-presets {
  display: flex;
  gap: 3px;
}

.color-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.color-btn:hover {
  transform: scale(1.15);
}

.color-btn.active {
  border-color: var(--canvas-text-primary, #ffffff);
  box-shadow: 0 0 0 1px var(--canvas-border-default, #3a3a3a);
}

.color-picker {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.ratio-btns,
.shape-btns {
  display: flex;
  gap: 3px;
}

.ratio-btn,
.shape-btn {
  padding: 5px 10px;
  background: transparent;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: var(--canvas-radius-sm, 6px);
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.ratio-btn:hover,
.shape-btn:hover {
  background: var(--canvas-bg-elevated, #242424);
  color: var(--canvas-text-primary, #ffffff);
}

.ratio-btn.active,
.shape-btn.active {
  background: var(--canvas-bg-elevated, #242424);
  border-color: var(--canvas-text-secondary, #a0a0a0);
  color: var(--canvas-text-primary, #ffffff);
}

.sub-btn {
  padding: 6px 14px;
  border-radius: var(--canvas-radius-sm, 6px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  background: transparent;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  color: var(--canvas-text-secondary, #a0a0a0);
}

.sub-btn:hover {
  background: var(--canvas-bg-elevated, #242424);
  color: var(--canvas-text-primary, #ffffff);
}

.sub-btn.primary {
  background: var(--canvas-text-primary, #ffffff);
  border-color: transparent;
  color: var(--canvas-bg-primary, #0a0a0a);
}

.sub-btn.primary:hover {
  opacity: 0.9;
}

.mask-controls,
.annotate-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.annotate-hint {
  font-size: 12px;
  color: var(--canvas-text-tertiary, #666666);
  padding: 5px 10px;
  background: var(--canvas-bg-elevated, #242424);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: var(--canvas-radius-sm, 6px);
}

.next-label-preview {
  font-size: 12px;
  color: #3B82F6;
  font-weight: 600;
  padding: 5px 10px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--canvas-radius-sm, 6px);
}

.mask-hint,
.text-hint {
  font-size: 12px;
  color: var(--canvas-text-tertiary, #666666);
  padding: 5px 10px;
  background: var(--canvas-bg-elevated, #242424);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: var(--canvas-radius-sm, 6px);
}

.clear-mask-btn {
  font-size: 12px;
  padding: 5px 12px;
  background: transparent;
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
  border-radius: var(--canvas-radius-sm, 6px);
  color: var(--canvas-text-secondary, #999999);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-mask-btn:hover {
  background: var(--canvas-bg-elevated, #242424);
  color: var(--canvas-text-primary, #ffffff);
  border-color: var(--canvas-text-tertiary, #666666);
}

/* 无工具选中时占位 */
.sub-placeholder {
  font-size: 12px;
  color: var(--canvas-text-tertiary, #666666);
  white-space: nowrap;
}

/* 滤镜控制 */
.filter-controls {
  display: flex;
  gap: 14px;
  flex-shrink: 0;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.filter-item label {
  font-size: 12px;
  color: var(--canvas-text-tertiary, #666666);
  min-width: 28px;
  white-space: nowrap;
}

.filter-item input[type="range"] {
  width: 64px;
  accent-color: var(--canvas-text-secondary, #a0a0a0);
}

.filter-item span {
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666666);
  min-width: 38px;
  white-space: nowrap;
}

/* 画布区域 - 固定填充剩余空间，不受工具栏内容影响 */
.editor-canvas-container {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--canvas-bg-primary, #0a0a0a);
  position: relative;
  min-height: 0;
  overflow: auto;
  padding: 20px;
  box-sizing: border-box;
}

/* 缩放容器 - 保持正确的占用空间 */
.zoom-container {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.canvas-wrapper {
  position: relative;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  overflow: visible;
  transition: transform 0.1s ease;
}

/* 笔刷模式隐藏系统光标 */
.canvas-wrapper.brush-mode,
.canvas-wrapper.annotate-mode {
  cursor: none;
}

.canvas-wrapper.brush-mode .overlay-canvas,
.canvas-wrapper.annotate-mode .overlay-canvas {
  cursor: none;
}

/* 笔刷光标 */
.brush-cursor {
  position: absolute;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
  box-shadow: 
    0 0 0 1px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(0, 0, 0, 0.3);
  z-index: 100;
  transition: width 0.1s ease, height 0.1s ease;
}

/* 标注光标（蓝色发光小点） */
.annotate-cursor {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
  background: #3B82F6;
  box-shadow: 
    0 0 8px 4px rgba(59, 130, 246, 0.6),
    0 0 16px 8px rgba(59, 130, 246, 0.3),
    0 0 24px 12px rgba(59, 130, 246, 0.1);
  z-index: 100;
  animation: annotate-pulse 1.5s ease-in-out infinite;
}

@keyframes annotate-pulse {
  0%, 100% {
    box-shadow: 
      0 0 8px 4px rgba(59, 130, 246, 0.6),
      0 0 16px 8px rgba(59, 130, 246, 0.3),
      0 0 24px 12px rgba(59, 130, 246, 0.1);
  }
  50% {
    box-shadow: 
      0 0 12px 6px rgba(59, 130, 246, 0.8),
      0 0 24px 12px rgba(59, 130, 246, 0.4),
      0 0 36px 18px rgba(59, 130, 246, 0.2);
  }
}

.main-canvas,
.overlay-canvas,
.mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.main-canvas {
  background: var(--canvas-bg-tertiary, #1a1a1a);
}

.mask-canvas {
  /* 蒙版画布隐藏，仅用于存储蒙版数据 */
  visibility: hidden;
  pointer-events: none;
}

.overlay-canvas {
  pointer-events: auto;
}

/* 文字输入 */
.text-input-overlay {
  position: absolute;
  z-index: 10;
  background: var(--canvas-bg-elevated, #242424);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: var(--canvas-radius-sm, 6px);
  padding: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.text-input-overlay input {
  background: transparent;
  border: none;
  outline: none;
  min-width: 150px;
  font-family: inherit;
  color: inherit;
}

.text-input-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.text-input-actions button {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  background: transparent;
  color: var(--canvas-text-secondary, #a0a0a0);
  transition: all 0.15s;
}

.text-input-actions button:hover {
  background: var(--canvas-bg-elevated, #242424);
  color: var(--canvas-text-primary, #ffffff);
}

.text-input-actions button:first-child {
  background: var(--canvas-text-primary, #ffffff);
  border-color: transparent;
  color: var(--canvas-bg-primary, #0a0a0a);
}

/* 加载中 */
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--canvas-bg-primary, #0a0a0a);
  color: var(--canvas-text-secondary, #a0a0a0);
  z-index: 10;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 2px solid var(--canvas-border-default, #3a3a3a);
  border-top-color: var(--canvas-text-secondary, #a0a0a0);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 底部操作栏 - 固定高度 */
.editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border-top: 1px solid var(--canvas-border-subtle, #2a2a2a);
  flex-shrink: 0;
  box-sizing: border-box;
}

.action-info {
  font-size: 12px;
  color: var(--canvas-text-tertiary, #666666);
  display: flex;
  align-items: center;
  gap: 16px;
}

.zoom-info {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--canvas-bg-elevated, #242424);
  border-radius: var(--canvas-radius-sm, 6px);
  padding: 2px 4px;
}

.zoom-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--canvas-text-secondary, #999999);
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.15s ease;
}

.zoom-btn:hover {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  color: var(--canvas-text-primary, #ffffff);
}

.zoom-btn.reset {
  font-size: 12px;
}

.zoom-value {
  min-width: 40px;
  text-align: center;
  font-size: 11px;
  color: var(--canvas-text-secondary, #999999);
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: var(--canvas-radius-md, 10px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn.cancel {
  background: transparent;
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  color: var(--canvas-text-secondary, #a0a0a0);
}

.action-btn.cancel:hover {
  background: var(--canvas-bg-elevated, #242424);
  color: var(--canvas-text-primary, #ffffff);
}

.action-btn.primary {
  background: var(--canvas-text-primary, #ffffff);
  border: 1px solid transparent;
  color: var(--canvas-bg-primary, #0a0a0a);
}

.action-btn.primary:hover {
  opacity: 0.9;
}

.action-btn.primary svg {
  stroke: var(--canvas-bg-primary, #0a0a0a);
}
</style>
