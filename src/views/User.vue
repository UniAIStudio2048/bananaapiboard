<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { redeemVoucher } from '@/api/client'
import { getTheme, setTheme, toggleTheme as toggleThemeUtil, themes } from '@/utils/theme'
import { getTenantHeaders } from '@/config/tenant'

const token = localStorage.getItem('token')
const me = ref(null)
const ledger = ref([])
const invite = ref({ invite_code: '', uses: [] })
const error = ref('')
const stats = ref(null)
const recentImages = ref([])
const recentVideos = ref([]) // 视频作品
const loading = ref(true)
const pointsTrend = ref([])
const pointsSources = ref([])
const activeTab = ref('overview') // overview, images, videos, points, invite, settings

// 积分统计（分类）
const pointsStats = ref({
  permanent: { earned: 0, spent: 0, balance: 0, transactions: [] },
  package: { earned: 0, spent: 0, balance: 0, transactions: [] }
})
const pointsStatsTab = ref('all') // all, permanent, package

// 无限滚动相关（图片）
const imagesPage = ref(0)
const imagesLimit = ref(20)
const imagesTotal = ref(0)
const imagesHasMore = ref(true)
const imagesLoading = ref(false)

// 无限滚动相关（视频）
const videosPage = ref(0)
const videosLimit = ref(20)
const videosTotal = ref(0)
const videosHasMore = ref(true)
const videosLoading = ref(false)

// 图片筛选相关
const imageFilter = ref({
  rating: 0, // 0=全部, 1-5=具体星级
  keyword: '', // 关键词搜索（提示词/备注）
  dateFrom: '',
  dateTo: '',
  sortBy: 'date',
  sortOrder: 'desc'
})
const imageSelectMode = ref(false)
const selectedImages = ref(new Set())
const imageDownloading = ref(false)

// 视频筛选相关
const videoFilter = ref({
  rating: 0, // 0=全部, 1-5=具体星级
  keyword: '', // 关键词搜索（提示词/备注）
  dateFrom: '',
  dateTo: '',
  sortBy: 'date',
  sortOrder: 'desc'
})
const videoSelectMode = ref(false)
const selectedVideos = ref(new Set())
const videoDownloading = ref(false)

// 备注编辑
const editingNote = ref(null) // { type: 'image'|'video', id: string, note: string }
const noteInput = ref('')

// 签到相关
const checkinStatus = ref({
  hasCheckedInToday: false,
  totalDays: 0,
  consecutiveDays: 0,
  todayDate: ''
})
const checkinLoading = ref(false)

// 设置相关
const showSettingsModal = ref(false)
const settingsTab = ref('profile') // profile, password, theme
const profileForm = ref({ username: '', email: '' })
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const saveLoading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// 图片查看
const showImageModal = ref(false)
const selectedImage = ref(null)

// 视频查看
const showVideoModal = ref(false)
const selectedVideo = ref(null)

// 主题
const currentTheme = ref(getTheme())

// 兑换券相关
const showVoucherModal = ref(false)
const voucherCode = ref('')
const voucherLoading = ref(false)
const voucherError = ref('')
const voucherSuccess = ref('')
const externalLinkConfig = ref({
  enabled: false,
  button_text: '获取兑换券',
  url: '',
  open_in_new_tab: true
})

// 邀请进度奖励相关
const inviteProgress = ref({
  invite_count: 0,
  milestones: [],
  claimed_milestones: []
})

// 余额划转相关
const showTransferModal = ref(false)
const transferForm = ref({ amount: '' })
const transferLoading = ref(false)
const transferError = ref('')
const transferSuccess = ref('')
const exchangeRate = ref(10)

// 充值相关
const showRechargeModal = ref(false)
const rechargeAmount = ref('')
const rechargeCustomAmount = ref('')
const rechargeSelectedMethod = ref(null)
const rechargeLoading = ref(false)
const rechargeError = ref('')
const paymentMethods = ref([])
const quickAmounts = [300, 500, 1000, 5000, 10000] // 单位：分

// 账单中心相关
const billOrders = ref([])
const billLoading = ref(false)
const billPage = ref(1)
const billTotal = ref(0)

async function load() {
  error.value = ''
  loading.value = true
  try {
    const headers = { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    
    // 并行请求所有数据
    const [meRes, ledgerRes, inviteRes, statsRes, imagesRes, videosRes, trendRes, sourcesRes, checkinRes, pointsStatsRes, inviteProgressRes] = await Promise.all([
      fetch('/api/user/me', { headers }),
      fetch('/api/user/points', { headers }),
      fetch('/api/user/invite-code', { headers }),
      fetch('/api/user/stats', { headers }),
      fetch('/api/user/recent-images?limit=12&offset=0', { headers }),
      fetch('/api/user/recent-videos?limit=12&offset=0', { headers }),
      fetch('/api/user/points-trend?days=7', { headers }),
      fetch('/api/user/points-sources', { headers }),
      fetch('/api/user/checkin-status', { headers }),
      fetch('/api/user/points-stats', { headers }),
      fetch('/api/invite/progress', { headers })
    ])
    
    if (!meRes.ok) throw new Error('unauth')
    
    me.value = await meRes.json()
    profileForm.value = { username: me.value.username, email: me.value.email }
    
    if (ledgerRes.ok) ledger.value = (await ledgerRes.json()).ledger
    if (inviteRes.ok) invite.value = await inviteRes.json()
    if (inviteProgressRes.ok) inviteProgress.value = await inviteProgressRes.json()
    if (statsRes.ok) stats.value = await statsRes.json()
    if (imagesRes.ok) {
      const data = await imagesRes.json()
      recentImages.value = data.images
      imagesTotal.value = data.total || 0
      imagesHasMore.value = data.hasMore || false
    }
    if (videosRes.ok) {
      const data = await videosRes.json()
      recentVideos.value = data.videos
      videosTotal.value = data.total || 0
      videosHasMore.value = data.hasMore || false
    }
    if (trendRes.ok) pointsTrend.value = (await trendRes.json()).trend
    if (sourcesRes.ok) pointsSources.value = (await sourcesRes.json()).sources
    if (checkinRes.ok) checkinStatus.value = await checkinRes.json()
    if (pointsStatsRes.ok) pointsStats.value = (await pointsStatsRes.json()).stats
    
  } catch (e) {
    error.value = '未登录或加载失败'
  } finally {
    loading.value = false
  }
}

// 构建图片筛选URL参数
function buildImageFilterParams() {
  const params = new URLSearchParams()
  params.set('limit', imagesLimit.value.toString())
  
  if (imageFilter.value.rating > 0) params.set('rating', imageFilter.value.rating.toString())
  if (imageFilter.value.keyword && imageFilter.value.keyword.trim()) params.set('keyword', imageFilter.value.keyword.trim())
  if (imageFilter.value.dateFrom) params.set('dateFrom', new Date(imageFilter.value.dateFrom).getTime().toString())
  if (imageFilter.value.dateTo) params.set('dateTo', new Date(imageFilter.value.dateTo + 'T23:59:59').getTime().toString())
  if (imageFilter.value.sortBy) params.set('sortBy', imageFilter.value.sortBy)
  if (imageFilter.value.sortOrder) params.set('sortOrder', imageFilter.value.sortOrder)
  
  return params
}

// 构建视频筛选URL参数
function buildVideoFilterParams() {
  const params = new URLSearchParams()
  params.set('limit', videosLimit.value.toString())
  
  if (videoFilter.value.rating > 0) params.set('rating', videoFilter.value.rating.toString())
  if (videoFilter.value.keyword && videoFilter.value.keyword.trim()) params.set('keyword', videoFilter.value.keyword.trim())
  if (videoFilter.value.dateFrom) params.set('dateFrom', new Date(videoFilter.value.dateFrom).getTime().toString())
  if (videoFilter.value.dateTo) params.set('dateTo', new Date(videoFilter.value.dateTo + 'T23:59:59').getTime().toString())
  if (videoFilter.value.sortBy) params.set('sortBy', videoFilter.value.sortBy)
  if (videoFilter.value.sortOrder) params.set('sortOrder', videoFilter.value.sortOrder)
  
  return params
}

// 加载图片（带筛选）
async function loadImages(reset = false) {
  if (imagesLoading.value) return
  
  imagesLoading.value = true
  try {
    const headers = { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    const params = buildImageFilterParams()
    const offset = reset ? 0 : recentImages.value.length
    params.set('offset', offset.toString())
    
    const res = await fetch(`/api/user/recent-images?${params.toString()}`, { headers })
    
    if (res.ok) {
      const data = await res.json()
      if (reset) {
        recentImages.value = data.images
        selectedImages.value = new Set()
      } else {
        recentImages.value = [...recentImages.value, ...data.images]
      }
      imagesTotal.value = data.total || 0
      imagesHasMore.value = data.hasMore || false
    }
  } catch (e) {
    console.error('加载图片失败:', e)
  } finally {
    imagesLoading.value = false
  }
}

// 加载更多图片
async function loadMoreImages() {
  if (!imagesHasMore.value) return
  await loadImages(false)
}

// 加载视频（带筛选）
async function loadVideos(reset = false) {
  if (videosLoading.value) return
  
  videosLoading.value = true
  try {
    const headers = { ...getTenantHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    const params = buildVideoFilterParams()
    const offset = reset ? 0 : recentVideos.value.length
    params.set('offset', offset.toString())
    
    const res = await fetch(`/api/user/recent-videos?${params.toString()}`, { headers })
    
    if (res.ok) {
      const data = await res.json()
      if (reset) {
        recentVideos.value = data.videos
        selectedVideos.value = new Set()
      } else {
        recentVideos.value = [...recentVideos.value, ...data.videos]
      }
      videosTotal.value = data.total || 0
      videosHasMore.value = data.hasMore || false
    }
  } catch (e) {
    console.error('加载视频失败:', e)
  } finally {
    videosLoading.value = false
  }
}

// 加载更多视频
async function loadMoreVideos() {
  if (!videosHasMore.value) return
  await loadVideos(false)
}

// 应用图片筛选
async function applyImageFilter() {
  await loadImages(true)
}

// 应用视频筛选
async function applyVideoFilter() {
  await loadVideos(true)
}

// 重置图片筛选
async function resetImageFilter() {
  imageFilter.value = {
    rating: 0,
    keyword: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'date',
    sortOrder: 'desc'
  }
  await loadImages(true)
}

// 重置视频筛选
async function resetVideoFilter() {
  videoFilter.value = {
    rating: 0,
    keyword: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'date',
    sortOrder: 'desc'
  }
  await loadVideos(true)
}

// 切换图片选择模式
function toggleImageSelectMode() {
  imageSelectMode.value = !imageSelectMode.value
  if (!imageSelectMode.value) {
    selectedImages.value = new Set()
  }
}

// 切换视频选择模式
function toggleVideoSelectMode() {
  videoSelectMode.value = !videoSelectMode.value
  if (!videoSelectMode.value) {
    selectedVideos.value = new Set()
  }
}

// 选择/取消选择图片
function toggleImageSelection(imageId) {
  const newSet = new Set(selectedImages.value)
  if (newSet.has(imageId)) {
    newSet.delete(imageId)
  } else {
    newSet.add(imageId)
  }
  selectedImages.value = newSet
}

// 选择/取消选择视频
function toggleVideoSelection(videoId) {
  const newSet = new Set(selectedVideos.value)
  if (newSet.has(videoId)) {
    newSet.delete(videoId)
  } else {
    newSet.add(videoId)
  }
  selectedVideos.value = newSet
}

// 全选/取消全选图片
function toggleAllImages() {
  if (selectedImages.value.size === recentImages.value.length) {
    selectedImages.value = new Set()
  } else {
    selectedImages.value = new Set(recentImages.value.map(img => img.id))
  }
}

// 全选/取消全选视频
function toggleAllVideos() {
  const completedVideos = recentVideos.value.filter(v => v.video_url)
  if (selectedVideos.value.size === completedVideos.length) {
    selectedVideos.value = new Set()
  } else {
    selectedVideos.value = new Set(completedVideos.map(v => v.id))
  }
}

// 生成安全的文件名
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 100)
}

// 下载单个文件
async function downloadFile(url, filename) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  } catch (e) {
    console.error('下载失败:', e)
  }
}

// 批量下载图片
async function batchDownloadImages() {
  if (selectedImages.value.size === 0) {
    showToast('请先选择要下载的图片', 'error')
    return
  }
  
  imageDownloading.value = true
  const selectedList = recentImages.value.filter(img => selectedImages.value.has(img.id))
  
  try {
    for (let i = 0; i < selectedList.length; i++) {
      const img = selectedList[i]
      // 如果有备注，使用备注作为文件名；否则使用默认名称
      let filename
      if (img.note && img.note.trim()) {
        filename = `${sanitizeFilename(img.note)}.png`
      } else {
        filename = `image-${img.id.substring(0, 8)}.png`
      }
      
      await downloadFile(img.url, filename)
      
      // 短暂延迟，避免同时下载太多文件
      if (i < selectedList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }
    
    showToast(`成功下载 ${selectedList.length} 张图片`, 'success')
    imageSelectMode.value = false
    selectedImages.value = new Set()
  } catch (e) {
    showToast('批量下载失败', 'error')
  } finally {
    imageDownloading.value = false
  }
}

// 批量下载视频
async function batchDownloadVideos() {
  if (selectedVideos.value.size === 0) {
    showToast('请先选择要下载的视频', 'error')
    return
  }
  
  videoDownloading.value = true
  const selectedList = recentVideos.value.filter(v => selectedVideos.value.has(v.id) && v.video_url)
  
  try {
    for (let i = 0; i < selectedList.length; i++) {
      const video = selectedList[i]
      // 如果有备注，使用备注作为文件名；否则使用默认名称
      let filename
      if (video.note && video.note.trim()) {
        filename = `${sanitizeFilename(video.note)}.mp4`
      } else {
        filename = `video-${video.id.substring(0, 8)}.mp4`
      }
      
      await downloadFile(video.video_url, filename)
      
      // 短暂延迟，避免同时下载太多文件
      if (i < selectedList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    showToast(`成功下载 ${selectedList.length} 个视频`, 'success')
    videoSelectMode.value = false
    selectedVideos.value = new Set()
  } catch (e) {
    showToast('批量下载失败', 'error')
  } finally {
    videoDownloading.value = false
  }
}

// 更新图片星标
async function updateImageRating(imageId, rating) {
  try {
    const headers = { 
      ...getTenantHeaders(), 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch(`/api/images/history/${imageId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ rating })
    })
    
    if (res.ok) {
      // 更新本地数据
      const idx = recentImages.value.findIndex(img => img.id === imageId)
      if (idx !== -1) {
        recentImages.value[idx].rating = rating
      }
      showToast(rating > 0 ? '已添加星标' : '已取消星标', 'success')
    }
  } catch (e) {
    console.error('更新星标失败:', e)
    showToast('更新失败', 'error')
  }
}

// 更新视频星标
async function updateVideoRating(videoId, rating) {
  try {
    const headers = { 
      ...getTenantHeaders(), 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch(`/api/videos/history/${videoId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ rating })
    })
    
    if (res.ok) {
      // 更新本地数据
      const idx = recentVideos.value.findIndex(v => v.id === videoId)
      if (idx !== -1) {
        recentVideos.value[idx].rating = rating
      }
      showToast(rating > 0 ? '已添加星标' : '已取消星标', 'success')
    }
  } catch (e) {
    console.error('更新星标失败:', e)
    showToast('更新失败', 'error')
  }
}

// 开始编辑备注
function startEditNote(type, id, currentNote) {
  editingNote.value = { type, id }
  noteInput.value = currentNote || ''
}

// 保存备注
async function saveNote() {
  if (!editingNote.value) return
  
  const { type, id } = editingNote.value
  const note = noteInput.value.trim()
  
  try {
    const headers = { 
      ...getTenantHeaders(), 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const url = type === 'image' ? `/api/images/history/${id}` : `/api/videos/history/${id}`
    
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ note })
    })
    
    if (res.ok) {
      // 更新本地数据
      if (type === 'image') {
        const idx = recentImages.value.findIndex(img => img.id === id)
        if (idx !== -1) {
          recentImages.value[idx].note = note
        }
      } else {
        const idx = recentVideos.value.findIndex(v => v.id === id)
        if (idx !== -1) {
          recentVideos.value[idx].note = note
        }
      }
      showToast('备注已保存', 'success')
      editingNote.value = null
      noteInput.value = ''
    }
  } catch (e) {
    console.error('保存备注失败:', e)
    showToast('保存失败', 'error')
  }
}

