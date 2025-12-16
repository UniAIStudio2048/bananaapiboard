<script setup>
/**
 * UserProfilePanel.vue - 画布模式个人中心浮动面板
 * 点击左侧工具栏的P按钮时弹出
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { redeemVoucher as redeemVoucherApi } from '@/api/client'
import { getTenantHeaders } from '@/config/tenant'
import { formatPoints, formatBalance } from '@/utils/format'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  userInfo: {
    type: Object,
    default: null
  },
  position: {
    type: Object,
    default: () => ({ x: 80, y: 100 })
  }
})

const emit = defineEmits(['close', 'update'])

const router = useRouter()
const token = localStorage.getItem('token')

// 当前激活的菜单
const activeMenu = ref('home')

// 数据
const ledger = ref([])
const packages = ref([])
const invite = ref({ invite_code: '', uses: [] })
const checkinStatus = ref({ hasCheckedInToday: false, consecutiveDays: 0 })
const loading = ref(false)

// 套餐悬浮提示状态
const hoveredPackage = ref(null)
const packageTooltipPosition = ref({ x: 0, y: 0 })

// 表单
const profileForm = ref({ username: '', email: '', bio: '' })
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const saveLoading = ref(false)

// 兑换券
const voucherCode = ref('')
const voucherLoading = ref(false)
const voucherError = ref('')
const voucherSuccess = ref('')

// 充值
const showRechargePanel = ref(false)
const rechargeAmount = ref(0)
const rechargeCustomAmount = ref('')
const rechargeLoading = ref(false)
const rechargeError = ref('')
const quickAmounts = [300, 500, 1000, 5000, 10000]
const paymentMethods = ref([])
const rechargeSelectedMethod = ref(null)
const rechargeCouponCode = ref('')
const appliedRechargeCoupon = ref(null)
const rechargeCouponDiscount = ref(0)
const rechargeCouponError = ref('')

// 余额划转
const transferAmount = ref('')
const transferLoading = ref(false)
const exchangeRate = ref(10) // 1元 = 10积分

// 新手引导设置
const onboardingEnabled = ref(localStorage.getItem('canvasOnboardingEnabled') === 'true')

// 连线样式设置
const edgeStyleOptions = [
  { value: 'smoothstep', labelKey: 'onboarding.settings.edgeStyleSmoothstep' },
  { value: 'bezier', labelKey: 'onboarding.settings.edgeStyleBezier' },
  { value: 'straight', labelKey: 'onboarding.settings.edgeStyleStraight' },
  { value: 'hidden', labelKey: 'onboarding.settings.edgeStyleHidden' }
]
const selectedEdgeStyle = ref(localStorage.getItem('canvasEdgeStyle') || 'smoothstep')

// 切换新手引导
function toggleOnboarding(event) {
  const enabled = event.target.checked
  onboardingEnabled.value = enabled
  localStorage.setItem('canvasOnboardingEnabled', enabled ? 'true' : 'false')
  
  // 如果打开了引导，同时重置完成状态，这样下次进入画布会显示
  if (enabled) {
    localStorage.removeItem('canvasOnboardingCompleted')
  }
}

// 切换连线样式
function changeEdgeStyle(style) {
  selectedEdgeStyle.value = style
  localStorage.setItem('canvasEdgeStyle', style)
  // 通知画布更新连线样式
  window.dispatchEvent(new CustomEvent('canvas-edge-style-change', { detail: { style } }))
}

// 自定义对话框
const dialog = ref({
  visible: false,
  type: 'alert', // 'alert' | 'confirm'
  title: '',
  message: '',
  confirmText: '',
  cancelText: '',
  onConfirm: null,
  onCancel: null
})

// 显示提示对话框
function showAlert(message, title) {
  const displayTitle = title || t('common.tip')
  return new Promise((resolve) => {
    dialog.value = {
      visible: true,
      type: 'alert',
      title: displayTitle,
      message,
      confirmText: t('common.confirm'),
      onConfirm: () => {
        dialog.value.visible = false
        resolve(true)
      }
    }
  })
}

// 显示确认对话框
function showConfirm(message, title) {
  const displayTitle = title || t('common.confirm')
  return new Promise((resolve) => {
    dialog.value = {
      visible: true,
      type: 'confirm',
      title: displayTitle,
      message,
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        dialog.value.visible = false
        resolve(true)
      },
      onCancel: () => {
        dialog.value.visible = false
        resolve(false)
      }
    }
  })
}

// 菜单列表（使用简洁的符号图标）
const menuItems = computed(() => [
  { id: 'home', icon: 'home', label: t('user.home') },
  { id: 'profile', icon: 'settings', label: t('user.accountSettings') },
  { id: 'packages', icon: 'package', label: t('user.packages') },
  { id: 'points', icon: 'diamond', label: t('user.pointsManage') },
  { id: 'voucher', icon: 'ticket', label: t('user.redeemCenter') },
  { id: 'invite', icon: 'gift', label: t('user.invite') },
  { id: 'help', icon: 'help', label: t('user.tutorial') }
])

// SVG 图标组件
const icons = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  package: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  diamond: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/><path d="M12 22L6 9"/><path d="M12 22l6-13"/></svg>`,
  ticket: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 013-3h14a3 3 0 013 3v0a3 3 0 01-3 3v0a3 3 0 00-3 3v0a3 3 0 01-3 3H5a3 3 0 01-3-3v-6z"/><path d="M13 6v2"/><path d="M13 12v2"/><path d="M13 16v2"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  credit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  brush: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 114.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 00-3-3.02z"/></svg>`,
  message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12"/><path d="M15 9.5a3 3 0 00-3-2.5c-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5a3 3 0 01-3-2.5"/></svg>`
}

// 初始化数据
watch(() => props.visible, async (val) => {
  if (val) {
    await loadData()
    if (props.userInfo) {
      profileForm.value = {
        username: props.userInfo.username || '',
        email: props.userInfo.email || '',
        bio: props.userInfo.bio || ''
      }
    }
  }
}, { immediate: true })

// 加载数据
async function loadData() {
  if (!token) return
  loading.value = true
  
  try {
    const headers = { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    
    const [ledgerRes, packagesRes, inviteRes, checkinRes] = await Promise.all([
      fetch('/api/user/points', { headers }),
      fetch('/api/packages', { headers }),
      fetch('/api/user/invite-code', { headers }),
      fetch('/api/user/checkin-status', { headers })
    ])
    
    if (ledgerRes.ok) {
      const data = await ledgerRes.json()
      ledger.value = Array.isArray(data) ? data : (data.records || data.ledger || [])
    }
    if (packagesRes.ok) {
      const data = await packagesRes.json()
      packages.value = data.packages || []
    }
    if (inviteRes.ok) invite.value = await inviteRes.json()
    if (checkinRes.ok) checkinStatus.value = await checkinRes.json()
  } catch (e) {
    console.error('加载数据失败:', e)
  } finally {
    loading.value = false
  }
}

// 关闭面板
function closePanel() {
  emit('close')
}

// 签到
async function performCheckin() {
  if (checkinStatus.value.hasCheckedInToday) return
  
  try {
    const headers = { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    const res = await fetch('/api/user/checkin', { method: 'POST', headers })
    if (res.ok) {
      const data = await res.json()
      checkinStatus.value.hasCheckedInToday = true
      checkinStatus.value.consecutiveDays++
      emit('update')
      showAlert(t('user.checkinSuccessMsg', { points: data.reward }), `🎉 ${t('user.checkinSuccess')}`)
    }
  } catch (e) {
    showAlert(t('user.checkinFailed'))
  }
}

// 兑换券
async function redeemVoucher() {
  if (!voucherCode.value.trim()) {
    voucherError.value = t('voucher.enterCode')
    return
  }
  
  voucherLoading.value = true
  voucherError.value = ''
  voucherSuccess.value = ''
  
  try {
    const result = await redeemVoucherApi(voucherCode.value.trim())
    voucherSuccess.value = result.message || t('voucher.redeemSuccess')
    voucherCode.value = ''
    emit('update')
    setTimeout(() => { voucherSuccess.value = '' }, 3000)
  } catch (e) {
    voucherError.value = e.message || t('voucher.redeemFailed')
  } finally {
    voucherLoading.value = false
  }
}

// 保存资料
async function saveProfile() {
  saveLoading.value = true
  try {
    const headers = { 
      ...getTenantHeaders(), 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify(profileForm.value)
    })
    if (res.ok) {
      emit('update')
      showAlert(t('user.profileSaved'), `✓ ${t('common.success')}`)
    } else {
      showAlert(t('user.saveFailed'))
    }
  } catch (e) {
    showAlert(t('user.saveFailed'))
  } finally {
    saveLoading.value = false
  }
}

// 修改密码
async function changePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    showAlert(t('user.passwordMismatch'))
    return
  }
  if (passwordForm.value.newPassword.length < 6) {
    showAlert(t('user.passwordMinLength'))
    return
  }
  
  saveLoading.value = true
  try {
    const headers = { 
      ...getTenantHeaders(), 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch('/api/user/change-password', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        oldPassword: passwordForm.value.oldPassword,
        newPassword: passwordForm.value.newPassword
      })
    })
    if (res.ok) {
      showAlert(t('user.passwordChanged'), `✓ ${t('common.success')}`)
      passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    } else {
      const data = await res.json()
      showAlert(data.error || t('user.passwordChangeFailed'))
    }
  } catch (e) {
    showAlert(t('user.passwordChangeFailed'))
  } finally {
    saveLoading.value = false
  }
}

// 套餐悬浮处理
function handlePackageMouseEnter(pkg, event) {
  hoveredPackage.value = pkg
  // 计算提示框位置（相对于套餐卡片）
  const rect = event.currentTarget.getBoundingClientRect()
  packageTooltipPosition.value = {
    x: rect.right + 10,
    y: rect.top
  }
}

function handlePackageMouseLeave() {
  hoveredPackage.value = null
}

// 购买套餐
async function purchasePackage(pkg) {
  // 检查余额是否足够
  if ((props.userInfo?.balance || 0) < pkg.price) {
    showAlert(t('packages.insufficientBalance', { 
      current: ((props.userInfo?.balance || 0) / 100).toFixed(2), 
      required: (pkg.price / 100).toFixed(2) 
    }))
    return
  }
  
  const confirmed = await showConfirm(
    t('packages.purchaseConfirmMsg', { 
      name: pkg.name, 
      price: (pkg.price / 100).toFixed(2), 
      points: pkg.points 
    }), 
    t('packages.purchaseConfirm')
  )
  if (!confirmed) return
  
  try {
    const headers = { 
      ...getTenantHeaders(), 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch('/api/packages/purchase', {
      method: 'POST',
      headers,
      body: JSON.stringify({ package_id: pkg.id })
    })
    const data = await res.json()
    
    if (res.ok && !data.pay_url) {
      // 余额支付成功
      showAlert(data.message || t('packages.purchaseSuccessMsg', { points: pkg.points }), `🎉 ${t('packages.purchaseSuccess')}`)
      emit('update')
    } else if (data.pay_url) {
      // 需要跳转支付
      window.open(data.pay_url, '_blank')
    } else {
      showAlert(data.message || data.error || t('packages.purchaseFailed'))
    }
  } catch (e) {
    showAlert(t('packages.purchaseFailed'))
  }
}

// 打开充值面板
async function openRechargePanel() {
  showRechargePanel.value = true
  rechargeAmount.value = 0
  rechargeCustomAmount.value = ''
  rechargeSelectedMethod.value = null
  rechargeError.value = ''
  rechargeCouponCode.value = ''
  appliedRechargeCoupon.value = null
  rechargeCouponDiscount.value = 0
  rechargeCouponError.value = ''
  
  // 加载支付方式
  try {
    const headers = { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    const res = await fetch('/api/user/payment-methods', { headers })
    if (res.ok) {
      const data = await res.json()
      paymentMethods.value = data.methods || []
      if (paymentMethods.value.length > 0) {
        rechargeSelectedMethod.value = paymentMethods.value[0].id
      }
    }
  } catch (e) {
    console.error('[openRechargePanel] 加载支付方式失败:', e)
  }
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

// 应用优惠券
async function applyRechargeCoupon() {
  if (!rechargeCouponCode.value || !rechargeCouponCode.value.trim()) {
    rechargeCouponError.value = t('user.enterCouponCode')
    return
  }
  
  const amount = getFinalRechargeAmount()
  if (amount < 100) {
    rechargeCouponError.value = t('user.selectAmountFirst')
    return
  }
  
  try {
    const headers = {
      ...getTenantHeaders(),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code: rechargeCouponCode.value.trim().toUpperCase(),
        package_id: null,
        amount: amount
      })
    })
    
    const data = await res.json()
    
    if (!res.ok) {
      rechargeCouponError.value = data.message || t('user.couponValidateFailed')
      return
    }
    
    appliedRechargeCoupon.value = data.coupon
    rechargeCouponDiscount.value = data.discount_amount
    rechargeCouponError.value = ''
    showAlert(t('user.couponApplied'), `✓ ${t('common.success')}`)
    
  } catch (e) {
    console.error('[applyRechargeCoupon] error:', e)
    rechargeCouponError.value = t('user.couponValidateFailed')
  }
}

// 移除优惠券
function removeRechargeCoupon() {
  rechargeCouponCode.value = ''
  appliedRechargeCoupon.value = null
  rechargeCouponDiscount.value = 0
  rechargeCouponError.value = ''
}

// 充值
async function submitRecharge() {
  const amount = getFinalRechargeAmount()
  
  if (amount < 100) {
    rechargeError.value = t('user.minRechargeAmount')
    showAlert(rechargeError.value)
    return
  }
  if (amount > 150000) {
    rechargeError.value = t('user.maxRechargeAmount')
    showAlert(rechargeError.value)
    return
  }
  if (!rechargeSelectedMethod.value) {
    rechargeError.value = t('user.selectPaymentMethod')
    showAlert(rechargeError.value)
    return
  }
  
  rechargeLoading.value = true
  rechargeError.value = ''
  
  try {
    const headers = { 
      ...getTenantHeaders(), 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    
    const payload = {
      amount: amount,
      payment_method_id: rechargeSelectedMethod.value
    }
    
    // 如果使用了优惠券，添加优惠券码
    if (appliedRechargeCoupon.value) {
      payload.coupon_code = rechargeCouponCode.value.trim().toUpperCase()
    }
    
    const res = await fetch('/api/user/recharge', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    
    const data = await res.json()
    
    if (!res.ok) {
      throw new Error(data.message || t('user.createOrderFailed'))
    }
    
    // 跳转到支付页面前，设置待刷新标记
    if (data.pay_url) {
      localStorage.setItem('pending_payment_refresh', 'true')
      localStorage.setItem('payment_timestamp', Date.now().toString())
      window.location.href = data.pay_url
    } else {
      showAlert(t('user.rechargeOrderCreated'), `✓ ${t('common.success')}`)
      showRechargePanel.value = false
    }
  } catch (e) {
    rechargeError.value = e.message || t('user.rechargeFailed')
    showAlert(rechargeError.value)
  } finally {
    rechargeLoading.value = false
  }
}

// 余额划转
async function submitTransfer() {
  const yuan = parseFloat(transferAmount.value)
  if (!yuan || yuan <= 0) {
    showAlert(t('user.enterTransferAmount'))
    return
  }
  
  if (yuan < 1) {
    showAlert(t('user.minTransferAmount'))
    return
  }
  
  const amountInCents = Math.floor(yuan * 100) // 转换为分
  const points = Math.floor(yuan * exchangeRate.value)
  
  // 检查余额是否足够
  if (props.userInfo?.balance < amountInCents) {
    showAlert(t('user.insufficientBalanceTransfer', { balance: ((props.userInfo?.balance || 0) / 100).toFixed(2) }))
    return
  }
  
  const confirmed = await showConfirm(
    t('user.transferConfirmMsg', { amount: yuan.toFixed(2), points: points }), 
    t('user.transferConfirm')
  )
  if (!confirmed) return
  
  transferLoading.value = true
  try {
    const headers = { 
      ...getTenantHeaders(), 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    const res = await fetch('/api/user/balance-to-points', {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: amountInCents })
    })
    const data = await res.json()
    if (res.ok) {
      showAlert(data.message || t('user.transferSuccessMsg', { points: data.points || points }), `🎉 ${t('user.transferSuccess')}`)
      transferAmount.value = ''
      emit('update')
    } else {
      showAlert(data.message || data.error || t('user.transferFailed'))
    }
  } catch (e) {
    showAlert(t('user.transferFailed'))
  } finally {
    transferLoading.value = false
  }
}

// 复制邀请码
function copyInviteCode() {
  if (invite.value.invite_code) {
    navigator.clipboard.writeText(invite.value.invite_code)
    showAlert(t('user.inviteCodeCopied'), `✓ ${t('common.copySuccess')}`)
  }
}

// 复制邀请链接
function copyInviteLink() {
  const link = `${window.location.origin}/?invite=${invite.value.invite_code}`
  navigator.clipboard.writeText(link)
  showAlert(t('user.inviteLinkCopied'), `✓ ${t('common.copySuccess')}`)
}

// 退出登录
async function logout() {
  const confirmed = await showConfirm(t('user.logoutConfirmMsg'), t('user.logoutConfirm'))
  if (confirmed) {
    localStorage.removeItem('token')
    localStorage.removeItem('userMode')
    router.push('/')
  }
}

// 跳转到帮助
function goToHelp() {
  // 可以打开帮助弹窗或跳转
  window.open('/help', '_blank')
}

// 格式化时间
function formatTime(ts) {
  return new Date(ts).toLocaleString('zh-CN')
}

// 格式化过期时间
function formatExpireTime(ts) {
  if (!ts) return ''
  const days = Math.ceil((ts - Date.now()) / 86400000)
  return days > 0 ? t('user.expiresInDays', { days }) : t('user.expired')
}

// 获取积分图标类型
function getLedgerIconType(type) {
  const iconMap = { 
    register: 'gift', 
    checkin: 'calendar', 
    invite: 'gift', 
    generate: 'brush', 
    recharge: 'credit', 
    package: 'package' 
  }
  return iconMap[type] || 'coin'
}

// 获取积分类型文字
function getLedgerTypeText(type) {
  const key = `user.ledgerType.${type}`
  const translated = t(key)
  // 如果翻译返回的还是 key 本身，说明没找到翻译，返回原始类型
  return translated === key ? type : translated
}
</script>

<template>
  <Teleport to="body">
    <Transition name="panel">
      <div v-if="visible" class="profile-panel-overlay" @click.self="closePanel">
        <div 
          class="profile-panel"
          :style="{ left: `${position.x}px`, top: `${position.y}px` }"
        >
          <!-- 用户信息头部 -->
          <div class="panel-header">
            <div class="user-avatar">
              {{ userInfo?.username?.charAt(0)?.toUpperCase() || 'U' }}
            </div>
            <div class="user-info">
              <h3 class="user-name">{{ userInfo?.username || t('common.user') }}</h3>
              <p class="user-email">{{ userInfo?.email || t('user.noEmail') }}</p>
            </div>
            <button class="close-btn" @click="closePanel">×</button>
          </div>

          <!-- 快捷数据 -->
          <div class="quick-stats">
            <div class="stat-item">
              <span class="stat-icon" v-html="icons.diamond"></span>
              <span class="stat-value">{{ formatPoints(userInfo?.points || 0) }}</span>
              <span class="stat-label">{{ t('user.permanentPoints') }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-icon" v-html="icons.star"></span>
              <span class="stat-value">{{ formatPoints(userInfo?.package_points || 0) }}</span>
              <span class="stat-label">{{ t('user.packagePoints') }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-icon" v-html="icons.coin"></span>
              <span class="stat-value">¥{{ formatBalance(userInfo?.balance || 0) }}</span>
              <span class="stat-label">{{ t('user.balance') }}</span>
            </div>
          </div>

          <!-- 导航菜单 -->
          <nav class="panel-nav">
            <button 
              v-for="item in menuItems" 
              :key="item.id"
              :class="['nav-item', { active: activeMenu === item.id }]"
              @click="activeMenu = item.id"
            >
              <span class="nav-icon" v-html="icons[item.icon]"></span>
              <span class="nav-label">{{ item.label }}</span>
            </button>
          </nav>

          <!-- 内容区域 -->
          <div class="panel-content">
            <!-- 个人主页 -->
            <div v-if="activeMenu === 'home'" class="content-section">
              <!-- 签到卡片 -->
              <div class="checkin-card">
                <div class="checkin-info">
                  <span class="checkin-days">{{ t('user.consecutiveCheckin', { days: checkinStatus.consecutiveDays }) }}</span>
                </div>
                <button 
                  class="checkin-btn"
                  :class="{ disabled: checkinStatus.hasCheckedInToday }"
                  :disabled="checkinStatus.hasCheckedInToday"
                  @click="performCheckin"
                >
                  {{ checkinStatus.hasCheckedInToday ? `✓ ${t('user.checkedIn')}` : t('user.checkinForPoints') }}
                </button>
              </div>

              <!-- 快捷操作 -->
              <div class="quick-actions">
                <button class="action-btn primary" @click="activeMenu = 'packages'">
                  <span class="action-icon" v-html="icons.package"></span>
                  <span>{{ t('user.buyPackage') }}</span>
                </button>
                <button class="action-btn" @click="activeMenu = 'voucher'">
                  <span class="action-icon" v-html="icons.ticket"></span>
                  <span>{{ t('user.redeem') }}</span>
                </button>
                <button class="action-btn" @click="openRechargePanel">
                  <span class="action-icon" v-html="icons.credit"></span>
                  <span>{{ t('user.recharge') }}</span>
                </button>
                <button class="action-btn" @click="activeMenu = 'invite'">
                  <span class="action-icon" v-html="icons.gift"></span>
                  <span>{{ t('user.inviteShort') }}</span>
                </button>
              </div>

              <!-- 套餐状态 -->
              <div v-if="userInfo?.package_points > 0" class="package-status">
                <div class="package-badge">VIP</div>
                <div class="package-info">
                  <span>{{ t('user.packagePoints') }} {{ formatPoints(userInfo.package_points) }}</span>
                  <span class="expire-hint">{{ formatExpireTime(userInfo.package_points_expires_at) }}</span>
                </div>
              </div>
            </div>

            <!-- 账户管理 -->
            <div v-else-if="activeMenu === 'profile'" class="content-section">
              <h4 class="section-title">{{ t('user.basicInfo') }}</h4>
              <div class="form-group">
                <label>{{ t('user.username') }}</label>
                <input v-model="profileForm.username" type="text" :placeholder="t('user.enterUsername')" maxlength="30" />
              </div>
              <div class="form-group">
                <label>{{ t('user.email') }}</label>
                <input v-model="profileForm.email" type="email" :placeholder="t('user.enterEmail')" />
              </div>
              <div class="form-group">
                <label>{{ t('user.bio') }}</label>
                <textarea v-model="profileForm.bio" :placeholder="t('user.enterBio')" maxlength="200" rows="2"></textarea>
              </div>
              <button class="btn-primary" @click="saveProfile" :disabled="saveLoading">
                {{ saveLoading ? t('common.saving') : t('user.saveProfile') }}
              </button>

              <h4 class="section-title" style="margin-top: 24px;">{{ t('user.changePassword') }}</h4>
              <div class="form-group">
                <label>{{ t('user.oldPassword') }}</label>
                <input v-model="passwordForm.oldPassword" type="password" :placeholder="t('user.enterOldPassword')" />
              </div>
              <div class="form-group">
                <label>{{ t('user.newPassword') }}</label>
                <input v-model="passwordForm.newPassword" type="password" :placeholder="t('user.enterNewPassword')" />
              </div>
              <div class="form-group">
                <label>{{ t('user.confirmPassword') }}</label>
                <input v-model="passwordForm.confirmPassword" type="password" :placeholder="t('user.enterConfirmPassword')" />
              </div>
              <button class="btn-primary" @click="changePassword" :disabled="saveLoading">
                {{ t('user.changePassword') }}
              </button>
            </div>

            <!-- 订阅套餐 -->
            <div v-else-if="activeMenu === 'packages'" class="content-section">
              <div v-if="packages.length === 0" class="empty-hint">{{ t('packages.noPackages') }}</div>
              <div v-else class="packages-list">
                <div 
                  v-for="pkg in packages" 
                  :key="pkg.id"
                  :class="['package-card', { popular: pkg.popular, hovered: hoveredPackage?.id === pkg.id }]"
                  @mouseenter="handlePackageMouseEnter(pkg, $event)"
                  @mouseleave="handlePackageMouseLeave"
                >
                  <div class="package-header">
                    <span class="package-name">{{ pkg.name }}</span>
                    <span v-if="pkg.popular" class="popular-badge">{{ t('packages.recommended') }}</span>
                  </div>
                  <div class="package-price">
                    <span class="price">¥{{ (pkg.price / 100).toFixed(0) }}</span>
                    <span class="unit">/{{ pkg.duration_days }}{{ t('time.days') }}</span>
                  </div>
                  <div class="package-points">{{ pkg.points }} {{ t('user.points') }}</div>
                  <button class="btn-purchase" @click="purchasePackage(pkg)">
                    {{ t('packages.buy') }}
                  </button>
                </div>
              </div>
              
              <!-- 套餐详情悬浮提示 -->
              <Teleport to="body">
                <Transition name="tooltip-fade">
                  <div 
                    v-if="hoveredPackage" 
                    class="package-tooltip"
                    :style="{
                      left: packageTooltipPosition.x + 'px',
                      top: packageTooltipPosition.y + 'px'
                    }"
                  >
                    <div class="tooltip-header">
                      <span class="tooltip-name">{{ hoveredPackage.name }}</span>
                      <span v-if="hoveredPackage.popular" class="tooltip-badge">{{ t('packages.recommended') }}</span>
                    </div>
                    <div class="tooltip-content">
                      <p v-if="hoveredPackage.description" class="tooltip-desc">{{ hoveredPackage.description }}</p>
                      <div class="tooltip-details">
                        <div class="detail-item">
                          <span class="detail-icon">💎</span>
                          <span class="detail-text">{{ t('packages.includePoints', { points: hoveredPackage.points }) }}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-icon">⏱️</span>
                          <span class="detail-text">{{ t('packages.validFor', { days: hoveredPackage.duration_days }) }}</span>
                        </div>
                        <div class="detail-item">
                          <span class="detail-icon">⚡</span>
                          <span class="detail-text">{{ t('packages.concurrent', { limit: hoveredPackage.concurrent_limit || 1 }) }}</span>
                        </div>
                        <div class="detail-item price-highlight">
                          <span class="detail-icon">💰</span>
                          <span class="detail-text">{{ t('packages.price') }} <strong>¥{{ (hoveredPackage.price / 100).toFixed(2) }}</strong></span>
                        </div>
                      </div>
                    </div>
                    <div class="tooltip-arrow"></div>
                  </div>
                </Transition>
              </Teleport>
            </div>

            <!-- 积分管理 -->
            <div v-else-if="activeMenu === 'points'" class="content-section">
              <!-- 余额划转 -->
              <div class="transfer-section">
                <h4 class="section-title">{{ t('user.balanceToPoints') }}</h4>
                <p class="transfer-hint">{{ t('user.exchangeRateHint', { rate: exchangeRate }) }}</p>
                <div class="transfer-form">
                  <input 
                    v-model="transferAmount" 
                    type="number" 
                    :placeholder="t('user.enterTransferAmount')" 
                    min="1"
                  />
                  <button class="btn-primary" @click="submitTransfer" :disabled="transferLoading">
                    {{ transferLoading ? t('user.transferring') : t('user.confirmTransfer') }}
                  </button>
                </div>
              </div>

              <h4 class="section-title">{{ t('user.pointsRecord') }}</h4>
              <div v-if="!Array.isArray(ledger) || ledger.length === 0" class="empty-hint">{{ t('user.noRecord') }}</div>
              <div v-else class="ledger-list">
                <div v-for="item in (Array.isArray(ledger) ? ledger : []).slice(0, 20)" :key="item.id" class="ledger-item">
                  <span class="ledger-icon" v-html="icons[getLedgerIconType(item.type)]"></span>
                  <div class="ledger-info">
                    <span class="ledger-type">{{ getLedgerTypeText(item.type) }}</span>
                    <span class="ledger-time">{{ formatTime(item.ts) }}</span>
                  </div>
                  <span :class="['ledger-amount', item.value > 0 ? 'positive' : 'negative']">
                    {{ item.value > 0 ? '+' : '' }}{{ formatPoints(item.value) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 兑换中心 -->
            <div v-else-if="activeMenu === 'voucher'" class="content-section">
              <h4 class="section-title">{{ t('user.voucherRedeem') }}</h4>
              <div class="voucher-form">
                <input 
                  v-model="voucherCode" 
                  type="text" 
                  :placeholder="t('user.enterVoucherCode')"
                  @keyup.enter="redeemVoucher"
                />
                <button class="btn-primary" @click="redeemVoucher" :disabled="voucherLoading">
                  {{ voucherLoading ? t('user.redeeming') : t('user.redeemNow') }}
                </button>
              </div>
              <div v-if="voucherError" class="msg-error">{{ voucherError }}</div>
              <div v-if="voucherSuccess" class="msg-success">{{ voucherSuccess }}</div>

              <div class="voucher-tips">
                <h5>{{ t('user.redeemTips') }}</h5>
                <ul>
                  <li>{{ t('user.redeemTip1') }}</li>
                  <li>{{ t('user.redeemTip2') }}</li>
                  <li>{{ t('user.redeemTip3') }}</li>
                </ul>
              </div>
            </div>

            <!-- 邀请奖励 -->
            <div v-else-if="activeMenu === 'invite'" class="content-section">
              <div class="invite-card">
                <h4>{{ t('user.myInviteCode') }}</h4>
                <div class="invite-code">{{ invite.invite_code || t('common.loading') }}</div>
                <div class="invite-actions">
                  <button class="btn-copy" @click="copyInviteCode">
                    <span class="btn-icon" v-html="icons.copy"></span>
                    <span>{{ t('user.copyInviteCode') }}</span>
                  </button>
                  <button class="btn-copy" @click="copyInviteLink">
                    <span class="btn-icon" v-html="icons.link"></span>
                    <span>{{ t('user.copyInviteLink') }}</span>
                  </button>
                </div>
              </div>

              <div class="invite-stats">
                <div class="stat">
                  <span class="stat-num">{{ invite.uses?.length || 0 }}</span>
                  <span class="stat-label">{{ t('user.invited') }}</span>
                </div>
                <div class="stat">
                  <span class="stat-num">{{ (invite.uses?.length || 0) * 10 }}</span>
                  <span class="stat-label">{{ t('user.earnedPoints') }}</span>
                </div>
              </div>

              <div class="invite-tips">
                <h5>{{ t('user.inviteRules') }}</h5>
                <ul>
                  <li>{{ t('user.inviteRule1') }}</li>
                  <li>{{ t('user.inviteRule2') }}</li>
                  <li>{{ t('user.inviteRule3') }}</li>
                </ul>
              </div>
            </div>

            <!-- 使用教程 -->
            <div v-else-if="activeMenu === 'help'" class="content-section">
              <div class="help-list">
                <div class="help-item" @click="goToHelp">
                  <span class="help-icon" v-html="icons.book"></span>
                  <span class="help-text">{{ t('user.quickStart') }}</span>
                  <span class="help-arrow">→</span>
                </div>
                <div class="help-item">
                  <span class="help-icon" v-html="icons.brush"></span>
                  <span class="help-text">{{ t('user.canvasTutorial') }}</span>
                  <span class="help-arrow">→</span>
                </div>
                <div class="help-item">
                  <span class="help-icon" v-html="icons.diamond"></span>
                  <span class="help-text">{{ t('user.aiGenerateTips') }}</span>
                  <span class="help-arrow">→</span>
                </div>
                <div class="help-item">
                  <span class="help-icon" v-html="icons.message"></span>
                  <span class="help-text">{{ t('user.contactSupport') }}</span>
                  <span class="help-arrow">→</span>
                </div>
              </div>
              
              <!-- 新手引导设置 -->
              <div class="settings-section">
                <div class="setting-item">
                  <div class="setting-info">
                    <span class="setting-label">{{ t('onboarding.settings.showOnboarding') }}</span>
                    <span class="setting-desc">{{ t('onboarding.settings.showOnboardingDesc') }}</span>
                  </div>
                  <label class="toggle-switch">
                    <input 
                      type="checkbox" 
                      :checked="onboardingEnabled"
                      @change="toggleOnboarding"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                
                <!-- 连线样式设置 -->
                <div class="setting-item edge-style-setting">
                  <div class="setting-info">
                    <span class="setting-label">{{ t('onboarding.settings.edgeStyle') }}</span>
                    <span class="setting-desc">{{ t('onboarding.settings.edgeStyleDesc') }}</span>
                  </div>
                </div>
                <div class="edge-style-options">
                  <button 
                    v-for="option in edgeStyleOptions"
                    :key="option.value"
                    :class="['edge-style-btn', { active: selectedEdgeStyle === option.value }]"
                    @click="changeEdgeStyle(option.value)"
                  >
                    <span class="edge-style-icon">
                      <svg v-if="option.value === 'smoothstep'" viewBox="0 0 40 20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 16 H12 Q14 16 14 14 V6 Q14 4 16 4 H38" stroke-linecap="round" fill="none"/>
                      </svg>
                      <svg v-else-if="option.value === 'bezier'" viewBox="0 0 40 20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 16 C14 16, 26 4, 38 4" stroke-linecap="round" fill="none"/>
                      </svg>
                      <svg v-else-if="option.value === 'straight'" viewBox="0 0 40 20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 16 L38 4" stroke-linecap="round" fill="none"/>
                      </svg>
                      <svg v-else viewBox="0 0 40 20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 10 H38" stroke-linecap="round" stroke-dasharray="4 3" opacity="0.4" fill="none"/>
                      </svg>
                    </span>
                    <span class="edge-style-label">{{ t(option.labelKey) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部操作 -->
          <div class="panel-footer">
            <button class="logout-btn" @click="logout">
              <span class="logout-icon" v-html="icons.logout"></span>
              <span>{{ t('user.logout') }}</span>
            </button>
          </div>

          <!-- 充值面板 -->
          <div v-if="showRechargePanel" class="recharge-panel">
            <div class="recharge-header">
              <h4>{{ t('user.accountRecharge') }}</h4>
              <button class="close-btn" @click="showRechargePanel = false">×</button>
            </div>
            
            <!-- 快捷金额 -->
            <div class="form-section">
              <label class="form-label">{{ t('user.selectAmount') }}</label>
              <div class="recharge-amounts">
                <button 
                  v-for="amount in quickAmounts" 
                  :key="amount"
                  :class="['amount-btn', { active: rechargeAmount === amount }]"
                  @click="rechargeAmount = amount; rechargeCustomAmount = ''"
                >
                  ¥{{ (amount / 100).toFixed(0) }}
                </button>
              </div>
            </div>
            
            <!-- 自定义金额 -->
            <div class="form-section">
              <label class="form-label">{{ t('user.customAmountHint') }}</label>
              <input 
                v-model="rechargeCustomAmount" 
                type="number" 
                class="form-input"
                placeholder="1-1500"
                min="1"
                max="1500"
                step="1"
                @input="rechargeAmount = 0"
              />
            </div>
            
            <!-- 支付方式选择 -->
            <div v-if="paymentMethods.length > 0" class="form-section">
              <label class="form-label">{{ t('user.paymentMethod') }}</label>
              <select v-model="rechargeSelectedMethod" class="form-select">
                <option v-for="method in paymentMethods" :key="method.id" :value="method.id">
                  {{ method.name }}
                </option>
              </select>
            </div>
            
            <!-- 优惠券输入 -->
            <div class="form-section">
              <label class="form-label">{{ t('user.couponCode') }}</label>
              <div class="coupon-input-group">
                <input 
                  v-model="rechargeCouponCode" 
                  type="text" 
                  class="form-input"
                  :placeholder="t('user.enterCouponCode')"
                  :disabled="!!appliedRechargeCoupon"
                  @input="rechargeCouponCode = rechargeCouponCode.toUpperCase()"
                />
                <button 
                  v-if="!appliedRechargeCoupon"
                  class="btn-apply-coupon" 
                  @click="applyRechargeCoupon"
                  :disabled="!rechargeCouponCode.trim()"
                >
                  {{ t('user.applyCoupon') }}
                </button>
                <button 
                  v-else
                  class="btn-remove-coupon" 
                  @click="removeRechargeCoupon"
                >
                  {{ t('user.removeCoupon') }}
                </button>
              </div>
              <div v-if="rechargeCouponError" class="msg-error">{{ rechargeCouponError }}</div>
              <div v-if="appliedRechargeCoupon" class="msg-success">
                ✓ {{ t('user.couponApplied') }} -¥{{ (rechargeCouponDiscount / 100).toFixed(2) }}
              </div>
            </div>
            
            <!-- 价格信息 -->
            <div v-if="getFinalRechargeAmount() > 0" class="price-info">
              <div class="price-row">
                <span>{{ t('user.rechargeAmount') }}</span>
                <span>¥{{ (getFinalRechargeAmount() / 100).toFixed(2) }}</span>
              </div>
              <div v-if="appliedRechargeCoupon && rechargeCouponDiscount > 0" class="price-row discount">
                <span>{{ t('user.couponDiscount') }}</span>
                <span>-¥{{ (rechargeCouponDiscount / 100).toFixed(2) }}</span>
              </div>
              <div class="price-row total">
                <span>{{ t('user.actualPayment') }}</span>
                <span class="total-price">
                  ¥{{ ((getFinalRechargeAmount() - rechargeCouponDiscount) / 100).toFixed(2) }}
                </span>
              </div>
            </div>
            
            <!-- 错误提示 -->
            <div v-if="rechargeError" class="msg-error">{{ rechargeError }}</div>
            
            <!-- 提交按钮 -->
            <button 
              class="btn-primary full-width" 
              @click="submitRecharge" 
              :disabled="rechargeLoading || getFinalRechargeAmount() < 100"
            >
              {{ rechargeLoading ? t('user.processing') : t('user.confirmRecharge') }}
            </button>
          </div>

          <!-- 自定义对话框 -->
          <Transition name="dialog">
            <div v-if="dialog.visible" class="custom-dialog-overlay" @click.stop @click.self="dialog.type === 'confirm' && dialog.onCancel?.()">
              <div class="custom-dialog">
                <div class="dialog-header">
                  <h4 class="dialog-title">{{ dialog.title }}</h4>
                </div>
                <div class="dialog-body">
                  <p class="dialog-message">{{ dialog.message }}</p>
                </div>
                <div class="dialog-footer">
                  <button 
                    v-if="dialog.type === 'confirm'" 
                    class="dialog-btn cancel" 
                    @click="dialog.onCancel?.()"
                  >
                    {{ dialog.cancelText }}
                  </button>
                  <button 
                    class="dialog-btn confirm" 
                    @click="dialog.onConfirm?.()"
                  >
                    {{ dialog.confirmText }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 遮罩层 */
