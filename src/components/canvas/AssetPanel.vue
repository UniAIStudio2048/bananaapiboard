<script setup>
/**
 * AssetPanel.vue - 我的资产面板
 * 用于管理用户生成的文案、图片、视频、音频等资源
 * 支持分类、标签、收藏、拖拽添加到画布
 * 支持全屏预览和应用到画布
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getAssets, deleteAsset, toggleFavorite, updateAssetTags, updateAsset, saveAsset } from '@/api/canvas/assets'
import { getCachedAssets, cacheAssets, invalidateAssetCache } from '@/utils/assetCache'
import { preloadImages } from '@/utils/imageCache'
import { toSameOriginUrl } from '@/utils/canvasThumbnail'
import { listAssetGroups, listAssets as listSeedanceAssets, deleteAssetGroup } from '@/api/canvas/volcengine-assets'
import { getApiUrl, getMediaUrl, getTenantHeaders, isSeedanceFeaturesEnabled, isSoraCharacterLibraryEnabled, isByteforCharacterLibraryEnabled } from '@/config/tenant'
import { useI18n } from '@/i18n'
import { useTeamStore } from '@/stores/team'
import SpaceSwitcher from './SpaceSwitcher.vue'
import SeedanceCharacterPanel from './SeedanceCharacterPanel.vue'
import CopyToSpaceDialog from './CopyToSpaceDialog.vue'
import AssetCard from './AssetCard.vue'
import AssetHoverPreview from './AssetHoverPreview.vue'
import AssetPreviewModal from './AssetPreviewModal.vue'
import {
  setCanvasSpaceFilterFromGlobal,
  syncGlobalSpaceFromFilter,
  useCanvasSpaceFilter
} from './spaceFilterState'

const { t, currentLanguage } = useI18n()
const teamStore = useTeamStore()

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
const spaceFilter = useCanvasSpaceFilter(teamStore) // 空间筛选: 'personal' | 'team-xxx' | 'all'
const showTagManager = ref(false)
const editingAsset = ref(null)
const newTagInput = ref('')

// ========== 虚拟滚动 ==========
const assetListRef = ref(null)
const assetScrollTop = ref(0)
const assetContainerHeight = ref(600)
const ASSET_ROW_HEIGHT = 560
const ASSET_COLS = 3
const ASSET_BUFFER = 4

// 全屏预览状态
const showPreview = ref(false)
const previewAsset = ref(null)

// 悬停预览状态
const hoverAsset = ref(null)
const hoverAnchorRect = ref(null)
const showHoverPreview = ref(false)
let showHoverTimer = null
let hideHoverTimer = null

// 编辑名称状态
const editingNameAssetId = ref(null)
const editingNameValue = ref('')

// 添加角色弹窗状态
const showAddCharacterModal = ref(false)
const addCharacterForm = ref({
  name: '',
  username: '',
  file: null,
  filePreview: null,
  fileType: null // 'image' or 'video'
})
const addCharacterLoading = ref(false)
const addCharacterError = ref('')

// 添加角色下拉菜单状态（2秒延迟隐藏）
const showAddCharacterDropdown = ref(false)
let addCharacterDropdownTimer = null

// Seedance 角色库下拉菜单状态
const showSeedanceDropdownMenu = ref(false)
let seedanceDropdownTimer = null
const seedanceGroups = ref([])
const seedanceAssetCount = ref(0)
const selectedSeedanceGroupId = ref(null)
const seedancePendingAction = ref(null)

// 右键菜单状态
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuAsset = ref(null)

// 本地资产删除确认弹窗状态
const deleteAssetConfirm = ref({
  visible: false,
  asset: null
})
const deleteAssetLoading = ref(false)
const deleteAssetError = ref('')

// 复制到空间状态
const showCopyDialog = ref(false)
const copyItems = ref([])

// 视频缩略图缓存
const videoThumbnails = ref({})
const videoThumbnailQueue = ref([])
const processingThumbnails = ref(0)
const MAX_CONCURRENT_THUMBNAILS = 2

// 音频不可用状态（源文件已删除等）
const audioUnavailableSet = ref(new Set())

// 数据缓存和延迟渲染
const dataCached = ref(false)
const lastLoadTime = ref(0)
const CACHE_DURATION = 60000 // 缓存有效期 60 秒
const isContentReady = ref(false) // 延迟渲染标记

// 团队空间实时同步
const TEAM_SYNC_INTERVAL = 10000 // 团队空间同步间隔 10 秒
let teamSyncTimer = null
const lastSyncId = ref(null) // 记录最新一条记录的ID

const seedanceFeaturesEnabled = computed(() => isSeedanceFeaturesEnabled())
const soraCharacterLibraryEnabled = computed(() => isSoraCharacterLibraryEnabled())
const byteforCharacterLibraryEnabled = computed(() => isByteforCharacterLibraryEnabled())

// 文件类型 - 存储翻译键，在模板中实时翻译
const allFileTypes = [
  { key: 'all', labelKey: 'common.all', icon: '◈' },
  { key: 'text', labelKey: 'canvas.assetPanel.copywriting', icon: 'Aa' },
  { key: 'image', labelKey: 'canvas.nodes.image', icon: '◫' },
  { key: 'video', labelKey: 'canvas.nodes.video', icon: '▷' },
  { key: 'audio', labelKey: 'canvas.nodes.audio', icon: '♪' },
  { key: 'sora-character', labelKey: 'canvas.soraCharacterLib', icon: '👤' },
  { key: 'seedance-character', labelKey: 'canvas.seedanceCharacterLib', icon: '👥' },
  { key: 'bytefor-character', labelKey: 'canvas.byteforCharacterLib', icon: '人' }
]
const fileTypes = computed(() =>
  allFileTypes.filter(ft => {
    if (ft.key === 'seedance-character') return seedanceFeaturesEnabled.value
    if (ft.key === 'sora-character') return soraCharacterLibraryEnabled.value
    if (ft.key === 'bytefor-character') return byteforCharacterLibraryEnabled.value
    return true
  })
)

const fileTypeLabels = computed(() =>
  fileTypes.value.map(ft => ({
    ...ft,
    label: ft.labelKey ? t(ft.labelKey) : ft.label
  }))
)

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

const tagCounts = computed(() => {
  const counts = { all: 0, favorite: 0 }
  assets.value.forEach(asset => {
    if (!seedanceFeaturesEnabled.value && asset.type === 'seedance-character') return
    if (!byteforCharacterLibraryEnabled.value && asset.type === 'bytefor-character') return
    if (selectedType.value !== 'all' && asset.type !== selectedType.value) return
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      const matchesSearch =
        asset.name?.toLowerCase().includes(query) ||
        asset.content?.toLowerCase().includes(query) ||
        asset.tags?.some(t => t.toLowerCase().includes(query))
      if (!matchesSearch) return
    }
    counts.all++
    if (asset.is_favorite) counts.favorite++
    if (asset.tags) {
      asset.tags.forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1
      })
    }
  })
  return counts
})

// 筛选后的资产
const filteredAssets = computed(() => {
  let result = assets.value

  // Seedance 功能关闭时过滤掉 seedance-character 类型资产
  if (!seedanceFeaturesEnabled.value) {
    result = result.filter(a => a.type !== 'seedance-character')
  }
  if (!byteforCharacterLibraryEnabled.value) {
    result = result.filter(a => a.type !== 'bytefor-character')
  }

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

const visibleAssets = computed(() => {
  const items = filteredAssets.value
  const total = items.length
  if (total <= 30) {
    return items.map((item, index) => ({ item, index }))
  }

  const startRow = Math.max(0, Math.floor(assetScrollTop.value / ASSET_ROW_HEIGHT) - ASSET_BUFFER)
  const endRow = Math.ceil((assetScrollTop.value + assetContainerHeight.value) / ASSET_ROW_HEIGHT) + ASSET_BUFFER
  const startIndex = startRow * ASSET_COLS
  const endIndex = Math.min(total, (endRow + 1) * ASSET_COLS)

  const visible = []
  for (let i = startIndex; i < endIndex; i++) {
    if (items[i]) visible.push({ item: items[i], index: i })
  }
  return visible
})

const assetTotalHeight = computed(() => {
  const total = filteredAssets.value.length
  if (total <= 30) return 'auto'
  return Math.ceil(total / ASSET_COLS) * ASSET_ROW_HEIGHT + 'px'
})

const assetOffsetY = computed(() => {
  const total = filteredAssets.value.length
  if (total <= 30) return 0
  const startRow = Math.max(0, Math.floor(assetScrollTop.value / ASSET_ROW_HEIGHT) - ASSET_BUFFER)
  return startRow * ASSET_ROW_HEIGHT
})

// 按类型分组的资产统计
const assetStats = computed(() => {
  const stats = { all: 0, text: 0, image: 0, video: 0, audio: 0, 'sora-character': 0, 'seedance-character': 0, 'bytefor-character': 0 }
  assets.value.forEach(a => {
    if (!seedanceFeaturesEnabled.value && a.type === 'seedance-character') return
    if (!byteforCharacterLibraryEnabled.value && a.type === 'bytefor-character') return
    stats.all++
    if (stats[a.type] !== undefined) {
      stats[a.type]++
    }
  })
  return stats
})

// ========== 方法 ==========

let assetScrollRAF = null
function handleAssetScroll(e) {
  closeHoverPreview()
  if (assetScrollRAF) return
  assetScrollRAF = requestAnimationFrame(() => {
    assetScrollTop.value = e.target.scrollTop
    assetScrollRAF = null
  })
}

function closeHoverPreview() {
  if (showHoverTimer) {
    clearTimeout(showHoverTimer)
    showHoverTimer = null
  }
  if (hideHoverTimer) {
    clearTimeout(hideHoverTimer)
    hideHoverTimer = null
  }
  showHoverPreview.value = false
  hoverAsset.value = null
  hoverAnchorRect.value = null
}

function handleCardMouseEnter(e, asset) {
  if (hideHoverTimer) {
    clearTimeout(hideHoverTimer)
    hideHoverTimer = null
  }
  if (showHoverTimer) clearTimeout(showHoverTimer)
  showHoverTimer = setTimeout(() => {
    hoverAsset.value = asset
    hoverAnchorRect.value = e.currentTarget.getBoundingClientRect()
    showHoverPreview.value = true
    showHoverTimer = null
  }, 250)
}

function handleCardMouseLeave() {
  if (showHoverTimer) {
    clearTimeout(showHoverTimer)
    showHoverTimer = null
  }
  hideHoverTimer = setTimeout(() => {
    closeHoverPreview()
  }, 150)
}

function handleHoverPreviewEnter() {
  if (hideHoverTimer) {
    clearTimeout(hideHoverTimer)
    hideHoverTimer = null
  }
}

function handleHoverPreviewLeave() {
  hideHoverTimer = setTimeout(() => {
    closeHoverPreview()
  }, 150)
}

watch([selectedType, selectedTag, searchQuery], () => {
  closeHoverPreview()
  assetScrollTop.value = 0
  if (assetListRef.value) {
    assetListRef.value.scrollTop = 0
  }
})

// 加载资产列表（带 IndexedDB 缓存 + stale-while-revalidate）
async function loadAssets(forceRefresh = false) {
  const now = Date.now()
  
  // 1. 内存缓存检查
  if (!forceRefresh && dataCached.value && (now - lastLoadTime.value < CACHE_DURATION)) {
    console.log('[AssetPanel] 使用内存缓存')
    return
  }
  
  const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
  const { spaceType, teamId } = spaceParams
  
  // 2. IndexedDB 缓存 + stale-while-revalidate
  if (!forceRefresh) {
    try {
      const cachedData = await getCachedAssets('all', spaceType, teamId)
      if (cachedData) {
        assets.value = cachedData
        dataCached.value = true
        lastLoadTime.value = now
        console.log('[AssetPanel] 使用 IndexedDB 缓存:', cachedData.length, '个，后台刷新中...')
        _refreshAssetsInBackground(spaceParams, spaceType, teamId)
        return
      }
    } catch (e) {
      console.warn('[AssetPanel] IndexedDB 读取失败:', e)
    }
  }
  
  // 3. 无缓存，显示 loading 从服务器加载
  loading.value = true
  try {
    const freshData = await _fetchAssetsFromServer(spaceParams, spaceType, teamId)
    assets.value = freshData
    dataCached.value = true
    lastLoadTime.value = now
    checkAudioAvailability(freshData)
  } catch (error) {
    console.error('[AssetPanel] 加载资产失败:', error)
  } finally {
    loading.value = false
  }
}

async function _fetchAssetsFromServer(spaceParams, spaceType, teamId) {
  const result = await getAssets(spaceParams)
  const freshData = result.assets || []
  console.log('[AssetPanel] 从服务器加载:', freshData.length, '个')
  
  cacheAssets('all', spaceType, teamId, freshData).catch(() => {})
  
  const preloadUrls = freshData
    .filter(item => item.type === 'image' && item.url)
    .slice(0, 8)
    .map(item => item.thumbnail_url || item.url)
  if (preloadUrls.length > 0) {
    preloadImages(preloadUrls)
  }
  
  return freshData
}

async function _refreshAssetsInBackground(spaceParams, spaceType, teamId) {
  try {
    const freshData = await _fetchAssetsFromServer(spaceParams, spaceType, teamId)
    if (freshData.length !== assets.value.length || 
        JSON.stringify(freshData.map(d => d.id).slice(0, 5)) !== JSON.stringify(assets.value.map(d => d.id).slice(0, 5))) {
      assets.value = freshData
      console.log('[AssetPanel] 后台刷新完成，数据已更新')
    }
  } catch (e) {
    console.warn('[AssetPanel] 后台刷新失败:', e)
  }
}

function upsertAssetInList(asset) {
  if (!asset?.id) return
  const existingIndex = assets.value.findIndex(item => item.id === asset.id)
  if (existingIndex === 0) {
    assets.value[0] = { ...assets.value[0], ...asset }
    return
  }
  if (existingIndex > 0) {
    assets.value.splice(existingIndex, 1)
  }
  assets.value = [asset, ...assets.value]
  dataCached.value = true
  lastLoadTime.value = Date.now()
}

// 检查音频资产可用性
function checkAudioAvailability(assetList) {
  const DEPRECATED_DOMAINS = ['oss.nananobanana.cn']
  const audioAssets = assetList.filter(a => a.type === 'audio' && a.url)
  if (audioAssets.length === 0) return

  const newUnavailable = new Set(audioUnavailableSet.value)
  for (const asset of audioAssets) {
    if (DEPRECATED_DOMAINS.some(d => asset.url.includes(d))) {
      newUnavailable.add(asset.id)
    }
  }
  if (newUnavailable.size > audioUnavailableSet.value.size) {
    audioUnavailableSet.value = newUnavailable
  }
}

/**
 * 团队空间实时同步 - 检查是否有新数据
 */