// 取消编辑备注
function cancelEditNote() {
  editingNote.value = null
  noteInput.value = ''
}

// 监听滚动事件实现无限滚动（图片）
function handleScroll(event) {
  const element = event.target
  const scrollBottom = element.scrollHeight - element.scrollTop - element.clientHeight
  
  // 距离底部100px时加载更多
  if (scrollBottom < 100 && !imagesLoading.value && imagesHasMore.value) {
    loadMoreImages()
  }
}

// 监听滚动事件实现无限滚动（视频）
function handleVideoScroll(event) {
  const element = event.target
  const scrollBottom = element.scrollHeight - element.scrollTop - element.clientHeight
  
  // 距离底部100px时加载更多
  if (scrollBottom < 100 && !videosLoading.value && videosHasMore.value) {
    loadMoreVideos()
  }
}

function copyInvite() {
  const url = `${location.origin}/auth?code=${invite.value.invite_code}`
  navigator.clipboard.writeText(url)
  showToast('邀请链接已复制到剪贴板！', 'success')
}

function showToast(message, type = 'info') {
  if (type === 'success') {
    successMessage.value = message
    setTimeout(() => successMessage.value = '', 3000)
  } else {
    errorMessage.value = message
    setTimeout(() => errorMessage.value = '', 3000)
  }
}

async function saveProfile() {
  saveLoading.value = true
  errorMessage.value = ''
  try {
    const headers = {
      ...getTenantHeaders(),
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify(profileForm.value)
    })
    
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'update_failed')
    }
    
    const updated = await res.json()
    me.value = { ...me.value, ...updated }
    showToast('个人资料更新成功！', 'success')
  } catch (e) {
    if (e.message === 'username_taken') {
      errorMessage.value = '用户名已被使用'
    } else if (e.message === 'email_taken') {
      errorMessage.value = '邮箱已被使用'
    } else {
      errorMessage.value = '更新失败，请重试'
    }
  } finally {
    saveLoading.value = false
  }
}

async function changePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }
  
  if (passwordForm.value.newPassword.length < 6) {
    errorMessage.value = '密码长度至少6位'
    return
  }
  
  saveLoading.value = true
  errorMessage.value = ''
  try {
    const headers = {
      ...getTenantHeaders(),
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch('/api/user/password', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        oldPassword: passwordForm.value.oldPassword,
        newPassword: passwordForm.value.newPassword
      })
    })
    
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'update_failed')
    }
    
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    showToast('密码修改成功！', 'success')
  } catch (e) {
    if (e.message === 'invalid_old_password') {
      errorMessage.value = '原密码错误'
    } else if (e.message === 'password_too_short') {
      errorMessage.value = '新密码长度至少6位'
    } else {
      errorMessage.value = '修改失败，请重试'
    }
  } finally {
    saveLoading.value = false
  }
}

function toggleTheme() {
  const newTheme = toggleThemeUtil()
  currentTheme.value = newTheme
  // setTheme已经会触发theme-changed事件，这里不需要重复触发
  showToast(`已切换到${newTheme === 'dark' ? '深色' : '浅色'}模式`, 'success')
}

// 直接设置主题（用于点击主题卡片时）
function setThemeDirect(theme) {
  setTheme(theme)
  currentTheme.value = theme
  // setTheme已经会触发theme-changed事件，这里不需要重复触发
  showToast(`已切换到${theme === 'dark' ? '深色' : '浅色'}模式`, 'success')
}

async function doCheckin() {
  if (checkinLoading.value || checkinStatus.value.hasCheckedInToday) return
  
  checkinLoading.value = true
  try {
    const headers = {
      ...getTenantHeaders(),
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch('/api/user/checkin', {
      method: 'POST',
      headers
    })
    
    const data = await res.json()
    
    if (!res.ok) {
      if (data.error === 'already_checked_in') {
        showToast(data.message || '今天已经签到过了', 'info')
      } else {
        throw new Error(data.message || 'checkin_failed')
      }
      return
    }
    
    // 更新签到状态
    checkinStatus.value.hasCheckedInToday = true
    checkinStatus.value.totalDays = (checkinStatus.value.totalDays || 0) + 1
    checkinStatus.value.consecutiveDays = data.consecutiveDays || 1
    
    // 更新积分显示
    if (me.value) {
      me.value.points = data.currentPoints
    }
    
    // 重新加载积分流水
    const ledgerRes = await fetch('/api/user/points', { headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` } })
    if (ledgerRes.ok) {
      ledger.value = (await ledgerRes.json()).ledger
    }
    
    showToast(data.message || '签到成功！', 'success')
  } catch (e) {
    showToast('签到失败，请重试', 'error')
  } finally {
    checkinLoading.value = false
  }
}

function viewImage(image) {
  selectedImage.value = image
  showImageModal.value = true
}

function viewVideo(video) {
  selectedVideo.value = video
  showVideoModal.value = true
}

function closeVideoModal() {
  showVideoModal.value = false
  selectedVideo.value = null
}

function formatVideoStatus(status) {
  const map = {
    pending: '排队中',
    processing: '生成中',
    COMPLETED: '已完成',
    SUCCESS: '已完成',
    FAILURE: '生成失败',
    failed: '生成失败',
    completed: '已完成'
  }
  return map[status] || status || '未知状态'
}

function videoStatusColor(status) {
  if (!status) return 'text-slate-500'
  const normalized = status.toString().toLowerCase()
  if (normalized.includes('success') || normalized.includes('completed')) {
    return 'text-green-500'
  }
  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'text-red-500'
  }
  if (normalized.includes('process')) {
    return 'text-blue-500'
  }
  return 'text-amber-500'
}

// 兑换券相关方法
function openVoucherModal() {
  showVoucherModal.value = true
  voucherCode.value = ''
  voucherError.value = ''
  voucherSuccess.value = ''
}

function closeVoucherModal() {
  showVoucherModal.value = false
  voucherCode.value = ''
  voucherError.value = ''
  voucherSuccess.value = ''
}

async function submitVoucher() {
  if (!voucherCode.value || !voucherCode.value.trim()) {
    voucherError.value = '请输入兑换码'
    return
  }
  
  voucherLoading.value = true
  voucherError.value = ''
  voucherSuccess.value = ''
  
  try {
    const result = await redeemVoucher(voucherCode.value.trim().toUpperCase())
    
    // 获取兑换券的面值余额（不是用户总余额）
    const voucherBalance = result.balance || 0
    
    console.log('[User/submitVoucher] 兑换成功，兑换券面值余额:', voucherBalance, '分 (¥' + (voucherBalance/100).toFixed(2) + ')')
    
    // 如果兑换券有余额，尝试自动购买套餐
    if (voucherBalance > 0) {
      console.log('[User/submitVoucher] 开始自动购买套餐流程（使用兑换券面值）...')
      const autoPurchaseResult = await tryAutoPurchasePackage(voucherBalance)
      
      if (autoPurchaseResult.success) {
        // 自动购买成功 - 根据续费/升级/新购显示不同消息
        let actionText = '已自动购买'
        let detailText = ''
        if (autoPurchaseResult.isRenewal) {
          actionText = '已自动续费'
          detailText = `\n• 有效期延长：${autoPurchaseResult.durationDays}天\n• 累加积分：+${autoPurchaseResult.points}\n• 并发限制：不变`
        } else if (autoPurchaseResult.isUpgrade) {
          actionText = '已自动升级'
          detailText = `\n• 赠送积分：${autoPurchaseResult.points}\n• 并发限制：${autoPurchaseResult.concurrentLimit}个\n• 有效期：${autoPurchaseResult.durationDays}天\n• 原套餐剩余价值已自动折抵`
        } else {
          detailText = `\n• 赠送积分：${autoPurchaseResult.points}\n• 并发限制：${autoPurchaseResult.concurrentLimit}个\n• 有效期：${autoPurchaseResult.durationDays}天`
        }
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(result.balance / 100).toFixed(2)} 余额\n\n🎉 ${actionText}「${autoPurchaseResult.packageName}」套餐${detailText}\n\n💰 剩余余额：¥${(autoPurchaseResult.remainingBalance / 100).toFixed(2)}`
        // 刷新用户信息
        await load()
      } else if (autoPurchaseResult.reason === 'no_package') {
        // 没有可购买的套餐
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(result.balance / 100).toFixed(2)} 余额\n\n💡 ${autoPurchaseResult.message}`
      } else if (autoPurchaseResult.reason === 'purchase_failed') {
        // 购买失败
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(result.balance / 100).toFixed(2)} 余额\n\n⚠️ 自动购买套餐失败：${autoPurchaseResult.message}\n请手动前往套餐页面购买`
      } else {
        // 其他情况（只兑换了积分没有余额等）
        voucherSuccess.value = result.message || `成功兑换 ${result.points} 积分！`
      }
    } else if (result.points > 0) {
      // 只兑换了积分
      voucherSuccess.value = `✅ 成功兑换 ${result.points} 积分！`
    } else {
      voucherSuccess.value = result.message || '兑换成功！'
    }
    
    // 触发全局用户信息更新事件（更新导航栏）
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
    // 5秒后关闭模态框（给用户更多时间查看详情）
    setTimeout(() => {
      closeVoucherModal()
    }, 5000)
  } catch (e) {
    voucherError.value = e.message || '兑换失败，请检查兑换码是否正确'
  } finally {
    voucherLoading.value = false
  }
}

// 尝试自动购买套餐（使用兑换券面值余额）
async function tryAutoPurchasePackage(voucherBalance) {
  try {
    if (!token) {
      return { success: false, reason: 'no_token', message: '未登录' }
    }
    
    console.log('[User/tryAutoPurchasePackage] 兑换券面值:', voucherBalance, '分 (¥' + (voucherBalance/100).toFixed(2) + ')')
    
    // 获取套餐列表
    console.log('[User/tryAutoPurchasePackage] 获取套餐列表...')
    const pkgRes = await fetch('/api/packages', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (!pkgRes.ok) {
      console.log('[User/tryAutoPurchasePackage] 获取套餐列表失败')
      return { success: false, reason: 'fetch_failed', message: '获取套餐列表失败' }
    }
    const pkgData = await pkgRes.json()
    const packages = pkgData.packages || []
    
    console.log('[User/tryAutoPurchasePackage] 套餐列表:', packages.map(p => ({ name: p.name, price: p.price, type: p.type })))
    
    if (packages.length === 0) {
      return { success: false, reason: 'no_package', message: '暂无可用套餐' }
    }
    
    // 获取当前用户套餐
    const activeRes = await fetch('/api/user/package', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    let activePackage = null
    if (activeRes.ok) {
      const activeData = await activeRes.json()
      activePackage = activeData.package
    }
    
    console.log('[User/tryAutoPurchasePackage] 当前活跃套餐:', activePackage ? `${activePackage.package_name} (${activePackage.package_type})` : '无')
    
    // 套餐等级定义
    const packageOrder = { daily: 1, weekly: 2, monthly: 3, quarterly: 4, yearly: 5 }
    const currentOrder = activePackage ? (packageOrder[activePackage.package_type] || 0) : 0
    
    // 找到兑换券面值范围内可以购买的套餐（同级续费或升级，不能降级）
    const affordablePackages = packages.filter(pkg => {
      // 兑换券面值足够
      if (pkg.price > voucherBalance) {
        console.log(`[User/tryAutoPurchasePackage] 套餐 "${pkg.name}" 价格 ${pkg.price} > 兑换券面值 ${voucherBalance} - 跳过`)
        return false
      }
      
      const newOrder = packageOrder[pkg.type] || 0
      
      // 不能降级（降级套餐不允许购买）
      if (activePackage && newOrder < currentOrder) {
        console.log(`[User/tryAutoPurchasePackage] 套餐 "${pkg.name}" 会导致降级(${newOrder} < ${currentOrder}) - 跳过`)
        return false
      }
      
      // 同级续费或升级都可以
      if (activePackage) {
        if (newOrder === currentOrder) {
          console.log(`[User/tryAutoPurchasePackage] 套餐 "${pkg.name}" 同级续费 - 符合条件`)
        } else {
          console.log(`[User/tryAutoPurchasePackage] 套餐 "${pkg.name}" 升级(${currentOrder} → ${newOrder}) - 符合条件`)
        }
      } else {
        console.log(`[User/tryAutoPurchasePackage] 套餐 "${pkg.name}" 新购 - 符合条件`)
      }
      return true
    })
    
    if (affordablePackages.length === 0) {
      // 分析原因并给出准确提示
      const minPricePackage = packages.reduce((min, p) => (!min || p.price < min.price) ? p : min, null)
      const minPrice = minPricePackage ? minPricePackage.price : 0
      
      // 检查是否所有套餐都是降级
      const allDowngrade = activePackage && packages.every(pkg => {
        const newOrder = packageOrder[pkg.type] || 0
        return newOrder < currentOrder
      })
      
      // 检查是否面值不够买同级或更高级套餐
      const sameOrHigherPackages = packages.filter(pkg => {
        const newOrder = packageOrder[pkg.type] || 0
        return !activePackage || newOrder >= currentOrder
      })
      const minSameOrHigherPrice = sameOrHigherPackages.reduce((min, p) => (!min || p.price < min.price) ? p : min, null)?.price || 0
      
      let hint = '兑换券面值不足以购买套餐'
      if (allDowngrade) {
        hint = `您当前是${activePackage.package_name}，兑换券面值只能购买更低级别套餐，不支持降级`
      } else if (minSameOrHigherPrice > 0 && voucherBalance < minSameOrHigherPrice) {
        hint = `续费或升级套餐最低需要 ¥${(minSameOrHigherPrice/100).toFixed(2)}，兑换券面值 ¥${(voucherBalance/100).toFixed(2)} 不足`
      } else if (minPrice > 0 && voucherBalance < minPrice) {
        hint = `最便宜的套餐需要 ¥${(minPrice/100).toFixed(2)}，兑换券面值 ¥${(voucherBalance/100).toFixed(2)}`
      }
      return { success: false, reason: 'no_package', message: hint }
    }
    
    // 按套餐等级排序，选择最大的（优先升级，其次续费）
    affordablePackages.sort((a, b) => {
      const orderA = packageOrder[a.type] || 0
      const orderB = packageOrder[b.type] || 0
      return orderB - orderA
    })
    
    const selectedPackage = affordablePackages[0]
    const selectedOrder = packageOrder[selectedPackage.type] || 0
    const isRenewal = activePackage && selectedOrder === currentOrder
    const isUpgrade = activePackage && selectedOrder > currentOrder
    
    console.log(`[User/tryAutoPurchasePackage] 选择套餐: "${selectedPackage.name}" (${isRenewal ? '续费' : isUpgrade ? '升级' : '新购'})`)
    
    // 购买套餐（后端会自动处理续费延期、升级折抵等逻辑）
    console.log('[User/tryAutoPurchasePackage] 开始购买套餐...')
    const purchaseRes = await fetch('/api/packages/purchase', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ package_id: selectedPackage.id })
    })
    
    const purchaseData = await purchaseRes.json()
    console.log('[User/tryAutoPurchasePackage] 购买结果:', purchaseData)
    
    if (purchaseRes.ok && !purchaseData.pay_url) {
      // 购买成功
      // 刷新用户信息获取最新余额
      const userRes = await fetch('/api/user/me', {
        headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
      })
      let remainingBalance = 0
      if (userRes.ok) {
        const userData = await userRes.json()
        remainingBalance = userData.balance || 0
      }
      
      return {
        success: true,
        packageName: selectedPackage.name,
        points: selectedPackage.points,
        isRenewal: isRenewal,
        isUpgrade: isUpgrade,
        concurrentLimit: selectedPackage.concurrent_limit,
        durationDays: selectedPackage.duration_days,
        remainingBalance: remainingBalance
      }
    } else {
      return { success: false, reason: 'purchase_failed', message: purchaseData.message || '购买失败' }
    }
  } catch (e) {
    console.error('[User/tryAutoPurchasePackage] 异常:', e)
    return { success: false, reason: 'error', message: e.message || '购买过程出错' }
  }
}

