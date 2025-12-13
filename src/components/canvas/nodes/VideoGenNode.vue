<script setup>
/**
 * VideoGenNode.vue - 视频生成节点
 * 用于文生视频和图生视频
 */
import { ref, computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { generateVideoFromText, generateVideoFromImage, pollTaskStatus } from '@/api/canvas/nodes'

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')

// 生成参数
const selectedModel = ref(props.data.model || 'sora-2')
const selectedDuration = ref(props.data.duration || '10')
const selectedAspectRatio = ref(props.data.aspectRatio || '16:9')

// 节点尺寸 - 视频生成节点使用16:9比例
const nodeWidth = ref(props.data.width || 420)
const nodeHeight = ref(props.data.height || 240)

// 是否正在调整尺寸
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'video-gen-node': true,
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
const hasOutput = computed(() => !!props.data.output?.url)

// 继承的数据
const inheritedText = computed(() => props.data.inheritedData?.content || '')
const inheritedImages = computed(() => props.data.inheritedData?.urls || [])
const isImageToVideo = computed(() => inheritedImages.value.length > 0)

// 积分消耗计算
const pointsCost = computed(() => {
  const costs = {
    'sora-2': { '10': 20, '15': 30 },
    'sora-2-pro': { '10': 300, '15': 450, '25': 750 }
  }
  return costs[selectedModel.value]?.[selectedDuration.value] || 20
})

// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 可用时长选项
const availableDurations = computed(() => {
  if (selectedModel.value === 'sora-2-pro') {
    return ['10', '15', '25']
  }
  return ['10', '15']
})

// 监听视频加载，自适应尺寸
function handleVideoLoad(event) {
  const video = event.target
  const aspectRatio = video.videoWidth / video.videoHeight
  
  // 如果是默认尺寸，则根据视频比例调整
  if (nodeWidth.value <= 450 && Math.abs(nodeWidth.value / nodeHeight.value - 16/9) < 0.2) {
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
}

// 结束调整尺寸
function handleResizeEnd() {
  isResizing.value = false
  resizeHandle.value = null
  
  canvasStore.updateNodeData(props.id, {
    width: nodeWidth.value,
    height: nodeHeight.value
  })
  
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
}

// 开始生成
async function handleGenerate() {
  if (userPoints.value < pointsCost.value) {
    alert('积分不足，请购买套餐')
    return
  }
  
  canvasStore.updateNodeData(props.id, { 
    status: 'processing',
    model: selectedModel.value,
    duration: selectedDuration.value,
    aspectRatio: selectedAspectRatio.value
  })
  
  try {
    let result
    
    if (isImageToVideo.value) {
      // 图生视频
      result = await generateVideoFromImage({
        prompt: inheritedText.value || props.data.text || '',
        imageUrl: inheritedImages.value[0],
        model: selectedModel.value,
        duration: selectedDuration.value,
        aspectRatio: selectedAspectRatio.value
      })
    } else {
      // 文生视频
      result = await generateVideoFromText({
        prompt: inheritedText.value || props.data.text || '',
        model: selectedModel.value,
        duration: selectedDuration.value,
        aspectRatio: selectedAspectRatio.value
      })
    }
    
    // 轮询任务状态
    if (result.task_id) {
      const finalResult = await pollTaskStatus(result.task_id, 'video', {
        onProgress: (status) => {
          console.log('[VideoGen] 任务进度:', status)
        }
      })
      
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        output: {
          type: 'video',
          url: finalResult.video_url || finalResult.url
        }
      })
    } else if (result.video_url || result.url) {
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        output: {
          type: 'video',
          url: result.video_url || result.url
        }
      })
    }
    
    // 刷新用户积分
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
  } catch (error) {
    console.error('[VideoGen] 生成失败:', error)
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      error: error.message
    })
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

// 下载视频
function downloadVideo() {
  if (props.data.output?.url) {
    window.open(props.data.output.url, '_blank')
  }
}

