<script setup>
/**
 * AssetPanel.vue - 我的资产面板
 * 用于管理用户生成的文案、图片、视频、音频等资源
 * 支持分类、标签、收藏、拖拽添加到画布
 * 支持全屏预览和应用到画布
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getAssets, deleteAsset, toggleFavorite, updateAssetTags, updateAsset, saveAsset } from '@/api/canvas/assets'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { useI18n } from '@/i18n'
import { useTeamStore } from '@/stores/team'
import CachedImage from '@/components/CachedImage.vue'
import SpaceSwitcher from './SpaceSwitcher.vue'

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
const spaceFilter = ref('current') // 空间筛选: 'current' | 'personal' | 'team-xxx' | 'all'
const showTagManager = ref(false)
const editingAsset = ref(null)
const newTagInput = ref('')

// 全屏预览状态
const showPreview = ref(false)
const previewAsset = ref(null)
const previewVideoRef = ref(null)

// 音频可视化状态
const audioRef = ref(null)
const audioVisualizerRef = ref(null)
let audioContext = null
let analyser = null
let audioSource = null
let animationId = null
let particles = []
let audioSourceConnected = false

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

// 团队空间实时同步
const TEAM_SYNC_INTERVAL = 10000 // 团队空间同步间隔 10 秒
let teamSyncTimer = null
const lastSyncId = ref(null) // 记录最新一条记录的ID

// 文件类型 - 存储翻译键，在模板中实时翻译
const fileTypes = [
  { key: 'all', labelKey: 'common.all', icon: '◈' },
  { key: 'text', labelKey: 'canvas.assetPanel.copywriting', icon: 'Aa' },
  { key: 'image', labelKey: 'canvas.nodes.image', icon: '◫' },
  { key: 'video', labelKey: 'canvas.nodes.video', icon: '▷' },
  { key: 'audio', labelKey: 'canvas.nodes.audio', icon: '♪' },
  { key: 'sora-character', label: 'Sora角色库', icon: '👤' }
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
  const stats = { all: 0, text: 0, image: 0, video: 0, audio: 0, 'sora-character': 0 }
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
  
  // 如果有缓存且未过期，使用缓存（但空间切换时需要强制刷新）
  if (!forceRefresh && dataCached.value && (now - lastLoadTime.value < CACHE_DURATION)) {
    console.log('[AssetPanel] 使用缓存数据')
    return
  }
  
  loading.value = true
  try {
    // 获取空间筛选参数
    const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
    const result = await getAssets(spaceParams)
    assets.value = result.assets || []
    dataCached.value = true
    lastLoadTime.value = now
    console.log('[AssetPanel] 加载资产:', assets.value.length, '个', spaceParams)
  } catch (error) {
    console.error('[AssetPanel] 加载资产失败:', error)
  } finally {
    loading.value = false
  }
}

/**
 * 团队空间实时同步 - 检查是否有新数据
 */
