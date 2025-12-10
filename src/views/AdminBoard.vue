<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getTenantHeaders, getModelDisplayName } from '@/config/tenant'

const router = useRouter()
const me = ref(null)
const users = ref([])

// 日志刷新定时器
let logRefreshInterval = null
const q = ref('')
const role = ref('')
const onlyDisabled = ref('')
const balanceMin = ref('')
const balanceMax = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const sortBy = ref('created_at')
const order = ref('desc')
const loadingList = ref(false)
const loadingCreate = ref(false)
const loadingOps = ref(false)
const error = ref('')
const success = ref('')

// 标签页
const activeTab = ref('users')

// 创建用户表单
const showCreateModal = ref(false)
const createForm = ref({ username: '', email: '', password: '', role: 'user', points: 0 })

// 兑换券管理
const vouchers = ref([])
const vouchersTotal = ref(0)
const vouchersPage = ref(1)
const vouchersPageSize = ref(20)
const voucherStatus = ref('')
const loadingVouchers = ref(false)
const showBatchVoucherModal = ref(false)
const batchVoucherForm = ref({
  count: 10,
  points: 100,
  balance: 0,
  max_uses: 1,
  days: 30,
  note: ''
})
const showVoucherRedemptionsModal = ref(false)
const currentVoucherRedemptions = ref([])
const currentVoucher = ref(null)

// 优惠券管理
const coupons = ref([])
const loadingCoupons = ref(false)
const showCreateCouponModal = ref(false)
const showEditCouponModal = ref(false)
const showGenerateCouponModal = ref(false)
const showCouponCodesModal = ref(false)
const currentCoupon = ref(null)
const couponCodes = ref([])
const couponForm = ref({
  name: '',
  code_prefix: '',
  type: 'discount',
  discount_value: 0.9,
  balance_value: 1000,
  min_amount: 0,
  max_discount: null,
  usage_limit: 1,
  valid_days: 30,
  description: '',
  notes: ''
})
const generateCouponForm = ref({
  count: 10
})

// 兑换券查询条件
const showVoucherFilters = ref(false)
const voucherFilters = ref({
  code: '',
  pointsMin: '',
  pointsMax: '',
  balanceMin: '',
  balanceMax: '',
  usageStatus: '',
  expiresStart: '',
  expiresEnd: '',
  note: ''
})

// 邮件配置
const emailConfig = ref({
  smtp_host: '',
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: '',
  smtp_password: '',
  from_email: '',
  from_name: '',
  require_email_verification: false,
  email_whitelist: []
})
const loadingEmailConfig = ref(false)
const testEmail = ref('')
const whitelistInput = ref('')

// 套餐管理
const packages = ref([])
const loadingPackages = ref(false)
const showEditPackageModal = ref(false)
const editingPackage = ref(null)
const packageForm = ref({
  name: '',
  points: 0,
  concurrent_limit: 10,
  duration_days: 30,
  price: 0,
  description: ''
})

// 支付配置管理
const paymentMethods = ref([])
const paymentModules = ref([])
const loadingPayment = ref(false)
const showPaymentModal = ref(false)
const editingPaymentMethod = ref(null)
const paymentNotifyUrl = ref('')
const paymentForm = ref({
  name: '',
  module: '',
  icon_url: '',
  config: {},
  notify_domain: '',
  fee_percent: 0,
  fee_fixed: 0,
  enabled: false,
  sort_order: 0
})

// 授权管理
const licenseConfig = ref({
  tenant_id: '',
  tenant_key: '',
  brand_name: '',
  brand_logo: '',
  brand_description: '',
  primary_color: '',
  favicon: '',
  enable_video: true,
  enable_voucher: true,
  enable_invite: true,
  enable_packages: true
})
const loadingLicense = ref(false)
const savingLicense = ref(false)

// 编辑用户表单
const showEditModal = ref(false)
const editForm = ref({ id: '', username: '', email: '', role: 'user', points: 0, package_points: 0, balance: 0, password: '', disabled: false, concurrent_limit: 1 })

// 余额充值
const showRechargeModal = ref(false)
const rechargeForm = ref({ userId: '', username: '', amount: '', description: '' })

// 系统设置
const showSettingsModal = ref(false)
const settings = ref({ 
  register_bonus: 0, 
  inviter_bonus: 0, 
  invitee_bonus: 0,
  default_concurrent_limit: 1,
  exchange_rate_points_per_currency: 10,
  external_api_base: 'https://ai.comfly.chat',
  external_api_key: '',
  external_api_image_path: '/v1/images/generations',
  public_url: '',
  // 高速通道配置
  fast_api_base: '',
  fast_api_key: '',
  fast_api_image_path: '/v1/images/generations',
  fast_channel_enabled: false,
  fast_channel_extra_points: 0,
  points_cost: {
    'nano-banana': 1,
    'nano-banana-hd': 3,
    'nano-banana-2': {
      '1k': 3,
      '2k': 4,
      '4k': 5
    }
  },
  video_config: {
    api_base: 'https://ai.comfly.chat',
    api_key: '',
    api_path: '/v2/videos/generations',
    points_cost: {
      'sora-2': { '10': 40, '15': 50 },
      'sora-2-pro': { '10': 600, '15': 700, '25': 900 },
      'veo3.1-components': 100,
      'veo3.1': 150,
      'veo3.1-pro': 200,
      'hd_extra': 100
    }
  },
  voucher_external_link: {
    enabled: false,
    button_text: '获取兑换券',
    url: '',
    open_in_new_tab: true
  },
  invite_milestone_rewards: [
    { milestone: 3, points: 30 },
    { milestone: 5, points: 60 },
    { milestone: 10, points: 100 }
  ],
  icp_config: {
    enabled: false,
    icp_number: '',
    icp_link: 'https://beian.miit.gov.cn/'
  }
})

const listRangeStart = computed(() => total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1)
const listRangeEnd = computed(() => Math.min(page.value * pageSize.value, total.value))

// 获取模型显示名称
const getModelName = (modelKey, type = 'image') => {
  const customName = getModelDisplayName(modelKey, type)
  if (customName) return customName
  
  // 默认名称
  const defaultNames = {
    // 图片模型
    'nano-banana': 'Nano Banana',
    'nano-banana-hd': 'Nano Banana HD',
    'nano-banana-2': 'Nano Banana 2',
    // 视频模型
    'sora-2': 'Sora 2',
    'sora-2-pro': 'Sora 2 Pro',
    'veo3.1-components': 'VEO 3.1',
    'veo3.1': 'VEO 3.1 标准',
    'veo3.1-pro': 'VEO 3.1 Pro'
  }
  return defaultNames[modelKey] || modelKey
}

async function fetchWithAdminAuth(url, opts = {}) {
  const t = localStorage.getItem('token') || ''
  const h = { ...getTenantHeaders(), ...(opts.headers || {}), Authorization: `Bearer ${t}` }
  const r = await fetch(url, { ...opts, headers: h })
  if (r.status === 401) {
    router.push('/auth?redirect=/adminboard')
    return null
  }
  return r
}

function nextPage() { if (page.value * pageSize.value < total.value) { page.value++; loadUsers() } }
function prevPage() { if (page.value > 1) { page.value--; loadUsers() } }
function applyFilter() { page.value = 1; loadUsers() }

async function ensureAdmin() {
  const token = localStorage.getItem('token')
  if (!token) {
    router.push('/auth?redirect=/adminboard')
    return
  }
  
  const r = await fetch('/api/user/me', { headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` } })
  if (!r.ok) {
    router.push('/auth?redirect=/adminboard')
    return
  }
  
  me.value = await r.json()
  if (me.value.role !== 'admin') {
    router.push('/')
    return
  }
}

async function loadUsers() {
  loadingList.value = true
  try {
    const params = new URLSearchParams({ 
      q: q.value, 
      role: role.value, 
      disabled: onlyDisabled.value, 
      page: String(page.value), 
      page_size: String(pageSize.value), 
      sort_by: sortBy.value, 
      order: order.value 
    })
    
    // 添加余额筛选参数
    if (balanceMin.value) params.append('balance_min', balanceMin.value)
    if (balanceMax.value) params.append('balance_max', balanceMax.value)
    
    const r = await fetchWithAdminAuth(`/api/admin/users?${params.toString()}`)
    if (!r) return
    if (!r.ok) throw new Error('failed')
    const j = await r.json()
    users.value = j.users || []
    total.value = j.total || 0
  } catch (e) {
    error.value = '加载用户列表失败'
  } finally { 
    loadingList.value = false 
  }
}

async function loadSettings() {
  const r = await fetchWithAdminAuth('/api/admin/settings')
  if (!r) return
  if (r.ok) {
    const data = await r.json()
    // 深度合并嵌套对象，避免后端返回的数据覆盖默认的嵌套结构
    const defaultSettings = settings.value
    settings.value = {
      ...defaultSettings,
      ...data,
      // 确保嵌套对象有完整结构
      points_cost: {
        ...defaultSettings.points_cost,
        ...(data.points_cost || {}),
        'nano-banana-2': {
          ...defaultSettings.points_cost['nano-banana-2'],
          ...(data.points_cost?.['nano-banana-2'] || {})
        }
      },
      video_config: {
        ...defaultSettings.video_config,
        ...(data.video_config || {}),
        points_cost: {
          ...defaultSettings.video_config.points_cost,
          ...(data.video_config?.points_cost || {}),
          'sora-2': {
            ...defaultSettings.video_config.points_cost['sora-2'],
            ...(data.video_config?.points_cost?.['sora-2'] || {})
          },
          'sora-2-pro': {
            ...defaultSettings.video_config.points_cost['sora-2-pro'],
            ...(data.video_config?.points_cost?.['sora-2-pro'] || {})
          },
          'veo3.1-components': data.video_config?.points_cost?.['veo3.1-components'] ?? defaultSettings.video_config.points_cost['veo3.1-components'],
          'veo3.1': data.video_config?.points_cost?.['veo3.1'] ?? defaultSettings.video_config.points_cost['veo3.1'],
          'veo3.1-pro': data.video_config?.points_cost?.['veo3.1-pro'] ?? defaultSettings.video_config.points_cost['veo3.1-pro']
        }
      },
      voucher_external_link: {
        ...defaultSettings.voucher_external_link,
        ...(data.voucher_external_link || {})
      },
      icp_config: {
        ...defaultSettings.icp_config,
        ...(data.icp_config || {})
      },
      invite_milestone_rewards: data.invite_milestones || data.invite_milestone_rewards || defaultSettings.invite_milestone_rewards
    }
  }
  
  // 加载外部API配置
  const r2 = await fetchWithAdminAuth('/api/admin/external-api')
  if (r2 && r2.ok) {
    const data = await r2.json()
    settings.value.external_api_base = data.external_api_base || settings.value.external_api_base
    settings.value.external_api_image_path = data.external_api_image_path || settings.value.external_api_image_path
    settings.value.public_url = data.public_url || settings.value.public_url
    // 高速通道配置
    settings.value.fast_api_base = data.fast_api_base || ''
    settings.value.fast_api_image_path = data.fast_api_image_path || '/v1/images/generations'
    settings.value.fast_channel_enabled = data.fast_channel_enabled || false
    settings.value.fast_channel_extra_points = data.fast_channel_extra_points || 0
  }
}

function openCreateModal() {
  createForm.value = { username: '', email: '', password: '', role: 'user', points: 0 }
  error.value = ''
  success.value = ''
  showCreateModal.value = true
}

async function createUser() {
  error.value = ''
  success.value = ''
  
  if (!createForm.value.username || !createForm.value.password) {
    error.value = '用户名和密码不能为空'
    return
  }
  
  loadingCreate.value = true
  try {
    const r = await fetchWithAdminAuth('/api/admin/users', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(createForm.value) 
    })
    if (!r) return
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.error || '创建失败')
    }
    success.value = '用户创建成功'
    await loadUsers()
    setTimeout(() => {
      showCreateModal.value = false
    }, 1000)
  } catch (e) { 
    error.value = e.message || '创建用户失败'
  } finally { 
    loadingCreate.value = false 
  }
}

function openEditModal(u) {
  editForm.value = { 
    id: u.id, 
    username: u.username, 
    email: u.email, 
    role: u.role, 
    points: u.points || 0,
    package_points: u.package_points || 0,
    balance: u.balance || 0,
    password: '',
    disabled: u.disabled || false,
    concurrent_limit: u.concurrent_limit || 1
  }
  error.value = ''
  success.value = ''
  showEditModal.value = true
}

function openRechargeModal() {
  rechargeForm.value = {
    userId: editForm.value.id,
    username: editForm.value.username,
    amount: '',
    description: ''
  }
  showRechargeModal.value = true
}

async function submitRecharge() {
  if (!rechargeForm.value.amount || rechargeForm.value.amount === 0) {
    error.value = '请输入有效的金额（不能为0）'
    return
  }
  
  loadingOps.value = true
  error.value = ''
  success.value = ''
  
  try {
    const amountInCents = Math.round(parseFloat(rechargeForm.value.amount) * 100)
    const isDeduction = amountInCents < 0
    
    const r = await fetchWithAdminAuth(`/api/admin/users/${rechargeForm.value.userId}/balance/recharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountInCents,
        description: rechargeForm.value.description || (isDeduction ? `管理员扣减 ¥${Math.abs(rechargeForm.value.amount)}` : `管理员充值 ¥${rechargeForm.value.amount}`)
      })
    })
    
    if (!r) {
      throw new Error('请求失败，请检查登录状态')
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ message: isDeduction ? '扣减失败' : '充值失败' }))
      throw new Error(errData.message || (isDeduction ? '扣减失败' : '充值失败'))
    }
    
    const result = await r.json()
    success.value = `✅ ${isDeduction ? '扣减' : '充值'}成功！当前余额：¥${(result.balance / 100).toFixed(2)}`
    
    // 更新编辑表单中的余额
    editForm.value.balance = result.balance
    
    // 重新加载用户列表
    await loadUsers()
    
    // 2秒后关闭充值模态框
    setTimeout(() => {
      showRechargeModal.value = false
    }, 2000)
  } catch (e) {
    error.value = e.message || '充值失败'
  } finally {
    loadingOps.value = false
  }
}

async function saveEdit() {
  error.value = ''
  success.value = ''
  
  if (!editForm.value.username) {
    error.value = '用户名不能为空'
    return
  }
  
  loadingOps.value = true
  try {
    const patch = {
      username: editForm.value.username,
      email: editForm.value.email,
      role: editForm.value.role,
      points: editForm.value.points,
      disabled: editForm.value.disabled,
      concurrent_limit: editForm.value.concurrent_limit
    }
    
    // 只有填写了新密码才发送密码字段
    if (editForm.value.password) {
      patch.password = editForm.value.password
    }
    
    const r = await fetchWithAdminAuth(`/api/admin/users/${editForm.value.id}`, { 
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify(patch) 
    })
    if (!r) return
    if (!r.ok) throw new Error('failed')
    
    success.value = '用户信息更新成功'
    await loadUsers()
    setTimeout(() => {
      showEditModal.value = false
    }, 1000)
  } catch (e) { 
    error.value = '更新用户信息失败' 
  } finally { 
    loadingOps.value = false 
  }
}

