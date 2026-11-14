<script setup>
import { t as translateUi } from '@/i18n'

/**
 * FabricMaskCanvas.vue - 原生 Canvas 蒙版/涂鸦编辑器
 * 
 * 使用原生 Canvas API 实现（无需 Fabric.js）
 * 支持：
 * - 画笔绘制（可调粗细）
 * - 橡皮擦
 * - 撤销/重做
 * - 导出蒙版图
 */
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'

const props = defineProps({
  imageUrl: {
    type: String,
    required: true
  },
  tool: {
    type: String,
    default: 'repaint'
  },
  width: {
    type: Number,
    default: 800
  },
  height: {
    type: Number,
    default: 600
  },
  active: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['save', 'cancel', 'mask-ready'])

// Canvas 引用
const canvasRef = ref(null)
const ctx = ref(null)
const backgroundImage = ref(null)
const imageInfo = ref(null)

// 绘制状态
const isDrawing = ref(false)
const lastPoint = ref({ x: 0, y: 0 })

// 工具状态
const brushSize = ref(30)
const brushColor = ref('#ff0000')
const isErasing = ref(false)

// 历史记录
const historyStack = ref([])
const historyIndex = ref(-1)
const maxHistory = 30

// 画笔粗细选项
const brushSizes = [10, 20, 30, 50, 80]

// 蒙版颜色
const maskColors = [
  { value: '#ff0000', get label() { return translateUi('uiMessages.m789f61dbfcc7') } },
  { value: '#00ff00', get label() { return translateUi('uiMessages.m30c83dc25b12') } },
  { value: '#0000ff', get label() { return translateUi('uiMessages.m67035e6b7f82') } },
  { value: '#ffffff', get label() { return translateUi('uiMessages.mf56e7eff58bf') } }
]

// 是否为蒙版模式
const isMaskMode = computed(() => ['repaint', 'erase'].includes(props.tool))

// 初始化 Canvas
async function initCanvas() {
  if (!canvasRef.value) return
  
  const canvas = canvasRef.value
  canvas.width = props.width
  canvas.height = props.height
  ctx.value = canvas.getContext('2d')
  
  // 加载背景图片
  await loadBackgroundImage()
  
  // 初始化历史记录
  saveHistory()
  
  console.log('[MaskCanvas] Canvas 初始化完成')
}

// 加载背景图片
async function loadBackgroundImage() {
  if (!ctx.value || !props.imageUrl) return
  
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      backgroundImage.value = img
      
      // 计算缩放比例
      const scaleX = props.width / img.width
      const scaleY = props.height / img.height
      const scale = Math.min(scaleX, scaleY, 1)
      
      const scaledWidth = img.width * scale
      const scaledHeight = img.height * scale
      const offsetX = (props.width - scaledWidth) / 2
      const offsetY = (props.height - scaledHeight) / 2
      
      imageInfo.value = {
        width: img.width,
        height: img.height,
        scale,
        offsetX,
        offsetY,
        scaledWidth,
        scaledHeight
      }
      
      // 绘制背景
      redrawCanvas()
      
      emit('mask-ready', imageInfo.value)
      resolve()
    }
    
    img.onerror = reject
    img.src = props.imageUrl
  })
}

// 重绘画布（背景 + 绘制内容）
function redrawCanvas() {
  if (!ctx.value || !backgroundImage.value || !imageInfo.value) return
  
  const { offsetX, offsetY, scaledWidth, scaledHeight } = imageInfo.value
  
  // 清空画布
  ctx.value.clearRect(0, 0, props.width, props.height)
  
  // 绘制棋盘格背景
  drawCheckerboard()
  
  // 绘制图片
  ctx.value.drawImage(
    backgroundImage.value,
    offsetX, offsetY,
    scaledWidth, scaledHeight
  )
}

// 绘制棋盘格背景
function drawCheckerboard() {
  const size = 10
  for (let x = 0; x < props.width; x += size) {
    for (let y = 0; y < props.height; y += size) {
      ctx.value.fillStyle = ((x + y) / size) % 2 === 0 ? '#2a2a2a' : '#1a1a1a'
      ctx.value.fillRect(x, y, size, size)
    }
  }
}

