<script setup>
/**
 * AssetPanel.vue - 我的资产面板
 * 用于管理用户生成的文案、图片、视频、音频等资源
 * 支持分类、标签、收藏、拖拽添加到画布
 * 支持全屏预览和应用到画布
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getAssets, deleteAsset, toggleFavorite, updateAssetTags } from '@/api/canvas/assets'
import { useI18n } from '@/i18n'

const { t, currentLanguage } = useI18n()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'insert-asset'])

// ========== 状态 ==========
const loading = ref(false)
const assets = ref([])
const selectedType = ref('all') // all | text | image | video | audio
const selectedTag = ref('all')  // all | favorite | 或自定义标签
const searchQuery = ref('')
const showTagManager = ref(false)
const editingAsset = ref(null)
const newTagInput = ref('')

// 全屏预览状态
const showPreview = ref(false)
const previewAsset = ref(null)
const previewVideoRef = ref(null)

// 右键菜单状态
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuAsset = ref(null)

// 视频缩略图缓存
const videoThumbnails = ref({})

// 数据缓存和延迟渲染
const dataCached = ref(false)
const lastLoadTime = ref(0)
const CACHE_DURATION = 60000 // 缓存有效期 60 秒
const isContentReady = ref(false) // 延迟渲染标记

// 文件类型 - 存储翻译键，在模板中实时翻译
const fileTypes = [
  { key: 'all', labelKey: 'common.all', icon: '◈' },
  { key: 'text', labelKey: 'canvas.assetPanel.copywriting', icon: 'Aa' },
  { key: 'image', labelKey: 'canvas.nodes.image', icon: '◫' },
  { key: 'video', labelKey: 'canvas.nodes.video', icon: '▷' },
  { key: 'audio', labelKey: 'canvas.nodes.audio', icon: '♪' }
]

// 快捷标签 - 存储翻译键，在模板中实时翻译
const quickTags = [
  { key: 'all', labelKey: 'common.all', icon: '○' },
  { key: 'favorite', labelKey: 'canvas.assetPanel.favorite', icon: '☆' }
]

// 快速添加标签选项 - 存储翻译键
const quickTagOptionKeys = [
  'canvas.assetPanel.tagImportant',
  'canvas.assetPanel.tagPending',
  'canvas.assetPanel.tagCompleted',
  'canvas.assetPanel.tagMaterial',
  'canvas.assetPanel.tagFinal'
]

// 用户自定义标签（从资产中提取）
const userTags = computed(() => {
  const tagSet = new Set()
  assets.value.forEach(asset => {
    if (asset.tags) {
      asset.tags.forEach(tag => tagSet.add(tag))
    }
  })
  return Array.from(tagSet).map(tag => ({
    key: tag,
    label: tag,
    icon: '#'
  }))
})

// 所有标签选项（quickTags 是静态数组，userTags 是 computed）
const allTags = computed(() => [...quickTags, ...userTags.value])

// 筛选后的资产
const filteredAssets = computed(() => {
  let result = assets.value

  // 按类型筛选
  if (selectedType.value !== 'all') {
    result = result.filter(a => a.type === selectedType.value)
  }

  // 按标签筛选
  if (selectedTag.value === 'favorite') {
    result = result.filter(a => a.is_favorite)
  } else if (selectedTag.value !== 'all') {
    result = result.filter(a => a.tags && a.tags.includes(selectedTag.value))
  }

  // 搜索
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(a => 
      a.name?.toLowerCase().includes(query) ||
      a.content?.toLowerCase().includes(query) ||
      a.tags?.some(t => t.toLowerCase().includes(query))
    )
  }

  return result
})

// 按类型分组的资产统计
const assetStats = computed(() => {
  const stats = { all: 0, text: 0, image: 0, video: 0, audio: 0 }
  assets.value.forEach(a => {
    stats.all++
    if (stats[a.type] !== undefined) {
      stats[a.type]++
    }
  })
  return stats
})

// ========== 方法 ==========

// 加载资产列表（带缓存）
async function loadAssets(forceRefresh = false) {
  const now = Date.now()
  
  // 如果有缓存且未过期，使用缓存
  if (!forceRefresh && dataCached.value && (now - lastLoadTime.value < CACHE_DURATION)) {
    console.log('[AssetPanel] 使用缓存数据')
    return
  }
  
  loading.value = true
  try {
    const result = await getAssets()
    assets.value = result.assets || []
    dataCached.value = true
    lastLoadTime.value = now
  } catch (error) {
    console.error('[AssetPanel] 加载资产失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取资产预览
function getAssetPreview(asset) {
  switch (asset.type) {
    case 'text':
      return asset.content?.substring(0, 100) + (asset.content?.length > 100 ? '...' : '')
    case 'image':
    case 'video':
      return asset.thumbnail_url || asset.url
    case 'audio':
      return null
    default:
      return null
  }
}

// 获取文件大小显示
function formatFileSize(bytes) {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
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

// 切换收藏
async function handleToggleFavorite(e, asset) {
  e.stopPropagation()
  try {
    await toggleFavorite(asset.id)
    asset.is_favorite = !asset.is_favorite
  } catch (error) {
    console.error('[AssetPanel] 切换收藏失败:', error)
  }
}

// 删除资产
async function handleDelete(e, asset) {
  e.stopPropagation()
  if (!confirm(t('canvas.assetPanel.deleteConfirm', { name: asset.name }))) return
  
  try {
    await deleteAsset(asset.id)
    assets.value = assets.value.filter(a => a.id !== asset.id)
  } catch (error) {
    console.error('[AssetPanel] 删除资产失败:', error)
    alert(t('errors.deleteFailed') + ': ' + error.message)
  }
}

// 点击资产 - 打开全屏预览
function handleAssetClick(asset) {
  previewAsset.value = asset
  showPreview.value = true
}

// 关闭全屏预览
function closePreview() {
  showPreview.value = false
  previewAsset.value = null
}

// 应用资产到画布
function applyAssetToCanvas() {
  if (previewAsset.value) {
    emit('insert-asset', previewAsset.value)
    closePreview()
    emit('close')
  }
}

// 插入资产到画布（直接插入，用于拖拽）
function handleInsertAsset(asset) {
  emit('insert-asset', asset)
  emit('close')
}

// ========== 右键菜单 ==========

// 打开右键菜单
function handleContextMenu(e, asset) {
  e.preventDefault()
  e.stopPropagation()
  contextMenuAsset.value = asset
  contextMenuPosition.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

// 关闭右键菜单
function closeContextMenu() {
  showContextMenu.value = false
  contextMenuAsset.value = null
}

// 右键菜单 - 添加到画布
function handleAddToCanvas() {
  if (contextMenuAsset.value) {
    emit('insert-asset', contextMenuAsset.value)
    closeContextMenu()
    emit('close')
  }
}

// 右键菜单 - 下载资产
async function handleDownload() {
  if (!contextMenuAsset.value) return
  
  const asset = contextMenuAsset.value
  try {
    let downloadUrl = asset.url
    let filename = asset.name || `asset_${asset.id}`
    
    // 根据类型确定文件扩展名
    if (asset.type === 'text') {
      // 文本资产创建 blob
      const blob = new Blob([asset.content || ''], { type: 'text/plain;charset=utf-8' })
      downloadUrl = URL.createObjectURL(blob)
      filename = filename.endsWith('.txt') ? filename : `${filename}.txt`
    } else if (asset.type === 'image' && !filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      filename = `${filename}.png`
    } else if (asset.type === 'video' && !filename.match(/\.(mp4|webm|mov)$/i)) {
      filename = `${filename}.mp4`
    } else if (asset.type === 'audio' && !filename.match(/\.(mp3|wav|ogg)$/i)) {
      filename = `${filename}.mp3`
    }
    
    // 创建下载链接
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // 如果是 blob URL，释放
    if (asset.type === 'text') {
      URL.revokeObjectURL(downloadUrl)
    }
  } catch (error) {
    console.error('[AssetPanel] 下载失败:', error)
    alert(t('errors.downloadFailed') || '下载失败')
  }
  
  closeContextMenu()
}

// 右键菜单 - 删除
async function handleContextDelete() {
  if (!contextMenuAsset.value) return
  
  const asset = contextMenuAsset.value
  if (!confirm(t('canvas.assetPanel.deleteConfirm', { name: asset.name }))) {
    closeContextMenu()
    return
  }
  
  try {
    await deleteAsset(asset.id)
    assets.value = assets.value.filter(a => a.id !== asset.id)
  } catch (error) {
    console.error('[AssetPanel] 删除资产失败:', error)
    alert(t('errors.deleteFailed') + ': ' + error.message)
  }
  
  closeContextMenu()
}

// 右键菜单 - 管理标签
function handleContextTag() {
  if (contextMenuAsset.value) {
    editingAsset.value = contextMenuAsset.value
    showTagManager.value = true
    newTagInput.value = ''
  }
  closeContextMenu()
}

// 提取视频首帧作为缩略图
function extractVideoThumbnail(asset) {
  if (asset.type !== 'video' || !asset.url) return
  if (videoThumbnails.value[asset.id]) return // 已有缓存
  
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.preload = 'metadata'
  
  video.onloadeddata = () => {
    // 跳到第一帧
    video.currentTime = 0.1
  }
  
  video.onseeked = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 180
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      videoThumbnails.value[asset.id] = canvas.toDataURL('image/jpeg', 0.7)
    } catch (e) {
      console.warn('[AssetPanel] 无法提取视频缩略图:', e)
    }
    video.remove()
  }
  
  video.onerror = () => {
    console.warn('[AssetPanel] 视频加载失败:', asset.url)
    video.remove()
  }
  
  video.src = asset.url
}

// 获取视频缩略图
function getVideoThumbnail(asset) {
  if (asset.thumbnail_url) return asset.thumbnail_url
  if (videoThumbnails.value[asset.id]) return videoThumbnails.value[asset.id]
  
  // 触发提取
  nextTick(() => extractVideoThumbnail(asset))
  return null
}

// 开始拖拽
function handleDragStart(e, asset) {
  e.dataTransfer.setData('application/json', JSON.stringify({
    type: 'asset-insert',
    asset: {
      id: asset.id,
      type: asset.type,
      name: asset.name,
      content: asset.content,
      url: asset.url,
      thumbnail_url: asset.thumbnail_url
    }
  }))
  e.dataTransfer.effectAllowed = 'copy'
  
  // 设置拖拽图像（可选）
  const dragImage = e.target.cloneNode(true)
  dragImage.style.width = '120px'
  dragImage.style.opacity = '0.8'
  document.body.appendChild(dragImage)
  e.dataTransfer.setDragImage(dragImage, 60, 60)
  setTimeout(() => document.body.removeChild(dragImage), 0)
  
  // 不自动关闭面板，让用户可以继续拖拽
  // 面板会在拖拽放置到画布后手动关闭（如果需要的话）
}

// 打开标签管理
function openTagManager(e, asset) {
  e.stopPropagation()
  editingAsset.value = asset
  showTagManager.value = true
  newTagInput.value = ''
}

// 添加标签
async function addTag() {
  if (!newTagInput.value.trim() || !editingAsset.value) return
  
  const newTag = newTagInput.value.trim()
  const currentTags = editingAsset.value.tags || []
  
  if (currentTags.includes(newTag)) {
    newTagInput.value = ''
    return
  }
  
  const updatedTags = [...currentTags, newTag]
  
  try {
    await updateAssetTags(editingAsset.value.id, updatedTags)
    editingAsset.value.tags = updatedTags
    newTagInput.value = ''
  } catch (error) {
    console.error('[AssetPanel] 添加标签失败:', error)
  }
}

// 移除标签
async function removeTag(tag) {
  if (!editingAsset.value) return
  
  const updatedTags = (editingAsset.value.tags || []).filter(t => t !== tag)
  
  try {
    await updateAssetTags(editingAsset.value.id, updatedTags)
    editingAsset.value.tags = updatedTags
  } catch (error) {
    console.error('[AssetPanel] 移除标签失败:', error)
  }
}

// 关闭标签管理
function closeTagManager() {
  showTagManager.value = false
  editingAsset.value = null
}

// ========== 生命周期 ==========

watch(() => props.visible, async (visible) => {
  if (visible) {
    // 加载数据
    loadAssets()
    
    // 延迟渲染内容，让面板动画先完成
    isContentReady.value = false
    await nextTick()
    
    // 等待面板动画完成后再渲染内容
    setTimeout(() => {
      isContentReady.value = true
    }, 280)
  } else {
    isContentReady.value = false
  }
})

// 键盘事件
function handleKeydown(e) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    if (showContextMenu.value) {
      closeContextMenu()
    } else if (showTagManager.value) {
      closeTagManager()
    } else {
      emit('close')
    }
  }
}

// 点击外部关闭右键菜单
function handleGlobalClick(e) {
  if (showContextMenu.value) {
    const menu = document.querySelector('.asset-context-menu')
    if (menu && !menu.contains(e.target)) {
      closeContextMenu()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleGlobalClick)
})
</script>

<template>
  <!-- 侧边栏模式：不使用全屏遮罩，让拖拽可以直接到画布 -->
  <Transition name="panel">
    <div 
      v-if="visible" 
      class="asset-panel-container"
    >
      <div class="asset-panel">
        <!-- 头部 -->
        <div class="panel-header">
          <div class="header-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 7h-9"/>
              <path d="M14 17H5"/>
              <circle cx="17" cy="17" r="3"/>
              <circle cx="7" cy="7" r="3"/>
            </svg>
            <span>{{ t('canvas.assetPanel.title') }}</span>
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
            <span class="type-count">{{ assetStats[ft.key] || 0 }}</span>
          </button>
        </div>

        <!-- 标签筛选 -->
        <div class="tag-filter">
          <div class="tag-scroll">
            <button 
              v-for="tag in allTags" 
              :key="tag.key"
              class="tag-btn"
              :class="{ active: selectedTag === tag.key }"
              @click="selectedTag = tag.key"
            >
              <span class="tag-icon">{{ tag.icon }}</span>
              <span>{{ tag.labelKey ? t(tag.labelKey) : tag.label }}</span>
            </button>
          </div>
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
            :placeholder="t('canvas.assetPanel.searchPlaceholder')"
            class="search-input"
          />
          <span v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</span>
        </div>

        <!-- 资产列表 -->
        <div class="asset-list">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>{{ t('common.loading') }}</span>
          </div>

          <div v-else-if="filteredAssets.length === 0" class="empty-state">
            <div class="empty-icon">◇</div>
            <p v-if="assets.length === 0">{{ t('canvas.assetPanel.noAssets') }}</p>
            <p v-else>{{ t('canvas.assetPanel.noMatch') }}</p>
            <p class="empty-hint">{{ t('canvas.assetPanel.autoSaveHint') }}</p>
          </div>

          <template v-else>
            <!-- 资产卡片 -->
            <div 
              v-for="asset in filteredAssets"
              :key="asset.id"
              class="asset-card"
              :class="[`type-${asset.type}`]"
              draggable="true"
              @click="handleAssetClick(asset)"
              @contextmenu="handleContextMenu($event, asset)"
              @dragstart="handleDragStart($event, asset)"
            >
              <!-- 预览区 -->
              <div class="asset-preview">
                <!-- 文本预览 -->
                <div v-if="asset.type === 'text'" class="text-preview">
                  <p>{{ getAssetPreview(asset) }}</p>
                </div>
                
                <!-- 图片预览 -->
                <img 
                  v-else-if="asset.type === 'image'" 
                  :src="getAssetPreview(asset)" 
                  :alt="asset.name"
                  class="image-preview"
                />
                
                <!-- 视频预览 - 自动提取首帧 -->
                <div v-else-if="asset.type === 'video'" class="video-preview">
                  <img 
                    v-if="getVideoThumbnail(asset)" 
                    :src="getVideoThumbnail(asset)" 
                    :alt="asset.name"
                  />
                  <div v-else class="video-loading">
                    <div class="mini-spinner"></div>
                  </div>
                  <div class="video-play-icon">▶</div>
                </div>
                
                <!-- 音频预览 -->
                <div v-else-if="asset.type === 'audio'" class="audio-preview">
                  <div class="audio-wave">
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                </div>
              </div>

              <!-- 信息区 -->
              <div class="asset-info">
                <div class="asset-name">{{ asset.name }}</div>
                <div class="asset-meta">
                  <span class="asset-size">{{ formatFileSize(asset.size) }}</span>
                  <span class="asset-time">{{ formatDate(asset.created_at) }}</span>
                </div>
                
                <!-- 标签 -->
                <div v-if="asset.tags && asset.tags.length > 0" class="asset-tags">
                  <span 
                    v-for="tag in asset.tags.slice(0, 3)" 
                    :key="tag" 
                    class="asset-tag"
                  >
                    {{ tag }}
                  </span>
                  <span v-if="asset.tags.length > 3" class="asset-tag more">
                    +{{ asset.tags.length - 3 }}
                  </span>
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="asset-actions">
                <button 
                  class="action-btn favorite-btn"
                  :class="{ active: asset.is_favorite }"
                  @click="handleToggleFavorite($event, asset)"
                  :title="t('canvas.assetPanel.favorite')"
                >
                  {{ asset.is_favorite ? '★' : '☆' }}
                </button>
                <button 
                  class="action-btn tag-btn"
                  @click="openTagManager($event, asset)"
                  :title="t('canvas.assetPanel.manageTags')"
                >
                  #
                </button>
                <button 
                  class="action-btn delete-btn"
                  @click="handleDelete($event, asset)"
                  :title="t('common.delete')"
                >
                  ×
                </button>
              </div>

              <!-- 类型标识 -->
              <div class="asset-type-badge">
                {{ fileTypes.find(f => f.key === asset.type)?.icon || '◇' }}
              </div>
            </div>
          </template>
        </div>

        <!-- 底部提示 -->
        <div class="panel-footer">
          <span class="tip">💡 {{ t('canvas.assetPanel.footerTip') }}</span>
        </div>

        <!-- 右键菜单 -->
        <Teleport to="body">
          <Transition name="context-menu">
            <div 
              v-if="showContextMenu && contextMenuAsset" 
              class="asset-context-menu"
              :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
            >
              <button class="context-menu-item" @click="handleAddToCanvas">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M12 8v8M8 12h8"/>
                </svg>
                <span>{{ t('canvas.assetPanel.addToCanvas') || '添加到画布' }}</span>
              </button>
              <button class="context-menu-item" @click="handleDownload">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>{{ t('common.download') || '下载' }}</span>
              </button>
              <button class="context-menu-item" @click="handleContextTag">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                <span>{{ t('canvas.assetPanel.manageTags') || '管理标签' }}</span>
              </button>
              <div class="context-menu-divider"></div>
              <button class="context-menu-item danger" @click="handleContextDelete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span>{{ t('common.delete') || '删除' }}</span>
              </button>
            </div>
          </Transition>
        </Teleport>

        <!-- 标签管理弹窗 -->
        <Transition name="fade">
          <div v-if="showTagManager" class="tag-manager-overlay" @click.self="closeTagManager">
            <div class="tag-manager">
              <div class="tag-manager-header">
                <h3>{{ t('canvas.assetPanel.manageTags') }}</h3>
                <button class="close-btn small" @click="closeTagManager">✕</button>
              </div>
              
              <div class="tag-manager-content">
                <div class="current-tags">
                  <span 
                    v-for="tag in (editingAsset?.tags || [])" 
                    :key="tag" 
                    class="editable-tag"
                  >
                    {{ tag }}
                    <button class="remove-tag" @click="removeTag(tag)">✕</button>
                  </span>
                  <span v-if="!editingAsset?.tags?.length" class="no-tags">{{ t('canvas.assetPanel.noTags') }}</span>
                </div>
                
                <div class="add-tag-form">
                  <input 
                    v-model="newTagInput"
                    type="text"
                    :placeholder="t('canvas.assetPanel.enterNewTag')"
                    class="tag-input"
                    @keyup.enter="addTag"
                  />
                  <button class="add-tag-btn" @click="addTag">{{ t('common.add') }}</button>
                </div>
                
                <!-- 快速添加常用标签 -->
                <div class="quick-tags">
                  <span class="quick-tags-label">{{ t('canvas.assetPanel.quickAdd') }}</span>
                  <button 
                    v-for="qtKey in quickTagOptionKeys" 
                    :key="qtKey"
                    class="quick-tag-btn"
                    @click="newTagInput = t(qtKey); addTag()"
                  >
                    {{ t(qtKey) }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>

  <!-- 全屏预览模态框 -->
  <Teleport to="body">
    <Transition name="preview">
      <div v-if="showPreview && previewAsset" class="asset-preview-overlay" @click.self="closePreview">
        <div class="asset-preview-modal">
          <!-- 关闭按钮 -->
          <button class="preview-close-btn" @click="closePreview">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          
          <!-- 预览内容 -->
          <div class="preview-content">
            <!-- 文本预览 -->
            <div v-if="previewAsset.type === 'text'" class="preview-text">
              <h3>{{ previewAsset.name }}</h3>
              <div class="text-content">{{ previewAsset.content }}</div>
            </div>
            
            <!-- 图片预览 -->
            <img 
              v-else-if="previewAsset.type === 'image'" 
              :src="previewAsset.url" 
              :alt="previewAsset.name"
              class="preview-image"
            />
            
            <!-- 视频预览 -->
            <video 
              v-else-if="previewAsset.type === 'video'"
              ref="previewVideoRef"
              :src="previewAsset.url"
              controls
              autoplay
              class="preview-video"
            ></video>
            
            <!-- 音频预览 -->
            <div v-else-if="previewAsset.type === 'audio'" class="preview-audio">
              <div class="audio-visual">
                <div class="audio-icon">♪</div>
                <h3>{{ previewAsset.name }}</h3>
              </div>
              <audio 
                :src="previewAsset.url"
                controls
                autoplay
                class="audio-player"
              ></audio>
            </div>
          </div>
          
          <!-- 资产信息 -->
          <div class="preview-info">
            <div class="info-row">
              <span class="info-label">{{ t('canvas.assetPanel.name') }}</span>
              <span class="info-value">{{ previewAsset.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">{{ t('canvas.assetPanel.type') }}</span>
              <span class="info-value">{{ t(fileTypes.find(f => f.key === previewAsset.type)?.labelKey) || previewAsset.type }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">{{ t('canvas.assetPanel.size') }}</span>
              <span class="info-value">{{ formatFileSize(previewAsset.size) }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">{{ t('canvas.assetPanel.createdAt') }}</span>
              <span class="info-value">{{ formatDate(previewAsset.created_at) }}</span>
            </div>
          </div>
          
          <!-- 应用按钮 -->
          <button class="apply-btn" @click="applyAssetToCanvas">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            {{ t('canvas.assetPanel.applyToCanvas') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 侧边栏容器 - 不阻挡拖拽 */