async function toggleUserStatus(u) {
  loadingOps.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/users/${u.id}`, { 
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ disabled: !u.disabled }) 
    })
    if (!r) return
    if (!r.ok) throw new Error('failed')
    await loadUsers()
  } catch (e) { 
    error.value = '更新状态失败' 
  } finally { 
    loadingOps.value = false 
  }
}

async function deleteUser(u) {
  if (!confirm(`确定要删除用户 ${u.username} 吗？此操作不可恢复！`)) return
  
  loadingOps.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    if (!r) return
    if (!r.ok) throw new Error('failed')
    success.value = '用户删除成功'
    await loadUsers()
  } catch (e) { 
    error.value = '删除用户失败' 
  } finally { 
    loadingOps.value = false 
  }
}

async function saveSettings() {
  loadingOps.value = true
  error.value = ''
  success.value = ''
  
  try {
    // 保存积分设置、积分扣除规则和视频配置
    const r1 = await fetchWithAdminAuth('/api/admin/settings', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        register_bonus: settings.value.register_bonus,
        inviter_bonus: settings.value.inviter_bonus,
        invitee_bonus: settings.value.invitee_bonus,
        default_concurrent_limit: settings.value.default_concurrent_limit,
        exchange_rate_points_per_currency: settings.value.exchange_rate_points_per_currency,
        points_cost: settings.value.points_cost,
        video_config: settings.value.video_config,
        voucher_external_link: settings.value.voucher_external_link,
        invite_milestone_rewards: settings.value.invite_milestone_rewards,
        icp_config: settings.value.icp_config
      }) 
    })
    if (!r1 || !r1.ok) throw new Error('保存积分设置失败')
    
    // 保存外部API配置（图片）
    const r2 = await fetchWithAdminAuth('/api/admin/external-api', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ 
        external_api_base: settings.value.external_api_base,
        external_api_key: settings.value.external_api_key,
        external_api_image_path: settings.value.external_api_image_path,
        public_url: settings.value.public_url,
        // 高速通道配置
        fast_api_base: settings.value.fast_api_base,
        fast_api_key: settings.value.fast_api_key,
        fast_api_image_path: settings.value.fast_api_image_path,
        fast_channel_enabled: settings.value.fast_channel_enabled,
        fast_channel_extra_points: settings.value.fast_channel_extra_points
      }) 
    })
    if (!r2 || !r2.ok) throw new Error('保存外部API配置失败')
    
    success.value = '设置保存成功'
    await loadSettings()
    setTimeout(() => {
      showSettingsModal.value = false
    }, 1000)
  } catch (e) { 
    error.value = e.message || '保存设置失败' 
  } finally { 
    loadingOps.value = false 
  }
}

// 邀请进度奖励管理方法
function addInviteMilestone() {
  settings.value.invite_milestone_rewards.push({
    milestone: 0,
    points: 0
  })
}

function removeInviteMilestone(index) {
  settings.value.invite_milestone_rewards.splice(index, 1)
}

// 兑换券相关方法
async function loadVouchers() {
  loadingVouchers.value = true
  try {
    const params = new URLSearchParams({
      page: String(vouchersPage.value),
      pageSize: String(vouchersPageSize.value),
      ...(voucherStatus.value ? { status: voucherStatus.value } : {})
    })
    
    // 添加查询条件
    if (voucherFilters.value.code) params.append('code', voucherFilters.value.code)
    if (voucherFilters.value.pointsMin !== '' && voucherFilters.value.pointsMin !== null && voucherFilters.value.pointsMin !== undefined) params.append('pointsMin', voucherFilters.value.pointsMin)
    if (voucherFilters.value.pointsMax !== '' && voucherFilters.value.pointsMax !== null && voucherFilters.value.pointsMax !== undefined) params.append('pointsMax', voucherFilters.value.pointsMax)
    if (voucherFilters.value.balanceMin !== '' && voucherFilters.value.balanceMin !== null && voucherFilters.value.balanceMin !== undefined) params.append('balanceMin', voucherFilters.value.balanceMin)
    if (voucherFilters.value.balanceMax !== '' && voucherFilters.value.balanceMax !== null && voucherFilters.value.balanceMax !== undefined) params.append('balanceMax', voucherFilters.value.balanceMax)
    if (voucherFilters.value.usageStatus) params.append('usageStatus', voucherFilters.value.usageStatus)
    if (voucherFilters.value.expiresStart) {
      const startDate = new Date(voucherFilters.value.expiresStart)
      params.append('expiresStart', startDate.getTime())
    }
    if (voucherFilters.value.expiresEnd) {
      const endDate = new Date(voucherFilters.value.expiresEnd)
      endDate.setHours(23, 59, 59, 999) // 设置为当天的最后一刻
      params.append('expiresEnd', endDate.getTime())
    }
    if (voucherFilters.value.note) params.append('note', voucherFilters.value.note)
    
    const r = await fetchWithAdminAuth(`/api/admin/vouchers?${params.toString()}`)
    if (!r) return
    if (!r.ok) throw new Error('failed')
    const j = await r.json()
    vouchers.value = j.vouchers || []
    vouchersTotal.value = j.total || 0
  } catch (e) {
    error.value = '加载兑换券列表失败'
  } finally {
    loadingVouchers.value = false
  }
}

// 查询兑换券
function searchVouchers() {
  vouchersPage.value = 1 // 重置到第一页
  loadVouchers()
}

// 重置查询条件
function resetVoucherFilters() {
  voucherFilters.value = {
    code: '',
    pointsMin: '',
    pointsMax: '',
    balanceMin: '',
    balanceMax: '',
    usageStatus: '',
    expiresStart: '',
    expiresEnd: '',
    note: ''
  }
  vouchersPage.value = 1
  loadVouchers()
}

// 导出查询结果
async function exportFilteredVouchers() {
  try {
    const params = new URLSearchParams({
      ...(voucherStatus.value ? { status: voucherStatus.value } : {})
    })
    
    // 添加查询条件
    if (voucherFilters.value.code) params.append('code', voucherFilters.value.code)
    if (voucherFilters.value.pointsMin !== '' && voucherFilters.value.pointsMin !== null && voucherFilters.value.pointsMin !== undefined) params.append('pointsMin', voucherFilters.value.pointsMin)
    if (voucherFilters.value.pointsMax !== '' && voucherFilters.value.pointsMax !== null && voucherFilters.value.pointsMax !== undefined) params.append('pointsMax', voucherFilters.value.pointsMax)
    if (voucherFilters.value.balanceMin !== '' && voucherFilters.value.balanceMin !== null && voucherFilters.value.balanceMin !== undefined) params.append('balanceMin', voucherFilters.value.balanceMin)
    if (voucherFilters.value.balanceMax !== '' && voucherFilters.value.balanceMax !== null && voucherFilters.value.balanceMax !== undefined) params.append('balanceMax', voucherFilters.value.balanceMax)
    if (voucherFilters.value.usageStatus) params.append('usageStatus', voucherFilters.value.usageStatus)
    if (voucherFilters.value.expiresStart) {
      const startDate = new Date(voucherFilters.value.expiresStart)
      params.append('expiresStart', startDate.getTime())
    }
    if (voucherFilters.value.expiresEnd) {
      const endDate = new Date(voucherFilters.value.expiresEnd)
      endDate.setHours(23, 59, 59, 999)
      params.append('expiresEnd', endDate.getTime())
    }
    if (voucherFilters.value.note) params.append('note', voucherFilters.value.note)
    
    const token = localStorage.getItem('token')
    const url = `/api/admin/vouchers/export?${params.toString()}`
    const a = document.createElement('a')
    a.href = url
    a.download = `vouchers_${Date.now()}.csv`
    
    // 使用fetch下载，以便添加token
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!r.ok) throw new Error('导出失败')
    
    const blob = await r.blob()
    const blobUrl = window.URL.createObjectURL(blob)
    a.href = blobUrl
    a.click()
    window.URL.revokeObjectURL(blobUrl)
    
    success.value = '导出成功'
    setTimeout(() => success.value = '', 3000)
  } catch (e) {
    error.value = '导出失败'
  }
}

function openBatchVoucherModal() {
  batchVoucherForm.value = {
    count: 10,
    points: 100,
    max_uses: 1,
    days: 30,
    note: ''
  }
  error.value = ''
  success.value = ''
  showBatchVoucherModal.value = true
}

async function createBatchVouchers() {
  error.value = ''
  success.value = ''
  
  if (batchVoucherForm.value.count < 1 || batchVoucherForm.value.count > 1000) {
    error.value = '数量必须在1-1000之间'
    return
  }
  
  // 积分和余额至少要有一个大于0
  const points = Number(batchVoucherForm.value.points) || 0
  const balance = Number(batchVoucherForm.value.balance) || 0
  if (points === 0 && balance === 0) {
    error.value = '积分和余额至少要有一个大于0'
    return
  }
  
  if (batchVoucherForm.value.days < 1) {
    error.value = '有效天数必须大于0'
    return
  }
  
  loadingCreate.value = true
  try {
    const expires_at = Date.now() + (batchVoucherForm.value.days * 24 * 60 * 60 * 1000)
    
    // 余额转换为分（后端存储单位）
    const balanceInCents = Math.round(balance * 100)
    
    const r = await fetchWithAdminAuth('/api/admin/vouchers/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: batchVoucherForm.value.count,
        points: points,
        balance: balanceInCents,
        max_uses: batchVoucherForm.value.max_uses,
        expires_at,
        note: batchVoucherForm.value.note
      })
    })
    
    if (!r) return
    if (!r.ok) {
      const err = await r.json()
      throw new Error(err.message || '创建失败')
    }
    
    success.value = `成功创建 ${batchVoucherForm.value.count} 张兑换券`
    await loadVouchers()
    setTimeout(() => {
      showBatchVoucherModal.value = false
    }, 1500)
  } catch (e) {
    error.value = e.message || '创建兑换券失败'
  } finally {
    loadingCreate.value = false
  }
}

async function exportVouchers() {
  try {
    const token = localStorage.getItem('token') || ''
    const params = new URLSearchParams(voucherStatus.value ? { status: voucherStatus.value } : {})
    const url = `/api/admin/vouchers/export?${params.toString()}`
    
    // 创建一个隐藏的a标签来触发下载
    const a = document.createElement('a')
    a.href = url
    a.download = `vouchers_${Date.now()}.csv`
    // 添加认证header - 使用fetch下载并创建blob
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) throw new Error('导出失败')
    const blob = await r.blob()
    const blobUrl = URL.createObjectURL(blob)
    a.href = blobUrl
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
    
    success.value = '兑换券已导出'
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = '导出失败'
  }
}

async function deleteVoucher(voucherId) {
  if (!confirm('确定要删除此兑换券吗？')) return
  
  try {
    const r = await fetchWithAdminAuth(`/api/admin/vouchers/${voucherId}`, {
      method: 'DELETE'
    })
    
    if (!r) return
    if (!r.ok) throw new Error('删除失败')
    
    success.value = '兑换券已删除'
    await loadVouchers()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = '删除兑换券失败'
  }
}

async function toggleVoucherStatus(voucherId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'disabled' : 'active'
  
  try {
    const r = await fetchWithAdminAuth(`/api/admin/vouchers/${voucherId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    })
    
    if (!r) return
    if (!r.ok) throw new Error('更新失败')
    
    success.value = `兑换券已${newStatus === 'active' ? '启用' : '禁用'}`
    await loadVouchers()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = '更新兑换券状态失败'
  }
}

async function viewVoucherRedemptions(voucher) {
  try {
    currentVoucher.value = voucher
    const r = await fetchWithAdminAuth(`/api/admin/vouchers/${voucher.id}/redemptions`)
    if (!r) return
    if (!r.ok) throw new Error('加载失败')
    
    const j = await r.json()
    currentVoucherRedemptions.value = j.redemptions || []
    showVoucherRedemptionsModal.value = true
  } catch (e) {
    error.value = '加载兑换记录失败'
  }
}

function nextVouchersPage() {
  if (vouchersPage.value * vouchersPageSize.value < vouchersTotal.value) {
    vouchersPage.value++
    loadVouchers()
  }
}

function prevVouchersPage() {
  if (vouchersPage.value > 1) {
    vouchersPage.value--
    loadVouchers()
  }
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN')
}

const vouchersRangeStart = computed(() => vouchersTotal.value === 0 ? 0 : (vouchersPage.value - 1) * vouchersPageSize.value + 1)
const vouchersRangeEnd = computed(() => Math.min(vouchersPage.value * vouchersPageSize.value, vouchersTotal.value))

// ==================== 优惠券管理相关方法 ====================
async function loadCoupons() {
  loadingCoupons.value = true
  try {
    const r = await fetchWithAdminAuth('/api/admin/coupons')
    if (!r) return
    if (!r.ok) throw new Error('加载失败')
    const data = await r.json()
    coupons.value = data.coupons || []
  } catch (e) {
    error.value = '加载优惠券失败'
  } finally {
    loadingCoupons.value = false
  }
}

function openCreateCouponModal() {
  couponForm.value = {
    name: '',
    code_prefix: '',
    type: 'discount',
    discount_value: 0.9,
    balance_value: 1000,
    min_amount: 0,
    max_discount: null,
    usage_limit: 1,
    valid_days: 30,
    description: '',
    notes: ''
  }
  showCreateCouponModal.value = true
}

async function createCoupon() {
  try {
    const r = await fetchWithAdminAuth('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(couponForm.value)
    })
    if (!r) return
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || '创建失败')
    }
    success.value = '优惠券创建成功'
    showCreateCouponModal.value = false
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = e.message || '创建优惠券失败'
  }
}

function openEditCouponModal(coupon) {
  currentCoupon.value = coupon
  couponForm.value = {
    name: coupon.name,
    code_prefix: coupon.code_prefix,
    type: coupon.type,
    discount_value: coupon.discount_value,
    balance_value: coupon.balance_value,
    min_amount: coupon.min_amount,
    max_discount: coupon.max_discount,
    usage_limit: coupon.usage_limit,
    valid_days: coupon.valid_days,
    description: coupon.description,
    notes: coupon.notes
  }
  showEditCouponModal.value = true
}