async function checkTeamSync() {
  // 仅在团队空间且面板可见时同步
  if (!teamStore.isInTeamSpace.value || !props.visible) return
  
  // 仅在筛选团队空间时同步
  if (!spaceFilter.value.startsWith('team-')) return
  
  try {
    const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
    const result = await getAssets({ ...spaceParams, limit: 1 })
    const latestAsset = result.assets?.[0]
    
    if (latestAsset) {
      // 如果有新数据（ID不同或首次同步）
      if (lastSyncId.value !== null && lastSyncId.value !== latestAsset.id) {
        console.log('[AssetPanel] 检测到新数据，自动刷新')
        dataCached.value = false
        await loadAssets(true)
      }
      lastSyncId.value = latestAsset.id
    }
  } catch (error) {
    console.error('[AssetPanel] 团队同步检查失败:', error)
  }
}

/**
 * 启动团队空间实时同步
 */
function startTeamSync() {
  stopTeamSync()
  if (teamStore.isInTeamSpace.value && props.visible) {
    // 记录当前最新ID
    if (assets.value.length > 0) {
      lastSyncId.value = assets.value[0].id
    }
    teamSyncTimer = setInterval(checkTeamSync, TEAM_SYNC_INTERVAL)
    console.log('[AssetPanel] 启动团队空间实时同步')
  }
}

/**
 * 停止团队空间实时同步
 */
function stopTeamSync() {
  if (teamSyncTimer) {
    clearInterval(teamSyncTimer)
    teamSyncTimer = null
    console.log('[AssetPanel] 停止团队空间实时同步')
  }
}

async function handleSpaceChange(newSpace) {
  await syncGlobalSpaceFromFilter(teamStore, newSpace)
}

function refreshForSpaceChange(newSpace) {
  dataCached.value = false // 清除缓存
  if (props.visible) {
    loadAssets(true)
  }

  // 重新评估是否需要同步
  if (newSpace.startsWith('team-')) {
    startTeamSync()
  } else {
    stopTeamSync()
  }
}

// 监听团队空间状态变化，控制同步
watch(() => teamStore.isInTeamSpace.value, (isTeam) => {
  if (isTeam && props.visible && spaceFilter.value.startsWith('team-')) {
    startTeamSync()
  } else {
    stopTeamSync()
  }
})

watch(spaceFilter, (newFilter) => {
  refreshForSpaceChange(newFilter)
})

watch([() => teamStore.globalSpaceType.value, () => teamStore.globalTeamId.value], () => {
  setCanvasSpaceFilterFromGlobal(teamStore)
})