.profile-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

/* 面板主体 */
.profile-panel {
  position: fixed;
  width: 380px;
  max-height: calc(100vh - 120px);
  background: rgba(26, 26, 26, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.user-email {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

/* 快捷数据 */
.quick-stats {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
}

.stat-icon {
  width: 20px;
  height: 20px;
  color: rgba(255, 255, 255, 0.6);
}

.stat-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.stat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

/* 导航菜单 */
.panel-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 450;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.nav-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

/* 内容区域 */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.content-section {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
}

/* 签到卡片 */
.checkin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  margin-bottom: 20px;
}

.checkin-days {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
}

.checkin-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.checkin-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.22);
  border-color: rgba(255, 255, 255, 0.35);
}

.checkin-btn.disabled {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.4);
  cursor: not-allowed;
}

/* 快捷操作 */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.action-btn.primary {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.95);
}

.action-btn.primary:hover {
  background: rgba(255, 255, 255, 0.22);
  border-color: rgba(255, 255, 255, 0.35);
}

.action-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

/* 套餐状态 */
.package-status {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
}

.package-badge {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
}

.package-info {
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: #fff;
}

.expire-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

/* 表单 */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  transition: all 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.form-group textarea {
  resize: none;
}

/* 按钮 */
.btn-primary {
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.22);
  border-color: rgba(255, 255, 255, 0.35);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary.full-width {
  width: 100%;
}

