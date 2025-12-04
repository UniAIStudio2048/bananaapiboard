<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { 
  drawPinMarker, 
  isNearMarker, 
  findNearestMarker,
  indexToLabel, 
  getCanvasCoordinates,
  generateAnnotatedImage 
} from '@/utils/imageAnnotation'

const props = defineProps({
  image: {
    type: [String, File, Blob],
    default: null
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:markers', 'annotated-image'])

// 状态
const canvasRef = ref(null)
const containerRef = ref(null)
const imageElement = ref(null)
const markers = ref([])
const isCtrlPressed = ref(false)
const hoveredMarkerIndex = ref(-1)
const imageLoaded = ref(false)
const isTouchDevice = ref(false)
const longPressTimer = ref(null)
const longPressActive = ref(false)
const longPressStartCoords = ref(null)

// 计算属性
const hasMarkers = computed(() => markers.value.length > 0)
const canAddMore = computed(() => markers.value.length < 26)

// 加载图片
async function loadImage() {
  if (!props.image) {
    clearCanvas()
    return
  }
  
  imageLoaded.value = false
  
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    // 处理不同类型的图片输入
    if (typeof props.image === 'string') {
      img.src = props.image
    } else if (props.image instanceof File || props.image instanceof Blob) {
      img.src = URL.createObjectURL(props.image)
    }
    
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })
    
    imageElement.value = img
    imageLoaded.value = true
    
    await nextTick()
    resizeCanvas()
    // 重绘时包含已有的标记
    redraw()
  } catch (error) {
    console.error('Failed to load image:', error)
    imageLoaded.value = false
  }
}

// 调整 Canvas 尺寸
function resizeCanvas() {
  if (!canvasRef.value || !imageElement.value || !containerRef.value) return
  
  const container = containerRef.value
  const img = imageElement.value
  const canvas = canvasRef.value
  
  // 计算适配容器的尺寸
  const containerWidth = container.clientWidth
  const containerHeight = Math.min(container.clientHeight, 600)
  
  const imgRatio = img.naturalWidth / img.naturalHeight
  const containerRatio = containerWidth / containerHeight
  
  let displayWidth, displayHeight
  
  if (imgRatio > containerRatio) {
    displayWidth = containerWidth
    displayHeight = containerWidth / imgRatio
  } else {
    displayHeight = containerHeight
    displayWidth = containerHeight * imgRatio
  }
  
  canvas.width = displayWidth
  canvas.height = displayHeight
  canvas.style.width = `${displayWidth}px`
  canvas.style.height = `${displayHeight}px`
}

// 重绘 Canvas
function redraw() {
  if (!canvasRef.value || !imageElement.value) return
  
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  
  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // 绘制图片
  ctx.drawImage(imageElement.value, 0, 0, canvas.width, canvas.height)
  
  // 绘制所有标记
  markers.value.forEach((marker, index) => {
    const isHovered = index === hoveredMarkerIndex.value
    drawPinMarker(ctx, marker.x, marker.y, marker.label, isHovered)
  })
}

// 添加标记
function addMarker(x, y) {
  if (!canAddMore.value || props.disabled) return
  
  const label = indexToLabel(markers.value.length)
  markers.value.push({ x, y, label })
  emit('update:markers', markers.value)
  redraw()
  generateAndEmitAnnotatedImage()
}

// 删除标记
function removeMarker(x, y) {
  if (props.disabled) return
  
  const index = markers.value.findIndex(marker => 
    isNearMarker(x, y, marker.x, marker.y)
  )
  
  if (index !== -1) {
    markers.value.splice(index, 1)
    // 重新分配标签
    markers.value.forEach((marker, idx) => {
      marker.label = indexToLabel(idx)
    })
    emit('update:markers', markers.value)
    redraw()
    generateAndEmitAnnotatedImage()
  }
}

// 查找悬停的标记
function findHoveredMarker(x, y) {
  return markers.value.findIndex(marker => 
    isNearMarker(x, y, marker.x, marker.y)
  )
}

// 生成标注后的图片
async function generateAndEmitAnnotatedImage() {
  if (!imageElement.value || markers.value.length === 0) {
    emit('annotated-image', null)
    return
  }
  
  try {
    // 传递 Canvas 的内部尺寸，用于坐标转换
    const canvasSize = canvasRef.value ? {
      width: canvasRef.value.width,
      height: canvasRef.value.height
    } : null
    
    console.log('[ImageAnnotator] 生成标注图片，Canvas 尺寸:', canvasSize)
    
    const blob = await generateAnnotatedImage(
      imageElement.value, 
      markers.value, 
      'blob', 
      0.85, 
      canvasSize
    )
    emit('annotated-image', blob)
  } catch (error) {
    console.error('Failed to generate annotated image:', error)
  }
}