// 领取邀请进度奖励
async function claimMilestoneReward(milestone) {
  try {
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    const res = await fetch('/api/invite/claim-milestone', {
      method: 'POST',
      headers,
      body: JSON.stringify({ milestone })
    })
    
    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.error || '领取失败')
    }
    
    const data = await res.json()
    showToast(`🎉 成功领取 ${data.points_awarded} 积分奖励！`, 'success')
    
    // 刷新用户信息和邀请进度
    await load()
    
    // 触发全局用户信息更新事件（更新导航栏）
    window.dispatchEvent(new CustomEvent('user-info-updated'))
  } catch (e) {
    if (e.message === 'already_claimed') {
      showToast('该奖励已经领取过了', 'error')
    } else if (e.message === 'milestone_not_reached') {
      showToast('还未达到该邀请人数', 'error')
    } else {
      showToast(e.message || '领取失败，请重试', 'error')
    }
  }
}

// 打开余额划转模态框
function openTransferModal() {
  showTransferModal.value = true
  transferForm.value = { amount: '' }
  transferError.value = ''
  transferSuccess.value = ''
}

// 关闭余额划转模态框
function closeTransferModal() {
  showTransferModal.value = false
  transferForm.value = { amount: '' }
  transferError.value = ''
  transferSuccess.value = ''
}

// 计算可以兑换的积分
const calculatedPoints = computed(() => {
  const yuan = parseFloat(transferForm.value.amount) || 0
  return Math.floor(yuan * exchangeRate.value)
})

// 提交余额划转
async function submitTransfer() {
  const yuan = parseFloat(transferForm.value.amount)
  
  if (!yuan || yuan <= 0) {
    transferError.value = '请输入有效的金额'
    return
  }
  
  if (yuan < 1) {
    transferError.value = '最低划转金额为1元'
    return
  }
  
  const amountInCents = Math.floor(yuan * 100) // 转换为分
  
  if (me.value.balance < amountInCents) {
    transferError.value = `余额不足，当前余额 ${(me.value.balance / 100).toFixed(2)} 元`
    return
  }
  
  transferLoading.value = true
  transferError.value = ''
  transferSuccess.value = ''
  
  try {
    const headers = {
      ...getTenantHeaders(),
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    
    // 添加30秒超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    
    const res = await fetch('/api/user/balance-to-points', {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: amountInCents }),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    const data = await res.json()
    
    if (!res.ok) {
      throw new Error(data.message || '划转失败')
    }
    
    transferSuccess.value = data.message || `成功划转 ${yuan.toFixed(2)} 元 为 ${data.points} 积分`
    
    // 立即使用API返回的最新数据更新本地状态（无需再次请求）
    if (data.newBalance !== undefined && data.newPoints !== undefined) {
      me.value = {
        ...me.value,
        balance: data.newBalance,
        points: data.newPoints,
        package_points: data.newPackagePoints !== undefined ? data.newPackagePoints : me.value.package_points
      }
      console.log('[submitTransfer] 用户信息已立即更新(使用API返回值):', {
        balance: data.newBalance,
        points: data.newPoints,
        package_points: data.newPackagePoints
      })
    }
    
    // 立即更新积分统计（使用API返回的最新数据）
    if (data.pointsStats) {
      pointsStats.value = data.pointsStats
      console.log('[submitTransfer] 积分统计已立即更新:', data.pointsStats)
    }
    
    // 立即更新积分流水（使用API返回的最新数据）
    if (data.ledger && Array.isArray(data.ledger)) {
      ledger.value = data.ledger
      console.log('[submitTransfer] 积分流水已立即更新，共', data.ledger.length, '条记录')
    }
    
    // 触发全局用户信息更新事件（立即更新导航栏）
    window.dispatchEvent(new CustomEvent('user-info-updated'))
    
    // 异步刷新其他数据（不阻塞，作为补充刷新）
    load().catch(e => console.error('[submitTransfer] 刷新数据失败:', e))
    
    // 2秒后关闭模态框
    setTimeout(() => {
      closeTransferModal()
    }, 2000)
    
  } catch (e) {
    if (e.name === 'AbortError') {
      transferError.value = '请求超时，请检查网络连接或稍后重试'
    } else {
      transferError.value = e.message || '划转失败，请重试'
    }
  } finally {
    transferLoading.value = false
  }
}

// 打开充值弹窗
async function openRechargeModal() {
  showRechargeModal.value = true
  rechargeAmount.value = ''
  rechargeCustomAmount.value = ''
  rechargeSelectedMethod.value = null
  rechargeError.value = ''
  
  // 加载支付方式
  try {
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    const res = await fetch('/api/user/payment-methods', { headers })
    if (res.ok) {
      const data = await res.json()
      paymentMethods.value = data.methods || []
      if (paymentMethods.value.length > 0) {
        rechargeSelectedMethod.value = paymentMethods.value[0].id
      }
    }
  } catch (e) {
    console.error('[openRechargeModal] 加载支付方式失败:', e)
  }
}

// 关闭充值弹窗
function closeRechargeModal() {
  showRechargeModal.value = false
  rechargeAmount.value = ''
  rechargeCustomAmount.value = ''
  rechargeError.value = ''
}

// 选择快捷金额
function selectQuickAmount(amount) {
  rechargeAmount.value = amount
  rechargeCustomAmount.value = ''
}

// 获取最终充值金额（分）
function getFinalRechargeAmount() {
  if (rechargeAmount.value) {
    return parseInt(rechargeAmount.value)
  }
  if (rechargeCustomAmount.value) {
    const yuan = parseFloat(rechargeCustomAmount.value)
    if (yuan >= 1 && yuan <= 1500) {
      return Math.floor(yuan * 100)
    }
  }
  return 0
}

// 提交充值
async function submitRecharge() {
  const amount = getFinalRechargeAmount()
  
  if (amount < 100) {
    rechargeError.value = '最低充值金额为1元'
    return
  }
  if (amount > 150000) {
    rechargeError.value = '单笔最高充值1500元'
    return
  }
  if (!rechargeSelectedMethod.value) {
    rechargeError.value = '请选择支付方式'
    return
  }
  
  rechargeLoading.value = true
  rechargeError.value = ''
  
  try {
    const headers = {
      ...getTenantHeaders(),
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    
    const res = await fetch('/api/user/recharge', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: amount,
        payment_method_id: rechargeSelectedMethod.value
      })
    })
    
    const data = await res.json()
    
    if (!res.ok) {
      throw new Error(data.message || '创建订单失败')
    }
    
    // 跳转到支付页面前，设置待刷新标记
    if (data.pay_url) {
      localStorage.setItem('pending_payment_refresh', 'true')
      localStorage.setItem('payment_timestamp', Date.now().toString())
      window.location.href = data.pay_url
    }
  } catch (e) {
    rechargeError.value = e.message || '充值失败，请重试'
  } finally {
    rechargeLoading.value = false
  }
}

// 加载账单列表
async function loadBillOrders() {
  billLoading.value = true
  try {
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    const res = await fetch(`/api/user/recharge/orders?page=${billPage.value}&page_size=20`, { headers })
    if (res.ok) {
      const data = await res.json()
      billOrders.value = data.orders || []
      billTotal.value = data.total || 0
    }
  } catch (e) {
    console.error('[loadBillOrders] error:', e)
  } finally {
    billLoading.value = false
  }
}

// 格式化订单状态
function formatOrderStatus(status) {
  const map = {
    'pending': '待支付',
    'paid': '已支付',
    'failed': '支付失败',
    'cancelled': '已取消',
    'expired': '已过期'
  }
  return map[status] || status
}

// 获取订单状态颜色
function getOrderStatusColor(status) {
  const colors = {
    'pending': 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
    'paid': 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
    'failed': 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
    'cancelled': 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20',
    'expired': 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20'
  }
  return colors[status] || 'text-slate-600 bg-slate-50'
}

async function deleteImage(imageId) {
  if (!confirm('确定要删除这张图片吗？')) return
  
  try {
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    const res = await fetch(`/api/user/images/${imageId}`, {
      method: 'DELETE',
      headers
    })
    
    if (!res.ok) throw new Error('delete_failed')
    
    recentImages.value = recentImages.value.filter(img => img.id !== imageId)
    showToast('图片已删除', 'success')
  } catch (e) {
    showToast('删除失败，请重试', 'error')
  }
}

async function deleteVideo(videoId) {
  if (!confirm('确定要删除这个视频吗？')) return
  
  try {
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    const res = await fetch(`/api/videos/history/${videoId}`, {
      method: 'DELETE',
      headers
    })
    
    if (!res.ok) throw new Error('delete_failed')
    
    recentVideos.value = recentVideos.value.filter(v => v.id !== videoId)
    videosTotal.value = Math.max(0, videosTotal.value - 1)
    showToast('视频已删除', 'success')
  } catch (e) {
    showToast('删除失败，请重试', 'error')
  }
}

// 计算属性
const memberLevel = computed(() => {
  if (!stats.value) return { name: '新手', icon: '🌱', color: 'gray' }
  const points = stats.value.totalPointsEarned
  if (points >= 1000) return { name: '大师', icon: '👑', color: 'purple' }
  if (points >= 500) return { name: '专家', icon: '💎', color: 'blue' }
  if (points >= 100) return { name: '熟练', icon: '⭐', color: 'green' }
  return { name: '新手', icon: '🌱', color: 'gray' }
})

const daysRegistered = computed(() => {
  if (!me.value?.created_at) return 0
  return Math.floor((Date.now() - me.value.created_at) / (1000 * 60 * 60 * 24))
})

// 筛选积分流水
const filteredLedger = computed(() => {
  if (pointsStatsTab.value === 'all') {
    return ledger.value
  } else if (pointsStatsTab.value === 'permanent') {
    return ledger.value.filter(item => (item.points_type || 'permanent') === 'permanent')
  } else if (pointsStatsTab.value === 'package') {
    return ledger.value.filter(item => item.points_type === 'package')
  }
  return ledger.value
})

// 格式化过期时间
function formatExpireTime(timestamp) {
  const now = Date.now()
  const diff = timestamp - now
  
  if (diff <= 0) return '已过期'
  
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  
  if (days > 0) return `${days}天`
  if (hours > 0) return `${hours}小时`
  return '即将过期'
}

// 检查并处理支付返回后的刷新
async function checkPaymentReturn() {
  const pendingRefresh = localStorage.getItem('pending_payment_refresh')
  const timestamp = localStorage.getItem('payment_timestamp')
  
  if (pendingRefresh === 'true') {
    // 清除标记
    localStorage.removeItem('pending_payment_refresh')
    localStorage.removeItem('payment_timestamp')
    
    // 检查时间戳，如果是最近5分钟内的支付，才刷新
    const paymentTime = parseInt(timestamp) || 0
    const now = Date.now()
    const fiveMinutes = 5 * 60 * 1000
    
    if (now - paymentTime < fiveMinutes) {
      console.log('[User] 检测到支付返回，刷新用户信息...')
      // 延迟5秒后刷新，给后端处理回调的时间
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // 多次尝试刷新，确保获取到最新数据
      for (let i = 0; i < 3; i++) {
        await load()
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }
      
      // 显示成功提示
      successMessage.value = '充值成功！余额已到账'
      setTimeout(() => {
        successMessage.value = ''
      }, 5000)
    }
  }
}

// 监听页面可见性变化
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    checkPaymentReturn()
  }
}

onMounted(async () => {
  load()
  // 确保主题已应用
  currentTheme.value = getTheme()
  
  // 立即检查是否有待刷新的标记
  checkPaymentReturn()
  
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  // 加载兑换券外部链接配置和余额兑换率
  try {
    const configRes = await fetch('/api/points-config')
    if (configRes.ok) {
      const configData = await configRes.json()
      if (configData.voucher_external_link) {
        externalLinkConfig.value = {
          enabled: !!configData.voucher_external_link.enabled,
          button_text: configData.voucher_external_link.button_text || '获取兑换券',
          url: configData.voucher_external_link.url || '',
          open_in_new_tab: configData.voucher_external_link.open_in_new_tab !== false
        }
      }
      // 加载余额兑换率
      if (configData.exchange_rate_points_per_currency) {
        exchangeRate.value = Number(configData.exchange_rate_points_per_currency)
      }
    }
  } catch (e) {
    console.warn('[User] 获取配置失败:', e)
  }
  
  // 监听主题变化
  const handleThemeChange = () => {
    currentTheme.value = getTheme()
  }
  window.addEventListener('storage', handleThemeChange)
  window.addEventListener('theme-changed', handleThemeChange)
})

