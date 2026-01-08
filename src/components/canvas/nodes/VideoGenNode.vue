<script setup>
/**
 * VideoGenNode.vue - 视频生成节点
 * 用于文生视频和图生视频
 */
import { ref, computed, inject, nextTick, onMounted, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { generateVideoFromText, generateVideoFromImage, pollTaskStatus } from '@/api/canvas/nodes'
import { getAvailableVideoModels, getTenantHeaders } from '@/config/tenant'
import { useI18n } from '@/i18n'

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

// 生成参数 - 默认使用新版 sora2 整合模型
const selectedModel = ref(props.data.model || 'sora2')
const selectedDuration = ref(props.data.duration || '10')
const selectedAspectRatio = ref(props.data.aspectRatio || '16:9')

// 可用模型列表 - 从配置动态获取，过滤掉旧版模型
const models = computed(() => {
  const allModels = getAvailableVideoModels()
  // 过滤掉旧版 sora-2 和 sora-2-pro，只保留新版 sora2 系列和其他模型
  return allModels.filter(m => !['sora-2', 'sora-2-pro'].includes(m.value))
})

// 当前选中的模型配置
const currentModelConfig = computed(() => {
  return models.value.find(m => m.value === selectedModel.value) || {}
})

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

// 检查是否有上游连接
const hasUpstreamEdge = computed(() => {
  return canvasStore.edges.some(edge => edge.target === props.id)
})

// 继承的数据（仅在有上游连接时使用）
const inheritedText = computed(() => {
  if (!hasUpstreamEdge.value) return ''
  return props.data.inheritedData?.content || ''
})
const inheritedImages = computed(() => {
  if (!hasUpstreamEdge.value) return []
  return props.data.inheritedData?.urls || []
})
const isImageToVideo = computed(() => inheritedImages.value.length > 0)

// 积分消耗计算 - 从模型配置中读取
const pointsCost = computed(() => {
  const currentModel = models.value.find(m => m.value === selectedModel.value)
  
  // 按时长计费的模型（Sora 2、Sora 2 Pro）
  if (currentModel?.hasDurationPricing) {
    const durationCost = currentModel.pointsCost?.[selectedDuration.value]
    if (durationCost) return durationCost
  }
  
  // 其他模型使用固定积分（VEO 3.1 系列）
  const pointsCost = currentModel?.pointsCost
  return typeof pointsCost === 'number' ? pointsCost : 20
})


// 用户积分
const userPoints = computed(() => {
  if (!userInfo?.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
})

// 可用时长选项 - 从模型配置中读取
const availableDurations = computed(() => {
  const durations = currentModelConfig.value?.durations
  if (durations && durations.length > 0) {
    return durations
  }
  // 兜底默认值
  if (selectedModel.value === 'sora2-pro' || selectedModel.value === 'sora-2-pro') {
    return ['10', '15', '25']
  }
  return ['10', '15']
})

// 可用方向选项 - 从模型配置中读取
const availableAspectRatios = computed(() => {
  const aspectRatios = currentModelConfig.value?.aspectRatios
  if (aspectRatios && aspectRatios.length > 0) {
    return aspectRatios
  }
  // 兜底默认值
  return [
    { value: '16:9', label: '横屏' },
    { value: '9:16', label: '竖屏' }
  ]
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

// 模型下拉框方法
function toggleModelDropdown(event) {
  event.stopPropagation()
  isModelDropdownOpen.value = !isModelDropdownOpen.value
}

function selectModel(modelValue) {
  selectedModel.value = modelValue
  isModelDropdownOpen.value = false
  
  // 获取新模型的配置
  const newModelConfig = models.value.find(m => m.value === modelValue)
  
  // 更新时长选项 - 使用模型配置的 durations 数组
  const durations = newModelConfig?.durations || ['10', '15']
  if (durations.length > 0 && !durations.includes(selectedDuration.value)) {
    selectedDuration.value = durations[0]
  }
  
  // 更新方向选项 - 使用模型配置的 aspectRatios 数组
  const aspectRatios = newModelConfig?.aspectRatios || [{ value: '16:9', label: '横屏' }]
  const aspectValues = aspectRatios.map(ar => ar.value)
  if (aspectValues.length > 0 && !aspectValues.includes(selectedAspectRatio.value)) {
    selectedAspectRatio.value = aspectValues[0]
  }
}

function handleModelDropdownClickOutside(event) {
  // 检查点击是否在下拉框外
  const dropdown = event.target.closest('.model-selector-custom')
  if (!dropdown) {
    isModelDropdownOpen.value = false
  }
}

// 组件挂载时添加全局点击事件监听
onMounted(() => {
  document.addEventListener('click', handleModelDropdownClickOutside)
})

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleModelDropdownClickOutside)
})

// 开始生成
async function handleGenerate() {
  if (userPoints.value < pointsCost.value) {
    alert(t('imageGen.insufficientPoints'))
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
      
      let videoUrl = finalResult.video_url || finalResult.url
      
      // 如果不是七牛云 URL，延迟几秒再查询一次获取可能已上传的七牛云 URL
      if (videoUrl && !isQiniuCdnUrl(videoUrl)) {
        console.log('[VideoGen] 首次返回非七牛云URL，延迟3秒后再次查询...')
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        try {
          const { getVideoTaskStatus } = await import('@/api/canvas/nodes')
          const updatedResult = await getVideoTaskStatus(result.task_id)
          if (updatedResult.video_url && isQiniuCdnUrl(updatedResult.video_url)) {
            videoUrl = updatedResult.video_url
            console.log('[VideoGen] 获取到七牛云URL:', videoUrl.substring(0, 60))
          }
        } catch (e) {
          console.warn('[VideoGen] 再次查询失败，使用原URL:', e.message)
        }
      }
      
      canvasStore.updateNodeData(props.id, {
        status: 'success',
        taskId: result.task_id,
        output: {
          type: 'video',
          url: videoUrl
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

// 判断是否是七牛云 CDN URL（永久有效，可直接访问）
function isQiniuCdnUrl(url) {
  if (!url || typeof url !== 'string') return false
  return url.includes('files.nananobanana.cn') ||  // 项目的七牛云域名
         url.includes('qiniucdn.com') || 
         url.includes('clouddn.com') || 
         url.includes('qnssl.com') ||
         url.includes('qbox.me')
}

// 构建七牛云强制下载URL（使用attname参数）
function buildQiniuForceDownloadUrl(url, filename) {
  if (!url || !filename) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}attname=${encodeURIComponent(filename)}`
}

// 统一使用后端代理下载视频，解决跨域和第三方CDN预览问题
async function downloadVideo() {
  if (!props.data.output?.url) return
  
  const videoUrl = props.data.output.url
  const filename = `video_${props.id || Date.now()}.mp4`
  
  console.log('[VideoGenNode] 开始下载:', { url: videoUrl.substring(0, 60), filename })
  
  try {
    // 统一走后端代理下载，后端会设置 Content-Disposition: attachment 头
    const { getApiUrl } = await import('@/config/tenant')
    const downloadUrl = getApiUrl(`/api/videos/download?url=${encodeURIComponent(videoUrl)}&name=${encodeURIComponent(filename)}`)
    
    const response = await fetch(downloadUrl, {
      headers: getTenantHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const blob = await response.blob()
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    
    console.log('[VideoGenNode] 下载成功:', filename)
    
    setTimeout(() => {
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    }, 100)
  } catch (error) {
    console.error('[VideoGenNode] 下载失败:', error)
    // 最后的回退：使用后端代理页面下载
    try {
      const { getApiUrl } = await import('@/config/tenant')
      window.location.href = getApiUrl(`/api/videos/download?url=${encodeURIComponent(videoUrl)}&name=${encodeURIComponent(filename)}`)
    } catch (e) {
      console.error('[VideoGenNode] 所有下载方式都失败:', e)
    }
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
        <span class="icon">{{ isImageToVideo ? '▢' : '▶' }}</span>
        {{ data.title || (isImageToVideo ? '图生视频' : '文生视频') }}
      </div>
      <div class="canvas-node-actions">
        <button class="canvas-node-action-btn" title="下载" @click="downloadVideo" v-if="hasOutput">↓</button>
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
          <!-- 模型选择器（自定义下拉框，支持显示描述） -->
          <div class="model-selector-custom" @click.stop>
            <div 
              class="model-selector-trigger"
              @click="toggleModelDropdown"
            >
              <span class="model-icon">{{ models.find(m => m.value === selectedModel)?.icon || '▶' }}</span>
              <span class="model-name">{{ models.find(m => m.value === selectedModel)?.label || selectedModel }}</span>
              <span class="select-arrow" :class="{ 'arrow-up': isModelDropdownOpen }">▾</span>
            </div>
            
            <!-- 下拉选项列表 -->
            <Transition name="dropdown-fade">
              <div v-if="isModelDropdownOpen" class="model-dropdown-list">
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
          
          <!-- 时长选择 -->
          <select v-model="selectedDuration" class="param-select">
            <option v-for="d in availableDurations" :key="d" :value="d">{{ d }}s</option>
          </select>
          
          <!-- 画幅/方向选择 - 从模型配置动态获取 -->
          <select v-model="selectedAspectRatio" class="param-select">
            <option 
              v-for="ar in availableAspectRatios" 
              :key="ar.value" 
              :value="ar.value"
            >{{ ar.label }}</option>
          </select>
        </div>
        
        <div class="gen-actions">
          <!-- 积分消耗显示 -->
          <span class="points-cost-display">
            {{ pointsCost }} {{ t('imageGen.points') }}
          </span>
          
          <!-- 生成按钮 -->
          <button 
            v-if="!hasOutput"
            class="canvas-node-btn"
            :disabled="data.status === 'processing' || (!inheritedText && !inheritedImages.length)"
            @click="handleGenerate"
          >
            {{ data.status === 'processing' ? '...' : '→ 生成' }}
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

/* 旧的积分显示 - 黑白灰风格（保留兼容） */
.points-cost {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* 新的积分显示样式 - 黑白灰风格 */
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
.video-gen-node.selected .node-add-btn {
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

/* 模型选择器自定义样式 */
.model-selector-custom {
  position: relative;
  min-width: 140px;
}

.model-selector-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #3a3a3a);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.model-selector-trigger:hover {
  background: var(--canvas-bg-secondary, #252525);
  border-color: var(--canvas-border-default, #4a4a4a);
}

.model-icon {
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
}

.model-icon-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.model-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-primary, #e5e5e5);
}

.select-arrow {
  font-size: 10px;
  color: var(--canvas-text-secondary, #a0a0a0);
  transition: transform 0.2s ease;
}

.select-arrow.arrow-up {
  transform: rotate(180deg);
}

.model-dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 8px;
  overflow: hidden;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.model-dropdown-item {
  padding: 8px 10px;
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
  gap: 6px;
}

.model-item-icon {
  font-size: 14px;
  line-height: 1;
}

.model-item-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-primary, #e5e5e5);
}

.model-item-desc {
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

