<script setup>
/**
 * ImageCropper.vue - 图片裁剪/扩图组件
 * 
 * 功能特性:
 * - 预设比例裁剪: 16:9, 4:3, 3:2, 1:1, 2:3, 3:4, 9:16
 * - 自定义宽高裁剪
 * - 裁剪框可超出图片边界（扩图模式，白色填充）
 * - 裁剪框小于图片时为裁剪
 * - 拖拽调整裁剪区域
 * - 无缝全屏覆盖
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

const props = defineProps({
  imageUrl: {
    type: String,
    required: true
  },
  visible: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: 'crop' // 'crop' | 'outpaint'
  }
})

const emit = defineEmits(['save', 'cancel', 'outpaint'])

// 扩图模式状态
const isOutpainting = ref(false)

// 扩图分辨率选择
const outpaintResolution = ref('2K')
const resolutionOptions = [
  { value: '1K', label: '1K', points: 3 },
  { value: '2K', label: '2K', points: 4 },
  { value: '4K', label: '4K', points: 5 }
]

// 计算当前分辨率的积分消耗
const currentPoints = computed(() => {
  const option = resolutionOptions.find(o => o.value === outpaintResolution.value)
  return option ? option.points : 4
})

// 扩图比例预设（参考出图比例）
const outpaintRatioPresets = [
  { value: 'free', label: '自由' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '21:9', label: '21:9' }
]

// 扩图系统提示词（用户不可见）
const OUTPAINT_SYSTEM_PROMPT = `Role: You are a specialized AI Vision Architect. Your primary task is to perform context-aware outpainting on images that have been cropped or framed tightly. You must reconstruct the missing environment and subjects while maintaining absolute fidelity to the provided source.

Core Directives for Cropped Images:

Subject Reconstruction: Identify any partially visible subjects (people, limbs, objects, or architecture) at the edges. Use anatomical and geometric logic to complete them naturally as if they were never cropped.

Environmental Extrapolation: Analyze the perspective and vanishing points of the cropped image. Extend the background (landscapes, interior walls, horizons) while following the established spatial depth.

Edge Blending & Cohesion: Treat the boundaries of the cropped image as "fluid." Ensure the transition from the original pixels to the generated pixels is mathematically seamless in terms of color temperature, contrast, and sharpness.

Style Inheritance: Strictly mirror the technical characteristics of the cropped source:

Focal Length: Match the lens distortion (e.g., wide-angle vs. telephoto).

Lighting Logic: Maintain the direction, intensity, and color of the light source.

Texture/Grain: Match the ISO noise, film grain, or brushwork texture.`

// DOM 引用
const containerRef = ref(null)
const mainCanvasRef = ref(null)
const overlayCanvasRef = ref(null)

// 状态
const isLoading = ref(true)
const originalImage = new Image()
originalImage.crossOrigin = 'anonymous'

// 画布尺寸（整个可视区域）
const canvasWidth = ref(1200)
const canvasHeight = ref(800)

// 实际图片尺寸
const imageNaturalWidth = ref(0)
const imageNaturalHeight = ref(0)

// 图片在画布上的缩放比例和位置
const imageScale = ref(1)
const imageOffsetX = ref(0)
const imageOffsetY = ref(0)
const displayWidth = ref(0)
const displayHeight = ref(0)

// 裁剪状态
const cropRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const selectedRatio = ref('free')

// 自定义尺寸输入
const customWidth = ref(0)
const customHeight = ref(0)
const showCustomInput = ref(false)

// 拖拽状态（使用 ref 确保响应式）
const isDragging = ref(false)
const dragType = ref(null)  // 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'image-move'
let dragStartPos = { x: 0, y: 0 }
let dragStartRect = { x: 0, y: 0, width: 0, height: 0 }

// 扩图模式专用状态
// 图片在画布框内的位置（相对于画布框左上角）
const outpaintImageX = ref(0)
const outpaintImageY = ref(0)
// 图片缩放比例（1 = 原始大小适配画布框）
const outpaintImageScale = ref(1)
// 拖拽图片时的起始位置
let dragStartImagePos = { x: 0, y: 0 }

// 重置拖拽状态
function resetDragState() {
  isDragging.value = false
  dragType.value = null
  dragStartPos = { x: 0, y: 0 }
  dragStartRect = { x: 0, y: 0, width: 0, height: 0 }
  dragStartImagePos = { x: 0, y: 0 }
}

// 比例预设
const ratioPresets = [
  { value: 'free', label: '自由' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:4', label: '3:4' },
  { value: '9:16', label: '9:16' },
  { value: 'custom', label: '自定义' }
]

// 计算当前是裁剪还是扩图模式
const isExpanding = computed(() => {
  const imgLeft = imageOffsetX.value
  const imgTop = imageOffsetY.value
  const imgRight = imageOffsetX.value + displayWidth.value
  const imgBottom = imageOffsetY.value + displayHeight.value
  
  const cropLeft = cropRect.value.x
  const cropTop = cropRect.value.y
  const cropRight = cropRect.value.x + cropRect.value.width
  const cropBottom = cropRect.value.y + cropRect.value.height
  
  // 如果裁剪框任意边超出图片边界，则为扩图模式
  return cropLeft < imgLeft || cropTop < imgTop || cropRight > imgRight || cropBottom > imgBottom
})

// 计算实际输出尺寸
const outputSize = computed(() => {
  const scaleToOriginal = 1 / imageScale.value
  return {
    width: Math.round(cropRect.value.width * scaleToOriginal),
    height: Math.round(cropRect.value.height * scaleToOriginal)
  }
})

// 计算容器尺寸
function calculateCanvasSize() {
  if (!containerRef.value) return
  
  const padding = 60
  const maxWidth = window.innerWidth - padding * 2
  const maxHeight = window.innerHeight - 180
  
  canvasWidth.value = Math.min(maxWidth, 1400)
  canvasHeight.value = Math.min(maxHeight, 900)
}

// 加载图片
async function loadImage(url) {
  isLoading.value = true
  
  return new Promise((resolve, reject) => {
    originalImage.onload = () => {
      imageNaturalWidth.value = originalImage.naturalWidth
      imageNaturalHeight.value = originalImage.naturalHeight
      
      // 计算缩放比例，使图片适应画布（留出扩图空间）
      const maxDisplayRatio = 0.6 // 图片最多占画布60%
      const scaleX = (canvasWidth.value * maxDisplayRatio) / originalImage.naturalWidth
      const scaleY = (canvasHeight.value * maxDisplayRatio) / originalImage.naturalHeight
      imageScale.value = Math.min(scaleX, scaleY, 1)
      
      // 计算显示尺寸
      displayWidth.value = originalImage.naturalWidth * imageScale.value
      displayHeight.value = originalImage.naturalHeight * imageScale.value
      
      // 居中偏移
      imageOffsetX.value = (canvasWidth.value - displayWidth.value) / 2
      imageOffsetY.value = (canvasHeight.value - displayHeight.value) / 2
      
      // 初始化自定义尺寸为原图尺寸
      customWidth.value = originalImage.naturalWidth
      customHeight.value = originalImage.naturalHeight
      
      isLoading.value = false
      resolve()
    }
    originalImage.onerror = (err) => {
      isLoading.value = false
      reject(err)
    }
    originalImage.src = url
  })
}

// 绘制主画布
function drawMainCanvas() {
  const canvas = mainCanvasRef.value
  if (!canvas || !originalImage.complete) return
  
  // 如果还没有计算显示尺寸，不绘制
  if (displayWidth.value === 0 || displayHeight.value === 0) return
  
  const ctx = canvas.getContext('2d')
  
  // 清除画布，使用深色背景
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value)
  
  if (props.mode === 'outpaint') {
    // 扩图模式：先绘制白色画布框背景
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cropRect.value.x, cropRect.value.y, cropRect.value.width, cropRect.value.height)
    
    // 图片可以在画布框内移动和缩放
    const scaledWidth = displayWidth.value * outpaintImageScale.value
    const scaledHeight = displayHeight.value * outpaintImageScale.value
    
    // 计算图片在画布框内的位置（相对于画布框左上角）
    const frameX = cropRect.value.x
    const frameY = cropRect.value.y
    const frameCenterX = frameX + cropRect.value.width / 2
    const frameCenterY = frameY + cropRect.value.height / 2
    
    // 图片中心位置
    const imgCenterX = frameCenterX + outpaintImageX.value
    const imgCenterY = frameCenterY + outpaintImageY.value
    
    // 计算图片绘制位置（左上角）
    const imgX = imgCenterX - scaledWidth / 2
    const imgY = imgCenterY - scaledHeight / 2
    
    // 使用裁剪区域，只绘制画布框内的部分
    ctx.save()
    ctx.beginPath()
    ctx.rect(frameX, frameY, cropRect.value.width, cropRect.value.height)
    ctx.clip()
    
    // 绘制图片
    ctx.drawImage(
      originalImage,
      imgX,
      imgY,
      scaledWidth,
      scaledHeight
    )
    
    ctx.restore()
  } else {
    // 裁剪模式：图片固定居中
    ctx.drawImage(
      originalImage,
      imageOffsetX.value,
      imageOffsetY.value,
      displayWidth.value,
      displayHeight.value
    )
  }
}

// 初始化裁剪区域（默认覆盖整个图片）
function initCropRect() {
  if (props.mode === 'outpaint') {
    // 扩图模式：画布框固定在中央，图片可以在框内移动和缩放
    initOutpaintMode()
  } else {
    // 裁剪模式：裁剪框初始化为图片大小
    cropRect.value = {
      x: imageOffsetX.value,
      y: imageOffsetY.value,
      width: displayWidth.value,
      height: displayHeight.value
    }
  }
}

// 限制图片位置和缩放，确保图片不超出裁剪框
function constrainImageInFrame() {
  const scaledWidth = displayWidth.value * outpaintImageScale.value
  const scaledHeight = displayHeight.value * outpaintImageScale.value
  
  // 画布框的边界（相对于画布框中心）
  const frameHalfWidth = cropRect.value.width / 2
  const frameHalfHeight = cropRect.value.height / 2
  
  // 图片半宽高
  const imgHalfWidth = scaledWidth / 2
  const imgHalfHeight = scaledHeight / 2
  
  // 限制图片位置，确保图片不超出画布框
  // 如果图片大于画布框，允许移动，但限制在边界内
  // 如果图片小于等于画布框，允许移动，但限制在边界内
  let maxOffsetX, maxOffsetY
  
  if (scaledWidth > cropRect.value.width) {
    // 图片大于画布框，允许移动，但不能超出边界
    maxOffsetX = imgHalfWidth - frameHalfWidth
  } else {
    // 图片小于等于画布框，允许移动，但限制在边界内
    maxOffsetX = frameHalfWidth - imgHalfWidth
  }
  
  if (scaledHeight > cropRect.value.height) {
    // 图片大于画布框，允许移动，但不能超出边界
    maxOffsetY = imgHalfHeight - frameHalfHeight
  } else {
    // 图片小于等于画布框，允许移动，但限制在边界内
    maxOffsetY = frameHalfHeight - imgHalfHeight
  }
  
  // 确保 maxOffset 至少为 0（允许居中）
  maxOffsetX = Math.max(0, maxOffsetX)
  maxOffsetY = Math.max(0, maxOffsetY)
  
  outpaintImageX.value = Math.max(-maxOffsetX, Math.min(maxOffsetX, outpaintImageX.value))
  outpaintImageY.value = Math.max(-maxOffsetY, Math.min(maxOffsetY, outpaintImageY.value))
}

// 扩图模式初始化
function initOutpaintMode() {
  // 画布框固定在屏幕中央，大小为图片显示大小
  const frameWidth = displayWidth.value
  const frameHeight = displayHeight.value
  
  cropRect.value = {
    x: (canvasWidth.value - frameWidth) / 2,
    y: (canvasHeight.value - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight
  }
  
  // 图片初始位置在画布框中央
  outpaintImageX.value = 0
  outpaintImageY.value = 0
  outpaintImageScale.value = 1
  
  // 确保图片在框内
  constrainImageInFrame()
}

// 根据比例调整裁剪区域
function applyRatio(ratio) {
  selectedRatio.value = ratio
  showCustomInput.value = ratio === 'custom'
  
  if (ratio === 'free' || ratio === 'custom') return
  
  const [w, h] = ratio.split(':').map(Number)
  const targetRatio = w / h
  
  // 以图片中心为基准调整
  const centerX = canvasWidth.value / 2
  const centerY = canvasHeight.value / 2
  
  let newWidth, newHeight
  
  // 基于当前裁剪区域调整
  if (cropRect.value.width / cropRect.value.height > targetRatio) {
    newHeight = cropRect.value.height
    newWidth = newHeight * targetRatio
  } else {
    newWidth = cropRect.value.width
    newHeight = newWidth / targetRatio
  }
  
  // 确保尺寸不会太小
  const minSize = 100
  if (newWidth < minSize) {
    newWidth = minSize
    newHeight = newWidth / targetRatio
  }
  if (newHeight < minSize) {
    newHeight = minSize
    newWidth = newHeight * targetRatio
  }
  
  cropRect.value = {
    x: centerX - newWidth / 2,
    y: centerY - newHeight / 2,
    width: newWidth,
    height: newHeight
  }
  
  drawCropOverlay()
}

// 应用自定义尺寸
function applyCustomSize() {
  if (customWidth.value < 10 || customHeight.value < 10) return
  
  const scaleToDisplay = imageScale.value
  const newWidth = customWidth.value * scaleToDisplay
  const newHeight = customHeight.value * scaleToDisplay
  
  // 居中放置
  const centerX = canvasWidth.value / 2
  const centerY = canvasHeight.value / 2
  
  cropRect.value = {
    x: centerX - newWidth / 2,
    y: centerY - newHeight / 2,
    width: newWidth,
    height: newHeight
  }
  
  drawCropOverlay()
}

// 绘制裁剪遮罩
function drawCropOverlay() {
  const canvas = overlayCanvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value)
  
  const { x, y, width, height } = cropRect.value
  
  if (props.mode === 'outpaint') {
    // 扩图模式：绘制半透明遮罩（整个画布）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value)
    
    // 清除裁剪区域（画布框区域）
    ctx.clearRect(x, y, width, height)
    
    // 画布框背景已经是白色（在 drawMainCanvas 中绘制），这里不需要再填充
    // 只需要绘制边框和网格线
  } else {
    // 裁剪模式：原有逻辑
    // 绘制半透明遮罩（整个画布）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value)
    
    // 清除裁剪区域
    ctx.clearRect(x, y, width, height)
    
    // 在裁剪区域内，绘制超出图片部分的白色填充（预览扩图效果）
    const imgLeft = imageOffsetX.value
    const imgTop = imageOffsetY.value
    const imgRight = imageOffsetX.value + displayWidth.value
    const imgBottom = imageOffsetY.value + displayHeight.value
    
    ctx.fillStyle = '#ffffff'
    
    // 左侧扩展区域
    if (x < imgLeft) {
      ctx.fillRect(x, Math.max(y, imgTop), imgLeft - x, Math.min(y + height, imgBottom) - Math.max(y, imgTop))
    }
    // 右侧扩展区域
    if (x + width > imgRight) {
      ctx.fillRect(imgRight, Math.max(y, imgTop), x + width - imgRight, Math.min(y + height, imgBottom) - Math.max(y, imgTop))
    }
    // 上方扩展区域
    if (y < imgTop) {
      ctx.fillRect(x, y, width, imgTop - y)
    }
    // 下方扩展区域
    if (y + height > imgBottom) {
      ctx.fillRect(x, imgBottom, width, y + height - imgBottom)
    }
  }
  
  // 裁剪框边框
  ctx.strokeStyle = isExpanding.value ? '#10b981' : '#fff'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, width, height)
  
  // 三分法网格线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 1
  
  ctx.beginPath()
  ctx.moveTo(x + width / 3, y)
  ctx.lineTo(x + width / 3, y + height)
  ctx.moveTo(x + width * 2 / 3, y)
  ctx.lineTo(x + width * 2 / 3, y + height)
  ctx.moveTo(x, y + height / 3)
  ctx.lineTo(x + width, y + height / 3)
  ctx.moveTo(x, y + height * 2 / 3)
  ctx.lineTo(x + width, y + height * 2 / 3)
  ctx.stroke()
  
  // 角落控制点
  const cornerSize = 14
  ctx.fillStyle = '#fff'
  
  drawCornerHandle(ctx, x, y, cornerSize, 'nw')
  drawCornerHandle(ctx, x + width - cornerSize, y, cornerSize, 'ne')
  drawCornerHandle(ctx, x, y + height - cornerSize, cornerSize, 'sw')
  drawCornerHandle(ctx, x + width - cornerSize, y + height - cornerSize, cornerSize, 'se')
  
  // 边缘控制点
  const edgeSize = 6
  const edgeLen = 24
  ctx.fillStyle = '#fff'
  
  // 上边
  ctx.fillRect(x + width / 2 - edgeLen / 2, y - edgeSize / 2, edgeLen, edgeSize)
  // 下边
  ctx.fillRect(x + width / 2 - edgeLen / 2, y + height - edgeSize / 2, edgeLen, edgeSize)
  // 左边
  ctx.fillRect(x - edgeSize / 2, y + height / 2 - edgeLen / 2, edgeSize, edgeLen)
  // 右边
  ctx.fillRect(x + width - edgeSize / 2, y + height / 2 - edgeLen / 2, edgeSize, edgeLen)
  
  // 显示输出尺寸和模式
  const sizeText = `${outputSize.value.width} × ${outputSize.value.height}`
  const modeText = isExpanding.value ? '扩图' : '裁剪'
  
  ctx.font = '13px system-ui, sans-serif'
  const textWidth = Math.max(ctx.measureText(sizeText).width, ctx.measureText(modeText).width)
  
  // 尺寸标签背景
  const labelX = x + width / 2
  const labelY = y + height + 16
  
  ctx.fillStyle = isExpanding.value ? 'rgba(16, 185, 129, 0.9)' : 'rgba(0, 0, 0, 0.8)'
  ctx.beginPath()
  ctx.roundRect(labelX - textWidth / 2 - 16, labelY - 10, textWidth + 32, 44, 8)
  ctx.fill()
  
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(sizeText, labelX, labelY + 4)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillText(modeText, labelX, labelY + 22)
}

function drawCornerHandle(ctx, x, y, size, type) {
  const thickness = 4
  
  ctx.beginPath()
  switch (type) {
    case 'nw':
      ctx.rect(x, y, size, thickness)
      ctx.rect(x, y, thickness, size)
      break
    case 'ne':
      ctx.rect(x, y, size, thickness)
      ctx.rect(x + size - thickness, y, thickness, size)
      break
    case 'sw':
      ctx.rect(x, y + size - thickness, size, thickness)
      ctx.rect(x, y, thickness, size)
      break
    case 'se':
      ctx.rect(x, y + size - thickness, size, thickness)
      ctx.rect(x + size - thickness, y, thickness, size)
      break
  }
  ctx.fill()
}

// 检测点击位置对应的拖拽类型
function getDragType(x, y) {
  const { x: cx, y: cy, width: cw, height: ch } = cropRect.value
  const threshold = 20
  
  // 角落检测
  if (Math.abs(x - cx) < threshold && Math.abs(y - cy) < threshold) return 'nw'
  if (Math.abs(x - (cx + cw)) < threshold && Math.abs(y - cy) < threshold) return 'ne'
  if (Math.abs(x - cx) < threshold && Math.abs(y - (cy + ch)) < threshold) return 'sw'
  if (Math.abs(x - (cx + cw)) < threshold && Math.abs(y - (cy + ch)) < threshold) return 'se'
  
  // 边缘检测
  if (Math.abs(y - cy) < threshold && x > cx + threshold && x < cx + cw - threshold) return 'n'
  if (Math.abs(y - (cy + ch)) < threshold && x > cx + threshold && x < cx + cw - threshold) return 's'
  if (Math.abs(x - cx) < threshold && y > cy + threshold && y < cy + ch - threshold) return 'w'
  if (Math.abs(x - (cx + cw)) < threshold && y > cy + threshold && y < cy + ch - threshold) return 'e'
  
  // 内部移动
  if (x > cx && x < cx + cw && y > cy && y < cy + ch) return 'move'
  
  return null
}

// 获取鼠标相对于 canvas 的坐标
function getCanvasCoords(e) {
  const canvas = overlayCanvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  
  const rect = canvas.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

// 开始拖拽
function handleMouseDown(e) {
  const { x, y } = getCanvasCoords(e)
  
  if (props.mode === 'outpaint') {
    // 扩图模式：检查是否点击在画布框内（拖拽图片）
    if (isInsideCropRect(x, y)) {
      isDragging.value = true
      dragType.value = 'image-move'
      dragStartPos = { x, y }
      dragStartImagePos = { x: outpaintImageX.value, y: outpaintImageY.value }
    }
  } else {
    // 裁剪模式：原有逻辑
    const type = getDragType(x, y)
    if (type) {
      isDragging.value = true
      dragType.value = type
      dragStartPos = { x, y }
      dragStartRect = { ...cropRect.value }
    }
  }
}

// 检查点是否在画布框内
function isInsideCropRect(x, y) {
  return x >= cropRect.value.x && 
         x <= cropRect.value.x + cropRect.value.width &&
         y >= cropRect.value.y && 
         y <= cropRect.value.y + cropRect.value.height
}

// 拖拽中
function handleMouseMove(e) {
  const { x, y } = getCanvasCoords(e)
  
  if (props.mode === 'outpaint') {
    // 扩图模式
    // 更新光标
    if (isInsideCropRect(x, y)) {
      const canvas = overlayCanvasRef.value
      if (canvas) canvas.style.cursor = 'grab'
    } else {
      const canvas = overlayCanvasRef.value
      if (canvas) canvas.style.cursor = 'default'
    }
    
    if (!isDragging.value || dragType.value !== 'image-move') return
    
    // 拖拽图片
    const dx = x - dragStartPos.x
    const dy = y - dragStartPos.y
    
    outpaintImageX.value = dragStartImagePos.x + dx
    outpaintImageY.value = dragStartImagePos.y + dy
    
    // 限制图片在框内
    constrainImageInFrame()
    
    drawMainCanvas()
    drawCropOverlay()
    return
  }
  
  // 裁剪模式：原有逻辑
  const type = getDragType(x, y)
  updateCursor(type)
  
  if (!isDragging.value || !dragType.value) return
  
  const dx = x - dragStartPos.x
  const dy = y - dragStartPos.y
  
  const newRect = { ...dragStartRect }
  const minSize = 50
  const padding = 30 // 画布边距
  
  // 根据拖拽类型调整裁剪区域
  switch (dragType.value) {
    case 'move':
      newRect.x = dragStartRect.x + dx
      newRect.y = dragStartRect.y + dy
      break
    case 'nw':
      newRect.x = dragStartRect.x + dx
      newRect.y = dragStartRect.y + dy
      newRect.width = dragStartRect.width - dx
      newRect.height = dragStartRect.height - dy
      break
    case 'ne':
      newRect.y = dragStartRect.y + dy
      newRect.width = dragStartRect.width + dx
      newRect.height = dragStartRect.height - dy
      break
    case 'sw':
      newRect.x = dragStartRect.x + dx
      newRect.width = dragStartRect.width - dx
      newRect.height = dragStartRect.height + dy
      break
    case 'se':
      newRect.width = dragStartRect.width + dx
      newRect.height = dragStartRect.height + dy
      break
    case 'n':
      newRect.y = dragStartRect.y + dy
      newRect.height = dragStartRect.height - dy
      break
    case 's':
      newRect.height = dragStartRect.height + dy
      break
    case 'w':
      newRect.x = dragStartRect.x + dx
      newRect.width = dragStartRect.width - dx
      break
    case 'e':
      newRect.width = dragStartRect.width + dx
      break
  }
  
  // 应用比例约束
  if (selectedRatio.value !== 'free' && selectedRatio.value !== 'custom' && dragType.value !== 'move') {
    const [w, h] = selectedRatio.value.split(':').map(Number)
    const ratio = w / h
    
    if (['nw', 'ne', 'sw', 'se', 'e', 'w'].includes(dragType.value)) {
      newRect.height = newRect.width / ratio
    } else {
      newRect.width = newRect.height * ratio
    }
  }
  
  // 确保最小尺寸
  if (newRect.width < minSize || newRect.height < minSize) return
  
  // 限制在画布边界内
  newRect.x = Math.max(padding, Math.min(newRect.x, canvasWidth.value - newRect.width - padding))
  newRect.y = Math.max(padding, Math.min(newRect.y, canvasHeight.value - newRect.height - padding))
  
  // 确保裁剪框不会太大超出画布
  if (newRect.x + newRect.width > canvasWidth.value - padding) {
    newRect.width = canvasWidth.value - padding - newRect.x
  }
  if (newRect.y + newRect.height > canvasHeight.value - padding) {
    newRect.height = canvasHeight.value - padding - newRect.y
  }
  
  cropRect.value = newRect
  
  // 更新自定义尺寸输入
  customWidth.value = outputSize.value.width
  customHeight.value = outputSize.value.height
  
  drawCropOverlay()
}

// 滚轮缩放（扩图模式）
function handleWheel(e) {
  if (props.mode !== 'outpaint') return
  
  e.preventDefault()
  const delta = e.deltaY > 0 ? -1 : 1
  scaleOutpaintImage(delta)
}

// 结束拖拽
function handleMouseUp() {
  isDragging.value = false
  dragType.value = null
}

// 更新光标样式
function updateCursor(type) {
  const canvas = overlayCanvasRef.value
  if (!canvas) return
  
  const cursorMap = {
    'nw': 'nwse-resize',
    'se': 'nwse-resize',
    'ne': 'nesw-resize',
    'sw': 'nesw-resize',
    'n': 'ns-resize',
    's': 'ns-resize',
    'e': 'ew-resize',
    'w': 'ew-resize',
    'move': 'move'
  }
  
  canvas.style.cursor = cursorMap[type] || 'default'
}

// 应用裁剪/扩图
function applyCrop() {
  const scaleToOriginal = 1 / imageScale.value
  
  // 计算裁剪区域相对于原图的位置
  const cropX = (cropRect.value.x - imageOffsetX.value) * scaleToOriginal
  const cropY = (cropRect.value.y - imageOffsetY.value) * scaleToOriginal
  const cropW = cropRect.value.width * scaleToOriginal
  const cropH = cropRect.value.height * scaleToOriginal
  
  // 创建结果画布
  const resultCanvas = document.createElement('canvas')
  resultCanvas.width = Math.round(cropW)
  resultCanvas.height = Math.round(cropH)
  const resultCtx = resultCanvas.getContext('2d')
  
  // 先填充白色背景（用于扩图区域）
  resultCtx.fillStyle = '#ffffff'
  resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height)
  
  // 计算图片在结果画布中的位置
  const drawX = -cropX
  const drawY = -cropY
  
  // 绘制原图
  resultCtx.drawImage(
    originalImage,
    drawX,
    drawY,
    imageNaturalWidth.value,
    imageNaturalHeight.value
  )
  
  // 转换为 DataURL
  const dataUrl = resultCanvas.toDataURL('image/png')
  
  emit('save', {
    dataUrl,
    width: resultCanvas.width,
    height: resultCanvas.height,
    isExpanded: isExpanding.value
  })
}

// 生成扩图（调用AI生成API）
function generateOutpaint() {
  // 计算输出画布大小（基于画布框在原图尺度上的大小）
  // 画布框显示尺寸 / 图片显示尺寸 * 图片原始尺寸
  const scaleToOriginal = imageNaturalWidth.value / displayWidth.value
  
  const outputWidth = Math.round(cropRect.value.width * scaleToOriginal)
  const outputHeight = Math.round(cropRect.value.height * scaleToOriginal)
  
  // 创建结果画布
  const resultCanvas = document.createElement('canvas')
  resultCanvas.width = outputWidth
  resultCanvas.height = outputHeight
  const resultCtx = resultCanvas.getContext('2d')
  
  // 先填充白色背景（用于扩图区域）
  resultCtx.fillStyle = '#ffffff'
  resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height)
  
  // 计算图片在结果画布中的位置和大小
  // 图片缩放后的显示尺寸
  const scaledDisplayWidth = displayWidth.value * outpaintImageScale.value
  const scaledDisplayHeight = displayHeight.value * outpaintImageScale.value
  
  // 图片在画布框内的位置（相对于画布框中心的偏移）
  // 转换到输出画布坐标系
  const imgCenterOffsetX = outpaintImageX.value * scaleToOriginal
  const imgCenterOffsetY = outpaintImageY.value * scaleToOriginal
  
  // 图片在输出画布上的大小
  const imgDrawWidth = imageNaturalWidth.value * outpaintImageScale.value
  const imgDrawHeight = imageNaturalHeight.value * outpaintImageScale.value
  
  // 图片在输出画布上的位置（以输出画布中心为基准）
  const drawX = outputWidth / 2 - imgDrawWidth / 2 + imgCenterOffsetX
  const drawY = outputHeight / 2 - imgDrawHeight / 2 + imgCenterOffsetY
  
  // 绘制缩放后的原图
  resultCtx.drawImage(
    originalImage,
    drawX,
    drawY,
    imgDrawWidth,
    imgDrawHeight
  )
  
  // 转换为 DataURL
  const dataUrl = resultCanvas.toDataURL('image/png')
  
  // 发送扩图请求（包含系统提示词和尺寸参数）
  emit('outpaint', {
    dataUrl,
    width: resultCanvas.width,
    height: resultCanvas.height,
    originalWidth: imageNaturalWidth.value,
    originalHeight: imageNaturalHeight.value,
    systemPrompt: OUTPAINT_SYSTEM_PROMPT,
    size: outpaintResolution.value, // 用户选择的分辨率
    points: currentPoints.value // 扣除的积分
  })
}

// 应用扩图比例
function applyOutpaintRatio(ratio) {
  selectedRatio.value = ratio
  
  // 计算画布框大小（在可视区域内最大化）
  const padding = 60
  const maxWidth = canvasWidth.value - padding * 2
  const maxHeight = canvasHeight.value - padding * 2
  
  let frameWidth, frameHeight
  
  if (ratio === 'free') {
    // 自由模式：画布框使用原图显示尺寸
    frameWidth = displayWidth.value
    frameHeight = displayHeight.value
  } else {
    // 固定比例模式
    const [w, h] = ratio.split(':').map(Number)
    const targetRatio = w / h
    
    // 计算在可视区域内能放下的最大尺寸
    if (maxWidth / maxHeight > targetRatio) {
      frameHeight = maxHeight
      frameWidth = frameHeight * targetRatio
    } else {
      frameWidth = maxWidth
      frameHeight = frameWidth / targetRatio
    }
  }
  
  // 画布框居中放置
  cropRect.value = {
    x: (canvasWidth.value - frameWidth) / 2,
    y: (canvasHeight.value - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight
  }
  
  // 重置图片位置到画布框中央，并计算适合的缩放比例
  resetImagePosition()
  
  drawMainCanvas()
  drawCropOverlay()
}

// 重置图片位置到画布框中央
function resetImagePosition() {
  // 计算图片适配画布框的缩放比例
  const fitScaleX = cropRect.value.width / displayWidth.value
  const fitScaleY = cropRect.value.height / displayHeight.value
  // 使用较小的缩放比例确保图片完全在框内
  outpaintImageScale.value = Math.min(fitScaleX, fitScaleY, 1)
  
  // 图片居中
  outpaintImageX.value = 0
  outpaintImageY.value = 0
  
  // 确保图片在框内
  constrainImageInFrame()
}

// 缩放图片
function scaleOutpaintImage(delta) {
  const minScale = 0.1
  const maxScale = 3
  const step = 0.1
  
  let newScale = outpaintImageScale.value + delta * step
  newScale = Math.max(minScale, Math.min(maxScale, newScale))
  outpaintImageScale.value = newScale
  
  // 限制图片在框内
  constrainImageInFrame()
  
  drawMainCanvas()
  drawCropOverlay()
}

// 取消
function handleCancel() {
  emit('cancel')
}

// 重置裁剪区域
function resetCrop() {
  selectedRatio.value = 'free'
  showCustomInput.value = false
  initCropRect()
  customWidth.value = imageNaturalWidth.value
  customHeight.value = imageNaturalHeight.value
  drawCropOverlay()
}

// 键盘事件
function handleKeyDown(e) {
  if (!props.visible) return
  
  if (e.key === 'Escape') {
    handleCancel()
  } else if (e.key === 'Enter' && !showCustomInput.value) {
    applyCrop()
  }
}

// 初始化
async function init() {
  // 重置拖拽状态
  resetDragState()
  
  calculateCanvasSize()
  await loadImage(props.imageUrl)
  
  nextTick(() => {
    // 先初始化裁剪区域，再绘制
    initCropRect()
    drawMainCanvas()
    drawCropOverlay()
  })
}

// 监听可见性变化
watch(() => props.visible, async (visible) => {
  if (visible) {
    await init()
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', calculateCanvasSize)
    window.addEventListener('mouseup', handleMouseUp)
  } else {
    document.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('resize', calculateCanvasSize)
    window.removeEventListener('mouseup', handleMouseUp)
  }
}, { immediate: true })

// 监听图片URL变化
watch(() => props.imageUrl, async (newUrl) => {
  if (newUrl && props.visible) {
    await init()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', calculateCanvasSize)
  window.removeEventListener('mouseup', handleMouseUp)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cropper-fade">
      <div v-if="visible" class="image-cropper-overlay">
        <div class="cropper-container" ref="containerRef">
          <!-- 头部工具栏 -->
          <div class="cropper-header">
            <div class="header-left">
              <button class="close-btn" @click="handleCancel" title="取消 (ESC)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <span class="title">{{ mode === 'outpaint' ? '扩图' : '裁剪 / 扩图' }}</span>
            </div>
            
            <!-- 裁剪模式下显示比例选择 -->
            <div v-if="mode !== 'outpaint'" class="header-center">
              <!-- 比例选择 -->
              <div class="ratio-selector">
                <button
                  v-for="ratio in ratioPresets"
                  :key="ratio.value"
                  class="ratio-btn"
                  :class="{ active: selectedRatio === ratio.value }"
                  @click="applyRatio(ratio.value)"
                >
                  {{ ratio.label }}
                </button>
              </div>
              
              <!-- 自定义尺寸输入 -->
              <Transition name="custom-fade">
                <div v-if="showCustomInput" class="custom-size-input">
                  <input
                    type="number"
                    v-model.number="customWidth"
                    min="10"
                    max="8192"
                    placeholder="宽"
                    class="size-input"
                    @keyup.enter="applyCustomSize"
                  />
                  <span class="size-separator">×</span>
                  <input
                    type="number"
                    v-model.number="customHeight"
                    min="10"
                    max="8192"
                    placeholder="高"
                    class="size-input"
                    @keyup.enter="applyCustomSize"
                  />
                  <button class="apply-size-btn" @click="applyCustomSize">
                    应用
                  </button>
                </div>
              </Transition>
            </div>
            
            <!-- 扩图模式下显示比例选择 -->
            <div v-else class="header-center outpaint-mode">
              <div class="ratio-selector">
                <button
                  v-for="ratio in outpaintRatioPresets"
                  :key="ratio.value"
                  class="ratio-btn"
                  :class="{ active: selectedRatio === ratio.value }"
                  @click="applyOutpaintRatio(ratio.value)"
                >
                  {{ ratio.label }}
                </button>
              </div>
            </div>
            
            <div class="header-right">
              <button class="reset-btn" @click="resetCrop" title="重置">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3 3v5h5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                重置
              </button>
              <!-- 裁剪模式显示确认按钮 -->
              <button v-if="mode !== 'outpaint'" class="confirm-btn" @click="applyCrop" title="确认 (Enter)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                {{ isExpanding ? '确认扩图' : '确认裁剪' }}
              </button>
            </div>
          </div>
          
          <!-- 裁剪区域 -->
          <div class="cropper-content">
            <div v-if="isLoading" class="loading-overlay">
              <div class="loading-spinner"></div>
              <span>加载中...</span>
            </div>
            
            <div class="canvas-wrapper" :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }">
              <canvas
                ref="mainCanvasRef"
                :width="canvasWidth"
                :height="canvasHeight"
                class="main-canvas"
              />
              <canvas
                ref="overlayCanvasRef"
                :width="canvasWidth"
                :height="canvasHeight"
                class="overlay-canvas"
                @mousedown="handleMouseDown"
                @mousemove="handleMouseMove"
                @mouseup="handleMouseUp"
                @mouseleave="handleMouseUp"
                @wheel.prevent="handleWheel"
              />
            </div>
          </div>
          
          <!-- 底部提示 -->
          <div class="cropper-footer">
            <!-- 扩图模式显示控制面板 -->
            <div v-if="mode === 'outpaint'" class="outpaint-footer">
              <!-- 第一行：缩放控制和尺寸显示 -->
              <div class="outpaint-info-row">
                <!-- 图片缩放控制 -->
                <div class="scale-control">
                  <button class="scale-btn" @click="scaleOutpaintImage(-1)" title="缩小">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M5 12h14" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <div class="scale-slider-wrap">
                    <input 
                      type="range" 
                      class="scale-slider"
                      min="10" 
                      max="300" 
                      :value="Math.round(outpaintImageScale * 100)"
                      @input="outpaintImageScale = $event.target.value / 100; constrainImageInFrame(); drawMainCanvas(); drawCropOverlay()"
                    />
                    <span class="scale-value">{{ Math.round(outpaintImageScale * 100) }}%</span>
                  </div>
                  <button class="scale-btn" @click="scaleOutpaintImage(1)" title="放大">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
                
                <!-- 输出尺寸显示 -->
                <div class="size-display">
                  <span class="size-label">输出尺寸</span>
                  <span class="size-value">{{ outputSize.width }} × {{ outputSize.height }}</span>
                </div>
              </div>
              
              <!-- 第二行：分辨率选择和生成按钮 -->
              <div class="outpaint-controls">
                <!-- 分辨率选择 -->
                <div class="resolution-selector">
                  <button
                    v-for="option in resolutionOptions"
                    :key="option.value"
                    class="resolution-btn"
                    :class="{ active: outpaintResolution === option.value }"
                    @click="outpaintResolution = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
                
                <!-- 生成按钮 -->
                <button class="generate-outpaint-btn" @click="generateOutpaint">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.636 5.636l2.122 2.122m8.484 8.484l2.122 2.122M5.636 18.364l2.122-2.122m8.484-8.484l2.122-2.122" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  生成扩图
                  <span class="points-badge">-{{ currentPoints }} 积分</span>
                </button>
              </div>
              
              <span class="outpaint-tip">拖拽移动图片 · 滚轮缩放图片 · 超出画布部分由AI填充</span>
            </div>
            <!-- 裁剪模式显示模式指示器 -->
            <template v-else>
              <div class="mode-indicator" :class="{ expanding: isExpanding }">
                <span class="mode-dot"></span>
                <span>{{ isExpanding ? '扩图模式 - 超出原图部分将填充白色' : '裁剪模式' }}</span>
              </div>
              <span class="hint">拖拽边框调整区域 · 框超出图片即为扩图 · Enter 确认 · ESC 取消</span>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-cropper-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 10, 0.98);
  z-index: 100001;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cropper-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
}

.cropper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: rgba(30, 30, 30, 0.9);
  border-radius: 10px;
  margin-bottom: 12px;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.close-btn {
  width: 34px;
  height: 34px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.3);
}

.close-btn svg {
  width: 18px;
  height: 18px;
  color: #fff;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.header-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.ratio-selector {
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.4);
  padding: 3px;
  border-radius: 8px;
}

.ratio-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
  white-space: nowrap;
}

.ratio-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.ratio-btn.active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.custom-size-input {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 8px;
  border-radius: 8px;
}

.size-input {
  width: 70px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  text-align: center;
}

.size-input:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.6);
}

.size-input::-webkit-inner-spin-button,
.size-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.size-separator {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}

.apply-size-btn {
  padding: 6px 12px;
  border: none;
  background: rgba(99, 102, 241, 0.6);
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}

.apply-size-btn:hover {
  background: rgba(99, 102, 241, 0.8);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.reset-btn,
.confirm-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.reset-btn {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.reset-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}

.reset-btn svg,
.confirm-btn svg {
  width: 15px;
  height: 15px;
}

.confirm-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
}

.confirm-btn:hover {
  background: linear-gradient(135deg, #059669, #047857);
  transform: translateY(-1px);
}

.cropper-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.7);
  z-index: 10;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.canvas-wrapper {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
}

.main-canvas {
  display: block;
  background: #1a1a1a;
}

.overlay-canvas {
  position: absolute;
  top: 0;
  left: 0;
  cursor: default;
}

.cropper-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
}

.mode-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.mode-indicator.expanding {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.mode-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
}

.mode-indicator.expanding .mode-dot {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
}

.hint {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
}

/* 扩图模式样式 */
.outpaint-mode {
  flex-direction: column;
  gap: 4px;
}

