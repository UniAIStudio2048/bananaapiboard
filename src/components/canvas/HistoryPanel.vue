<script setup>
/**
 * HistoryPanel.vue - 历史记录面板
 * 使用真正的虚拟滚动实现，只渲染可视区域的内容
 * 历史记录在服务器缓存15天，过期自动清理
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
import { getTenantHeaders, getMediaUrl } from '@/config/tenant'
import { useI18n } from '@/i18n'
import { useTeamStore } from '@/stores/team'
import { getCachedHistory, cacheHistory, invalidateCache } from '@/utils/historyCache'
import { preloadImages } from '@/utils/imageCache'
import { toSameOriginUrl, getOriginalImageUrl } from '@/utils/canvasThumbnail'
import CachedImage from '@/components/CachedImage.vue'
import SpaceSwitcher from './SpaceSwitcher.vue'
import CopyToSpaceDialog from './CopyToSpaceDialog.vue'

const { t, currentLanguage } = useI18n()
const teamStore = useTeamStore()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'apply-history'])

// ========== 状态 ==========
const loading = ref(false)
const historyList = shallowRef([]) // 使用 shallowRef 优化大数组
const selectedType = ref('all') // all | image | video | audio
const searchQuery = ref('')
// 默认显示全部空间的历史记录，用户可手动切换筛选
const spaceFilter = ref('all')

// 全屏模式
const isFullscreen = ref(false)

// 批量选择模式
const isSelectMode = ref(false)
const selectedItems = ref(new Set())

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

// 音频可视化状态
const audioRef = ref(null)
const audioVisualizerRef = ref(null)
let audioContext = null
let analyser = null
let audioSource = null
let animationId = null
let particles = []
let audioSourceConnected = false // 标记音频源是否已连接

// 预览图片缩放和平移状态
const previewScale = ref(1)
const previewTranslate = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const lastTranslate = ref({ x: 0, y: 0 })

// 视频缩略图缓存
const videoThumbnails = ref({})
const videoAspectRatios = ref({}) // 视频宽高比缓存
const videoThumbnailQueue = ref([]) // 待处理队列
const processingThumbnails = ref(0) // 正在处理的数量
const MAX_CONCURRENT_THUMBNAILS = 2 // 视频截帧很重，限制并发数

// 图片加载失败的记录
const imageLoadErrors = ref({})
// 缩略图加载失败，需要回退到原图的记录
const thumbnailFallback = ref({})

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
const CACHE_DURATION = 5 * 60 * 1000 // 缓存有效期 5 分钟

// 团队空间实时同步
const TEAM_SYNC_INTERVAL = 30000 // 团队空间同步间隔 30 秒
let teamSyncTimer = null
const lastSyncId = ref(null) // 记录最新一条记录的ID，用于检测新数据

// 通用自动刷新（面板打开时，定期检测新数据）
const AUTO_REFRESH_INTERVAL = 30000 // 30 秒检测一次（避免频繁刷新导致图片跳闪）
let autoRefreshTimer = null

// 保存中状态
const savingAsset = ref(false)

// 复制到空间状态
const showCopyDialog = ref(false)
const copyItems = ref([])
const batchCopying = ref(false)

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
// 全屏模式下的列数
const columnCount = computed(() => isFullscreen.value ? 6 : 2)

// 计算可见项目
const visibleItems = computed(() => {
  if (!isContentReady.value) return []
  
  const items = filteredHistory.value
  const total = items.length
  const cols = columnCount.value
  
  // 如果数据量小于 50，直接渲染全部（不需要虚拟滚动）
  if (total <= 50) {
    return items.map((item, index) => ({ item, index }))
  }
  
  // 计算每行高度
  const rowHeight = ITEM_HEIGHT
  
  // 计算可见的行范围
  const startRow = Math.max(0, Math.floor(scrollTop.value / rowHeight) - BUFFER_COUNT)
  const endRow = Math.ceil((scrollTop.value + containerHeight.value) / rowHeight) + BUFFER_COUNT
  
  // 转换为项目索引范围
  const startIndex = startRow * cols
  const endIndex = Math.min(total, (endRow + 1) * cols)
  
  // 返回可见项目及其索引
  const visible = []
  for (let i = startIndex; i < endIndex; i++) {
    if (items[i]) {
      visible.push({ item: items[i], index: i })
    }
  }
  
  return visible
})

// 动态生成列数据
const columnItems = computed(() => {
  const cols = columnCount.value
  const columns = Array.from({ length: cols }, () => [])
  
  visibleItems.value.forEach(item => {
    const colIndex = item.index % cols
    columns[colIndex].push(item)
  })
  
  return columns
})

// 虚拟滚动的总高度（用于滚动条）
const totalHeight = computed(() => {
  const total = filteredHistory.value.length
  const cols = columnCount.value
  const rows = Math.ceil(total / cols)
  return rows * ITEM_HEIGHT
})

// 虚拟滚动的偏移量
const offsetY = computed(() => {
  const items = filteredHistory.value
  if (items.length <= 50) return 0
  
  const cols = columnCount.value
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

// 加载历史记录（带 IndexedDB 持久化缓存 + 内存缓存）
async function loadHistory(forceRefresh = false) {
  const now = Date.now()
  
  // 获取空间筛选参数
  const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
  const { spaceType, teamId } = spaceParams
  
  // 1. 内存缓存检查（最快）
  if (!forceRefresh && dataCached.value && (now - lastLoadTime.value < CACHE_DURATION)) {
    console.log('[HistoryPanel] 使用内存缓存')
    return
  }
  
  // 2. IndexedDB 缓存检查 + stale-while-revalidate
  // 先展示缓存数据（快速响应），然后后台刷新确保数据最新
  if (!forceRefresh) {
    try {
      const cachedData = await getCachedHistory('all', spaceType, teamId)
      if (cachedData) {
        historyList.value = cachedData
        dataCached.value = true
        lastLoadTime.value = now
        console.log('[HistoryPanel] 🎯 使用 IndexedDB 缓存:', cachedData.length, '条，后台刷新中...')
        // 后台静默刷新，不显示 loading
        _refreshHistoryInBackground(spaceParams, spaceType, teamId)
        return
      }
    } catch (e) {
      console.warn('[HistoryPanel] IndexedDB 读取失败:', e)
    }
  }
  
  // 3. 从服务器加载（无缓存或强制刷新）
  loading.value = true
  try {
    const freshData = await _fetchFromServer(spaceParams, spaceType, teamId)
    // 精确比较，避免数据相同时替换数组引用导致图片跳闪
    if (!_isHistoryEqual(freshData, historyList.value)) {
      historyList.value = freshData
    }
    dataCached.value = true
    lastLoadTime.value = Date.now()
  } catch (error) {
    console.error('[HistoryPanel] 加载历史记录失败:', error)
  } finally {
    loading.value = false
  }
}

// 从服务器获取历史数据并缓存
async function _fetchFromServer(spaceParams, spaceType, teamId) {
  const result = await getHistory(spaceParams)
  const freshData = result.history || []
  console.log('[HistoryPanel] 从服务器加载:', freshData.length, '条')
  
  cacheHistory('all', spaceType, teamId, freshData).catch(() => {})
  
  const preloadUrls = freshData
    .filter(item => item.type === 'image' && item.url)
    .slice(0, 8)
    .map(item => item.url)
  if (preloadUrls.length > 0) {
    preloadImages(preloadUrls, 3).catch(() => {})
  }
  return freshData
}

// 比较两个历史列表是否实质相同（避免不必要的数组替换导致图片跳闪）
function _isHistoryEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
  }
  return true
}

// 后台静默刷新：不阻塞 UI，刷新完毕后对比更新
async function _refreshHistoryInBackground(spaceParams, spaceType, teamId) {
  try {
    const freshData = await _fetchFromServer(spaceParams, spaceType, teamId)
    if (!_isHistoryEqual(freshData, historyList.value)) {
      historyList.value = freshData
      dataCached.value = true
      lastLoadTime.value = Date.now()
      console.log('[HistoryPanel] 后台刷新完成，数据已更新:', freshData.length, '条')
    } else {
      // 数据相同，只更新时间戳，不替换数组引用
      lastLoadTime.value = Date.now()
    }
  } catch (e) {
    // 后台刷新失败不影响已展示的缓存数据
  }
}

/**
 * 团队空间实时同步 - 检查是否有新数据
 * 获取全量数据后精确比较，避免 limit:1 过滤不一致导致误判
 */
