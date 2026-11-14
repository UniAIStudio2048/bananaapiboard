<script setup>
import { t as translateUi } from '@/i18n'

/**
 * CropOverlay.vue - 原生裁剪编辑器
 * 
 * 使用原生 Canvas + CSS 实现（无需第三方库）
 * 支持：
 * - 自由裁剪
 * - 预设比例
 * - 拖拽调整
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

const props = defineProps({
  imageUrl: {
    type: String,
    required: true
  },
  width: {
    type: Number,
    default: 800
  },
  height: {
    type: Number,
    default: 600
  }
})

const emit = defineEmits(['save', 'cancel'])

// 图片引用
const imageRef = ref(null)
const containerRef = ref(null)
const imageLoaded = ref(false)

// 图片信息
const imageInfo = ref({
  naturalWidth: 0,
  naturalHeight: 0,
  displayWidth: 0,
  displayHeight: 0,
  offsetX: 0,
  offsetY: 0
})

// 裁剪框状态
const cropBox = ref({
  x: 50,
  y: 50,
  width: 200,
  height: 200
})

// 拖拽状态
const isDragging = ref(false)
const isResizing = ref(false)
const resizeHandle = ref('')
const dragStart = ref({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 })

// 选择的比例
const selectedRatio = ref(null)

// 预设比例
const aspectRatios = [
  { value: null, get label() { return translateUi('uiMessages.md1047eed5dd5') } },
  { value: 1, label: '1:1' },
  { value: 16/9, label: '16:9' },
  { value: 9/16, label: '9:16' },
  { value: 4/3, label: '4:3' },
  { value: 3/4, label: '3:4' }
]

// 图片加载完成
function onImageLoad() {
  if (!imageRef.value) return
  
  const img = imageRef.value
  const containerW = props.width - 40
  const containerH = props.height - 140
  
  const scaleX = containerW / img.naturalWidth
  const scaleY = containerH / img.naturalHeight
  const scale = Math.min(scaleX, scaleY, 1)
  
  const displayW = img.naturalWidth * scale
  const displayH = img.naturalHeight * scale
  const offsetX = (containerW - displayW) / 2 + 20
  const offsetY = (containerH - displayH) / 2 + 20
  
  imageInfo.value = {
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    displayWidth: displayW,
    displayHeight: displayH,
    offsetX,
    offsetY,
    scale
  }
  
  // 初始化裁剪框为图片中心 80%
  cropBox.value = {
    x: offsetX + displayW * 0.1,
    y: offsetY + displayH * 0.1,
    width: displayW * 0.8,
    height: displayH * 0.8
  }
  
  imageLoaded.value = true
}

// 设置比例
function setAspectRatio(ratio) {
  selectedRatio.value = ratio
  
  if (ratio && imageLoaded.value) {
    const { displayWidth, displayHeight, offsetX, offsetY } = imageInfo.value
    
    // 根据比例调整裁剪框
    let newWidth, newHeight
    if (ratio > displayWidth / displayHeight) {
      newWidth = displayWidth * 0.8
      newHeight = newWidth / ratio
    } else {
      newHeight = displayHeight * 0.8
      newWidth = newHeight * ratio
    }
    
    cropBox.value = {
      x: offsetX + (displayWidth - newWidth) / 2,
      y: offsetY + (displayHeight - newHeight) / 2,
      width: newWidth,
      height: newHeight
    }
  }
}

// 开始拖拽裁剪框
function startDrag(e) {
  isDragging.value = true
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    cropX: cropBox.value.x,
    cropY: cropBox.value.y,
    cropW: cropBox.value.width,
    cropH: cropBox.value.height
  }
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

// 拖拽中
function onDrag(e) {
  if (!isDragging.value && !isResizing.value) return
  
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  const { displayWidth, displayHeight, offsetX, offsetY } = imageInfo.value
  
  if (isDragging.value) {
    // 移动裁剪框
    let newX = dragStart.value.cropX + dx
    let newY = dragStart.value.cropY + dy
    
    // 边界限制
    newX = Math.max(offsetX, Math.min(newX, offsetX + displayWidth - cropBox.value.width))
    newY = Math.max(offsetY, Math.min(newY, offsetY + displayHeight - cropBox.value.height))
    
    cropBox.value.x = newX
    cropBox.value.y = newY
  } else if (isResizing.value) {
    // 调整大小
    resizeCropBox(dx, dy)
  }
}

// 调整裁剪框大小
function resizeCropBox(dx, dy) {
  const { displayWidth, displayHeight, offsetX, offsetY } = imageInfo.value
  const handle = resizeHandle.value
  const ratio = selectedRatio.value
  
  let { x, y, width, height } = { ...cropBox.value }
  const startX = dragStart.value.cropX
  const startY = dragStart.value.cropY
  const startW = dragStart.value.cropW
  const startH = dragStart.value.cropH
  
  // 根据手柄调整
  if (handle.includes('e')) {
    width = Math.max(50, Math.min(startW + dx, offsetX + displayWidth - startX))
  }
  if (handle.includes('w')) {
    const newX = Math.max(offsetX, startX + dx)
    width = startW - (newX - startX)
    if (width >= 50) x = newX
    else width = 50
  }
  if (handle.includes('s')) {
    height = Math.max(50, Math.min(startH + dy, offsetY + displayHeight - startY))
  }
  if (handle.includes('n')) {
    const newY = Math.max(offsetY, startY + dy)
    height = startH - (newY - startY)
    if (height >= 50) y = newY
    else height = 50
  }
  
  // 保持比例
  if (ratio) {
    if (handle.includes('e') || handle.includes('w')) {
      height = width / ratio
    } else {
      width = height * ratio
    }
  }
  
  cropBox.value = { x, y, width, height }
}

// 停止拖拽
function stopDrag() {
  isDragging.value = false
  isResizing.value = false
  resizeHandle.value = ''
  
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 开始调整大小
function startResize(handle, e) {
  e.stopPropagation()
  isResizing.value = true
  resizeHandle.value = handle
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    cropX: cropBox.value.x,
    cropY: cropBox.value.y,
    cropW: cropBox.value.width,
    cropH: cropBox.value.height
  }
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

// 获取裁剪结果
function getCropResult() {
  if (!imageRef.value || !imageLoaded.value) return null
  
  const { scale, offsetX, offsetY } = imageInfo.value
  const { x, y, width, height } = cropBox.value
  
  // 转换为原图坐标
  const srcX = (x - offsetX) / scale
  const srcY = (y - offsetY) / scale
  const srcW = width / scale
  const srcH = height / scale
  
  // 创建裁剪画布
  const canvas = document.createElement('canvas')
  canvas.width = srcW
  canvas.height = srcH
  const ctx = canvas.getContext('2d')
  
  ctx.drawImage(
    imageRef.value,
    srcX, srcY, srcW, srcH,
    0, 0, srcW, srcH
  )
  
  return canvas.toDataURL('image/png')
}

// 保存
function handleSave() {
  const croppedImage = getCropResult()
  if (croppedImage) {
    emit('save', { image: croppedImage })
  }
}

// 取消
function handleCancel() {
  emit('cancel')
}

// 重置
function reset() {
  selectedRatio.value = null
  if (imageLoaded.value) {
    const { displayWidth, displayHeight, offsetX, offsetY } = imageInfo.value
    cropBox.value = {
      x: offsetX + displayWidth * 0.1,
      y: offsetY + displayHeight * 0.1,
      width: displayWidth * 0.8,
      height: displayHeight * 0.8
    }
  }
}

onMounted(() => {
  nextTick(() => {
    if (imageRef.value && imageRef.value.complete) {
      onImageLoad()
    }
  })
})

defineExpose({
  getCropResult,
  reset
})
</script>

<template>
  <div class="crop-overlay">
    <!-- 裁剪区域 -->
    <div 
      ref="containerRef" 
      class="cropper-container"
      :style="{ width: `${width}px`, height: `${height - 120}px` }"
    >
      <!-- 背景图片（暗色） -->
      <img
        ref="imageRef"
        :src="imageUrl"
        class="crop-image-bg"
        :style="{
          width: `${imageInfo.displayWidth}px`,
          height: `${imageInfo.displayHeight}px`,
          left: `${imageInfo.offsetX}px`,
          top: `${imageInfo.offsetY}px`
        }"
        @load="onImageLoad"
        crossorigin="anonymous"
      />
      
      <!-- 裁剪框 -->
      <div
        v-if="imageLoaded"
        class="crop-box"
        :style="{
          left: `${cropBox.x}px`,
          top: `${cropBox.y}px`,
          width: `${cropBox.width}px`,
          height: `${cropBox.height}px`
        }"
        @mousedown="startDrag"
      >
        <!-- 裁剪区域的图片（正常亮度） -->
        <img
          :src="imageUrl"
          class="crop-image-visible"
          :style="{
            width: `${imageInfo.displayWidth}px`,
            height: `${imageInfo.displayHeight}px`,
            left: `${imageInfo.offsetX - cropBox.x}px`,
            top: `${imageInfo.offsetY - cropBox.y}px`
          }"
          crossorigin="anonymous"
        />
        
        <!-- 调整手柄 -->
        <div class="resize-handle nw" @mousedown="startResize('nw', $event)"></div>
        <div class="resize-handle ne" @mousedown="startResize('ne', $event)"></div>
        <div class="resize-handle sw" @mousedown="startResize('sw', $event)"></div>
        <div class="resize-handle se" @mousedown="startResize('se', $event)"></div>
        <div class="resize-handle n" @mousedown="startResize('n', $event)"></div>
        <div class="resize-handle s" @mousedown="startResize('s', $event)"></div>
        <div class="resize-handle w" @mousedown="startResize('w', $event)"></div>
        <div class="resize-handle e" @mousedown="startResize('e', $event)"></div>
        
        <!-- 网格线 -->
        <div class="crop-grid">
          <div class="grid-line h1"></div>
          <div class="grid-line h2"></div>
          <div class="grid-line v1"></div>
          <div class="grid-line v2"></div>
        </div>
      </div>
    </div>
    
    <!-- 工具栏 -->
    <div class="crop-toolbar">
      <!-- 比例选择 -->
      <div class="toolbar-section">
        <span class="toolbar-label">{{ translateUi('directorStudio.inspector.aspect') }}</span>
        <div class="ratio-options">
          <button
            v-for="ratio in aspectRatios"
            :key="ratio.label"
            class="ratio-btn"
            :class="{ active: selectedRatio === ratio.value }"
            @click="setAspectRatio(ratio.value)"
          >
            {{ ratio.label }}
          </button>
        </div>
      </div>
      
      <div class="toolbar-divider"></div>
      
      <button class="tool-btn" :title="translateUi('common.reset')" @click="reset">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
      </button>
      
      <div class="toolbar-spacer"></div>
      
      <!-- 操作按钮 -->
      <div class="toolbar-section">
        <button class="action-btn cancel" @click="handleCancel">{{ translateUi('common.cancel') }}</button>
        <button class="action-btn confirm" @click="handleSave">{{ translateUi('uiMessages.m7fed57c4aafd') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.crop-overlay {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
}

.cropper-container {
  flex: 1;
  position: relative;
  background: #0d0d0d;
  overflow: hidden;
}

/* 背景图片（暗色） */
.crop-image-bg {
  position: absolute;
  opacity: 0.3;
  pointer-events: none;
}

