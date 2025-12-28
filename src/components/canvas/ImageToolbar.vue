<script setup>
/**
 * ImageToolbar.vue - 图像节点工具栏
 * 
 * 功能：
 * - 重绘：AI重绘图像（预留事件）
 * - 擦除：擦除图像部分内容（预留事件）
 * - 增强：图像增强/超分辨率（预留事件）
 * - 抠图：去除背景/抠图（预留事件）
 * - 扩图：扩展图像边界（预留事件）
 * - 标注：图像标注功能（预留事件）
 * - 裁剪：裁剪图像（可实现）
 * - 下载：下载图像（可实现）
 * - 放大预览：全屏预览图像（可实现）
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { getTenantHeaders } from '@/config/tenant'

const props = defineProps({
  // 选中的图像节点
  imageNode: {
    type: Object,
    required: true
  },
  // 工具栏位置
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  }
})

const emit = defineEmits([
  'close',
  'repaint',      // 重绘
  'erase',        // 擦除
  'enhance',      // 增强
  'cutout',       // 抠图
  'expand',       // 扩图
  'annotate',     // 标注
  'crop',         // 裁剪
  'download',     // 下载
  'preview'       // 放大预览
])

const canvasStore = useCanvasStore()

// 预览弹窗状态
const showPreviewModal = ref(false)
const previewImageUrl = ref('')

// 裁剪弹窗状态
const showCropModal = ref(false)
const cropImageUrl = ref('')

// 获取节点的图片URL
const imageUrl = computed(() => {
  const node = props.imageNode
  if (!node?.data) return null
  
  // 优先获取输出图片
  if (node.data.output?.urls?.length > 0) {
    return node.data.output.urls[0]
  }
  if (node.data.output?.url) {
    return node.data.output.url
  }
  // 其次获取源图片
  if (node.data.sourceImages?.length > 0) {
    return node.data.sourceImages[0]
  }
  return null
})

// 是否有图片可操作
const hasImage = computed(() => !!imageUrl.value)

// 工具栏按钮配置 - 按截图顺序排列
const toolbarItems = [
  { 
    id: 'repaint', 
    icon: 'repaint',
    label: '重绘', 
    handler: handleRepaint,
    requiresImage: true
  },
  { 
    id: 'erase', 
    icon: 'erase',
    label: '擦除', 
    handler: handleErase,
    requiresImage: true
  },
  { 
    id: 'enhance', 
    icon: 'enhance',
    label: '增强', 
    handler: handleEnhance,
    requiresImage: true
  },
  { 
    id: 'cutout', 
    icon: 'cutout',
    label: '抠图', 
    handler: handleCutout,
    requiresImage: true
  },
  { 
    id: 'expand', 
    icon: 'expand',
    label: '扩图', 
    handler: handleExpand,
    requiresImage: true
  },
  // 分隔符
  { id: 'divider', type: 'divider' },
  // 最后四个功能（仅图标）
  { 
    id: 'annotate', 
    icon: 'annotate',
    label: '标注', 
    handler: handleAnnotate,
    requiresImage: true,
    iconOnly: true
  },
  { 
    id: 'crop', 
    icon: 'crop',
    label: '裁剪', 
    handler: handleCrop,
    requiresImage: true,
    iconOnly: true
  },
  { 
    id: 'download', 
    icon: 'download',
    label: '下载', 
    handler: handleDownload,
    requiresImage: true,
    iconOnly: true
  },
  { 
    id: 'preview', 
    icon: 'preview',
    label: '放大预览', 
    handler: handlePreview,
    requiresImage: true,
    iconOnly: true
  }
]

// ========== 事件处理函数 ==========

// 重绘（预留事件）
function handleRepaint() {
  console.log('[ImageToolbar] 重绘', props.imageNode?.id)
  emit('repaint', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 擦除（预留事件）
function handleErase() {
  console.log('[ImageToolbar] 擦除', props.imageNode?.id)
  emit('erase', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 增强（预留事件）
function handleEnhance() {
  console.log('[ImageToolbar] 增强', props.imageNode?.id)
  emit('enhance', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 抠图（预留事件）
function handleCutout() {
  console.log('[ImageToolbar] 抠图', props.imageNode?.id)
  emit('cutout', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 扩图（预留事件）
function handleExpand() {
  console.log('[ImageToolbar] 扩图', props.imageNode?.id)
  emit('expand', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 标注（预留事件）
function handleAnnotate() {
  console.log('[ImageToolbar] 标注', props.imageNode?.id)
  emit('annotate', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 裁剪 - 可实现功能
function handleCrop() {
  console.log('[ImageToolbar] 裁剪', props.imageNode?.id)
  if (!imageUrl.value) return
  
  cropImageUrl.value = imageUrl.value
  showCropModal.value = true
  emit('crop', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 下载 - 直接实现
async function handleDownload() {
  console.log('[ImageToolbar] 下载', props.imageNode?.id)
  if (!imageUrl.value) return
  
  try {
    // 使用 fetch 获取图片 blob，支持跨域下载
    const response = await fetch(imageUrl.value, {
      headers: getTenantHeaders()
    })
    const blob = await response.blob()
    
    // 创建 blob URL 并下载
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `image_${props.imageNode?.id || Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('[ImageToolbar] 下载图片失败:', error)
    // 如果 fetch 失败，尝试直接下载
    const link = document.createElement('a')
    link.href = imageUrl.value
    link.download = `image_${props.imageNode?.id || Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
  emit('download', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 放大预览 - 直接实现
function handlePreview() {
  console.log('[ImageToolbar] 放大预览', props.imageNode?.id)
  if (!imageUrl.value) return
  
  previewImageUrl.value = imageUrl.value
  showPreviewModal.value = true
  emit('preview', { 
    nodeId: props.imageNode?.id, 
    imageUrl: imageUrl.value 
  })
}

// 关闭预览弹窗
function closePreviewModal() {
  showPreviewModal.value = false
  previewImageUrl.value = ''
}

// 关闭裁剪弹窗
function closeCropModal() {
  showCropModal.value = false
  cropImageUrl.value = ''
}

// 按钮点击处理
function handleToolClick(item) {
  if (item.requiresImage && !hasImage.value) {
    console.log('[ImageToolbar] 没有可操作的图片')
    return
  }
  item.handler?.()
}

// ESC 关闭预览
function handleKeyDown(event) {
  if (event.key === 'Escape') {
    if (showPreviewModal.value) {
      closePreviewModal()
    }
    if (showCropModal.value) {
      closeCropModal()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="image-toolbar" @click.stop @mousedown.stop>
    <!-- 工具栏按钮 -->
    <template v-for="item in toolbarItems" :key="item.id">
      <!-- 分隔符 -->
      <div v-if="item.type === 'divider'" class="toolbar-divider"></div>
      
      <!-- 工具按钮 -->
      <button
        v-else
        class="toolbar-btn"
        :class="{ 
          'disabled': item.requiresImage && !hasImage,
          'icon-only': item.iconOnly
        }"
        :title="item.label"
        @click="handleToolClick(item)"
      >
        <!-- 图标 -->
        <span class="btn-icon">
          <!-- 重绘图标 -->
          <svg v-if="item.icon === 'repaint'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          
          <!-- 擦除图标 -->
          <svg v-else-if="item.icon === 'erase'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18.364 5.636a9 9 0 11-12.728 0M12 3v9" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4.5 16.5l3-3 3 3-3 3-3-3z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          
          <!-- 增强图标 -->
          <svg v-else-if="item.icon === 'enhance'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
            <text x="12" y="15" text-anchor="middle" font-size="8" font-weight="bold" fill="currentColor" stroke="none">HD</text>
          </svg>
          
          <!-- 抠图图标 -->
          <svg v-else-if="item.icon === 'cutout'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="5" stroke-dasharray="3 2"/>
          </svg>
          
          <!-- 扩图图标 -->
          <svg v-else-if="item.icon === 'expand'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="6" y="6" width="12" height="12" rx="1" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 9V5a2 2 0 012-2h4M15 3h4a2 2 0 012 2v4M21 15v4a2 2 0 01-2 2h-4M9 21H5a2 2 0 01-2-2v-4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          
          <!-- 标注图标 -->
          <svg v-else-if="item.icon === 'annotate'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          
          <!-- 裁剪图标 -->
          <svg v-else-if="item.icon === 'crop'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M6 2v4M6 18v4M2 6h4M18 6h4M18 18h-8a2 2 0 01-2-2V6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 6h10a2 2 0 012 2v10" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          
          <!-- 下载图标 -->
          <svg v-else-if="item.icon === 'download'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          
          <!-- 放大预览图标 -->
          <svg v-else-if="item.icon === 'preview'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        
        <!-- 文字标签（非仅图标模式） -->
        <span v-if="!item.iconOnly" class="btn-label">{{ item.label }}</span>
      </button>
    </template>
  </div>
  
  <!-- 放大预览弹窗 -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="showPreviewModal" class="preview-modal-overlay" @click="closePreviewModal">
        <div class="preview-modal-content" @click.stop>
          <img :src="previewImageUrl" alt="预览图片" class="preview-image" />
          <button class="preview-close-btn" @click="closePreviewModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="preview-actions">
            <button class="preview-action-btn" @click="handleDownload">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>下载</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  user-select: none;
}

/* 分隔符 */
.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 6px;
}

