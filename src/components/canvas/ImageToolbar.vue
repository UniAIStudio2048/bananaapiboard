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
import { uploadCanvasMedia } from '@/api/canvas/workflow'

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

// 预览缩放和拖动状态
const previewScale = ref(1)
const previewPosition = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const lastPosition = ref({ x: 0, y: 0 })

// 裁剪弹窗状态
const showCropModal = ref(false)
const cropImageUrl = ref('')

// 宫格裁剪选项菜单状态
const gridCropMenuType = ref(null) // 'grid9' | 'grid4' | null
const gridCropMenuJustOpened = ref(false) // 防止打开后立即关闭

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
    handler: () => showGridCropMenu('grid9'),
    requiresImage: true
  },
  { 
    id: 'grid4-crop', 
    icon: 'grid4-crop',
    label: '4宫格裁剪', 
    handler: () => showGridCropMenu('grid4'),
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
 * 🔧 后台异步上传裁剪图到云端
 */
async function uploadCropToCloud(nodeId, file, blobUrl) {
  try {
    console.log(`[ImageToolbar] 后台上传裁剪图到云端:`, file.name)
    const result = await uploadCanvasMedia(file, 'image')
    const cloudUrl = result.url
    console.log(`[ImageToolbar] 裁剪图上传成功:`, cloudUrl)
    
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (node) {
      const newSourceImages = (node.data.sourceImages || []).map(url => url === blobUrl ? cloudUrl : url)
      canvasStore.updateNodeData(nodeId, { sourceImages: newSourceImages, isUploading: false })
    }
    
    try { URL.revokeObjectURL(blobUrl) } catch (e) { /* ignore */ }
  } catch (error) {
    console.error(`[ImageToolbar] 裁剪图上传失败:`, error.message)
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (node) {
      canvasStore.updateNodeData(nodeId, { isUploading: false, uploadFailed: true })
    }
  }
}

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

// ========== 宫格裁剪选项菜单 ==========

// 显示宫格裁剪选项菜单
function showGridCropMenu(type) {
  gridCropMenuType.value = type
  gridCropMenuJustOpened.value = true
  // 短暂延迟后重置标志
  setTimeout(() => {
    gridCropMenuJustOpened.value = false
  }, 100)
}

// 关闭宫格裁剪选项菜单
function closeGridCropMenu() {
  gridCropMenuType.value = null
}

// 执行仅裁剪
function handleGridCropOnly() {
  const type = gridCropMenuType.value
  closeGridCropMenu()
  if (type === 'grid9') {
    handleGridCrop()
  } else if (type === 'grid4') {
    handleGrid4Crop()
  }
}

// 执行裁剪并创建分镜格子
async function handleGridCropToStoryboard() {
  const type = gridCropMenuType.value
  closeGridCropMenu()
  
  if (type === 'grid9') {
    await createStoryboardFromCrop(3, 3)
  } else if (type === 'grid4') {
    await createStoryboardFromCrop(2, 2)
  }
}

// 裁剪图片并创建分镜格子节点
async function createStoryboardFromCrop(cols, rows) {
  const gridType = cols === 3 ? 'grid9' : 'grid4'
  const count = cols * rows
  
  console.log(`[ImageToolbar] 创建分镜格子 ${cols}x${rows}`, props.imageNode?.id)
  if (!imageUrl.value) return
  
  try {
    // 先扣除积分
    try {
      const deductResult = await deductCropPoints(gridType)
      if (deductResult.pointsCost > 0) {
        console.log(`[ImageToolbar] ${cols}x${rows}裁剪：已扣除 ${deductResult.pointsCost} 积分`)
      }
    } catch (deductError) {
      console.error(`[ImageToolbar] ${cols}x${rows}裁剪：积分扣除失败`, deductError)
      alert(deductError.message || '积分不足，无法执行裁剪操作')
      return
    }
    
    // 加载图片
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const proxiedUrl = getProxiedImageUrl(imageUrl.value)
    
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = proxiedUrl
    })
    
    const imgWidth = img.naturalWidth
    const imgHeight = img.naturalHeight
    const cellWidth = Math.floor(imgWidth / cols)
    const cellHeight = Math.floor(imgHeight / rows)
    
    // 计算比例
    const cellRatio = cellWidth / cellHeight
    let aspectRatio = '16:9'
    if (Math.abs(cellRatio - 16/9) < 0.1) aspectRatio = '16:9'
    else if (Math.abs(cellRatio - 9/16) < 0.1) aspectRatio = '9:16'
    else if (Math.abs(cellRatio - 1) < 0.1) aspectRatio = '1:1'
    else if (Math.abs(cellRatio - 4/3) < 0.1) aspectRatio = '4:3'
    else if (Math.abs(cellRatio - 3/4) < 0.1) aspectRatio = '3:4'
    
    // 裁剪并上传所有图片
    const croppedUrls = []
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const canvas = document.createElement('canvas')
        canvas.width = cellWidth
        canvas.height = cellHeight
        const ctx = canvas.getContext('2d')
        
        ctx.drawImage(
          img,
          col * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight,
          0,
          0,
          cellWidth,
          cellHeight
        )
        
        // 转为 blob 并上传
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
        const file = new File([blob], `storyboard-${row * cols + col}.jpg`, { type: 'image/jpeg' })
        
        // 上传到云端
        const uploadedUrl = await uploadCanvasMedia(file)
        croppedUrls.push(uploadedUrl)
      }
    }
    
    // 计算分镜格子节点位置
    const baseX = props.imageNode.position?.x || 0
    const baseY = props.imageNode.position?.y || 0
    const offsetX = (props.imageNode.style?.width || 400) + 100
    
    // 创建分镜格子节点
    const nodeId = `storyboard-${Date.now()}`
    const gridSize = `${cols}x${rows}`
    
    // 填充图片数组（9个位置，未使用的填 null）
    const imagesArray = Array(9).fill(null)
    croppedUrls.forEach((url, i) => {
      imagesArray[i] = url
    })
    
    canvasStore.addNode({
      id: nodeId,
      type: 'storyboard',
      position: { x: baseX + offsetX, y: baseY },
      data: {
        title: `${cols}x${rows}分镜`,
        gridSize: gridSize,
        aspectRatio: aspectRatio,
        gridScale: 1,
        images: imagesArray,
        output: null,
        nodeWidth: 720
      }
    })
    
    console.log(`[ImageToolbar] 创建分镜格子完成: ${nodeId}`)
    
  } catch (error) {
    console.error('[ImageToolbar] 创建分镜格子失败:', error)
    alert('创建分镜格子失败，请重试')
  }
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
        
        // 🔧 改进：使用 JPEG 格式压缩，转为 blob URL + 后台上传云端
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
        const blobUrl = URL.createObjectURL(blob)
        croppedImages.push({
          url: blobUrl,
          blob,
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
          nodeRole: 'source',
          sourceImages: [item.url],
          isGenerated: true,
          fromGridCrop: true,
          isUploading: true
        }
      }, true) // skipHistory = true，最后统一保存历史
      
      newNodeIds.push(nodeId)
      
      // 🔧 后台异步上传裁剪图到云端
      const cropFile = new File([item.blob], `grid-crop-${item.index}.jpg`, { type: 'image/jpeg' })
      uploadCropToCloud(nodeId, cropFile, item.url)
    }
    
    // 创建编组
    if (newNodeIds.length === 9) {
      canvasStore.createGroup(newNodeIds, '9宫格裁剪')
    }
    
    console.log('[ImageToolbar] 9宫格裁剪完成，创建了', newNodeIds.length, '个节点，正在后台上传到云端')
    
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

