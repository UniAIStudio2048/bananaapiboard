<script setup>
import { t as translateUi, currentLanguage as uiLanguage } from '@/i18n'

import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getTenantHeaders, getApiUrl } from '@/config/tenant'
import { formatPoints, formatBalance } from '@/utils/format'
import { useCurrencyDisplay } from '@/utils/currencyDisplay'

const router = useRouter()
const { formatMoney, symbol: currencySymbol, unitLabel: currencyUnitLabel } = useCurrencyDisplay()
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
let vouchersLoadSeq = 0
const showBatchVoucherModal = ref(false)
const batchVoucherForm = ref({
  count: 10,
  points: 100,
  balance: 0,
  max_uses: 1,
  days: 30,
  point_valid_days: 365,
  note: ''
})
const showVoucherRedemptionsModal = ref(false)
const currentVoucherRedemptions = ref([])
const currentVoucher = ref(null)
const selectedVoucherIds = ref([])
const deletingVouchers = ref(false)

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
  voucher_external_link: {
    enabled: false,
    get button_text() { return translateUi('voucher.getVoucher') },
    url: '',
    open_in_new_tab: true
  }
})

const listRangeStart = computed(() => total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1)
const listRangeEnd = computed(() => Math.min(page.value * pageSize.value, total.value))

async function fetchWithAdminAuth(url, opts = {}) {
  const t = localStorage.getItem('token') || ''
  const h = { ...getTenantHeaders(), ...(opts.headers || {}), Authorization: `Bearer ${t}` }
  const r = await fetch(getApiUrl(url), { cache: 'no-store', ...opts, headers: h })
  if (r.status === 401) {
    router.push('/')
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
    router.push('/')
    return
  }
  
  const r = await fetch(getApiUrl('/api/user/me'), { headers: { ...getTenantHeaders(), Authorization: `Bearer ${token}` } })
  if (!r.ok) {
    router.push('/')
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
    error.value = translateUi('uiMessages.me5a9b0668e66')
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
    // 注意：积分奖励、并发限制等配置已迁移到租户管理平台(9000端口)管理
    const defaultSettings = settings.value
    settings.value = {
      ...defaultSettings,
      voucher_external_link: {
        ...defaultSettings.voucher_external_link,
        ...(data.voucher_external_link || {})
      }
    }
  }
  // 注意：外部API配置（points_cost, video_config, external_api等）已迁移到租户管理平台(9000端口)管理，不再从此处加载
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
    error.value = translateUi('uiMessages.m52d9bd5e0286')
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
      throw new Error(err.error || translateUi('uiMessages.m7e6a71efbf63'))
    }
    success.value = translateUi('uiMessages.ma0b0939e1256')
    await loadUsers()
    setTimeout(() => {
      showCreateModal.value = false
    }, 1000)
  } catch (e) { 
    error.value = e.message || translateUi('uiMessages.mfe2017ccb585')
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
    error.value = translateUi('uiMessages.m2e3ae91cb33f')
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
        description: rechargeForm.value.description || (isDeduction ? translateUi('uiMessages.maf432984490d', { value1: (currencySymbol.value), value2: (Math.abs(rechargeForm.value.amount)) }) : translateUi('uiMessages.m1e9991c0cdce', { value1: (currencySymbol.value), value2: (rechargeForm.value.amount) }))
      })
    })
    
    if (!r) {
      throw new Error(translateUi('uiMessages.m92637da31ed9'))
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ message: isDeduction ? translateUi('uiMessages.me5abd0fd133c') : translateUi('uiMessages.m4d776b8e91ce') }))
      throw new Error(errData.message || (isDeduction ? translateUi('uiMessages.me5abd0fd133c') : translateUi('uiMessages.m4d776b8e91ce')))
    }
    
    const result = await r.json()
    success.value = translateUi('uiMessages.m513b05779a05', { value1: (isDeduction ? translateUi('uiMessages.m7d4b6e6861bb') : translateUi('packages.rechargeBtn')), value2: (formatMoney(result.balance)) })
    
    // 更新编辑表单中的余额
    editForm.value.balance = result.balance
    
    // 重新加载用户列表
    await loadUsers()
    
    // 2秒后关闭充值模态框
    setTimeout(() => {
      showRechargeModal.value = false
    }, 2000)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m4d776b8e91ce')
  } finally {
    loadingOps.value = false
  }
}

async function saveEdit() {
  error.value = ''
  success.value = ''
  
  if (!editForm.value.username) {
    error.value = translateUi('uiMessages.m390ccdec9f3f')
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
    
    success.value = translateUi('uiMessages.mf68bb0bb08c0')
    await loadUsers()
    setTimeout(() => {
      showEditModal.value = false
    }, 1000)
  } catch (e) { 
    error.value = translateUi('uiMessages.mb39e7d625844')
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
    error.value = translateUi('uiMessages.m397194a8a759')
  } finally { 
    loadingOps.value = false 
  }
}

async function deleteUser(u) {
  if (!confirm(translateUi('uiMessages.md6487b4003d6', { value1: (u.username) }))) return
  
  loadingOps.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    if (!r) return
    if (!r.ok) throw new Error('failed')
    success.value = translateUi('uiMessages.me3cf03994a96')
    await loadUsers()
  } catch (e) { 
    error.value = translateUi('uiMessages.m7cf04bd0de1d')
  } finally { 
    loadingOps.value = false 
  }
}

async function saveSettings() {
  loadingOps.value = true
  error.value = ''
  success.value = ''
  
  try {
    // 保存兑换券配置
    // 注意：积分奖励、并发限制等配置已迁移到租户管理平台(9000端口)管理
    const r1 = await fetchWithAdminAuth('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_external_link: settings.value.voucher_external_link
      })
    })
    if (!r1 || !r1.ok) throw new Error(translateUi('uiMessages.m17b49d72eb57'))
    
    // 注意：外部API配置已迁移到租户管理平台(9000端口)管理，不再从此处保存
    
    success.value = translateUi('uiMessages.mdd4c439bc798')
    await loadSettings()
    setTimeout(() => {
      showSettingsModal.value = false
    }, 1000)
  } catch (e) { 
    error.value = e.message || translateUi('uiMessages.m17b49d72eb57')
  } finally {
    loadingOps.value = false
  }
}

// 兑换券相关方法
async function loadVouchers() {
  const seq = ++vouchersLoadSeq
  loadingVouchers.value = true
  try {
    const params = new URLSearchParams({
      page: String(vouchersPage.value),
      pageSize: String(vouchersPageSize.value),
      _t: String(Date.now()),
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
    if (seq !== vouchersLoadSeq) return
    if (!r.ok) throw new Error('failed')
    const j = await r.json()
    if (seq !== vouchersLoadSeq) return
    vouchers.value = j.vouchers || []
    vouchersTotal.value = j.total || 0
    selectedVoucherIds.value = []
  } catch (e) {
    if (seq === vouchersLoadSeq) {
      error.value = translateUi('uiMessages.mfbd75397dd7a')
    }
  } finally {
    if (seq === vouchersLoadSeq) {
      loadingVouchers.value = false
    }
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
    const url = getApiUrl(`/api/admin/vouchers/export?${params.toString()}`)
    const a = document.createElement('a')
    a.href = url
    a.download = `vouchers_${Date.now()}.csv`
    
    // 使用fetch下载，以便添加token
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!r.ok) throw new Error(translateUi('uiMessages.m6e4445df6957'))
    
    const blob = await r.blob()
    const blobUrl = window.URL.createObjectURL(blob)
    a.href = blobUrl
    a.click()
    window.URL.revokeObjectURL(blobUrl)
    
    success.value = translateUi('uiMessages.m5603e0105824')
    setTimeout(() => success.value = '', 3000)
  } catch (e) {
    error.value = translateUi('uiMessages.m6e4445df6957')
  }
}

function openBatchVoucherModal() {
  batchVoucherForm.value = {
    count: 10,
    points: 100,
    balance: 0,
    max_uses: 1,
    days: 30,
    point_valid_days: 365,
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
    error.value = translateUi('uiMessages.mbf6f6cc02c1e')
    return
  }
  
  // 积分和余额至少要有一个大于0
  const points = Number(batchVoucherForm.value.points) || 0
  const balance = Number(batchVoucherForm.value.balance) || 0
  if (points === 0 && balance === 0) {
    error.value = translateUi('uiMessages.m246d1004dc72')
    return
  }
  
  if (batchVoucherForm.value.days < 0) {
    error.value = translateUi('uiMessages.m3b30bddab530')
    return
  }

  if (batchVoucherForm.value.point_valid_days < 0) {
    error.value = translateUi('uiMessages.mce5e2f9f2445')
    return
  }
  
  loadingCreate.value = true
  try {
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
        expires_days: batchVoucherForm.value.days,
        point_valid_days: batchVoucherForm.value.point_valid_days,
        note: batchVoucherForm.value.note
      })
    })
    
    if (!r) return
    if (!r.ok) {
      const err = await r.json()
      throw new Error(err.message || translateUi('uiMessages.m7e6a71efbf63'))
    }
    
    success.value = translateUi('uiMessages.m16e58017c1b1', { value1: (batchVoucherForm.value.count) })
    await loadVouchers()
    setTimeout(() => {
      showBatchVoucherModal.value = false
    }, 1500)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m64d02ccbb894')
  } finally {
    loadingCreate.value = false
  }
}

async function exportVouchers() {
  try {
    const token = localStorage.getItem('token') || ''
    const params = new URLSearchParams(voucherStatus.value ? { status: voucherStatus.value } : {})
    const url = getApiUrl(`/api/admin/vouchers/export?${params.toString()}`)
    
    // 创建一个隐藏的a标签来触发下载
    const a = document.createElement('a')
    a.href = url
    a.download = `vouchers_${Date.now()}.csv`
    // 添加认证header - 使用fetch下载并创建blob
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) throw new Error(translateUi('uiMessages.m6e4445df6957'))
    const blob = await r.blob()
    const blobUrl = URL.createObjectURL(blob)
    a.href = blobUrl
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
    
    success.value = translateUi('uiMessages.m30fbd440cf13')
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = translateUi('uiMessages.m6e4445df6957')
  }
}