async function checkTeamSync() {
  // 仅在团队空间且面板可见时同步
  if (!teamStore.isInTeamSpace.value || !props.visible) return
  
  // 仅在筛选当前空间时同步
  if (spaceFilter.value !== 'current') return
  
  try {
    const spaceParams = teamStore.getSpaceParams('current')
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

// 空间筛选变化时重新加载
function handleSpaceChange(newSpace) {
  spaceFilter.value = newSpace
  dataCached.value = false // 清除缓存
  loadAssets(true)
  
  // 重新评估是否需要同步
  if (newSpace === 'current') {
    startTeamSync()
  } else {
    stopTeamSync()
  }
}

// 监听全局空间切换事件
watch(() => teamStore.globalTeamId.value, () => {
  if (spaceFilter.value === 'current') {
    dataCached.value = false
    loadAssets(true)
  }
  // 空间切换后重新评估同步状态
  if (props.visible) {
    startTeamSync()
  }
})

// 监听团队空间状态变化，控制同步
watch(() => teamStore.isInTeamSpace.value, (isTeam) => {
  if (isTeam && props.visible && spaceFilter.value === 'current') {
    startTeamSync()
  } else {
    stopTeamSync()
  }
})

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
  // 如果点击的是操作按钮区域，不处理（让按钮自己处理）
  const target = e.target
  if (target.closest('.asset-actions') || target.closest('.action-btn')) {
    return
  }
  
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
  destroyAudioVisualizer()
  showPreview.value = false
  previewAsset.value = null
}

// ========== 音频可视化 ==========

// 粒子类
class Particle {
  constructor(canvas) {
    this.canvas = canvas
    this.reset()
  }
  
  reset() {
    const centerX = this.canvas.width / 2
    const centerY = this.canvas.height / 2
    const angle = Math.random() * Math.PI * 2
    const distance = Math.random() * 80 + 60
    
    this.x = centerX + Math.cos(angle) * distance
    this.y = centerY + Math.sin(angle) * distance
    this.size = Math.random() * 4 + 2
    this.speedX = (Math.random() - 0.5) * 2
    this.speedY = (Math.random() - 0.5) * 2
    this.life = 1
    this.decay = Math.random() * 0.02 + 0.01
    this.hue = Math.random() * 40 + 200 // 蓝色色调 200-240
    this.brightness = Math.random() * 30 + 70
  }
  
  update(intensity) {
    this.x += this.speedX * (1 + intensity * 2)
    this.y += this.speedY * (1 + intensity * 2)
    this.life -= this.decay
    
    if (this.life <= 0) {
      this.reset()
    }
  }
  
  draw(ctx) {
    ctx.save()
    ctx.globalAlpha = this.life * 0.8
    ctx.fillStyle = `hsl(${this.hue}, 80%, ${this.brightness}%)`
    ctx.shadowColor = `hsl(${this.hue}, 100%, 60%)`
    ctx.shadowBlur = 15
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// 初始化音频可视化
function initAudioVisualizer() {
  if (!audioRef.value || !audioVisualizerRef.value) return
  
  try {
    // 创建新的 AudioContext
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8
    
    // 连接音频源（只能连接一次）
    if (!audioSourceConnected) {
      audioSource = audioContext.createMediaElementSource(audioRef.value)
      audioSource.connect(analyser)
      analyser.connect(audioContext.destination)
      audioSourceConnected = true
    }
    
    // 初始化粒子
    const canvas = audioVisualizerRef.value
    particles = []
    for (let i = 0; i < 50; i++) {
      particles.push(new Particle(canvas))
    }
    
    // 开始动画
    animateVisualizer()
  } catch (e) {
    console.error('[AssetPanel] 音频可视化初始化失败:', e)
  }
}

// 动画循环
function animateVisualizer() {
  if (!audioVisualizerRef.value || !analyser) return
  
  const canvas = audioVisualizerRef.value
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  
  // 获取频率数据
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteFrequencyData(dataArray)
  
  // 计算平均强度
  let sum = 0
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i]
  }
  const avgIntensity = sum / bufferLength / 255
  
  // 清除画布
  ctx.fillStyle = 'rgba(15, 15, 25, 0.2)'
  ctx.fillRect(0, 0, width, height)
  
  // 绘制中心波形
  drawWaveform(ctx, dataArray, width, height, avgIntensity)
  
  // 更新和绘制粒子
  particles.forEach(particle => {
    particle.update(avgIntensity)
    particle.draw(ctx)
  })
  
  // 绘制底部频谱
  drawSpectrumBars(ctx, dataArray, width, height)
  
  animationId = requestAnimationFrame(animateVisualizer)
}

// 绘制波形
function drawWaveform(ctx, dataArray, width, height, intensity) {
  const centerX = width / 2
  const centerY = height / 2
  const radius = 50 + intensity * 30
  const points = 32
  
  ctx.save()
  ctx.strokeStyle = `hsla(210, 100%, 60%, ${0.6 + intensity * 0.4})`
  ctx.lineWidth = 2
  ctx.shadowColor = 'hsl(210, 100%, 60%)'
  ctx.shadowBlur = 20
  
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    const dataIndex = Math.floor((i / points) * dataArray.length)
    const amplitude = dataArray[dataIndex] / 255
    const r = radius + amplitude * 40
    
    const x = centerX + Math.cos(angle) * r
    const y = centerY + Math.sin(angle) * r
    
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

// 绘制频谱柱状图
function drawSpectrumBars(ctx, dataArray, width, height) {
  const barCount = 64
  const barWidth = width / barCount - 2
  const barSpacing = 2
  
  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * dataArray.length)
    const amplitude = dataArray[dataIndex] / 255
    const barHeight = amplitude * 60
    
    const x = i * (barWidth + barSpacing)
    const y = height - barHeight
    
    const hue = 210 + (i / barCount) * 40 // 蓝色到紫色渐变
    ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.3 + amplitude * 0.5})`
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`
    ctx.shadowBlur = 5
    
    ctx.fillRect(x, y, barWidth, barHeight)
  }
}