.asset-panel-container {
  position: fixed;
  top: 40px;
  left: 90px;
  bottom: 40px;
  z-index: 200;
  pointer-events: none; /* 让拖拽可以穿透 */
}

/* 面板 - 更大尺寸 */
.asset-panel {
  width: 680px;
  max-height: calc(100vh - 80px);
  height: 100%;
  background: linear-gradient(180deg, rgba(28, 28, 32, 0.98) 0%, rgba(20, 20, 24, 0.98) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 
    0 24px 80px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  pointer-events: auto; /* 面板本身可以接收事件 */
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  opacity: 0.8;
  color: #a78bfa;
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

.close-btn.small {
  width: 24px;
  height: 24px;
  font-size: 14px;
}

/* 文件类型筛选 */
.type-filter {
  display: flex;
  gap: 6px;
  padding: 16px 20px;
  overflow-x: auto;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.type-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.type-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.type-btn.active {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.2) 0%, rgba(139, 92, 246, 0.15) 100%);
  border-color: rgba(167, 139, 250, 0.4);
  color: #a78bfa;
}

.type-icon {
  font-size: 15px;
}

.type-count {
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 6px;
}

.type-btn.active .type-count {
  background: rgba(167, 139, 250, 0.3);
  color: #c4b5fd;
}

/* 标签筛选 */
.tag-filter {
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.tag-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.tag-scroll::-webkit-scrollbar {
  height: 4px;
}

.tag-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.tag-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.tag-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.tag-btn:hover {
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.tag-btn.active {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.tag-icon {
  font-size: 12px;
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
  border-color: rgba(167, 139, 250, 0.4);
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

/* 资产列表 - 3列布局 */
.asset-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-content: start;
}

.asset-list::-webkit-scrollbar {
  width: 6px;
}

.asset-list::-webkit-scrollbar-track {
  background: transparent;
}

.asset-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

/* 加载状态 */
.loading-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.4);
  gap: 12px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: #a78bfa;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空状态 */
.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.6;
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

/* 资产卡片 */
.asset-card {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.asset-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.asset-card:hover .asset-actions {
  opacity: 1;
}

/* 资产预览 - 更大尺寸 */
.asset-preview {
  height: 120px;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

/* 视频加载中 */
.video-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(30, 30, 35, 1) 0%, rgba(20, 20, 25, 1) 100%);
}

.mini-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgba(167, 139, 250, 0.6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.text-preview {
  padding: 12px;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.6);
  overflow: hidden;
}

.text-preview p {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.image-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-preview {
  width: 100%;
  height: 100%;
  position: relative;
}

.video-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
}

.audio-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(167, 139, 250, 0.1) 100%);
}

.audio-wave {
  display: flex;
  gap: 3px;
  align-items: center;
  height: 40px;
}

.audio-wave span {
  width: 4px;
  background: rgba(167, 139, 250, 0.6);
  border-radius: 2px;
  animation: wave 0.8s ease-in-out infinite;
}

.audio-wave span:nth-child(1) { height: 15px; animation-delay: 0s; }
.audio-wave span:nth-child(2) { height: 25px; animation-delay: 0.1s; }
.audio-wave span:nth-child(3) { height: 35px; animation-delay: 0.2s; }
.audio-wave span:nth-child(4) { height: 25px; animation-delay: 0.3s; }
.audio-wave span:nth-child(5) { height: 15px; animation-delay: 0.4s; }

@keyframes wave {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.5); }
}