async function deleteVoucher(voucherId) {
  if (!confirm(translateUi('uiMessages.m9fa2838a7590'))) return
  
  try {
    const r = await fetchWithAdminAuth(`/api/admin/vouchers/${voucherId}`, {
      method: 'DELETE'
    })
    
    if (!r) return
    if (!r.ok) throw new Error(translateUi('errors.deleteFailed'))
    
    vouchers.value = vouchers.value.filter((v) => String(v.id) !== String(voucherId))
    vouchersTotal.value = Math.max(0, vouchersTotal.value - 1)
    selectedVoucherIds.value = selectedVoucherIds.value.filter((id) => String(id) !== String(voucherId))
    success.value = translateUi('uiMessages.me799ed06e691')
    await loadVouchers()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = translateUi('uiMessages.m9150a686d93a')
  }
}

function isVoucherSelected(voucherId) {
  return selectedVoucherIds.value.some((id) => String(id) === String(voucherId))
}

const allVouchersOnPageSelected = computed(() => {
  if (vouchers.value.length === 0) return false
  return vouchers.value.every((v) => isVoucherSelected(v.id))
})

function toggleSelectAllVouchersOnPage() {
  if (allVouchersOnPageSelected.value) {
    const pageIds = new Set(vouchers.value.map((v) => String(v.id)))
    selectedVoucherIds.value = selectedVoucherIds.value.filter((id) => !pageIds.has(String(id)))
    return
  }
  const merged = new Map(selectedVoucherIds.value.map((id) => [String(id), id]))
  for (const v of vouchers.value) {
    merged.set(String(v.id), v.id)
  }
  selectedVoucherIds.value = [...merged.values()]
}

function toggleVoucherSelection(voucherId) {
  if (isVoucherSelected(voucherId)) {
    selectedVoucherIds.value = selectedVoucherIds.value.filter((id) => String(id) !== String(voucherId))
  } else {
    selectedVoucherIds.value = [...selectedVoucherIds.value, voucherId]
  }
}

async function deleteSelectedVouchers() {
  if (selectedVoucherIds.value.length === 0) return
  if (!confirm(translateUi('uiMessages.me5bb2f66d096', { value1: (selectedVoucherIds.value.length) }))) return

  const idsToDelete = [...selectedVoucherIds.value]
  const deleteIdSet = new Set(idsToDelete.map((id) => String(id)))

  deletingVouchers.value = true
  error.value = ''
  try {
    const r = await fetchWithAdminAuth('/api/admin/vouchers/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: idsToDelete })
    })
    if (!r) return
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      throw new Error(j.error || j.message || translateUi('uiMessages.m27b8c99cf572'))
    }

    const deletedCount = Number(j.deleted)
    if (!Number.isFinite(deletedCount) || deletedCount <= 0) {
      throw new Error(translateUi('uiMessages.mc7138c2f3937'))
    }

    vouchers.value = vouchers.value.filter((v) => !deleteIdSet.has(String(v.id)))
    vouchersTotal.value = Math.max(0, vouchersTotal.value - deletedCount)
    selectedVoucherIds.value = []

    if (deletedCount < idsToDelete.length) {
      success.value = translateUi('uiMessages.m78daa2a0bfbe', { value1: (deletedCount), value2: (idsToDelete.length - deletedCount) })
    } else {
      success.value = translateUi('uiMessages.mb8e97d3f8fce', { value1: (deletedCount) })
    }

    await loadVouchers()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m614b5ab3f038')
  } finally {
    deletingVouchers.value = false
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
    if (!r.ok) throw new Error(translateUi('uiMessages.mec99e5c45d64'))
    
    success.value = translateUi('uiMessages.m97a164a06d21', { value1: (newStatus === 'active' ? translateUi('directorStudio.inspector.enabled') : translateUi('uiMessages.m7df5c456c765')) })
    await loadVouchers()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = translateUi('uiMessages.mc5bab535cef4')
  }
}

async function viewVoucherRedemptions(voucher) {
  try {
    currentVoucher.value = voucher
    const r = await fetchWithAdminAuth(`/api/admin/vouchers/${voucher.id}/redemptions`)
    if (!r) return
    if (!r.ok) throw new Error(translateUi('uiMessages.md1d044826a45'))
    
    const j = await r.json()
    currentVoucherRedemptions.value = j.redemptions || []
    showVoucherRedemptionsModal.value = true
  } catch (e) {
    error.value = translateUi('uiMessages.m0f4498394439')
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
  return new Date(timestamp).toLocaleString(uiLanguage.value)
}

function formatExpiryDate(timestamp) {
  return Number(timestamp) === 0 ? translateUi('uiMessages.m1997cb23f6ee') : formatDate(timestamp)
}

const vouchersRangeStart = computed(() => vouchersTotal.value === 0 ? 0 : (vouchersPage.value - 1) * vouchersPageSize.value + 1)
const vouchersRangeEnd = computed(() => Math.min(vouchersPage.value * vouchersPageSize.value, vouchersTotal.value))

// ==================== 优惠券管理相关方法 ====================
async function loadCoupons() {
  loadingCoupons.value = true
  try {
    const r = await fetchWithAdminAuth('/api/admin/coupons')
    if (!r) return
    if (!r.ok) throw new Error(translateUi('uiMessages.md1d044826a45'))
    const data = await r.json()
    coupons.value = data.coupons || []
  } catch (e) {
    error.value = translateUi('uiMessages.m37ff3a2f9007')
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
      throw new Error(data.message || translateUi('uiMessages.m7e6a71efbf63'))
    }
    success.value = translateUi('uiMessages.m0612c0d4976b')
    showCreateCouponModal.value = false
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.ma885beeeac5c')
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
    if (!r.ok) throw new Error(translateUi('uiMessages.mec99e5c45d64'))
    success.value = translateUi('uiMessages.mcd90e962960f')
    showEditCouponModal.value = false
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = translateUi('uiMessages.mceaef40462ea')
  }
}

async function deleteCoupon(couponId) {
  if (!confirm(translateUi('uiMessages.mb2a01ac6b9b4'))) return
  try {
    const r = await fetchWithAdminAuth(`/api/admin/coupons/${couponId}`, {
      method: 'DELETE'
    })
    if (!r) return
    if (!r.ok) throw new Error(translateUi('errors.deleteFailed'))
    success.value = translateUi('uiMessages.m7bf93ac318d1')
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = translateUi('uiMessages.m95628dcd50cf')
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
    if (!r.ok) throw new Error(translateUi('uiMessages.mec99e5c45d64'))
    success.value = translateUi('uiMessages.medef0c33d580', { value1: (newStatus === 'active' ? translateUi('directorStudio.inspector.enabled') : translateUi('uiMessages.m7df5c456c765')) })
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = translateUi('uiMessages.m30d40f458189')
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
      throw new Error(data.message || translateUi('imageGen.failed'))
    }
    const data = await r.json()
    success.value = translateUi('uiMessages.mac0c45a034c7', { value1: (data.count) })
    showGenerateCouponModal.value = false
    await loadCoupons()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.mf838cd39ab8c')
  }
}

async function viewCouponCodes(coupon) {
  try {
    currentCoupon.value = coupon
    const r = await fetchWithAdminAuth(`/api/admin/coupons/${coupon.id}/codes?limit=100`)
    if (!r) return
    if (!r.ok) throw new Error(translateUi('uiMessages.md1d044826a45'))
    const data = await r.json()
    couponCodes.value = data.codes || []
    showCouponCodesModal.value = true
  } catch (e) {
    error.value = translateUi('uiMessages.m7a4ff10c832d')
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
    error.value = translateUi('uiMessages.m9d8612175b97')
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
      error.value = translateUi('uiMessages.m2c140d171558')
      return
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ get message() { return translateUi('errors.saveFailed') } }))
      console.error('[saveEmailConfig] 错误响应:', errData)
      throw new Error(errData.message || translateUi('errors.saveFailed'))
    }
    
    const result = await r.json()
    console.log('[saveEmailConfig] 保存成功:', result)
    
    success.value = translateUi('uiMessages.m1cbb02831d36')
    await loadEmailConfig()
    setTimeout(() => { success.value = '' }, 5000)
  } catch (e) {
    console.error('[saveEmailConfig] 保存失败:', e)
    error.value = e.message || translateUi('uiMessages.m2cc634ce3d13')
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
    error.value = translateUi('uiMessages.m4cbbfa1bb4e1')
    return
  }
  
  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(testEmail.value)) {
    error.value = translateUi('auth.invalidEmail')
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
      error.value = translateUi('uiMessages.m719b23a4e095')
      return
    }
    
    if (!r.ok) {
      const err = await r.json().catch(() => ({ get message() { return translateUi('uiMessages.mac77953a1e06') } }))
      console.error('[sendTestEmail] 错误响应:', err)
      throw new Error(err.message || translateUi('uiMessages.mac77953a1e06'))
    }
    
    const result = await r.json()
    console.log('[sendTestEmail] 发送成功:', result)
    
    success.value = translateUi('uiMessages.m28928b9708a2')
    setTimeout(() => { success.value = '' }, 8000)
  } catch (e) {
    console.error('[sendTestEmail] 捕获错误:', e)
    error.value = e.message || translateUi('uiMessages.m9d676c51c05d')
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
      error.value = translateUi('uiMessages.ma925efd4eca1')
      loadingPackages.value = false
      return
    }
    
    if (!r.ok) {
      const errorText = await r.text()
      console.error('[loadPackages] API返回错误:', r.status, errorText)
      throw new Error(translateUi('uiMessages.mf58eb3fbf9ab', { value1: (r.status) }))
    }
    
    const data = await r.json()
    console.log('[loadPackages] 套餐数据:', data)
    packages.value = data.packages || []
    console.log('[loadPackages] 成功加载', packages.value.length, '个套餐')
  } catch (e) {
    console.error('[loadPackages] 加载套餐列表失败:', e)
    error.value = translateUi('uiMessages.m30e44861f41f', { value1: (e.message) })
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
      error.value = translateUi('uiMessages.m126fbf59cf04')
      return
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ get message() { return translateUi('errors.saveFailed') } }))
      throw new Error(errData.message || translateUi('errors.saveFailed'))
    }
    
    success.value = translateUi('uiMessages.mbafaea707907')
    await loadPackages()
    
    // 延迟1.5秒后关闭模态框，让用户看到成功提示
    setTimeout(() => {
      closeEditPackage()
    }, 1500)
  } catch (e) {
    error.value = e.message || translateUi('errors.saveFailed')
    console.error('[savePackage] error:', e)
  } finally {
    loadingOps.value = false
  }
}