async function updateCoupon() {
  try {
    const r = await fetchWithAdminAuth(`/api/admin/coupons/${currentCoupon.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(couponForm.value)
    })
    if (!r) return
    if (!r.ok) throw new Error('更新失败')
    success.value = '优惠券更新成功'
    showEditCouponModal.value = false
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = '更新优惠券失败'
  }
}

async function deleteCoupon(couponId) {
  if (!confirm('确定要删除这个优惠券吗？')) return
  try {
    const r = await fetchWithAdminAuth(`/api/admin/coupons/${couponId}`, {
      method: 'DELETE'
    })
    if (!r) return
    if (!r.ok) throw new Error('删除失败')
    success.value = '优惠券删除成功'
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = '删除优惠券失败'
  }
}

async function toggleCouponStatus(coupon) {
  const newStatus = coupon.status === 'active' ? 'disabled' : 'active'
  try {
    const r = await fetchWithAdminAuth(`/api/admin/coupons/${coupon.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...coupon, status: newStatus })
    })
    if (!r) return
    if (!r.ok) throw new Error('更新失败')
    success.value = `优惠券已${newStatus === 'active' ? '启用' : '禁用'}`
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = '更新优惠券状态失败'
  }
}

function openGenerateCouponModal(coupon) {
  currentCoupon.value = coupon
  generateCouponForm.value.count = 10
  showGenerateCouponModal.value = true
}

async function generateCoupons() {
  try {
    const r = await fetchWithAdminAuth(`/api/admin/coupons/${currentCoupon.value.id}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(generateCouponForm.value)
    })
    if (!r) return
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || '生成失败')
    }
    const data = await r.json()
    success.value = `成功生成 ${data.count} 张优惠券`
    showGenerateCouponModal.value = false
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = e.message || '生成优惠券失败'
  }
}

async function viewCouponCodes(coupon) {
  try {
    currentCoupon.value = coupon
    const r = await fetchWithAdminAuth(`/api/admin/coupons/${coupon.id}/codes?limit=100`)
    if (!r) return
    if (!r.ok) throw new Error('加载失败')
    const data = await r.json()
    couponCodes.value = data.codes || []
    showCouponCodesModal.value = true
  } catch (e) {
    error.value = '加载优惠券码失败'
  }
}

// 邮件配置相关方法
async function loadEmailConfig() {
  loadingEmailConfig.value = true
  try {
    const r = await fetchWithAdminAuth('/api/admin/email-config')
    if (!r) return
    if (!r.ok) throw new Error('failed')
    const data = await r.json()
    emailConfig.value = { ...emailConfig.value, ...data }
  } catch (e) {
    error.value = '加载邮件配置失败'
  } finally {
    loadingEmailConfig.value = false
  }
}

async function saveEmailConfig() {
  loadingOps.value = true
  error.value = ''
  success.value = ''
  
  try {
    console.log('[saveEmailConfig] 准备保存邮件配置:', {
      ...emailConfig.value,
      smtp_password: emailConfig.value.smtp_password ? '******' : ''
    })
    
    const r = await fetchWithAdminAuth('/api/admin/email-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailConfig.value)
    })
    
    console.log('[saveEmailConfig] 响应状态:', r?.status)
    
    if (!r) {
      error.value = '请求失败，请检查网络连接或登录状态'
      return
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ message: '保存失败' }))
      console.error('[saveEmailConfig] 错误响应:', errData)
      throw new Error(errData.message || '保存失败')
    }
    
    const result = await r.json()
    console.log('[saveEmailConfig] 保存成功:', result)
    
    success.value = '✅ 邮件配置保存成功！现在可以发送测试邮件了'
    await loadEmailConfig()
    setTimeout(() => { success.value = '' }, 5000)
  } catch (e) {
    console.error('[saveEmailConfig] 保存失败:', e)
    error.value = e.message || '保存邮件配置失败，请重试'
  } finally {
    loadingOps.value = false
  }
}

async function sendTestEmail() {
  // 清空之前的提示
  error.value = ''
  success.value = ''
  
  // 验证邮箱地址
  if (!testEmail.value) {
    error.value = '请输入测试邮箱地址'
    return
  }
  
  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(testEmail.value)) {
    error.value = '请输入有效的邮箱地址'
    return
  }
  
  loadingOps.value = true
  
  try {
    console.log('[sendTestEmail] 发送测试邮件到:', testEmail.value)
    
    const r = await fetchWithAdminAuth('/api/admin/email-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_email: testEmail.value })
    })
    
    console.log('[sendTestEmail] 响应状态:', r?.status)
    
    if (!r) {
      error.value = '请求失败，请检查网络连接'
      return
    }
    
    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: '发送失败' }))
      console.error('[sendTestEmail] 错误响应:', err)
      throw new Error(err.message || '发送失败')
    }
    
    const result = await r.json()
    console.log('[sendTestEmail] 发送成功:', result)
    
    success.value = '✅ 测试邮件已发送成功！请检查收件箱（可能在垃圾邮件中）'
    setTimeout(() => { success.value = '' }, 8000)
  } catch (e) {
    console.error('[sendTestEmail] 捕获错误:', e)
    error.value = e.message || '发送测试邮件失败，请检查SMTP配置'
  } finally {
    loadingOps.value = false
  }
}

function addToWhitelist() {
  if (!whitelistInput.value) return
  
  const items = whitelistInput.value.split(',').map(s => s.trim()).filter(s => s)
  emailConfig.value.email_whitelist = [...new Set([...emailConfig.value.email_whitelist, ...items])]
  whitelistInput.value = ''
}

function removeFromWhitelist(item) {
  emailConfig.value.email_whitelist = emailConfig.value.email_whitelist.filter(i => i !== item)
}

// 套餐管理方法
async function loadPackages() {
  loadingPackages.value = true
  error.value = ''
  try {
    console.log('[loadPackages] 开始加载套餐列表')
    const r = await fetchWithAdminAuth('/api/admin/packages')
    
    if (!r) {
      console.error('[loadPackages] 请求返回null，可能未授权')
      error.value = '未授权，请重新登录'
      loadingPackages.value = false
      return
    }
    
    if (!r.ok) {
      const errorText = await r.text()
      console.error('[loadPackages] API返回错误:', r.status, errorText)
      throw new Error(`加载失败: ${r.status}`)
    }
    
    const data = await r.json()
    console.log('[loadPackages] 套餐数据:', data)
    packages.value = data.packages || []
    console.log('[loadPackages] 成功加载', packages.value.length, '个套餐')
  } catch (e) {
    console.error('[loadPackages] 加载套餐列表失败:', e)
    error.value = `加载套餐列表失败: ${e.message}`
  } finally {
    loadingPackages.value = false
  }
}

function openEditPackage(pkg) {
  editingPackage.value = pkg
  packageForm.value = {
    name: pkg.name,
    points: pkg.points,
    concurrent_limit: pkg.concurrent_limit,
    duration_days: pkg.duration_days,
    price: pkg.price / 100, // 转换为元
    description: pkg.description || ''
  }
  showEditPackageModal.value = true
}

function closeEditPackage() {
  showEditPackageModal.value = false
  editingPackage.value = null
  packageForm.value = {
    name: '',
    points: 0,
    concurrent_limit: 10,
    duration_days: 30,
    price: 0,
    description: ''
  }
}

async function savePackage() {
  if (!editingPackage.value) return
  
  loadingOps.value = true
  error.value = ''
  success.value = ''
  
  try {
    const body = {
      name: packageForm.value.name,
      points: parseInt(packageForm.value.points),
      concurrent_limit: parseInt(packageForm.value.concurrent_limit),
      duration_days: parseInt(packageForm.value.duration_days),
      price: Math.round(parseFloat(packageForm.value.price) * 100), // 转换为分
      description: packageForm.value.description
    }
    
    const r = await fetchWithAdminAuth(`/api/admin/packages/${editingPackage.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    
    if (!r) {
      error.value = '请求失败'
      return
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ message: '保存失败' }))
      throw new Error(errData.message || '保存失败')
    }
    
    success.value = '✅ 套餐保存成功！'
    await loadPackages()
    
    // 延迟1.5秒后关闭模态框，让用户看到成功提示
    setTimeout(() => {
      closeEditPackage()
    }, 1500)
  } catch (e) {
    error.value = e.message || '保存失败'
    console.error('[savePackage] error:', e)
  } finally {
    loadingOps.value = false
  }
}

async function togglePackageEnabled(pkg) {
  if (!confirm(`确定要${pkg.enabled ? '禁用' : '启用'}套餐【${pkg.name}】吗？`)) return
  
  loadingOps.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/packages/${pkg.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !pkg.enabled })
    })
    
    if (!r || !r.ok) throw new Error('操作失败')
    
    success.value = `✅ 套餐已${pkg.enabled ? '禁用' : '启用'}`
    await loadPackages()
  } catch (e) {
    error.value = e.message || '操作失败'
  } finally {
    loadingOps.value = false
  }
}

// 支付配置管理方法
async function loadPaymentMethods() {
  loadingPayment.value = true
  error.value = ''
  try {
    // 同时加载支付方式列表和可用模块
    const [methodsRes, modulesRes, notifyRes] = await Promise.all([
      fetchWithAdminAuth('/api/admin/payment-methods'),
      fetchWithAdminAuth('/api/admin/payment-modules'),
      fetchWithAdminAuth('/api/admin/payment-notify-url')
    ])
    
    if (methodsRes && methodsRes.ok) {
      const data = await methodsRes.json()
      paymentMethods.value = data.methods || []
      console.log('[loadPaymentMethods] 支付方式列表:', paymentMethods.value.length)
    }
    
    if (modulesRes && modulesRes.ok) {
      const data = await modulesRes.json()
      paymentModules.value = data.modules || []
      console.log('[loadPaymentMethods] 支付模块列表:', paymentModules.value)
    } else {
      console.error('[loadPaymentMethods] 加载模块失败:', modulesRes?.status)
    }
    
    if (notifyRes && notifyRes.ok) {
      const data = await notifyRes.json()
      paymentNotifyUrl.value = data.public_url || ''
    }
  } catch (e) {
    console.error('[loadPaymentMethods] error:', e)
    error.value = `加载支付配置失败: ${e.message}`
  } finally {
    loadingPayment.value = false
  }
}

function getPaymentNotifyUrl(methodId, notifyDomain = null) {
  // 优先使用自定义通知域名
  if (notifyDomain) {
    const baseUrl = notifyDomain.replace(/\/+$/, '') // 去除末尾斜杠
    return `${baseUrl}/api/v1/guest/payment/notify/${methodId}`
  }
  // 查找支付方式的自定义通知域名
  const method = paymentMethods.value.find(m => m.id === methodId)
  if (method && method.notify_domain) {
    const baseUrl = method.notify_domain.replace(/\/+$/, '')
    return `${baseUrl}/api/v1/guest/payment/notify/${methodId}`
  }
  // 回退到默认的 public_url
  if (!paymentNotifyUrl.value) return '请先配置 public_url'
  return `${paymentNotifyUrl.value}/api/v1/guest/payment/notify/${methodId}`
}

async function openAddPaymentModal() {
  editingPaymentMethod.value = null
  paymentForm.value = {
    name: '',
    module: '',
    icon_url: '',
    config: {},
    notify_domain: '',
    fee_percent: 0,
    fee_fixed: 0,
    enabled: false,
    sort_order: paymentMethods.value.length
  }
  
  // 如果还没有加载模块列表，先加载
  if (paymentModules.value.length === 0) {
    console.log('[openAddPaymentModal] 加载支付模块...')
    await loadPaymentMethods()
  }
  
  showPaymentModal.value = true
}

function openEditPaymentModal(method) {
  editingPaymentMethod.value = method
  paymentForm.value = {
    name: method.name,
    module: method.module,
    icon_url: method.icon_url || '',
    config: { ...(method.config || {}) },
    notify_domain: method.notify_domain || '',
    fee_percent: method.fee_percent || 0,
    fee_fixed: method.fee_fixed || 0,
    enabled: method.enabled,
    sort_order: method.sort_order || 0
  }
  showPaymentModal.value = true
}

function closePaymentModal() {
  showPaymentModal.value = false
  editingPaymentMethod.value = null
  paymentForm.value = {
    name: '',
    module: '',
    icon_url: '',
    config: {},
    notify_domain: '',
    fee_percent: 0,
    fee_fixed: 0,
    enabled: false,
    sort_order: 0
  }
}

function onModuleChange() {
  // 当切换模块时，重置config
  paymentForm.value.config = {}
}