// 获取画布坐标
function getCanvasPoint(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

// 开始绘制
function startDrawing(e) {
  if (!props.active) return
  isDrawing.value = true
  lastPoint.value = getCanvasPoint(e)
}

// 绘制中
function draw(e) {
  if (!isDrawing.value || !ctx.value) return
  
  const currentPoint = getCanvasPoint(e)
  
  ctx.value.beginPath()
  ctx.value.moveTo(lastPoint.value.x, lastPoint.value.y)
  ctx.value.lineTo(currentPoint.x, currentPoint.y)
  ctx.value.strokeStyle = isErasing.value ? 'rgba(0,0,0,0)' : (isMaskMode.value ? 'rgba(255, 0, 0, 0.5)' : brushColor.value)
  ctx.value.lineWidth = brushSize.value
  ctx.value.lineCap = 'round'
  ctx.value.lineJoin = 'round'
  
  if (isErasing.value) {
    ctx.value.globalCompositeOperation = 'destination-out'
  } else {
    ctx.value.globalCompositeOperation = 'source-over'
  }
  
  ctx.value.stroke()
  ctx.value.globalCompositeOperation = 'source-over'
  
  lastPoint.value = currentPoint
}

// 结束绘制
function stopDrawing() {
  if (isDrawing.value) {
    isDrawing.value = false
    saveHistory()
  }
}

// 设置画笔粗细
function setBrushSize(size) {
  brushSize.value = size
}

// 设置画笔颜色
function setBrushColor(color) {
  brushColor.value = color
  isErasing.value = false
}

// 切换橡皮擦
function toggleEraser() {
  isErasing.value = !isErasing.value
}

// 保存历史记录
function saveHistory() {
  if (!canvasRef.value) return
  
  const imageData = canvasRef.value.toDataURL()
  
  if (historyIndex.value < historyStack.value.length - 1) {
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
  }
  
  historyStack.value.push(imageData)
  
  if (historyStack.value.length > maxHistory) {
    historyStack.value.shift()
  } else {
    historyIndex.value++
  }
}

// 撤销
function undo() {
  if (historyIndex.value <= 0) return
  
  historyIndex.value--
  restoreFromHistory()
}

// 重做
function redo() {
  if (historyIndex.value >= historyStack.value.length - 1) return
  
  historyIndex.value++
  restoreFromHistory()
}

// 从历史恢复
function restoreFromHistory() {
  const img = new Image()
  img.onload = () => {
    ctx.value.clearRect(0, 0, props.width, props.height)
    ctx.value.drawImage(img, 0, 0)
  }
  img.src = historyStack.value[historyIndex.value]
}

// 清除所有绘制
function clearAll() {
  redrawCanvas()
  saveHistory()
}

// 导出蒙版图
function exportMask() {
  if (!canvasRef.value || !imageInfo.value) return null
  
  const { width, height, scale, offsetX, offsetY } = imageInfo.value
  
  // 创建蒙版画布
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const maskCtx = maskCanvas.getContext('2d')
  
  // 黑色背景
  maskCtx.fillStyle = '#000000'
  maskCtx.fillRect(0, 0, width, height)
  
  // 获取当前画布的绘制区域
  const currentCanvas = canvasRef.value
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = props.width
  tempCanvas.height = props.height
  const tempCtx = tempCanvas.getContext('2d')
  
  // 复制当前画布
  tempCtx.drawImage(currentCanvas, 0, 0)
  
  // 将红色区域转为白色
  const imageData = tempCtx.getImageData(0, 0, props.width, props.height)
  const data = imageData.data
  
  for (let i = 0; i < data.length; i += 4) {
    // 检测红色像素（蒙版区域）
    if (data[i] > 200 && data[i + 1] < 100 && data[i + 2] < 100 && data[i + 3] > 50) {
      data[i] = 255     // R
      data[i + 1] = 255 // G
      data[i + 2] = 255 // B
      data[i + 3] = 255 // A
    } else {
      data[i + 3] = 0   // 透明
    }
  }
  
  tempCtx.putImageData(imageData, 0, 0)
  
  // 缩放到原始尺寸
  maskCtx.drawImage(
    tempCanvas,
    offsetX, offsetY, imageInfo.value.scaledWidth, imageInfo.value.scaledHeight,
    0, 0, width, height
  )
  
  return maskCanvas.toDataURL('image/png')
}

// 导出编辑后的图片
function exportImage() {
  if (!canvasRef.value) return null
  return canvasRef.value.toDataURL('image/png')
}

// 保存
function handleSave() {
  const maskData = isMaskMode.value ? exportMask() : null
  const imageData = exportImage()
  
  emit('save', {
    mask: maskData,
    image: imageData,
    tool: props.tool,
    hasMask: maskData !== null
  })
}

// 取消
function handleCancel() {
  emit('cancel')
}

// 监听尺寸变化
watch([() => props.width, () => props.height], () => {
  nextTick(() => initCanvas())
})

// 监听图片变化
watch(() => props.imageUrl, () => {
  loadBackgroundImage()
})

onMounted(() => {
  nextTick(() => initCanvas())
})

defineExpose({
  exportMask,
  exportImage,
  undo,
  redo,
  clearAll,
  setBrushSize,
  setBrushColor,
  toggleEraser
})
</script>

<template>
  <div class="fabric-mask-canvas">
    <!-- 画布容器 -->
    <div class="canvas-container">
      <canvas
        ref="canvasRef"
        @mousedown="startDrawing"
        @mousemove="draw"
        @mouseup="stopDrawing"
        @mouseleave="stopDrawing"
      ></canvas>
    </div>
    
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <!-- 画笔粗细 -->
      <div class="toolbar-section">
        <span class="toolbar-label">{{ translateUi('uiMessages.m667f2d7b34e2') }}</span>
        <div class="brush-sizes">
          <button
            v-for="size in brushSizes"
            :key="size"
            class="brush-size-btn"
            :class="{ active: brushSize === size }"
            @click="setBrushSize(size)"
          >
            <span 
              class="brush-preview" 
              :style="{ width: `${Math.min(size / 2, 20)}px`, height: `${Math.min(size / 2, 20)}px` }"
            ></span>
          </button>
        </div>
      </div>
      
      <!-- 颜色选择（仅涂鸦模式） -->
      <div v-if="!isMaskMode" class="toolbar-section">
        <span class="toolbar-label">{{ translateUi('directorStudio.inspector.color') }}</span>
        <div class="color-options">
          <button
            v-for="color in maskColors"
            :key="color.value"
            class="color-btn"
            :class="{ active: brushColor === color.value }"
            :style="{ backgroundColor: color.value }"
            :title="color.label"
            @click="setBrushColor(color.value)"
          ></button>
        </div>
      </div>
      
      <!-- 工具按钮 -->
      <div class="toolbar-section">
        <button 
          class="tool-btn"
          :class="{ active: !isErasing }"
          :title="translateUi('uiMessages.m05731b92ad31')"
          @click="isErasing = false"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
          </svg>
        </button>
        <button 
          class="tool-btn"
          :class="{ active: isErasing }"
          :title="translateUi('uiMessages.m05cf56410be3')"
          @click="toggleEraser"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L13.4 2.8c.8-.8 2-.8 2.8 0L21 7.6c.8.8.8 2 0 2.8L11.4 20"/>
          </svg>
        </button>
        
        <div class="toolbar-divider"></div>
        
        <button class="tool-btn" :title="translateUi('canvas.undo')" @click="undo" :disabled="historyIndex <= 0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l4-4M3 10l4 4"/>
          </svg>
        </button>
        <button class="tool-btn" :title="translateUi('canvas.redo')" @click="redo" :disabled="historyIndex >= historyStack.length - 1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-4-4M21 10l-4 4"/>
          </svg>
        </button>
        <button class="tool-btn" :title="translateUi('uiMessages.m3c507e43ef88')" @click="clearAll">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
      
      <div class="toolbar-spacer"></div>
      
      <!-- 操作按钮 -->
      <div class="toolbar-section">
        <button class="action-btn cancel" @click="handleCancel">{{ translateUi('common.cancel') }}</button>
        <button class="action-btn confirm" @click="handleSave">{{ translateUi('common.ok') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fabric-mask-canvas {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.canvas-container canvas {
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  cursor: crosshair;
}

/* 工具栏 */
.editor-toolbar {
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

.brush-sizes {
  display: flex;
  gap: 4px;
}

.brush-size-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #333;
  border: 1px solid #444;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.brush-size-btn:hover {
  background: #3a3a3a;
  border-color: #555;
}

.brush-size-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
}

.brush-preview {
  border-radius: 50%;
  background: #fff;
}

.color-options {
  display: flex;
  gap: 4px;
}

.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #444;
  cursor: pointer;
  transition: all 0.2s;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
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

.tool-btn:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #555;
  color: #fff;
}

.tool-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #3b82f6;
}

.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
