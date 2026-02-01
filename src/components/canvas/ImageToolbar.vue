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
import { getTenantHeaders, getApiUrl } from '@/config/tenant'
import { deductCropPoints } from '@/api/canvas/nodes'

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
  'preview',      // 放大预览
  'grid-crop',    // 9宫格裁剪
  'grid4-crop'    // 4宫格裁剪
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

// 工具栏按钮配置 - 按截图顺序排列 (v2)
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
  { 
    id: 'grid-crop', 
    icon: 'grid-crop',
    label: '9宫格裁剪', 
    handler: handleGridCrop,
    requiresImage: true
  },
  { 
    id: 'grid4-crop', 
    icon: 'grid4-crop',
    label: '4宫格裁剪', 
    handler: handleGrid4Crop,
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

// 9宫格裁剪状态
const isGridCropping = ref(false)

/**
 * 获取可用于 canvas 操作的图片 URL
 * 对于外部 URL（跨域），使用后端代理绕过 CORS 限制
 */
function getProxiedImageUrl(url) {
  if (!url) return null
  
  // 如果是 data URL 或 blob URL，直接使用
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  
  // 如果是相对路径（本地存储），直接使用
  if (url.startsWith('/storage/') || url.startsWith('/api/')) {
    return url
  }
  
  // 检查是否是外部 URL（以 http:// 或 https:// 开头）
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // 检查是否是同源（当前后端的域名）
    const currentHost = window.location.host
    try {
      const urlObj = new URL(url)
      // 如果是同一个域名，直接使用
      if (urlObj.host === currentHost) {
        return url
      }
    } catch (e) {
      // URL 解析失败，继续使用代理
    }
    
    // 外部 URL，使用代理接口绕过 CORS
    console.log('[ImageToolbar] 使用代理加载外部图片:', url.substring(0, 60) + '...')
    return `${getApiUrl('/api/images/proxy')}?url=${encodeURIComponent(url)}`
  }
  
  // 其他情况直接返回
  return url
}

// 9宫格裁剪 - 将图片裁剪成9份并创建组
async function handleGridCrop() {
  console.log('[ImageToolbar] 9宫格裁剪', props.imageNode?.id)
  if (!imageUrl.value || isGridCropping.value) return
  
  isGridCropping.value = true
  
  try {
    // 先扣除积分
    try {
      const deductResult = await deductCropPoints('grid9')
      if (deductResult.pointsCost > 0) {
        console.log(`[ImageToolbar] 9宫格裁剪：已扣除 ${deductResult.pointsCost} 积分`)
      }
    } catch (deductError) {
      console.error('[ImageToolbar] 9宫格裁剪：积分扣除失败', deductError)
      alert(deductError.message || '积分不足，无法执行裁剪操作')
      isGridCropping.value = false
      return
    }
    
    // 加载图片 - 使用代理URL绕过CORS限制
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const proxiedUrl = getProxiedImageUrl(imageUrl.value)
    console.log('[ImageToolbar] 9宫格裁剪：加载图片', proxiedUrl?.substring(0, 80))
    
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = (e) => {
        console.error('[ImageToolbar] 9宫格裁剪：图片加载失败', e)
        reject(e)
      }
      img.src = proxiedUrl
    })
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / 3)
    const cellHeight = Math.floor(imgHeight / 3)
    
    // 创建9个裁剪后的图片
    const croppedImages = []
    
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const canvas = document.createElement('canvas')
        canvas.width = cellWidth
        canvas.height = cellHeight
        const ctx = canvas.getContext('2d')
        
        // 裁剪对应区域
        ctx.drawImage(
          img,
          col * cellWidth,      // 源x
          row * cellHeight,     // 源y
          cellWidth,            // 源宽
          cellHeight,           // 源高
          0,                    // 目标x
          0,                    // 目标y
          cellWidth,            // 目标宽
          cellHeight            // 目标高
        )
        
        // 转换为blob URL
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        const blobUrl = URL.createObjectURL(blob)
        croppedImages.push({
          url: blobUrl,
          row,
          col,
          index: row * 3 + col
        })
      }
    }
    
    // 计算新节点的位置（基于原节点位置）
    const baseX = props.imageNode.position?.x || 0
    const baseY = props.imageNode.position?.y || 0
    const nodeWidth = 200  // 每个小图节点的宽度
    const nodeHeight = 200 // 每个小图节点的高度
    const gap = 16         // 节点间距
    
    // 偏移到原节点右侧
    const offsetX = (props.imageNode.style?.width || 400) + 50
    
    // 创建9个图片节点
    const newNodeIds = []
    for (const item of croppedImages) {
      const nodeId = `grid-crop-${Date.now()}-${item.index}`
      const nodeX = baseX + offsetX + item.col * (nodeWidth + gap)
      const nodeY = baseY + item.row * (nodeHeight + gap)
      
      canvasStore.addNode({
        id: nodeId,
        type: 'image',
        position: { x: nodeX, y: nodeY },
        data: {
          title: `裁剪 ${item.index + 1}`,
          urls: [item.url],
          output: {
            type: 'image',
            urls: [item.url]
          }
        }
      }, true) // skipHistory = true，最后统一保存历史
      
      newNodeIds.push(nodeId)
    }
    
    // 创建编组
    if (newNodeIds.length === 9) {
      canvasStore.createGroup(newNodeIds, '9宫格裁剪')
    }
    
    console.log('[ImageToolbar] 9宫格裁剪完成，创建了', newNodeIds.length, '个节点')
    
    emit('grid-crop', { 
      nodeId: props.imageNode?.id, 
      imageUrl: imageUrl.value,
      newNodeIds
    })
    
  } catch (error) {
    console.error('[ImageToolbar] 9宫格裁剪失败:', error)
  } finally {
    isGridCropping.value = false
  }
}