async function savePaymentMethod() {
  if (!paymentForm.value.name || !paymentForm.value.module) {
    error.value = '请填写显示名称和选择支付接口'
    return
  }
  
  loadingPayment.value = true
  error.value = ''
  success.value = ''
  
  try {
    const body = {
      name: paymentForm.value.name,
      module: paymentForm.value.module,
      icon_url: paymentForm.value.icon_url,
      config: paymentForm.value.config,
      notify_domain: paymentForm.value.notify_domain,
      fee_percent: paymentForm.value.fee_percent,
      fee_fixed: paymentForm.value.fee_fixed,
      enabled: paymentForm.value.enabled,
      sort_order: paymentForm.value.sort_order
    }
    
    let r
    if (editingPaymentMethod.value) {
      r = await fetchWithAdminAuth(`/api/admin/payment-methods/${editingPaymentMethod.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    } else {
      r = await fetchWithAdminAuth('/api/admin/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    }
    
    if (!r) {
      error.value = '请求失败'
      return
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ message: '保存失败' }))
      throw new Error(errData.message || '保存失败')
    }
    
    success.value = editingPaymentMethod.value ? '✅ 支付方式保存成功！' : '✅ 支付方式添加成功！'
    await loadPaymentMethods()
    
    setTimeout(() => {
      closePaymentModal()
    }, 1000)
  } catch (e) {
    error.value = e.message || '保存失败'
    console.error('[savePaymentMethod] error:', e)
  } finally {
    loadingPayment.value = false
  }
}

// ============ 授权管理相关函数 ============

async function loadLicenseConfig() {
  error.value = ''
  success.value = ''
  loadingLicense.value = true
  
  try {
    console.log('[loadLicenseConfig] 开始加载授权配置...')
    const r = await fetchWithAdminAuth('/api/admin/license-config')
    
    if (!r) {
      console.error('[loadLicenseConfig] 请求返回空响应')
      error.value = '无法连接到服务器，请检查网络连接或后端服务是否正常运行'
      return
    }
    
    console.log('[loadLicenseConfig] 响应状态:', r.status)
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ message: '加载失败' }))
      console.error('[loadLicenseConfig] 请求失败:', errData)
      throw new Error(errData.message || `加载授权配置失败 (状态码: ${r.status})`)
    }
    
    const data = await r.json()
    console.log('[loadLicenseConfig] 成功加载数据:', data)
    
    licenseConfig.value = {
      tenant_id: data.tenant_id || '',
      tenant_key: data.tenant_key || '',
      brand_name: data.brand_name || '香蕉AI',
      brand_logo: data.brand_logo || '/logo.png',
      brand_description: data.brand_description || 'AI 图像生成平台',
      primary_color: data.primary_color || '#FBBF24',
      favicon: data.favicon || '/favicon.ico',
      enable_video: data.enable_video !== false,
      enable_voucher: data.enable_voucher !== false,
      enable_invite: data.enable_invite !== false,
      enable_packages: data.enable_packages !== false
    }
    
    console.log('[loadLicenseConfig] 配置已更新')
  } catch (e) {
    const errorMsg = e.message || '加载授权配置失败'
    error.value = errorMsg
    console.error('[loadLicenseConfig] 异常:', errorMsg, e)
    
    // 如果是网络错误，提供更友好的提示
    if (e.message && e.message.includes('Failed to fetch')) {
      error.value = '网络连接失败，请检查：1) 后端服务是否运行 2) 网络连接是否正常 3) CORS配置是否正确'
    }
  } finally {
    loadingLicense.value = false
    console.log('[loadLicenseConfig] 加载完成，loading=false')
  }
}

async function saveLicenseConfig() {
  error.value = ''
  success.value = ''
  
  if (!licenseConfig.value.tenant_id) {
    error.value = '租户标识不能为空'
    return
  }
  
  if (!licenseConfig.value.brand_name) {
    error.value = '品牌名称不能为空'
    return
  }
  
  savingLicense.value = true
  
  try {
    const r = await fetchWithAdminAuth('/api/admin/license-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(licenseConfig.value)
    })
    
    if (!r) {
      error.value = '请求失败'
      return
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ message: '保存失败' }))
      throw new Error(errData.message || '保存授权配置失败')
    }
    
    success.value = '✅ 授权配置保存成功！刷新页面后生效'
    
    // 3秒后提示刷新页面
    setTimeout(() => {
      if (confirm('配置已保存，是否立即刷新页面使配置生效？')) {
        window.location.reload()
      }
    }, 1500)
  } catch (e) {
    error.value = e.message || '保存授权配置失败'
    console.error('[saveLicenseConfig] error:', e)
  } finally {
    savingLicense.value = false
  }
}

async function togglePaymentEnabled(method) {
  loadingPayment.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/payment-methods/${method.id}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !method.enabled })
    })
    
    if (!r || !r.ok) throw new Error('操作失败')
    
    success.value = `✅ 支付方式已${method.enabled ? '禁用' : '启用'}`
    await loadPaymentMethods()
  } catch (e) {
    error.value = e.message || '操作失败'
  } finally {
    loadingPayment.value = false
  }
}

async function deletePaymentMethod(method) {
  if (!confirm(`确定要删除支付方式【${method.name}】吗？此操作不可恢复。`)) return
  
  loadingPayment.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/payment-methods/${method.id}`, {
      method: 'DELETE'
    })
    
    if (!r || !r.ok) throw new Error('删除失败')
    
    success.value = '✅ 支付方式已删除'
    await loadPaymentMethods()
  } catch (e) {
    error.value = e.message || '删除失败'
  } finally {
    loadingPayment.value = false
  }
}

// 拖拽排序相关
let dragIndex = null

function handleDragStart(event, index) {
  dragIndex = index
  event.dataTransfer.effectAllowed = 'move'
}

async function handleDrop(event, targetIndex) {
  if (dragIndex === null || dragIndex === targetIndex) return
  
  const methods = [...paymentMethods.value]
  const [removed] = methods.splice(dragIndex, 1)
  methods.splice(targetIndex, 0, removed)
  
  // 更新排序
  const orders = methods.map((m, i) => ({ id: m.id, sort_order: i }))
  
  try {
    const r = await fetchWithAdminAuth('/api/admin/payment-methods/sort', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders })
    })
    
    if (r && r.ok) {
      await loadPaymentMethods()
    }
  } catch (e) {
    console.error('[handleDrop] error:', e)
  }
  
  dragIndex = null
}

async function copyNotifyUrl(methodId, notifyDomain = null) {
  const url = getPaymentNotifyUrl(methodId, notifyDomain)
  try {
    await navigator.clipboard.writeText(url)
    success.value = '✅ 通知地址已复制到剪贴板'
    setTimeout(() => { success.value = '' }, 2000)
  } catch (e) {
    error.value = '复制失败，请手动复制'
  }
}

onMounted(async () => { 
  await ensureAdmin()
  if (me.value) {
    await Promise.all([loadUsers(), loadSettings()])
  }
})

onUnmounted(() => {
  // 清理自动刷新定时器
  if (logRefreshInterval) {
    clearInterval(logRefreshInterval)
    logRefreshInterval = null
  }
})
</script>