// 清空画布
function clearCanvas() {
  if (!canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d')
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  imageLoaded.value = false
}

// 清空所有标记
function clearMarkers() {
  markers.value = []
  emit('update:markers', markers.value)
  emit('annotated-image', null)
  redraw()
}

// 鼠标/触摸事件处理
function handlePointerDown(e) {
  if (props.disabled || !imageLoaded.value) return
  
  const coords = getCanvasCoordinates(e, canvasRef.value)
  
  // 触摸设备：长按添加/删除标记
  if (e.type === 'touchstart') {
    longPressStartCoords.value = coords
    longPressTimer.value = setTimeout(() => {
      longPressActive.value = true
      
      // 移动端使用更大的检测阈值（50像素），方便手指操作
      const nearestIndex = findNearestMarker(coords.x, coords.y, markers.value, 50)
      
      if (nearestIndex !== -1) {
        // 在已有标记附近长按：删除标记
        console.log('[ImageAnnotator] 移动端长按删除标记:', markers.value[nearestIndex].label)
        markers.value.splice(nearestIndex, 1)
        // 重新分配标签
        markers.value.forEach((marker, idx) => {
          marker.label = indexToLabel(idx)
        })
        emit('update:markers', markers.value)
        redraw()
        generateAndEmitAnnotatedImage()
        
        // 删除反馈：长振动
        if (navigator.vibrate) {
          navigator.vibrate([30, 20, 30])
        }
      } else {
        // 空白区域长按：添加标记
        if (canAddMore.value) {
          console.log('[ImageAnnotator] 移动端长按添加标记')
          addMarker(coords.x, coords.y)
          
          // 添加反馈：短振动
          if (navigator.vibrate) {
            navigator.vibrate(50)
          }
        }
      }
    }, 500)
    return
  }
  
  // 鼠标设备
  if (e.button === 0 && isCtrlPressed.value) {
    // Ctrl + 左键：添加标记
    e.preventDefault()
    addMarker(coords.x, coords.y)
  } else if (e.button === 2) {
    // 右键：删除标记
    e.preventDefault()
    removeMarker(coords.x, coords.y)
  }
}

function handlePointerMove(e) {
  if (!imageLoaded.value) return
  
  const coords = getCanvasCoordinates(e, canvasRef.value)
  const newHoveredIndex = findHoveredMarker(coords.x, coords.y)
  
  if (newHoveredIndex !== hoveredMarkerIndex.value) {
    hoveredMarkerIndex.value = newHoveredIndex
    redraw()
    
    // 更新鼠标样式
    if (canvasRef.value) {
      canvasRef.value.style.cursor = newHoveredIndex !== -1 ? 'pointer' : 'crosshair'
    }
  }
}

function handlePointerUp(e) {
  // 取消长按
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
  
  longPressActive.value = false
  longPressStartCoords.value = null
}

function handleContextMenu(e) {
  e.preventDefault()
}

// 键盘事件
function handleKeyDown(e) {
  if (e.key === 'Control' || e.key === 'Meta') {
    isCtrlPressed.value = true
  }
}

function handleKeyUp(e) {
  if (e.key === 'Control' || e.key === 'Meta') {
    isCtrlPressed.value = false
  }
}

// 窗口调整
function handleResize() {
  if (imageLoaded.value) {
    resizeCanvas()
    redraw()
  }
}

// 检测触摸设备
function detectTouchDevice() {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

// 生命周期
onMounted(() => {
  detectTouchDevice()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('resize', handleResize)
  
  if (props.image) {
    loadImage()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('resize', handleResize)
  
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
  }
})

// 监听图片变化
watch(() => props.image, async () => {
  // 不清空标记，保留当前标记
  await loadImage()
  // 图片加载完成后重新绘制标记
  if (markers.value.length > 0) {
    await nextTick()
    redraw()
  }
})

// 提供方法供外部设置标记
function setMarkers(newMarkers) {
  console.log('[ImageAnnotator] setMarkers 被调用，标记数量:', newMarkers.length)
  markers.value = newMarkers.map(m => ({ ...m }))
  
  // 如果图片已加载，立即重绘
  if (imageLoaded.value && imageElement.value) {
    console.log('[ImageAnnotator] 图片已加载，立即重绘')
    redraw()
  } else {
    console.log('[ImageAnnotator] 图片未加载，等待加载完成')
    // 等待图片加载完成
    const checkInterval = setInterval(() => {
      if (imageLoaded.value && imageElement.value) {
        console.log('[ImageAnnotator] 图片加载完成，现在重绘')
        clearInterval(checkInterval)
        redraw()
      }
    }, 50)
    
    // 最多等待 2 秒
    setTimeout(() => {
      clearInterval(checkInterval)
    }, 2000)
  }
}

// 暴露方法
defineExpose({
  clearMarkers,
  setMarkers,
  getMarkers: () => markers.value,
  generateAnnotatedImage: () => generateAndEmitAnnotatedImage()
})
</script>

<template>
  <div class="image-annotator" ref="containerRef">
    <!-- Canvas 画布 -->
    <div class="canvas-wrapper">
      <canvas
        ref="canvasRef"
        class="annotation-canvas"
        :class="{ 
          'cursor-crosshair': imageLoaded && !disabled,
          'cursor-not-allowed': disabled 
        }"
        @mousedown="handlePointerDown"
        @mousemove="handlePointerMove"
        @mouseup="handlePointerUp"
        @touchstart.prevent="handlePointerDown"
        @touchmove.prevent="handlePointerMove"
        @touchend.prevent="handlePointerUp"
        @contextmenu="handleContextMenu"
      ></canvas>
      
      <!-- 空状态提示 -->
      <div v-if="!imageLoaded" class="empty-state">
        <div class="empty-icon">🖼️</div>
        <p class="empty-text">请先上传参考图片</p>
      </div>
    </div>
    
    <!-- 操作提示 -->
    <div v-if="imageLoaded" class="annotation-hints">
      <div class="hint-row">
        <div class="hint-item" v-if="!isTouchDevice">
          <span class="hint-icon">⌨️</span>
          <span class="hint-text">Ctrl + 点击添加标记</span>
        </div>
        <div class="hint-item" v-if="!isTouchDevice">
          <span class="hint-icon">🖱️</span>
          <span class="hint-text">右键删除标记</span>
        </div>
        <div class="hint-item" v-if="isTouchDevice">
          <span class="hint-icon">👆</span>
          <span class="hint-text">长按空白添加标记</span>
        </div>
        <div class="hint-item" v-if="isTouchDevice">
          <span class="hint-icon">🔄</span>
          <span class="hint-text">长按标记删除</span>
        </div>
        <div class="hint-item">
          <span class="hint-badge">{{ markers.length }}/26</span>
          <span class="hint-text">已标记</span>
        </div>
      </div>
      
      <!-- 清空按钮 -->
      <button
        v-if="hasMarkers"
        @click="clearMarkers"
        class="clear-btn"
        :disabled="disabled"
      >
        <span>🗑️</span>
        <span>清空标记</span>
      </button>
    </div>
    
    <!-- 标记列表 -->
    <div v-if="hasMarkers" class="markers-list">
      <div class="markers-header">
        <span class="markers-title">📍 标记列表</span>
      </div>
      <div class="markers-items">
        <div
          v-for="marker in markers"
          :key="marker.label"
          class="marker-item"
        >
          <div class="marker-pin">{{ marker.label }}</div>
          <span class="marker-label">{{ marker.label }}位置</span>
          <span class="marker-coords">({{ Math.round(marker.x) }}, {{ Math.round(marker.y) }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.image-annotator {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  min-height: 300px;
  max-height: 600px;
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.dark .canvas-wrapper {
  background: #0f172a;
  border-color: #334155;
}

.annotation-canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  touch-action: none;
  user-select: none;
}

.cursor-crosshair {
  cursor: crosshair;
}

.cursor-not-allowed {
  cursor: not-allowed;
  opacity: 0.6;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-text {
  color: #64748b;
  font-size: 14px;
}

.dark .empty-text {
  color: #94a3b8;
}

.annotation-hints {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #f1f5f9;
  border-radius: 10px;
}

.dark .annotation-hints {
  background: #1e293b;
}

.hint-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.dark .hint-item {
  color: #94a3b8;
}

.hint-icon {
  font-size: 16px;
}

.hint-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: 2px 8px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  font-weight: bold;
  font-size: 12px;
  border-radius: 6px;
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover:not(:disabled) {
  background: #dc2626;
  transform: translateY(-1px);
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.markers-list {
  padding: 16px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.dark .markers-list {
  background: #1e293b;
  border-color: #334155;
}

.markers-header {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}

.dark .markers-header {
  border-bottom-color: #334155;
}

.markers-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.dark .markers-title {
  color: #f1f5f9;
}

.markers-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.marker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 13px;
}

.dark .marker-item {
  background: #0f172a;
}

.marker-pin {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  font-weight: bold;
  font-size: 12px;
  border-radius: 6px;
  flex-shrink: 0;
}

.marker-label {
  font-weight: 500;
  color: #1e293b;
}

.dark .marker-label {
  color: #f1f5f9;
}

.marker-coords {
  color: #64748b;
  font-size: 11px;
}

.dark .marker-coords {
  color: #94a3b8;
}

/* 移动端适配 */
@media (max-width: 640px) {
  .canvas-wrapper {
    min-height: 200px;
    max-height: 400px;
  }
  
  .annotation-hints {
    flex-direction: column;
    align-items: stretch;
  }
  
  .hint-row {
    flex-direction: column;
    gap: 8px;
  }
  
  .clear-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>