// 4宫格裁剪状态
const isGrid4Cropping = ref(false)

// 4宫格裁剪 - 将图片裁剪成4份并创建组 (2x2布局)
async function handleGrid4Crop() {
  console.log('[ImageToolbar] 4宫格裁剪', props.imageNode?.id)
  if (!imageUrl.value || isGrid4Cropping.value) return
  
  isGrid4Cropping.value = true
  
  try {
    // 先扣除积分
    try {
      const deductResult = await deductCropPoints('grid4')
      if (deductResult.pointsCost > 0) {
        console.log(`[ImageToolbar] 4宫格裁剪：已扣除 ${deductResult.pointsCost} 积分`)
      }
    } catch (deductError) {
      console.error('[ImageToolbar] 4宫格裁剪：积分扣除失败', deductError)
      alert(deductError.message || '积分不足，无法执行裁剪操作')
      isGrid4Cropping.value = false
      return
    }
    
    // 加载图片 - 使用代理URL绕过CORS限制
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const proxiedUrl = getProxiedImageUrl(imageUrl.value)
    console.log('[ImageToolbar] 4宫格裁剪：加载图片', proxiedUrl?.substring(0, 80))
    
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = (e) => {
        console.error('[ImageToolbar] 4宫格裁剪：图片加载失败', e)
        reject(e)
      }
      img.src = proxiedUrl
    })
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / 2)
    const cellHeight = Math.floor(imgHeight / 2)
    
    // 创建4个裁剪后的图片 (2x2)
    const croppedImages = []
    
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const canvas = document.createElement('canvas')
        canvas.width = cellWidth
        canvas.height = cellHeight
        const ctx = canvas.getContext('2d')
        
        // 裁剪对应区域
        ctx.drawImage(
          img,
          col * cellWidth,      // 源x
          row * cellHeight,     // 源y
          cellWidth,            // 源宽
          cellHeight,           // 源高
          0,                    // 目标x
          0,                    // 目标y
          cellWidth,            // 目标宽
          cellHeight            // 目标高
        )
        
        // 转换为blob URL
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        const blobUrl = URL.createObjectURL(blob)
        croppedImages.push({
          url: blobUrl,
          row,
          col,
          index: row * 2 + col
        })
      }
    }
    
    // 计算新节点的位置（基于原节点位置）
    const baseX = props.imageNode.position?.x || 0
    const baseY = props.imageNode.position?.y || 0
    const nodeWidth = 200  // 每个小图节点的宽度
    const nodeHeight = 200 // 每个小图节点的高度
    const gap = 16         // 节点间距
    
    // 偏移到原节点右侧
    const offsetX = (props.imageNode.style?.width || 400) + 50
    
    // 创建4个图片节点
    const newNodeIds = []
    for (const item of croppedImages) {
      const nodeId = `grid4-crop-${Date.now()}-${item.index}`
      const nodeX = baseX + offsetX + item.col * (nodeWidth + gap)
      const nodeY = baseY + item.row * (nodeHeight + gap)
      
      canvasStore.addNode({
        id: nodeId,
        type: 'image',
        position: { x: nodeX, y: nodeY },
        data: {
          title: `裁剪 ${item.index + 1}`,
          urls: [item.url],
          output: {
            type: 'image',
            urls: [item.url]
          }
        }
      }, true) // skipHistory = true，最后统一保存历史
      
      newNodeIds.push(nodeId)
    }
    
    // 创建编组
    if (newNodeIds.length === 4) {
      canvasStore.createGroup(newNodeIds, '4宫格裁剪')
    }
    
    console.log('[ImageToolbar] 4宫格裁剪完成，创建了', newNodeIds.length, '个节点')
    
    emit('grid4-crop', { 
      nodeId: props.imageNode?.id, 
      imageUrl: imageUrl.value,
      newNodeIds
    })
    
  } catch (error) {
    console.error('[ImageToolbar] 4宫格裁剪失败:', error)
  } finally {
    isGrid4Cropping.value = false
  }
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