/* 资产信息 */
.asset-info {
  padding: 12px;
}

.asset-name {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.asset-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
}

.asset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.asset-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(167, 139, 250, 0.15);
  color: rgba(167, 139, 250, 0.9);
  border-radius: 4px;
}

.asset-tag.more {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

/* 操作按钮 */
.asset-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: scale(1.1);
}

.favorite-btn.active {
  color: #fbbf24;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.8);
}

/* 类型标识 */
.asset-type-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 16px;
  opacity: 0.6;
}

/* 底部 */
.panel-footer {
  padding: 14px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}

.tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

/* 标签管理弹窗 */
.tag-manager-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
}

.tag-manager {
  width: 320px;
  background: rgba(30, 30, 34, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
}

.tag-manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tag-manager-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.tag-manager-content {
  padding: 16px 20px;
}

.current-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 36px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  margin-bottom: 16px;
}

.editable-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(167, 139, 250, 0.2);
  color: #c4b5fd;
  border-radius: 6px;
  font-size: 12px;
}

.remove-tag {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  line-height: 1;
}

.remove-tag:hover {
  color: #ef4444;
}

.no-tags {
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
}

.add-tag-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tag-input {
  flex: 1;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  outline: none;
}

.tag-input:focus {
  border-color: rgba(167, 139, 250, 0.5);
}