<template>
  <div v-if="me" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- 页面标题 -->
    <div class="mb-8">
      <div class="card p-6">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center space-x-4">
            <div class="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg">
              <span class="text-white font-bold text-xl">👑</span>
            </div>
            <div>
              <h1 class="text-2xl font-bold gradient-text">管理员控制台</h1>
              <p class="text-slate-600 dark:text-slate-400 text-sm">
                欢迎，{{ me.username }}（{{ me.email }}）
              </p>
            </div>
          </div>
          <button 
            @click="showSettingsModal = true"
            class="btn-secondary flex items-center space-x-2"
          >
            <span>⚙️</span>
            <span>系统设置</span>
          </button>
        </div>
        
        <!-- 标签页导航 -->
        <div class="flex flex-wrap gap-2 border-t border-slate-200 dark:border-dark-600 pt-4 mt-4">
          <button
            @click="activeTab = 'users'; loadUsers()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'users' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            👥 用户管理
          </button>
          <button
            @click="activeTab = 'vouchers'; loadVouchers()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'vouchers' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            🎫 兑换券管理
          </button>
          <button
            @click="activeTab = 'coupons'; loadCoupons()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'coupons' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            🎟️ 优惠券管理
          </button>
          <button
            @click="activeTab = 'email'; loadEmailConfig()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'email' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            📧 邮局管理
          </button>
          <button
            @click="activeTab = 'packages'; loadPackages()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'packages' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            💎 套餐管理
          </button>
          <button
            @click="activeTab = 'payment'; loadPaymentMethods()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'payment' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            💳 支付配置
          </button>
          
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="card p-6 text-center hover:scale-105 transition-transform duration-300">
        <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
          <span class="text-white text-xl">👥</span>
        </div>
        <p class="text-2xl font-bold text-slate-900 dark:text-slate-100">{{ total }}</p>
        <p class="text-sm text-slate-500 dark:text-slate-400">总用户数</p>
      </div>
      
      <div class="card p-6 text-center hover:scale-105 transition-transform duration-300">
        <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
          <span class="text-white text-xl">✅</span>
        </div>
        <p class="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {{ users.filter(u => !u.disabled).length }}
        </p>
        <p class="text-sm text-slate-500 dark:text-slate-400">正常用户</p>
      </div>
      
      <div class="card p-6 text-center hover:scale-105 transition-transform duration-300">
        <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center">
          <span class="text-white text-xl">❌</span>
        </div>
        <p class="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {{ users.filter(u => u.disabled).length }}
        </p>
        <p class="text-sm text-slate-500 dark:text-slate-400">已禁用</p>
      </div>
      
      <div class="card p-6 text-center hover:scale-105 transition-transform duration-300">
        <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center">
          <span class="text-white text-xl">👑</span>
        </div>
        <p class="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {{ users.filter(u => u.role === 'admin').length }}
        </p>
        <p class="text-sm text-slate-500 dark:text-slate-400">管理员</p>
      </div>
    </div>

    <!-- 用户管理内容 -->
    <div v-if="activeTab === 'users'">
      <!-- 筛选和操作栏 -->
      <div class="card p-6 mb-6">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div class="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4 flex-1">
          <input 
            v-model="q" 
            class="input flex-1" 
            placeholder="🔍 搜索用户名、邮箱或ID..." 
            @keyup.enter="applyFilter" 
          />
          
          <select v-model="role" class="input w-full md:w-40" @change="applyFilter">
            <option value="">全部角色</option>
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
          
          <select v-model="onlyDisabled" class="input w-full md:w-40" @change="applyFilter">
            <option value="">全部状态</option>
            <option value="false">正常</option>
            <option value="true">已禁用</option>
          </select>
          
          <input 
            v-model.number="balanceMin" 
            type="number" 
            class="input w-full md:w-40" 
            placeholder="最小余额(分)" 
            @keyup.enter="applyFilter"
          />
          
          <input 
            v-model.number="balanceMax" 
            type="number" 
            class="input w-full md:w-40" 
            placeholder="最大余额(分)" 
            @keyup.enter="applyFilter"
          />
          
          <button @click="applyFilter" class="btn-primary whitespace-nowrap">
            应用筛选
          </button>
        </div>
        
        <button 
          @click="openCreateModal"
          class="btn-primary flex items-center justify-center space-x-2"
        >
          <span>➕</span>
          <span>创建用户</span>
        </button>
      </div>
    </div>

    <!-- 全局提示 -->
    <div v-if="error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center">
      <svg class="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
      </svg>
      <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
      <button @click="error = ''" class="ml-auto text-red-500 hover:text-red-700">✕</button>
    </div>

    <div v-if="success" class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center">
      <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      <p class="text-sm text-green-700 dark:text-green-400">{{ success }}</p>
      <button @click="success = ''" class="ml-auto text-green-500 hover:text-green-700">✕</button>
    </div>

    <!-- 用户列表 -->
    <div class="card p-6">
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-bold gradient-text flex items-center">
          <span class="mr-2">📋</span>
          用户列表
        </h3>
        <div v-if="loadingList" class="flex items-center text-slate-500 dark:text-slate-400">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 mr-2"></div>
          加载中...
        </div>
      </div>
      
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b-2 border-slate-200 dark:border-dark-600">
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">用户信息</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">角色</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">积分资产</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">账户余额</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">并发限制</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">状态</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">创建时间</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="u in users" 
              :key="u.id" 
              class="border-b border-slate-100 dark:border-dark-700 hover:bg-slate-50 dark:hover:bg-dark-700/50 transition-colors"
            >
              <!-- 用户信息 -->
              <td class="py-3 px-4">
                <div class="space-y-1">
                  <div class="flex items-center space-x-2">
                    <span class="font-medium text-slate-900 dark:text-slate-100">{{ u.username }}</span>
                    <span v-if="u.role === 'admin'" class="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs rounded-full">
                      👑
                    </span>
                  </div>
                  <div class="text-xs text-slate-500 dark:text-slate-400">{{ u.email || '-' }}</div>
                  <div class="font-mono text-xs text-slate-400 dark:text-slate-500">
                    ID: {{ u.id.substring(0, 8) }}...
                  </div>
                </div>
              </td>
              
              <!-- 角色 -->
              <td class="py-3 px-4">
                <span 
                  :class="u.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'"
                  class="px-2 py-1 text-xs rounded-full"
                >
                  {{ u.role === 'admin' ? '管理员' : '用户' }}
                </span>
              </td>
              
              <!-- 积分资产 -->
              <td class="py-3 px-4">
                <div class="space-y-1">
                  <!-- 套餐积分 -->
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs text-slate-500 dark:text-slate-400">⏰ 套餐</span>
                    <span class="font-semibold text-purple-600 dark:text-purple-400">
                      {{ u.package_points || 0 }}
                    </span>
                  </div>
                  <!-- 永久积分 -->
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs text-slate-500 dark:text-slate-400">💎 永久</span>
                    <span class="font-semibold text-amber-600 dark:text-amber-400">
                      {{ u.points || 0 }}
                    </span>
                  </div>
                  <!-- 总计 -->
                  <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-dark-600">
                    <span class="text-xs text-slate-600 dark:text-slate-300">总计</span>
                    <span class="font-bold text-slate-900 dark:text-slate-100">
                      {{ (u.package_points || 0) + (u.points || 0) }}
                    </span>
                  </div>
                </div>
              </td>
              
              <!-- 账户余额 -->
              <td class="py-3 px-4">
                <div class="flex items-center space-x-1">
                  <span class="text-lg">💰</span>
                  <span class="font-semibold text-green-600 dark:text-green-400">
                    ¥{{ ((u.balance || 0) / 100).toFixed(2) }}
                  </span>
                </div>
              </td>
              
              <!-- 并发限制 -->
              <td class="py-3 px-4">
                <div class="flex items-center space-x-1">
                  <span class="text-lg">⚡</span>
                  <span class="font-semibold text-blue-600 dark:text-blue-400">
                    {{ u.concurrent_limit || 1 }}
                  </span>
                </div>
              </td>
              
              <!-- 状态 -->
              <td class="py-3 px-4">
                <span 
                  :class="u.disabled ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'"
                  class="px-2 py-1 text-xs rounded-full"
                >
                  {{ u.disabled ? '已禁用' : '正常' }}
                </span>
              </td>
              
              <!-- 创建时间 -->
              <td class="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                {{ new Date(u.created_at).toLocaleDateString() }}
              </td>
              
              <!-- 操作 -->
              <td class="py-3 px-4">
                <div class="flex items-center space-x-2">
                  <button 
                    @click="openEditModal(u)" 
                    class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    title="编辑用户"
                  >
                    ✏️
                  </button>
                  <button 
                    @click="toggleUserStatus(u)" 
                    :disabled="loadingOps"
                    :class="u.disabled ? 'text-green-600 hover:text-green-700' : 'text-yellow-600 hover:text-yellow-700'"
                    :title="u.disabled ? '启用' : '禁用'"
                  >
                    {{ u.disabled ? '✅' : '❌' }}
                  </button>
                  <button 
                    @click="deleteUser(u)" 
                    :disabled="loadingOps"
                    class="text-red-600 hover:text-red-700"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-if="users.length === 0 && !loadingList" class="text-center py-12">
          <div class="text-4xl mb-4">📭</div>
          <p class="text-slate-500 dark:text-slate-400">暂无用户数据</p>
        </div>
      </div>
      
      <!-- 分页 -->
      <div class="flex items-center justify-between mt-6 pt-6 border-t border-slate-200 dark:border-dark-600">
        <div class="text-sm text-slate-500 dark:text-slate-400">
          显示 {{ listRangeStart }} - {{ listRangeEnd }} / 共 {{ total }} 条
        </div>
        <div class="flex items-center space-x-2">
          <button 
            @click="prevPage" 
            :disabled="page <= 1"
            class="px-4 py-2 rounded-lg border border-slate-300 dark:border-dark-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
          >
            ← 上一页
          </button>
          <span class="px-4 py-2 text-sm font-medium">第 {{ page }} 页</span>
          <button 
            @click="nextPage" 
            :disabled="page * pageSize >= total"
            class="px-4 py-2 rounded-lg border border-slate-300 dark:border-dark-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
          >
            下一页 →
          </button>
        </div>
      </div>
    </div>

    </div><!-- 用户管理内容结束 -->

    <!-- 兑换券管理内容 -->
    <div v-if="activeTab === 'vouchers'">
      <!-- 操作栏 -->
      <div class="card p-6 mb-6">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div class="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
            <select v-model="voucherStatus" class="input w-full md:w-40" @change="vouchersPage = 1; loadVouchers()">
              <option value="">全部状态</option>
              <option value="active">活跃</option>
              <option value="disabled">已禁用</option>
            </select>
            
            <button 
              @click="showVoucherFilters = !showVoucherFilters"
              class="btn-secondary flex items-center space-x-2"
            >
              <span>🔍</span>
              <span>{{ showVoucherFilters ? '隐藏查询' : '高级查询' }}</span>
            </button>
          </div>
          
          <div class="flex space-x-3">
            <button 
              @click="exportFilteredVouchers"
              class="btn-secondary flex items-center space-x-2"
            >
              <span>📥</span>
              <span>导出CSV</span>
            </button>
            <button 
              @click="openBatchVoucherModal"
              class="btn-primary flex items-center space-x-2"
            >
              <span>➕</span>
              <span>批量生成</span>
            </button>
          </div>
        </div>
        
        <!-- 高级查询表单 -->
        <div v-if="showVoucherFilters" class="mt-6 pt-6 border-t border-slate-200 dark:border-dark-600">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">🔍 高级查询</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- 兑换码搜索 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">兑换码</label>
              <input 
                v-model="voucherFilters.code" 
                type="text" 
                class="input text-sm" 
                placeholder="模糊搜索兑换码"
              />
            </div>
            
            <!-- 积分区间 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">最小积分</label>
              <input 
                v-model.number="voucherFilters.pointsMin" 
                type="number" 
                class="input text-sm" 
                placeholder="最小积分"
              />
            </div>
            
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">最大积分</label>
              <input 
                v-model.number="voucherFilters.pointsMax" 
                type="number" 
                class="input text-sm" 
                placeholder="最大积分"
              />
            </div>
            
            <!-- 余额区间 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">最小余额</label>
              <input 
                v-model.number="voucherFilters.balanceMin" 
                type="number" 
                class="input text-sm" 
                placeholder="最小余额(分)"
              />
            </div>
            
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">最大余额</label>
              <input 
                v-model.number="voucherFilters.balanceMax" 
                type="number" 
                class="input text-sm" 
                placeholder="最大余额(分)"
              />
            </div>
            
            <!-- 使用情况 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">使用情况</label>
              <select v-model="voucherFilters.usageStatus" class="input text-sm">
                <option value="">全部</option>
                <option value="unused">未使用</option>
                <option value="partial">部分使用</option>
                <option value="full">已用完</option>
              </select>
            </div>
            
            <!-- 有效期开始 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">有效期开始</label>
              <input 
                v-model="voucherFilters.expiresStart" 
                type="date" 
                class="input text-sm"
              />
            </div>
            
            <!-- 有效期结束 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">有效期结束</label>
              <input 
                v-model="voucherFilters.expiresEnd" 
                type="date" 
                class="input text-sm"
              />
            </div>
            
            <!-- 备注搜索 -->
            <div class="md:col-span-2 lg:col-span-3">
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">备注</label>
              <input 
                v-model="voucherFilters.note" 
                type="text" 
                class="input text-sm" 
                placeholder="模糊搜索备注内容"
              />
            </div>
          </div>
          
          <!-- 查询按钮 -->
          <div class="flex justify-end space-x-3 mt-4">
            <button 
              @click="resetVoucherFilters"
              class="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-dark-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
            >
              重置
            </button>
            <button 
              @click="searchVouchers"
              class="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              查询
            </button>
          </div>
        </div>
      </div>

      <!-- 兑换券列表 -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-bold gradient-text flex items-center">
            <span class="mr-2">🎫</span>
            兑换券列表
          </h3>
          <div v-if="loadingVouchers" class="flex items-center text-slate-500 dark:text-slate-400">
            <svg class="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>加载中...</span>
          </div>
          <div v-else class="text-sm text-slate-500 dark:text-slate-400">
            共 {{ vouchersTotal }} 张兑换券
          </div>
        </div>

        <div v-if="vouchers.length === 0 && !loadingVouchers" class="text-center py-12">
          <div class="text-6xl mb-4">🎫</div>
          <p class="text-slate-500 dark:text-slate-400 mb-4">暂无兑换券</p>
          <button @click="openBatchVoucherModal" class="btn-primary">
            批量生成兑换券
          </button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 dark:bg-dark-600">
              <tr>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">兑换码</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">积分</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">余额</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">使用情况</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">过期时间</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">状态</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">备注</th>
                <th class="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="voucher in vouchers" 
                :key="voucher.id"
                class="border-t border-slate-200 dark:border-dark-600 hover:bg-slate-50 dark:hover:bg-dark-600 transition-colors"
              >
                <td class="px-4 py-3">
                  <code class="px-2 py-1 bg-slate-100 dark:bg-dark-700 rounded text-primary-600 dark:text-primary-400 font-mono">
                    {{ voucher.code }}
                  </code>
                </td>
                <td class="px-4 py-3">
                  <span class="font-semibold text-amber-600 dark:text-amber-400">
                    {{ voucher.points || 0 }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="font-semibold text-green-600 dark:text-green-400">
                    ¥{{ ((voucher.balance || 0) / 100).toFixed(2) }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center space-x-2">
                    <span>{{ voucher.current_uses }} / {{ voucher.max_uses }}</span>
                    <button 
                      v-if="voucher.current_uses > 0"
                      @click="viewVoucherRedemptions(voucher)"
                      class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      查看
                    </button>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span 
                    :class="voucher.expires_at <= Date.now() ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'"
                  >
                    {{ formatDate(voucher.expires_at) }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span 
                    class="px-2 py-1 rounded-full text-xs font-medium"
                    :class="voucher.status === 'active' 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'"
                  >
                    {{ voucher.status === 'active' ? '活跃' : '已禁用' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                  {{ voucher.note || '-' }}
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end space-x-2">
                    <button
                      @click="toggleVoucherStatus(voucher.id, voucher.status)"
                      class="text-xs px-3 py-1 rounded-lg transition-colors"
                      :class="voucher.status === 'active'
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                        : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'"
                    >
                      {{ voucher.status === 'active' ? '禁用' : '启用' }}
                    </button>
                    <button
                      @click="deleteVoucher(voucher.id)"
                      class="text-xs px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors dark:bg-red-900/30 dark:text-red-400"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div v-if="vouchersTotal > vouchersPageSize" class="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-dark-600">
          <div class="text-sm text-slate-600 dark:text-slate-400">
            显示 {{ vouchersRangeStart }} - {{ vouchersRangeEnd }} / 共 {{ vouchersTotal }}
          </div>
          <div class="flex space-x-2">
            <button
              @click="prevVouchersPage"
              :disabled="vouchersPage === 1"
              class="px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :class="vouchersPage === 1 
                ? 'border-slate-300 dark:border-dark-600 text-slate-400 dark:text-slate-500' 
                : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'"
            >
              上一页
            </button>
            <button
              @click="nextVouchersPage"
              :disabled="vouchersPage * vouchersPageSize >= vouchersTotal"
              class="px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :class="vouchersPage * vouchersPageSize >= vouchersTotal
                ? 'border-slate-300 dark:border-dark-600 text-slate-400 dark:text-slate-500' 
                : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div><!-- 兑换券管理内容结束 -->

    <!-- 优惠券管理内容 -->
    <div v-if="activeTab === 'coupons'">
      <div class="card p-6 mb-6">
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">优惠券模板列表</h3>
          <button @click="openCreateCouponModal" class="btn-primary">
            ➕ 创建优惠券模板
          </button>
        </div>
      </div>

      <!-- 优惠券列表 -->
      <div v-if="loadingCoupons" class="text-center py-12">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="coupon in coupons" :key="coupon.id" class="card p-6 hover:shadow-lg transition-shadow">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h4 class="text-lg font-bold text-slate-900 dark:text-white">{{ coupon.name }}</h4>
              <span v-if="coupon.code_prefix" class="text-xs text-slate-500">前缀: {{ coupon.code_prefix }}</span>
            </div>
            <button 
              @click="toggleCouponStatus(coupon)" 
              class="px-2 py-1 text-xs rounded-full transition-all hover:shadow-md cursor-pointer" 
              :class="coupon.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
            >
              {{ coupon.status === 'active' ? '启用' : '禁用' }}
            </button>
          </div>

          <div class="space-y-2 mb-4">
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">类型:</span>
              <span class="font-medium">{{ coupon.type === 'discount' ? '折扣券' : '余额抵扣券' }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">优惠:</span>
              <span class="font-medium text-primary-600">
                {{ coupon.type === 'discount' ? `${(coupon.discount_value * 10).toFixed(1)}折` : `¥${(coupon.balance_value / 100).toFixed(2)}` }}
              </span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">最低消费:</span>
              <span>¥{{ (coupon.min_amount / 100).toFixed(2) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">使用次数:</span>
              <span>{{ coupon.usage_limit || '无限制' }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">有效期:</span>
              <span>{{ coupon.valid_days }}天</span>
            </div>
          </div>

          <div v-if="coupon.stats" class="bg-slate-50 dark:bg-dark-700 rounded p-3 mb-4 space-y-1">
            <div class="flex justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">已生成:</span>
              <span class="font-medium">{{ coupon.stats.total_generated || 0 }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">已领取:</span>
              <span class="font-medium">{{ coupon.stats.claimed_count || 0 }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">已使用:</span>
              <span class="font-medium text-green-600">{{ coupon.stats.used_count || 0 }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">可用:</span>
              <span class="font-medium text-primary-600">{{ coupon.stats.available_count || 0 }}</span>
            </div>
          </div>

          <div class="flex gap-2">
            <button @click="openGenerateCouponModal(coupon)" class="btn-secondary text-xs flex-1">
              🎫 生成券码
            </button>
            <button @click="viewCouponCodes(coupon)" class="btn-secondary text-xs flex-1">
              📋 查看券码
            </button>
          </div>
          <div class="flex gap-2 mt-2">
            <button @click="openEditCouponModal(coupon)" class="btn-secondary text-xs flex-1">
              ✏️ 编辑
            </button>
            <button @click="deleteCoupon(coupon.id)" class="btn-danger text-xs flex-1">
              🗑️ 删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建优惠券模态框 -->
    <div v-if="showCreateCouponModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showCreateCouponModal = false">
      <div class="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">创建优惠券模板</h3>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">优惠券名称 *</label>
            <input v-model="couponForm.name" type="text" class="input" placeholder="例如：新用户9折优惠" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">券码前缀</label>
            <input v-model="couponForm.code_prefix" type="text" class="input" placeholder="例如：NEW（可选）" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">优惠券类型 *</label>
            <select v-model="couponForm.type" class="input">
              <option value="discount">折扣券</option>
              <option value="balance">余额抵扣券</option>
            </select>
          </div>
          <div v-if="couponForm.type === 'discount'">
            <label class="block text-sm font-medium mb-2">折扣值 * (0.1-0.99)</label>
            <input v-model.number="couponForm.discount_value" type="number" step="0.01" min="0.01" max="0.99" class="input" placeholder="0.9表示9折" />
          </div>
          <div v-if="couponForm.type === 'balance'">
            <label class="block text-sm font-medium mb-2">抵扣金额 * (分)</label>
            <input v-model.number="couponForm.balance_value" type="number" class="input" placeholder="1000表示10元" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">最低消费金额 (分)</label>
            <input v-model.number="couponForm.min_amount" type="number" class="input" placeholder="0表示无限制" />
          </div>
          <div v-if="couponForm.type === 'discount'">
            <label class="block text-sm font-medium mb-2">最大折扣金额 (分，可选)</label>
            <input v-model.number="couponForm.max_discount" type="number" class="input" placeholder="留空表示无限制" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">使用次数限制</label>
            <input v-model.number="couponForm.usage_limit" type="number" class="input" placeholder="1表示一次性，0表示无限制" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">有效天数</label>
            <input v-model.number="couponForm.valid_days" type="number" class="input" placeholder="30" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">描述</label>
            <textarea v-model="couponForm.description" class="input" rows="2" placeholder="优惠券描述"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">备注</label>
            <textarea v-model="couponForm.notes" class="input" rows="2" placeholder="内部备注"></textarea>
          </div>
        </div>
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex gap-3">
          <button @click="showCreateCouponModal = false" class="btn-secondary flex-1">取消</button>
          <button @click="createCoupon" class="btn-primary flex-1">创建</button>
        </div>
      </div>
    </div>

    <!-- 编辑优惠券模态框 -->
    <div v-if="showEditCouponModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showEditCouponModal = false">
      <div class="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">编辑优惠券模板</h3>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">优惠券名称 *</label>
            <input v-model="couponForm.name" type="text" class="input" placeholder="例如：新用户9折优惠" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">券码前缀</label>
            <input v-model="couponForm.code_prefix" type="text" class="input" placeholder="例如：NEW（可选）" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">优惠券类型 *</label>
            <select v-model="couponForm.type" class="input">
              <option value="discount">折扣券</option>
              <option value="balance">余额抵扣券</option>
            </select>
          </div>
          <div v-if="couponForm.type === 'discount'">
            <label class="block text-sm font-medium mb-2">折扣值 * (0.1-0.99)</label>
            <input v-model.number="couponForm.discount_value" type="number" step="0.01" min="0.01" max="0.99" class="input" placeholder="0.9表示9折" />
          </div>
          <div v-if="couponForm.type === 'balance'">
            <label class="block text-sm font-medium mb-2">抵扣金额 * (分)</label>
            <input v-model.number="couponForm.balance_value" type="number" class="input" placeholder="1000表示10元" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">最低消费金额 (分)</label>
            <input v-model.number="couponForm.min_amount" type="number" class="input" placeholder="0表示无限制" />
          </div>
          <div v-if="couponForm.type === 'discount'">
            <label class="block text-sm font-medium mb-2">最大折扣金额 (分，可选)</label>
            <input v-model.number="couponForm.max_discount" type="number" class="input" placeholder="留空表示无限制" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">使用次数限制</label>
            <input v-model.number="couponForm.usage_limit" type="number" class="input" placeholder="1表示一次性，0表示无限制" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">有效天数</label>
            <input v-model.number="couponForm.valid_days" type="number" class="input" placeholder="30" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">描述</label>
            <textarea v-model="couponForm.description" class="input" rows="2" placeholder="优惠券描述"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">备注</label>
            <textarea v-model="couponForm.notes" class="input" rows="2" placeholder="内部备注"></textarea>
          </div>
        </div>
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex gap-3">
          <button @click="showEditCouponModal = false" class="btn-secondary flex-1">取消</button>
          <button @click="updateCoupon" class="btn-primary flex-1">保存</button>
        </div>
      </div>
    </div>

    <!-- 生成优惠券码模态框 -->
    <div v-if="showGenerateCouponModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showGenerateCouponModal = false">
      <div class="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">批量生成优惠券码</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{{ currentCoupon?.name }}</p>
        </div>
        <div class="p-6">
          <label class="block text-sm font-medium mb-2">生成数量 (1-1000)</label>
          <input v-model.number="generateCouponForm.count" type="number" min="1" max="1000" class="input" />
        </div>
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex gap-3">
          <button @click="showGenerateCouponModal = false" class="btn-secondary flex-1">取消</button>
          <button @click="generateCoupons" class="btn-primary flex-1">生成</button>
        </div>
      </div>
    </div>

    <!-- 查看优惠券码模态框 -->
    <div v-if="showCouponCodesModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showCouponCodesModal = false">
      <div class="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">优惠券码列表</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{{ currentCoupon?.name }} - 共 {{ couponCodes.length }} 张</p>
        </div>
        <div class="p-6">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-slate-200 dark:border-dark-600">
                  <th class="text-left py-2 px-4 text-sm font-medium">券码</th>
                  <th class="text-left py-2 px-4 text-sm font-medium">状态</th>
                  <th class="text-left py-2 px-4 text-sm font-medium">使用次数</th>
                  <th class="text-left py-2 px-4 text-sm font-medium">领取用户</th>
                  <th class="text-left py-2 px-4 text-sm font-medium">过期时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="code in couponCodes" :key="code.id" class="border-b border-slate-100 dark:border-dark-700">
                  <td class="py-2 px-4 font-mono text-sm">{{ code.code }}</td>
                  <td class="py-2 px-4">
                    <span class="px-2 py-1 text-xs rounded-full" :class="{
                      'bg-green-100 text-green-700': code.status === 'unused',
                      'bg-gray-100 text-gray-700': code.status === 'used',
                      'bg-red-100 text-red-700': code.status === 'expired'
                    }">
                      {{ code.status === 'unused' ? '未使用' : code.status === 'used' ? '已使用' : '已过期' }}
                    </span>
                  </td>
                  <td class="py-2 px-4 text-sm">{{ code.used_count }} / {{ code.usage_limit || '∞' }}</td>
                  <td class="py-2 px-4 text-sm">{{ code.username || '-' }}</td>
                  <td class="py-2 px-4 text-sm">{{ formatDate(code.expires_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="p-6 border-t border-slate-200 dark:border-dark-600">
          <button @click="showCouponCodesModal = false" class="btn-secondary w-full">关闭</button>
        </div>
      </div>
    </div>

    <!-- 邮局管理内容 -->
    <div v-if="activeTab === 'email'">
      <!-- 错误提示 -->
      <div v-if="error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-red-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
        </div>
      </div>

      <!-- 成功提示 -->
      <div v-if="success" class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-sm text-green-700 dark:text-green-400">{{ success }}</p>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-6">📧 邮局配置</h2>
        
        <!-- SMTP配置 -->
        <div class="space-y-6">
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">📮 SMTP服务器配置</h3>
            <p class="text-sm text-blue-700 dark:text-blue-400 mb-4">
              配置SMTP服务器后，系统可以发送注册验证码和密码重置邮件
            </p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  SMTP服务器地址 <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="emailConfig.smtp_host"
                  type="text"
                  placeholder="例如: smtp.gmail.com"
                  class="input"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ 新租户需自行填写SMTP服务器地址
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  SMTP端口 *
                </label>
                <input
                  v-model.number="emailConfig.smtp_port"
                  type="number"
                  placeholder="通常为 25, 465, 587"
                  class="input"
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  SMTP用户名 <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="emailConfig.smtp_user"
                  type="text"
                  placeholder="例如: your-email@example.com"
                  class="input"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ 新租户需自行填写SMTP用户名
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  SMTP密码 <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="emailConfig.smtp_password"
                  type="password"
                  placeholder="输入SMTP密码"
                  class="input"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ 新租户需自行填写SMTP密码
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  发件人邮箱 <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="emailConfig.from_email"
                  type="email"
                  placeholder="例如: noreply@yourdomain.com"
                  class="input"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ 新租户需自行填写发件人邮箱
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  发件人名称
                </label>
                <input
                  v-model="emailConfig.from_name"
                  type="text"
                  placeholder="例如: 您的应用名称"
                  class="input"
                />
              </div>

              <div class="flex items-center space-x-3">
                <input
                  v-model="emailConfig.smtp_secure"
                  type="checkbox"
                  id="smtp_secure"
                  class="w-5 h-5 text-primary-600 focus:ring-primary-500 rounded"
                />
                <label for="smtp_secure" class="text-sm font-medium text-slate-700 dark:text-slate-300">
                  使用SSL/TLS (465端口时通常需要开启)
                </label>
              </div>
            </div>
          </div>

          <!-- 注册验证配置 -->
          <div class="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-purple-900 dark:text-purple-300 mb-2">🔐 注册验证设置</h3>
            
            <div class="space-y-4">
              <div class="flex items-start space-x-3">
                <input
                  v-model="emailConfig.require_email_verification"
                  type="checkbox"
                  id="require_verification"
                  class="w-5 h-5 text-primary-600 focus:ring-primary-500 rounded mt-1"
                />
                <div>
                  <label for="require_verification" class="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                    强制邮箱验证
                  </label>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    开启后，用户注册时必须提供邮箱并完成验证才能注册成功
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 邮箱白名单配置 -->
          <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-green-900 dark:text-green-300 mb-2">📋 邮箱白名单</h3>
            <p class="text-sm text-green-700 dark:text-green-400 mb-4">
              只限制邮箱后缀（域名），用逗号分隔。留空表示不限制。
            </p>
            
            <div class="space-y-3">
              <div class="flex space-x-2">
                <input
                  v-model="whitelistInput"
                  type="text"
                  placeholder="输入域名后缀，多个用逗号分隔。例如: gmail.com,qq.com,163.com"
                  class="input flex-1"
                  @keyup.enter="addToWhitelist"
                />
                <button
                  @click="addToWhitelist"
                  class="btn-primary"
                >
                  添加
                </button>
              </div>
              
              <div v-if="emailConfig.email_whitelist.length > 0" class="flex flex-wrap gap-2">
                <div
                  v-for="item in emailConfig.email_whitelist"
                  :key="item"
                  class="inline-flex items-center space-x-2 bg-white dark:bg-dark-600 border border-slate-300 dark:border-dark-500 rounded-full px-3 py-1"
                >
                  <span class="text-sm text-slate-700 dark:text-slate-300">{{ item }}</span>
                  <button
                    @click="removeFromWhitelist(item)"
                    class="text-red-500 hover:text-red-700 text-sm font-bold"
                  >
                    ×
                  </button>
                </div>
              </div>
              
              <p v-else class="text-sm text-slate-500 dark:text-slate-400 italic">
                当前未设置白名单，所有邮箱都可以注册
              </p>
            </div>
          </div>

          <!-- 测试邮件 -->
          <div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-orange-900 dark:text-orange-300 mb-2">🧪 测试邮件发送</h3>
            <p class="text-sm text-orange-700 dark:text-orange-400 mb-4">
              <strong>⚠️ 注意：</strong>请先点击下方"💾 保存配置"按钮保存SMTP配置，然后再测试邮件发送
            </p>
            
            <div class="flex space-x-2">
              <input
                v-model="testEmail"
                type="email"
                placeholder="输入测试邮箱地址"
                class="input flex-1"
              />
              <button
                @click="sendTestEmail"
                :disabled="loadingOps"
                class="btn-secondary"
              >
                {{ loadingOps ? '发送中...' : '发送测试邮件' }}
              </button>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex justify-end space-x-3 pt-4">
            <button
              @click="saveEmailConfig"
              :disabled="loadingOps"
              class="btn-primary"
            >
              {{ loadingOps ? '保存中...' : '💾 保存配置' }}
            </button>
          </div>
        </div>
      </div>
    </div><!-- 邮局管理内容结束 -->

    <!-- 套餐管理内容 -->
    <div v-if="activeTab === 'packages'">
      <!-- 错误/成功提示 -->
      <div v-if="error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
        </div>
      </div>

      <div v-if="success" class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-sm text-green-700 dark:text-green-400">{{ success }}</p>
        </div>
      </div>

      <!-- 套餐列表 -->
      <div class="card">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">套餐管理</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">管理系统套餐，设置价格和权限</p>
        </div>

        <div v-if="loadingPackages" class="p-12 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="mt-2 text-slate-600 dark:text-slate-400">加载中...</p>
        </div>

        <div v-else-if="packages.length === 0" class="p-12 text-center">
          <p class="text-slate-500 dark:text-slate-400">暂无套餐</p>
        </div>

        <div v-else class="p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div 
              v-for="pkg in packages" 
              :key="pkg.id"
              class="border rounded-lg p-4 hover:shadow-md transition-shadow"
              :class="pkg.enabled 
                ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10' 
                : 'border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-700 opacity-60'"
            >
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h4 class="font-bold text-slate-900 dark:text-slate-100">{{ pkg.name }}</h4>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">{{ pkg.type }}</p>
                </div>
                <span 
                  class="px-2 py-1 rounded text-xs font-medium"
                  :class="pkg.enabled 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                    : 'bg-slate-200 dark:bg-dark-600 text-slate-600 dark:text-slate-400'"
                >
                  {{ pkg.enabled ? '启用' : '禁用' }}
                </span>
              </div>

              <div class="space-y-2 mb-4 text-sm">
                <div class="flex justify-between">
                  <span class="text-slate-600 dark:text-slate-400">价格</span>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">¥{{ (pkg.price / 100).toFixed(2) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-600 dark:text-slate-400">积分</span>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">{{ pkg.points }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-600 dark:text-slate-400">并发</span>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">{{ pkg.concurrent_limit }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-600 dark:text-slate-400">时长</span>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">{{ pkg.duration_days }}天</span>
                </div>
              </div>

              <div class="flex gap-2">
                <button 
                  @click="openEditPackage(pkg)" 
                  class="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
                >
                  编辑
                </button>
                <button 
                  @click="togglePackageEnabled(pkg)" 
                  class="flex-1 px-3 py-2 text-sm rounded transition-colors"
                  :class="pkg.enabled 
                    ? 'bg-slate-200 dark:bg-dark-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-dark-500' 
                    : 'bg-green-600 text-white hover:bg-green-700'"
                >
                  {{ pkg.enabled ? '禁用' : '启用' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div><!-- 套餐管理内容结束 -->

    <!-- 支付配置管理内容 -->
    <div v-if="activeTab === 'payment'">
      <!-- 错误/成功提示 -->
      <div v-if="error" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
        </div>
      </div>

      <div v-if="success" class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-sm text-green-700 dark:text-green-400">{{ success }}</p>
        </div>
      </div>

      <!-- 支付方式列表 -->
      <div class="card">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600 flex items-center justify-between">
          <div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">支付配置</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">配置系统支付方式，支持多种支付接口</p>
          </div>
          <button 
            @click="openAddPaymentModal"
            class="btn-primary flex items-center space-x-2"
          >
            <span>+</span>
            <span>添加支付方式</span>
          </button>
        </div>

        <div v-if="loadingPayment" class="p-12 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="mt-2 text-slate-600 dark:text-slate-400">加载中...</p>
        </div>

        <div v-else-if="paymentMethods.length === 0" class="p-12 text-center">
          <p class="text-slate-500 dark:text-slate-400 mb-4">暂无支付方式</p>
          <button @click="openAddPaymentModal" class="btn-primary">添加第一个支付方式</button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-slate-50 dark:bg-dark-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">ID</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">启用</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">显示名称</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">支付接口</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">通知地址</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-dark-600">
              <tr 
                v-for="(method, index) in paymentMethods" 
                :key="method.id"
                class="hover:bg-slate-50 dark:hover:bg-dark-700/50"
                draggable="true"
                @dragstart="handleDragStart($event, index)"
                @dragover.prevent
                @drop="handleDrop($event, index)"
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <span class="text-slate-400 cursor-move mr-2">☰</span>
                    <span class="text-sm text-slate-900 dark:text-slate-100">{{ method.id }}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <button
                    @click="togglePaymentEnabled(method)"
                    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    :class="method.enabled ? 'bg-primary-600' : 'bg-slate-300 dark:bg-dark-500'"
                  >
                    <span
                      class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                      :class="method.enabled ? 'translate-x-6' : 'translate-x-1'"
                    ></span>
                  </button>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm font-medium text-slate-900 dark:text-slate-100">{{ method.name }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-dark-600 text-slate-700 dark:text-slate-300">
                    {{ method.module }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <span class="text-xs text-slate-500 dark:text-slate-400 break-all">
                    {{ getPaymentNotifyUrl(method.id) }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    <button
                      @click="openEditPaymentModal(method)"
                      class="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                      title="编辑"
                    >
                      ✏️
                    </button>
                    <button
                      @click="deletePaymentMethod(method)"
                      class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      title="删除"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div><!-- 支付配置管理内容结束 -->

    <!-- 支付方式编辑模态框 -->
    <div v-if="showPaymentModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closePaymentModal">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">
              {{ editingPaymentMethod ? '编辑支付方式' : '添加支付方式' }}
            </h3>
            <button @click="closePaymentModal" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="p-6 space-y-4">
          <!-- 显示名称 -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">显示名称</label>
            <input 
              v-model="paymentForm.name" 
              class="input w-full" 
              type="text" 
              placeholder="用于前端显示使用"
            />
          </div>

          <!-- 图标URL -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">图标URL(选填)</label>
            <input 
              v-model="paymentForm.icon_url" 
              class="input w-full" 
              type="text" 
              placeholder="用于前端显示使用(https://x.com/icon.svg)"
            />
          </div>

          <!-- 自定义通知域名 -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">自定义通知域名(选填)</label>
            <input 
              v-model="paymentForm.notify_domain" 
              class="input w-full" 
              type="text" 
              placeholder="网关的通知将会发送到该域名(https://x.com)"
            />
          </div>

          <!-- 手续费配置 -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">百分比手续费(选填)</label>
              <div class="flex items-center">
                <input 
                  v-model.number="paymentForm.fee_percent" 
                  class="input w-full" 
                  type="number" 
                  step="0.01"
                  min="0"
                  placeholder="在订单金额基础上附加手..."
                />
                <span class="ml-2 text-slate-500">%</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">固定手续费(选填)</label>
              <input 
                v-model.number="paymentForm.fee_fixed" 
                class="input w-full" 
                type="number" 
                min="0"
                placeholder="在订单金额基础上附加手续费"
              />
            </div>
          </div>

          <!-- 接口文件选择 -->
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">接口文件</label>
            <select v-model="paymentForm.module" class="input w-full" @change="onModuleChange">
              <option value="">请选择支付接口</option>
              <option 
                v-for="mod in paymentModules.filter(m => m.available !== false)" 
                :key="mod.name" 
                :value="mod.name"
              >
                {{ mod.name }} {{ mod.description ? `- ${mod.description}` : '' }}
              </option>
            </select>
            <p v-if="paymentModules.filter(m => m.available !== false).length === 0" class="text-xs text-red-500 mt-1">
              暂无可用的支付模块，请确保后端服务正常运行
            </p>
          </div>

          <!-- EPay 配置字段 -->
          <template v-if="paymentForm.module === 'EPay'">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">URL</label>
              <input 
                v-model="paymentForm.config.url" 
                class="input w-full" 
                type="text" 
                placeholder="易支付网关地址"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">PID</label>
              <input 
                v-model="paymentForm.config.pid" 
                class="input w-full" 
                type="text" 
                placeholder="商户ID"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">KEY</label>
              <input 
                v-model="paymentForm.config.key" 
                class="input w-full" 
                type="password" 
                placeholder="商户密钥"
              />
            </div>
          </template>

          <!-- AlipayF2F 配置字段 -->
          <template v-if="paymentForm.module === 'AlipayF2F'">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">支付宝APPID</label>
              <input 
                v-model="paymentForm.config.appId" 
                class="input w-full" 
                type="text" 
                placeholder="支付宝应用ID"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">支付宝私钥</label>
              <textarea 
                v-model="paymentForm.config.privateKey" 
                class="input w-full h-24" 
                placeholder="RSA2私钥"
              ></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">支付宝公钥</label>
              <textarea 
                v-model="paymentForm.config.alipayPublicKey" 
                class="input w-full h-24" 
                placeholder="支付宝公钥"
              ></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">自定义商品名称</label>
              <input 
                v-model="paymentForm.config.productName" 
                class="input w-full" 
                type="text" 
                placeholder="将会体现在支付宝账单中"
              />
            </div>
          </template>

          <!-- 通知地址显示 -->
          <div v-if="editingPaymentMethod" class="p-4 bg-slate-50 dark:bg-dark-600 rounded-lg">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">通知地址</label>
            <div class="flex items-center space-x-2">
              <input 
                :value="getPaymentNotifyUrl(editingPaymentMethod.id, paymentForm.notify_domain)" 
                class="input w-full bg-white dark:bg-dark-700" 
                type="text" 
                readonly
              />
              <button 
                @click="copyNotifyUrl(editingPaymentMethod.id, paymentForm.notify_domain)"
                class="btn-secondary whitespace-nowrap"
              >
                复制
              </button>
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex justify-end space-x-3">
          <button @click="closePaymentModal" class="btn-secondary">取 消</button>
          <button @click="savePaymentMethod" class="btn-primary" :disabled="loadingPayment">
            {{ loadingPayment ? '保存中...' : (editingPaymentMethod ? '保 存' : '添 加') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 套餐编辑模态框 -->
    <div v-if="showEditPackageModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeEditPackage">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">编辑套餐</h3>
            <button @click="closeEditPackage" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="p-6 space-y-4">
          <!-- 错误提示 -->
          <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
          </div>
          
          <!-- 成功提示 -->
          <div v-if="success" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p class="text-sm text-green-600 dark:text-green-400">{{ success }}</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">套餐名称</label>
            <input v-model="packageForm.name" class="input w-full" type="text" placeholder="例如：月套餐" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">积分数量</label>
              <input v-model.number="packageForm.points" class="input w-full" type="number" min="0" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">并发限制</label>
              <input v-model.number="packageForm.concurrent_limit" class="input w-full" type="number" min="1" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">有效期（天）</label>
              <input v-model.number="packageForm.duration_days" class="input w-full" type="number" min="1" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">价格（元）</label>
              <input v-model.number="packageForm.price" class="input w-full" type="number" min="0" step="0.01" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">描述</label>
            <textarea v-model="packageForm.description" class="input w-full" rows="3" placeholder="套餐描述"></textarea>
          </div>
        </div>

        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex justify-end space-x-3">
          <button @click="closeEditPackage" class="btn-secondary">取消</button>
          <button @click="savePackage" :disabled="loadingOps" class="btn-primary">
            {{ loadingOps ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 创建用户模态框 -->
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showCreateModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">创建新用户</h3>
            <button @click="showCreateModal = false" class="text-slate-400 hover:text-slate-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              用户名 <span class="text-red-500">*</span>
            </label>
            <input v-model="createForm.username" class="input" placeholder="输入用户名" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              邮箱
            </label>
            <input v-model="createForm.email" class="input" placeholder="输入邮箱（可选）" type="email" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              密码 <span class="text-red-500">*</span>
            </label>
            <input v-model="createForm.password" class="input" placeholder="输入密码" type="password" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              角色
            </label>
            <select v-model="createForm.role" class="input">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              初始积分
            </label>
            <input v-model.number="createForm.points" class="input" placeholder="0" type="number" min="0" />
          </div>
          
          <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
          </div>
          
          <div v-if="success" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p class="text-sm text-green-700 dark:text-green-400">{{ success }}</p>
          </div>
        </div>
        
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex space-x-3">
          <button 
            @click="showCreateModal = false" 
            class="flex-1 btn-secondary"
          >
            取消
          </button>
          <button 
            @click="createUser" 
            :disabled="loadingCreate"
            class="flex-1 btn-primary disabled:opacity-60"
          >
            {{ loadingCreate ? '创建中...' : '创建用户' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑用户模态框 -->
    <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showEditModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">编辑用户信息</h3>
            <button @click="showEditModal = false" class="text-slate-400 hover:text-slate-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              用户名 <span class="text-red-500">*</span>
            </label>
            <input v-model="editForm.username" class="input" placeholder="输入用户名" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              邮箱
            </label>
            <input v-model="editForm.email" class="input" placeholder="输入邮箱" type="email" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              新密码（留空不修改）
            </label>
            <input v-model="editForm.password" class="input" placeholder="输入新密码以重置" type="password" />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">如果不需要修改密码，请留空此字段</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              角色
            </label>
            <select v-model="editForm.role" class="input">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          
          <!-- 积分资产 -->
          <div class="p-4 bg-gradient-to-r from-purple-50 to-amber-50 dark:from-purple-900/20 dark:to-amber-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center">
              <span class="mr-2">💎</span>
              积分资产
            </h4>
            
            <div class="space-y-3">
              <!-- 套餐积分 -->
              <div class="bg-white dark:bg-dark-600 rounded-lg p-3">
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  ⏰ 套餐积分（会过期）
                </label>
                <input 
                  v-model.number="editForm.package_points" 
                  class="input text-sm" 
                  placeholder="套餐积分" 
                  type="number" 
                  min="0" 
                  readonly
                  disabled
                />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  套餐积分由购买套餐获得，不能手动修改
                </p>
              </div>
              
              <!-- 永久积分 -->
              <div class="bg-white dark:bg-dark-600 rounded-lg p-3">
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  💎 永久积分（永不过期）
                </label>
                <input 
                  v-model.number="editForm.points" 
                  class="input text-sm" 
                  placeholder="永久积分" 
                  type="number" 
                  min="0" 
                />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  可以手动调整永久积分
                </p>
              </div>
              
              <!-- 总计 -->
              <div class="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-dark-600">
                <span class="text-sm font-medium text-slate-600 dark:text-slate-400">总积分</span>
                <span class="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {{ (editForm.package_points || 0) + (editForm.points || 0) }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- 账户余额 -->
          <div class="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center">
              <span class="mr-2">💰</span>
              账户余额
            </h4>
            
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  当前余额（元）
                </label>
                <div class="flex items-center space-x-2">
                  <input 
                    :value="((editForm.balance || 0) / 100).toFixed(2)" 
                    class="input text-sm flex-1" 
                    readonly
                    disabled
                  />
                  <button
                    @click="openRechargeModal"
                    class="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                  >
                    充值
                  </button>
                </div>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  点击"充值"按钮为用户增加余额
                </p>
              </div>
            </div>
          </div>
          
          <!-- 并发限制 -->
          <div>
            <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center space-x-2">
              <span>⚡</span>
              <span>并发限制</span>
            </h4>
            
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  最大并发任务数
                </label>
                <input 
                  v-model.number="editForm.concurrent_limit" 
                  type="number"
                  min="1"
                  max="100"
                  class="input text-sm w-full" 
                />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  设置用户可同时执行的最大任务数（套餐用户优先使用套餐的并发限制）
                </p>
              </div>
            </div>
          </div>
          
          <!-- 禁用选项 -->
          <div>
            <label class="flex items-center space-x-2 cursor-pointer">
              <input v-model="editForm.disabled" type="checkbox" class="rounded border-slate-300 dark:border-dark-600" />
              <span class="text-sm font-medium text-slate-700 dark:text-slate-300">禁用此用户</span>
            </label>
          </div>
          
          <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
          </div>
          
          <div v-if="success" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p class="text-sm text-green-700 dark:text-green-400">{{ success }}</p>
          </div>
        </div>
        
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex space-x-3">
          <button 
            @click="showEditModal = false" 
            class="flex-1 btn-secondary"
          >
            取消
          </button>
          <button 
            @click="saveEdit" 
            :disabled="loadingOps"
            class="flex-1 btn-primary disabled:opacity-60"
          >
            {{ loadingOps ? '保存中...' : '保存更改' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 余额充值模态框 -->
    <div v-if="showRechargeModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showRechargeModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">💰 余额充值</h3>
            <button @click="showRechargeModal = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-4">
          <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p class="text-sm text-blue-700 dark:text-blue-400">
              为用户 <span class="font-bold">{{ rechargeForm.username }}</span> 充值余额
            </p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              充值金额（元） <span class="text-red-500">*</span>
            </label>
            <input 
              v-model.number="rechargeForm.amount" 
              class="input w-full" 
              placeholder="例如：100" 
              type="number" 
              step="0.01"
              @keyup.enter="submitRecharge"
            />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              输入充值金额，单位为人民币元
            </p>
            <div class="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p class="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <svg class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span><strong>支持负数：</strong>输入负数（如 -50）可扣减用户余额</span>
              </p>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              充值说明（可选）
            </label>
            <textarea 
              v-model="rechargeForm.description" 
              class="input w-full" 
              placeholder="例如：活动赠送、补偿等"
              rows="3"
            ></textarea>
          </div>
          
          <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
          </div>
          
          <div v-if="success" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p class="text-sm text-green-700 dark:text-green-400">{{ success }}</p>
          </div>
        </div>
        
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex space-x-3">
          <button 
            @click="showRechargeModal = false" 
            class="flex-1 btn-secondary"
          >
            取消
          </button>
          <button 
            @click="submitRecharge" 
            :disabled="loadingOps || !rechargeForm.amount || rechargeForm.amount <= 0"
            class="flex-1 btn-primary disabled:opacity-60"
          >
            {{ loadingOps ? '充值中...' : '确认充值' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 系统设置模态框 -->
    <div v-if="showSettingsModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showSettingsModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">系统设置</h3>
            <button @click="showSettingsModal = false" class="text-slate-400 hover:text-slate-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-6">
          <!-- 积分设置 -->
          <div>
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
              <span class="mr-2">💎</span>
              积分奖励设置
            </h4>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  注册赠送积分
                </label>
                <input v-model.number="settings.register_bonus" class="input" type="number" min="0" />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  邀请人奖励积分
                </label>
                <input v-model.number="settings.inviter_bonus" class="input" type="number" min="0" />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  被邀请人奖励积分
                </label>
                <input v-model.number="settings.invitee_bonus" class="input" type="number" min="0" />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  默认并发限制
                  <span class="text-xs text-slate-500 ml-1">(新用户注册时和套餐到期后的并发数)</span>
                </label>
                <input v-model.number="settings.default_concurrent_limit" class="input" type="number" min="1" />
              </div>
              
              <div class="pt-4 border-t border-slate-200 dark:border-dark-600">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  💰 余额兑换率
                  <span class="text-xs text-slate-500 ml-1">(1元 = N积分)</span>
                </label>
                <input 
                  v-model.number="settings.exchange_rate_points_per_currency" 
                  class="input" 
                  type="number" 
                  min="1" 
                  max="1000"
                  placeholder="10"
                />
                <p class="mt-1 text-xs text-slate-500">
                  设置用户将余额划转为积分时的兑换比例，例如：10表示1元可兑换10积分
                </p>
              </div>
            </div>
            
            <!-- 邀请进度奖励设置 -->
            <div class="mt-6 pt-6 border-t border-slate-200 dark:border-dark-600">
              <h5 class="font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center">
                <span class="mr-2">🎁</span>
                邀请进度奖励
                <span class="ml-2 text-xs font-normal text-slate-500">(用户达到邀请人数时自动发放)</span>
              </h5>
              <div class="space-y-3">
                <div v-for="(milestone, index) in settings.invite_milestone_rewards" :key="index" class="flex items-center gap-3">
                  <div class="flex-1">
                    <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">邀请人数</label>
                    <input 
                      v-model.number="milestone.milestone" 
                      class="input" 
                      type="number" 
                      min="1" 
                      placeholder="邀请人数"
                    />
                  </div>
                  <div class="flex-1">
                    <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">奖励积分</label>
                    <input 
                      v-model.number="milestone.points" 
                      class="input" 
                      type="number" 
                      min="0" 
                      placeholder="奖励积分"
                    />
                  </div>
                  <button 
                    @click="removeInviteMilestone(index)"
                    class="mt-5 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="删除"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                  </button>
                </div>
                <button 
                  @click="addInviteMilestone"
                  class="w-full px-4 py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-primary-500 dark:hover:border-primary-500 text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg transition-colors"
                >
                  + 添加进度奖励
                </button>
              </div>
            </div>
          </div>
          
          <!-- 兑换券外部链接设置 -->
          <div class="pt-6 border-t border-slate-200 dark:border-dark-600">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
              <span class="mr-2">🎫</span>
              兑换券外部链接设置
            </h4>
            <div class="space-y-4">
              <div class="flex items-center">
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="settings.voucher_external_link.enabled" 
                    type="checkbox" 
                    class="w-4 h-4 text-primary-600 bg-slate-100 border-slate-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                  />
                  <span class="ml-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    启用外部链接按钮
                  </span>
                </label>
              </div>
              
              <div v-if="settings.voucher_external_link.enabled">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  按钮文字
                </label>
                <input 
                  v-model="settings.voucher_external_link.button_text" 
                  class="input" 
                  type="text" 
                  placeholder="例如：获取兑换券"
                />
              </div>
              
              <div v-if="settings.voucher_external_link.enabled">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  跳转链接 <span class="text-red-500">*</span>
                </label>
                <input 
                  v-model="settings.voucher_external_link.url" 
                  class="input" 
                  type="url" 
                  placeholder="例如：https://example.com 或 app://open"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ 新租户需自行填写跳转链接。支持 http/https 网址或 app:// 协议链接
                </p>
              </div>
              
              <div v-if="settings.voucher_external_link.enabled" class="flex items-center">
                <label class="flex items-center cursor-pointer">
                  <input 
                    v-model="settings.voucher_external_link.open_in_new_tab" 
                    type="checkbox" 
                    class="w-4 h-4 text-primary-600 bg-slate-100 border-slate-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                  />
                  <span class="ml-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    在新标签页打开
                  </span>
                </label>
              </div>
            </div>
          </div>
          
          <!-- 积分扣除规则设置 -->
          <div class="pt-6 border-t border-slate-200 dark:border-dark-600">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
              <span class="mr-2">🎨</span>
              图片生成积分扣除规则
            </h4>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {{ getModelName('nano-banana', 'image') }}
                  </label>
                  <input v-model.number="settings.points_cost['nano-banana']" class="input" type="number" min="0" />
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {{ getModelName('nano-banana-hd', 'image') }}
                  </label>
                  <input v-model.number="settings.points_cost['nano-banana-hd']" class="input" type="number" min="0" />
                </div>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  {{ getModelName('nano-banana-2', 'image') }}（按分辨率）
                </label>
                <div class="grid grid-cols-3 gap-3 pl-4">
                  <div>
                    <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      1K 分辨率
                    </label>
                    <input v-model.number="settings.points_cost['nano-banana-2']['1k']" class="input text-sm" type="number" min="0" />
                  </div>
                  
                  <div>
                    <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      2K 分辨率
                    </label>
                    <input v-model.number="settings.points_cost['nano-banana-2']['2k']" class="input text-sm" type="number" min="0" />
                  </div>
                  
                  <div>
                    <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      4K 分辨率
                    </label>
                    <input v-model.number="settings.points_cost['nano-banana-2']['4k']" class="input text-sm" type="number" min="0" />
                  </div>
                </div>
              </div>
              
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p class="text-xs text-blue-700 dark:text-blue-300">
                  💡 提示：每次生成图片时，系统会根据选择的模型和分辨率自动扣除对应的积分。
                </p>
              </div>
            </div>
          </div>
          
          <!-- 外部API设置 -->
          <div class="pt-6 border-t border-slate-200 dark:border-dark-600">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
              <span class="mr-2">🌐</span>
              外部图像生成API配置
            </h4>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  API基础地址
                </label>
                <input v-model="settings.external_api_base" class="input" placeholder="https://ai.comfly.chat" />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  API密钥 <span class="text-red-500">*</span>
                </label>
                <input v-model="settings.external_api_key" class="input" placeholder="sk-..." type="password" />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ 新租户需自行填写API密钥。后端将使用此密钥调用外部生成接口
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  生成接口路径
                </label>
                <input v-model="settings.external_api_image_path" class="input" placeholder="/v1/images/generations" />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  后端公网域名 <span class="text-red-500">*</span>
                </label>
                <input v-model="settings.public_url" class="input" placeholder="https://ozhqukpewgih.sealosbja.site" />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  ⚠️ 图生图功能必须配置！外部AI服务需要通过公网访问上传的参考图片。
                  <br />
                  填写后端的公网访问地址（不是前端地址）
                </p>
              </div>
            </div>
          </div>
          
          <!-- 高速通道API配置 -->
          <div class="pt-6 border-t border-slate-200 dark:border-dark-600">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
              <span class="mr-2">⚡</span>
              高速通道API配置
            </h4>
            <div class="space-y-4">
              <div class="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p class="text-xs text-amber-700 dark:text-amber-300">
                  💡 高速通道使用独立的API密钥，建议用户在高峰时段使用。启用后用户可以选择使用高速通道生成图片，需要额外支付积分。
                </p>
              </div>
              
              <div class="flex items-center space-x-3">
                <input 
                  type="checkbox" 
                  id="fast_channel_enabled" 
                  v-model="settings.fast_channel_enabled" 
                  class="w-4 h-4 text-primary-600 bg-white dark:bg-dark-700 border-slate-300 dark:border-dark-500 rounded focus:ring-primary-500"
                />
                <label for="fast_channel_enabled" class="text-sm font-medium text-slate-700 dark:text-slate-300">
                  启用高速通道功能
                </label>
              </div>
              
              <div v-if="settings.fast_channel_enabled" class="space-y-4 pl-4 border-l-2 border-primary-300 dark:border-primary-700">
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    高速API基础地址
                  </label>
                  <input v-model="settings.fast_api_base" class="input" placeholder="https://ai.comfly.chat（留空则使用普通API地址）" />
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    高速API密钥 <span class="text-red-500">*</span>
                  </label>
                  <input v-model="settings.fast_api_key" class="input" placeholder="sk-..." type="password" />
                  <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ 高速通道使用的独立API密钥，建议使用不同的账户以获得更高的并发限制
                  </p>
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    高速API接口路径
                  </label>
                  <input v-model="settings.fast_api_image_path" class="input" placeholder="/v1/images/generations" />
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    高速通道附加积分 <span class="text-red-500">*</span>
                  </label>
                  <input v-model.number="settings.fast_channel_extra_points" class="input" type="number" min="0" placeholder="0" />
                  <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    使用高速通道时，在原有积分基础上额外扣除的积分数量。设为0表示不额外收费。
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 视频生成API配置 -->
          <div class="pt-6 border-t border-slate-200 dark:border-dark-600">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
              <span class="mr-2">🎬</span>
              视频生成API配置
            </h4>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  API基础地址
                </label>
                <input v-model="settings.video_config.api_base" class="input" placeholder="https://ai.comfly.chat" />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  API密钥 <span class="text-red-500">*</span>
                </label>
                <input v-model="settings.video_config.api_key" class="input" placeholder="sk-..." type="password" />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ 新租户需自行填写API密钥。后端将使用此密钥调用视频生成接口
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  生成接口路径
                </label>
                <input v-model="settings.video_config.api_path" class="input" placeholder="/v2/videos/generations" />
              </div>
              
              <div class="pt-4">
                <h5 class="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">视频积分扣除规则</h5>
                
                <div class="space-y-4 pl-4">
                  <!-- Sora 2 -->
                  <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      {{ getModelName('sora-2', 'video') }}
                    </label>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">10秒</label>
                        <input v-model.number="settings.video_config.points_cost['sora-2']['10']" class="input text-sm" type="number" min="0" />
                      </div>
                      <div>
                        <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">15秒</label>
                        <input v-model.number="settings.video_config.points_cost['sora-2']['15']" class="input text-sm" type="number" min="0" />
                      </div>
                    </div>
                  </div>
                  
                  <!-- Sora 2 Pro -->
                  <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      {{ getModelName('sora-2-pro', 'video') }}
                    </label>
                    <div class="grid grid-cols-3 gap-3">
                      <div>
                        <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">10秒</label>
                        <input v-model.number="settings.video_config.points_cost['sora-2-pro']['10']" class="input text-sm" type="number" min="0" />
                      </div>
                      <div>
                        <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">15秒</label>
                        <input v-model.number="settings.video_config.points_cost['sora-2-pro']['15']" class="input text-sm" type="number" min="0" />
                      </div>
                      <div>
                        <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">25秒</label>
                        <input v-model.number="settings.video_config.points_cost['sora-2-pro']['25']" class="input text-sm" type="number" min="0" />
                      </div>
                    </div>
                  </div>
                  
                  <!-- VEO 3.1 系列 -->
                  <div class="pt-3 border-t border-slate-200 dark:border-dark-600">
                    <p class="text-xs text-blue-600 dark:text-blue-400 mb-3">🆕 VEO 3.1 系列（不支持时长选项，按次计费）</p>
                    
                    <!-- VEO 3.1 Components -->
                    <div class="mb-3">
                      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {{ getModelName('veo3.1-components', 'video') }} <span class="text-xs text-slate-500">（最多3图）</span>
                      </label>
                      <input v-model.number="settings.video_config.points_cost['veo3.1-components']" class="input text-sm w-32" type="number" min="0" />
                    </div>
                    
                    <!-- VEO 3.1 -->
                    <div class="mb-3">
                      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {{ getModelName('veo3.1', 'video') }} <span class="text-xs text-slate-500">（最多2图/首尾帧）</span>
                      </label>
                      <input v-model.number="settings.video_config.points_cost['veo3.1']" class="input text-sm w-32" type="number" min="0" />
                    </div>
                    
                    <!-- VEO 3.1 Pro -->
                    <div>
                      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        {{ getModelName('veo3.1-pro', 'video') }} <span class="text-xs text-slate-500">（最多2图/首尾帧）</span>
                      </label>
                      <input v-model.number="settings.video_config.points_cost['veo3.1-pro']" class="input text-sm w-32" type="number" min="0" />
                    </div>
                  </div>
                  
                  <!-- HD附加积分 -->
                  <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      HD格式附加积分 <span class="text-xs text-slate-500">（仅适用于 Sora 系列）</span>
                    </label>
                    <input v-model.number="settings.video_config.points_cost.hd_extra" class="input" type="number" min="0" />
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">选择HD格式时额外增加的积分</p>
                  </div>
                </div>
              </div>
              
              <div class="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                <p class="text-xs text-purple-700 dark:text-purple-300">
                  💡 提示：Sora系列 = 基础积分（按时长） + HD附加积分；VEO系列 = 固定积分（按次）
                </p>
              </div>
            </div>
          </div>
          
          <!-- 备案号设置 -->
          <div class="pt-6 border-t border-slate-200 dark:border-dark-600">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
              <span class="mr-2">📋</span>
              网站备案设置
            </h4>
            <div class="space-y-4">
              <div class="flex items-center">
                <input 
                  type="checkbox" 
                  id="icp_enabled" 
                  v-model="settings.icp_config.enabled"
                  class="w-4 h-4 text-primary-600 bg-white dark:bg-dark-600 border-slate-300 dark:border-dark-500 rounded focus:ring-primary-500"
                />
                <label for="icp_enabled" class="ml-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  在页面底部显示备案号
                </label>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  ICP备案号
                </label>
                <input 
                  v-model="settings.icp_config.icp_number" 
                  class="input" 
                  type="text" 
                  placeholder="例如：京ICP备12345678号-1"
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  备案查询链接
                  <span class="text-xs text-slate-500 ml-1">(点击备案号跳转的地址)</span>
                </label>
                <input 
                  v-model="settings.icp_config.icp_link" 
                  class="input" 
                  type="text" 
                  placeholder="https://beian.miit.gov.cn/"
                />
              </div>
              
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p class="text-xs text-blue-700 dark:text-blue-300">
                  💡 提示：启用后，备案号将显示在网站底部，点击可跳转到工信部备案查询网站
                </p>
              </div>
            </div>
          </div>
          
          <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
          </div>
          
          <div v-if="success" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p class="text-sm text-green-700 dark:text-green-400">{{ success }}</p>
          </div>
        </div>
        
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex space-x-3">
          <button 
            @click="showSettingsModal = false" 
            class="flex-1 btn-secondary"
          >
            取消
          </button>
          <button 
            @click="saveSettings" 
            :disabled="loadingOps"
            class="flex-1 btn-primary disabled:opacity-60"
          >
            {{ loadingOps ? '保存中...' : '保存设置' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 加载或无权限状态 -->
  <div v-else class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <div class="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900 dark:to-red-800 rounded-full flex items-center justify-center animate-pulse">
        <span class="text-4xl">🔐</span>
      </div>
      <h3 class="text-2xl font-semibold text-slate-700 dark:text-slate-300 mb-4">
        正在验证权限...
      </h3>
      <p class="text-slate-500 dark:text-slate-400">
        请稍候，正在检查管理员权限
      </p>
    </div>
  </div>

  <!-- 批量生成兑换券模态框 -->
  <div v-if="showBatchVoucherModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showBatchVoucherModal = false">
    <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
      <div class="p-6 border-b border-slate-200 dark:border-dark-600">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold gradient-text">批量生成兑换券</h3>
          <button @click="showBatchVoucherModal = false" class="text-slate-400 hover:text-slate-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="p-6 space-y-4">
        <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {{ error }}
        </div>
        
        <div v-if="success" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400">
          {{ success }}
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            生成数量 <span class="text-red-500">*</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.count" 
            type="number"
            min="1"
            max="1000"
            class="input"
            placeholder="1-1000"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            兑换积分
            <span class="text-xs text-slate-500 ml-1">(积分和余额至少填一个)</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.points" 
            type="number"
            min="0"
            class="input"
            placeholder="每张兑换券可兑换的积分（0表示不兑换积分）"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            兑换余额（元）
            <span class="text-xs text-slate-500 ml-1">(积分和余额至少填一个)</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.balance" 
            type="number"
            min="0"
            step="0.01"
            class="input"
            placeholder="每张兑换券可兑换的余额（0表示不兑换余额）"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            可使用次数 <span class="text-red-500">*</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.max_uses" 
            type="number"
            min="1"
            class="input"
            placeholder="每张兑换券可以使用的次数"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            有效天数 <span class="text-red-500">*</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.days" 
            type="number"
            min="1"
            class="input"
            placeholder="从现在起多少天后过期"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            备注（可选）
          </label>
          <textarea 
            v-model="batchVoucherForm.note" 
            rows="3"
            class="input"
            placeholder="添加备注信息，如：新年活动兑换券"
          ></textarea>
        </div>
      </div>
      
      <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex justify-end space-x-3">
        <button 
          @click="showBatchVoucherModal = false"
          class="btn-secondary"
          :disabled="loadingCreate"
        >
          取消
        </button>
        <button 
          @click="createBatchVouchers"
          class="btn-primary"
          :disabled="loadingCreate"
        >
          <span v-if="loadingCreate">生成中...</span>
          <span v-else>生成</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 查看兑换记录模态框 -->
  <div v-if="showVoucherRedemptionsModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showVoucherRedemptionsModal = false">
    <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
      <div class="p-6 border-b border-slate-200 dark:border-dark-600 sticky top-0 bg-white dark:bg-dark-700">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-xl font-bold gradient-text">兑换记录</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">
              兑换码: <code class="px-2 py-1 bg-slate-100 dark:bg-dark-600 rounded font-mono">{{ currentVoucher?.code }}</code>
            </p>
          </div>
          <button @click="showVoucherRedemptionsModal = false" class="text-slate-400 hover:text-slate-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="p-6">
        <div v-if="currentVoucherRedemptions.length === 0" class="text-center py-8">
          <div class="text-4xl mb-3">📝</div>
          <p class="text-slate-500 dark:text-slate-400">暂无兑换记录</p>
        </div>
        
        <div v-else class="space-y-3">
          <div
            v-for="redemption in currentVoucherRedemptions"
            :key="redemption.id"
            class="p-4 bg-slate-50 dark:bg-dark-600 rounded-lg"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium text-slate-900 dark:text-slate-100">
                  {{ redemption.username || '未知用户' }}
                </p>
                <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  兑换了 <span class="font-semibold text-amber-600 dark:text-amber-400">{{ redemption.points }}</span> 积分
                </p>
              </div>
              <div class="text-right text-sm text-slate-500 dark:text-slate-400">
                {{ formatDate(redemption.redeemed_at) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