async function checkTeamSync() {
  // 仅在团队空间且面板可见时同步
  if (!teamStore.isInTeamSpace.value || !props.visible) return

  // 仅在筛选团队空间时同步
  if (!spaceFilter.value.startsWith('team-')) return

  try {
    const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
    const { spaceType, teamId } = spaceParams
    const result = await getHistory(spaceParams)
    const freshData = result.history || []

    if (!_isHistoryEqual(freshData, historyList.value)) {
      console.log('[HistoryPanel] 团队空间检测到新数据，更新列表')
      historyList.value = freshData
      dataCached.value = true
      lastLoadTime.value = Date.now()
      cacheHistory('all', spaceType, teamId, freshData).catch(() => {})
    }
  } catch (error) {
    console.error('[HistoryPanel] 团队同步检查失败:', error)
  }
}

/**
 * 启动团队空间实时同步
 */
function startTeamSync() {
  stopTeamSync()
  if (teamStore.isInTeamSpace.value && props.visible) {
    // 记录当前最新ID
    if (historyList.value.length > 0) {
      lastSyncId.value = historyList.value[0].id
    }
    teamSyncTimer = setInterval(checkTeamSync, TEAM_SYNC_INTERVAL)
    console.log('[HistoryPanel] 启动团队空间实时同步')
  }
}

/**
 * 停止团队空间实时同步
 */
function stopTeamSync() {
  if (teamSyncTimer) {
    clearInterval(teamSyncTimer)
    teamSyncTimer = null
    console.log('[HistoryPanel] 停止团队空间实时同步')
  }
}

/**
 * 通用自动刷新 - 面板打开时定期检测新数据
 * 获取全量数据后与当前列表做 ID 级别精确比较，
 * 只在真正有变化时才替换数组引用（避免图片跳闪）
 */
function startAutoRefresh() {
  stopAutoRefresh()
  if (!props.visible) return

  autoRefreshTimer = setInterval(async () => {
    if (!props.visible) return
    try {
      const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
      const { spaceType, teamId } = spaceParams
      const result = await getHistory(spaceParams)
      const freshData = result.history || []

      if (!_isHistoryEqual(freshData, historyList.value)) {
        console.log('[HistoryPanel] 检测到新数据，更新列表')
        historyList.value = freshData
        dataCached.value = true
        lastLoadTime.value = Date.now()
        // 更新缓存
        cacheHistory('all', spaceType, teamId, freshData).catch(() => {})
      }
    } catch (e) {
      // 静默失败
    }
  }, AUTO_REFRESH_INTERVAL)
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
}