/* 工具按钮 */
.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.toolbar-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.toolbar-btn:active:not(.disabled) {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(0.98);
}

.toolbar-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn.icon-only {
  padding: 8px;
}

/* 图标 */
.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.btn-icon svg {
  width: 100%;
  height: 100%;
}

/* 标签 */
.btn-label {
  font-weight: 500;
}

/* ========== 预览弹窗 ========== */
.preview-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  cursor: zoom-out;
}

.preview-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
}

.preview-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.preview-close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  width: 32px;
  height: 32px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.preview-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.preview-close-btn svg {
  width: 16px;
  height: 16px;
}

.preview-actions {
  position: absolute;
  bottom: -50px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
}

.preview-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preview-action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.preview-action-btn svg {
  width: 18px;
  height: 18px;
}

/* 弹窗动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .preview-image,
.modal-fade-leave-to .preview-image {
  transform: scale(0.9);
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   ImageToolbar 白昼模式样式适配
   ======================================== */
:root.canvas-theme-light .image-toolbar {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .image-toolbar .toolbar-divider {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .image-toolbar .toolbar-btn {
  color: #57534e;
}

:root.canvas-theme-light .image-toolbar .toolbar-btn:hover:not(.disabled) {
  background: rgba(0, 0, 0, 0.05);
  color: #1c1917;
}

:root.canvas-theme-light .image-toolbar .toolbar-btn:active:not(.disabled) {
  background: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .image-toolbar .btn-icon {
  color: #57534e;
}

:root.canvas-theme-light .image-toolbar .toolbar-btn:hover .btn-icon {
  color: #1c1917;
}
</style>