// 🔧 修复：使用 smartDownload 统一下载，解决跨域和扩展名不匹配问题
async function handleDownload() {
  console.log('[ImageToolbar] 下载', props.imageNode?.id)
  if (!imageUrl.value) return
  
  const filename = `image_${props.imageNode?.id || Date.now()}.png`
  
  try {
    const url = imageUrl.value
    
    // dataUrl 直接在前端转换下载
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
    
    // 统一使用 smartDownload（fetch+blob，自动修正扩展名，解决跨域）
    const { smartDownload } = await import('@/api/client')
    await smartDownload(url, filename)
    console.log('[ImageToolbar] 下载原图成功:', filename)
  } catch (error) {
    console.error('[ImageToolbar] 下载图片失败:', error)
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
  resetPreviewState()
}

// 重置预览状态
function resetPreviewState() {
  previewScale.value = 1
  previewPosition.value = { x: 0, y: 0 }
  isDragging.value = false
}

// 处理滚轮缩放
function handlePreviewWheel(event) {
  event.preventDefault()
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.min(Math.max(previewScale.value + delta, 0.5), 5)
  previewScale.value = newScale
}

// 处理鼠标按下（开始拖动）
function handlePreviewMouseDown(event) {
  if (event.button !== 0) return // 只响应左键
  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
  lastPosition.value = { ...previewPosition.value }
  event.preventDefault()
}

// 处理鼠标移动（拖动中）
function handlePreviewMouseMove(event) {
  if (!isDragging.value) return
  const dx = event.clientX - dragStart.value.x
  const dy = event.clientY - dragStart.value.y
  previewPosition.value = {
    x: lastPosition.value.x + dx,
    y: lastPosition.value.y + dy
  }
}

// 处理鼠标释放（结束拖动）
function handlePreviewMouseUp() {
  isDragging.value = false
}

// 放大
function handleZoomIn() {
  previewScale.value = Math.min(previewScale.value + 0.25, 5)
}

// 缩小
function handleZoomOut() {
  previewScale.value = Math.max(previewScale.value - 0.25, 0.5)
}

// 重置缩放
function handleZoomReset() {
  previewScale.value = 1
  previewPosition.value = { x: 0, y: 0 }
}

// 添加到我的资产
async function handleAddToAssets() {
  if (!imageUrl.value) return
  
  try {
    // 导入资产API
    const { saveAsset } = await import('@/api/canvas/assets')
    
    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `画布图片_${timestamp}`
    
    await saveAsset({
      type: 'image',
      name: fileName,
      url: imageUrl.value,
      thumbnail_url: imageUrl.value,
      source_node_id: props.imageNode?.id || null,
      tags: ['画布', '预览保存']
    })
    
    // 显示成功提示
    console.log('[ImageToolbar] 已添加到资产库:', fileName)
    
    // 创建一个临时的成功提示
    showSuccessToast('已成功添加到我的资产！')
  } catch (error) {
    console.error('[ImageToolbar] 添加到资产失败:', error)
    showErrorToast('添加失败，请重试')
  }
}

// 简单的提示函数
function showSuccessToast(message) {
  const toast = document.createElement('div')
  toast.className = 'preview-toast success'
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: rgba(34, 197, 94, 0.9);
    color: white;
    border-radius: 8px;
    font-size: 14px;
    z-index: 999999;
    animation: fadeInOut 2s ease forwards;
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2000)
}

