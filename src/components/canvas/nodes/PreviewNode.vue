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

// 将 dataUrl 转换为 Blob 对象
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const base64 = parts[1]
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mime })
}

// 下载
// - dataUrl/blob URL：直接在前端转换下载
// - 七牛云 URL：直接使用 attname 参数下载（节省服务器流量）
// - 其他 URL：走后端代理下载（解决跨域问题）
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
    // 如果是 dataUrl（base64），直接在前端转换为 Blob 下载
    if (mediaUrl.startsWith('data:')) {
      console.log('[PreviewNode] dataUrl 格式，使用前端直接下载')
      const blob = dataUrlToBlob(mediaUrl)
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
      return
    }
    
    // 如果是 blob URL，直接使用
    if (mediaUrl.startsWith('blob:')) {
      console.log('[PreviewNode] blob URL 格式，使用前端直接下载')
      const response = await fetch(mediaUrl)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
      return
    }
    
    // 使用统一的下载函数
    const { buildDownloadUrl, buildVideoDownloadUrl, isQiniuCdnUrl } = await import('@/api/client')
    const downloadUrl = isVideo
      ? buildVideoDownloadUrl(mediaUrl, fileName)
      : buildDownloadUrl(mediaUrl, fileName)
    
    // 七牛云 URL 直接下载（节省服务器流量）
    if (isQiniuCdnUrl(mediaUrl)) {
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      console.log('[PreviewNode] 七牛云直接下载:', fileName)
      return
    }
    
    // 其他 URL 走后端代理下载
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
    // 🔧 修复：使用新窗口打开下载链接，避免触发当前页面的 beforeunload 事件
    try {
      const { buildDownloadUrl, buildVideoDownloadUrl } = await import('@/api/client')
      const downloadUrl = isVideo
        ? buildVideoDownloadUrl(mediaUrl, fileName)
        : buildDownloadUrl(mediaUrl, fileName)
      window.open(downloadUrl, '_blank')
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