async function togglePackageEnabled(pkg) {
  if (!confirm(translateUi('uiMessages.mac67d12e97bc', { value1: (pkg.enabled ? translateUi('uiMessages.m7df5c456c765') : translateUi('directorStudio.inspector.enabled')), value2: (pkg.name) }))) return
  
  loadingOps.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/packages/${pkg.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !pkg.enabled })
    })
    
    if (!r || !r.ok) throw new Error(translateUi('auth.operationFailed'))
    
    success.value = translateUi('uiMessages.m192b64ed8985', { value1: (pkg.enabled ? translateUi('uiMessages.m7df5c456c765') : translateUi('directorStudio.inspector.enabled')) })
    await loadPackages()
  } catch (e) {
    error.value = e.message || translateUi('auth.operationFailed')
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
    error.value = translateUi('uiMessages.ma877af5ffcc7', { value1: (e.message) })
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
  if (!paymentNotifyUrl.value) return translateUi('uiMessages.m8e940c9d65c5')
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
    error.value = translateUi('uiMessages.m8f1140cdde44')
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
      error.value = translateUi('uiMessages.m126fbf59cf04')
      return
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ get message() { return translateUi('errors.saveFailed') } }))
      throw new Error(errData.message || translateUi('errors.saveFailed'))
    }
    
    success.value = editingPaymentMethod.value ? translateUi('uiMessages.m8c0f8e3a6481') : translateUi('uiMessages.m917f0aabd450')
    await loadPaymentMethods()
    
    setTimeout(() => {
      closePaymentModal()
    }, 1000)
  } catch (e) {
    error.value = e.message || translateUi('errors.saveFailed')
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
      error.value = translateUi('uiMessages.m261c6c70e03c')
      return
    }
    
    console.log('[loadLicenseConfig] 响应状态:', r.status)
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ get message() { return translateUi('uiMessages.md1d044826a45') } }))
      console.error('[loadLicenseConfig] 请求失败:', errData)
      throw new Error(errData.message || translateUi('uiMessages.m0eafd68067de', { value1: (r.status) }))
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
    const errorMsg = e.message || translateUi('uiMessages.m162964a43b86')
    error.value = errorMsg
    console.error('[loadLicenseConfig] 异常:', errorMsg, e)
    
    // 如果是网络错误，提供更友好的提示
    if (e.message && e.message.includes('Failed to fetch')) {
      error.value = translateUi('uiMessages.mc516ae21a627')
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
    error.value = translateUi('uiMessages.ma8b9c14a49a7')
    return
  }
  
  if (!licenseConfig.value.brand_name) {
    error.value = translateUi('uiMessages.m57a093f0857b')
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
      error.value = translateUi('uiMessages.m126fbf59cf04')
      return
    }
    
    if (!r.ok) {
      const errData = await r.json().catch(() => ({ get message() { return translateUi('errors.saveFailed') } }))
      throw new Error(errData.message || translateUi('uiMessages.m6d7fd5f9dcb8'))
    }
    
    success.value = translateUi('uiMessages.m1bcd1bd11850')
    
    // 3秒后提示刷新页面
    setTimeout(() => {
      if (confirm(translateUi('uiMessages.mc86bb28394e9'))) {
        window.location.reload()
      }
    }, 1500)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m6d7fd5f9dcb8')
    console.error('[saveLicenseConfig] error:', e)
  } finally {
    savingLicense.value = false
  }
}

async function togglePaymentEnabled(method) {
  loadingPayment.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/payment-methods/${method.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !method.enabled })
    })
    
    if (!r || !r.ok) throw new Error(translateUi('auth.operationFailed'))
    
    success.value = translateUi('uiMessages.m0c541251af83', { value1: (method.enabled ? translateUi('uiMessages.m7df5c456c765') : translateUi('directorStudio.inspector.enabled')) })
    await loadPaymentMethods()
  } catch (e) {
    error.value = e.message || translateUi('auth.operationFailed')
  } finally {
    loadingPayment.value = false
  }
}

