<script setup>
/**
 * HistoryPanel.vue - 历史记录面板
 * 使用真正的虚拟滚动实现，只渲染可视区域的内容
 * 历史记录在服务器缓存7天，过期自动清理
 * 支持放大预览（滚轮缩放、拖拽平移）、下载、删除
 * 支持右键菜单（加入资产、下载、添加到画布、预览、删除）
 * 支持直接拖拽到画布
 * 
 * 性能优化:
 * - 虚拟滚动: 只渲染可视区域内的项目
 * - 数据缓存: 避免重复加载
 * - 并行请求: 图片和视频同时获取
 * - 延迟渲染: 面板动画完成后再渲染列表
 * - 视频缩略图节流: 限制同时提取数量
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick, shallowRef } from 'vue'
import { getHistory, getHistoryDetail, deleteHistory } from '@/api/canvas/history'
import { saveAsset } from '@/api/canvas/assets'
import { useI18n } from '@/i18n'

const { t, currentLanguage } = useI18n()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'apply-history'])

// ========== 状态 ==========
const loading = ref(false)
const historyList = shallowRef([]) // 使用 shallowRef 优化大数组
const selectedType = ref('all') // all | image | video | audio
const searchQuery = ref('')

// 滚动容器引用
const scrollContainerRef = ref(null)

// ========== 虚拟滚动状态 ==========
const ITEM_HEIGHT = 180 // 每个卡片的估计高度（包含间距）
const BUFFER_COUNT = 6 // 上下缓冲区域的项目数
const scrollTop = ref(0)
const containerHeight = ref(600) // 容器高度
const isContentReady = ref(false) // 内容是否准备好渲染（延迟渲染用）

// 全屏预览状态
const showPreview = ref(false)
const previewItem = ref(null)
const previewVideoRef = ref(null)

// 预览图片缩放和平移状态
const previewScale = ref(1)
const previewTranslate = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const lastTranslate = ref({ x: 0, y: 0 })

// 视频缩略图缓存
const videoThumbnails = ref({})
const videoThumbnailQueue = ref([]) // 待处理队列
const processingThumbnails = ref(0) // 正在处理的数量
const MAX_CONCURRENT_THUMBNAILS = 2 // 最大同时处理数

// 图片加载失败的记录
const imageLoadErrors = ref({})

// 删除确认弹窗状态
const showDeleteConfirm = ref(false)
const deleteTarget = ref(null)

// 右键菜单状态
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuItem = ref(null)

// 数据缓存标记
const dataCached = ref(false)
const lastLoadTime = ref(0)
const CACHE_DURATION = 60000 // 缓存有效期 60 秒

// 保存中状态
const savingAsset = ref(false)

// 文件类型
const fileTypes = [
  { key: 'all', labelKey: 'common.all', icon: '◈' },
  { key: 'image', labelKey: 'canvas.nodes.image', icon: '◫' },
  { key: 'video', labelKey: 'canvas.nodes.video', icon: '▷' },
  { key: 'audio', labelKey: 'canvas.nodes.audio', icon: '♪' }
]

// 筛选后的历史记录（全部）
const filteredHistory = computed(() => {
  let result = historyList.value

  // 按类型筛选
  if (selectedType.value !== 'all') {
    result = result.filter(h => h.type === selectedType.value)
  }

  // 搜索
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(h => 
      h.name?.toLowerCase().includes(query) ||
      h.prompt?.toLowerCase().includes(query) ||
      h.model?.toLowerCase().includes(query)
    )
  }

  return result
})

// ========== 虚拟滚动计算 ==========
// 计算可见项目（使用瀑布流双列布局）
const visibleItems = computed(() => {
  if (!isContentReady.value) return []
  
  const items = filteredHistory.value
  const total = items.length
  
  // 如果数据量小于 50，直接渲染全部（不需要虚拟滚动）
  if (total <= 50) {
    return items.map((item, index) => ({ item, index }))
  }
  
  // 计算瀑布流中每行有 2 个项目
  const itemsPerRow = 2
  const rowHeight = ITEM_HEIGHT
  
  // 计算可见的行范围
  const startRow = Math.max(0, Math.floor(scrollTop.value / rowHeight) - BUFFER_COUNT)
  const endRow = Math.ceil((scrollTop.value + containerHeight.value) / rowHeight) + BUFFER_COUNT
  
  // 转换为项目索引范围
  const startIndex = startRow * itemsPerRow
  const endIndex = Math.min(total, (endRow + 1) * itemsPerRow)
  
  // 返回可见项目及其索引
  const visible = []
  for (let i = startIndex; i < endIndex; i++) {
    if (items[i]) {
      visible.push({ item: items[i], index: i })
    }
  }
  
  return visible
})

// 虚拟滚动的总高度（用于滚动条）
const totalHeight = computed(() => {
  const total = filteredHistory.value.length
  const rows = Math.ceil(total / 2)
  return rows * ITEM_HEIGHT
})

// 虚拟滚动的偏移量
const offsetY = computed(() => {
  const items = filteredHistory.value
  if (items.length <= 50) return 0
  
  const itemsPerRow = 2
  const startRow = Math.max(0, Math.floor(scrollTop.value / ITEM_HEIGHT) - BUFFER_COUNT)
  return startRow * ITEM_HEIGHT
})

// 按类型分组的统计
const historyStats = computed(() => {
  const stats = { all: 0, image: 0, video: 0, audio: 0 }
  historyList.value.forEach(h => {
    stats.all++
    if (stats[h.type] !== undefined) {
      stats[h.type]++
    }
  })
  return stats
})

// ========== 方法 ==========

// 处理滚动事件（节流）
let scrollRAF = null
function handleScroll(e) {
  if (scrollRAF) return
  
  scrollRAF = requestAnimationFrame(() => {
    scrollTop.value = e.target.scrollTop
    scrollRAF = null
  })
}

// 更新容器高度
function updateContainerHeight() {
  if (scrollContainerRef.value) {
    containerHeight.value = scrollContainerRef.value.clientHeight
  }
}

// 加载历史记录（带缓存）
async function loadHistory(forceRefresh = false) {
  const now = Date.now()
  
  // 如果有缓存且未过期，使用缓存
  if (!forceRefresh && dataCached.value && (now - lastLoadTime.value < CACHE_DURATION)) {
    console.log('[HistoryPanel] 使用缓存数据')
    return
  }
  
  loading.value = true
  try {
    const result = await getHistory()
    historyList.value = result.history || []
    dataCached.value = true
    lastLoadTime.value = now
    console.log('[HistoryPanel] 加载历史记录:', historyList.value.length, '条')
  } catch (error) {
    console.error('[HistoryPanel] 加载历史记录失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取预览内容
function getPreviewContent(item) {
  switch (item.type) {
    case 'image':
      return item.thumbnail_url || item.url
    case 'video':
      return item.thumbnail_url || item.url
    case 'audio':
      return null
    default:
      return null
  }
}

// 格式化时间
function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  const now = new Date()
  const diff = now - d
  
  if (diff < 60000) return t('time.justNow')
  if (diff < 3600000) return t('time.minutesAgo', { '0': Math.floor(diff / 60000) })
  if (diff < 86400000) return t('time.hoursAgo', { '0': Math.floor(diff / 3600000) })
  if (diff < 604800000) return t('time.daysAgo', { '0': Math.floor(diff / 86400000) })
  
  return d.toLocaleDateString()
}

// 格式化尺寸/分辨率
function formatSize(item) {
  if (item.size) return item.size
  if (item.aspect_ratio) return item.aspect_ratio
  return ''
}

// 删除历史记录 - 打开确认弹窗
function handleDelete(e, item) {
  if (e) e.stopPropagation()
  closeContextMenu()
  deleteTarget.value = item
  showDeleteConfirm.value = true
}

// 取消删除
function cancelDelete() {
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

// 确认删除
async function confirmDelete() {
  if (!deleteTarget.value) return
  
  const item = deleteTarget.value
  showDeleteConfirm.value = false
  
  try {
    await deleteHistory(item.id, item.type)
    historyList.value = historyList.value.filter(h => h.id !== item.id)
    
    // 如果在预览模式下删除了当前预览的项，关闭预览
    if (previewItem.value && previewItem.value.id === item.id) {
      closePreview()
    }
    
    deleteTarget.value = null
  } catch (error) {
    console.error('[HistoryPanel] 删除历史记录失败:', error)
    deleteTarget.value = null
  }
}

// 下载文件
function handleDownload(item) {
  if (!item.url) return
  closeContextMenu()
  
  const a = document.createElement('a')
  a.href = item.url
  a.download = item.name || `${item.type}_${item.id}`
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// 点击历史记录 - 打开全屏预览
function handleHistoryClick(item) {
  previewItem.value = item
  showPreview.value = true
  // 重置缩放和平移状态
  previewScale.value = 1
  previewTranslate.value = { x: 0, y: 0 }
}

// 关闭全屏预览
function closePreview() {
  showPreview.value = false
  previewItem.value = null
  previewScale.value = 1
  previewTranslate.value = { x: 0, y: 0 }
}

// ========== 右键菜单 ==========

// 打开右键菜单
function handleContextMenu(e, item) {
  e.preventDefault()
  e.stopPropagation()
  
  contextMenuItem.value = item
  contextMenuPosition.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

// 关闭右键菜单
function closeContextMenu() {
  showContextMenu.value = false
  contextMenuItem.value = null
}

// Toast 通知
function showToast(message, type = 'info') {
  const toast = document.createElement('div')
  toast.className = `history-toast history-toast-${type}`
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span class="toast-text">${message}</span>
  `
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #2563eb)'};
    color: white;
    padding: 12px 20px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    z-index: 100000;
    animation: historyToastIn 0.3s ease;
  `
  
  const style = document.createElement('style')
  style.textContent = `
    @keyframes historyToastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes historyToastOut {
      from { opacity: 1; transform: translateX(-50%) translateY(0); }
      to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
  `
  document.head.appendChild(style)
  document.body.appendChild(toast)
  
  setTimeout(() => {
    toast.style.animation = 'historyToastOut 0.3s ease forwards'
    setTimeout(() => {
      toast.remove()
      style.remove()
    }, 300)
  }, 2500)
}

// 加入我的资产
async function handleAddToAssets(item) {
  closeContextMenu()
  
  if (!item || !item.url) {
    console.warn('[HistoryPanel] 无效的项目，无法加入资产')
    showToast('无效的项目', 'error')
    return
  }
  
  savingAsset.value = true
  
  try {
    await saveAsset({
      type: item.type,
      name: item.name || item.prompt?.slice(0, 30) || `${item.type}_${item.id}`,
      url: item.url,
      content: item.prompt || '',
      source: 'history',
      metadata: {
        model: item.model,
        prompt: item.prompt,
        historyId: item.id
      }
    })
    
    // 显示成功提示
    showToast(t('canvas.contextMenu.assetSaved', { type: t(`canvas.nodes.${item.type}`) }), 'success')
  } catch (error) {
    console.error('[HistoryPanel] 加入资产失败:', error)
    showToast('加入资产失败：' + (error.message || '未知错误'), 'error')
  } finally {
    savingAsset.value = false
  }
}

// 添加到画布
async function handleAddToCanvas(item) {
  closeContextMenu()
  
  try {
    // 获取完整的历史记录详情（包含工作流快照）
    const detail = await getHistoryDetail(item.id)
    
    emit('apply-history', {
      ...item,
      workflow_snapshot: detail.history?.workflow_snapshot || null
    })
    
    emit('close')
  } catch (error) {
    console.error('[HistoryPanel] 获取历史记录详情失败:', error)
    // 即使获取详情失败，也尝试应用基本信息
    emit('apply-history', item)
    emit('close')
  }
}

// 预览
function handlePreview(item) {
  closeContextMenu()
  handleHistoryClick(item)
}

// ========== 预览图片缩放和平移 ==========

// 鼠标滚轮缩放
function handlePreviewWheel(e) {
  e.preventDefault()
  
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const newScale = Math.max(0.1, Math.min(10, previewScale.value + delta))
  
  // 以鼠标位置为中心缩放
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left - rect.width / 2
  const y = e.clientY - rect.top - rect.height / 2
  
  const scaleRatio = newScale / previewScale.value
  previewTranslate.value = {
    x: x - (x - previewTranslate.value.x) * scaleRatio,
    y: y - (y - previewTranslate.value.y) * scaleRatio
  }
  
  previewScale.value = newScale
}

// 开始拖拽
function handlePreviewMouseDown(e) {
  if (e.button !== 0) return // 只响应左键
  isDragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY }
  lastTranslate.value = { ...previewTranslate.value }
  e.preventDefault()
}

// 拖拽移动
function handlePreviewMouseMove(e) {
  if (!isDragging.value) return
  
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  
  previewTranslate.value = {
    x: lastTranslate.value.x + dx,
    y: lastTranslate.value.y + dy
  }
}

// 结束拖拽
function handlePreviewMouseUp() {
  isDragging.value = false
}

// 双击重置
function handlePreviewDoubleClick() {
  previewScale.value = 1
  previewTranslate.value = { x: 0, y: 0 }
}

// 缩放按钮
function zoomIn() {
  previewScale.value = Math.min(10, previewScale.value + 0.25)
}

function zoomOut() {
  previewScale.value = Math.max(0.1, previewScale.value - 0.25)
}

function resetZoom() {
  previewScale.value = 1
  previewTranslate.value = { x: 0, y: 0 }
}

// 应用到画布（包含工作流快照）
async function applyToCanvas() {
  if (!previewItem.value) return
  
  try {
    // 获取完整的历史记录详情（包含工作流快照）
    const detail = await getHistoryDetail(previewItem.value.id)
    
    emit('apply-history', {
      ...previewItem.value,
      workflow_snapshot: detail.history?.workflow_snapshot || null
    })
    
    closePreview()
    emit('close')
  } catch (error) {
    console.error('[HistoryPanel] 获取历史记录详情失败:', error)
    // 即使获取详情失败，也尝试应用基本信息
    emit('apply-history', previewItem.value)
    closePreview()
    emit('close')
  }
}

// 提取视频首帧作为缩略图（带节流，限制并发）
function extractVideoThumbnail(item) {
  if (item.type !== 'video' || !item.url) return
  if (videoThumbnails.value[item.id]) return
  
  // 如果正在处理的数量已达上限，加入队列
  if (processingThumbnails.value >= MAX_CONCURRENT_THUMBNAILS) {
    if (!videoThumbnailQueue.value.includes(item.id)) {
      videoThumbnailQueue.value.push(item.id)
    }
    return
  }
  
  processingThumbnails.value++
  
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.preload = 'metadata'
  
  const cleanup = () => {
    video.remove()
    processingThumbnails.value--
    // 处理队列中的下一个
    processNextThumbnail()
  }
  
  video.onloadeddata = () => {
    video.currentTime = 0.1
  }
  
  video.onseeked = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(video.videoWidth || 320, 320)
      canvas.height = Math.min(video.videoHeight || 180, 180)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      videoThumbnails.value[item.id] = canvas.toDataURL('image/jpeg', 0.6)
    } catch (e) {
      console.warn('[HistoryPanel] 无法提取视频缩略图:', e)
    }
    cleanup()
  }
  
  video.onerror = () => {
    console.warn('[HistoryPanel] 视频加载失败:', item.url)
    cleanup()
  }
  
  // 设置超时，防止卡住
  setTimeout(() => {
    if (processingThumbnails.value > 0 && !videoThumbnails.value[item.id]) {
      cleanup()
    }
  }, 5000)
  
  video.src = item.url
}

// 处理队列中的下一个缩略图
function processNextThumbnail() {
  if (videoThumbnailQueue.value.length === 0) return
  if (processingThumbnails.value >= MAX_CONCURRENT_THUMBNAILS) return
  
  const nextId = videoThumbnailQueue.value.shift()
  const item = historyList.value.find(h => h.id === nextId)
  if (item) {
    extractVideoThumbnail(item)
  }
}

// 获取视频缩略图（优化版：不会重复触发）
function getVideoThumbnail(item) {
  if (item.thumbnail_url) return item.thumbnail_url
  if (videoThumbnails.value[item.id]) return videoThumbnails.value[item.id]
  
  // 只有在可见区域内才触发提取
  if (isContentReady.value && !videoThumbnailQueue.value.includes(item.id)) {
    // 使用 requestIdleCallback 在空闲时处理
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => extractVideoThumbnail(item), { timeout: 2000 })
    } else {
      setTimeout(() => extractVideoThumbnail(item), 100)
    }
  }
  return null
}

// 处理图片加载错误
function handleImageError(item) {
  imageLoadErrors.value[item.id] = true
}

// 检查图片是否加载失败
function hasImageError(item) {
  return imageLoadErrors.value[item.id] === true
}

// 开始拖拽到画布
function handleDragStart(e, item) {
  e.dataTransfer.setData('application/json', JSON.stringify({
    type: 'history-insert',
    history: {
      id: item.id,
      type: item.type,
      name: item.name,
      url: item.url,
      thumbnail_url: item.thumbnail_url,
      prompt: item.prompt,
      model: item.model
    }
  }))
  e.dataTransfer.effectAllowed = 'copy'
  
  // 创建拖拽预览图
  if (item.type === 'image' && item.thumbnail_url) {
    const img = new Image()
    img.src = item.thumbnail_url
    e.dataTransfer.setDragImage(img, 50, 50)
  }
}

// 拖拽结束
function handleDragEnd(e) {
  // 拖拽结束后不自动关闭面板，让用户可以继续拖拽其他项目
}

// ========== 生命周期 ==========

watch(() => props.visible, async (visible) => {
  if (visible) {
    // 重置滚动位置
    scrollTop.value = 0
    
    // 加载数据
    loadHistory()
    
    // 延迟渲染内容，让面板动画先完成
    isContentReady.value = false
    await nextTick()
    
    // 等待面板动画完成后再渲染内容（250ms 是动画时长）
    setTimeout(() => {
      isContentReady.value = true
      updateContainerHeight()
    }, 280)
  } else {
    // 面板关闭时重置状态
    isContentReady.value = false
    closeContextMenu()
  }
})

// 键盘事件
function handleKeydown(e) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    if (showContextMenu.value) {
      closeContextMenu()
    } else if (showPreview.value) {
      closePreview()
    } else {
      emit('close')
    }
  }
}

// 全局鼠标事件（用于拖拽）
function handleGlobalMouseMove(e) {
  handlePreviewMouseMove(e)
}

function handleGlobalMouseUp() {
  handlePreviewMouseUp()
}

// 全局点击事件（关闭右键菜单）
function handleGlobalClick(e) {
  if (showContextMenu.value) {
    closeContextMenu()
  }
}

// ResizeObserver 引用
let resizeObserver = null

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('mousemove', handleGlobalMouseMove)
  document.addEventListener('mouseup', handleGlobalMouseUp)
  document.addEventListener('click', handleGlobalClick)
  
  // 监听容器大小变化
  if (scrollContainerRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      updateContainerHeight()
    })
    resizeObserver.observe(scrollContainerRef.value)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mousemove', handleGlobalMouseMove)
  document.removeEventListener('mouseup', handleGlobalMouseUp)
  document.removeEventListener('click', handleGlobalClick)
  
  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  // 清理 RAF
  if (scrollRAF) {
    cancelAnimationFrame(scrollRAF)
    scrollRAF = null
  }
  
  // 清理视频缩略图队列
  videoThumbnailQueue.value = []
  processingThumbnails.value = 0
})
</script>

<template>
  <!-- 侧边栏模式：不使用全屏遮罩，让拖拽可以直接到画布 -->
  <Transition name="panel">
    <div 
      v-if="visible" 
      class="history-panel-wrapper"
    >
      <div class="history-panel">
        <!-- 头部 -->
        <div class="panel-header">
          <div class="header-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>{{ t('canvas.historyPanel.title') }}</span>
          </div>
          <button class="close-btn" @click="$emit('close')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- 文件类型筛选 -->
        <div class="type-filter">
          <button 
            v-for="ft in fileTypes" 
            :key="ft.key"
            class="type-btn"
            :class="{ active: selectedType === ft.key }"
            @click="selectedType = ft.key"
          >
            <span class="type-icon">{{ ft.icon }}</span>
            <span class="type-label">{{ t(ft.labelKey) }}</span>
            <span class="type-count">{{ historyStats[ft.key] || 0 }}</span>
          </button>
        </div>

        <!-- 搜索栏 -->
        <div class="search-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input 
            v-model="searchQuery"
            type="text" 
            :placeholder="t('canvas.historyPanel.searchPlaceholder')"
            class="search-input"
          />
          <span v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</span>
        </div>

        <!-- 历史记录列表 - 虚拟滚动 -->
        <div 
          class="history-list" 
          ref="scrollContainerRef"
          @scroll="handleScroll"
        >
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>{{ t('common.loading') }}</span>
          </div>
          
          <!-- 内容准备中的骨架屏 -->
          <div v-else-if="!isContentReady && filteredHistory.length > 0" class="loading-state skeleton-loading">
            <div class="skeleton-grid">
              <div class="skeleton-card" v-for="i in 6" :key="i"></div>
            </div>
          </div>

          <div v-else-if="filteredHistory.length === 0" class="empty-state">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <p v-if="historyList.length === 0">{{ t('canvas.historyPanel.noHistory') }}</p>
            <p v-else>{{ t('canvas.historyPanel.noMatch') }}</p>
            <p class="empty-hint">{{ t('canvas.historyPanel.autoSaveHint') }}</p>
          </div>

          <!-- 虚拟滚动列表 -->
          <div 
            v-else 
            class="virtual-scroll-container"
            :style="{ height: totalHeight + 'px' }"
          >
            <div 
              class="waterfall-grid"
              :style="{ transform: `translateY(${offsetY}px)` }"
            >
              <div 
                v-for="{ item, index } in visibleItems"
                :key="item.id"
                class="history-card"
                :class="[`type-${item.type}`]"
                draggable="true"
                @click="handleHistoryClick(item)"
                @contextmenu="handleContextMenu($event, item)"
                @dragstart="handleDragStart($event, item)"
                @dragend="handleDragEnd"
              >
                <!-- 图片预览 -->
                <template v-if="item.type === 'image'">
                  <img 
                    v-if="getPreviewContent(item) && !hasImageError(item)" 
                    :src="getPreviewContent(item)" 
                    :alt="item.name"
                    class="card-image"
                    loading="lazy"
                    decoding="async"
                    @error="handleImageError(item)"
                  />
                  <div v-else class="card-placeholder image">
                    <span class="placeholder-icon">◫</span>
                    <span class="placeholder-text" v-if="item.prompt">{{ item.prompt.length > 20 ? item.prompt.slice(0, 20) + '...' : item.prompt }}</span>
                  </div>
                </template>
                
                <!-- 视频预览 -->
                <template v-else-if="item.type === 'video'">
                  <img 
                    v-if="getVideoThumbnail(item)" 
                    :src="getVideoThumbnail(item)" 
                    :alt="item.name"
                    class="card-image"
                    loading="lazy"
                    decoding="async"
                  />
                  <div v-else class="card-placeholder video">
                    <span class="placeholder-icon">▶</span>
                  </div>
                </template>
                
                <!-- 音频占位符 -->
                <div v-else-if="item.type === 'audio'" class="card-placeholder audio">
                  <span class="placeholder-icon">♪</span>
                </div>
                
                <!-- 其他类型占位符 -->
                <div v-else class="card-placeholder">
                  <span class="placeholder-icon">◈</span>
                  <span class="placeholder-text" v-if="item.prompt">{{ item.prompt.length > 20 ? item.prompt.slice(0, 20) + '...' : item.prompt }}</span>
                </div>

                <!-- 视频标识 -->
                <div v-if="item.type === 'video'" class="video-badge">▶</div>

                <!-- 悬停信息遮罩 -->
                <div class="hover-overlay">
                  <div class="overlay-content">
                    <div class="overlay-model" v-if="item.model">{{ item.model }}</div>
                    <div class="overlay-prompt" v-if="item.prompt">{{ item.prompt.length > 60 ? item.prompt.slice(0, 60) + '...' : item.prompt }}</div>
                    <div class="overlay-time">{{ formatDate(item.created_at) }}</div>
                  </div>
                  <button 
                    class="overlay-delete"
                    @click.stop="handleDelete($event, item)"
                    :title="t('common.delete')"
                  >×</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部统计 -->
        <div class="panel-footer">
          <span class="stats">{{ historyStats.all }} {{ t('canvas.historyPanel.items') }}</span>
          <span class="tip">{{ t('canvas.historyPanel.footerTip') }}</span>
        </div>
      </div>
    </div>
  </Transition>
  
  <!-- 右键菜单 -->
  <Teleport to="body">
    <Transition name="context-menu">
      <div 
        v-if="showContextMenu && contextMenuItem"
        class="history-context-menu"
        :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
        @click.stop
      >
        <div class="context-menu-item" @click="handlePreview(contextMenuItem)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span>{{ t('canvas.contextMenu.fullscreenPreview') }}</span>
        </div>
        <div class="context-menu-item" @click="handleAddToCanvas(contextMenuItem)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span>{{ t('canvas.historyPanel.applyToCanvas') }}</span>
        </div>
        <div class="context-menu-item" @click="handleAddToAssets(contextMenuItem)" :class="{ disabled: savingAsset }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span>{{ savingAsset ? t('canvas.contextMenu.saving') : t('canvas.contextMenu.addToAssets') }}</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="handleDownload(contextMenuItem)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>{{ contextMenuItem.type === 'video' ? t('canvas.contextMenu.downloadVideo') : t('canvas.contextMenu.downloadImage') }}</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" @click="handleDelete(null, contextMenuItem)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          <span>{{ t('common.delete') }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
  
  <!-- 全屏预览模态框 - 支持缩放和平移 -->
  <Teleport to="body">
    <Transition name="preview">
      <div 
        v-if="showPreview && previewItem" 
        class="history-preview-overlay" 
        @click.self="closePreview"
      >
        <div class="history-preview-modal">
          <!-- 顶部关闭按钮 -->
          <button class="close-preview-btn" @click="closePreview" title="关闭 (ESC)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          
          <!-- 预览内容 - 支持缩放和拖拽 -->
          <div 
            class="preview-content"
            @wheel.prevent="handlePreviewWheel"
            @mousedown="handlePreviewMouseDown"
            @dblclick="handlePreviewDoubleClick"
            :class="{ dragging: isDragging }"
          >
            <!-- 图片预览 -->
            <img 
              v-if="previewItem.type === 'image'" 
              :src="previewItem.url" 
              :alt="previewItem.name"
              class="preview-image"
              :style="{
                transform: `translate(${previewTranslate.x}px, ${previewTranslate.y}px) scale(${previewScale})`,
                cursor: isDragging ? 'grabbing' : 'grab'
              }"
              draggable="false"
            />
            
            <!-- 视频预览 -->
            <video 
              v-else-if="previewItem.type === 'video'"
              ref="previewVideoRef"
              :src="previewItem.url"
              controls
              autoplay
              class="preview-video"
            ></video>
            
            <!-- 音频预览 -->
            <div v-else-if="previewItem.type === 'audio'" class="preview-audio">
              <div class="audio-icon">♪</div>
              <audio 
                :src="previewItem.url"
                controls
                autoplay
                class="audio-player"
              ></audio>
            </div>
          </div>
          
          <!-- 底部信息和操作栏 -->
          <div class="preview-footer">
            <!-- 信息区 -->
            <div class="preview-info-row">
              <span v-if="previewItem.model" class="info-tag">{{ previewItem.model }}</span>
              <span v-if="formatSize(previewItem)" class="info-tag">{{ formatSize(previewItem) }}</span>
              <span class="info-tag">{{ formatDate(previewItem.created_at) }}</span>
            </div>
            
            <!-- 提示词 -->
            <div v-if="previewItem.prompt" class="preview-prompt">{{ previewItem.prompt }}</div>
            
            <!-- 操作按钮组 -->
            <div class="preview-actions">
              <button class="action-btn apply-btn" @click="applyToCanvas">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                {{ t('canvas.historyPanel.applyToCanvas') }}
              </button>
              <button class="action-btn asset-btn" @click="handleAddToAssets(previewItem)" :disabled="savingAsset">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                {{ savingAsset ? t('canvas.contextMenu.saving') : t('canvas.contextMenu.addToAssets') }}
              </button>
              <button class="action-btn download-btn" @click="handleDownload(previewItem)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {{ t('common.download') }}
              </button>
              <button class="action-btn delete-btn" @click="handleDelete(null, previewItem)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    
    <!-- 删除确认弹窗 -->
    <Transition name="modal-fade">
      <div v-if="showDeleteConfirm" class="delete-confirm-overlay" @click="cancelDelete">
        <div class="delete-confirm-modal" @click.stop>
          <div class="delete-modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </div>
          <div class="delete-modal-title">{{ t('canvas.historyPanel.deleteConfirm') }}</div>
          <div class="delete-modal-desc">此操作无法撤销</div>
          <div class="delete-modal-preview" v-if="deleteTarget">
            <img 
              v-if="deleteTarget.type === 'image' && getPreviewContent(deleteTarget)" 
              :src="getPreviewContent(deleteTarget)" 
              :alt="deleteTarget.name"
            />
            <div v-else class="preview-placeholder">
              <span>{{ deleteTarget.type === 'video' ? '▶' : deleteTarget.type === 'audio' ? '♪' : '◫' }}</span>
            </div>
          </div>
          <div class="delete-modal-actions">
            <button class="modal-btn cancel-btn" @click="cancelDelete">
              取消
            </button>
            <button class="modal-btn confirm-btn" @click="confirmDelete">
              确认删除
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 侧边栏容器 - 无遮罩，不阻挡画布操作 */
.history-panel-wrapper {
  position: fixed;
  top: 40px;
  left: 90px;
  bottom: 40px;
  z-index: 200;
  pointer-events: none;
}