/* 裁剪框 */
.crop-box {
  position: absolute;
  border: 2px solid #3b82f6;
  cursor: move;
  overflow: hidden;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
}

/* 裁剪区域的图片 */
.crop-image-visible {
  position: absolute;
  pointer-events: none;
}

/* 调整手柄 */
.resize-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  border: 2px solid #3b82f6;
  border-radius: 2px;
}

.resize-handle.nw { top: -6px; left: -6px; cursor: nw-resize; }
.resize-handle.ne { top: -6px; right: -6px; cursor: ne-resize; }
.resize-handle.sw { bottom: -6px; left: -6px; cursor: sw-resize; }
.resize-handle.se { bottom: -6px; right: -6px; cursor: se-resize; }
.resize-handle.n { top: -6px; left: 50%; transform: translateX(-50%); cursor: n-resize; }
.resize-handle.s { bottom: -6px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
.resize-handle.w { left: -6px; top: 50%; transform: translateY(-50%); cursor: w-resize; }
.resize-handle.e { right: -6px; top: 50%; transform: translateY(-50%); cursor: e-resize; }

/* 网格线 */
.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.3);
}

.grid-line.h1 { left: 0; right: 0; top: 33.33%; height: 1px; }
.grid-line.h2 { left: 0; right: 0; top: 66.66%; height: 1px; }
.grid-line.v1 { top: 0; bottom: 0; left: 33.33%; width: 1px; }
.grid-line.v2 { top: 0; bottom: 0; left: 66.66%; width: 1px; }

/* 工具栏 */
.crop-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: #252525;
  border-top: 1px solid #333;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-label {
  font-size: 12px;
  color: #888;
  margin-right: 4px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #444;
  margin: 0 8px;
}

.toolbar-spacer {
  flex: 1;
}

.ratio-options {
  display: flex;
  gap: 4px;
}

.ratio-btn {
  padding: 6px 10px;
  border-radius: 6px;
  background: #333;
  border: 1px solid #444;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.ratio-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.ratio-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #3b82f6;
}

.tool-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #333;
  border: 1px solid #444;
  color: #aaa;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: #3a3a3a;
  border-color: #555;
  color: #fff;
}

.tool-btn svg {
  width: 18px;
  height: 18px;
}

.action-btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.cancel {
  background: transparent;
  border: 1px solid #444;
  color: #aaa;
}

.action-btn.cancel:hover {
  background: #333;
  color: #fff;
}

.action-btn.confirm {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: none;
  color: #fff;
}

.action-btn.confirm:hover {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}
</style>