.add-tag-btn {
  padding: 10px 18px;
  background: #a78bfa;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.add-tag-btn:hover {
  background: #8b5cf6;
}

.quick-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.quick-tags-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.quick-tag-btn {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-tag-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 动画 */
.panel-enter-active,
.panel-leave-active {
  transition: all 0.25s ease;
}

.panel-enter-active .asset-panel,
.panel-leave-active .asset-panel {
  transition: all 0.25s ease;
}

.panel-enter-from .asset-panel,
.panel-leave-to .asset-panel {
  transform: translateX(-20px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 响应式 */
@media (max-width: 800px) {
  .asset-panel-container {
    left: 20px;
    right: 20px;
    top: 20px;
    bottom: 20px;
  }
  
  .asset-panel {
    width: 100%;
    max-width: 580px;
    max-height: calc(100vh - 40px);
  }
  
  .asset-list {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .asset-list {
    grid-template-columns: 1fr;
  }
}

/* ========== 全屏预览模态框 ========== */
.asset-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(16px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.asset-preview-modal {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.preview-close-btn {
  position: absolute;
  top: -50px;
  right: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.2s ease;
}

.preview-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  transform: scale(1.1);
}

.preview-content {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 80vw;
  max-height: 70vh;
}

/* 文本预览 */
.preview-text {
  max-width: 700px;
  max-height: 60vh;
  padding: 32px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow-y: auto;
}

.preview-text h3 {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 20px 0;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.preview-text .text-content {
  color: rgba(255, 255, 255, 0.8);
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
}

/* 图片预览 */
.preview-image {
  max-width: 80vw;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* 视频预览 */
.preview-video {
  max-width: 80vw;
  max-height: 70vh;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  background: #000;
}

/* 音频预览 */
.preview-audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  padding: 48px 64px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(167, 139, 250, 0.08) 100%);
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 24px;
}

.audio-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.audio-icon {
  font-size: 64px;
  color: rgba(167, 139, 250, 0.8);
}

.audio-visual h3 {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.audio-player {
  width: 400px;
  max-width: 100%;
}

/* 资产信息 */
.preview-info {
  display: flex;
  gap: 32px;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 14px;
  color: #fff;
  font-weight: 500;
}

/* 应用按钮 */
.apply-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 32px;
  background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
}

.apply-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(139, 92, 246, 0.5);
}

.apply-btn:active {
  transform: translateY(0);
}

/* 预览动画 */
.preview-enter-active,
.preview-leave-active {
  transition: all 0.3s ease;
}

.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}

.preview-enter-from .asset-preview-modal,
.preview-leave-to .asset-preview-modal {
  transform: scale(0.9);
  opacity: 0;
}

/* ========== 右键菜单 ========== */
.asset-context-menu {
  position: fixed;
  min-width: 180px;
  background: rgba(32, 32, 38, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 6px;
  z-index: 10001;
  box-shadow: 
    0 12px 40px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.context-menu-item svg {
  opacity: 0.7;
  flex-shrink: 0;
}

.context-menu-item:hover svg {
  opacity: 1;
}

.context-menu-item.danger {
  color: rgba(239, 68, 68, 0.9);
}

.context-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
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
</style>

