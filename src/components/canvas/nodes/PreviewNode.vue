<script setup>
/**
 * PreviewNode.vue - 预览输出节点
 */
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { getTenantHeaders } from '@/config/tenant'

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()

// 节点样式类
const nodeClass = computed(() => ({
  'canvas-node': true,
  'selected': props.selected
}))

// 继承的数据
const inheritedData = computed(() => props.data.inheritedData)
const contentType = computed(() => inheritedData.value?.type || 'none')

// 是否为9宫格模式
const isGridMode = computed(() => props.data.gridMode === true || props.id.includes('grid-preview'))

// 网格显示的图片列表
const gridImages = computed(() => {
  if (!isGridMode.value || contentType.value !== 'image') return []
  return inheritedData.value?.urls || []
})

// 打开右键菜单
function handleContextMenu(event) {
  event.preventDefault()
  canvasStore.openContextMenu(
    { x: event.clientX, y: event.clientY },
    { id: props.id, type: 'preview-output', position: { x: 0, y: 0 }, data: props.data }
  )
}

// 统一使用后端代理下载，解决跨域和第三方CDN预览问题
async function download() {
  let mediaUrl = ''
  let fileName = ''
  let isVideo = false
  
  if (contentType.value === 'image' && inheritedData.value?.urls?.length) {
    mediaUrl = inheritedData.value.urls[0]
    fileName = `image_${props.id || Date.now()}.png`
  } else if (contentType.value === 'video' && inheritedData.value?.url) {
    mediaUrl = inheritedData.value.url
    fileName = `video_${props.id || Date.now()}.mp4`
    isVideo = true
  }
  
  if (!mediaUrl) return
  
  try {
    // 统一走后端代理下载，后端会设置 Content-Disposition: attachment 头
    const { getApiUrl } = await import('@/config/tenant')
    const proxyPath = isVideo
      ? `/api/videos/download?url=${encodeURIComponent(mediaUrl)}&name=${encodeURIComponent(fileName)}`
      : `/api/images/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(fileName)}`
    const downloadUrl = getApiUrl(proxyPath)
    
    const response = await fetch(downloadUrl, {
      headers: getTenantHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('[PreviewNode] 下载失败:', error)
    // 回退：使用后端代理页面下载
    try {
      const { getApiUrl } = await import('@/config/tenant')
      const proxyPath = isVideo
        ? `/api/videos/download?url=${encodeURIComponent(mediaUrl)}&name=${encodeURIComponent(fileName)}`
        : `/api/images/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(fileName)}`
      window.location.href = getApiUrl(proxyPath)
    } catch (e) {
      console.error('[PreviewNode] 所有下载方式都失败:', e)
    }
  }
}

// 全屏预览
function fullscreen() {
  alert('全屏预览功能开发中...')
}
</script>

<template>
  <div :class="nodeClass" @contextmenu="handleContextMenu">
    <!-- 节点头部 -->
    <div class="canvas-node-header">
      <div class="canvas-node-title">
        <span class="icon">{{ isGridMode ? '⊞' : '◉' }}</span>
        {{ data.title || (isGridMode ? '9宫格分镜' : '预览输出') }}
      </div>
      <div class="canvas-node-actions">
        <button class="canvas-node-action-btn" title="下载" @click="download">↓</button>
        <button class="canvas-node-action-btn" title="全屏" @click="fullscreen">⤢</button>
      </div>
    </div>
    
    <!-- 节点内容 -->
    <div class="canvas-node-content">
      <div class="canvas-node-preview">
        <!-- 9宫格图片预览 -->
        <div v-if="isGridMode && gridImages.length > 0" class="preview-grid">
          <div 
            v-for="(url, index) in gridImages.slice(0, 9)" 
            :key="index" 
            class="grid-item"
          >
            <img :src="url" :alt="`分镜 ${index + 1}`" />
          </div>
        </div>
        
        <!-- 文本预览 -->
        <div v-else-if="contentType === 'text'" class="preview-text">
          {{ inheritedData?.content || '无内容' }}
        </div>
        
        <!-- 图片预览 -->
        <img 
          v-else-if="contentType === 'image' && inheritedData?.urls?.length" 
          :src="inheritedData.urls[0]" 
          alt="预览"
        />
        
        <!-- 视频预览 -->
        <video 
          v-else-if="contentType === 'video' && inheritedData?.url"
          :src="inheritedData.url"
          controls
          class="preview-video"
        ></video>
        
        <!-- 空状态 -->
        <div v-else class="canvas-node-preview-empty">
          等待上游节点输出...
        </div>
      </div>
    </div>
    
    <!-- 输入端口（隐藏但保留给 Vue Flow 用于边渲染） -->
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="node-handle node-handle-hidden"
    />
  </div>
</template>

<style scoped>
.preview-text {
  padding: 12px;
  color: var(--canvas-text-primary);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.canvas-node-preview img {
  max-width: 100%;
  max-height: 250px;
  object-fit: contain;
  border-radius: var(--canvas-radius-sm);
}

.preview-video {
  max-width: 100%;
  max-height: 250px;
  border-radius: var(--canvas-radius-sm);
}

/* 9宫格布局样式 */
.preview-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px;
  max-width: 400px;
}

.grid-item {
  aspect-ratio: 16/9;
  overflow: hidden;
  border-radius: 4px;
  background: var(--canvas-bg-secondary, #f5f5f5);
}

.grid-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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
</style>