// 空间筛选变化时重新加载
function handleSpaceChange(newSpace) {
  spaceFilter.value = newSpace
  dataCached.value = false // 清除缓存
  loadHistory(true)
  
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

// 全局空间变化时仅刷新数据（不覆盖用户选择的空间筛选器）
watch([() => teamStore.globalSpaceType.value, () => teamStore.globalTeamId.value], () => {
  if (props.visible) {
    dataCached.value = false
    loadHistory(true)
  }
})

function getQiniuThumbnailUrl(url, width = 400) {
  if (!url || typeof url !== 'string') return url
  
  if (url.includes('imageView2') || url.includes('imageMogr2')) {
    return url
  }
  
  // COS 代理 URL → imageMogr2 缩略图（跳过视频）
  if (url.includes('/api/cos-proxy/')) {
    const lower = url.split('?')[0].toLowerCase()
    const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
                    lower.includes('/videos/') || lower.includes('/video-files/') || lower.includes('/character-videos/')
    if (!isVideo) {
      const separator = url.includes('?') ? '|' : '?'
      return `${url}${separator}imageMogr2/thumbnail/${width}x/format/webp`
    }
  }
  
  if (url.includes('files.nananobanana.cn') ||  
      url.includes('qiniucdn.com') || 
      url.includes('clouddn.com') || 
      url.includes('qnssl.com') ||
      url.includes('qbox.me')) {
    const separator = url.includes('?') ? '|' : '?'
    return `${url}${separator}imageView2/2/w/${width}/format/webp`
  }
  
  return url
}

// 获取预览内容（仅用于列表缩略图显示，下载和全屏预览使用原图）
function getPreviewContent(item) {
  switch (item.type) {
    case 'image':
      // 如果缩略图加载失败过，直接使用原图（不使用thumbnail_url）
      if (thumbnailFallback.value[item.id]) {
        return item.url
      }
      // 优先使用thumbnail_url，如果没有则使用url生成缩略图
      const imageUrl = item.thumbnail_url || item.url
      if (!imageUrl) return null
      // 列表使用小缩略图(400px宽)，加快加载速度
      return getQiniuThumbnailUrl(imageUrl, 400)
    case 'video':
      return item.thumbnail_url || item.url
    case 'audio':
      // 音频使用封面图片作为缩略图
      return item.thumbnail_url || null
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
    
    // 🔥 使 IndexedDB 缓存失效
    invalidateCache(item.type).catch(() => {})
    
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

// 获取正确的文件扩展名
function getFileExtension(type, url) {
  // 优先从URL中提取扩展名
  if (url) {
    const urlPath = url.split('?')[0] // 去掉查询参数
    const match = urlPath.match(/\.([a-zA-Z0-9]+)$/)
    if (match) {
      return '.' + match[1].toLowerCase()
    }
  }
  // 根据类型返回默认扩展名
  switch (type) {
    case 'video': return '.mp4'
    case 'image': return '.png'
    case 'audio': return '.mp3'
    default: return ''
  }
}

async function handleDownload(item) {
  if (!item.url) return
  closeContextMenu()
  
  // 获取原始图片 URL（去除缩略图参数），确保下载原图
  const downloadUrl = getOriginalImageUrl(item.url)
  
  // 确保文件名有正确的扩展名
  const ext = getFileExtension(item.type, downloadUrl)
  let filename = item.name || `${item.type}_${item.id}`
  if (!filename.match(/\.[a-zA-Z0-9]+$/)) {
    filename += ext
  }
  
  console.log('[HistoryPanel] 开始下载:', { url: downloadUrl.substring(0, 60), filename })
  
  try {
    const { smartDownload } = await import('@/api/client')
    await smartDownload(downloadUrl, filename)
    console.log('[HistoryPanel] 下载成功:', filename)
  } catch (error) {
    console.error('[HistoryPanel] 下载失败:', error)
  }
}

// ========== 全屏模式 ==========
function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

// ========== 批量选择模式 ==========
function toggleSelectMode() {
  isSelectMode.value = !isSelectMode.value
  if (!isSelectMode.value) {
    // 退出选择模式时清空选中
    selectedItems.value.clear()
  }
}

// 切换选中状态
function toggleSelectItem(item, event) {
  if (event) {
    event.stopPropagation()
  }
  const newSet = new Set(selectedItems.value)
  if (newSet.has(item.id)) {
    newSet.delete(item.id)
  } else {
    newSet.add(item.id)
  }
  selectedItems.value = newSet
}

// 全选/取消全选
function toggleSelectAll() {
  const filtered = filteredHistory.value
  if (selectedItems.value.size === filtered.length) {
    // 已全选，取消全选
    selectedItems.value = new Set()
  } else {
    // 全选
    selectedItems.value = new Set(filtered.map(item => item.id))
  }
}

// 检查是否选中
function isItemSelected(item) {
  return selectedItems.value.has(item.id)
}

// 批量下载进度状态
const batchDownloading = ref(false)
const batchDownloadProgress = ref({ current: 0, total: 0 })

// 批量下载
async function handleBatchDownload() {
  const selectedList = filteredHistory.value.filter(item => selectedItems.value.has(item.id))
  if (selectedList.length === 0) return
  
  batchDownloading.value = true
  batchDownloadProgress.value = { current: 0, total: selectedList.length }
  
  console.log('[HistoryPanel] 开始批量下载:', selectedList.length, '个文件')
  
  // 逐个下载（避免并发太高）
  for (let i = 0; i < selectedList.length; i++) {
    const item = selectedList[i]
    batchDownloadProgress.value.current = i + 1
    
    try {
      await handleDownload(item)
      // 每个文件下载之间添加延迟，避免浏览器阻止
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.error('[HistoryPanel] 批量下载单个文件失败:', item.id, error)
    }
  }
  
  batchDownloading.value = false
  console.log('[HistoryPanel] 批量下载完成')
  
  // 下载完成后退出选择模式
  isSelectMode.value = false
  selectedItems.value = new Set()
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
  // 释放视频资源，避免后台继续缓冲
  if (previewVideoRef.value) {
    previewVideoRef.value.pause()
    previewVideoRef.value.removeAttribute('src')
    previewVideoRef.value.load()
  }
  showPreview.value = false
  previewItem.value = null
  previewScale.value = 1
  previewTranslate.value = { x: 0, y: 0 }
  // 完全销毁音频可视化（因为下次打开的是新的 audio 元素）
  destroyAudioVisualizer()
}

// ========== 音频可视化 ==========

// 粒子类
class Particle {
  constructor(x, y, canvas) {
    this.x = x
    this.y = y
    this.canvas = canvas
    this.baseY = y
    this.vx = (Math.random() - 0.5) * 2
    this.vy = (Math.random() - 0.5) * 2
    this.radius = Math.random() * 3 + 1
    this.baseRadius = this.radius
    this.life = 1
    this.decay = Math.random() * 0.01 + 0.005
    // 蓝色系渐变
    this.hue = 200 + Math.random() * 40 // 200-240 蓝色范围
    this.saturation = 80 + Math.random() * 20
    this.lightness = 50 + Math.random() * 20
  }

  update(intensity) {
    // 根据音频强度影响运动
    const boost = intensity * 3
    this.x += this.vx * (1 + boost)
    this.y += this.vy * (1 + boost) + Math.sin(Date.now() * 0.003 + this.x * 0.01) * intensity * 2
    
    // 脉冲效果
    this.radius = this.baseRadius * (1 + intensity * 2)
    
    // 边界反弹
    if (this.x < 0 || this.x > this.canvas.width) this.vx *= -1
    if (this.y < 0 || this.y > this.canvas.height) this.vy *= -1
    
    this.life -= this.decay * (1 - intensity * 0.5)
    return this.life > 0
  }

  draw(ctx, intensity) {
    const alpha = this.life * (0.6 + intensity * 0.4)
    const glow = intensity * 15
    
    // 发光效果
    ctx.shadowBlur = glow + 10
    ctx.shadowColor = `hsla(${this.hue}, ${this.saturation}%, ${this.lightness}%, ${alpha})`
    
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = `hsla(${this.hue}, ${this.saturation}%, ${this.lightness}%, ${alpha})`
    ctx.fill()
    
    ctx.shadowBlur = 0
  }
}

// 初始化音频可视化
function initAudioVisualizer() {
  if (!audioRef.value || !audioVisualizerRef.value) return
  
  const canvas = audioVisualizerRef.value
  const ctx = canvas.getContext('2d')
  
  // 设置 canvas 大小
  const rect = canvas.parentElement.getBoundingClientRect()
  canvas.width = rect.width || 400
  canvas.height = rect.height || 300
  
  try {
    // 如果已有 audioContext 且状态正常，复用它
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      audioSourceConnected = false
    }
    
    // 恢复暂停的音频上下文
    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
    
    // 创建分析器
    if (!analyser) {
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
    }
    
    // 连接音频源（每个 audio 元素只能连接一次）
    if (!audioSourceConnected && audioRef.value) {
      try {
        audioSource = audioContext.createMediaElementSource(audioRef.value)
        audioSource.connect(analyser)
        analyser.connect(audioContext.destination)
        audioSourceConnected = true
      } catch (e) {
        // 如果音频源已经连接过，忽略错误
        console.warn('[AudioVisualizer] 音频源连接:', e.message)
        audioSourceConnected = true
      }
    }
    
    // 初始化粒子
    particles = []
    for (let i = 0; i < 80; i++) {
      particles.push(new Particle(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        canvas
      ))
    }
    
    // 开始动画
    animateVisualizer(ctx, canvas)
  } catch (e) {
    console.error('[AudioVisualizer] 初始化失败:', e)
  }
}

// 动画循环
function animateVisualizer(ctx, canvas) {
  if (!analyser) return
  
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  
  function draw() {
    animationId = requestAnimationFrame(draw)
    
    analyser.getByteFrequencyData(dataArray)
    
    // 计算平均音频强度
    let sum = 0
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i]
    }
    const average = sum / bufferLength / 255
    
    // 低频、中频、高频分析
    const bass = dataArray.slice(0, bufferLength / 4).reduce((a, b) => a + b, 0) / (bufferLength / 4) / 255
    const mid = dataArray.slice(bufferLength / 4, bufferLength / 2).reduce((a, b) => a + b, 0) / (bufferLength / 4) / 255
    const treble = dataArray.slice(bufferLength / 2).reduce((a, b) => a + b, 0) / (bufferLength / 2) / 255
    
    // 清除画布（带拖尾效果）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // 在低音强时添加新粒子
    if (bass > 0.5 && particles.length < 150) {
      for (let i = 0; i < 3; i++) {
        particles.push(new Particle(
          canvas.width / 2 + (Math.random() - 0.5) * 100,
          canvas.height / 2 + (Math.random() - 0.5) * 100,
          canvas
        ))
      }
    }
    
    // 绘制中心波形圆环
    drawWaveCircle(ctx, canvas, dataArray, bufferLength, average)
    
    // 更新和绘制粒子
    particles = particles.filter(p => {
      const alive = p.update(average)
      if (alive) p.draw(ctx, average)
      return alive
    })
    
    // 保持最小粒子数
    while (particles.length < 50) {
      particles.push(new Particle(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        canvas
      ))
    }
    
    // 绘制频谱条
    drawSpectrumBars(ctx, canvas, dataArray, bufferLength)
  }
  
  draw()
}