/* 面板 */
.history-panel {
  width: 480px;
  height: 100%;
  max-height: calc(100vh - 80px);
  background: linear-gradient(180deg, rgba(28, 28, 32, 0.98) 0%, rgba(20, 20, 24, 0.98) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 
    0 24px 80px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  pointer-events: auto;
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}

.header-title svg {
  opacity: 0.6;
  color: rgba(255, 255, 255, 0.7);
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 文件类型筛选 */
.type-filter {
  display: flex;
  gap: 4px;
  padding: 12px 12px;
  overflow-x: auto;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

/* 隐藏滚动条但保留滚动功能 */
.type-filter::-webkit-scrollbar {
  display: none;
}

.type-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.type-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.type-btn.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.type-icon {
  font-size: 13px;
}

.type-count {
  font-size: 10px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
}

.type-btn.active .type-count {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

/* 搜索栏 */
.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 20px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  transition: all 0.2s;
}

.search-bar:focus-within {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
}

.search-bar svg {
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 13px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.search-clear {
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
}

.search-clear:hover {
  color: rgba(255, 255, 255, 0.7);
}

/* 历史记录列表 */
.history-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
  min-height: 0;
}

.history-list::-webkit-scrollbar {
  width: 4px;
}

.history-list::-webkit-scrollbar-track {
  background: transparent;
}

.history-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

/* 虚拟滚动容器 */
.virtual-scroll-container {
  position: relative;
  width: 100%;
}

.waterfall-grid {
  columns: 2;
  column-gap: 4px;
  padding: 8px;
  will-change: transform;
}

/* 骨架屏样式 */
.skeleton-loading {
  padding: 8px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

.skeleton-card {
  aspect-ratio: 1;
  background: linear-gradient(90deg, #2a2a2e 25%, #3a3a3e 50%, #2a2a2e 75%);
  background-size: 200% 100%;
  border-radius: 4px;
  animation: skeleton-shimmer 1.5s infinite;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.4);
  gap: 12px;
  height: 100%;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  height: 100%;
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.4;
  color: rgba(255, 255, 255, 0.5);
}

.empty-icon svg {
  stroke: currentColor;
}

.empty-state p {
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 12px !important;
  color: rgba(255, 255, 255, 0.3) !important;
}

/* 历史记录卡片 */
.history-card {
  position: relative;
  background: #1a1a1c;
  border-radius: 4px;
  overflow: hidden;
  cursor: grab;
  transition: all 0.15s;
  break-inside: avoid;
  margin-bottom: 4px;
}

.history-card:active {
  cursor: grabbing;
}

.history-card:hover {
  transform: scale(1.02);
  z-index: 10;
}

.history-card:hover .hover-overlay {
  opacity: 1;
}

/* 卡片图片 */
.card-image {
  width: 100%;
  display: block;
  object-fit: cover;
}

/* 占位符 */
.card-placeholder {
  aspect-ratio: 1;
  background: linear-gradient(135deg, #2a2a2e 0%, #1a1a1c 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  min-height: 120px;
}

.card-placeholder.image {
  background: linear-gradient(135deg, #1e3a5f 0%, #1a1a1c 100%);
}

.card-placeholder.video {
  background: linear-gradient(135deg, #3d1a5f 0%, #1a1a1c 100%);
}

.card-placeholder.audio {
  background: linear-gradient(135deg, #1a5f3d 0%, #1a1a1c 100%);
}

.placeholder-icon {
  font-size: 24px;
  color: rgba(255, 255, 255, 0.4);
}

.placeholder-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  line-height: 1.3;
  word-break: break-all;
  max-width: 100%;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 视频标识 */
.video-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 22px;
  height: 22px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 8px;
}

/* 悬停信息遮罩 */
.hover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.4) 50%, transparent 100%);
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 8px;
}

.overlay-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overlay-model {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 6px;
  border-radius: 3px;
  width: fit-content;
}

.overlay-prompt {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.overlay-time {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
}

.overlay-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.overlay-delete:hover {
  background: #ef4444;
  color: #fff;
}

/* 底部 */
.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.stats {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

/* 动画 */
.panel-enter-active,
.panel-leave-active {
  transition: all 0.25s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}

.panel-enter-from .history-panel,
.panel-leave-to .history-panel {
  transform: translateX(-20px);
  opacity: 0;
}

/* ========== 右键菜单 ========== */
.history-context-menu {
  position: fixed;
  z-index: 10001;
  min-width: 180px;
  background: rgba(30, 30, 34, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-item.danger {
  color: #ef4444;
}

.context-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

.context-menu-item.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.context-menu-item svg {
  opacity: 0.7;
  flex-shrink: 0;
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 6px 0;
}

/* 右键菜单动画 */
.context-menu-enter-active,
.context-menu-leave-active {
  transition: all 0.15s ease;
}

.context-menu-enter-from,
.context-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* ========== 全屏预览模态框 ========== */
.history-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-preview-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  max-width: 1200px;
  max-height: 90vh;
  margin: auto;
  position: relative;
}

/* 关闭按钮 */
.close-preview-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
}

.close-preview-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

/* 预览内容区域 */
.preview-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  cursor: grab;
  padding: 20px;
}

.preview-content.dragging {
  cursor: grabbing;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.1s ease-out;
  user-select: none;
  -webkit-user-drag: none;
  border-radius: 8px;
}

.preview-video {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  background: #000;
}

.preview-audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.preview-audio .audio-icon {
  font-size: 48px;
  color: rgba(255, 255, 255, 0.4);
}

.audio-player {
  width: 320px;
  max-width: 100%;
}

/* 底部信息和操作栏 */
.preview-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 24px;
  background: rgba(20, 20, 22, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-info-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.info-tag {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.08);
  padding: 4px 10px;
  border-radius: 4px;
}

/* 提示词 */
.preview-prompt {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.5;
  text-align: center;
  max-height: 60px;
  overflow-y: auto;
  padding: 0 20px;
}

/* 操作按钮组 */
.preview-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding-top: 8px;
  flex-wrap: wrap;
}

.preview-actions .action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.preview-actions .action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.preview-actions .action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.preview-actions .apply-btn {
  background: #fff;
  border-color: #fff;
  color: #000;
}

.preview-actions .apply-btn:hover {
  background: #f0f0f0;
}

.preview-actions .asset-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
}

.preview-actions .download-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.preview-actions .delete-btn:hover {
  background: rgba(239, 68, 68, 0.6);
  border-color: rgba(239, 68, 68, 0.8);
}

/* 预览动画 */
.preview-enter-active,
.preview-leave-active {
  transition: all 0.25s ease;
}

.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}

/* 响应式 */
@media (max-width: 800px) {
  .history-panel-wrapper {
    left: 20px;
    right: 20px;
    top: 20px;
    bottom: 20px;
  }
  
  .history-panel {
    width: 100%;
    max-width: 480px;
  }
  
  .waterfall-grid {
    columns: 2;
  }
  
  .preview-actions {
    flex-wrap: wrap;
  }
  
  .preview-actions .action-btn {
    flex: 1;
    min-width: 100px;
    justify-content: center;
  }
}

/* ========== 删除确认弹窗 ========== */
.delete-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10100;
}

.delete-confirm-modal {
  background: linear-gradient(145deg, #1e1e22, #141417);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 32px 40px;
  min-width: 320px;
  max-width: 400px;
  text-align: center;
  box-shadow: 
    0 25px 60px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  animation: modal-scale-in 0.2s ease-out;
}

@keyframes modal-scale-in {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.delete-modal-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 20px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ef4444;
}

.delete-modal-title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 8px;
}

.delete-modal-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 20px;
}

.delete-modal-preview {
  width: 120px;
  height: 120px;
  margin: 0 auto 24px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.delete-modal-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.delete-modal-preview .preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: rgba(255, 255, 255, 0.3);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), transparent);
}

.delete-modal-actions {
  display: flex;
  gap: 12px;
}

.modal-btn {
  flex: 1;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.confirm-btn {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #ffffff;
  box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
}

.confirm-btn:hover {
  background: linear-gradient(135deg, #f87171, #ef4444);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
}

.confirm-btn:active {
  transform: translateY(0);
}

/* 弹窗动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .delete-confirm-modal,
.modal-fade-leave-to .delete-confirm-modal {
  transform: scale(0.9) translateY(10px);
}
</style>