// 获取资产预览
function getAssetPreview(asset) {
  switch (asset.type) {
    case 'text':
      return asset.content?.substring(0, 100) + (asset.content?.length > 100 ? '...' : '')
    case 'image':
    case 'video':
      return getMediaUrl(asset.thumbnail_url || asset.url)
    case 'audio':
      return null
    default:
      if (asset.thumbnail_url || asset.url) {
        return getMediaUrl(asset.thumbnail_url || asset.url)
      }
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

async function performDeleteAsset(asset) {
  if (!asset?.id) return
  try {
    await deleteAsset(asset.id)
    assets.value = assets.value.filter(a => a.id !== asset.id)
    if (previewAsset.value?.id === asset.id) {
      closePreview()
    }
  } catch (error) {
    console.error('[AssetPanel] 删除资产失败:', error)
    throw error
  }
}

function requestDeleteAsset(asset) {
  if (!asset) return
  closeHoverPreview()
  deleteAssetError.value = ''
  deleteAssetConfirm.value = {
    visible: true,
    asset
  }
}

function cancelDeleteAsset() {
  if (deleteAssetLoading.value) return
  deleteAssetConfirm.value = {
    visible: false,
    asset: null
  }
  deleteAssetError.value = ''
}

async function confirmDeleteAsset() {
  const asset = deleteAssetConfirm.value.asset
  if (!asset || deleteAssetLoading.value) return

  deleteAssetLoading.value = true
  deleteAssetError.value = ''
  try {
    await performDeleteAsset(asset)
    deleteAssetConfirm.value = {
      visible: false,
      asset: null
    }
  } catch (error) {
    deleteAssetError.value = error?.message
      ? `${t('errors.deleteFailed')}: ${error.message}`
      : t('errors.deleteFailed')
  } finally {
    deleteAssetLoading.value = false
  }
}

// 删除资产
function handleDelete(e, asset) {
  e.stopPropagation()
  requestDeleteAsset(asset)
}

// 开始编辑名称
function startEditName(e, asset) {
  e.stopPropagation()
  editingNameAssetId.value = asset.id
  editingNameValue.value = asset.name
}

// 保存编辑的名称
async function saveEditedName(asset) {
  const newName = editingNameValue.value.trim()
  if (!newName) {
    editingNameAssetId.value = null
    return
  }
  
  if (newName === asset.name) {
    editingNameAssetId.value = null
    return
  }
  
  try {
    await updateAsset(asset.id, { name: newName })
    // 更新本地数据
    const assetIndex = assets.value.findIndex(a => a.id === asset.id)
    if (assetIndex !== -1) {
      assets.value[assetIndex].name = newName
    }
    editingNameAssetId.value = null
  } catch (error) {
    console.error('[AssetPanel] 更新名称失败:', error)
    alert('更新名称失败: ' + error.message)
  }
}

// 取消编辑名称
function cancelEditName() {
  editingNameAssetId.value = null
  editingNameValue.value = ''
}

// 点击资产 - Sora 角色单击复制 ID，其他资产打开预览
function handleAssetClick(e, asset) {
  // Sora 角色：单击复制角色 ID（仅当角色创建成功时）
  if (asset.type === 'sora-character') {
    const status = getCharacterStatus(asset)
    // 如果角色创建失败，点击不做任何操作（用户可以通过删除按钮删除）
    if (status === 'failed') {
      return
    }
    const username = getCharacterUsername(asset)
    navigator.clipboard.writeText(`@${username}`).then(() => {
      copyToastMessage.value = `已复制: @${username}`
      copyToastVisible.value = true
      setTimeout(() => {
        copyToastVisible.value = false
      }, 2000)
    }).catch(err => {
      console.error('复制失败:', err)
    })
    return
  }
  // 其他资产：打开全屏预览
  previewAsset.value = asset
  showPreview.value = true
}

// 双击资产 - 打开全屏预览（Sora 角色也支持）
function handleAssetDoubleClick(asset) {
  previewAsset.value = asset
  showPreview.value = true
}

// 关闭全屏预览
function closePreview() {
  showPreview.value = false
  previewAsset.value = null
}

function handlePreviewManageTags(asset = previewAsset.value) {
  if (!asset) return
  editingAsset.value = asset
  showTagManager.value = true
  newTagInput.value = ''
}

async function handlePreviewDownload(asset = previewAsset.value) {
  await handleDownload(asset)
}

async function handlePreviewDelete(asset = previewAsset.value) {
  if (!asset) return
  closePreview()
  requestDeleteAsset(asset)
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

// 走 startStreamDownload：浏览器原生下载栏（带进度），点击立即响应
async function handleDownload(assetArg = contextMenuAsset.value) {
  if (!assetArg) return

  const asset = assetArg
  if (contextMenuAsset.value === asset) {
    closeContextMenu()
  }
  
  try {
    let assetUrl = asset.url
    let filename = asset.name || `asset_${asset.id}`
    
    // 根据类型确定文件扩展名
    if (asset.type === 'text') {
      // 文本资产创建 blob
      const blob = new Blob([asset.content || ''], { type: 'text/plain;charset=utf-8' })
      const downloadUrl = URL.createObjectURL(blob)
      filename = filename.endsWith('.txt') ? filename : `${filename}.txt`
      
      // 文本类型直接下载 blob
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
      return
    }
    
    // 确保文件名有正确扩展名
    if (asset.type === 'image' && !filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      filename = `${filename}.png`
    } else if (asset.type === 'video' && !filename.match(/\.(mp4|webm|mov)$/i)) {
      filename = `${filename}.mp4`
    } else if (asset.type === 'audio' && !filename.match(/\.(mp3|wav|ogg)$/i)) {
      filename = `${filename}.mp3`
    }
    
    console.log('[AssetPanel] 开始下载:', { url: assetUrl.substring(0, 60), filename })
    
    // 走流式下载，触发浏览器原生下载栏（带进度），点击即响应
    const { startStreamDownload } = await import('@/api/client')
    startStreamDownload(assetUrl, filename)
    console.log('[AssetPanel] 已开始下载:', filename)
  } catch (error) {
    console.error('[AssetPanel] 下载失败:', error)
    alert(t('errors.downloadFailed') || '下载失败')
  }
}

// 右键菜单 - 删除
function handleContextDelete() {
  if (!contextMenuAsset.value) return
  
  const asset = contextMenuAsset.value
  closeContextMenu()
  requestDeleteAsset(asset)
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

function handleCopyToSpace(event, asset) {
  event.stopPropagation()
  copyItems.value = [{ type: 'canvas_asset', id: asset.id, name: asset.name || asset.type }]
  showCopyDialog.value = true
}

function handleContextCopyToSpace() {
  if (contextMenuAsset.value) {
    copyItems.value = [{ type: 'canvas_asset', id: contextMenuAsset.value.id, name: contextMenuAsset.value.name || contextMenuAsset.value.type }]
    showCopyDialog.value = true
  }
  showContextMenu.value = false
}

function handleCopySuccess() {
  showCopyDialog.value = false
}

// 提取视频首帧作为缩略图（带并发控制）
function extractVideoThumbnail(asset) {
  if (asset.type !== 'video' || !asset.url) return
  if (videoThumbnails.value[asset.id]) return
  
  if (processingThumbnails.value >= MAX_CONCURRENT_THUMBNAILS) {
    if (!videoThumbnailQueue.value.includes(asset.id)) {
      videoThumbnailQueue.value.push(asset.id)
    }
    return
  }
  
  processingThumbnails.value++

  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'

  const safeUrl = toSameOriginUrl(asset.url)
  const THUMBNAIL_TIMEOUT = 5000
  let completed = false

  function onComplete() {
    if (completed) return
    completed = true
    clearTimeout(timeoutId)
    processingThumbnails.value--
    video.src = ''
    video.load()
    video.remove()
    processNextThumbnail()
  }

  const timeoutId = setTimeout(() => {
    if (!completed) {
      console.warn('[AssetPanel] 视频缩略图提取超时:', safeUrl)
      onComplete()
    }
  }, THUMBNAIL_TIMEOUT)

  video.onloadeddata = () => {
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
    onComplete()
  }

  video.onerror = () => {
    console.warn('[AssetPanel] 视频加载失败:', safeUrl)
    onComplete()
  }

  video.src = safeUrl
}

function processNextThumbnail() {
  if (videoThumbnailQueue.value.length === 0) return
  if (processingThumbnails.value >= MAX_CONCURRENT_THUMBNAILS) return
  
  const nextId = videoThumbnailQueue.value.shift()
  const item = assets.value.find(a => a.id === nextId)
  if (item) {
    extractVideoThumbnail(item)
  }
}

// 获取视频缩略图
function getVideoThumbnail(asset) {
  if (asset.thumbnail_url) return asset.thumbnail_url
  if (videoThumbnails.value[asset.id]) return videoThumbnails.value[asset.id]

  // 立即触发提取（不使用 nextTick，确保尽快开始加载）
  if (!videoThumbnails.value[`loading_${asset.id}`]) {
    videoThumbnails.value[`loading_${asset.id}`] = true
    extractVideoThumbnail(asset)
  }

  // 缩略图生成中，不使用视频 URL 冒充图片
  return ''
}

// 获取角色 username（用于显示）
function getCharacterUsername(asset) {
  // 优先使用 metadata 中的 username
  if (asset.metadata?.username) {
    return asset.metadata.username
  }
  // 其次使用 metadata 中的 characterId
  if (asset.metadata?.characterId) {
    return asset.metadata.characterId
  }
  // 如果 name 看起来像 API 用户名（包含 . 且无空格）
  if (asset.name && asset.name.includes('.') && !asset.name.includes(' ')) {
    return asset.name
  }
  // 最后使用资产 ID 前 8 位
  return asset.id?.slice(0, 8) || 'unknown'
}

// 获取角色状态（pending, processing, completed, failed）
function getCharacterStatus(asset) {
  // 优先使用 metadata 中的 status
  if (asset.metadata?.status) {
    return asset.metadata.status
  }
  // 默认返回 completed（如果有 URL 说明创建成功）
  if (asset.url) {
    return 'completed'
  }
  return 'pending'
}

// 获取角色创建失败原因
function getCharacterFailReason(asset) {
  if (asset.metadata?.fail_reason) {
    return asset.metadata.fail_reason
  }
  return null
}

// 复制角色 ID 到剪贴板
const copyToastVisible = ref(false)
const copyToastMessage = ref('')

async function copyCharacterId(e, asset) {
  e.stopPropagation() // 阻止冒泡，避免触发预览
  const username = getCharacterUsername(asset)
  try {
    await navigator.clipboard.writeText(`@${username}`)
    copyToastMessage.value = `已复制: @${username}`
    copyToastVisible.value = true
    setTimeout(() => {
      copyToastVisible.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

// ========== 添加角色功能 ==========

// 显示添加角色下拉菜单（进入时清除隐藏计时器）
function showCharacterDropdown() {
  if (addCharacterDropdownTimer) {
    clearTimeout(addCharacterDropdownTimer)
    addCharacterDropdownTimer = null
  }
  showAddCharacterDropdown.value = true
}

// 开始隐藏计时（2秒后隐藏）
function startHideCharacterDropdown() {
  if (addCharacterDropdownTimer) {
    clearTimeout(addCharacterDropdownTimer)
  }
  addCharacterDropdownTimer = setTimeout(() => {
    showAddCharacterDropdown.value = false
    addCharacterDropdownTimer = null
  }, 2000)
}

// 点击添加角色按钮
function handleAddCharacterClick() {
  // 立即隐藏下拉菜单
  showAddCharacterDropdown.value = false
  if (addCharacterDropdownTimer) {
    clearTimeout(addCharacterDropdownTimer)
    addCharacterDropdownTimer = null
  }
  // 打开弹窗
  openAddCharacterModal()
}

// ========== Seedance 角色库下拉菜单 ==========

async function loadSeedanceGroups() {
  try {
    const result = await listAssetGroups({ pageSize: 100 })
    seedanceGroups.value = result.groups || []

    // 按当前渠道分组过滤资产数量
    const activeGroupIds = new Set(seedanceGroups.value.map(g => g.Id))
    const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
    const localResult = await getAssets({ type: 'seedance-character', ...spaceParams, pageSize: 500 })
    const allAssets = localResult.assets || []
    seedanceAssetCount.value = allAssets.filter(a => {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata || '{}') : (a.metadata || {})
      return meta.groupId && activeGroupIds.has(meta.groupId)
    }).length
  } catch (err) {
    console.error('[AssetPanel] 加载 Seedance 角色组失败:', err)
  }
}

function showSeedanceDropdown() {
  if (seedanceDropdownTimer) {
    clearTimeout(seedanceDropdownTimer)
    seedanceDropdownTimer = null
  }
  showSeedanceDropdownMenu.value = true
}

function startHideSeedanceDropdown() {
  if (seedanceDropdownTimer) {
    clearTimeout(seedanceDropdownTimer)
  }
  seedanceDropdownTimer = setTimeout(() => {
    showSeedanceDropdownMenu.value = false
    seedanceDropdownTimer = null
  }, 2000)
}

function selectSeedanceGroup(group) {
  selectedSeedanceGroupId.value = group.Id
  selectedType.value = 'seedance-character'
  showSeedanceDropdownMenu.value = false
  if (seedanceDropdownTimer) {
    clearTimeout(seedanceDropdownTimer)
    seedanceDropdownTimer = null
  }
}

function handleCreateSeedanceGroup() {
  showSeedanceDropdownMenu.value = false
  if (seedanceDropdownTimer) {
    clearTimeout(seedanceDropdownTimer)
    seedanceDropdownTimer = null
  }
  selectedSeedanceGroupId.value = null
  seedancePendingAction.value = 'create'
  selectedType.value = 'seedance-character'
}

function handleSeedanceUpload() {
  showSeedanceDropdownMenu.value = false
  if (seedanceDropdownTimer) {
    clearTimeout(seedanceDropdownTimer)
    seedanceDropdownTimer = null
  }
  selectedSeedanceGroupId.value = null
  seedancePendingAction.value = 'upload'
  selectedType.value = 'seedance-character'
}

function handleSeedanceInsert(assetData) {
  emit('insert-asset', assetData)
  emit('close')
}

// 删除 seedance 分组
const showDeleteSeedanceGroupConfirm = ref(false)
const deleteSeedanceGroupTarget = ref(null)
const deleteSeedanceGroupLoading = ref(false)

function requestDeleteSeedanceGroup(group, event) {
  event.stopPropagation()
  showSeedanceDropdownMenu.value = false
  deleteSeedanceGroupTarget.value = group
  showDeleteSeedanceGroupConfirm.value = true
}

function cancelDeleteSeedanceGroup() {
  showDeleteSeedanceGroupConfirm.value = false
  deleteSeedanceGroupTarget.value = null
}

async function confirmDeleteSeedanceGroup() {
  if (!deleteSeedanceGroupTarget.value) return
  const group = deleteSeedanceGroupTarget.value
  deleteSeedanceGroupLoading.value = true
  try {
    await deleteAssetGroup(group.Id)
    showDeleteSeedanceGroupConfirm.value = false
    deleteSeedanceGroupTarget.value = null
    if (selectedSeedanceGroupId.value === group.Id) {
      selectedSeedanceGroupId.value = null
    }
    await loadSeedanceGroups()
  } catch (err) {
    console.error('[AssetPanel] 删除 Seedance 分组失败:', err)
  } finally {
    deleteSeedanceGroupLoading.value = false
  }
}

// 打开添加角色弹窗
function openAddCharacterModal() {
  addCharacterForm.value = {
    name: '',
    username: '',
    file: null,
    filePreview: null,
    fileType: null
  }
  addCharacterError.value = ''
  showAddCharacterModal.value = true
}

// 关闭添加角色弹窗
function closeAddCharacterModal() {
  showAddCharacterModal.value = false
  // 清理预览URL
  if (addCharacterForm.value.filePreview) {
    URL.revokeObjectURL(addCharacterForm.value.filePreview)
  }
}

// 处理文件选择
function handleCharacterFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return
  
  addCharacterError.value = ''
  
  // 检查文件类型
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  
  if (!isImage && !isVideo) {
    addCharacterError.value = '请上传图片或视频文件'
    return
  }
  
  // 检查视频时长（3秒以下）
  if (isVideo) {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      if (video.duration > 3) {
        addCharacterError.value = '视频时长不能超过3秒'
        addCharacterForm.value.file = null
        addCharacterForm.value.filePreview = null
        addCharacterForm.value.fileType = null
        URL.revokeObjectURL(video.src)
        return
      }
      URL.revokeObjectURL(video.src)
    }
    video.src = URL.createObjectURL(file)
  }
  
  // 清理之前的预览
  if (addCharacterForm.value.filePreview) {
    URL.revokeObjectURL(addCharacterForm.value.filePreview)
  }
  
  addCharacterForm.value.file = file
  addCharacterForm.value.filePreview = URL.createObjectURL(file)
  addCharacterForm.value.fileType = isVideo ? 'video' : 'image'
}

// 提交添加角色
async function submitAddCharacter() {
  const { name, username, file, fileType } = addCharacterForm.value
  
  // 验证表单
  if (!name?.trim()) {
    addCharacterError.value = '请输入角色名称'
    return
  }
  if (!username?.trim()) {
    addCharacterError.value = '请输入角色ID（外部平台的用户名）'
    return
  }
  if (!file) {
    addCharacterError.value = '请上传角色图片或视频'
    return
  }
  
  addCharacterLoading.value = true
  addCharacterError.value = ''
  
  try {
    // 1. 先上传文件到服务器
    const formData = new FormData()
    
    // 根据文件类型选择正确的 API 和字段名
    const uploadUrl = fileType === 'video' 
      ? `${getApiUrl('')}/api/videos/upload`
      : `${getApiUrl('')}/api/images/upload`
    
    // 视频上传使用 'file' 字段，图片上传使用 'images' 字段
    if (fileType === 'video') {
      formData.append('file', file)
    } else {
      formData.append('images', file)
    }
    
    const token = localStorage.getItem('token')
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    })
    
    if (!uploadResponse.ok) {
      const err = await uploadResponse.json().catch(() => ({}))
      throw new Error(err.error || err.message || '文件上传失败')
    }
    
    const uploadResult = await uploadResponse.json()
    const fileUrl = uploadResult.url || uploadResult.urls?.[0]
    
    if (!fileUrl) {
      throw new Error('文件上传失败：未返回URL')
    }
    
    // 2. 保存为 sora-character 资产（包含当前空间信息）
    const spaceParams = teamStore.getSpaceParams('current')
    const assetData = {
      type: 'sora-character',
      name: name.trim(),
      url: fileUrl,
      thumbnail_url: fileType === 'image' ? fileUrl : null,
      metadata: {
        username: username.trim(),
        source: 'manual',
        status: 'completed'
      },
      // 空间参数
      spaceType: spaceParams.spaceType,
      teamId: spaceParams.teamId
    }
    
    await saveAsset(assetData)
    
    // 3. 刷新资产列表
    await loadAssets(true)
    
    // 4. 关闭弹窗
    closeAddCharacterModal()
    
    // 5. 显示成功提示
    copyToastMessage.value = `角色 "${name}" 添加成功！`
    copyToastVisible.value = true
    setTimeout(() => {
      copyToastVisible.value = false
    }, 2000)
    
  } catch (error) {
    console.error('[AssetPanel] 添加角色失败:', error)
    addCharacterError.value = error.message || '添加角色失败'
  } finally {
    addCharacterLoading.value = false
  }
}

// 开始拖拽
function handleDragStart(e, asset) {
  // 为 sora-character 添加 metadata
  const assetData = {
    id: asset.id,
    type: asset.type,
    name: asset.name,
    content: asset.content,
    url: asset.url,
    thumbnail_url: asset.thumbnail_url
  }
  
  // 如果是 Sora 角色，添加 metadata 信息
  if (asset.type === 'sora-character') {
    assetData.metadata = asset.metadata || {}
    assetData.metadata.username = getCharacterUsername(asset)
    assetData.metadata.name = asset.name
  }

  if (asset.type === 'seedance-character') {
    assetData.metadata = asset.metadata || {}
  }
  
  e.dataTransfer.setData('application/json', JSON.stringify({
    type: 'asset-insert',
    asset: assetData
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

function openBottomTagManager(e) {
  e.stopPropagation()
  const target = hoverAsset.value || filteredAssets.value[0]
  if (!target) return
  openTagManager(e, target)
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
    // 更新编辑中的资产
    editingAsset.value.tags = updatedTags
    // 同步更新资产列表中对应的资产
    const assetInList = assets.value.find(a => a.id === editingAsset.value.id)
    if (assetInList) {
      assetInList.tags = updatedTags
    }
    newTagInput.value = ''
    console.log('[AssetPanel] 标签添加成功:', newTag)
  } catch (error) {
    console.error('[AssetPanel] 添加标签失败:', error)
    alert('添加标签失败: ' + error.message)
  }
}

// 移除标签
async function removeTag(tag) {
  if (!editingAsset.value) return
  
  const updatedTags = (editingAsset.value.tags || []).filter(t => t !== tag)
  
  try {
    await updateAssetTags(editingAsset.value.id, updatedTags)
    // 更新编辑中的资产
    editingAsset.value.tags = updatedTags
    // 同步更新资产列表中对应的资产
    const assetInList = assets.value.find(a => a.id === editingAsset.value.id)
    if (assetInList) {
      assetInList.tags = updatedTags
    }
    console.log('[AssetPanel] 标签移除成功:', tag)
  } catch (error) {
    console.error('[AssetPanel] 移除标签失败:', error)
    alert('移除标签失败: ' + error.message)
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
    await loadAssets()
    startTeamSync()
    isContentReady.value = false
    requestAnimationFrame(() => {
      isContentReady.value = true
    })
  } else {
    closeHoverPreview()
    closePreview()
    stopTeamSync()
  }
})

// 键盘事件
function handleKeydown(e) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    if (deleteAssetConfirm.value.visible) {
      cancelDeleteAsset()
    } else if (showPreview.value) {
      closePreview()
    } else if (showContextMenu.value) {
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

// 资产更新事件处理
function handleAssetsUpdated(event) {
  console.log('[AssetPanel] 收到资产更新事件，刷新数据')
  if (event?.detail?.asset) {
    upsertAssetInList(event.detail.asset)
  }
  invalidateAssetCache('all').catch(() => {})
  loadAssets(true)
}

let assetResizeObserver = null

watch(assetListRef, (el) => {
  if (assetResizeObserver) {
    assetResizeObserver.disconnect()
    assetResizeObserver = null
  }
  if (el && 'ResizeObserver' in window) {
    assetResizeObserver = new ResizeObserver(() => {
      if (assetListRef.value) {
        assetContainerHeight.value = assetListRef.value.clientHeight
      }
    })
    assetResizeObserver.observe(el)
    assetContainerHeight.value = el.clientHeight
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleGlobalClick)
  window.addEventListener('assets-updated', handleAssetsUpdated)
  loadSeedanceGroups()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('assets-updated', handleAssetsUpdated)
  
  // 停止团队空间实时同步
  stopTeamSync()
  closeHoverPreview()

  if (assetResizeObserver) {
    assetResizeObserver.disconnect()
    assetResizeObserver = null
  }
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
        
        <!-- 空间切换器 -->
        <SpaceSwitcher 
          v-model="spaceFilter" 
          @change="handleSpaceChange"
          :compact="true"
        />

        <!-- 文件类型筛选 -->
        <div class="type-filter">
          <template v-for="ft in fileTypes" :key="ft.key">
            <!-- Sora角色库特殊处理：包含悬停弹出的添加角色按钮 -->
            <div 
              v-if="ft.key === 'sora-character'" 
              class="sora-character-wrapper"
              @mouseenter="showCharacterDropdown"
              @mouseleave="startHideCharacterDropdown"
            >
              <button 
                class="type-btn"
                :class="{ active: selectedType === ft.key }"
                @click="selectedType = ft.key"
              >
                <span class="type-icon">{{ ft.icon }}</span>
                <span class="type-label">{{ ft.labelKey ? t(ft.labelKey) : ft.label }}</span>
                <span class="type-count">{{ assetStats[ft.key] || 0 }}</span>
              </button>
              <!-- 悬停时弹出的添加角色按钮（2秒延迟隐藏） -->
              <div 
                class="add-character-dropdown"
                :class="{ visible: showAddCharacterDropdown }"
                @mouseenter="showCharacterDropdown"
                @mouseleave="startHideCharacterDropdown"
              >
                <button 
                  class="add-character-btn"
                  @click.stop="handleAddCharacterClick"
                  title="手动添加外部角色"
                >
                  <span class="btn-icon">+</span>
                  <span class="btn-text">添加角色</span>
                </button>
              </div>
            </div>
            <!-- Seedance角色库特殊处理：包含悬停弹出的角色组下拉菜单 -->
            <div 
              v-else-if="ft.key === 'seedance-character' && seedanceFeaturesEnabled" 
              class="seedance-character-wrapper"
              @mouseenter="showSeedanceDropdown"
              @mouseleave="startHideSeedanceDropdown"
            >
              <button 
                class="type-btn"
                :class="{ active: selectedType === ft.key }"
                @click="selectedType = ft.key"
              >
                <span class="type-icon">{{ ft.icon }}</span>
                <span class="type-label">{{ ft.labelKey ? t(ft.labelKey) : ft.label }}</span>
                <span class="type-count">{{ seedanceAssetCount }}</span>
              </button>
              <div 
                class="seedance-dropdown"
                :class="{ visible: showSeedanceDropdownMenu }"
                @mouseenter="showSeedanceDropdown"
                @mouseleave="startHideSeedanceDropdown"
              >
                <div class="seedance-dropdown-header">角色组</div>
                <div v-if="seedanceGroups.length === 0" class="seedance-dropdown-empty">暂无角色组</div>
                <div 
                  v-for="group in seedanceGroups" 
                  :key="group.Id" 
                  class="seedance-dropdown-item"
                  @click="selectSeedanceGroup(group)"
                >
                  <span class="group-name">{{ group.Name }}</span>
                  <button 
                    v-if="group._isOwner" 
                    class="seedance-group-delete-btn"
                    @click="requestDeleteSeedanceGroup(group, $event)"
                    title="删除此分组"
                  >
                    <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
                <div class="seedance-dropdown-divider"></div>
                <button class="seedance-dropdown-action" @click.stop="handleCreateSeedanceGroup">
                  <span>+</span> 新建角色组
                </button>
                <button class="seedance-dropdown-action" @click.stop="handleSeedanceUpload">
                  <span>↑</span> 上传角色
                </button>
              </div>
            </div>
            <!-- 其他类型按钮 -->
            <button 
              v-else
              class="type-btn"
              :class="{ active: selectedType === ft.key }"
              @click="selectedType = ft.key"
            >
              <span class="type-icon">{{ ft.icon }}</span>
              <span class="type-label">{{ ft.labelKey ? t(ft.labelKey) : ft.label }}</span>
              <span class="type-count">{{ assetStats[ft.key] || 0 }}</span>
            </button>
          </template>
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
        <div class="asset-list" ref="assetListRef" @scroll="handleAssetScroll">
          <!-- Seedance 角色库独立面板 -->
          <SeedanceCharacterPanel 
            v-if="selectedType === 'seedance-character' && seedanceFeaturesEnabled" 
            :selectedGroupId="selectedSeedanceGroupId"
            :pendingAction="seedancePendingAction"
            :spaceFilter="spaceFilter"
            @groups-updated="loadSeedanceGroups"
            @clear-group="selectedSeedanceGroupId = null"
            @action-consumed="seedancePendingAction = null"
            @insert-to-canvas="handleSeedanceInsert"
          />

          <SeedanceCharacterPanel
            v-else-if="selectedType === 'bytefor-character' && byteforCharacterLibraryEnabled"
            libraryType="bytefor"
            :selectedGroupId="null"
            :pendingAction="null"
            :spaceFilter="spaceFilter"
            @groups-updated="loadAssets(true)"
            @insert-to-canvas="handleSeedanceInsert"
          />

          <template v-else>
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
            <div
              class="asset-grid-window"
              :style="filteredAssets.length > 30 ? { minHeight: assetTotalHeight } : null"
            >
            <div
              class="asset-grid-track"
              :style="filteredAssets.length > 30 ? { transform: `translateY(${assetOffsetY}px)` } : null"
            >
            <AssetCard
              v-for="{ item: asset } in visibleAssets"
              :key="asset.id"
              :asset="asset"
              :file-types="fileTypes"
              :audio-unavailable="audioUnavailableSet.has(asset.id)"
              :video-thumbnail="getVideoThumbnail(asset)"
              :formatted-size="formatFileSize(asset.size)"
              :formatted-date="formatDate(asset.created_at)"
              :character-status="getCharacterStatus(asset)"
              :character-fail-reason="getCharacterFailReason(asset) || ''"
              @click="handleAssetClick"
              @dblclick="handleAssetDoubleClick"
              @contextmenu="handleContextMenu"
              @dragstart="handleDragStart"
              @mouseenter="handleCardMouseEnter"
              @mouseleave="handleCardMouseLeave"
              @favorite="handleToggleFavorite"
            />
            </div>
            </div>
          </template>
          </template>
        </div>

        <div class="asset-tag-bar-bottom">
          <div class="tag-scroll">
            <button
              v-for="tag in allTags"
              :key="tag.key"
              class="tag-chip"
              :class="{ active: selectedTag === tag.key }"
              @click="selectedTag = tag.key"
            >
              <span class="tag-icon">{{ tag.icon }}</span>
              <span>{{ tag.labelKey ? t(tag.labelKey) : tag.label }}</span>
              <span v-if="tagCounts[tag.key]" class="tag-count">{{ tagCounts[tag.key] }}</span>
            </button>
          </div>
          <button class="tag-manage-btn" @click="openBottomTagManager" title="管理标签">
            + {{ t('canvas.assetPanel.manageTags') }}
          </button>
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
              <button class="context-menu-item" @click="handleContextCopyToSpace">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>复制到空间</span>
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

        <!-- 添加角色弹窗 -->
        <Transition name="fade">
          <div v-if="showAddCharacterModal" class="add-character-overlay" @click.self="closeAddCharacterModal">
            <div class="add-character-modal">
              <div class="add-character-header">
                <h3>👤 添加外部角色</h3>
                <button class="close-btn small" @click="closeAddCharacterModal">✕</button>
              </div>
              
              <div class="add-character-content">
                <p class="add-character-desc">
                  添加在外部平台（如 Sora 官网）创建的角色到本地角色库，方便在生成时使用 @角色名 引用。
                </p>
                
                <!-- 错误提示 -->
                <div v-if="addCharacterError" class="add-character-error">
                  {{ addCharacterError }}
                </div>
                
                <!-- 文件上传区域 -->
                <div class="file-upload-area">
                  <label class="file-upload-label">
                    <input 
                      type="file" 
                      accept="image/*,video/*"
                      @change="handleCharacterFileSelect"
                      :disabled="addCharacterLoading"
                    />
                    <div v-if="!addCharacterForm.filePreview" class="upload-placeholder">
                      <div class="upload-icon">📁</div>
                      <div class="upload-text">点击上传角色图片或视频</div>
                      <div class="upload-hint">视频不超过3秒</div>
                    </div>
                    <div v-else class="upload-preview">
                      <img 
                        v-if="addCharacterForm.fileType === 'image'"
                        :src="addCharacterForm.filePreview"
                        alt="角色预览"
                      />
                      <video 
                        v-else
                        :src="addCharacterForm.filePreview"
                        muted
                        loop
                        autoplay
                        playsinline
                      />
                      <button class="remove-file-btn" @click.prevent="addCharacterForm.file = null; addCharacterForm.filePreview = null">✕</button>
                    </div>
                  </label>
                </div>
                
                <!-- 表单字段 -->
                <div class="form-field">
                  <label>角色名称</label>
                  <input 
                    v-model="addCharacterForm.name"
                    type="text"
                    placeholder="例如：小王姐姐"
                    :disabled="addCharacterLoading"
                  />
                  <span class="field-hint">用户在 prompt 中使用 @角色名称 来引用</span>
                </div>
                
                <div class="form-field">
                  <label>角色 ID（外部用户名）</label>
                  <input 
                    v-model="addCharacterForm.username"
                    type="text"
                    placeholder="例如：cncqaktt5.sunnysipst"
                    :disabled="addCharacterLoading"
                  />
                  <span class="field-hint">外部平台生成的角色ID，系统会自动将 @角色名称 转换为此ID进行请求</span>
                </div>
              </div>
              
              <div class="add-character-footer">
                <button class="cancel-btn" @click="closeAddCharacterModal" :disabled="addCharacterLoading">
                  取消
                </button>
                <button class="submit-btn" @click="submitAddCharacter" :disabled="addCharacterLoading">
                  <span v-if="addCharacterLoading" class="btn-spinner"></span>
                  {{ addCharacterLoading ? '添加中...' : '添加角色' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>

  <AssetHoverPreview
    :visible="showHoverPreview"
    :asset="hoverAsset"
    :anchor-rect="hoverAnchorRect"
    @mouseenter="handleHoverPreviewEnter"
    @mouseleave="handleHoverPreviewLeave"
  />

  <AssetPreviewModal
    :visible="showPreview"
    :asset="previewAsset"
    :file-types="fileTypeLabels"
    @close="closePreview"
    @apply="applyAssetToCanvas"
    @manage-tags="handlePreviewManageTags"
    @download="handlePreviewDownload"
    @delete="handlePreviewDelete"
  />

  <!-- 本地资产删除确认弹窗 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="deleteAssetConfirm.visible" class="add-character-overlay" @click.self="cancelDeleteAsset">
        <div class="delete-asset-modal" role="dialog" aria-modal="true" aria-labelledby="delete-asset-title">
          <div class="delete-asset-header">
            <div class="delete-asset-icon">
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <path d="M12 9v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <h3 id="delete-asset-title">确认删除资产</h3>
              <p>删除后无法恢复，请确认是否继续。</p>
            </div>
            <button class="delete-asset-close" @click="cancelDeleteAsset" :disabled="deleteAssetLoading" aria-label="关闭">
              <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="delete-asset-body">
            <div class="delete-asset-name">
              {{ deleteAssetConfirm.asset?.name || '未命名资产' }}
            </div>
            <div class="delete-asset-meta">
              {{ fileTypeLabels.find(ft => ft.key === deleteAssetConfirm.asset?.type)?.label || deleteAssetConfirm.asset?.type || '资产' }}
              <span v-if="deleteAssetConfirm.asset?.size"> · {{ formatFileSize(deleteAssetConfirm.asset.size) }}</span>
            </div>
            <p v-if="deleteAssetError" class="delete-asset-error">{{ deleteAssetError }}</p>
          </div>

          <div class="delete-asset-footer">
            <button class="delete-asset-cancel" @click="cancelDeleteAsset" :disabled="deleteAssetLoading">
              取消
            </button>
            <button class="delete-asset-confirm" @click="confirmDeleteAsset" :disabled="deleteAssetLoading">
              <span v-if="deleteAssetLoading" class="btn-spinner"></span>
              {{ deleteAssetLoading ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  
  <!-- 复制成功提示 -->
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="copyToastVisible" class="copy-toast">
        {{ copyToastMessage }}
      </div>
    </Transition>
  </Teleport>

  <!-- 删除 Seedance 分组确认弹窗 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showDeleteSeedanceGroupConfirm" class="add-character-overlay" @click.self="cancelDeleteSeedanceGroup">
        <div class="delete-seedance-group-modal">
          <div class="add-character-header">
            <h3>删除分组</h3>
            <button class="add-character-close" @click="cancelDeleteSeedanceGroup" aria-label="关闭">
              <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="delete-seedance-group-body">
            <p class="delete-seedance-group-text">
              确定要删除分组 <strong>{{ deleteSeedanceGroupTarget?.Name || '未命名' }}</strong> 吗？
            </p>
            <p class="delete-seedance-group-hint">此操作将删除该分组及其中所有角色素材，不可恢复。</p>
          </div>
          <div class="delete-seedance-group-footer">
            <button class="add-character-cancel" @click="cancelDeleteSeedanceGroup">取消</button>
            <button 
              class="add-character-submit delete-seedance-group-confirm"
              @click="confirmDeleteSeedanceGroup"
              :disabled="deleteSeedanceGroupLoading"
            >
              {{ deleteSeedanceGroupLoading ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <CopyToSpaceDialog 
    v-model:visible="showCopyDialog" 
    :items="copyItems"
    @success="handleCopySuccess"
  />
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
  width: 780px;
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
  flex-wrap: wrap;
  gap: 6px;
  padding: 16px 20px;
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

/* 底部标签栏 */
.asset-tag-bar-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(20, 20, 24, 0.95);
  position: sticky;
  bottom: 0;
  z-index: 2;
}

.asset-tag-bar-bottom .tag-scroll {
  flex: 1;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.tag-chip:hover {
  border-color: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.85);
}

.tag-chip.active {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.22) 0%, rgba(139, 92, 246, 0.16) 100%);
  border-color: rgba(167, 139, 250, 0.45);
  color: #c4b5fd;
}

.tag-chip .tag-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 10px;
  line-height: 18px;
  text-align: center;
}

.tag-manage-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px dashed rgba(167, 139, 250, 0.45);
  background: transparent;
  color: #a78bfa;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.tag-manage-btn:hover {
  background: rgba(167, 139, 250, 0.12);
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
  overflow-x: hidden;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-content: start;
  max-height: 100%;
  min-height: 0;
}

.asset-list > .seedance-panel {
  grid-column: 1 / -1;
}

.asset-grid-window {
  grid-column: 1 / -1;
  width: 100%;
}

.asset-grid-track {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.asset-list::-webkit-scrollbar {
  width: 8px;
}

.asset-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
}

.asset-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  transition: background 0.2s;
}

.asset-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
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

/* 资产卡片（旧版内联卡片，v2 组件已接管） */
.asset-card:not(.asset-card-v2) {
  position: relative;
  background: transparent;
  border: none;
  border-radius: 14px;
  overflow: visible;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  isolation: isolate;
  /* 设置最小高度确保卡片不会太扁 */
  min-height: 240px;
}

.asset-card:not(.asset-card-v2)::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  pointer-events: none;
  z-index: -1;
}

.asset-card:not(.asset-card-v2):hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.asset-card:not(.asset-card-v2):hover::before {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}

.asset-card:not(.asset-card-v2):hover .asset-actions {
  opacity: 1;
}

/* 资产预览 - 更大尺寸 */
.asset-preview {
  height: clamp(160px, 22vw, 220px);
  min-height: 160px;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
  border-radius: 14px 14px 0 0;
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
  object-fit: contain;
  background: rgba(0, 0, 0, 0.18);
}

.video-preview {
  width: 100%;
  height: 100%;
  position: relative;
  background: #1a1a2e;
}

.video-preview img,
.video-preview video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.18);
}

.video-preview .video-thumbnail {
  pointer-events: none;
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

/* 音频不可用状态 */
.audio-preview.audio-unavailable {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.08) 100%);
}

.audio-unavailable-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: rgba(239, 68, 68, 0.8);
}

.unavailable-icon {
  font-size: 20px;
}

.unavailable-text {
  font-size: 11px;
  opacity: 0.8;
}

/* 音频预览错误状态 */
.audio-error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
}

.audio-error-icon {
  font-size: 48px;
  color: rgba(239, 68, 68, 0.7);
}

.audio-error-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}

/* Sora 角色预览 */
.character-preview {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
}

.character-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: rgba(0, 0, 0, 0.18);
}