// 清理音频可视化
function cleanupAudioVisualizer() {
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  particles = []
}

// 完全销毁音频可视化（关闭预览时调用）
function destroyAudioVisualizer() {
  cleanupAudioVisualizer()
  
  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
  }
  analyser = null
  audioSource = null
  audioSourceConnected = false
}

// 音频播放事件处理
function handleAudioPlay() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume()
  }
  if (!animationId && audioRef.value) {
    initAudioVisualizer()
  }
}

// 音频暂停事件处理
function handleAudioPause() {
  cleanupAudioVisualizer()
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

// 🔧 修复：使用 smartDownload 统一下载，解决跨域和扩展名不匹配问题
async function handleDownload() {
  if (!contextMenuAsset.value) return
  
  const asset = contextMenuAsset.value
  closeContextMenu()
  
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
    
    // 使用 smartDownload 统一下载（fetch+blob，自动修正扩展名，解决跨域问题）
    const { smartDownload } = await import('@/api/client')
    await smartDownload(assetUrl, filename)
    console.log('[AssetPanel] 下载成功:', filename)
  } catch (error) {
    console.error('[AssetPanel] 下载失败:', error)
    alert(t('errors.downloadFailed') || '下载失败')
  }
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

  // 立即触发提取（不使用 nextTick，确保尽快开始加载）
  if (!videoThumbnails.value[`loading_${asset.id}`]) {
    videoThumbnails.value[`loading_${asset.id}`] = true
    extractVideoThumbnail(asset)
  }

  // 返回视频URL作为后备（某些浏览器可以直接显示视频首帧）
  return asset.url
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

// 角色视频播放（跨浏览器兼容）
function handleCharacterVideoPlay(e) {
  const video = e.target
  if (video && video.paused) {
    // 确保静音状态，避免自动播放策略限制
    video.muted = true
    const playPromise = video.play()
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.log('[AssetPanel] 视频播放失败:', err.message)
      })
    }
  }
}

// 角色视频暂停
function handleCharacterVideoPause(e) {
  const video = e.target
  if (video) {
    video.pause()
    video.currentTime = 0
  }
}