// 绘制中心波形圆环
function drawWaveCircle(ctx, canvas, dataArray, bufferLength, intensity) {
  const centerX = canvas.width / 2
  const centerY = canvas.height / 2
  const baseRadius = Math.min(canvas.width, canvas.height) * 0.15
  
  ctx.beginPath()
  
  for (let i = 0; i < bufferLength; i++) {
    const angle = (i / bufferLength) * Math.PI * 2
    const amplitude = dataArray[i] / 255
    const radius = baseRadius + amplitude * 40
    
    const x = centerX + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius
    
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  
  ctx.closePath()
  
  // 渐变填充
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius + 50)
  gradient.addColorStop(0, `rgba(59, 130, 246, ${0.1 + intensity * 0.3})`)
  gradient.addColorStop(0.5, `rgba(99, 102, 241, ${0.05 + intensity * 0.2})`)
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0)')
  
  ctx.fillStyle = gradient
  ctx.fill()
  
  ctx.strokeStyle = `rgba(59, 130, 246, ${0.5 + intensity * 0.5})`
  ctx.lineWidth = 2
  ctx.shadowBlur = 20
  ctx.shadowColor = 'rgba(59, 130, 246, 0.8)'
  ctx.stroke()
  ctx.shadowBlur = 0
}

// 绘制底部频谱条
function drawSpectrumBars(ctx, canvas, dataArray, bufferLength) {
  const barCount = 32
  const barWidth = canvas.width / barCount - 2
  const barSpacing = 2
  
  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor(i * bufferLength / barCount)
    const value = dataArray[dataIndex] / 255
    const barHeight = value * canvas.height * 0.3
    
    const x = i * (barWidth + barSpacing)
    const y = canvas.height - barHeight
    
    // 渐变颜色
    const gradient = ctx.createLinearGradient(x, y + barHeight, x, y)
    gradient.addColorStop(0, `rgba(59, 130, 246, ${0.3 + value * 0.4})`)
    gradient.addColorStop(0.5, `rgba(99, 102, 241, ${0.4 + value * 0.4})`)
    gradient.addColorStop(1, `rgba(139, 92, 246, ${0.5 + value * 0.5})`)
    
    ctx.fillStyle = gradient
    
    // 圆角矩形
    const radius = Math.min(barWidth / 2, 4)
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + barWidth - radius, y)
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius)
    ctx.lineTo(x + barWidth, y + barHeight)
    ctx.lineTo(x, y + barHeight)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
    ctx.fill()
  }
}

// 清理音频可视化（关闭预览时调用）
function cleanupAudioVisualizer() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  // 不关闭 audioContext，只停止动画
  // audioContext 和 audioSource 保持，因为同一个 audio 元素只能连接一次
  particles = []
}

// 完全销毁音频可视化（组件卸载时调用）
function destroyAudioVisualizer() {
  cleanupAudioVisualizer()
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {})
  }
  audioContext = null
  analyser = null
  audioSource = null
  audioSourceConnected = false
}

// 处理音频播放
function handleAudioPlay() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume()
  }
  if (!animationId) {
    initAudioVisualizer()
  }
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

function handleCopyToSpace(item) {
  closeContextMenu()
  const type = item.type === 'image' ? 'image' : item.type === 'video' ? 'video' : 'music'
  copyItems.value = [{ type, id: item.id, name: item.prompt?.substring(0, 30) || item.id }]
  showCopyDialog.value = true
}

function handleBatchCopyToSpace() {
  const items = []
  selectedItems.value.forEach(itemId => {
    const item = filteredHistory.value.find(h => h.id === itemId)
    if (item) {
      const type = item.type === 'image' ? 'image' : item.type === 'video' ? 'video' : 'music'
      items.push({ type, id: item.id, name: item.prompt?.substring(0, 30) || item.id })
    }
  })
  copyItems.value = items
  showCopyDialog.value = true
}

function handleCopySuccess() {
  showCopyDialog.value = false
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
    // 获取当前空间参数
    const spaceParams = teamStore.getSpaceParams('current')
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
      },
      // 空间参数
      spaceType: spaceParams.spaceType,
      teamId: spaceParams.teamId
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

// 视频缩略图提取失败的记录（避免重复尝试）
const videoThumbnailFailed = ref({})