.character-preview .character-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #1a1a2e;
  /* 跨浏览器兼容 */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}

.character-preview .character-thumbnail,
.character-preview .character-thumbnail-fallback {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #1a1a2e;
}

.character-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%);
}

/* 角色创建失败状态 */
.character-failed-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(220, 38, 38, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  color: #fff;
}

.character-failed-overlay .failed-icon {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.2);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.character-failed-overlay .failed-text {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.character-failed-overlay .failed-reason {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  padding: 0 8px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 角色创建中状态 */
.character-pending-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(59, 130, 246, 0.75);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  color: #fff;
}

.character-pending-overlay .pending-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 8px;
}

.character-pending-overlay .pending-text {
  font-size: 13px;
  font-weight: 500;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 资产信息 */
.asset-info {
  padding: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.asset-name-container {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.asset-name {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  cursor: default;
}

.edit-name-btn {
  opacity: 0;
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
  transition: all 0.15s ease;
}

.asset-card:not(.asset-card-v2):hover .edit-name-btn {
  opacity: 1;
}

.edit-name-btn:hover {
  color: #3b82f6;
}

.name-edit-input {
  width: 100%;
  padding: 4px 8px;
  background: #2a2a2a;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  outline: none;
}

/* Sora 角色名称和ID并排显示 */
.character-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
  width: 100%;
}

.character-name-left {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.character-display-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
}

.character-info {
  margin-bottom: 4px;
}

.character-username-tag {
  display: inline-block;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  color: rgba(139, 92, 246, 0.95);
  background: rgba(139, 92, 246, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
  flex-shrink: 0;
}

.character-username-tag.clickable {
  cursor: pointer;
  transition: all 0.2s ease;
}

.character-username-tag.clickable:hover {
  background: rgba(139, 92, 246, 0.3);
  color: rgba(167, 139, 250, 1);
  transform: scale(1.02);
}

.character-username-tag.clickable:active {
  transform: scale(0.98);
}

/* Sora 角色卡片 - 单击复制提示 */
.asset-card.type-sora-character:not(.asset-card-v2) {
  cursor: copy;
}

.asset-card.type-sora-character:not(.asset-card-v2)::after {
  content: '📋 点击复制@ID';
  position: absolute;
  top: 8px;
  left: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.85);
  padding: 4px 10px;
  border-radius: 6px;
  opacity: 0;
  transition: all 0.2s ease;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.asset-card.type-sora-character:not(.asset-card-v2):hover::after {
  opacity: 1;
}

/* 复制成功提示 */
.copy-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(34, 197, 94, 0.95);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 9999;
  box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.asset-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.asset-author {
  display: flex;
  align-items: center;
  gap: 3px;
  color: rgba(255, 255, 255, 0.5);
}

.asset-author svg {
  opacity: 0.7;
}

.asset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-right: 116px;
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
  z-index: 20; /* 确保在失败覆盖层(z-index:10)之上 */
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

.copy-btn:hover {
  background: rgba(99, 102, 241, 0.8);
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
@media (max-width: 900px) {
  .asset-panel-container {
    left: 20px;
    right: 20px;
    top: 20px;
    bottom: 20px;
  }
  
  .asset-panel {
    width: 100%;
    max-width: 680px;
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
  padding: clamp(12px, 4vw, 40px);
  overflow: hidden;
}

.asset-preview-modal {
  position: relative;
  width: min(96vw, 1400px);
  max-width: 96vw;
  max-height: calc(100vh - clamp(24px, 8vw, 80px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(12px, 2.4vh, 24px);
}

.preview-close-btn {
  position: absolute;
  top: 0;
  right: 0;
  transform: translateY(calc(-100% - 12px));
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
  transform: translateY(calc(-100% - 12px)) scale(1.1);
}

.preview-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  max-width: 100%;
  max-height: min(72vh, calc(100vh - 220px));
  overflow: hidden;
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
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(72vh, calc(100vh - 220px));
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* 确保 CachedImage 的外层容器也参与视口约束 */
.preview-content :deep(.cached-image-wrapper) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  max-height: min(72vh, calc(100vh - 220px));
  overflow: hidden;
}

/* 视频预览 */
.preview-video {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(72vh, calc(100vh - 220px));
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  background: #000;
}

/* 音频预览 */
.preview-audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 32px 48px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.08) 100%);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 24px;
}

.audio-visualizer-container {
  position: relative;
  width: 400px;
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, rgba(30, 64, 175, 0.3) 0%, rgba(15, 15, 25, 0.8) 70%);
  border-radius: 16px;
  overflow: hidden;
}

.audio-visualizer-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.preview-audio .audio-icon {
  position: relative;
  z-index: 1;
  font-size: 48px;
  color: rgba(59, 130, 246, 0.6);
  text-shadow: 0 0 30px rgba(59, 130, 246, 0.8);
  animation: pulse-icon 2s ease-in-out infinite;
}

@keyframes pulse-icon {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.audio-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  text-align: center;
}

.audio-player {
  width: 400px;
  max-width: 100%;
}

/* 资产信息 */
.preview-info {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px 32px;
  max-width: 100%;
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

@media (max-height: 720px), (max-width: 640px) {
  .asset-preview-modal {
    width: 98vw;
    max-width: 98vw;
    max-height: calc(100vh - 24px);
    gap: 10px;
  }

  .preview-close-btn {
    top: 8px;
    right: 8px;
    transform: none;
    z-index: 2;
    width: 40px;
    height: 40px;
  }

  .preview-close-btn:hover {
    transform: scale(1.06);
  }

  .preview-content,
  .preview-image,
  .preview-video,
  .preview-content :deep(.cached-image-wrapper) {
    max-height: min(76vh, calc(100vh - 170px));
  }

  .preview-info {
    gap: 8px 16px;
    padding: 10px 14px;
  }

  .info-row {
    min-width: calc(50% - 8px);
  }

  .apply-btn {
    padding: 12px 24px;
    font-size: 14px;
  }
}

@media (max-width: 420px) {
  .asset-preview-overlay {
    padding: 8px;
  }

  .preview-content,
  .preview-image,
  .preview-video,
  .preview-content :deep(.cached-image-wrapper) {
    max-height: min(74vh, calc(100vh - 190px));
  }

  .preview-info {
    width: 100%;
  }

  .info-row {
    min-width: 100%;
  }
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

/* ========== 本地资产删除确认弹窗 ========== */
.delete-asset-modal {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: rgba(28, 28, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62);
  overflow: hidden;
}

.delete-asset-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: flex-start;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.delete-asset-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: #f87171;
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.28);
}

.delete-asset-header h3 {
  margin: 0;
  color: #fff;
  font-size: 17px;
  font-weight: 650;
}

.delete-asset-header p {
  margin: 5px 0 0;
  color: rgba(255, 255, 255, 0.58);
  font-size: 13px;
  line-height: 1.45;
}

.delete-asset-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition: all 0.2s;
}

.delete-asset-close:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.delete-asset-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-asset-body {
  padding: 18px 22px 6px;
}

.delete-asset-name {
  padding: 12px 14px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  word-break: break-word;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.delete-asset-meta {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.46);
  font-size: 12px;
}

.delete-asset-error {
  margin: 12px 0 0;
  padding: 10px 12px;
  color: #fca5a5;
  font-size: 12px;
  line-height: 1.45;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.26);
  border-radius: 8px;
}