// 角色视频加载错误处理
function handleCharacterVideoError(e, asset) {
  console.warn('[AssetPanel] 角色视频加载失败:', asset.url)
  // 视频加载失败时隐藏视频元素，显示缩略图或占位符
  const video = e.target
  if (video) {
    video.style.display = 'none'
    // 尝试显示后备缩略图
    const parent = video.parentElement
    if (parent && !parent.querySelector('.character-thumbnail-fallback')) {
      const thumbnail = getVideoThumbnail(asset)
      if (thumbnail) {
        const img = document.createElement('img')
        img.src = thumbnail
        img.alt = asset.name
        img.className = 'character-thumbnail-fallback'
        parent.appendChild(img)
      }
    }
  }
}

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
    // 加载数据
    await loadAssets()
    
    // 启动团队空间实时同步
    startTeamSync()
    
    // 延迟渲染内容，让面板动画先完成
    isContentReady.value = false
    await nextTick()
    
    // 等待面板动画完成后再渲染内容
    setTimeout(() => {
      isContentReady.value = true
    }, 280)
  } else {
    isContentReady.value = false
    
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
function handleAssetsUpdated() {
  console.log('[AssetPanel] 收到资产更新事件，刷新数据')
  loadAssets(true)
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', handleGlobalClick)
  window.addEventListener('assets-updated', handleAssetsUpdated)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('assets-updated', handleAssetsUpdated)
  
  // 停止团队空间实时同步
  stopTeamSync()
  
  destroyAudioVisualizer()
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
                <span class="type-label">{{ ft.label }}</span>
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
              @click="handleAssetClick($event, asset)"
              @dblclick="handleAssetDoubleClick(asset)"
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
                <CachedImage
                  v-else-if="asset.type === 'image'"
                  :src="getAssetPreview(asset)"
                  :alt="asset.name"
                  img-class="image-preview"
                  loading="eager"
                />

                <!-- 视频预览 - 自动提取首帧 -->
                <div v-else-if="asset.type === 'video'" class="video-preview">
                  <CachedImage
                    :src="getVideoThumbnail(asset)"
                    :alt="asset.name"
                    loading="eager"
                  />
                  <div class="video-play-icon">▶</div>
                </div>
                
                <!-- 音频预览 -->
                <div v-else-if="asset.type === 'audio'" class="audio-preview">
                  <div class="audio-wave">
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                </div>
                
                <!-- Sora 角色预览 - 显示裁剪后的视频 -->
                <div v-else-if="asset.type === 'sora-character'" class="character-preview">
                  <!-- 失败状态覆盖层 -->
                  <div v-if="getCharacterStatus(asset) === 'failed'" class="character-failed-overlay">
                    <div class="failed-icon">✕</div>
                    <div class="failed-text">创建失败</div>
                    <div v-if="getCharacterFailReason(asset)" class="failed-reason">{{ getCharacterFailReason(asset) }}</div>
                  </div>
                  
                  <!-- 处理中状态覆盖层 -->
                  <div v-else-if="getCharacterStatus(asset) === 'pending' || getCharacterStatus(asset) === 'processing'" class="character-pending-overlay">
                    <div class="pending-spinner"></div>
                    <div class="pending-text">创建中...</div>
                  </div>
                  
                  <!-- 如果有视频 URL，显示视频（跨浏览器兼容） -->
                  <video 
                    v-if="asset.url && (asset.url.includes('/api/images/file/') || asset.url.includes('.mp4'))"
                    :src="asset.url"
                    :poster="getVideoThumbnail(asset)"
                    class="character-video"
                    muted
                    loop
                    playsinline
                    webkit-playsinline
                    x5-video-player-type="h5"
                    x5-playsinline
                    preload="metadata"
                    @mouseenter="handleCharacterVideoPlay($event)"
                    @mouseleave="handleCharacterVideoPause($event)"
                    @error="handleCharacterVideoError($event, asset)"
                  />
                  <!-- 否则显示缩略图 -->
                  <CachedImage 
                    v-else-if="getVideoThumbnail(asset)" 
                    :src="getVideoThumbnail(asset)" 
                    :alt="asset.name"
                    img-class="character-thumbnail"
                  />
                  <!-- 无视频无缩略图时显示渐变背景 -->
                  <div v-else class="character-placeholder"></div>
                </div>
              </div>

              <!-- 信息区 -->
              <div class="asset-info">
                <!-- Sora 角色：名称和角色ID并排显示 -->
                <div v-if="asset.type === 'sora-character'" class="character-name-row">
                  <!-- 左侧：角色名称 -->
                  <div class="character-name-left">
                    <template v-if="editingNameAssetId === asset.id">
                      <input
                        v-model="editingNameValue"
                        class="name-edit-input"
                        @blur="saveEditedName(asset)"
                        @keyup.enter="saveEditedName(asset)"
                        @keyup.escape="cancelEditName"
                        @click.stop
                        autofocus
                      />
                    </template>
                    <template v-else>
                      <span class="asset-name character-display-name" @dblclick="startEditName($event, asset)">
                        {{ asset.name }}
                      </span>
                    </template>
                  </div>
                  <!-- 右侧：角色ID（点击复制） -->
                  <span 
                    class="character-username-tag clickable" 
                    @click="copyCharacterId($event, asset)"
                    title="点击复制角色ID"
                  >
                    @{{ getCharacterUsername(asset) }}
                  </span>
                </div>
                
                <!-- 非角色资产：正常显示可编辑名称 -->
                <div v-else class="asset-name-container">
                  <template v-if="editingNameAssetId === asset.id">
                    <input
                      v-model="editingNameValue"
                      class="name-edit-input"
                      @blur="saveEditedName(asset)"
                      @keyup.enter="saveEditedName(asset)"
                      @keyup.escape="cancelEditName"
                      @click.stop
                      autofocus
                    />
                  </template>
                  <template v-else>
                    <div class="asset-name" @dblclick="startEditName($event, asset)">
                      {{ asset.name }}
                    </div>
                    <button 
                      class="edit-name-btn" 
                      @click="startEditName($event, asset)"
                      title="编辑名称"
                    >
                      ✎
                    </button>
                  </template>
                </div>
                
                <div class="asset-meta">
                  <span class="asset-size">{{ formatFileSize(asset.size) }}</span>
                  <span class="asset-time">{{ formatDate(asset.created_at) }}</span>
                  <!-- 团队空间用户署名 -->
                  <span v-if="teamStore.isInTeamSpace.value && asset.last_updated_by_username" class="asset-author">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    {{ asset.last_updated_by_username }}
                  </span>
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
            <CachedImage 
              v-else-if="previewAsset.type === 'image'" 
              :src="previewAsset.url" 
              :alt="previewAsset.name"
              img-class="preview-image"
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
              <div class="audio-visualizer-container">
                <canvas ref="audioVisualizerRef" class="audio-visualizer-canvas" width="400" height="300"></canvas>
                <div class="audio-icon">♪</div>
              </div>
              <h3 class="audio-title">{{ previewAsset.name }}</h3>
              <audio 
                ref="audioRef"
                :src="previewAsset.url"
                controls
                autoplay
                crossorigin="anonymous"
                class="audio-player"
                @play="handleAudioPlay"
                @pause="handleAudioPause"
                @ended="handleAudioPause"
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
  
  <!-- 复制成功提示 -->
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="copyToastVisible" class="copy-toast">
        {{ copyToastMessage }}
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
  overflow-x: hidden;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-content: start;
  /* 确保可以滚动 */
  max-height: 100%;
  min-height: 0;
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

/* 资产卡片 */
.asset-card {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  /* 设置最小高度确保卡片不会太扁 */
  min-height: 240px;
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
  height: 160px;
  min-height: 160px;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
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
  object-fit: cover;
}

.character-preview .character-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #1a1a2e;
  /* 跨浏览器兼容 */
  -webkit-transform: translateZ(0);
  transform: translateZ(0);
}

.character-preview .character-thumbnail,
.character-preview .character-thumbnail-fallback {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.asset-item:hover .edit-name-btn {
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
.asset-card.type-sora-character {
  cursor: copy;
}

.asset-card.type-sora-character::after {
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

.asset-card.type-sora-character:hover::after {
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

/* 标签筛选 */
:root.canvas-theme-light .asset-panel .tag-filter {
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .asset-panel .tag-btn {
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .asset-panel .tag-btn:hover {
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: rgba(0, 0, 0, 0.8) !important;
}

:root.canvas-theme-light .asset-panel .tag-btn.active {
  background: rgba(0, 0, 0, 0.08) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: #1c1917 !important;
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
:root.canvas-theme-light .asset-panel .asset-card {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .asset-panel .asset-card:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08) !important;
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
  color: #f59e0b !important;
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