// 组件卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Toast 提示 -->
    <div v-if="successMessage" class="fixed top-20 right-4 z-50 animate-slide-down">
      <div class="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
        <span>✓</span>
        <span>{{ successMessage }}</span>
      </div>
    </div>
    
    <div v-if="errorMessage" class="fixed top-20 right-4 z-50 animate-slide-down">
      <div class="bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
        <span>✗</span>
        <span>{{ errorMessage }}</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <div class="flex items-center">
        <svg class="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
        </svg>
        <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
      </div>
    </div>

    <!-- 加载骨架屏 -->
    <div v-if="loading" class="space-y-6">
      <div class="animate-pulse">
        <div class="h-48 bg-slate-200 dark:bg-dark-600 rounded-xl mb-6"></div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div class="h-32 bg-slate-200 dark:bg-dark-600 rounded-xl"></div>
          <div class="h-32 bg-slate-200 dark:bg-dark-600 rounded-xl"></div>
          <div class="h-32 bg-slate-200 dark:bg-dark-600 rounded-xl"></div>
          <div class="h-32 bg-slate-200 dark:bg-dark-600 rounded-xl"></div>
        </div>
      </div>
    </div>

    <!-- 主内容 -->
    <div v-else-if="me" class="space-y-6">
      <!-- 顶部个人资料卡片 -->
      <div class="relative overflow-hidden rounded-2xl shadow-xl">
        <!-- 背景封面 -->
        <div class="h-32 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 animate-gradient-x"></div>
        
        <!-- 个人信息 -->
        <div class="relative px-6 pb-6 bg-white dark:bg-dark-700 -mt-16">
          <div class="flex flex-col md:flex-row md:items-end md:justify-between">
            <!-- 头像和基本信息 -->
            <div class="flex items-end space-x-4">
              <div class="relative">
                <div class="w-28 h-28 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-xl border-4 border-white dark:border-dark-700">
                  <span class="text-white font-bold text-4xl">{{ me.username.charAt(0).toUpperCase() }}</span>
                </div>
                <!-- 等级徽章 -->
                <div :class="`absolute -bottom-2 -right-2 px-2 py-1 bg-${memberLevel.color}-500 rounded-lg shadow-lg text-white text-xs font-bold flex items-center space-x-1`">
                  <span>{{ memberLevel.icon }}</span>
                  <span>{{ memberLevel.name }}</span>
                </div>
              </div>
              
              <div class="pb-2">
                <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">{{ me.username }}</h1>
                <p class="text-slate-500 dark:text-slate-400">{{ me.email }}</p>
                <p class="text-sm text-slate-400 dark:text-slate-500 mt-1">
                  已加入 {{ daysRegistered }} 天
                </p>
              </div>
            </div>
            
            <!-- 快速操作按钮 -->
            <div class="flex space-x-3 mt-4 md:mt-0">
              <button @click="showSettingsModal = true" class="btn-secondary px-4 py-2 text-sm">
                ⚙️ 设置
              </button>
              <button @click="$router.push('/')" class="btn-primary px-4 py-2 text-sm">
                🎨 开始创作
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 数据统计看板 -->
      <div v-if="stats" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- 生成图片数 -->
        <div class="card p-6 hover:scale-105 transition-transform duration-300">
          <div class="flex items-center justify-between mb-4">
            <div class="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl flex items-center justify-center">
              <span class="text-2xl">🎨</span>
            </div>
            <div class="text-right">
              <p class="text-3xl font-bold gradient-text">{{ stats.successfulGenerations }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">总计 {{ stats.totalGenerations }}</p>
            </div>
          </div>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-300">生成图片</p>
        </div>

        <!-- 套餐积分 -->
        <div class="card p-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-700">
          <div class="flex items-center space-x-3 mb-4">
            <div class="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <span class="text-2xl">💎</span>
            </div>
            <div>
              <p class="text-sm font-medium text-slate-600 dark:text-slate-400">套餐积分</p>
              <p v-if="me.package_points_expires_at && me.package_points_expires_at > Date.now()" class="text-xs text-amber-600 dark:text-amber-400">
                {{ formatExpireTime(me.package_points_expires_at) }}后过期
              </p>
            </div>
          </div>
          
          <div class="bg-white dark:bg-dark-700 rounded-lg p-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-600 dark:text-slate-400">已获得</span>
              <span class="text-lg font-bold text-green-600 dark:text-green-400">+{{ pointsStats.package.earned }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-600 dark:text-slate-400">已使用</span>
              <span class="text-lg font-bold text-red-600 dark:text-red-400">-{{ pointsStats.package.spent }}</span>
            </div>
            <div class="border-t-2 border-purple-200 dark:border-purple-700 pt-3">
              <div class="flex items-center justify-between">
                <span class="text-base font-semibold text-purple-700 dark:text-purple-300">当前余额</span>
                <span class="text-3xl font-bold text-purple-600 dark:text-purple-400">{{ me?.package_points || 0 }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 永久积分 -->
        <div class="card p-6 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border-2 border-purple-200 dark:border-purple-700">
          <div class="flex items-center space-x-3 mb-4">
            <div class="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <span class="text-2xl">⭐</span>
            </div>
            <div>
              <p class="text-sm font-medium text-slate-600 dark:text-slate-400">永久积分</p>
              <p class="text-xs text-purple-600 dark:text-purple-400">永不过期</p>
            </div>
          </div>
          
          <div class="bg-white dark:bg-dark-700 rounded-lg p-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-600 dark:text-slate-400">已获得</span>
              <span class="text-lg font-bold text-green-600 dark:text-green-400">+{{ pointsStats.permanent.earned }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-600 dark:text-slate-400">已使用</span>
              <span class="text-lg font-bold text-red-600 dark:text-red-400">-{{ pointsStats.permanent.spent }}</span>
            </div>
            <div class="border-t-2 border-blue-200 dark:border-blue-700 pt-3">
              <div class="flex items-center justify-between">
                <span class="text-base font-semibold text-blue-700 dark:text-blue-300">当前余额</span>
                <span class="text-3xl font-bold text-blue-600 dark:text-blue-400">{{ me?.points || 0 }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 账户余额 -->
        <div class="card p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-200 dark:border-green-800">
          <div class="flex items-center justify-between mb-4">
            <div class="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-600 rounded-xl flex items-center justify-center">
              <span class="text-2xl">💰</span>
            </div>
            <div class="text-right">
              <p class="text-3xl font-bold text-green-600 dark:text-green-400">¥{{ (me.balance / 100).toFixed(2) }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">可用余额</p>
            </div>
          </div>
          <div class="flex items-center justify-between mb-3">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-300">账户余额</p>
            <button
              @click="load"
              :disabled="loading"
              class="text-xs px-2 py-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors disabled:opacity-50"
              title="刷新余额"
            >
              🔄 {{ loading ? '刷新中...' : '刷新' }}
            </button>
          </div>
          <div class="space-y-2">
            <button
              @click="openTransferModal"
              class="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-medium rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-md hover:shadow-lg"
            >
              💎 划转到积分
            </button>
            <button
              @click="openRechargeModal"
              class="w-full px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all duration-300 shadow-md hover:shadow-lg"
            >
              💳 立即充值
            </button>
          </div>
        </div>

        <!-- 邀请人数 -->
        <div class="card p-6 hover:scale-105 transition-transform duration-300">
          <div class="flex items-center justify-between mb-4">
            <div class="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center">
              <span class="text-2xl">🎁</span>
            </div>
            <div class="text-right">
              <p class="text-3xl font-bold gradient-text">{{ stats.totalInvites }}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400">成功邀请</p>
            </div>
          </div>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-300">邀请好友</p>
        </div>

        <!-- 总积分 -->
        <div class="card p-6 hover:scale-105 transition-transform duration-300 bg-gradient-to-br from-indigo-500 to-purple-600">
          <div class="flex items-center justify-between mb-4">
            <div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur">
              <span class="text-2xl">✨</span>
            </div>
            <div class="text-right">
              <p class="text-3xl font-bold text-white">{{ (me.package_points || 0) + (me.points || 0) }}</p>
              <p class="text-xs text-white/80">套餐 + 永久</p>
            </div>
          </div>
          <p class="text-sm font-medium text-white">总积分</p>
        </div>
      </div>

      <!-- 快捷入口区域 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- 套餐入口卡片 -->
        <div class="card p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800 cursor-pointer hover:scale-105 transition-transform duration-300" @click="$router.push('/packages')">
          <div class="flex items-center justify-between">
            <!-- 左侧：图标和文字 -->
            <div class="flex items-center space-x-4">
              <div class="w-16 h-16 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
                <span class="text-3xl">💎</span>
              </div>
              <div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">购买套餐</h3>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  升级套餐，提升并发能力
                </p>
              </div>
            </div>

            <!-- 右侧：箭头 -->
            <div class="flex items-center">
              <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </div>
          </div>
        </div>

        <!-- 兑换券入口卡片 -->
        <div class="card p-6 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 border-2 border-pink-200 dark:border-pink-800 cursor-pointer hover:scale-105 transition-transform duration-300" @click="openVoucherModal">
          <div class="flex items-center justify-between">
            <!-- 左侧：图标和文字 -->
            <div class="flex items-center space-x-4">
              <div class="w-16 h-16 bg-gradient-to-br from-pink-400 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                <span class="text-3xl">🎫</span>
              </div>
              <div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">兑换券入口</h3>
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  输入兑换码获取积分
                </p>
              </div>
            </div>

            <!-- 右侧：按钮 -->
          <div class="flex items-center">
            <button class="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300">
              立即兑换
            </button>
          </div>
        </div>
      </div>
      </div>

      <!-- 每日签到卡片 -->
      <div class="card p-6 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-2 border-orange-200 dark:border-orange-800">
        <div class="flex flex-col md:flex-row items-center justify-between gap-4">
          <!-- 左侧：签到信息 -->
          <div class="flex items-center space-x-4">
            <div class="w-16 h-16 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center shadow-lg">
              <span class="text-3xl">📅</span>
            </div>
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">每日签到</h3>
              <div class="flex items-center space-x-4 text-sm">
                <div class="flex items-center space-x-1">
                  <span class="text-slate-600 dark:text-slate-400">连续</span>
                  <span class="font-bold text-orange-600 dark:text-orange-400">{{ checkinStatus.consecutiveDays }}</span>
                  <span class="text-slate-600 dark:text-slate-400">天</span>
                </div>
                <div class="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
                <div class="flex items-center space-x-1">
                  <span class="text-slate-600 dark:text-slate-400">累计</span>
                  <span class="font-bold text-orange-600 dark:text-orange-400">{{ checkinStatus.totalDays }}</span>
                  <span class="text-slate-600 dark:text-slate-400">天</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧：签到按钮 -->
          <button
            @click="doCheckin"
            :disabled="checkinStatus.hasCheckedInToday || checkinLoading"
            class="btn-primary px-8 py-3 text-lg font-bold shadow-lg transition-all duration-300"
            :class="{
              'opacity-50 cursor-not-allowed': checkinStatus.hasCheckedInToday,
              'hover:scale-105': !checkinStatus.hasCheckedInToday,
              'bg-gray-400': checkinStatus.hasCheckedInToday
            }"
          >
            <span v-if="checkinLoading">签到中...</span>
            <span v-else-if="checkinStatus.hasCheckedInToday">✓ 今日已签到</span>
            <span v-else>🎉 立即签到 +1积分</span>
          </button>
        </div>

        <!-- 签到说明 -->
        <div class="mt-4 pt-4 border-t border-orange-200 dark:border-orange-800">
          <p class="text-xs text-slate-600 dark:text-slate-400 flex items-center">
            <span class="mr-2">💡</span>
            每天签到可获得1积分奖励，连续签到越多天，积分积累越快！每日0点重置签到状态。
          </p>
        </div>
      </div>

      <!-- 标签页导航 -->
      <div class="card p-1">
        <div class="flex space-x-1 overflow-x-auto">
          <button
            @click="activeTab = 'overview'"
            :class="['tab-button', { active: activeTab === 'overview' }]"
          >
            📊 概览
          </button>
          <button
            @click="activeTab = 'images'"
            :class="['tab-button', { active: activeTab === 'images' }]"
          >
            🖼️ 图片作品
          </button>
          <button
            @click="activeTab = 'videos'"
            :class="['tab-button', { active: activeTab === 'videos' }]"
          >
            🎬 视频作品
          </button>
          <button
            @click="activeTab = 'points'"
            :class="['tab-button', { active: activeTab === 'points' }]"
          >
            💰 积分详情
          </button>
          <button
            @click="activeTab = 'bills'; loadBillOrders()"
            :class="['tab-button', { active: activeTab === 'bills' }]"
          >
            📋 账单中心
          </button>
          <button
            @click="activeTab = 'invite'"
            :class="['tab-button', { active: activeTab === 'invite' }]"
          >
            🎁 邀请中心
          </button>
        </div>
      </div>

      <!-- 标签页内容 -->
      <div class="space-y-6">
        <!-- 概览 Tab -->
        <div v-show="activeTab === 'overview'" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- 最近作品 -->
          <div class="card p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center">
                <span class="mr-2">🖼️</span>
                最近作品
              </h3>
              <button @click="activeTab = 'images'" class="text-sm text-primary-600 hover:text-primary-700">
                查看全部 →
              </button>
            </div>
            
            <div v-if="recentImages.length === 0" class="text-center py-8">
              <div class="w-16 h-16 mx-auto mb-3 bg-slate-100 dark:bg-dark-600 rounded-full flex items-center justify-center">
                <span class="text-2xl">🎨</span>
              </div>
              <p class="text-slate-500 dark:text-slate-400 text-sm">还没有生成作品</p>
            </div>
            
            <div v-else class="grid grid-cols-3 gap-2">
              <div
                v-for="image in recentImages.slice(0, 6)"
                :key="image.id"
                @click="viewImage(image)"
                class="aspect-square rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform duration-200 shadow-md"
              >
                <img :src="image.url" :alt="image.prompt" class="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          <!-- 积分流水预览 -->
          <div class="card p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center">
                <span class="mr-2">📈</span>
                积分动态
              </h3>
              <button @click="activeTab = 'points'" class="text-sm text-primary-600 hover:text-primary-700">
                查看详情 →
              </button>
            </div>
            
            <div v-if="ledger.length === 0" class="text-center py-8">
              <p class="text-slate-500 dark:text-slate-400 text-sm">暂无积分记录</p>
            </div>
            
            <div v-else class="space-y-2">
              <div
                v-for="(item, index) in ledger.slice(0, 5)"
                :key="index"
                class="flex items-center justify-between p-3 bg-slate-50 dark:bg-dark-600/30 rounded-lg"
              >
                <div class="flex items-center space-x-3">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center" :class="getTransactionIcon(item.type).bg">
                    <span class="text-sm">{{ getTransactionIcon(item.type).icon }}</span>
                  </div>
                  <div>
                    <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {{ getTransactionTypeText(item.type) }}
                    </p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      {{ new Date(item.ts).toLocaleDateString() }}
                    </p>
                  </div>
                </div>
                <p
                  class="font-bold"
                  :class="item.value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                >
                  {{ item.value > 0 ? '+' : '' }}{{ item.value }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 我的作品 Tab -->
        <div v-show="activeTab === 'images'">
          <div class="card p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold gradient-text flex items-center">
                <span class="mr-2">🖼️</span>
                我的作品集
              </h3>
              <div class="text-sm text-slate-600 dark:text-slate-400">
                共 {{ imagesTotal }} 张作品
              </div>
            </div>
            
            <!-- 重要提示：数据保留7天 -->
            <div class="mb-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
              <div class="flex items-start space-x-3">
                <div class="flex-shrink-0 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
                  <span class="text-xl">⚠️</span>
                </div>
                <div class="flex-1">
                  <h4 class="font-bold text-amber-900 dark:text-amber-300 mb-1">
                    重要提醒：作品仅保留7天
                  </h4>
                  <p class="text-sm text-amber-800 dark:text-amber-400 leading-relaxed">
                    为节省服务器存储空间，所有生成的作品将在创建后 <strong>7天自动删除</strong>。
                    请及时下载并保存您喜欢的作品到本地设备，以免丢失！
                  </p>
                  <div class="mt-2 flex items-center space-x-2 text-xs text-amber-700 dark:text-amber-500">
                    <span>💡</span>
                    <span>提示：点击图片可查看详情并下载</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 筛选工具栏 -->
            <div class="mb-4 p-4 bg-slate-50 dark:bg-dark-700 rounded-xl space-y-3">
              <div class="flex flex-wrap items-center gap-3">
                <!-- 星级筛选下拉 -->
                <select
                  v-model="imageFilter.rating"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                    imageFilter.rating > 0 
                      ? 'bg-amber-500 text-white border-amber-500' 
                      : 'bg-white dark:bg-dark-600 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-500'
                  ]"
                >
                  <option :value="0">⭐ 全部星级</option>
                  <option :value="5">⭐⭐⭐⭐⭐ 5星</option>
                  <option :value="4">⭐⭐⭐⭐ 4星</option>
                  <option :value="3">⭐⭐⭐ 3星</option>
                  <option :value="2">⭐⭐ 2星</option>
                  <option :value="1">⭐ 1星</option>
                </select>
                
                <!-- 关键词搜索 -->
                <input
                  v-model="imageFilter.keyword"
                  type="text"
                  placeholder="🔍 搜索提示词/备注..."
                  class="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300 w-48"
                  @keyup.enter="applyImageFilter"
                />
                
                <!-- 日期筛选 -->
                <div class="flex items-center gap-2">
                  <input
                    v-model="imageFilter.dateFrom"
                    type="date"
                    class="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300"
                  />
                  <span class="text-slate-400">-</span>
                  <input
                    v-model="imageFilter.dateTo"
                    type="date"
                    class="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300"
                  />
                </div>
                
                <!-- 排序 -->
                <select
                  v-model="imageFilter.sortBy"
                  class="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300"
                >
                  <option value="date">按日期</option>
                  <option value="rating">按星标</option>
                </select>
                <button
                  @click="imageFilter.sortOrder = imageFilter.sortOrder === 'desc' ? 'asc' : 'desc'"
                  class="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-500"
                >
                  {{ imageFilter.sortOrder === 'desc' ? '↓ 降序' : '↑ 升序' }}
                </button>
                
                <!-- 查询按钮 -->
                <button
                  @click="applyImageFilter"
                  class="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-all flex items-center gap-1"
                >
                  🔍 查询
                </button>
                
                <!-- 重置按钮 -->
                <button
                  @click="resetImageFilter"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 dark:bg-dark-500 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-dark-400 transition-all"
                >
                  重置
                </button>
                
                <!-- 分隔线 -->
                <div class="flex-1"></div>
                
                <!-- 批量操作 -->
                <button
                  @click="toggleImageSelectMode"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1',
                    imageSelectMode 
                      ? 'bg-primary-500 text-white' 
                      : 'bg-white dark:bg-dark-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                  ]"
                >
                  ☑️ {{ imageSelectMode ? '取消选择' : '批量选择' }}
                </button>
              </div>
              
              <!-- 批量操作栏 -->
              <div v-if="imageSelectMode" class="flex items-center gap-3 pt-2 border-t border-slate-200 dark:border-dark-600">
                <button
                  @click="toggleAllImages"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 dark:bg-dark-500 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-all"
                >
                  {{ selectedImages.size === recentImages.length ? '取消全选' : '全选' }}
                </button>
                <span class="text-sm text-slate-500 dark:text-slate-400">
                  已选择 {{ selectedImages.size }} 项
                </span>
                <button
                  @click="batchDownloadImages"
                  :disabled="selectedImages.size === 0 || imageDownloading"
                  class="px-4 py-1.5 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <span v-if="imageDownloading">⏳ 下载中...</span>
                  <span v-else>⬇️ 批量下载</span>
                </button>
              </div>
            </div>
            
            <div v-if="recentImages.length === 0 && !loading" class="text-center py-12">
              <div class="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-600 dark:to-dark-700 rounded-full flex items-center justify-center">
                <span class="text-3xl">🎨</span>
              </div>
              <p class="text-slate-500 dark:text-slate-400 mb-4">还没有生成作品</p>
              <button @click="$router.push('/')" class="btn-primary px-6 py-2">
                开始创作
              </button>
            </div>
            
            <!-- 瀑布流网格 + 无限滚动 -->
            <div 
              v-else
              class="max-h-[800px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-dark-600 scrollbar-track-transparent"
              @scroll="handleScroll"
            >
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div
                  v-for="image in recentImages"
                  :key="image.id"
                  :class="[
                    'group relative aspect-square rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300',
                    imageSelectMode && selectedImages.has(image.id) ? 'ring-4 ring-primary-500' : ''
                  ]"
                  @click="imageSelectMode ? toggleImageSelection(image.id) : null"
                >
                  <img :src="image.url" :alt="image.prompt" class="w-full h-full object-cover" loading="lazy" />
                  
                  <!-- 选择复选框 -->
                  <div v-if="imageSelectMode" class="absolute top-2 left-2 z-10">
                    <div :class="[
                      'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                      selectedImages.has(image.id) 
                        ? 'bg-primary-500 border-primary-500 text-white' 
                        : 'bg-white/80 border-slate-300'
                    ]">
                      <span v-if="selectedImages.has(image.id)" class="text-xs">✓</span>
                    </div>
                  </div>
                  
                  <!-- 星标和备注标识 -->
                  <div class="absolute top-2 right-2 flex items-center gap-1">
                    <!-- 星级显示/编辑 -->
                    <div v-if="!imageSelectMode" class="relative group/rating">
                      <button
                        :class="[
                          'px-2 py-1 rounded-lg flex items-center gap-0.5 transition-all text-xs',
                          image.rating > 0 
                            ? 'bg-amber-500 text-white' 
                            : 'bg-black/30 text-white/70 hover:bg-amber-500 hover:text-white'
                        ]"
                      >
                        <span v-if="image.rating > 0">{{ '⭐'.repeat(image.rating) }}</span>
                        <span v-else>☆</span>
                      </button>
                      <!-- 星级选择弹出 -->
                      <div class="absolute right-0 top-full mt-1 hidden group-hover/rating:flex flex-col bg-white dark:bg-dark-700 rounded-lg shadow-xl border border-slate-200 dark:border-dark-600 overflow-hidden z-20">
                        <button @click.stop="updateImageRating(image.id, 5)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐⭐⭐⭐⭐ 5星</button>
                        <button @click.stop="updateImageRating(image.id, 4)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐⭐⭐⭐ 4星</button>
                        <button @click.stop="updateImageRating(image.id, 3)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐⭐⭐ 3星</button>
                        <button @click.stop="updateImageRating(image.id, 2)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐⭐ 2星</button>
                        <button @click.stop="updateImageRating(image.id, 1)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐ 1星</button>
                        <button @click.stop="updateImageRating(image.id, 0)" class="px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 whitespace-nowrap">✕ 清除</button>
                      </div>
                    </div>
                    <div v-if="image.note" class="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">
                      📝
                    </div>
                  </div>
                  
                  <!-- 悬停遮罩 -->
                  <div v-if="!imageSelectMode" class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center space-x-2">
                    <button
                      @click.stop="viewImage(image)"
                      class="p-2 bg-white/20 backdrop-blur rounded-lg hover:bg-white/30 transition-colors"
                      title="查看"
                    >
                      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                      </svg>
                    </button>
                    <button
                      @click.stop="startEditNote('image', image.id, image.note)"
                      class="p-2 bg-blue-500/80 backdrop-blur rounded-lg hover:bg-blue-600 transition-colors"
                      title="编辑备注"
                    >
                      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                      </svg>
                    </button>
                    <a
                      :href="image.url"
                      :download="image.note ? `${sanitizeFilename(image.note)}.png` : `image-${image.id}.png`"
                      class="p-2 bg-green-500/80 backdrop-blur rounded-lg hover:bg-green-600 transition-colors"
                      title="下载"
                      @click.stop
                    >
                      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                      </svg>
                    </a>
                    <button
                      @click.stop="deleteImage(image.id)"
                      class="p-2 bg-red-500/80 backdrop-blur rounded-lg hover:bg-red-600 transition-colors"
                      title="删除"
                    >
                      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                    </button>
                  </div>
                  
                  <!-- 信息标签 -->
                  <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <p v-if="image.note" class="text-xs text-amber-300 font-medium truncate mb-0.5">📝 {{ image.note }}</p>
                    <p class="text-xs text-white truncate">{{ image.prompt }}</p>
                  </div>
                </div>
              </div>
              
              <!-- 加载更多状态 -->
              <div v-if="imagesLoading" class="text-center py-8">
                <div class="inline-flex items-center space-x-2 text-primary-600 dark:text-primary-400">
                  <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span class="text-sm font-medium">加载中...</span>
                </div>
              </div>
              
              <!-- 没有更多数据 -->
              <div v-else-if="!imagesHasMore && recentImages.length > 0" class="text-center py-8">
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  🎉 已加载全部作品
                </p>
              </div>
              
              <!-- 滚动提示 -->
              <div v-else-if="imagesHasMore" class="text-center py-4">
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  向下滚动加载更多...
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 视频作品 Tab -->
        <div v-show="activeTab === 'videos'">
          <div class="card p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold gradient-text flex items-center">
                <span class="mr-2">🎬</span>
                我的视频作品
              </h3>
              <div class="text-sm text-slate-600 dark:text-slate-400">
                共 {{ videosTotal }} 个视频
              </div>
            </div>
            
            <!-- 重要提示：数据保留7天 -->
            <div class="mb-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
              <div class="flex items-start space-x-3">
                <div class="flex-shrink-0 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
                  <span class="text-xl">⚠️</span>
                </div>
                <div class="flex-1">
                  <h4 class="font-bold text-amber-900 dark:text-amber-300 mb-1">
                    重要提醒：视频仅保留7天
                  </h4>
                  <p class="text-sm text-amber-800 dark:text-amber-400 leading-relaxed">
                    为节省服务器存储空间，所有生成的视频将在创建后 <strong>7天自动删除</strong>。
                    请及时下载并保存您喜欢的视频到本地设备，以免丢失！
                  </p>
                  <div class="mt-2 flex items-center space-x-2 text-xs text-amber-700 dark:text-amber-500">
                    <span>💡</span>
                    <span>提示：点击视频可查看详情并下载</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 筛选工具栏 -->
            <div class="mb-4 p-4 bg-slate-50 dark:bg-dark-700 rounded-xl space-y-3">
              <div class="flex flex-wrap items-center gap-3">
                <!-- 星级筛选下拉 -->
                <select
                  v-model="videoFilter.rating"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
                    videoFilter.rating > 0 
                      ? 'bg-amber-500 text-white border-amber-500' 
                      : 'bg-white dark:bg-dark-600 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-500'
                  ]"
                >
                  <option :value="0">⭐ 全部星级</option>
                  <option :value="5">⭐⭐⭐⭐⭐ 5星</option>
                  <option :value="4">⭐⭐⭐⭐ 4星</option>
                  <option :value="3">⭐⭐⭐ 3星</option>
                  <option :value="2">⭐⭐ 2星</option>
                  <option :value="1">⭐ 1星</option>
                </select>
                
                <!-- 关键词搜索 -->
                <input
                  v-model="videoFilter.keyword"
                  type="text"
                  placeholder="🔍 搜索提示词/备注..."
                  class="px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300 w-48"
                  @keyup.enter="applyVideoFilter"
                />
                
                <!-- 日期筛选 -->
                <div class="flex items-center gap-2">
                  <input
                    v-model="videoFilter.dateFrom"
                    type="date"
                    class="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300"
                  />
                  <span class="text-slate-400">-</span>
                  <input
                    v-model="videoFilter.dateTo"
                    type="date"
                    class="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300"
                  />
                </div>
                
                <!-- 排序 -->
                <select
                  v-model="videoFilter.sortBy"
                  class="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300"
                >
                  <option value="date">按日期</option>
                  <option value="rating">按星标</option>
                </select>
                <button
                  @click="videoFilter.sortOrder = videoFilter.sortOrder === 'desc' ? 'asc' : 'desc'"
                  class="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-dark-600 border border-slate-200 dark:border-dark-500 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-500"
                >
                  {{ videoFilter.sortOrder === 'desc' ? '↓ 降序' : '↑ 升序' }}
                </button>
                
                <!-- 查询按钮 -->
                <button
                  @click="applyVideoFilter"
                  class="px-4 py-1.5 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-all flex items-center gap-1"
                >
                  🔍 查询
                </button>
                
                <!-- 重置按钮 -->
                <button
                  @click="resetVideoFilter"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 dark:bg-dark-500 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-dark-400 transition-all"
                >
                  重置
                </button>
                
                <!-- 分隔线 -->
                <div class="flex-1"></div>
                
                <!-- 批量操作 -->
                <button
                  @click="toggleVideoSelectMode"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1',
                    videoSelectMode 
                      ? 'bg-primary-500 text-white' 
                      : 'bg-white dark:bg-dark-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                  ]"
                >
                  ☑️ {{ videoSelectMode ? '取消选择' : '批量选择' }}
                </button>
              </div>
              
              <!-- 批量操作栏 -->
              <div v-if="videoSelectMode" class="flex items-center gap-3 pt-2 border-t border-slate-200 dark:border-dark-600">
                <button
                  @click="toggleAllVideos"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 dark:bg-dark-500 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-all"
                >
                  {{ selectedVideos.size === recentVideos.filter(v => v.video_url).length ? '取消全选' : '全选已完成' }}
                </button>
                <span class="text-sm text-slate-500 dark:text-slate-400">
                  已选择 {{ selectedVideos.size }} 项
                </span>
                <button
                  @click="batchDownloadVideos"
                  :disabled="selectedVideos.size === 0 || videoDownloading"
                  class="px-4 py-1.5 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <span v-if="videoDownloading">⏳ 下载中...</span>
                  <span v-else>⬇️ 批量下载</span>
                </button>
              </div>
            </div>
            
            <div v-if="recentVideos.length === 0 && !loading" class="text-center py-12">
              <div class="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-600 dark:to-dark-700 rounded-full flex items-center justify-center">
                <span class="text-3xl">🎬</span>
              </div>
              <p class="text-slate-500 dark:text-slate-400 mb-4">还没有生成视频</p>
              <button @click="$router.push('/video')" class="btn-primary px-6 py-2">
                开始创作
              </button>
            </div>
            
            <!-- 视频网格 + 无限滚动 -->
            <div 
              v-else
              class="max-h-[800px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-dark-600 scrollbar-track-transparent"
              @scroll="handleVideoScroll"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div
                  v-for="video in recentVideos"
                  :key="video.id"
                  :class="[
                    'group relative rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 bg-slate-50 dark:bg-dark-700',
                    videoSelectMode && selectedVideos.has(video.id) ? 'ring-4 ring-primary-500' : ''
                  ]"
                >
                  <!-- 视频预览 -->
                  <div class="aspect-video bg-black relative cursor-pointer" @click="videoSelectMode && video.video_url ? toggleVideoSelection(video.id) : viewVideo(video)">
                    <video
                      v-if="video.video_url"
                      :src="video.video_url"
                      class="w-full h-full object-cover"
                      muted
                      playsinline
                    ></video>
                    <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                      <div class="text-4xl mb-2">⏳</div>
                      <div class="text-sm">{{ formatVideoStatus(video.status) }}</div>
                      <div v-if="video.progress" class="text-xs mt-1 opacity-75">{{ video.progress }}</div>
                    </div>
                    
                    <!-- 选择复选框 -->
                    <div v-if="videoSelectMode && video.video_url" class="absolute top-2 left-2 z-10">
                      <div :class="[
                        'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                        selectedVideos.has(video.id) 
                          ? 'bg-primary-500 border-primary-500 text-white' 
                          : 'bg-white/80 border-slate-300'
                      ]">
                        <span v-if="selectedVideos.has(video.id)" class="text-xs">✓</span>
                      </div>
                    </div>
                    
                    <!-- 星标和备注标识 -->
                    <div class="absolute top-2 right-2 flex items-center gap-1">
                      <!-- 星级显示/编辑 -->
                      <div v-if="!videoSelectMode" class="relative group/rating">
                        <button
                          :class="[
                            'px-2 py-1 rounded-lg flex items-center gap-0.5 transition-all text-xs',
                            video.rating > 0 
                              ? 'bg-amber-500 text-white' 
                              : 'bg-black/30 text-white/70 hover:bg-amber-500 hover:text-white'
                          ]"
                        >
                          <span v-if="video.rating > 0">{{ '⭐'.repeat(video.rating) }}</span>
                          <span v-else>☆</span>
                        </button>
                        <!-- 星级选择弹出 -->
                        <div class="absolute right-0 top-full mt-1 hidden group-hover/rating:flex flex-col bg-white dark:bg-dark-700 rounded-lg shadow-xl border border-slate-200 dark:border-dark-600 overflow-hidden z-20">
                          <button @click.stop="updateVideoRating(video.id, 5)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐⭐⭐⭐⭐ 5星</button>
                          <button @click.stop="updateVideoRating(video.id, 4)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐⭐⭐⭐ 4星</button>
                          <button @click.stop="updateVideoRating(video.id, 3)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐⭐⭐ 3星</button>
                          <button @click.stop="updateVideoRating(video.id, 2)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐⭐ 2星</button>
                          <button @click.stop="updateVideoRating(video.id, 1)" class="px-3 py-1.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap">⭐ 1星</button>
                          <button @click.stop="updateVideoRating(video.id, 0)" class="px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 whitespace-nowrap">✕ 清除</button>
                        </div>
                      </div>
                      <div v-if="video.note" class="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">
                        📝
                      </div>
                    </div>
                    
                    <!-- 悬停播放图标 -->
                    <div v-if="!videoSelectMode" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div class="text-white text-5xl">▶️</div>
                    </div>
                    
                    <!-- 时长标签 -->
                    <div class="absolute bottom-2 right-2 px-2 py-1 rounded-md text-xs bg-black/70 text-white backdrop-blur-sm">
                      {{ video.duration }}s
                    </div>
                  </div>
                  
                  <!-- 视频信息 -->
                  <div class="p-4 space-y-2">
                    <!-- 备注显示 -->
                    <p v-if="video.note" class="text-xs text-amber-600 dark:text-amber-400 font-medium truncate">
                      📝 {{ video.note }}
                    </p>
                    
                    <p class="text-sm text-slate-900 dark:text-white line-clamp-2 font-medium">
                      {{ video.prompt }}
                    </p>
                    
                    <div class="flex items-center justify-between text-xs">
                      <span :class="videoStatusColor(video.status)" class="font-medium">
                        {{ formatVideoStatus(video.status) }}
                      </span>
                      <span class="text-slate-500 dark:text-slate-400">
                        {{ new Date(video.created_at).toLocaleDateString() }}
                      </span>
                    </div>
                    
                    <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span class="px-2 py-0.5 bg-slate-200 dark:bg-slate-600 rounded">{{ video.model }}</span>
                      <span class="px-2 py-0.5 bg-slate-200 dark:bg-slate-600 rounded">{{ video.aspect_ratio }}</span>
                    </div>
                    
                    <!-- 操作按钮 -->
                    <div class="flex items-center gap-2 pt-2">
                      <button
                        @click="viewVideo(video)"
                        class="flex-1 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded-lg transition-colors"
                      >
                        👁️ 预览
                      </button>
                      <button
                        @click="startEditNote('video', video.id, video.note)"
                        class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
                        title="编辑备注"
                      >
                        📝
                      </button>
                      <a
                        v-if="video.video_url"
                        :href="video.video_url"
                        :download="video.note ? `${sanitizeFilename(video.note)}.mp4` : `video-${video.id}.mp4`"
                        class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors text-center"
                        @click.stop
                      >
                        ⬇️ 下载
                      </a>
                      <button
                        v-else
                        disabled
                        class="flex-1 px-3 py-2 bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 text-xs rounded-lg cursor-not-allowed"
                      >
                        ⬇️ 下载
                      </button>
                      <button
                        @click="deleteVideo(video.id)"
                        class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-colors"
                        title="删除视频"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 加载更多状态 -->
              <div v-if="videosLoading" class="text-center py-8">
                <div class="inline-flex items-center space-x-2 text-primary-600 dark:text-primary-400">
                  <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span class="text-sm font-medium">加载中...</span>
                </div>
              </div>
              
              <!-- 没有更多数据 -->
              <div v-else-if="!videosHasMore && recentVideos.length > 0" class="text-center py-8">
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  🎉 已加载全部视频
                </p>
              </div>
              
              <!-- 滚动提示 -->
              <div v-else-if="videosHasMore" class="text-center py-4">
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  向下滚动加载更多...
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 积分详情 Tab -->
        <div v-show="activeTab === 'points'">
          <!-- 积分统计概览 -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <!-- 永久积分 -->
            <div class="card p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-2 border-blue-200 dark:border-blue-700">
              <div class="flex items-center justify-between mb-4">
                <h4 class="text-lg font-bold text-blue-900 dark:text-blue-100">💎 永久积分</h4>
              </div>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-blue-700 dark:text-blue-300">当前余额</span>
                  <span class="text-2xl font-bold text-blue-900 dark:text-blue-100">{{ me?.points || 0 }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-blue-700 dark:text-blue-300">累计获得</span>
                  <span class="text-lg font-semibold text-green-600 dark:text-green-400">+{{ pointsStats.permanent.earned }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-blue-700 dark:text-blue-300">累计消耗</span>
                  <span class="text-lg font-semibold text-red-600 dark:text-red-400">-{{ pointsStats.permanent.spent }}</span>
                </div>
              </div>
            </div>

            <!-- 套餐积分 -->
            <div class="card p-6 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-2 border-purple-200 dark:border-purple-700">
              <div class="flex items-center justify-between mb-4">
                <h4 class="text-lg font-bold text-purple-900 dark:text-purple-100">⚡ 套餐积分</h4>
              </div>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-purple-700 dark:text-purple-300">当前余额</span>
                  <span class="text-2xl font-bold text-purple-900 dark:text-purple-100">{{ me?.package_points || 0 }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-purple-700 dark:text-purple-300">累计获得</span>
                  <span class="text-lg font-semibold text-green-600 dark:text-green-400">+{{ pointsStats.package.earned }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-purple-700 dark:text-purple-300">累计消耗</span>
                  <span class="text-lg font-semibold text-red-600 dark:text-red-400">-{{ pointsStats.package.spent }}</span>
                </div>
                <div v-if="me?.package_points_expires_at && me.package_points_expires_at > Date.now()" class="pt-2 border-t border-purple-200 dark:border-purple-700">
                  <span class="text-xs text-purple-600 dark:text-purple-400">
                    过期时间: {{ new Date(me.package_points_expires_at).toLocaleString('zh-CN') }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 总计 -->
            <div class="card p-6 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-2 border-amber-200 dark:border-amber-700">
              <div class="flex items-center justify-between mb-4">
                <h4 class="text-lg font-bold text-amber-900 dark:text-amber-100">📊 总计</h4>
              </div>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-sm text-amber-700 dark:text-amber-300">可用总额</span>
                  <span class="text-2xl font-bold text-amber-900 dark:text-amber-100">{{ (me?.points || 0) + (me?.package_points || 0) }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-amber-700 dark:text-amber-300">累计获得</span>
                  <span class="text-lg font-semibold text-green-600 dark:text-green-400">+{{ pointsStats.permanent.earned + pointsStats.package.earned }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm text-amber-700 dark:text-amber-300">累计消耗</span>
                  <span class="text-lg font-semibold text-red-600 dark:text-red-400">-{{ pointsStats.permanent.spent + pointsStats.package.spent }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 积分流水和来源分析 -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- 积分流水 -->
            <div class="card p-6">
              <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold gradient-text flex items-center">
                  <span class="mr-2">📊</span>
                  积分流水
                </h3>
                <!-- 筛选按钮 -->
                <div class="flex space-x-2">
                  <button
                    @click="pointsStatsTab = 'all'"
                    :class="pointsStatsTab === 'all' ? 'bg-primary-500 text-white' : 'bg-slate-200 dark:bg-dark-600 text-slate-700 dark:text-slate-300'"
                    class="px-3 py-1 rounded-lg text-sm font-medium transition-colors"
                  >
                    全部
                  </button>
                  <button
                    @click="pointsStatsTab = 'permanent'"
                    :class="pointsStatsTab === 'permanent' ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-dark-600 text-slate-700 dark:text-slate-300'"
                    class="px-3 py-1 rounded-lg text-sm font-medium transition-colors"
                  >
                    永久
                  </button>
                  <button
                    @click="pointsStatsTab = 'package'"
                    :class="pointsStatsTab === 'package' ? 'bg-purple-500 text-white' : 'bg-slate-200 dark:bg-dark-600 text-slate-700 dark:text-slate-300'"
                    class="px-3 py-1 rounded-lg text-sm font-medium transition-colors"
                  >
                    套餐
                  </button>
                </div>
              </div>
              
              <div v-if="filteredLedger.length === 0" class="text-center py-12">
                <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-600 dark:to-dark-700 rounded-full flex items-center justify-center">
                  <span class="text-2xl">📈</span>
                </div>
                <p class="text-slate-500 dark:text-slate-400">暂无积分流水记录</p>
              </div>
              
              <div v-else class="space-y-3 max-h-[600px] overflow-y-auto">
                <div
                  v-for="(item, index) in filteredLedger"
                  :key="index"
                  class="flex items-center justify-between p-4 bg-slate-50 dark:bg-dark-600/30 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-600/50 transition-colors"
                >
                  <div class="flex items-center space-x-4">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="getTransactionIcon(item.type).bg">
                      <span class="text-lg">{{ getTransactionIcon(item.type).icon }}</span>
                    </div>
                    <div>
                      <div class="flex items-center space-x-2">
                        <p class="font-medium text-slate-900 dark:text-slate-100">
                          {{ getTransactionTypeText(item.type) }}
                        </p>
                        <span 
                          :class="(item.points_type === 'package') ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'"
                          class="px-2 py-0.5 rounded text-xs font-medium"
                        >
                          {{ (item.points_type === 'package') ? '套餐' : '永久' }}
                        </span>
                      </div>
                      <p class="text-sm text-slate-500 dark:text-slate-400">
                        {{ new Date(item.ts).toLocaleString() }}
                      </p>
                      <p v-if="item.memo" class="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        {{ item.memo }}
                      </p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p
                      class="font-bold text-lg"
                      :class="item.value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                    >
                      {{ item.value > 0 ? '+' : '' }}{{ item.value }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- 积分来源统计 -->
            <div class="card p-6">
              <h3 class="text-xl font-bold gradient-text mb-6 flex items-center">
                <span class="mr-2">📈</span>
                积分来源分析
              </h3>
              
              <div v-if="pointsSources.length === 0" class="text-center py-12">
                <p class="text-slate-500 dark:text-slate-400">暂无数据</p>
              </div>
              
              <div v-else class="space-y-4">
                <div
                  v-for="source in pointsSources"
                  :key="source.type"
                  class="space-y-2"
                >
                  <div class="flex items-center justify-between text-sm">
                    <span class="font-medium text-slate-700 dark:text-slate-300">
                      {{ getTransactionTypeText(source.type) }}
                    </span>
                    <span class="font-bold text-primary-600 dark:text-primary-400">
                      +{{ source.total }} 积分
                    </span>
                  </div>
                  <div class="w-full bg-slate-200 dark:bg-dark-600 rounded-full h-2 overflow-hidden">
                    <div
                      class="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500"
                      :style="{ width: `${(source.total / pointsSources[0].total) * 100}%` }"
                    ></div>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    共 {{ source.count }} 次
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 账单中心 Tab -->
        <div v-show="activeTab === 'bills'">
          <div class="card p-6">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-xl font-bold gradient-text flex items-center">
                <span class="mr-2">📋</span>
                充值订单记录
              </h3>
              <button
                @click="openRechargeModal"
                class="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all duration-300 shadow-md hover:shadow-lg"
              >
                💳 立即充值
              </button>
            </div>
            
            <!-- 加载状态 -->
            <div v-if="billLoading" class="text-center py-12">
              <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p class="mt-4 text-slate-500 dark:text-slate-400">加载中...</p>
            </div>
            
            <!-- 空状态 -->
            <div v-else-if="billOrders.length === 0" class="text-center py-12">
              <div class="w-20 h-20 mx-auto mb-4 bg-slate-100 dark:bg-dark-600 rounded-full flex items-center justify-center">
                <span class="text-3xl">📋</span>
              </div>
              <p class="text-slate-500 dark:text-slate-400 mb-4">暂无充值记录</p>
              <button @click="openRechargeModal" class="btn-primary px-6 py-2">
                💳 立即充值
              </button>
            </div>
            
            <!-- 订单列表 -->
            <div v-else class="space-y-4">
              <div
                v-for="order in billOrders"
                :key="order.order_no"
                class="bg-slate-50 dark:bg-dark-600/30 rounded-xl p-4 hover:bg-slate-100 dark:hover:bg-dark-600/50 transition-colors"
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="order.status === 'paid' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30'">
                      <span class="text-lg">{{ order.status === 'paid' ? '✅' : '⏳' }}</span>
                    </div>
                    <div>
                      <p class="font-medium text-slate-900 dark:text-slate-100">{{ order.product_name }}</p>
                      <p class="text-xs text-slate-500 dark:text-slate-400">{{ order.order_no }}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-lg font-bold" :class="order.status === 'paid' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">
                      ¥{{ (order.amount / 100).toFixed(2) }}
                    </p>
                    <span class="text-xs px-2 py-1 rounded-full" :class="getOrderStatusColor(order.status)">
                      {{ formatOrderStatus(order.status) }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>创建时间：{{ new Date(order.created_at).toLocaleString() }}</span>
                  <span v-if="order.paid_at">支付时间：{{ new Date(order.paid_at).toLocaleString() }}</span>
                </div>
              </div>
            </div>
            
            <!-- 分页提示 -->
            <div v-if="billOrders.length > 0" class="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              共 {{ billTotal }} 条记录
            </div>
          </div>
        </div>

        <!-- 邀请中心 Tab -->
        <div v-show="activeTab === 'invite'">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- 邀请码管理 -->
            <div class="card p-6">
              <h3 class="text-xl font-bold gradient-text mb-6 flex items-center">
                <span class="mr-2">🎁</span>
                我的邀请码
              </h3>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    邀请码
                  </label>
                  <div class="flex space-x-2">
                    <input
                      :value="invite.invite_code"
                      readonly
                      class="input flex-1 font-mono text-lg font-bold text-center"
                    />
                    <button
                      @click="copyInvite"
                      class="btn-primary px-6"
                    >
                      📋 复制链接
                    </button>
                  </div>
                </div>

                <div class="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-2">💡 邀请奖励规则</h4>
                  <ul class="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <li>• 好友使用你的邀请码注册</li>
                    <li>• 你和好友都可获得积分奖励</li>
                    <li>• 邀请越多，奖励越多</li>
                  </ul>
                </div>

                <!-- 邀请统计 -->
                <div class="pt-4 border-t border-slate-200 dark:border-dark-600">
                  <div class="flex items-center justify-between p-4 bg-gradient-to-r from-green-500 to-green-600 rounded-xl text-white">
                    <div>
                      <p class="text-sm opacity-90">成功邀请</p>
                      <p class="text-3xl font-bold">{{ inviteProgress.invite_count || 0 }} 人</p>
                    </div>
                    <div class="text-4xl">🎉</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 邀请排行榜或快速分享 -->
            <div class="card p-6">
              <h3 class="text-xl font-bold gradient-text mb-6 flex items-center">
                <span class="mr-2">🚀</span>
                快速分享
              </h3>
              
              <div class="space-y-4">
                <p class="text-sm text-slate-600 dark:text-slate-400">
                  分享到社交平台，让更多朋友加入！
                </p>
                
                <div class="grid grid-cols-2 gap-3">
                  <button class="p-4 border-2 border-slate-200 dark:border-dark-600 rounded-xl hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all duration-200">
                    <div class="text-3xl mb-2">💬</div>
                    <div class="text-sm font-medium text-slate-700 dark:text-slate-300">微信</div>
                  </button>
                  <button class="p-4 border-2 border-slate-200 dark:border-dark-600 rounded-xl hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all duration-200">
                    <div class="text-3xl mb-2">📱</div>
                    <div class="text-sm font-medium text-slate-700 dark:text-slate-300">QQ</div>
                  </button>
                  <button class="p-4 border-2 border-slate-200 dark:border-dark-600 rounded-xl hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all duration-200">
                    <div class="text-3xl mb-2">🐦</div>
                    <div class="text-sm font-medium text-slate-700 dark:text-slate-300">微博</div>
                  </button>
                  <button @click="copyInvite" class="p-4 border-2 border-slate-200 dark:border-dark-600 rounded-xl hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all duration-200">
                    <div class="text-3xl mb-2">🔗</div>
                    <div class="text-sm font-medium text-slate-700 dark:text-slate-300">复制链接</div>
                  </button>
                </div>
                
                <!-- 邀请进度奖励 -->
                <div class="mt-6 p-4 bg-gradient-to-br from-purple-50 via-pink-50 to-amber-50 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-amber-900/20 rounded-xl border border-purple-200/50 dark:border-purple-700/30">
                  <div class="flex items-center justify-between mb-3">
                    <span class="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center">
                      <span class="mr-1.5">🎁</span>
                      邀请进度奖励
                    </span>
                    <span class="text-xs text-purple-600 dark:text-purple-400 font-semibold">
                      {{ inviteProgress.milestones?.filter(m => m.claimed).length || 0 }}/{{ inviteProgress.milestones?.length || 0 }} 已领取
                    </span>
                  </div>
                  <div class="flex items-center gap-2 mb-3">
                    <div 
                      v-for="milestone in inviteProgress.milestones?.slice(0, 3)" 
                      :key="milestone.milestone"
                      class="flex-1 text-center p-2.5 rounded-lg transition-all shadow-sm"
                      :class="[
                        milestone.claimed 
                          ? 'bg-green-500 text-white' 
                          : milestone.reachable 
                            ? 'bg-amber-500 text-white animate-pulse' 
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      ]"
                    >
                      <div class="text-xs font-bold">{{ milestone.milestone }}人</div>
                      <div class="text-[10px] opacity-80 mt-0.5">+{{ milestone.points }}积分</div>
                    </div>
                  </div>
                  <p class="text-[10px] text-center text-slate-600 dark:text-slate-400 bg-white/50 dark:bg-slate-800/50 rounded-md py-1.5 px-2">
                    💡 {{ inviteProgress.invite_count < (inviteProgress.milestones?.[0]?.milestone || 3) 
                      ? `再邀请 ${(inviteProgress.milestones?.[0]?.milestone || 3) - inviteProgress.invite_count} 人即可获得 ${inviteProgress.milestones?.[0]?.points || 30} 积分` 
                      : '达标自动发放奖励' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 未登录状态 -->
    <div v-else class="text-center py-16">
      <div class="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-600 dark:to-dark-700 rounded-full flex items-center justify-center">
        <span class="text-4xl">🔒</span>
      </div>
      <h3 class="text-2xl font-semibold text-slate-700 dark:text-slate-300 mb-4">
        请先登录
      </h3>
      <p class="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">
        登录后即可查看您的积分、邀请码和积分流水记录
      </p>
      <button
        @click="$router.push('/auth')"
        class="btn-primary px-8 py-3 text-lg"
      >
        👉 立即登录
      </button>
    </div>

    <!-- 设置模态框 -->
    <div v-if="showSettingsModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showSettingsModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <!-- 模态框头部 -->
        <div class="sticky top-0 bg-white dark:bg-dark-700 border-b border-slate-200 dark:border-dark-600 px-6 py-4 flex items-center justify-between">
          <h2 class="text-2xl font-bold text-slate-900 dark:text-slate-100">⚙️ 账户设置</h2>
          <button @click="showSettingsModal = false" class="p-2 hover:bg-slate-100 dark:hover:bg-dark-600 rounded-lg transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- 设置标签页 -->
        <div class="border-b border-slate-200 dark:border-dark-600 px-6">
          <div class="flex space-x-4">
            <button
              @click="settingsTab = 'profile'"
              :class="['py-3 px-4 font-medium transition-colors', settingsTab === 'profile' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-slate-600 dark:text-slate-400']"
            >
              👤 个人资料
            </button>
            <button
              @click="settingsTab = 'password'"
              :class="['py-3 px-4 font-medium transition-colors', settingsTab === 'password' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-slate-600 dark:text-slate-400']"
            >
              🔒 修改密码
            </button>
            <button
              @click="settingsTab = 'theme'"
              :class="['py-3 px-4 font-medium transition-colors', settingsTab === 'theme' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-slate-600 dark:text-slate-400']"
            >
              🎨 主题设置
            </button>
          </div>
        </div>

        <!-- 设置内容 -->
        <div class="p-6">
          <!-- 个人资料 -->
          <div v-if="settingsTab === 'profile'" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                用户名
              </label>
              <input
                v-model="profileForm.username"
                type="text"
                class="input w-full"
                placeholder="请输入用户名"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                邮箱
              </label>
              <input
                v-model="profileForm.email"
                type="email"
                class="input w-full"
                placeholder="请输入邮箱（可选）"
              />
            </div>
            <button
              @click="saveProfile"
              :disabled="saveLoading"
              class="btn-primary w-full py-3"
            >
              {{ saveLoading ? '保存中...' : '💾 保存修改' }}
            </button>
          </div>

          <!-- 修改密码 -->
          <div v-if="settingsTab === 'password'" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                原密码
              </label>
              <input
                v-model="passwordForm.oldPassword"
                type="password"
                class="input w-full"
                placeholder="请输入原密码"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                新密码
              </label>
              <input
                v-model="passwordForm.newPassword"
                type="password"
                class="input w-full"
                placeholder="请输入新密码（至少6位）"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                确认新密码
              </label>
              <input
                v-model="passwordForm.confirmPassword"
                type="password"
                class="input w-full"
                placeholder="请再次输入新密码"
              />
            </div>
            <button
              @click="changePassword"
              :disabled="saveLoading"
              class="btn-primary w-full py-3"
            >
              {{ saveLoading ? '修改中...' : '🔐 修改密码' }}
            </button>
          </div>

          <!-- 主题设置 -->
          <div v-if="settingsTab === 'theme'" class="space-y-4">
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
              选择您喜欢的界面主题
            </p>
            
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
              <!-- 浅色主题 -->
              <button
                @click="setThemeDirect('light')"
                :class="['p-6 border-2 rounded-xl transition-all duration-200 hover:scale-105', currentTheme === 'light' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300' : 'border-slate-200 dark:border-dark-600 hover:border-blue-300 dark:hover:border-blue-700']"
              >
                <div class="w-16 h-16 mx-auto mb-3 bg-white rounded-lg shadow-md flex items-center justify-center">
                  <span class="text-3xl">☀️</span>
                </div>
                <p class="font-medium text-slate-900 dark:text-slate-100">浅色模式</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">适合白天使用</p>
                <div v-if="currentTheme === 'light'" class="mt-2 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                  ✓ 当前使用
                </div>
              </button>

              <!-- 深色主题 -->
              <button
                @click="setThemeDirect('dark')"
                :class="['p-6 border-2 rounded-xl transition-all duration-200 hover:scale-105', currentTheme === 'dark' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-300' : 'border-slate-200 dark:border-dark-600 hover:border-indigo-300 dark:hover:border-indigo-700']"
              >
                <div class="w-16 h-16 mx-auto mb-3 bg-slate-800 rounded-lg shadow-md flex items-center justify-center">
                  <span class="text-3xl">🌙</span>
                </div>
                <p class="font-medium text-slate-900 dark:text-slate-100">深色模式</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">适合夜晚使用</p>
                <div v-if="currentTheme === 'dark'" class="mt-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                  ✓ 当前使用
                </div>
              </button>

              <!-- 奶油绿主题 -->
              <button
                @click="setThemeDirect('creamGreen')"
                :class="['p-6 border-2 rounded-xl transition-all duration-200 hover:scale-105', currentTheme === 'creamGreen' ? 'border-green-500 bg-green-50 dark:bg-green-900/20 ring-2 ring-green-300' : 'border-slate-200 dark:border-dark-600 hover:border-green-300 dark:hover:border-green-700']"
              >
                <div class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg shadow-md flex items-center justify-center border border-green-200">
                  <span class="text-3xl">🍃</span>
                </div>
                <p class="font-medium text-slate-900 dark:text-slate-100">奶油绿</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">清新自然，舒缓双眼</p>
                <div v-if="currentTheme === 'creamGreen'" class="mt-2 text-green-600 dark:text-green-400 text-xs font-semibold">
                  ✓ 当前使用
                </div>
              </button>

              <!-- 热情橙主题 -->
              <button
                @click="setThemeDirect('warmOrange')"
                :class="['p-6 border-2 rounded-xl transition-all duration-200 hover:scale-105', currentTheme === 'warmOrange' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 ring-2 ring-orange-300' : 'border-slate-200 dark:border-dark-600 hover:border-orange-300 dark:hover:border-orange-700']"
              >
                <div class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-orange-50 to-red-100 rounded-lg shadow-md flex items-center justify-center border border-orange-200">
                  <span class="text-3xl">🔥</span>
                </div>
                <p class="font-medium text-slate-900 dark:text-slate-100">热情橙</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">活力四射，激发创造力</p>
                <div v-if="currentTheme === 'warmOrange'" class="mt-2 text-orange-600 dark:text-orange-400 text-xs font-semibold">
                  ✓ 当前使用
                </div>
              </button>

              <!-- 浩瀚蓝主题 -->
              <button
                @click="setThemeDirect('oceanBlue')"
                :class="['p-6 border-2 rounded-xl transition-all duration-200 hover:scale-105', currentTheme === 'oceanBlue' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 ring-2 ring-sky-300' : 'border-slate-200 dark:border-dark-600 hover:border-sky-300 dark:hover:border-sky-700']"
              >
                <div class="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-sky-600 to-blue-800 rounded-lg shadow-md flex items-center justify-center">
                  <span class="text-3xl">🌊</span>
                </div>
                <p class="font-medium text-slate-900 dark:text-slate-100">浩瀚蓝</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">深邃宁静，沉浸体验</p>
                <div v-if="currentTheme === 'oceanBlue'" class="mt-2 text-sky-600 dark:text-sky-400 text-xs font-semibold">
                  ✓ 当前使用
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 兑换券模态框 -->
    <div v-if="showVoucherModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeVoucherModal">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">🎫 兑换券</h3>
            <button @click="closeVoucherModal" class="text-slate-400 hover:text-slate-600 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              兑换码
            </label>
            <input 
              v-model="voucherCode"
              type="text"
              class="input w-full uppercase"
              placeholder="请输入13位兑换码"
              maxlength="13"
              :disabled="voucherLoading"
            />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              兑换码为13位大写字母和数字组合
            </p>
          </div>
          
          <div v-if="voucherError" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-600 dark:text-red-400">{{ voucherError }}</p>
          </div>
          
          <div v-if="voucherSuccess" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p class="text-sm text-green-600 dark:text-green-400">{{ voucherSuccess }}</p>
          </div>
        </div>
        
        <div v-if="me" class="p-3 bg-slate-50 dark:bg-dark-600 rounded-lg mx-6 mb-6">
          <p class="text-sm text-slate-600 dark:text-slate-400">
            当前积分：<span class="font-semibold text-amber-600 dark:text-amber-400">{{ me.points }}</span>
          </p>
        </div>
        
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex justify-between items-center">
          <!-- 外部链接按钮 - 左下角 -->
          <div v-if="externalLinkConfig.enabled && externalLinkConfig.url">
            <a 
              :href="externalLinkConfig.url"
              :target="externalLinkConfig.open_in_new_tab ? '_blank' : '_self'"
              :rel="externalLinkConfig.open_in_new_tab ? 'noopener noreferrer' : ''"
              class="inline-flex items-center px-3 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200"
            >
              <span class="mr-1.5">🔗</span>
              <span>{{ externalLinkConfig.button_text || '获取兑换券' }}</span>
              <svg v-if="externalLinkConfig.open_in_new_tab" class="w-3.5 h-3.5 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
          </div>
          
          <!-- 操作按钮 - 右侧 -->
          <div class="flex space-x-3">
            <button 
              @click="closeVoucherModal"
              class="btn-secondary"
              :disabled="voucherLoading"
            >
              取消
            </button>
            <button 
              @click="submitVoucher"
              class="btn-primary"
              :disabled="voucherLoading || !voucherCode.trim()"
            >
              <span v-if="voucherLoading">兑换中...</span>
              <span v-else>立即兑换</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 余额划转模态框 -->
    <div v-if="showTransferModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeTransferModal">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text flex items-center">
              <span class="mr-2">💰</span>
              余额划转到积分
            </h3>
            <button @click="closeTransferModal" class="text-slate-400 hover:text-slate-600 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-4">
          <!-- 余额显示 -->
          <div class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-600 dark:text-slate-400">当前余额</span>
              <span class="text-2xl font-bold text-green-600 dark:text-green-400">¥{{ (me.balance / 100).toFixed(2) }}</span>
            </div>
          </div>
          
          <!-- 汇率提示 -->
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div class="flex items-center">
              <span class="text-2xl mr-2">💎</span>
              <div>
                <p class="text-sm font-semibold text-blue-900 dark:text-blue-300">兑换汇率</p>
                <p class="text-xs text-blue-700 dark:text-blue-400">1元 = {{ exchangeRate }} 积分</p>
              </div>
            </div>
          </div>
          
          <!-- 输入金额 -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              划转金额（元）
            </label>
            <input 
              v-model="transferForm.amount"
              type="number"
              min="1"
              step="0.01"
              class="input w-full text-lg"
              placeholder="请输入划转金额"
              :disabled="transferLoading"
            />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              最低划转金额为1元
            </p>
          </div>
          
          <!-- 预计获得积分 -->
          <div v-if="calculatedPoints > 0" class="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-purple-700 dark:text-purple-300">预计获得</span>
              <div class="flex items-center space-x-2">
                <span class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ calculatedPoints }}</span>
                <span class="text-sm text-purple-700 dark:text-purple-300">积分</span>
              </div>
            </div>
          </div>
          
          <!-- 错误提示 -->
          <div v-if="transferError" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-600 dark:text-red-400">{{ transferError }}</p>
          </div>
          
          <!-- 成功提示 -->
          <div v-if="transferSuccess" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p class="text-sm text-green-600 dark:text-green-400">{{ transferSuccess }}</p>
          </div>
          
          <!-- 说明 -->
          <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <div class="flex items-start">
              <span class="text-lg mr-2">💡</span>
              <div class="text-xs text-amber-800 dark:text-amber-400">
                <p class="font-semibold mb-1">温馨提示：</p>
                <ul class="space-y-1 list-disc list-inside">
                  <li>划转后的积分为永久积分，永不过期</li>
                  <li>划转操作不可撤销，请谨慎操作</li>
                  <li>划转将立即生效，余额和积分会实时更新</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex space-x-3">
          <button 
            @click="closeTransferModal"
            class="flex-1 btn-secondary"
            :disabled="transferLoading"
          >
            取消
          </button>
          <button 
            @click="submitTransfer"
            class="flex-1 btn-primary"
            :disabled="transferLoading || !transferForm.amount || parseFloat(transferForm.amount) <= 0"
          >
            <span v-if="transferLoading">划转中...</span>
            <span v-else>💎 确认划转</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 充值模态框 -->
    <div v-if="showRechargeModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="closeRechargeModal">
      <div class="bg-white dark:bg-dark-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <!-- 头部 -->
        <div class="p-6 border-b border-slate-200 dark:border-dark-600 bg-gradient-to-r from-amber-500 to-orange-500">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <span class="text-3xl">💳</span>
              <div>
                <h3 class="text-xl font-bold text-white">账户充值</h3>
                <p class="text-sm text-white/80">快速充值到账户余额</p>
              </div>
            </div>
            <button @click="closeRechargeModal" class="text-white/80 hover:text-white transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-6">
          <!-- 快捷金额选项 -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              选择充值金额
            </label>
            <div class="grid grid-cols-3 gap-3">
              <button
                v-for="amount in quickAmounts"
                :key="amount"
                @click="selectQuickAmount(amount)"
                :class="[
                  'py-3 px-4 rounded-xl font-medium text-center transition-all duration-200 border-2',
                  rechargeAmount === amount
                    ? 'bg-amber-500 text-white border-amber-500 shadow-lg scale-105'
                    : 'bg-white dark:bg-dark-600 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-dark-500 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                ]"
              >
                ¥{{ amount / 100 }}
              </button>
            </div>
          </div>
          
          <!-- 自定义金额 -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              或输入自定义金额（1-1500元）
            </label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-lg">¥</span>
              <input
                v-model="rechargeCustomAmount"
                type="number"
                min="1"
                max="1500"
                step="0.01"
                class="input w-full pl-10 text-lg"
                placeholder="输入金额"
                @input="rechargeAmount = ''"
              />
            </div>
          </div>
          
          <!-- 支付方式 -->
          <div v-if="paymentMethods.length > 0">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              选择支付方式
            </label>
            <div class="space-y-2">
              <label
                v-for="method in paymentMethods"
                :key="method.id"
                :class="[
                  'flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all duration-200',
                  rechargeSelectedMethod === method.id
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-slate-200 dark:border-dark-500 hover:border-amber-400'
                ]"
              >
                <div class="flex items-center space-x-3">
                  <input
                    type="radio"
                    :value="method.id"
                    v-model="rechargeSelectedMethod"
                    class="w-4 h-4 text-amber-500"
                  />
                  <span class="font-medium text-slate-700 dark:text-slate-300">{{ method.name }}</span>
                </div>
                <span class="text-sm text-slate-500 dark:text-slate-400">{{ method.module }}</span>
              </label>
            </div>
          </div>
          
          <!-- 充值金额预览 -->
          <div v-if="getFinalRechargeAmount() > 0" class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-green-700 dark:text-green-300">充值金额</span>
              <span class="text-2xl font-bold text-green-600 dark:text-green-400">
                ¥{{ (getFinalRechargeAmount() / 100).toFixed(2) }}
              </span>
            </div>
          </div>
          
          <!-- 错误提示 -->
          <div v-if="rechargeError" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-600 dark:text-red-400">{{ rechargeError }}</p>
          </div>
          
          <!-- 提示说明 -->
          <div class="bg-slate-50 dark:bg-dark-600/50 rounded-xl p-4">
            <div class="flex items-start space-x-2">
              <span class="text-lg">💡</span>
              <div class="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p>• 充值后金额将直接到账户余额</p>
                <p>• 账户余额可用于购买套餐或划转为积分</p>
                <p>• 最低充值1元，单笔最高1500元</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex space-x-3">
          <button 
            @click="closeRechargeModal"
            class="flex-1 btn-secondary"
            :disabled="rechargeLoading"
          >
            取消
          </button>
          <button 
            @click="submitRecharge"
            class="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="rechargeLoading || getFinalRechargeAmount() < 100 || !rechargeSelectedMethod"
          >
            <span v-if="rechargeLoading">处理中...</span>
            <span v-else>💳 立即支付</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 图片查看模态框 -->
    <div v-if="showImageModal && selectedImage" class="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showImageModal = false">
      <div class="max-w-5xl w-full">
        <div class="relative">
          <img :src="selectedImage.url" :alt="selectedImage.prompt" class="w-full h-auto rounded-xl shadow-2xl" />
          <div class="absolute top-4 right-4 flex space-x-2">
            <!-- 星级选择器 -->
            <div class="relative group/modalrating">
              <button
                :class="[
                  'p-3 backdrop-blur rounded-lg transition-colors flex items-center gap-1',
                  selectedImage.rating > 0 
                    ? 'bg-amber-500 text-white' 
                    : 'bg-white/20 hover:bg-amber-500'
                ]"
                title="评分"
              >
                <span v-if="selectedImage.rating > 0" class="text-sm">{{ '⭐'.repeat(selectedImage.rating) }}</span>
                <span v-else class="text-xl">☆</span>
              </button>
              <!-- 星级选择弹出 -->
              <div class="absolute right-0 top-full mt-1 hidden group-hover/modalrating:flex flex-col bg-white dark:bg-dark-700 rounded-lg shadow-xl border border-slate-200 dark:border-dark-600 overflow-hidden z-20">
                <button @click.stop="updateImageRating(selectedImage.id, 5)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐⭐⭐⭐⭐ 5星</button>
                <button @click.stop="updateImageRating(selectedImage.id, 4)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐⭐⭐⭐ 4星</button>
                <button @click.stop="updateImageRating(selectedImage.id, 3)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐⭐⭐ 3星</button>
                <button @click.stop="updateImageRating(selectedImage.id, 2)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐⭐ 2星</button>
                <button @click.stop="updateImageRating(selectedImage.id, 1)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐ 1星</button>
                <button @click.stop="updateImageRating(selectedImage.id, 0)" class="px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 whitespace-nowrap">✕ 清除评分</button>
              </div>
            </div>
            <button
              @click.stop="startEditNote('image', selectedImage.id, selectedImage.note)"
              class="p-3 bg-blue-500/80 backdrop-blur rounded-lg hover:bg-blue-600 transition-colors"
              title="编辑备注"
            >
              <span class="text-xl">📝</span>
            </button>
            <a
              :href="selectedImage.url"
              :download="selectedImage.note ? `${sanitizeFilename(selectedImage.note)}.png` : `${selectedImage.model}-${selectedImage.id}.png`"
              class="p-3 bg-green-500/80 backdrop-blur rounded-lg hover:bg-green-600 transition-colors"
              title="下载图片"
              @click.stop
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            </a>
            <button
              @click="showImageModal = false"
              class="p-3 bg-white/10 backdrop-blur rounded-lg hover:bg-white/20 transition-colors"
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="mt-4 bg-white/10 backdrop-blur rounded-xl p-4">
          <!-- 备注显示 -->
          <div v-if="selectedImage.note" class="mb-3 p-2 bg-amber-500/20 rounded-lg">
            <p class="text-amber-300 text-sm font-medium flex items-center">
              <span class="mr-2">📝</span>
              {{ selectedImage.note }}
            </p>
          </div>
          
          <p class="text-white font-medium mb-2">{{ selectedImage.prompt }}</p>
          <div class="flex items-center justify-between text-sm text-white/70">
            <span>{{ selectedImage.model }} · {{ selectedImage.aspectRatio }} · {{ selectedImage.imageSize || 'N/A' }}</span>
            <span>{{ new Date(selectedImage.createdAt).toLocaleString() }}</span>
          </div>
          <div class="flex items-center space-x-2 mt-2">
            <span v-if="selectedImage.rating > 0" class="text-sm font-medium px-2 py-1 bg-amber-500/20 text-amber-300 rounded">
              {{ '⭐'.repeat(selectedImage.rating) }} {{ selectedImage.rating }}星
            </span>
          </div>
          <div class="mt-3 pt-3 border-t border-white/20">
            <p class="text-xs text-amber-300 flex items-center">
              <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
              </svg>
              图片将在7天后自动删除，请尽快保存到本地
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 视频查看模态框 -->
    <div v-if="showVideoModal && selectedVideo" class="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="closeVideoModal">
      <div class="max-w-5xl w-full">
        <div class="relative">
          <div class="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
            <video
              v-if="selectedVideo.video_url"
              :src="selectedVideo.video_url"
              controls
              autoplay
              class="w-full h-full object-contain"
            ></video>
            <div v-else class="w-full h-full flex flex-col items-center justify-center text-white">
              <div class="text-6xl mb-4">⏳</div>
              <div class="text-xl">{{ formatVideoStatus(selectedVideo.status) }}</div>
              <div v-if="selectedVideo.progress" class="text-sm mt-2 opacity-75">{{ selectedVideo.progress }}</div>
            </div>
          </div>
          <div class="absolute top-4 right-4 flex space-x-2">
            <!-- 星级选择器 -->
            <div class="relative group/modalrating">
              <button
                :class="[
                  'p-3 backdrop-blur rounded-lg transition-colors flex items-center gap-1',
                  selectedVideo.rating > 0 
                    ? 'bg-amber-500 text-white' 
                    : 'bg-white/20 hover:bg-amber-500'
                ]"
                title="评分"
              >
                <span v-if="selectedVideo.rating > 0" class="text-sm">{{ '⭐'.repeat(selectedVideo.rating) }}</span>
                <span v-else class="text-xl">☆</span>
              </button>
              <!-- 星级选择弹出 -->
              <div class="absolute right-0 top-full mt-1 hidden group-hover/modalrating:flex flex-col bg-white dark:bg-dark-700 rounded-lg shadow-xl border border-slate-200 dark:border-dark-600 overflow-hidden z-20">
                <button @click.stop="updateVideoRating(selectedVideo.id, 5)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐⭐⭐⭐⭐ 5星</button>
                <button @click.stop="updateVideoRating(selectedVideo.id, 4)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐⭐⭐⭐ 4星</button>
                <button @click.stop="updateVideoRating(selectedVideo.id, 3)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐⭐⭐ 3星</button>
                <button @click.stop="updateVideoRating(selectedVideo.id, 2)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐⭐ 2星</button>
                <button @click.stop="updateVideoRating(selectedVideo.id, 1)" class="px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 whitespace-nowrap text-slate-700 dark:text-slate-300">⭐ 1星</button>
                <button @click.stop="updateVideoRating(selectedVideo.id, 0)" class="px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 whitespace-nowrap">✕ 清除评分</button>
              </div>
            </div>
            <button
              @click.stop="startEditNote('video', selectedVideo.id, selectedVideo.note)"
              class="p-3 bg-blue-500/80 backdrop-blur rounded-lg hover:bg-blue-600 transition-colors"
              title="编辑备注"
            >
              <span class="text-xl">📝</span>
            </button>
            <a
              v-if="selectedVideo.video_url"
              :href="selectedVideo.video_url"
              :download="selectedVideo.note ? `${sanitizeFilename(selectedVideo.note)}.mp4` : `${selectedVideo.model}-${selectedVideo.id}.mp4`"
              class="p-3 bg-green-500/80 backdrop-blur rounded-lg hover:bg-green-600 transition-colors"
              title="下载视频"
              @click.stop
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            </a>
            <button
              @click="closeVideoModal"
              class="p-3 bg-white/10 backdrop-blur rounded-lg hover:bg-white/20 transition-colors"
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="mt-4 bg-white/10 backdrop-blur rounded-xl p-4">
          <!-- 备注显示 -->
          <div v-if="selectedVideo.note" class="mb-3 p-2 bg-amber-500/20 rounded-lg">
            <p class="text-amber-300 text-sm font-medium flex items-center">
              <span class="mr-2">📝</span>
              {{ selectedVideo.note }}
            </p>
          </div>
          
          <p class="text-white font-medium mb-2">{{ selectedVideo.prompt }}</p>
          <div class="flex items-center justify-between text-sm text-white/70">
            <span>{{ selectedVideo.model }} · {{ selectedVideo.aspect_ratio }} · {{ selectedVideo.duration }}s</span>
            <span>{{ new Date(selectedVideo.created_at).toLocaleString() }}</span>
          </div>
          <div class="flex items-center space-x-2 mt-2">
            <span :class="videoStatusColor(selectedVideo.status)" class="text-sm font-medium px-2 py-1 bg-white/10 rounded">
              {{ formatVideoStatus(selectedVideo.status) }}
            </span>
            <span v-if="selectedVideo.rating > 0" class="text-sm font-medium px-2 py-1 bg-amber-500/20 text-amber-300 rounded">
              {{ '⭐'.repeat(selectedVideo.rating) }} {{ selectedVideo.rating }}星
            </span>
            <span v-if="selectedVideo.points_cost" class="text-sm text-white/70">
              消耗 {{ selectedVideo.points_cost }} 积分
            </span>
          </div>
          <div v-if="selectedVideo.fail_reason" class="mt-2 p-2 bg-red-500/20 rounded text-sm text-red-300">
            {{ selectedVideo.fail_reason }}
          </div>
          <div class="mt-3 pt-3 border-t border-white/20">
            <p class="text-xs text-amber-300 flex items-center">
              <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
              </svg>
              视频将在7天后自动删除，请尽快保存到本地
            </p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 备注编辑模态框 -->
    <div v-if="editingNote" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" @click.self="cancelEditNote">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="p-4 border-b border-slate-200 dark:border-dark-600 bg-gradient-to-r from-blue-500 to-indigo-500">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-white flex items-center">
              <span class="mr-2">📝</span>
              编辑备注
            </h3>
            <button @click="cancelEditNote" class="text-white/80 hover:text-white transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              备注内容（用于下载时重命名文件）
            </label>
            <input
              v-model="noteInput"
              type="text"
              class="w-full px-3 py-2 border border-slate-300 dark:border-dark-500 rounded-lg bg-white dark:bg-dark-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="输入备注..."
              maxlength="100"
              @keyup.enter="saveNote"
            />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              最多100个字符，用于下载时作为文件名
            </p>
          </div>
        </div>
        
        <div class="p-4 border-t border-slate-200 dark:border-dark-600 flex space-x-3">
          <button 
            @click="cancelEditNote"
            class="flex-1 px-4 py-2 bg-slate-200 dark:bg-dark-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-dark-500 transition-colors"
          >
            取消
          </button>
          <button 
            @click="saveNote"
            class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// 辅助函数
const getTransactionIcon = (type) => {
  const icons = {
    'register_bonus': { icon: '🎁', bg: 'bg-green-100 dark:bg-green-900/20' },
    'inviter_bonus': { icon: '🤝', bg: 'bg-blue-100 dark:bg-blue-900/20' },
    'invitee_bonus': { icon: '⭐', bg: 'bg-purple-100 dark:bg-purple-900/20' },
    'generate_deduction': { icon: '🎨', bg: 'bg-orange-100 dark:bg-orange-900/20' },
    'generate_cost': { icon: '🎨', bg: 'bg-orange-100 dark:bg-orange-900/20' },
    'admin_recharge': { icon: '💰', bg: 'bg-amber-100 dark:bg-amber-900/20' },
    'purchase_points': { icon: '💳', bg: 'bg-indigo-100 dark:bg-indigo-900/20' },
    'invite_reward': { icon: '🎉', bg: 'bg-pink-100 dark:bg-pink-900/20' },
    'daily_checkin': { icon: '📅', bg: 'bg-orange-100 dark:bg-orange-900/20' },
    'voucher_redeem': { icon: '🎫', bg: 'bg-pink-100 dark:bg-pink-900/20' },
    'balance_to_points': { icon: '💎', bg: 'bg-blue-100 dark:bg-blue-900/20' },
    'package_grant': { icon: '📦', bg: 'bg-emerald-100 dark:bg-emerald-900/20' },
    'video_refund': { icon: '🎬', bg: 'bg-cyan-100 dark:bg-cyan-900/20' },
    'video_cost': { icon: '🎬', bg: 'bg-rose-100 dark:bg-rose-900/20' }
  }
  return icons[type] || { icon: '💎', bg: 'bg-slate-100 dark:bg-dark-600' }
}

const getTransactionTypeText = (type) => {
  const texts = {
    'register_bonus': '注册赠送',
    'inviter_bonus': '邀请奖励',
    'invitee_bonus': '被邀请奖励',
    'generate_deduction': '图像生成消耗',
    'generate_cost': '图像生成消耗',
    'admin_recharge': '管理员充值',
    'purchase_points': '积分购买',
    'invite_reward': '邀请奖励',
    'daily_checkin': '每日签到',
    'voucher_redeem': '兑换券兑换',
    'balance_to_points': '余额划转'
  }
  return texts[type] || type
}

export default {
  methods: {
    getTransactionIcon,
    getTransactionTypeText
  }
}
</script>

<style scoped>
.tab-button {
  @apply px-4 py-2 rounded-lg font-medium transition-all duration-200;
  @apply text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400;
  @apply hover:bg-primary-50 dark:hover:bg-primary-900/20;
}

.tab-button.active {
  @apply bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400;
}

@keyframes gradient-x {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.animate-gradient-x {
  background-size: 200% 200%;
  animation: gradient-x 15s ease infinite;
}

.animate-slide-down {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 自定义滚动条样式 */
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgb(203 213 225);
  border-radius: 3px;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgb(148 163 184);
}

.dark .scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgb(51 65 85);
}

.dark .scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgb(71 85 105);
}
</style>
 