.delete-asset-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 18px 22px 20px;
}

.delete-asset-cancel,
.delete-asset-confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  height: 38px;
  padding: 0 16px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.delete-asset-cancel {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.74);
}

.delete-asset-cancel:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.11);
  color: #fff;
}

.delete-asset-confirm {
  gap: 8px;
  background: #ef4444;
  border: 1px solid #ef4444;
  color: #fff;
}

.delete-asset-confirm:hover:not(:disabled) {
  background: #dc2626;
  border-color: #dc2626;
}

.delete-asset-cancel:disabled,
.delete-asset-confirm:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* ========== Sora角色库悬停添加按钮 ========== */
.sora-character-wrapper {
  position: relative;
  display: inline-flex;
}

.add-character-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 100;
  pointer-events: none;
}

/* 通过 JS 控制显示（2秒延迟隐藏） */
.add-character-dropdown.visible {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(8px);
  pointer-events: auto;
}

.add-character-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(59, 130, 246, 0.2) 100%);
  border: 1px solid rgba(139, 92, 246, 0.5);
  border-radius: 8px;
  color: #c4b5fd;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(139, 92, 246, 0.1);
  transition: all 0.2s ease;
}

.add-character-btn:hover {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.35) 0%, rgba(59, 130, 246, 0.3) 100%);
  border-color: rgba(139, 92, 246, 0.7);
  color: #e9d5ff;
  transform: scale(1.02);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2);
}