.outpaint-hint {
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.generate-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  transition: all 0.2s;
  box-shadow: 0 2px 12px rgba(245, 158, 11, 0.3);
}

.generate-btn:hover {
  background: linear-gradient(135deg, #d97706, #b45309);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
}

.generate-btn svg {
  width: 16px;
  height: 16px;
}

/* 扩图底部信息 */
.outpaint-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.outpaint-info-row {
  display: flex;
  align-items: center;
  gap: 24px;
}

/* 缩放控制 */
.scale-control {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.scale-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.scale-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.scale-btn svg {
  width: 14px;
  height: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.scale-slider-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scale-slider {
  width: 100px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
}

.scale-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s;
}

.scale-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.scale-value {
  min-width: 45px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  text-align: center;
}

.size-display {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 20px;
}

.size-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.size-value {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.outpaint-tip {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
}

/* 扩图控制面板 */
.outpaint-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 8px 0;
}

/* 分辨率选择器 - 黑白灰风格 */
.resolution-selector {
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.06);
  padding: 3px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.resolution-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}

.resolution-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.resolution-btn.active {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

/* 生成扩图按钮 - 黑白灰风格 */
.generate-outpaint-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  background: linear-gradient(135deg, #3a3a3a, #2a2a2a);
  color: #fff;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.generate-outpaint-btn:hover {
  background: linear-gradient(135deg, #4a4a4a, #3a3a3a);
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.25);
}

.generate-outpaint-btn svg {
  width: 16px;
  height: 16px;
  opacity: 0.9;
}

.points-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  margin-left: 4px;
}

/* 过渡动画 */
.cropper-fade-enter-active,
.cropper-fade-leave-active {
  transition: all 0.25s ease;
}

.cropper-fade-enter-from,
.cropper-fade-leave-to {
  opacity: 0;
}

.custom-fade-enter-active,
.custom-fade-leave-active {
  transition: all 0.2s ease;
}

.custom-fade-enter-from,
.custom-fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
</style>