// 提取视频首帧作为缩略图（带节流，限制并发）
function extractVideoThumbnail(item, useProxy = false) {
  if (item.type !== 'video' || !item.url) return
  if (videoThumbnails.value[item.id]) return
  // 如果已经失败过且不是代理模式，跳过
  if (videoThumbnailFailed.value[item.id] && !useProxy) return
  
  // 如果正在处理的数量已达上限，加入队列
  if (processingThumbnails.value >= MAX_CONCURRENT_THUMBNAILS) {
    if (!videoThumbnailQueue.value.includes(item.id)) {
      videoThumbnailQueue.value.push(item.id)
    }
    return
  }
  
  processingThumbnails.value++
  
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  
  // 使用同源相对路径加载视频，避免跨域导致 canvas drawImage 被阻止
  // 注意：不要设置 crossOrigin = 'anonymous'，会污染浏览器缓存导致同 URL 的其他 <video> 也加载失败
  const safeUrl = toSameOriginUrl(item.url)

  const cleanup = () => {
    video.remove()
    processingThumbnails.value--
    processNextThumbnail()
  }
  
  video.onloadeddata = () => {
    video.currentTime = 0.1
  }
  
  video.onseeked = () => {
    try {
      const canvas = document.createElement('canvas')
      const videoWidth = video.videoWidth || 320
      const videoHeight = video.videoHeight || 180

      videoAspectRatios.value[item.id] = videoWidth / videoHeight

      const maxDim = 480
      let scale = 1
      if (videoWidth > maxDim || videoHeight > maxDim) {
        scale = Math.min(maxDim / videoWidth, maxDim / videoHeight)
      }
      
      canvas.width = videoWidth * scale
      canvas.height = videoHeight * scale
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      videoThumbnails.value[item.id] = canvas.toDataURL('image/jpeg', 0.7)
    } catch (e) {
      console.warn('[HistoryPanel] 无法提取视频缩略图:', e)
    }
    cleanup()
  }
  
  video.onerror = () => {
    console.warn('[HistoryPanel] 视频缩略图提取失败:', safeUrl?.substring(0, 50))
    videoThumbnailFailed.value[item.id] = true
    cleanup()
  }
  
  setTimeout(() => {
    if (processingThumbnails.value > 0 && !videoThumbnails.value[item.id]) {
      videoThumbnailFailed.value[item.id] = true
      cleanup()
    }
  }, 5000)
  
  video.src = safeUrl
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
  if (item.thumbnail_url) return getMediaUrl(item.thumbnail_url)
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

// 判断视频是否是竖屏（宽高比 < 1）
function isPortraitVideo(item) {
  if (item.type !== 'video') return false
  // 先检查是否有缓存的宽高比
  if (videoAspectRatios.value[item.id]) {
    return videoAspectRatios.value[item.id] < 1
  }
  // 如果后端返回了 aspect_ratio 字段（如 "9:16"），解析它
  if (item.aspect_ratio && typeof item.aspect_ratio === 'string') {
    const parts = item.aspect_ratio.split(':')
    if (parts.length === 2) {
      const width = parseFloat(parts[0])
      const height = parseFloat(parts[1])
      if (!isNaN(width) && !isNaN(height)) {
        return width / height < 1
      }
    }
  }
  return false
}

// 处理图片加载错误（支持回退到原图）
function handleImageError(item) {
  // 如果还没有尝试过回退到原图，先尝试回退
  if (!thumbnailFallback.value[item.id]) {
    console.log('[HistoryPanel] 缩略图加载失败，回退到原图:', item.id, item.url)
    // 使用对象展开确保响应式更新
    thumbnailFallback.value = {
      ...thumbnailFallback.value,
      [item.id]: true
    }
    return
  }
  // 原图也加载失败了，显示占位符
  console.log('[HistoryPanel] 原图也加载失败:', item.id, item.url)
  imageLoadErrors.value = {
    ...imageLoadErrors.value,
    [item.id]: true
  }
}

// 检查图片是否加载失败（原图也失败才显示占位符）
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
    
    // 每次打开面板时重置为「全部」，确保能看到所有空间的记录
    spaceFilter.value = 'all'
    dataCached.value = false
    
    // 加载数据
    await loadHistory()
    
    // 启动自动刷新（检测新生成的内容）
    startAutoRefresh()
    
    // 启动团队空间实时同步
    startTeamSync()
    
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
    
    // 停止自动刷新
    stopAutoRefresh()
    
    // 停止团队空间实时同步
    stopTeamSync()
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

function handleCanvasHistoryInvalidate() {
  dataCached.value = false
  invalidateCache('all').catch(() => {})
  loadHistory(true)
}

onMounted(() => {
  window.addEventListener('canvas-history-invalidate', handleCanvasHistoryInvalidate)
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
  window.removeEventListener('canvas-history-invalidate', handleCanvasHistoryInvalidate)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mousemove', handleGlobalMouseMove)
  document.removeEventListener('mouseup', handleGlobalMouseUp)
  document.removeEventListener('click', handleGlobalClick)
  
  // 停止自动刷新和团队空间实时同步
  stopAutoRefresh()
  stopTeamSync()
  
  // 清理 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  // 完全销毁音频可视化
  destroyAudioVisualizer()
  
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
      :class="{ fullscreen: isFullscreen }"
    >
      <div class="history-panel" :class="{ fullscreen: isFullscreen }">
        <!-- 头部 -->
        <div class="panel-header">
          <div class="header-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>{{ t('canvas.historyPanel.title') }}</span>
          </div>
          <div class="header-actions">
            <!-- 批量选择按钮 -->
            <button 
              class="header-btn" 
              :class="{ active: isSelectMode }"
              @click="toggleSelectMode"
              :title="isSelectMode ? '退出选择' : '批量选择'"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </button>
            <!-- 全屏展开按钮 -->
            <button 
              class="header-btn" 
              :class="{ active: isFullscreen }"
              @click="toggleFullscreen"
              :title="isFullscreen ? '退出全屏' : '全屏显示'"
            >
              <svg v-if="!isFullscreen" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
              </svg>
            </button>
            <!-- 关闭按钮 -->
            <button class="close-btn" @click="$emit('close')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- 空间切换器 -->
        <SpaceSwitcher 
          v-model="spaceFilter" 
          @change="handleSpaceChange"
          :compact="!isFullscreen"
        />
        
        <!-- 批量操作栏（选择模式下显示） -->
        <div v-if="isSelectMode" class="batch-action-bar">
          <div class="select-info">
            <button class="select-all-btn" @click="toggleSelectAll">
              {{ selectedItems.size === filteredHistory.length ? '取消全选' : '全选' }}
            </button>
            <span class="select-count">已选 {{ selectedItems.size }} 项</span>
          </div>
          <button 
            class="batch-download-btn" 
            :disabled="selectedItems.size === 0 || batchDownloading"
            @click="handleBatchDownload"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span v-if="batchDownloading">
              下载中 {{ batchDownloadProgress.current }}/{{ batchDownloadProgress.total }}
            </span>
            <span v-else>批量下载</span>
          </button>
          <button 
            class="batch-copy-btn" 
            :disabled="selectedItems.size === 0 || batchCopying"
            @click="handleBatchCopyToSpace"
          >
            {{ batchCopying ? '复制中...' : '复制到空间' }}
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
            <p class="empty-hint retention">仅保留最近15天的历史记录</p>
          </div>

          <!-- 虚拟滚动列表 -->
          <div 
            v-else 
            class="virtual-scroll-container"
            :style="{ height: totalHeight + 'px' }"
          >
            <div 
              class="waterfall-grid"
              :class="{ 'fullscreen-grid': isFullscreen }"
              :style="{ transform: `translateY(${offsetY}px)` }"
            >
              <div 
                v-for="(colItems, colIndex) in columnItems"
                :key="colIndex"
                class="waterfall-column"
              >
                <div
                  v-for="{ item, index } in colItems"
                  :key="item.id"
                  class="history-card"
                  :class="[
                    `type-${item.type}`,
                    { 'portrait-video': item.type === 'video' && isPortraitVideo(item) },
                    { 'selected': isSelectMode && isItemSelected(item) }
                  ]"
                  draggable="true"
                  @click="isSelectMode ? toggleSelectItem(item, $event) : handleHistoryClick(item)"
                  @contextmenu="handleContextMenu($event, item)"
                  @dragstart="handleDragStart($event, item)"
                  @dragend="handleDragEnd"
                >
                  <!-- 批量选择复选框 -->
                  <div 
                    v-if="isSelectMode" 
                    class="select-checkbox"
                    :class="{ checked: isItemSelected(item) }"
                    @click.stop="toggleSelectItem(item, $event)"
                  >
                    <svg v-if="isItemSelected(item)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <!-- 图片预览 -->
                  <template v-if="item.type === 'image'">
                    <CachedImage 
                      v-if="getPreviewContent(item) && !hasImageError(item)" 
                      :key="`img-${item.id}-${thumbnailFallback[item.id] ? 'fallback' : 'thumb'}`"
                      :src="getPreviewContent(item)" 
                      :thumbnail-src="item.thumbnail_url"
                      :alt="item.name"
                      progressive
                      img-class="card-image"
                      loading="lazy"
                      @error="handleImageError(item)"
                    />
                    <div v-else class="card-placeholder image">
                      <span class="placeholder-icon">◫</span>
                      <span class="placeholder-text" v-if="item.prompt">{{ item.prompt.length > 20 ? item.prompt.slice(0, 20) + '...' : item.prompt }}</span>
                    </div>
                  </template>
                  
                  <!-- 视频预览 -->
                  <template v-else-if="item.type === 'video'">
                    <!-- 优先使用缩略图 -->
                    <CachedImage 
                      v-if="getVideoThumbnail(item)" 
                      :src="getVideoThumbnail(item)" 
                      :alt="item.name"
                      img-class="card-image"
                      loading="lazy"
                    />
                    <!-- 备用：直接使用 video 元素显示首帧 -->
                    <video 
                      v-else-if="item.url"
                      :src="toSameOriginUrl(item.url)"
                      class="card-image card-video-preview"
                      muted
                      preload="metadata"
                      @loadeddata="$event.target.currentTime = 0.1"
                    />
                    <div v-else class="card-placeholder video">
                      <span class="placeholder-icon">▶</span>
                    </div>
                  </template>
                  
                  <!-- 音频预览 -->
                  <template v-else-if="item.type === 'audio'">
                    <CachedImage 
                      v-if="getPreviewContent(item)" 
                      :src="getPreviewContent(item)" 
                      :alt="item.name || item.title"
                      img-class="card-image"
                      loading="lazy"
                    />
                    <div v-else class="card-placeholder audio">
                      <span class="placeholder-icon">♪</span>
                    </div>
                    <!-- 音频标题覆盖层 -->
                    <div v-if="item.title || item.name" class="audio-title-overlay">
                      <span class="audio-title">{{ item.title || item.name }}</span>
                    </div>
                  </template>
                  
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
                      <!-- 团队空间用户署名 -->
                      <div v-if="teamStore.isInTeamSpace.value && item.last_updated_by_username" class="overlay-author">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                        {{ item.last_updated_by_username }}
                      </div>
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
        </div>

        <!-- 底部统计 -->
        <div class="panel-footer">
          <span class="stats">{{ historyStats.all }} {{ t('canvas.historyPanel.items') }}</span>
          <span class="retention-tip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            仅保留最近15天
          </span>
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
        <div class="context-menu-item" @click="handleCopyToSpace(contextMenuItem)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>复制到空间</span>
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
              :src="getMediaUrl(previewItem.url)" 
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
              :src="toSameOriginUrl(previewItem.url)"
              controls
              autoplay
              preload="metadata"
              class="preview-video"
            ></video>
            
            <!-- 音频预览 -->
            <div v-else-if="previewItem.type === 'audio'" class="preview-audio">
              <div class="audio-visualizer-container">
                <canvas ref="audioVisualizerRef" class="audio-visualizer-canvas"></canvas>
                <div class="audio-center-icon">♪</div>
              </div>
              <div class="audio-info" v-if="previewItem.title || previewItem.name">
                <span class="audio-title-text">{{ previewItem.title || previewItem.name }}</span>
              </div>
              <audio 
                ref="audioRef"
                :src="getMediaUrl(previewItem.url)"
                crossorigin="anonymous"
                controls
                autoplay
                class="audio-player"
                @play="handleAudioPlay"
                @loadeddata="initAudioVisualizer"
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

  <CopyToSpaceDialog 
    v-model:visible="showCopyDialog" 
    :items="copyItems"
    @success="handleCopySuccess"
  />
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

/* 全屏模式 */
.history-panel-wrapper.fullscreen {
  top: 20px;
  left: 20px;
  right: 20px;
  bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  pointer-events: auto;
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

/* 全屏模式下的面板 */
.history-panel.fullscreen {
  width: 90vw;
  max-width: 1400px;
  height: calc(100vh - 40px);
  max-height: none;
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

/* 头部按钮组 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-btn {
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

.header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.header-btn.active {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

/* 批量操作栏 */
.batch-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: rgba(59, 130, 246, 0.1);
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}

.select-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.select-all-btn {
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.select-all-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.select-count {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.batch-download-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.batch-download-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.batch-download-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.batch-copy-btn {
  padding: 6px 14px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.batch-copy-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.batch-copy-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  display: flex;
  gap: 8px; /* 列之间间隙 */
  padding: 0 12px; /* 左右内边距 */
  will-change: transform;
}

.waterfall-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px; /* 卡片之间间隙 */
  min-width: 0;
}

/* 全屏模式下的瀑布流 - 6列 */
.fullscreen-grid {
  gap: 12px;
  padding: 0 20px;
}

.fullscreen-grid .waterfall-column {
  flex: 1;
  min-width: 0;
}

/* 骨架屏样式 */
.skeleton-loading {
  padding: 0 12px;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.skeleton-card {
  aspect-ratio: 1;
  background: linear-gradient(90deg, #2a2a2e 25%, #3a3a3e 50%, #2a2a2e 75%);
  background-size: 200% 100%;
  border-radius: 8px;
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

.empty-hint.retention {
  color: rgba(255, 180, 100, 0.5) !important;
  margin-top: 4px;
}

/* 历史记录卡片 */
.history-card {
  position: relative;
  background: #1a1a1c;
  border-radius: 8px; /* 圆角 */
  overflow: hidden;
  cursor: grab;
  transition: all 0.15s;
  /* margin-bottom由父容器gap控制 */
}

.history-card:active {
  cursor: grabbing;
}

.history-card:hover {
  transform: scale(1.02);
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.history-card:hover .hover-overlay {
  opacity: 1;
}

/* 选中状态 */
.history-card.selected {
  box-shadow: 0 0 0 3px #3b82f6, 0 4px 12px rgba(59, 130, 246, 0.3);
  transform: scale(1.02);
}

.history-card.selected::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(59, 130, 246, 0.15);
  pointer-events: none;
}

/* 复选框 */
.select-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  height: 22px;
  background: rgba(0, 0, 0, 0.6);
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  z-index: 20;
}

.select-checkbox:hover {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.3);
}

.select-checkbox.checked {
  background: #3b82f6;
  border-color: #3b82f6;
}

.select-checkbox.checked svg {
  color: #fff;
}

/* 卡片图片 */
.card-image {
  width: 100%;
  /* 添加最大高度限制，防止超长图片影响体验 */
  max-height: 480px; 
  display: block;
  object-fit: cover;
}

/* 视频预览元素样式 */
.card-video-preview {
  pointer-events: none; /* 禁止视频交互 */
  background: #1a1a1c;
}

/* 竖屏视频特殊样式 */
.history-card.portrait-video {
  /* 竖屏视频占满宽度，保持比例 */
  aspect-ratio: 9 / 16 !important;
  display: block;
}

.history-card.portrait-video .card-image {
  width: 100%;
  height: 100%;
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

/* 音频标题覆盖层 */
.audio-title-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  padding: 24px 8px 8px;
  pointer-events: none;
}

.audio-title {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 音频卡片小图标 */
.history-card:has(> .audio-title-overlay)::before {
  content: '♪';
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 2;
}

/* 竖屏视频的占位符 */
.history-card.portrait-video .card-placeholder {
  aspect-ratio: 9 / 16;
  min-height: 240px;
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

.overlay-author {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.overlay-author svg {
  opacity: 0.7;
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

.retention-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(255, 180, 100, 0.7);
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
  gap: 20px;
  padding: 24px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 16px;
  min-width: 420px;
  box-shadow: 0 0 40px rgba(59, 130, 246, 0.2);
}

.audio-visualizer-container {
  position: relative;
  width: 400px;
  height: 280px;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
}

.audio-visualizer-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.audio-center-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 32px;
  color: rgba(59, 130, 246, 0.3);
  pointer-events: none;
  text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
}

.audio-info {
  text-align: center;
  padding: 0 16px;
}

.audio-title-text {
  font-size: 16px;
  font-weight: 500;
  color: #fff;
  text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}

.audio-player {
  width: 380px;
  max-width: 100%;
  height: 40px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
}

/* 自定义音频播放器样式 */
.audio-player::-webkit-media-controls-panel {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%);
  border-radius: 20px;
}

.audio-player::-webkit-media-controls-play-button,
.audio-player::-webkit-media-controls-mute-button {
  filter: invert(1);
}

.audio-player::-webkit-media-controls-current-time-display,
.audio-player::-webkit-media-controls-time-remaining-display {
  color: #fff;
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

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   HistoryPanel 白昼模式样式适配
   ======================================== */

/* 全屏模式容器 */
:root.canvas-theme-light .history-panel-wrapper.fullscreen {
  background: rgba(255, 255, 255, 0.85) !important;
}

/* 面板背景 */
:root.canvas-theme-light .history-panel {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(250, 250, 252, 0.98) 100%) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 
    0 24px 80px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.03) inset !important;
}

/* 头部 */
:root.canvas-theme-light .history-panel .panel-header {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .history-panel .header-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .history-panel .header-title svg {
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .history-panel .header-btn {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .history-panel .header-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .history-panel .header-btn.active {
  background: rgba(59, 130, 246, 0.12) !important;
  color: #3b82f6 !important;
}

:root.canvas-theme-light .history-panel .close-btn {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .history-panel .close-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #1c1917 !important;
}

/* 批量操作栏 */
:root.canvas-theme-light .history-panel .batch-action-bar {
  background: rgba(59, 130, 246, 0.06) !important;
  border-bottom-color: rgba(59, 130, 246, 0.15) !important;
}

:root.canvas-theme-light .history-panel .select-all-btn {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .history-panel .select-all-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .history-panel .select-count {
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .history-panel .batch-download-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
}

/* 文件类型筛选 */
:root.canvas-theme-light .history-panel .type-filter {
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .history-panel .type-btn {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .history-panel .type-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .history-panel .type-btn.active {
  background: rgba(0, 0, 0, 0.08) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .history-panel .type-count {
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .history-panel .type-btn.active .type-count {
  background: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

/* 搜索栏 */
:root.canvas-theme-light .history-panel .search-bar {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .history-panel .search-bar:focus-within {
  border-color: rgba(0, 0, 0, 0.15) !important;
  background: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .history-panel .search-bar svg {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .history-panel .search-input {
  color: #1c1917 !important;
}

:root.canvas-theme-light .history-panel .search-input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .history-panel .search-clear {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .history-panel .search-clear:hover {
  color: rgba(0, 0, 0, 0.7) !important;
}

/* 历史记录列表滚动条 */
:root.canvas-theme-light .history-panel .history-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12) !important;
}

/* 骨架屏 */
:root.canvas-theme-light .history-panel .skeleton-card {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%) !important;
}

/* 加载状态 */
:root.canvas-theme-light .history-panel .loading-state {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .history-panel .spinner {
  border-color: rgba(0, 0, 0, 0.1) !important;
  border-top-color: rgba(0, 0, 0, 0.6) !important;
}

/* 空状态 */
:root.canvas-theme-light .history-panel .empty-state p {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .history-panel .empty-icon {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .history-panel .empty-hint {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .history-panel .empty-hint.retention {
  color: rgba(180, 120, 60, 0.7) !important;
}

/* 历史记录卡片 */
:root.canvas-theme-light .history-panel .history-card {
  background: #fafafa !important;
}

:root.canvas-theme-light .history-panel .history-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .history-panel .history-card.selected {
  box-shadow: 0 0 0 3px #3b82f6, 0 4px 12px rgba(59, 130, 246, 0.2) !important;
}

:root.canvas-theme-light .history-panel .history-card.selected::after {
  background: rgba(59, 130, 246, 0.08) !important;
}

/* 复选框 */
:root.canvas-theme-light .history-panel .select-checkbox {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(0, 0, 0, 0.3) !important;
}

:root.canvas-theme-light .history-panel .select-checkbox:hover {
  border-color: #3b82f6 !important;
  background: rgba(59, 130, 246, 0.1) !important;
}

:root.canvas-theme-light .history-panel .select-checkbox.checked {
  background: #3b82f6 !important;
  border-color: #3b82f6 !important;
}

/* 卡片占位符 */
:root.canvas-theme-light .history-panel .card-placeholder {
  background: linear-gradient(135deg, #f0f0f0 0%, #e8e8e8 100%) !important;
}

:root.canvas-theme-light .history-panel .card-placeholder.image {
  background: linear-gradient(135deg, #e0e8f0 0%, #d8e0e8 100%) !important;
}

:root.canvas-theme-light .history-panel .card-placeholder.video {
  background: linear-gradient(135deg, #ece0f0 0%, #e4d8e8 100%) !important;
}

:root.canvas-theme-light .history-panel .card-placeholder.audio {
  background: linear-gradient(135deg, #e0f0e8 0%, #d8e8e0 100%) !important;
}

:root.canvas-theme-light .history-panel .placeholder-icon {
  color: rgba(0, 0, 0, 0.3) !important;
}

:root.canvas-theme-light .history-panel .placeholder-text {
  color: rgba(0, 0, 0, 0.35) !important;
}

/* 音频标题覆盖层 */
:root.canvas-theme-light .history-panel .audio-title-overlay {
  background: linear-gradient(transparent, rgba(255, 255, 255, 0.95)) !important;
}

:root.canvas-theme-light .history-panel .audio-title {
  color: #1c1917 !important;
  text-shadow: none !important;
}

/* 视频标识 */
:root.canvas-theme-light .history-panel .video-badge {
  background: rgba(0, 0, 0, 0.6) !important;
}

/* 悬停信息遮罩 */
:root.canvas-theme-light .history-panel .hover-overlay {
  background: linear-gradient(to top, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.7) 50%, transparent 100%) !important;
}

:root.canvas-theme-light .history-panel .overlay-model {
  color: #1c1917 !important;
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .history-panel .overlay-prompt {
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .history-panel .overlay-time {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .history-panel .overlay-author {
  color: rgba(0, 0, 0, 0.6) !important;
  border-top-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .history-panel .overlay-delete {
  background: rgba(255, 255, 255, 0.9) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .history-panel .overlay-delete:hover {
  background: #ef4444 !important;
  color: #fff !important;
}

/* 底部 */
:root.canvas-theme-light .history-panel .panel-footer {
  border-top-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .history-panel .stats {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .history-panel .retention-tip {
  color: rgba(180, 120, 60, 0.8) !important;
}

:root.canvas-theme-light .history-panel .tip {
  color: rgba(0, 0, 0, 0.4) !important;
}

/* 右键菜单 */
:root.canvas-theme-light .history-context-menu {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .history-context-menu .context-menu-item {
  color: rgba(0, 0, 0, 0.8) !important;
}

:root.canvas-theme-light .history-context-menu .context-menu-item:hover {
  background: rgba(0, 0, 0, 0.05) !important;
}

:root.canvas-theme-light .history-context-menu .context-menu-item.danger {
  color: #ef4444 !important;
}

:root.canvas-theme-light .history-context-menu .context-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.08) !important;
}

:root.canvas-theme-light .history-context-menu .context-menu-divider {
  background: rgba(0, 0, 0, 0.06) !important;
}

/* 全屏预览 */
:root.canvas-theme-light .history-preview-overlay {
  background: rgba(255, 255, 255, 0.98) !important;
}

:root.canvas-theme-light .history-preview-modal .close-preview-btn {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .history-preview-modal .close-preview-btn:hover {
  background: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .history-preview-modal .preview-audio {
  background: rgba(59, 130, 246, 0.04) !important;
  border-color: rgba(59, 130, 246, 0.2) !important;
}

:root.canvas-theme-light .history-preview-modal .audio-title-text {
  color: #1c1917 !important;
  text-shadow: none !important;
}

/* 底部信息栏 */
:root.canvas-theme-light .history-preview-modal .preview-footer {
  background: rgba(250, 250, 252, 0.98) !important;
  border-top-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .history-preview-modal .info-tag {
  color: rgba(0, 0, 0, 0.6) !important;
  background: rgba(0, 0, 0, 0.05) !important;
}

:root.canvas-theme-light .history-preview-modal .preview-prompt {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .history-preview-modal .preview-actions .action-btn {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .history-preview-modal .preview-actions .action-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .history-preview-modal .preview-actions .apply-btn {
  background: #1c1917 !important;
  border-color: #1c1917 !important;
  color: #fff !important;
}

:root.canvas-theme-light .history-preview-modal .preview-actions .apply-btn:hover {
  background: #292524 !important;
}

:root.canvas-theme-light .history-preview-modal .preview-actions .asset-btn:hover {
  background: rgba(59, 130, 246, 0.1) !important;
  border-color: rgba(59, 130, 246, 0.3) !important;
}

:root.canvas-theme-light .history-preview-modal .preview-actions .delete-btn:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
  color: #ef4444 !important;
}

/* 删除确认弹窗 */
:root.canvas-theme-light .delete-confirm-overlay {
  background: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .delete-confirm-modal {
  background: linear-gradient(145deg, #ffffff, #fafafa) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 
    0 25px 60px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.03) inset !important;
}

:root.canvas-theme-light .delete-confirm-modal .delete-modal-icon {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.03)) !important;
  border-color: rgba(239, 68, 68, 0.15) !important;
}

:root.canvas-theme-light .delete-confirm-modal .delete-modal-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .delete-confirm-modal .delete-modal-desc {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .delete-confirm-modal .delete-modal-preview {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .delete-confirm-modal .preview-placeholder {
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.03), transparent) !important;
  color: rgba(0, 0, 0, 0.25) !important;
}

:root.canvas-theme-light .delete-confirm-modal .cancel-btn {
  background: rgba(0, 0, 0, 0.04) !important;
  color: rgba(0, 0, 0, 0.7) !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .delete-confirm-modal .cancel-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .delete-confirm-modal .confirm-btn {
  background: linear-gradient(135deg, #ef4444, #dc2626) !important;
}
</style>