async function deletePaymentMethod(method) {
  if (!confirm(translateUi('uiMessages.md5c4d3de9351', { value1: (method.name) }))) return
  
  loadingPayment.value = true
  try {
    const r = await fetchWithAdminAuth(`/api/admin/payment-methods/${method.id}`, {
      method: 'DELETE'
    })
    
    if (!r || !r.ok) throw new Error(translateUi('errors.deleteFailed'))
    
    success.value = translateUi('uiMessages.m736f131bd26e')
    await loadPaymentMethods()
  } catch (e) {
    error.value = e.message || translateUi('errors.deleteFailed')
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
    success.value = translateUi('uiMessages.m94f367d51ca6')
    setTimeout(() => { success.value = '' }, 2000)
  } catch (e) {
    error.value = translateUi('uiMessages.m97f4308501ff')
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
              <h1 class="text-2xl font-bold gradient-text">{{ translateUi('uiMessages.mf4855d2b33ae') }}</h1>
              <p class="text-slate-600 dark:text-slate-400 text-sm">
                {{ translateUi('uiMessages.m6ab10b12c475', { value1: (me.username), value2: (me.email) }) }}
              </p>
            </div>
          </div>
          <button 
            @click="showSettingsModal = true"
            class="btn-secondary flex items-center space-x-2"
          >
            <span>⚙️</span>
            <span>{{ translateUi('admin.settings') }}</span>
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
            {{ translateUi('uiMessages.m44afb64478ee') }}
          </button>
          <button
            @click="activeTab = 'vouchers'; loadVouchers()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'vouchers' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            {{ translateUi('uiMessages.m5be29ba0be52') }}
          </button>
          <button
            @click="activeTab = 'coupons'; loadCoupons()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'coupons' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            {{ translateUi('uiMessages.md2c52b073272') }}
          </button>
          <button
            @click="activeTab = 'email'; loadEmailConfig()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'email' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            {{ translateUi('uiMessages.m021495660c6b') }}
          </button>
          <button
            @click="activeTab = 'packages'; loadPackages()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'packages' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            {{ translateUi('uiMessages.m09b81a62a4af') }}
          </button>
          <button
            @click="activeTab = 'payment'; loadPaymentMethods()"
            class="px-4 py-2 rounded-lg font-medium transition-all duration-200"
            :class="activeTab === 'payment' 
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' 
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-600'"
          >
            {{ translateUi('uiMessages.md0fd22201106') }}
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
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('admin.totalUsers') }}</p>
      </div>
      
      <div class="card p-6 text-center hover:scale-105 transition-transform duration-300">
        <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
          <span class="text-white text-xl">✅</span>
        </div>
        <p class="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {{ users.filter(u => !u.disabled).length }}
        </p>
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.mea571a56168a') }}</p>
      </div>
      
      <div class="card p-6 text-center hover:scale-105 transition-transform duration-300">
        <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center">
          <span class="text-white text-xl">❌</span>
        </div>
        <p class="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {{ users.filter(u => u.disabled).length }}
        </p>
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.mbc5a87a757a5') }}</p>
      </div>
      
      <div class="card p-6 text-center hover:scale-105 transition-transform duration-300">
        <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center">
          <span class="text-white text-xl">👑</span>
        </div>
        <p class="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {{ users.filter(u => u.role === 'admin').length }}
        </p>
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ translateUi('user.roleAdmin') }}</p>
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
            :placeholder="translateUi('uiMessages.m9d2f856cd38d')"
            @keyup.enter="applyFilter" 
          />
          
          <select v-model="role" class="input w-full md:w-40" @change="applyFilter">
            <option value="">{{ translateUi('uiMessages.m2878fe586472') }}</option>
            <option value="user">{{ translateUi('user.roleUser') }}</option>
            <option value="admin">{{ translateUi('user.roleAdmin') }}</option>
          </select>
          
          <select v-model="onlyDisabled" class="input w-full md:w-40" @change="applyFilter">
            <option value="">{{ translateUi('uiMessages.m0a379c1e7398') }}</option>
            <option value="false">{{ translateUi('uiMessages.m296de0e31f8c') }}</option>
            <option value="true">{{ translateUi('uiMessages.mbc5a87a757a5') }}</option>
          </select>
          
          <input 
            v-model.number="balanceMin" 
            type="number" 
            class="input w-full md:w-40" 
            :placeholder="translateUi('uiMessages.m9fd9314958cf')"
            @keyup.enter="applyFilter"
          />
          
          <input 
            v-model.number="balanceMax" 
            type="number" 
            class="input w-full md:w-40" 
            :placeholder="translateUi('uiMessages.m33c698bc1957')"
            @keyup.enter="applyFilter"
          />
          
          <button @click="applyFilter" class="btn-primary whitespace-nowrap">
            {{ translateUi('uiMessages.mdd0a97ab3653') }}
          </button>
        </div>
        
        <button 
          @click="openCreateModal"
          class="btn-primary flex items-center justify-center space-x-2"
        >
          <span>➕</span>
          <span>{{ translateUi('admin.createUser') }}</span>
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
          {{ translateUi('uiMessages.ma4660b1813b3') }}
        </h3>
        <div v-if="loadingList" class="flex items-center text-slate-500 dark:text-slate-400">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 mr-2"></div>
          {{ translateUi('common.loading') }}
        </div>
      </div>
      
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b-2 border-slate-200 dark:border-dark-600">
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.m426c4548f68a') }}</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('user.role') }}</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.mee5ad5b61949') }}</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('packages.accountBalance') }}</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.m44c5959863d8') }}</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.m6320b4a8722a') }}</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('canvas.assetPanel.createdAt') }}</th>
              <th class="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.med31fbb483ee') }}</th>
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
                  {{ u.role === 'admin' ? translateUi('user.roleAdmin') : translateUi('common.user') }}
                </span>
              </td>
              
              <!-- 积分资产 -->
              <td class="py-3 px-4">
                <div class="space-y-1">
                  <!-- 套餐积分 -->
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m231413e5c402') }}</span>
                    <span class="font-semibold text-purple-600 dark:text-purple-400">
                      {{ u.package_points || 0 }}
                    </span>
                  </div>
                  <!-- 永久积分 -->
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m91d7f62aad04') }}</span>
                    <span class="font-semibold text-amber-600 dark:text-amber-400">
                      {{ u.points || 0 }}
                    </span>
                  </div>
                  <!-- 总计 -->
                  <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-dark-600">
                    <span class="text-xs text-slate-600 dark:text-slate-300">{{ translateUi('uiMessages.me8dc871a7fde') }}</span>
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
                    {{ formatMoney(u.balance || 0) }}
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
                  {{ u.disabled ? translateUi('uiMessages.mbc5a87a757a5') : translateUi('uiMessages.m296de0e31f8c') }}
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
                    :title="translateUi('admin.editUser')"
                  >
                    ✏️
                  </button>
                  <button 
                    @click="toggleUserStatus(u)" 
                    :disabled="loadingOps"
                    :class="u.disabled ? 'text-green-600 hover:text-green-700' : 'text-yellow-600 hover:text-yellow-700'"
                    :title="u.disabled ? translateUi('directorStudio.inspector.enabled') : translateUi('uiMessages.m7df5c456c765')"
                  >
                    {{ u.disabled ? '✅' : '❌' }}
                  </button>
                  <button 
                    @click="deleteUser(u)" 
                    :disabled="loadingOps"
                    class="text-red-600 hover:text-red-700"
                    :title="translateUi('common.delete')"
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
          <p class="text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m53d758976705') }}</p>
        </div>
      </div>
      
      <!-- 分页 -->
      <div class="flex items-center justify-between mt-6 pt-6 border-t border-slate-200 dark:border-dark-600">
        <div class="text-sm text-slate-500 dark:text-slate-400">
          {{ translateUi('uiMessages.mb6352cd74ec6', { value1: (listRangeStart), value2: (listRangeEnd), value3: (total) }) }}
        </div>
        <div class="flex items-center space-x-2">
          <button 
            @click="prevPage" 
            :disabled="page <= 1"
            class="px-4 py-2 rounded-lg border border-slate-300 dark:border-dark-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
          >
            {{ translateUi('uiMessages.m00c03b055395') }}
          </button>
          <span class="px-4 py-2 text-sm font-medium">{{ translateUi('uiMessages.mbee11b0726bf', { value1: (page) }) }}</span>
          <button 
            @click="nextPage" 
            :disabled="page * pageSize >= total"
            class="px-4 py-2 rounded-lg border border-slate-300 dark:border-dark-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
          >
            {{ translateUi('uiMessages.m64ae71dc137e') }}
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
              <option value="">{{ translateUi('uiMessages.m0a379c1e7398') }}</option>
              <option value="active">{{ translateUi('uiMessages.me85e590b63fe') }}</option>
              <option value="disabled">{{ translateUi('uiMessages.mbc5a87a757a5') }}</option>
            </select>
            
            <button 
              @click="showVoucherFilters = !showVoucherFilters"
              class="btn-secondary flex items-center space-x-2"
            >
              <span>🔍</span>
              <span>{{ showVoucherFilters ? translateUi('uiMessages.m1d72cfbb5baf') : translateUi('uiMessages.m58ddd890c052') }}</span>
            </button>
          </div>
          
          <div class="flex space-x-3">
            <button
              @click="deleteSelectedVouchers"
              :disabled="deletingVouchers || selectedVoucherIds.length === 0"
              class="flex items-center space-x-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :title="selectedVoucherIds.length === 0 ? translateUi('uiMessages.m80cb5e36fcdb') : ''"
            >
              <span>🗑️</span>
              <span>{{ deletingVouchers ? translateUi('uiMessages.m4669785ade95') : selectedVoucherIds.length > 0 ? translateUi('uiMessages.m0bdd94b9bb8d', { value1: (selectedVoucherIds.length) }) : translateUi('uiMessages.mddae7a0fc554') }}</span>
            </button>
            <button 
              @click="exportFilteredVouchers"
              class="btn-secondary flex items-center space-x-2"
            >
              <span>📥</span>
              <span>{{ translateUi('uiMessages.me602ce0f488b') }}</span>
            </button>
            <button 
              @click="openBatchVoucherModal"
              class="btn-primary flex items-center space-x-2"
            >
              <span>➕</span>
              <span>{{ translateUi('uiMessages.mebc56f2228ef') }}</span>
            </button>
          </div>
        </div>
        
        <!-- 高级查询表单 -->
        <div v-if="showVoucherFilters" class="mt-6 pt-6 border-t border-slate-200 dark:border-dark-600">
          <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">{{ translateUi('uiMessages.ma4649151e5e5') }}</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- 兑换码搜索 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('uiMessages.mabbb6156a43e') }}</label>
              <input 
                v-model="voucherFilters.code" 
                type="text" 
                class="input text-sm" 
                :placeholder="translateUi('uiMessages.m9186338718fc')"
              />
            </div>
            
            <!-- 积分区间 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('uiMessages.m1120bb4c6a18') }}</label>
              <input 
                v-model.number="voucherFilters.pointsMin" 
                type="number" 
                class="input text-sm" 
                :placeholder="translateUi('uiMessages.m1120bb4c6a18')"
              />
            </div>
            
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('uiMessages.m311ae2d08d72') }}</label>
              <input 
                v-model.number="voucherFilters.pointsMax" 
                type="number" 
                class="input text-sm" 
                :placeholder="translateUi('uiMessages.m311ae2d08d72')"
              />
            </div>
            
            <!-- 余额区间 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('uiMessages.m3660b213c2eb') }}</label>
              <input 
                v-model.number="voucherFilters.balanceMin" 
                type="number" 
                class="input text-sm" 
                :placeholder="translateUi('uiMessages.m9fd9314958cf')"
              />
            </div>
            
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('uiMessages.mcfe80be3f74b') }}</label>
              <input 
                v-model.number="voucherFilters.balanceMax" 
                type="number" 
                class="input text-sm" 
                :placeholder="translateUi('uiMessages.m33c698bc1957')"
              />
            </div>
            
            <!-- 使用情况 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('uiMessages.me7370f809726') }}</label>
              <select v-model="voucherFilters.usageStatus" class="input text-sm">
                <option value="">{{ translateUi('common.all') }}</option>
                <option value="unused">{{ translateUi('uiMessages.mfa73ed85e86a') }}</option>
                <option value="partial">{{ translateUi('uiMessages.m6e019c39f8cc') }}</option>
                <option value="full">{{ translateUi('uiMessages.m4db0a6fd5841') }}</option>
              </select>
            </div>
            
            <!-- 有效期开始 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('uiMessages.m821e70555286') }}</label>
              <input 
                v-model="voucherFilters.expiresStart" 
                type="date" 
                class="input text-sm"
              />
            </div>
            
            <!-- 有效期结束 -->
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('uiMessages.m04ac524ca788') }}</label>
              <input 
                v-model="voucherFilters.expiresEnd" 
                type="date" 
                class="input text-sm"
              />
            </div>
            
            <!-- 备注搜索 -->
            <div class="md:col-span-2 lg:col-span-3">
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{{ translateUi('directorStudio.inspector.note') }}</label>
              <input 
                v-model="voucherFilters.note" 
                type="text" 
                class="input text-sm" 
                :placeholder="translateUi('uiMessages.m555a7e3a7402')"
              />
            </div>
          </div>
          
          <!-- 查询按钮 -->
          <div class="flex justify-end space-x-3 mt-4">
            <button 
              @click="resetVoucherFilters"
              class="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-dark-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors"
            >
              {{ translateUi('common.reset') }}
            </button>
            <button 
              @click="searchVouchers"
              class="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              {{ translateUi('uiMessages.mbcd6771e08ec') }}
            </button>
          </div>
        </div>
      </div>

      <!-- 兑换券列表 -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-bold gradient-text flex items-center">
            <span class="mr-2">🎫</span>
            {{ translateUi('uiMessages.mb2cd12f0283f') }}
          </h3>
          <div v-if="loadingVouchers" class="flex items-center text-slate-500 dark:text-slate-400">
            <svg class="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>{{ translateUi('common.loading') }}</span>
          </div>
          <div v-else class="text-sm text-slate-500 dark:text-slate-400">
            {{ translateUi('uiMessages.mcb62a538ef4a', { value1: (vouchersTotal) }) }}
            <span v-if="selectedVoucherIds.length > 0" class="ml-2 text-red-600 dark:text-red-400">
              {{ translateUi('uiMessages.m74cf72d8c752', { value1: (selectedVoucherIds.length) }) }}
            </span>
          </div>
        </div>

        <div v-if="vouchers.length === 0 && !loadingVouchers" class="text-center py-12">
          <div class="text-6xl mb-4">🎫</div>
          <p class="text-slate-500 dark:text-slate-400 mb-4">{{ translateUi('uiMessages.m6dd6fd655938') }}</p>
          <button @click="openBatchVoucherModal" class="btn-primary">
            {{ translateUi('uiMessages.m70133d6b7adb') }}
          </button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 dark:bg-dark-600">
              <tr>
                <th class="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    :checked="allVouchersOnPageSelected"
                    @change="toggleSelectAllVouchersOnPage"
                    class="rounded border-slate-300 dark:border-dark-500"
                  />
                </th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">{{ translateUi('uiMessages.mabbb6156a43e') }}</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">{{ translateUi('imageGen.points') }}</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">{{ translateUi('imageGen.balance') }}</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">{{ translateUi('uiMessages.me7370f809726') }}</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">{{ translateUi('uiMessages.ma8e5f1716600') }}</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">{{ translateUi('uiMessages.m6320b4a8722a') }}</th>
                <th class="px-4 py-3 text-left text-slate-700 dark:text-slate-300 font-semibold">{{ translateUi('directorStudio.inspector.note') }}</th>
                <th class="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-semibold">{{ translateUi('uiMessages.med31fbb483ee') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="voucher in vouchers" 
                :key="voucher.id"
                class="border-t border-slate-200 dark:border-dark-600 hover:bg-slate-50 dark:hover:bg-dark-600 transition-colors"
              >
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    :checked="isVoucherSelected(voucher.id)"
                    @change="toggleVoucherSelection(voucher.id)"
                    class="rounded border-slate-300 dark:border-dark-500"
                  />
                </td>
                <td class="px-4 py-3">
                  <code class="px-2 py-1 bg-slate-100 dark:bg-dark-700 rounded text-primary-600 dark:text-primary-400 font-mono">
                    {{ voucher.code }}
                  </code>
                </td>
                <td class="px-4 py-3">
                  <div>
                    <span class="font-semibold text-amber-600 dark:text-amber-400">
                      {{ voucher.points || 0 }}
                    </span>
                    <div v-if="Number(voucher.points || 0) > 0" class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {{ Number(voucher.point_valid_days) === 0 ? translateUi('imageGen.permanentPoints') : translateUi('uiMessages.m84724b82f921', { value1: (voucher.point_valid_days || 365) }) }}
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="font-semibold text-green-600 dark:text-green-400">
                    {{ formatMoney(voucher.balance || 0) }}
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
                      {{ translateUi('uiMessages.mdb8db0530432') }}
                    </button>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span 
                    :class="Number(voucher.expires_at) !== 0 && voucher.expires_at <= Date.now() ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'"
                  >
                    {{ formatExpiryDate(voucher.expires_at) }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span 
                    class="px-2 py-1 rounded-full text-xs font-medium"
                    :class="voucher.status === 'active' 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'"
                  >
                    {{ voucher.status === 'active' ? translateUi('uiMessages.me85e590b63fe') : translateUi('uiMessages.mbc5a87a757a5') }}
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
                      {{ voucher.status === 'active' ? translateUi('uiMessages.m7df5c456c765') : translateUi('directorStudio.inspector.enabled') }}
                    </button>
                    <button
                      @click="deleteVoucher(voucher.id)"
                      class="text-xs px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors dark:bg-red-900/30 dark:text-red-400"
                    >
                      {{ translateUi('common.delete') }}
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
            {{ translateUi('uiMessages.maf08577f58c4', { value1: (vouchersRangeStart), value2: (vouchersRangeEnd), value3: (vouchersTotal) }) }}
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
              {{ translateUi('uiMessages.mc9b9ae7a6144') }}
            </button>
            <button
              @click="nextVouchersPage"
              :disabled="vouchersPage * vouchersPageSize >= vouchersTotal"
              class="px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :class="vouchersPage * vouchersPageSize >= vouchersTotal
                ? 'border-slate-300 dark:border-dark-600 text-slate-400 dark:text-slate-500' 
                : 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'"
            >
              {{ translateUi('uiMessages.m8a8542f69648') }}
            </button>
          </div>
        </div>
      </div>
    </div><!-- 兑换券管理内容结束 -->

    <!-- 优惠券管理内容 -->
    <div v-if="activeTab === 'coupons'">
      <div class="card p-6 mb-6">
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">{{ translateUi('uiMessages.m0ca17c7b6daa') }}</h3>
          <button @click="openCreateCouponModal" class="btn-primary">
            {{ translateUi('uiMessages.m97412bddcfe5') }}
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
              <span v-if="coupon.code_prefix" class="text-xs text-slate-500">{{ translateUi('uiMessages.m01db72232df7', { value1: (coupon.code_prefix) }) }}</span>
            </div>
            <button 
              @click="toggleCouponStatus(coupon)" 
              class="px-2 py-1 text-xs rounded-full transition-all hover:shadow-md cursor-pointer" 
              :class="coupon.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
            >
              {{ coupon.status === 'active' ? translateUi('directorStudio.inspector.enabled') : translateUi('uiMessages.m7df5c456c765') }}
            </button>
          </div>

          <div class="space-y-2 mb-4">
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mf9082aad585f') }}</span>
              <span class="font-medium">{{ coupon.type === 'discount' ? translateUi('uiMessages.mea564f823969') : translateUi('uiMessages.mabc902d94dde') }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m4579fe1ed5eb') }}</span>
              <span class="font-medium text-primary-600">
                {{ coupon.type === 'discount' ? translateUi('uiMessages.m0930a54b2ee5', { value1: ((coupon.discount_value * 10).toFixed(1)) }) : `${currencySymbol.value}${(coupon.balance_value / 100).toFixed(2)}` }}
              </span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m8aec6d9683a6') }}</span>
              <span>{{ formatMoney(coupon.min_amount) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m46cc9629c302') }}</span>
              <span>{{ coupon.usage_limit || translateUi('uiMessages.m9ee3c076a148') }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.mf85003776e3e') }}</span>
              <span>{{ translateUi('uiMessages.mb4baa30d48ff', { value1: (coupon.valid_days) }) }}</span>
            </div>
          </div>

          <div v-if="coupon.stats" class="bg-slate-50 dark:bg-dark-700 rounded p-3 mb-4 space-y-1">
            <div class="flex justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.md56cb581b9fe') }}</span>
              <span class="font-medium">{{ coupon.stats.total_generated || 0 }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.md706ca80adbc') }}</span>
              <span class="font-medium">{{ coupon.stats.claimed_count || 0 }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m033166ce7385') }}</span>
              <span class="font-medium text-green-600">{{ coupon.stats.used_count || 0 }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m41f4a669a727') }}</span>
              <span class="font-medium text-primary-600">{{ coupon.stats.available_count || 0 }}</span>
            </div>
          </div>

          <div class="flex gap-2">
            <button @click="openGenerateCouponModal(coupon)" class="btn-secondary text-xs flex-1">
              {{ translateUi('uiMessages.m9b9ea8adfe53') }}
            </button>
            <button @click="viewCouponCodes(coupon)" class="btn-secondary text-xs flex-1">
              {{ translateUi('uiMessages.mb3c434fdb7b6') }}
            </button>
          </div>
          <div class="flex gap-2 mt-2">
            <button @click="openEditCouponModal(coupon)" class="btn-secondary text-xs flex-1">
              {{ translateUi('uiMessages.m0ed9861c7c8e') }}
            </button>
            <button @click="deleteCoupon(coupon.id)" class="btn-danger text-xs flex-1">
              {{ translateUi('uiMessages.ma6c5bde81d0f') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建优惠券模态框 -->
    <div v-if="showCreateCouponModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showCreateCouponModal = false">
      <div class="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">{{ translateUi('uiMessages.mccfca67b00a5') }}</h3>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.mad5d6bbfd493') }}</label>
            <input v-model="couponForm.name" type="text" class="input" :placeholder="translateUi('uiMessages.m6c52515a1703')" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.mb84f5c48567b') }}</label>
            <input v-model="couponForm.code_prefix" type="text" class="input" :placeholder="translateUi('uiMessages.m3822d8f5d8c1')" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m7174b8fc4c61') }}</label>
            <select v-model="couponForm.type" class="input">
              <option value="discount">{{ translateUi('uiMessages.mea564f823969') }}</option>
              <option value="balance">{{ translateUi('uiMessages.mabc902d94dde') }}</option>
            </select>
          </div>
          <div v-if="couponForm.type === 'discount'">
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m729cc8ebd883') }}</label>
            <input v-model.number="couponForm.discount_value" type="number" step="0.01" min="0.01" max="0.99" class="input" :placeholder="translateUi('uiMessages.mca7e6bb0abdc')" />
          </div>
          <div v-if="couponForm.type === 'balance'">
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m2b757ba7ddb6') }}</label>
            <input v-model.number="couponForm.balance_value" type="number" class="input" :placeholder="translateUi('uiMessages.m6a47678e489c', { value1: (currencyUnitLabel) })" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.ma7692ff15b7b') }}</label>
            <input v-model.number="couponForm.min_amount" type="number" class="input" :placeholder="translateUi('uiMessages.m5a6ade652b90')" />
          </div>
          <div v-if="couponForm.type === 'discount'">
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.mb7154feb5ff9') }}</label>
            <input v-model.number="couponForm.max_discount" type="number" class="input" :placeholder="translateUi('uiMessages.m0287d1f45b91')" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m0edca6dd9930') }}</label>
            <input v-model.number="couponForm.usage_limit" type="number" class="input" :placeholder="translateUi('uiMessages.me3884640f874')" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m3481a74eaca1') }}</label>
            <input v-model.number="couponForm.valid_days" type="number" class="input" placeholder="30" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.mdc2ba467fc7a') }}</label>
            <textarea v-model="couponForm.description" class="input" rows="2" :placeholder="translateUi('uiMessages.m7b7efc053b09')"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('directorStudio.inspector.note') }}</label>
            <textarea v-model="couponForm.notes" class="input" rows="2" :placeholder="translateUi('uiMessages.m1f1ba55e7a98')"></textarea>
          </div>
        </div>
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex gap-3">
          <button @click="showCreateCouponModal = false" class="btn-secondary flex-1">{{ translateUi('common.cancel') }}</button>
          <button @click="createCoupon" class="btn-primary flex-1">{{ translateUi('uiMessages.mcde2cd071d25') }}</button>
        </div>
      </div>
    </div>

    <!-- 编辑优惠券模态框 -->
    <div v-if="showEditCouponModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showEditCouponModal = false">
      <div class="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">{{ translateUi('uiMessages.mad480d763b69') }}</h3>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.mad5d6bbfd493') }}</label>
            <input v-model="couponForm.name" type="text" class="input" :placeholder="translateUi('uiMessages.m6c52515a1703')" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.mb84f5c48567b') }}</label>
            <input v-model="couponForm.code_prefix" type="text" class="input" :placeholder="translateUi('uiMessages.m3822d8f5d8c1')" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m7174b8fc4c61') }}</label>
            <select v-model="couponForm.type" class="input">
              <option value="discount">{{ translateUi('uiMessages.mea564f823969') }}</option>
              <option value="balance">{{ translateUi('uiMessages.mabc902d94dde') }}</option>
            </select>
          </div>
          <div v-if="couponForm.type === 'discount'">
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m729cc8ebd883') }}</label>
            <input v-model.number="couponForm.discount_value" type="number" step="0.01" min="0.01" max="0.99" class="input" :placeholder="translateUi('uiMessages.mca7e6bb0abdc')" />
          </div>
          <div v-if="couponForm.type === 'balance'">
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m2b757ba7ddb6') }}</label>
            <input v-model.number="couponForm.balance_value" type="number" class="input" :placeholder="translateUi('uiMessages.m6a47678e489c', { value1: (currencyUnitLabel) })" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.ma7692ff15b7b') }}</label>
            <input v-model.number="couponForm.min_amount" type="number" class="input" :placeholder="translateUi('uiMessages.m5a6ade652b90')" />
          </div>
          <div v-if="couponForm.type === 'discount'">
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.mb7154feb5ff9') }}</label>
            <input v-model.number="couponForm.max_discount" type="number" class="input" :placeholder="translateUi('uiMessages.m0287d1f45b91')" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m0edca6dd9930') }}</label>
            <input v-model.number="couponForm.usage_limit" type="number" class="input" :placeholder="translateUi('uiMessages.me3884640f874')" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m3481a74eaca1') }}</label>
            <input v-model.number="couponForm.valid_days" type="number" class="input" placeholder="30" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.mdc2ba467fc7a') }}</label>
            <textarea v-model="couponForm.description" class="input" rows="2" :placeholder="translateUi('uiMessages.m7b7efc053b09')"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ translateUi('directorStudio.inspector.note') }}</label>
            <textarea v-model="couponForm.notes" class="input" rows="2" :placeholder="translateUi('uiMessages.m1f1ba55e7a98')"></textarea>
          </div>
        </div>
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex gap-3">
          <button @click="showEditCouponModal = false" class="btn-secondary flex-1">{{ translateUi('common.cancel') }}</button>
          <button @click="updateCoupon" class="btn-primary flex-1">{{ translateUi('common.save') }}</button>
        </div>
      </div>
    </div>

    <!-- 生成优惠券码模态框 -->
    <div v-if="showGenerateCouponModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showGenerateCouponModal = false">
      <div class="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">{{ translateUi('uiMessages.mf7e455d26460') }}</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{{ currentCoupon?.name }}</p>
        </div>
        <div class="p-6">
          <label class="block text-sm font-medium mb-2">{{ translateUi('uiMessages.m4bdec538dc13') }}</label>
          <input v-model.number="generateCouponForm.count" type="number" min="1" max="1000" class="input" />
        </div>
        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex gap-3">
          <button @click="showGenerateCouponModal = false" class="btn-secondary flex-1">{{ translateUi('common.cancel') }}</button>
          <button @click="generateCoupons" class="btn-primary flex-1">{{ translateUi('nav.generate') }}</button>
        </div>
      </div>
    </div>

    <!-- 查看优惠券码模态框 -->
    <div v-if="showCouponCodesModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showCouponCodesModal = false">
      <div class="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-xl font-bold text-slate-900 dark:text-white">{{ translateUi('uiMessages.m2b7837422d36') }}</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{{ translateUi('uiMessages.m5e0b033edc7e', { value1: (currentCoupon?.name), value2: (couponCodes.length) }) }}</p>
        </div>
        <div class="p-6">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-slate-200 dark:border-dark-600">
                  <th class="text-left py-2 px-4 text-sm font-medium">{{ translateUi('uiMessages.mf4fefaaa6e9e') }}</th>
                  <th class="text-left py-2 px-4 text-sm font-medium">{{ translateUi('uiMessages.m6320b4a8722a') }}</th>
                  <th class="text-left py-2 px-4 text-sm font-medium">{{ translateUi('uiMessages.mc5018eca4465') }}</th>
                  <th class="text-left py-2 px-4 text-sm font-medium">{{ translateUi('uiMessages.m76639714fa76') }}</th>
                  <th class="text-left py-2 px-4 text-sm font-medium">{{ translateUi('uiMessages.ma8e5f1716600') }}</th>
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
                      {{ code.status === 'unused' ? translateUi('uiMessages.mfa73ed85e86a') : code.status === 'used' ? translateUi('uiMessages.m9845c165151d') : translateUi('user.expired') }}
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
          <button @click="showCouponCodesModal = false" class="btn-secondary w-full">{{ translateUi('common.close') }}</button>
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
        <h2 class="text-xl font-bold text-slate-800 dark:text-white mb-6">{{ translateUi('uiMessages.m9afcce31a7e0') }}</h2>
        
        <!-- SMTP配置 -->
        <div class="space-y-6">
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">{{ translateUi('uiMessages.m7c66fde4d9e7') }}</h3>
            <p class="text-sm text-blue-700 dark:text-blue-400 mb-4">
              {{ translateUi('uiMessages.m5039505e0bf9') }}
            </p>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {{ translateUi('uiMessages.m5713d00adc99') }} <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="emailConfig.smtp_host"
                  type="text"
                  :placeholder="translateUi('uiMessages.md21ba6ac74b2')"
                  class="input"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {{ translateUi('uiMessages.m21fb121b8190') }}
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {{ translateUi('uiMessages.mc10f8ad454e6') }}
                </label>
                <input
                  v-model.number="emailConfig.smtp_port"
                  type="number"
                  :placeholder="translateUi('uiMessages.m70bf49df9fa8')"
                  class="input"
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {{ translateUi('uiMessages.mcb1c80e2fa49') }} <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="emailConfig.smtp_user"
                  type="text"
                  :placeholder="translateUi('uiMessages.m2c4bf4206881')"
                  class="input"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {{ translateUi('uiMessages.m297f73507de7') }}
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {{ translateUi('uiMessages.m43e8e74262f5') }} <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="emailConfig.smtp_password"
                  type="password"
                  :placeholder="translateUi('uiMessages.m67d2300e0bd3')"
                  class="input"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {{ translateUi('uiMessages.m6c6679ac831a') }}
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {{ translateUi('uiMessages.m3e40a49606f7') }} <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="emailConfig.from_email"
                  type="email"
                  :placeholder="translateUi('uiMessages.m3fded64dfdb8')"
                  class="input"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {{ translateUi('uiMessages.ma24e400bd9ad') }}
                </p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {{ translateUi('uiMessages.m544ab76df11c') }}
                </label>
                <input
                  v-model="emailConfig.from_name"
                  type="text"
                  :placeholder="translateUi('uiMessages.mfbab33b75f46')"
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
                  {{ translateUi('uiMessages.m3a9acdce30df') }}
                </label>
              </div>
            </div>
          </div>

          <!-- 注册验证配置 -->
          <div class="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-purple-900 dark:text-purple-300 mb-2">{{ translateUi('uiMessages.mbf07715f639f') }}</h3>
            
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
                    {{ translateUi('uiMessages.mdd3efe7c1bf4') }}
                  </label>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {{ translateUi('uiMessages.mca2cd2b84d4d') }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 邮箱白名单配置 -->
          <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-green-900 dark:text-green-300 mb-2">{{ translateUi('uiMessages.m86a2f8b766ef') }}</h3>
            <p class="text-sm text-green-700 dark:text-green-400 mb-4">
              {{ translateUi('uiMessages.mab94f82715c7') }}
            </p>
            
            <div class="space-y-3">
              <div class="flex space-x-2">
                <input
                  v-model="whitelistInput"
                  type="text"
                  :placeholder="translateUi('uiMessages.ma5023f3f0eac')"
                  class="input flex-1"
                  @keyup.enter="addToWhitelist"
                />
                <button
                  @click="addToWhitelist"
                  class="btn-primary"
                >
                  {{ translateUi('common.add') }}
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
                {{ translateUi('uiMessages.m5bf4af9795cd') }}
              </p>
            </div>
          </div>

          <!-- 测试邮件 -->
          <div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <h3 class="text-lg font-semibold text-orange-900 dark:text-orange-300 mb-2">{{ translateUi('uiMessages.m8f9cad03084b') }}</h3>
            <p class="text-sm text-orange-700 dark:text-orange-400 mb-4">
              <strong>{{ translateUi('uiMessages.m48bdecd9858f') }}</strong>{{ translateUi('uiMessages.m11a4d004b0dd') }}
            </p>
            
            <div class="flex space-x-2">
              <input
                v-model="testEmail"
                type="email"
                :placeholder="translateUi('uiMessages.m3a8b0ed2f2cf')"
                class="input flex-1"
              />
              <button
                @click="sendTestEmail"
                :disabled="loadingOps"
                class="btn-secondary"
              >
                {{ loadingOps ? translateUi('auth.sending') : translateUi('uiMessages.mf9ae1a31638d') }}
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
              {{ loadingOps ? translateUi('common.saving') : translateUi('uiMessages.m43e03303b3ea') }}
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
          <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">{{ translateUi('admin.packages') }}</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{{ translateUi('uiMessages.m308ee0908563') }}</p>
        </div>

        <div v-if="loadingPackages" class="p-12 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="mt-2 text-slate-600 dark:text-slate-400">{{ translateUi('common.loading') }}</p>
        </div>

        <div v-else-if="packages.length === 0" class="p-12 text-center">
          <p class="text-slate-500 dark:text-slate-400">{{ translateUi('packages.noPlan') }}</p>
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
                  {{ pkg.enabled ? translateUi('directorStudio.inspector.enabled') : translateUi('uiMessages.m7df5c456c765') }}
                </span>
              </div>

              <div class="space-y-2 mb-4 text-sm">
                <div class="flex justify-between">
                  <span class="text-slate-600 dark:text-slate-400">{{ translateUi('packages.price') }}</span>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">{{ formatMoney(pkg.price) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-600 dark:text-slate-400">{{ translateUi('imageGen.points') }}</span>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">{{ pkg.points }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m2b66a2b53a76') }}</span>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">{{ pkg.concurrent_limit }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-600 dark:text-slate-400">{{ translateUi('videoGen.duration') }}</span>
                  <span class="font-semibold text-slate-900 dark:text-slate-100">{{ translateUi('uiMessages.mb4baa30d48ff', { value1: (pkg.duration_days) }) }}</span>
                </div>
              </div>

              <div class="flex gap-2">
                <button 
                  @click="openEditPackage(pkg)" 
                  class="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
                >
                  {{ translateUi('common.edit') }}
                </button>
                <button 
                  @click="togglePackageEnabled(pkg)" 
                  class="flex-1 px-3 py-2 text-sm rounded transition-colors"
                  :class="pkg.enabled 
                    ? 'bg-slate-200 dark:bg-dark-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-dark-500' 
                    : 'bg-green-600 text-white hover:bg-green-700'"
                >
                  {{ pkg.enabled ? translateUi('uiMessages.m7df5c456c765') : translateUi('directorStudio.inspector.enabled') }}
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

      <!-- 只读提示 -->
      <div class="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-amber-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-sm text-amber-700 dark:text-amber-400">{{ translateUi('uiMessages.m188e85cffcb6') }} <span class="font-semibold">{{ translateUi('uiMessages.m4fdf852b97d1') }}</span> {{ translateUi('uiMessages.m6305987066af') }}</p>
        </div>
      </div>

      <!-- 支付方式列表（只读） -->
      <div class="card">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">{{ translateUi('uiMessages.m726450e432fa') }}</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">{{ translateUi('uiMessages.m80287eb22e05') }}</p>
        </div>

        <div v-if="loadingPayment" class="p-12 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p class="mt-2 text-slate-600 dark:text-slate-400">{{ translateUi('common.loading') }}</p>
        </div>

        <div v-else-if="paymentMethods.length === 0" class="p-12 text-center">
          <p class="text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.md343df58afb8') }}</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-slate-50 dark:bg-dark-700">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">ID</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{{ translateUi('uiMessages.m6320b4a8722a') }}</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{{ translateUi('uiMessages.ma98585871c53') }}</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{{ translateUi('uiMessages.mc1e15394c450') }}</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{{ translateUi('uiMessages.m581a31636a0d') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-dark-600">
              <tr 
                v-for="method in paymentMethods" 
                :key="method.id"
                class="hover:bg-slate-50 dark:hover:bg-dark-700/50"
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-slate-900 dark:text-slate-100">{{ method.id }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span 
                    class="px-2 py-1 text-xs rounded-full"
                    :class="method.enabled ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-dark-600 text-slate-500 dark:text-slate-400'"
                  >
                    {{ method.enabled ? translateUi('directorStudio.panorama.active') : translateUi('uiMessages.mbc5a87a757a5') }}
                  </span>
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
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div><!-- 支付配置管理内容结束 -->

    <!-- 套餐编辑模态框 -->
    <div v-if="showEditPackageModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeEditPackage">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100">{{ translateUi('uiMessages.m1fa3cf0b99e0') }}</h3>
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
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{{ translateUi('uiMessages.m5636b6cd712f') }}</label>
            <input v-model="packageForm.name" class="input w-full" type="text" :placeholder="translateUi('uiMessages.m959de862e023')" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{{ translateUi('uiMessages.m5da54b27a36f') }}</label>
              <input v-model.number="packageForm.points" class="input w-full" type="number" min="0" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{{ translateUi('uiMessages.m44c5959863d8') }}</label>
              <input v-model.number="packageForm.concurrent_limit" class="input w-full" type="number" min="1" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{{ translateUi('uiMessages.m834dab8a179f') }}</label>
              <input v-model.number="packageForm.duration_days" class="input w-full" type="number" min="1" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{{ translateUi('uiMessages.m208ddce30623', { value1: (currencyUnitLabel) }) }}</label>
              <input v-model.number="packageForm.price" class="input w-full" type="number" min="0" step="0.01" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{{ translateUi('uiMessages.mdc2ba467fc7a') }}</label>
            <textarea v-model="packageForm.description" class="input w-full" rows="3" :placeholder="translateUi('uiMessages.ma496603c7f84')"></textarea>
          </div>
        </div>

        <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex justify-end space-x-3">
          <button @click="closeEditPackage" class="btn-secondary">{{ translateUi('common.cancel') }}</button>
          <button @click="savePackage" :disabled="loadingOps" class="btn-primary">
            {{ loadingOps ? translateUi('common.saving') : translateUi('common.save') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 创建用户模态框 -->
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showCreateModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">{{ translateUi('uiMessages.m91885892aded') }}</h3>
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
              {{ translateUi('auth.username') }} <span class="text-red-500">*</span>
            </label>
            <input v-model="createForm.username" class="input" :placeholder="translateUi('uiMessages.m98c0045afac1')" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('auth.email') }}
            </label>
            <input v-model="createForm.email" class="input" :placeholder="translateUi('uiMessages.m7ff14080d304')" type="email" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('auth.password') }} <span class="text-red-500">*</span>
            </label>
            <input v-model="createForm.password" class="input" :placeholder="translateUi('uiMessages.m7673702e6ff6')" type="password" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('user.role') }}
            </label>
            <select v-model="createForm.role" class="input">
              <option value="user">{{ translateUi('user.roleUser') }}</option>
              <option value="admin">{{ translateUi('user.roleAdmin') }}</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('uiMessages.m93aa5ac9b93b') }}
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
            {{ translateUi('common.cancel') }}
          </button>
          <button 
            @click="createUser" 
            :disabled="loadingCreate"
            class="flex-1 btn-primary disabled:opacity-60"
          >
            {{ loadingCreate ? translateUi('uiMessages.m687d8f3ba99e') : translateUi('admin.createUser') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑用户模态框 -->
    <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showEditModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">{{ translateUi('uiMessages.m85431d3d2790') }}</h3>
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
              {{ translateUi('auth.username') }} <span class="text-red-500">*</span>
            </label>
            <input v-model="editForm.username" class="input" :placeholder="translateUi('uiMessages.m98c0045afac1')" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('auth.email') }}
            </label>
            <input v-model="editForm.email" class="input" :placeholder="translateUi('uiMessages.m106814c8c2aa')" type="email" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('uiMessages.m3fb2d5e4d20c') }}
            </label>
            <input v-model="editForm.password" class="input" :placeholder="translateUi('uiMessages.m31f06817c0dc')" type="password" />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m97ef6679265a') }}</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('user.role') }}
            </label>
            <select v-model="editForm.role" class="input">
              <option value="user">{{ translateUi('user.roleUser') }}</option>
              <option value="admin">{{ translateUi('user.roleAdmin') }}</option>
            </select>
          </div>
          
          <!-- 积分资产 -->
          <div class="p-4 bg-gradient-to-r from-purple-50 to-amber-50 dark:from-purple-900/20 dark:to-amber-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <h4 class="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center">
              <span class="mr-2">💎</span>
              {{ translateUi('uiMessages.mee5ad5b61949') }}
            </h4>
            
            <div class="space-y-3">
              <!-- 套餐积分 -->
              <div class="bg-white dark:bg-dark-600 rounded-lg p-3">
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  {{ translateUi('uiMessages.m6f0e92dc1792') }}
                </label>
                <input 
                  v-model.number="editForm.package_points" 
                  class="input text-sm" 
                  :placeholder="translateUi('imageGen.packagePoints')"
                  type="number" 
                  min="0" 
                  readonly
                  disabled
                />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ translateUi('uiMessages.mad12aef9cd78') }}
                </p>
              </div>
              
              <!-- 永久积分 -->
              <div class="bg-white dark:bg-dark-600 rounded-lg p-3">
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  {{ translateUi('uiMessages.m917dc38a8447') }}
                </label>
                <input 
                  v-model.number="editForm.points" 
                  class="input text-sm" 
                  :placeholder="translateUi('imageGen.permanentPoints')"
                  type="number" 
                  min="0" 
                />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ translateUi('uiMessages.md0a30b6801c5') }}
                </p>
              </div>
              
              <!-- 总计 -->
              <div class="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-dark-600">
                <span class="text-sm font-medium text-slate-600 dark:text-slate-400">{{ translateUi('uiMessages.m26849e6fee0c') }}</span>
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
              {{ translateUi('packages.accountBalance') }}
            </h4>
            
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  {{ translateUi('uiMessages.me23ef2ab9984', { value1: (currencyUnitLabel) }) }}
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
                    {{ translateUi('user.recharge') }}
                  </button>
                </div>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ translateUi('uiMessages.m89c7c04194b4') }}
                </p>
              </div>
            </div>
          </div>
          
          <!-- 并发限制 -->
          <div>
            <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center space-x-2">
              <span>⚡</span>
              <span>{{ translateUi('uiMessages.m44c5959863d8') }}</span>
            </h4>
            
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  {{ translateUi('uiMessages.m16242143b74a') }}
                </label>
                <input 
                  v-model.number="editForm.concurrent_limit" 
                  type="number"
                  min="1"
                  max="100"
                  class="input text-sm w-full" 
                />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ translateUi('uiMessages.m1d6ada367a48') }}
                </p>
              </div>
            </div>
          </div>
          
          <!-- 禁用选项 -->
          <div>
            <label class="flex items-center space-x-2 cursor-pointer">
              <input v-model="editForm.disabled" type="checkbox" class="rounded border-slate-300 dark:border-dark-600" />
              <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ translateUi('uiMessages.mc17e36e04467') }}</span>
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
            {{ translateUi('common.cancel') }}
          </button>
          <button 
            @click="saveEdit" 
            :disabled="loadingOps"
            class="flex-1 btn-primary disabled:opacity-60"
          >
            {{ loadingOps ? translateUi('common.saving') : translateUi('uiMessages.mecf0ea01192d') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 余额充值模态框 -->
    <div v-if="showRechargeModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showRechargeModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">{{ translateUi('uiMessages.m6dc7848bc9ea') }}</h3>
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
              {{ translateUi('uiMessages.m16f98321796a') }} <span class="font-bold">{{ rechargeForm.username }}</span> {{ translateUi('uiMessages.m19dd57394b91') }}
            </p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('uiMessages.mdaaa1096ba1b', { value1: (currencyUnitLabel) }) }} <span class="text-red-500">*</span>
            </label>
            <input 
              v-model.number="rechargeForm.amount" 
              class="input w-full" 
              :placeholder="translateUi('uiMessages.m7d79e4e79841')"
              type="number" 
              step="0.01"
              @keyup.enter="submitRecharge"
            />
            <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {{ translateUi('uiMessages.m55222c31ccb3') }}
            </p>
            <div class="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p class="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <svg class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span><strong>{{ translateUi('uiMessages.m308d6b0e2c43') }}</strong>{{ translateUi('uiMessages.m974578107ff0') }}</span>
              </p>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {{ translateUi('uiMessages.mc6ed0a907a2d') }}
            </label>
            <textarea 
              v-model="rechargeForm.description" 
              class="input w-full" 
              :placeholder="translateUi('uiMessages.m82924de54634')"
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
            {{ translateUi('common.cancel') }}
          </button>
          <button 
            @click="submitRecharge" 
            :disabled="loadingOps || !rechargeForm.amount || rechargeForm.amount <= 0"
            class="flex-1 btn-primary disabled:opacity-60"
          >
            {{ loadingOps ? translateUi('uiMessages.mcbcf88a05fa4') : translateUi('user.confirmRecharge') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 系统设置模态框 -->
    <div v-if="showSettingsModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showSettingsModal = false">
      <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-slate-200 dark:border-dark-600">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold gradient-text">{{ translateUi('admin.settings') }}</h3>
            <button @click="showSettingsModal = false" class="text-slate-400 hover:text-slate-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6 space-y-6">
          <!-- 提示信息 -->
          <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div class="text-sm text-blue-700 dark:text-blue-200">
                <p class="font-medium mb-1">{{ translateUi('uiMessages.me1732e48ceb8') }}</p>
                <p>{{ translateUi('uiMessages.m0e23c0e4f3b5') }}</p>
              </div>
            </div>
          </div>

          <!-- 兑换券外部链接设置 -->
          <div class="pt-6 border-t border-slate-200 dark:border-dark-600">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center">
              <span class="mr-2">🎫</span>
              {{ translateUi('uiMessages.m22fdd2644fe6') }}
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
                    {{ translateUi('uiMessages.m13a47e671fa7') }}
                  </span>
                </label>
              </div>
              
              <div v-if="settings.voucher_external_link.enabled">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {{ translateUi('uiMessages.m2b79301b1f55') }}
                </label>
                <input 
                  v-model="settings.voucher_external_link.button_text" 
                  class="input" 
                  type="text" 
                  :placeholder="translateUi('uiMessages.md47a6701b858')"
                />
              </div>
              
              <div v-if="settings.voucher_external_link.enabled">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {{ translateUi('uiMessages.m6a13001be1fc') }} <span class="text-red-500">*</span>
                </label>
                <input 
                  v-model="settings.voucher_external_link.url" 
                  class="input" 
                  type="url" 
                  :placeholder="translateUi('uiMessages.mf020457aa989')"
                />
                <p class="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {{ translateUi('uiMessages.m7a3f7c7d9433') }}
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
                    {{ translateUi('uiMessages.m79c5e0bab4eb') }}
                  </span>
                </label>
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
            {{ translateUi('common.cancel') }}
          </button>
          <button 
            @click="saveSettings" 
            :disabled="loadingOps"
            class="flex-1 btn-primary disabled:opacity-60"
          >
            {{ loadingOps ? translateUi('common.saving') : translateUi('uiMessages.mc8550237ba70') }}
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
        {{ translateUi('uiMessages.ma6af84ddd434') }}
      </h3>
      <p class="text-slate-500 dark:text-slate-400">
        {{ translateUi('uiMessages.m95621f4bb629') }}
      </p>
    </div>
  </div>

  <!-- 批量生成兑换券模态框 -->
  <div v-if="showBatchVoucherModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="showBatchVoucherModal = false">
    <div class="bg-white dark:bg-dark-700 rounded-xl shadow-2xl max-w-md w-full mx-4">
      <div class="p-6 border-b border-slate-200 dark:border-dark-600">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold gradient-text">{{ translateUi('uiMessages.m70133d6b7adb') }}</h3>
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
            {{ translateUi('uiMessages.m1e3c56a9a4ca') }} <span class="text-red-500">*</span>
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
            {{ translateUi('uiMessages.m42a6bb595ff0') }}
            <span class="text-xs text-slate-500 ml-1">{{ translateUi('uiMessages.m72dd3bbc6780') }}</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.points" 
            type="number"
            min="0"
            class="input"
            :placeholder="translateUi('uiMessages.m5c5ac4aa6c49')"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {{ translateUi('uiMessages.m1e4bb35ba802', { value1: (currencyUnitLabel) }) }}
            <span class="text-xs text-slate-500 ml-1">{{ translateUi('uiMessages.m72dd3bbc6780') }}</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.balance" 
            type="number"
            min="0"
            step="0.01"
            class="input"
            :placeholder="translateUi('uiMessages.m096fa8c7516d')"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {{ translateUi('uiMessages.m4bb8746e936b') }} <span class="text-red-500">*</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.max_uses" 
            type="number"
            min="1"
            class="input"
            :placeholder="translateUi('uiMessages.meaee5f831e83')"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {{ translateUi('uiMessages.m2b68f9f71560') }} <span class="text-red-500">*</span>
          </label>
          <input 
            v-model.number="batchVoucherForm.days" 
            type="number"
            min="0"
            class="input"
            :placeholder="translateUi('uiMessages.mf6ed616ba67a')"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {{ translateUi('uiMessages.m94ad566bb141') }}
            <span class="text-xs text-slate-500 ml-1">{{ translateUi('uiMessages.m1aeb350a7813') }}</span>
          </label>
          <input
            v-model.number="batchVoucherForm.point_valid_days"
            type="number"
            min="0"
            class="input"
            :placeholder="translateUi('uiMessages.m2ff47f240edc')"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {{ translateUi('uiMessages.mb405227c7e3f') }}
          </label>
          <textarea 
            v-model="batchVoucherForm.note" 
            rows="3"
            class="input"
            :placeholder="translateUi('uiMessages.m292787c69a9d')"
          ></textarea>
        </div>
      </div>
      
      <div class="p-6 border-t border-slate-200 dark:border-dark-600 flex justify-end space-x-3">
        <button 
          @click="showBatchVoucherModal = false"
          class="btn-secondary"
          :disabled="loadingCreate"
        >
          {{ translateUi('common.cancel') }}
        </button>
        <button 
          @click="createBatchVouchers"
          class="btn-primary"
          :disabled="loadingCreate"
        >
          <span v-if="loadingCreate">{{ translateUi('imageGen.generating') }}</span>
          <span v-else>{{ translateUi('nav.generate') }}</span>
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
            <h3 class="text-xl font-bold gradient-text">{{ translateUi('uiMessages.m28dd843bce76') }}</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {{ translateUi('uiMessages.m4c0ada9838a3') }} <code class="px-2 py-1 bg-slate-100 dark:bg-dark-600 rounded font-mono">{{ currentVoucher?.code }}</code>
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
          <p class="text-slate-500 dark:text-slate-400">{{ translateUi('uiMessages.m0e46428f8758') }}</p>
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
                  {{ redemption.username || translateUi('uiMessages.m1ac13841ba2e') }}
                </p>
                <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {{ translateUi('uiMessages.m568d9d30a76e') }} <span class="font-semibold text-amber-600 dark:text-amber-400">{{ redemption.points }}</span> {{ translateUi('imageGen.points') }}
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