/* 套餐列表 */
.packages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.package-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  transition: all 0.2s;
}

.package-card:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.package-card.popular {
  border-color: rgba(102, 126, 234, 0.5);
  background: rgba(102, 126, 234, 0.1);
}

.package-header {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.package-name {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.popular-badge {
  padding: 2px 8px;
  background: #667eea;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: white;
}

.package-price {
  text-align: right;
}

.package-price .price {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.package-price .unit {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.package-points {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.btn-purchase {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-purchase:hover {
  background: #667eea;
  border-color: #667eea;
}

/* 套餐悬浮状态 */
.package-card.hovered {
  border-color: rgba(102, 126, 234, 0.6);
  background: rgba(102, 126, 234, 0.15);
  transform: translateX(2px);
}

/* 套餐详情悬浮提示框 */
.package-tooltip {
  position: fixed;
  z-index: 10000;
  width: 280px;
  background: linear-gradient(145deg, rgba(35, 35, 45, 0.98) 0%, rgba(25, 25, 35, 0.98) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 
    0 20px 40px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  pointer-events: none;
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tooltip-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.tooltip-badge {
  padding: 3px 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  color: white;
}

.tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tooltip-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
  margin: 0;
}

.tooltip-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.detail-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.detail-text strong {
  color: #fff;
  font-weight: 600;
}

.detail-item.price-highlight {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.detail-item.price-highlight strong {
  color: #667eea;
  font-size: 15px;
}

.tooltip-arrow {
  position: absolute;
  left: -6px;
  top: 24px;
  width: 12px;
  height: 12px;
  background: rgba(35, 35, 45, 0.98);
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  transform: rotate(45deg);
}

/* 悬浮提示动画 */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: all 0.2s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* 余额划转 */
.transfer-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.transfer-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 12px;
}

.transfer-form {
  display: flex;
  gap: 12px;
}

.transfer-form input {
  flex: 1;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
}

.transfer-form input:focus {
  outline: none;
  border-color: #667eea;
}

/* 积分记录 */
.ledger-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ledger-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.ledger-icon {
  width: 20px;
  height: 20px;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ledger-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.ledger-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ledger-type {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.ledger-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.ledger-amount {
  font-size: 15px;
  font-weight: 600;
}

.ledger-amount.positive {
  color: #10b981;
}

.ledger-amount.negative {
  color: #ef4444;
}

/* 兑换表单 */
.voucher-form {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.voucher-form input {
  flex: 1;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
}

.voucher-form input:focus {
  outline: none;
  border-color: #667eea;
}

.msg-error {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 16px;
}

.msg-success {
  padding: 10px 14px;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  color: #10b981;
  font-size: 13px;
  margin-bottom: 16px;
}

.voucher-tips, .invite-tips {
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  margin-top: 16px;
}

.voucher-tips h5, .invite-tips h5 {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.voucher-tips ul, .invite-tips ul {
  margin: 0;
  padding: 0 0 0 16px;
}

.voucher-tips li, .invite-tips li {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.8;
}

/* 邀请卡片 */
.invite-card {
  padding: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  text-align: center;
  margin-bottom: 20px;
}

.invite-card h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.invite-code {
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  font-family: monospace;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 2px;
  margin-bottom: 16px;
}

.invite-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn-copy {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-copy:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-icon {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.invite-stats {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 20px;
}

.invite-stats .stat {
  text-align: center;
}

.invite-stats .stat-num {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
}

.invite-stats .stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

/* 帮助列表 */
.help-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.help-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.help-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.help-icon {
  width: 22px;
  height: 22px;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.help-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.help-text {
  flex: 1;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.help-arrow {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.4);
}

/* 新手引导设置 */
.settings-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.setting-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.15);
  transition: all 0.3s ease;
  border-radius: 24px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: #fff;
  transition: all 0.3s ease;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-switch input:checked + .toggle-slider {
  background: rgba(255, 255, 255, 0.9);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
  background-color: #1a1a1a;
}

.toggle-switch:hover .toggle-slider {
  background: rgba(255, 255, 255, 0.25);
}

.toggle-switch input:checked:hover + .toggle-slider {
  background: #fff;
}

/* 连线样式设置 */
.edge-style-setting {
  margin-bottom: 12px;
}

.edge-style-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.edge-style-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
}

.edge-style-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
}

.edge-style-btn.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.95);
}

.edge-style-icon {
  width: 40px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edge-style-icon svg {
  width: 100%;
  height: 100%;
}

.edge-style-label {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
}

/* 空提示 */
.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}

/* 底部 */
.panel-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.logout-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  border-color: rgba(255, 255, 255, 0.2);
}

.logout-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logout-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

/* 充值面板 */
.recharge-panel {
  position: absolute;
  inset: 0;
  background: rgba(26, 26, 26, 0.98);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.recharge-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.recharge-header h4 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

.recharge-amounts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.amount-btn {
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.amount-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.amount-btn.active {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.95);
}

/* 充值表单 */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

.form-input,
.form-select {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  transition: all 0.2s;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

.form-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-select {
  cursor: pointer;
}

/* 优惠券输入组 */
.coupon-input-group {
  display: flex;
  gap: 8px;
}

.coupon-input-group .form-input {
  flex: 1;
}

.btn-apply-coupon,
.btn-remove-coupon {
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-apply-coupon {
  background: rgba(59, 130, 246, 0.9);
  color: #fff;
}

.btn-apply-coupon:hover:not(:disabled) {
  background: rgba(59, 130, 246, 1);
}

.btn-apply-coupon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-remove-coupon {
  background: rgba(239, 68, 68, 0.9);
  color: #fff;
}

.btn-remove-coupon:hover {
  background: rgba(239, 68, 68, 1);
}

/* 价格信息 */
.price-info {
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.price-row.discount {
  color: rgba(34, 197, 94, 0.9);
}

.price-row.total {
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.total-price {
  font-size: 18px;
  color: rgba(251, 191, 36, 0.95);
}

/* 消息提示 */
.msg-error {
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: rgba(239, 68, 68, 0.95);
  font-size: 13px;
}

.msg-success {
  padding: 10px 12px;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 6px;
  color: rgba(34, 197, 94, 0.95);
  font-size: 13px;
}

/* 动画 */
.panel-enter-active,
.panel-leave-active {
  transition: all 0.3s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}

.panel-enter-from .profile-panel,
.panel-leave-to .profile-panel {
  transform: translateX(-20px);
  opacity: 0;
}

/* 自定义对话框 */
.custom-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.custom-dialog {
  width: 320px;
  background: rgba(32, 32, 32, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  padding: 20px 24px 0;
}

.dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  text-align: center;
}

.dialog-body {
  padding: 16px 24px 24px;
}

.dialog-message {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  line-height: 1.6;
  white-space: pre-line;
}

.dialog-footer {
  display: flex;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.dialog-btn {
  flex: 1;
  padding: 14px;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-btn.cancel {
  color: rgba(255, 255, 255, 0.6);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.dialog-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
}

.dialog-btn.confirm {
  color: rgba(255, 255, 255, 0.95);
}

.dialog-btn.confirm:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* 对话框动画 */
.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .custom-dialog,
.dialog-leave-to .custom-dialog {
  transform: scale(0.9);
  opacity: 0;
}
</style>