// 打开右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  const nodeType = isImageToVideo.value ? 'image-to-video' : 'text-to-video'
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: nodeType, position: { x: 0, y: 0 }, data: props.data }
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
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 节点头部 -->
    <div class="canvas-node-header">
      <div class="canvas-node-title">
        <span class="icon">{{ isImageToVideo ? '🎥' : '📹' }}</span>
        {{ data.title || (isImageToVideo ? '图生视频' : '文生视频') }}
      </div>
      <div class="canvas-node-actions">
        <button class="canvas-node-action-btn" title="下载" @click="downloadVideo" v-if="hasOutput">⬇️</button>
        <button class="canvas-node-action-btn" title="更多">≡</button>
      </div>
    </div>
    
    <!-- 节点内容 -->
    <div class="canvas-node-content" :style="contentStyle">
      <!-- 预览区域 -->
      <div class="canvas-node-preview video-preview">
        <!-- 加载中 -->
        <div v-if="data.status === 'processing'" class="preview-loading">
          <div class="canvas-loading-spinner"></div>
          <span>视频生成中...</span>
          <span class="loading-hint">预计 1-3 分钟</span>
        </div>
        
        <!-- 错误状态 -->
        <div v-else-if="data.status === 'error'" class="preview-error">
          <span class="error-icon">❌</span>
          <span class="error-text">{{ data.error || '生成失败' }}</span>
          <button class="retry-btn" @click="handleRegenerate">重试</button>
        </div>
        
        <!-- 生成结果 -->
        <video 
          v-else-if="hasOutput" 
          :src="data.output.url" 
          controls
          class="video-player"
          @loadedmetadata="handleVideoLoad"
        ></video>
        
        <!-- 等待输入 -->
        <div v-else class="canvas-node-preview-empty">
          <div v-if="inheritedText || inheritedImages.length">
            <div class="inherited-label">
              {{ isImageToVideo ? '参考图片已就绪' : '提示词已就绪' }}
            </div>
            <div v-if="inheritedText" class="inherited-text">
              {{ inheritedText.slice(0, 80) }}{{ inheritedText.length > 80 ? '...' : '' }}
            </div>
          </div>
          <div v-else>等待输入...</div>
        </div>
      </div>
      
      <!-- 参考图（图生视频模式） -->
      <div v-if="inheritedImages.length > 0" class="reference-images">
        <div class="reference-image">
          <img :src="inheritedImages[0]" alt="参考图" />
        </div>
        <span class="reference-label">首帧参考图</span>
      </div>
      
      <!-- 生成控制 -->
      <div class="gen-controls">
        <div class="gen-params">
          <!-- 模型选择 -->
          <select v-model="selectedModel" class="param-select">
            <option value="sora-2">Sora 2</option>
            <option value="sora-2-pro">Sora Pro</option>
          </select>
          
          <!-- 时长选择 -->
          <select v-model="selectedDuration" class="param-select">
            <option v-for="d in availableDurations" :key="d" :value="d">{{ d }}s</option>
          </select>
          
          <!-- 画幅选择 -->
          <select v-model="selectedAspectRatio" class="param-select">
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </div>
        
        <div class="gen-actions">
          <!-- 积分显示 -->
          <span class="points-cost">💎 {{ pointsCost }}</span>
          
          <!-- 生成按钮 -->
          <button 
            v-if="!hasOutput"
            class="canvas-node-btn"
            :disabled="data.status === 'processing' || (!inheritedText && !inheritedImages.length)"
            @click="handleGenerate"
          >
            {{ data.status === 'processing' ? '⏳ 生成中' : '🚀 开始生成' }}
          </button>
          
          <!-- 重新生成按钮 -->
          <button 
            v-else
            class="canvas-node-btn secondary"
            @click="handleRegenerate"
          >
            🔄 重新生成
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
  </div>
</template>

<style scoped>
.video-gen-node {
  min-width: 280px;
}

.video-preview {
  min-height: 160px;
}

.video-player {
  width: 100%;
  max-height: 200px;
  border-radius: var(--canvas-radius-sm);
}

.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--canvas-text-secondary);
  font-size: 13px;
}

.loading-hint {
  font-size: 11px;
  color: var(--canvas-text-tertiary);
}

.preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
}

.error-icon {
  font-size: 24px;
}

.error-text {
  color: var(--canvas-accent-error);
  font-size: 12px;
}

.retry-btn {
  padding: 6px 12px;
  background: var(--canvas-bg-elevated);
  border: 1px solid var(--canvas-border-subtle);
  border-radius: var(--canvas-radius-sm);
  color: var(--canvas-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.retry-btn:hover {
  border-color: var(--canvas-accent-primary);
  color: var(--canvas-accent-primary);
}

.inherited-label {
  font-size: 11px;
  color: var(--canvas-accent-success);
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
  flex-wrap: wrap;
  gap: 8px;
}

.gen-params {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-select {
  background: var(--canvas-bg-secondary);
  border: 1px solid var(--canvas-border-subtle);
  border-radius: 4px;
  color: var(--canvas-text-primary);
  font-size: 11px;
  padding: 4px 6px;
  cursor: pointer;
}

.gen-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.points-cost {
  font-size: 12px;
  color: var(--canvas-accent-banana);
}

/* 端口样式 - 完全隐藏（但保留给 Vue Flow 用于边渲染） */
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

.node-add-btn {
  position: absolute;
  right: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--canvas-bg-elevated, #242424);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 10;
}

.canvas-node:hover .node-add-btn {
  opacity: 1;
}

.node-add-btn:hover {
  background: var(--canvas-accent-primary, #3b82f6);
  border-color: var(--canvas-accent-primary, #3b82f6);
  color: white;
  transform: translateY(-50%) scale(1.15);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.4);
}

/* 节点内容区域 */
.canvas-node-content {
  position: relative;
  overflow: hidden;
}

.video-gen-node.resizing .canvas-node-content {
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
</style>