function showErrorToast(message) {
  const toast = document.createElement('div')
  toast.className = 'preview-toast error'
  toast.textContent = message
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    border-radius: 8px;
    font-size: 14px;
    z-index: 999999;
    animation: fadeInOut 2s ease forwards;
  `
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2000)
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
    if (gridCropMenuType.value) {
      closeGridCropMenu()
      return
    }
    if (showPreviewModal.value) {
      closePreviewModal()
    }
    if (showCropModal.value) {
      closeCropModal()
    }
  }
}

// 点击工具栏外部关闭宫格菜单
function handleToolbarClick(event) {
  // 如果菜单刚打开，忽略这次点击
  if (gridCropMenuJustOpened.value) return
  
  // 如果点击的不是菜单内部，关闭菜单
  if (gridCropMenuType.value) {
    const menu = event.target.closest('.grid-crop-menu')
    if (!menu) {
      closeGridCropMenu()
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
  <div class="image-toolbar" @click.stop="handleToolbarClick" @mousedown.stop>
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
    
    <!-- 宫格裁剪选项菜单 -->
    <div 
      v-if="gridCropMenuType" 
      class="grid-crop-menu"
      @click.stop
    >
      <div class="grid-crop-menu-title">
        {{ gridCropMenuType === 'grid9' ? '9宫格裁剪' : '4宫格裁剪' }}
      </div>
      <button class="grid-crop-menu-item" @click="handleGridCropOnly">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="12" y1="3" x2="12" y2="21"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
        </svg>
        <span>仅裁剪</span>
        <span class="menu-hint">创建独立图片节点</span>
      </button>
      <button class="grid-crop-menu-item" @click="handleGridCropToStoryboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="2" width="20" height="20" rx="2"/>
          <rect x="5" y="5" width="5" height="5" rx="0.5"/>
          <rect x="14" y="5" width="5" height="5" rx="0.5"/>
          <rect x="5" y="14" width="5" height="5" rx="0.5"/>
          <rect x="14" y="14" width="5" height="5" rx="0.5"/>
        </svg>
        <span>创建分镜格子</span>
        <span class="menu-hint">自动填充到分镜节点</span>
      </button>
      <button class="grid-crop-menu-close" @click="closeGridCropMenu">取消</button>
    </div>
  </div>
  
  <!-- 放大预览弹窗 -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div 
        v-if="showPreviewModal" 
        class="preview-modal-overlay" 
        @click="closePreviewModal"
        @wheel.prevent="handlePreviewWheel"
        @mousemove="handlePreviewMouseMove"
        @mouseup="handlePreviewMouseUp"
        @mouseleave="handlePreviewMouseUp"
      >
        <!-- 关闭按钮 -->
        <button class="preview-close-btn" @click.stop="closePreviewModal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        
        <!-- 缩放控制按钮 -->
        <div class="preview-zoom-controls" @click.stop>
          <button class="zoom-btn" @click="handleZoomOut" title="缩小">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35M8 11h6"/>
            </svg>
          </button>
          <span class="zoom-level">{{ Math.round(previewScale * 100) }}%</span>
          <button class="zoom-btn" @click="handleZoomIn" title="放大">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
            </svg>
          </button>
          <button class="zoom-btn reset" @click="handleZoomReset" title="重置">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>
        
        <!-- 图片容器 -->
        <div 
          class="preview-image-container" 
          @click.stop
          @mousedown="handlePreviewMouseDown"
          :class="{ dragging: isDragging }"
        >
          <img 
            :src="previewImageUrl" 
            alt="预览图片" 
            class="preview-image" 
            :style="{
              transform: `translate(${previewPosition.x}px, ${previewPosition.y}px) scale(${previewScale})`,
              cursor: isDragging ? 'grabbing' : (previewScale > 1 ? 'grab' : 'default')
            }"
            draggable="false"
          />
        </div>
        
        <!-- 底部操作按钮 -->
        <div class="preview-actions" @click.stop>
          <button class="preview-action-btn" @click="handleDownload">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>下载</span>
          </button>
          <button class="preview-action-btn add-asset-btn" @click="handleAddToAssets">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>加入资产</span>
          </button>
        </div>
        
        <!-- 操作提示 -->
        <div class="preview-hint">
          滚轮缩放 · 拖动查看细节
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

/* ========== 宫格裁剪选项菜单 ========== */
.grid-crop-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 8px;
  min-width: 200px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  z-index: 100;
}

.grid-crop-menu-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding: 4px 12px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 4px;
}

.grid-crop-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  position: relative;
}

.grid-crop-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.grid-crop-menu-item svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.7);
}

.grid-crop-menu-item .menu-hint {
  position: absolute;
  right: 12px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.grid-crop-menu-close {
  display: block;
  width: 100%;
  padding: 8px 12px;
  margin-top: 4px;
  background: transparent;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.grid-crop-menu-close:hover {
  color: rgba(255, 255, 255, 0.8);
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
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  cursor: default;
  overflow: hidden;
}

/* 图片容器 */
.preview-image-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.preview-image-container.dragging {
  cursor: grabbing !important;
}

.preview-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  transition: transform 0.1s ease-out;
  user-select: none;
  -webkit-user-drag: none;
}

/* 关闭按钮 */
.preview-close-btn {
  position: fixed;
  top: 24px;
  right: 24px;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 10;
  backdrop-filter: blur(8px);
}

.preview-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.preview-close-btn svg {
  width: 20px;
  height: 20px;
}

/* 缩放控制 */
.preview-zoom-controls {
  position: fixed;
  top: 24px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  backdrop-filter: blur(8px);
  z-index: 10;
}

.zoom-btn {
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.zoom-btn.reset {
  margin-left: 4px;
}

.zoom-btn svg {
  width: 18px;
  height: 18px;
}

.zoom-level {
  min-width: 50px;
  text-align: center;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  font-family: 'SF Mono', 'Monaco', monospace;
}

/* 底部操作按钮 */
.preview-actions {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  z-index: 10;
}

.preview-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(8px);
}

.preview-action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.preview-action-btn svg {
  width: 18px;
  height: 18px;
}

.preview-action-btn.add-asset-btn {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
}

.preview-action-btn.add-asset-btn:hover {
  background: rgba(59, 130, 246, 0.5);
}

/* 操作提示 */
.preview-hint {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
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

/* Toast动画 */
@keyframes fadeInOut {
  0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  15% { opacity: 1; transform: translateX(-50%) translateY(0); }
  85% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}
</style>