.add-character-btn .btn-icon {
  font-size: 14px;
  font-weight: bold;
  color: #a78bfa;
}

.add-character-btn .btn-text {
  font-size: 12px;
}

/* 小箭头指示器 */
.add-character-dropdown::before {
  content: '';
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background: rgba(139, 92, 246, 0.25);
  border-left: 1px solid rgba(139, 92, 246, 0.5);
  border-top: 1px solid rgba(139, 92, 246, 0.5);
}

/* ========== Seedance角色库悬停下拉菜单 ========== */
.seedance-character-wrapper {
  position: relative;
  display: inline-flex;
}

.seedance-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 100;
  pointer-events: none;
  min-width: 180px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--canvas-bg-elevated);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05);
  padding: 6px 0;
}

.seedance-dropdown.visible {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(8px);
  pointer-events: auto;
}

.seedance-dropdown::before {
  content: '';
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background: var(--canvas-bg-elevated);
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.seedance-dropdown-header {
  padding: 4px 12px 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--canvas-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.seedance-dropdown-empty {
  padding: 12px;
  font-size: 11px;
  color: var(--canvas-text-tertiary);
  text-align: center;
}

.seedance-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.seedance-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.seedance-dropdown-item .group-name {
  font-size: 12px;
  color: var(--canvas-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.seedance-dropdown-item .group-count {
  font-size: 10px;
  color: var(--canvas-text-tertiary);
  background: var(--canvas-bg-tertiary);
  padding: 1px 6px;
  border-radius: 8px;
  flex-shrink: 0;
  margin-left: 8px;
}

.seedance-dropdown-divider {
  height: 1px;
  background: var(--canvas-border-default);
  margin: 4px 8px;
}

.seedance-dropdown-action {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.seedance-dropdown-action:hover {
  background: rgba(255, 255, 255, 0.08);
}

.seedance-dropdown-action span:first-child {
  font-weight: bold;
  font-size: 13px;
}

.seedance-group-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  color: var(--canvas-text-tertiary);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: all 0.15s;
}

.seedance-dropdown-item:hover .seedance-group-delete-btn {
  opacity: 1;
}

.seedance-group-delete-btn:hover {
  color: var(--canvas-accent-error, #ef4444);
  background: rgba(239, 68, 68, 0.1);
}

/* ========== 删除 Seedance 分组弹窗 ========== */
.delete-seedance-group-modal {
  background: var(--canvas-bg-elevated);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  width: 360px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.delete-seedance-group-body {
  padding: 16px 20px;
}

.delete-seedance-group-text {
  font-size: 13px;
  color: var(--canvas-text-primary);
  margin: 0 0 8px;
  line-height: 1.5;
}

.delete-seedance-group-hint {
  font-size: 12px;
  color: var(--canvas-accent-error, #ef4444);
  margin: 0;
  opacity: 0.85;
}

.delete-seedance-group-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.delete-seedance-group-confirm {
  background: var(--canvas-accent-error, #ef4444) !important;
  border-color: var(--canvas-accent-error, #ef4444) !important;
}

.delete-seedance-group-confirm:hover:not(:disabled) {
  background: #dc2626 !important;
}

/* ========== 添加角色弹窗 ========== */
.add-character-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.add-character-modal {
  width: 440px;
  max-width: 90vw;
  max-height: 90vh;
  background: rgba(28, 28, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
}

.add-character-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.add-character-header h3 {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.add-character-content {
  padding: 24px;
  overflow-y: auto;
}

.add-character-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.6;
  margin: 0 0 20px 0;
  padding: 12px 16px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.add-character-error {
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  color: #f87171;
  font-size: 13px;
  margin-bottom: 16px;
}

/* 文件上传区域 */
.file-upload-area {
  margin-bottom: 20px;
}

.file-upload-label {
  display: block;
  cursor: pointer;
}

.file-upload-label input[type="file"] {
  display: none;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: rgba(255, 255, 255, 0.03);
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  transition: all 0.2s ease;
}

.upload-placeholder:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(139, 92, 246, 0.4);
}

.upload-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.upload-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 6px;
}

.upload-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.upload-preview {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
}

.upload-preview img,
.upload-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-file-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  background: rgba(239, 68, 68, 0.9);
  border: none;
  border-radius: 50%;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.remove-file-btn:hover {
  background: #ef4444;
  transform: scale(1.1);
}

/* 表单字段 */
.form-field {
  margin-bottom: 20px;
}

.form-field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 8px;
}

.form-field input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.form-field input:focus {
  border-color: rgba(139, 92, 246, 0.5);
  background: rgba(255, 255, 255, 0.08);
}

.form-field input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.field-hint {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 6px;
  line-height: 1.4;
}

/* 底部按钮 */
.add-character-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.cancel-btn {
  flex: 1;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn {
  flex: 1;
  padding: 12px 20px;
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   AssetPanel 白昼模式样式适配
   ======================================== */

/* 面板背景 */
:root.canvas-theme-light .asset-panel {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 250, 252, 0.98) 100%) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 
    0 24px 80px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.03) inset !important;
}

/* 头部 */
:root.canvas-theme-light .asset-panel .panel-header {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .asset-panel .header-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .asset-panel .header-title svg {
  color: #7c3aed !important;
}

:root.canvas-theme-light .asset-panel .close-btn {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .asset-panel .close-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #1c1917 !important;
}

/* 文件类型筛选 */
:root.canvas-theme-light .asset-panel .type-filter {
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .asset-panel .type-btn {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .asset-panel .type-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .asset-panel .type-btn.active {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%) !important;
  border-color: rgba(124, 58, 237, 0.3) !important;
  color: #7c3aed !important;
}

:root.canvas-theme-light .asset-panel .type-count {
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .asset-panel .type-btn.active .type-count {
  background: rgba(124, 58, 237, 0.2) !important;
  color: #6d28d9 !important;
}

:root.canvas-theme-light .asset-panel .asset-tag-bar-bottom {
  background: rgba(255, 255, 255, 0.92) !important;
  border-top-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 0 -10px 24px rgba(255, 255, 255, 0.78) !important;
}

:root.canvas-theme-light .asset-panel .tag-chip {
  background: rgba(255, 255, 255, 0.72) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .asset-panel .tag-chip:hover {
  background: rgba(255, 255, 255, 0.92) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: rgba(0, 0, 0, 0.8) !important;
}

:root.canvas-theme-light .asset-panel .tag-chip.active {
  background: rgba(124, 58, 237, 0.12) !important;
  border-color: rgba(124, 58, 237, 0.32) !important;
  color: #7c3aed !important;
}

:root.canvas-theme-light .asset-panel .tag-chip .tag-count {
  background: rgba(0, 0, 0, 0.07) !important;
  color: rgba(0, 0, 0, 0.56) !important;
}

:root.canvas-theme-light .asset-panel .tag-chip.active .tag-count {
  background: rgba(124, 58, 237, 0.18) !important;
  color: #6d28d9 !important;
}

:root.canvas-theme-light .asset-panel .tag-manage-btn {
  background: rgba(255, 255, 255, 0.78) !important;
  border-color: rgba(124, 58, 237, 0.42) !important;
  color: #7c3aed !important;
}

:root.canvas-theme-light .asset-panel .tag-manage-btn:hover {
  background: rgba(124, 58, 237, 0.1) !important;
  border-color: rgba(124, 58, 237, 0.5) !important;
}

/* 搜索栏 */
:root.canvas-theme-light .asset-panel .search-bar {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .asset-panel .search-bar:focus-within {
  border-color: rgba(124, 58, 237, 0.3) !important;
  background: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .asset-panel .search-bar svg {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .asset-panel .search-input {
  color: #1c1917 !important;
}

:root.canvas-theme-light .asset-panel .search-input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .asset-panel .search-clear {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .asset-panel .search-clear:hover {
  color: rgba(0, 0, 0, 0.7) !important;
}

/* 资产列表 */
:root.canvas-theme-light .asset-panel .asset-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02) !important;
}

:root.canvas-theme-light .asset-panel .asset-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .asset-panel .asset-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2) !important;
}

/* 加载状态 */
:root.canvas-theme-light .asset-panel .loading-state {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .asset-panel .spinner {
  border-color: rgba(0, 0, 0, 0.1) !important;
  border-top-color: #7c3aed !important;
}

/* 空状态 */
:root.canvas-theme-light .asset-panel .empty-state p {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .asset-panel .empty-hint {
  color: rgba(0, 0, 0, 0.35) !important;
}

/* 资产卡片 */
:root.canvas-theme-light .asset-panel .asset-card:not(.asset-card-v2) {
  background: transparent !important;
  border-color: transparent !important;
}

:root.canvas-theme-light .asset-panel .asset-card:not(.asset-card-v2):hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .asset-panel .asset-card:not(.asset-card-v2)::before {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .asset-panel .asset-card:not(.asset-card-v2):hover::before {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

/* 资产预览 */
:root.canvas-theme-light .asset-panel .asset-preview {
  background: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .asset-panel .text-preview {
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .asset-panel .audio-preview {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(124, 58, 237, 0.08) 100%) !important;
}

:root.canvas-theme-light .asset-panel .audio-wave span {
  background: rgba(124, 58, 237, 0.5) !important;
}

/* 角色预览 */
:root.canvas-theme-light .asset-panel .character-preview {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%) !important;
}

:root.canvas-theme-light .asset-panel .character-placeholder {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%) !important;
}

/* 资产信息 */
:root.canvas-theme-light .asset-panel .asset-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .asset-panel .asset-meta {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .asset-panel .asset-author {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .asset-panel .asset-tag {
  background: rgba(124, 58, 237, 0.1) !important;
  color: rgba(124, 58, 237, 0.85) !important;
}

:root.canvas-theme-light .asset-panel .asset-tag.more {
  background: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 角色用户名标签 */
:root.canvas-theme-light .asset-panel .character-username-tag {
  color: rgba(99, 102, 241, 0.9) !important;
  background: rgba(99, 102, 241, 0.1) !important;
}

:root.canvas-theme-light .asset-panel .character-username-tag.clickable:hover {
  background: rgba(99, 102, 241, 0.18) !important;
  color: #6366f1 !important;
}

/* 操作按钮 */
:root.canvas-theme-light .asset-panel .action-btn {
  background: rgba(255, 255, 255, 0.9) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .asset-panel .action-btn:hover {
  background: rgba(255, 255, 255, 1) !important;
}

:root.canvas-theme-light .asset-panel .favorite-btn.active {
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .asset-panel .delete-btn:hover {
  background: rgba(239, 68, 68, 0.9) !important;
  color: #fff !important;
}

/* 底部 */
:root.canvas-theme-light .asset-panel .panel-footer {
  border-top-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .asset-panel .tip {
  color: rgba(0, 0, 0, 0.4) !important;
}

/* 标签管理弹窗 */
:root.canvas-theme-light .asset-panel .tag-manager-overlay {
  background: rgba(0, 0, 0, 0.3) !important;
}

:root.canvas-theme-light .asset-panel .tag-manager {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .asset-panel .tag-manager-header {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .asset-panel .tag-manager-header h3 {
  color: #1c1917 !important;
}

:root.canvas-theme-light .asset-panel .current-tags {
  background: rgba(0, 0, 0, 0.03) !important;
}

:root.canvas-theme-light .asset-panel .editable-tag {
  background: rgba(124, 58, 237, 0.12) !important;
  color: #7c3aed !important;
}

:root.canvas-theme-light .asset-panel .remove-tag {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .asset-panel .remove-tag:hover {
  color: #ef4444 !important;
}

:root.canvas-theme-light .asset-panel .no-tags {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .asset-panel .tag-input {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .asset-panel .tag-input:focus {
  border-color: rgba(124, 58, 237, 0.4) !important;
}

:root.canvas-theme-light .asset-panel .add-tag-btn {
  background: #7c3aed !important;
}

:root.canvas-theme-light .asset-panel .add-tag-btn:hover {
  background: #6d28d9 !important;
}

:root.canvas-theme-light .asset-panel .quick-tags-label {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .asset-panel .quick-tag-btn {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .asset-panel .quick-tag-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

/* 右键菜单 */
:root.canvas-theme-light .asset-context-menu {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 
    0 12px 40px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.03) inset !important;
}

:root.canvas-theme-light .asset-context-menu .context-menu-item {
  color: rgba(0, 0, 0, 0.8) !important;
}

:root.canvas-theme-light .asset-context-menu .context-menu-item:hover {
  background: rgba(0, 0, 0, 0.05) !important;
}

:root.canvas-theme-light .asset-context-menu .context-menu-item.danger {
  color: #ef4444 !important;
}

:root.canvas-theme-light .asset-context-menu .context-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.08) !important;
}

:root.canvas-theme-light .asset-context-menu .context-menu-divider {
  background: rgba(0, 0, 0, 0.06) !important;
}

/* 本地资产删除确认弹窗 */
:root.canvas-theme-light .delete-asset-modal {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2) !important;
}

:root.canvas-theme-light .delete-asset-header {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .delete-asset-header h3 {
  color: #1c1917 !important;
}

:root.canvas-theme-light .delete-asset-header p {
  color: rgba(0, 0, 0, 0.58) !important;
}

:root.canvas-theme-light .delete-asset-close,
:root.canvas-theme-light .delete-asset-cancel {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.62) !important;
}

:root.canvas-theme-light .delete-asset-close:hover:not(:disabled),
:root.canvas-theme-light .delete-asset-cancel:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .delete-asset-name {
  background: rgba(0, 0, 0, 0.035) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.86) !important;
}

:root.canvas-theme-light .delete-asset-meta {
  color: rgba(0, 0, 0, 0.48) !important;
}

/* 全屏预览 */
:root.canvas-theme-light .asset-preview-overlay {
  background: rgba(255, 255, 255, 0.95) !important;
}

:root.canvas-theme-light .asset-preview-modal .preview-close-btn {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .asset-preview-modal .preview-close-btn:hover {
  background: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .asset-preview-modal .preview-text {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .asset-preview-modal .preview-text h3 {
  color: #1c1917 !important;
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .asset-preview-modal .preview-text .text-content {
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .asset-preview-modal .preview-info {
  background: rgba(0, 0, 0, 0.03) !important;
}

:root.canvas-theme-light .asset-preview-modal .info-label {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .asset-preview-modal .info-value {
  color: #1c1917 !important;
}

:root.canvas-theme-light .asset-preview-modal .apply-btn {
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%) !important;
}

:root.canvas-theme-light .asset-preview-modal .apply-btn:hover {
  box-shadow: 0 8px 30px rgba(124, 58, 237, 0.35) !important;
}

/* 添加角色弹窗 */
:root.canvas-theme-light .add-character-overlay {
  background: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .add-character-modal {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .add-character-header {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .add-character-header h3 {
  color: #1c1917 !important;
}

:root.canvas-theme-light .add-character-desc {
  color: rgba(0, 0, 0, 0.6) !important;
  background: rgba(99, 102, 241, 0.06) !important;
  border-color: rgba(99, 102, 241, 0.15) !important;
}

:root.canvas-theme-light .add-character-error {
  background: rgba(239, 68, 68, 0.08) !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
}

:root.canvas-theme-light .upload-placeholder {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .upload-placeholder:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(124, 58, 237, 0.3) !important;
}

:root.canvas-theme-light .upload-text {
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .upload-hint {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .form-field label {
  color: rgba(0, 0, 0, 0.85) !important;
}

:root.canvas-theme-light .form-field input {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .form-field input:focus {
  border-color: rgba(124, 58, 237, 0.4) !important;
  background: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .form-field input::placeholder {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .field-hint {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .add-character-footer {
  border-top-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .cancel-btn {
  background: rgba(0, 0, 0, 0.05) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .cancel-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .submit-btn {
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%) !important;
}

/* Sora角色库悬停添加按钮 */
:root.canvas-theme-light .add-character-btn {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.12) 0%, rgba(59, 130, 246, 0.1) 100%) !important;
  border-color: rgba(124, 58, 237, 0.35) !important;
  color: #7c3aed !important;
}

:root.canvas-theme-light .add-character-btn:hover {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(59, 130, 246, 0.15) 100%) !important;
  border-color: rgba(124, 58, 237, 0.5) !important;
  color: #6d28d9 !important;
}

:root.canvas-theme-light .add-character-btn .btn-icon {
  color: #7c3aed !important;
}

:root.canvas-theme-light .add-character-dropdown::before {
  background: rgba(124, 58, 237, 0.12) !important;
  border-left-color: rgba(124, 58, 237, 0.35) !important;
  border-top-color: rgba(124, 58, 237, 0.35) !important;
}

/* Seedance 下拉菜单亮色主题 */
:root.canvas-theme-light .seedance-dropdown {
  background: #fff !important;
  border-color: rgba(0, 0, 0, 0.12) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .seedance-dropdown::before {
  background: #fff !important;
  border-left-color: rgba(0, 0, 0, 0.12) !important;
  border-top-color: rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .seedance-dropdown-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .seedance-dropdown-action {
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .seedance-dropdown-action:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

/* 复制成功提示 */
:root.canvas-theme-light .copy-toast {
  background: rgba(34, 197, 94, 0.95) !important;
}

/* 名称编辑输入框 */
:root.canvas-theme-light .asset-panel .name-edit-input {
  background: #fff !important;
  border-color: #3b82f6 !important;
  color: #1c1917 !important;
}
</style>