// 下载 - 统一使用后端代理下载，解决跨域和第三方CDN预览问题
// 对于 dataUrl 格式的图片（如裁剪后的图片），直接在前端下载
// 🔧 修复：确保下载原图，去除七牛云压缩参数
async function handleDownload() {
  console.log('[ImageToolbar] 下载', props.imageNode?.id)
  if (!imageUrl.value) return
  
  const filename = `image_${props.imageNode?.id || Date.now()}.png`
  
  try {
    const url = imageUrl.value
    
    // 如果是 dataUrl（base64），直接在前端转换为 Blob 下载
    // 避免 URL 过长导致请求失败（dataUrl 通常几十KB到几MB）
    if (url.startsWith('data:')) {
      console.log('[ImageToolbar] dataUrl 格式图片，使用前端直接下载')
      const blob = dataUrlToBlob(url)
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
      emit('download', { nodeId: props.imageNode?.id, imageUrl: imageUrl.value })
      return
    }
    
    // 如果是 blob URL，直接使用
    if (url.startsWith('blob:')) {
      console.log('[ImageToolbar] blob URL 格式图片，使用前端直接下载')
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
      emit('download', { nodeId: props.imageNode?.id, imageUrl: imageUrl.value })
      return
    }
    
    // 🔧 修复：使用 buildDownloadUrl 构建下载链接，会自动清理七牛云压缩参数，确保下载原图
    const { buildDownloadUrl, isQiniuCdnUrl } = await import('@/api/client')
    const downloadUrl = buildDownloadUrl(url, filename)
    
    // 七牛云 URL 直接下载（节省服务器流量）
    if (isQiniuCdnUrl(url)) {
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      console.log('[ImageToolbar] 七牛云直接下载原图:', filename)
      setTimeout(() => document.body.removeChild(link), 100)
      emit('download', { nodeId: props.imageNode?.id, imageUrl: imageUrl.value })
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
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(blobUrl)
    console.log('[ImageToolbar] 下载原图成功:', filename)
  } catch (error) {
    console.error('[ImageToolbar] 下载图片失败:', error)
    // 🔧 修复：使用带认证头的下载方式，解决前后端分离架构下的 401 错误
    try {
      const { buildDownloadUrl, downloadWithAuth } = await import('@/api/client')
      const downloadUrl = buildDownloadUrl(imageUrl.value, filename)
      await downloadWithAuth(downloadUrl, filename)
    } catch (e) {
      console.error('[ImageToolbar] 所有下载方式都失败:', e)
    }
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
          
          <!-- 9宫格裁剪图标 -->
          <svg v-else-if="item.icon === 'grid-crop'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <!-- 外框 -->
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- 垂直分割线 -->
            <line x1="9" y1="3" x2="9" y2="21" stroke-linecap="round"/>
            <line x1="15" y1="3" x2="15" y2="21" stroke-linecap="round"/>
            <!-- 水平分割线 -->
            <line x1="3" y1="9" x2="21" y2="9" stroke-linecap="round"/>
            <line x1="3" y1="15" x2="21" y2="15" stroke-linecap="round"/>
          </svg>
          
          <!-- 4宫格裁剪图标 -->
          <svg v-else-if="item.icon === 'grid4-crop'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <!-- 外框 -->
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- 垂直分割线 (中间一条) -->
            <line x1="12" y1="3" x2="12" y2="21" stroke-linecap="round"/>
            <!-- 水平分割线 (中间一条) -->
            <line x1="3" y1="12" x2="21" y2="12" stroke-linecap="round"/>
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

