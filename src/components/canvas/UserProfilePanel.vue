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
const activePackage = ref(null) // 用户当前活跃套餐
const invite = ref({ invite_code: '', uses: [] })
const checkinStatus = ref({ hasCheckedInToday: false, consecutiveDays: 0 })
const loading = ref(false)
const appSettings = ref({}) // 租户配置（包含邀请奖励积分等）

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
const rechargeCards = ref([]) // 充值卡片列表
const selectedRechargeCard = ref(null) // 选中的充值卡片
// 充值支付等待状态
const showRechargePaymentEmbed = ref(false)
const rechargePaymentUrl = ref('')
const rechargeOrderAmount = ref(0) // 记录当前充值金额

// 套餐购买面板
const showPurchasePanel = ref(false)
const selectedPackage = ref(null)
const purchasePaymentMethod = ref(null)
const purchaseLoading = ref(false)
const purchaseError = ref('')
const purchaseCouponCode = ref('')
const appliedPurchaseCoupon = ref(null)
const purchaseCouponDiscount = ref(0)
const purchaseCouponError = ref('')
// 内嵌支付状态
const showPaymentEmbed = ref(false)
const paymentUrl = ref('')
const paymentCheckInterval = ref(null)

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

    const [ledgerRes, packagesRes, inviteRes, checkinRes, activePackageRes, settingsRes] = await Promise.all([
      fetch('/api/user/points', { headers }),
      fetch('/api/packages', { headers }),
      fetch('/api/user/invite-code', { headers }),
      fetch('/api/user/checkin-status', { headers }),
      fetch('/api/user/package', { headers }),
      fetch('/api/settings/app', { headers }) // 🔧 新增：加载租户配置
    ])

    if (ledgerRes.ok) {
      const data = await ledgerRes.json()
      ledger.value = Array.isArray(data) ? data : (data.records || data.ledger || [])
    }
    if (packagesRes.ok) {
      const data = await packagesRes.json()
      packages.value = data.packages || []
    }
    if (inviteRes.ok) {
      const data = await inviteRes.json()
      invite.value = data
      console.log('[UserProfilePanel] 邀请数据:', data)
    }
    if (checkinRes.ok) checkinStatus.value = await checkinRes.json()
    if (activePackageRes.ok) {
      const data = await activePackageRes.json()
      activePackage.value = data.package || null
    }
    if (settingsRes.ok) {
      const data = await settingsRes.json()
      appSettings.value = data.settings || data || {}
      console.log('[UserProfilePanel] 租户配置:', appSettings.value)
    }
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

// 套餐等级映射（用于没有level字段时的回退）
const packageOrder = { daily: 1, weekly: 2, monthly: 3, quarterly: 4, yearly: 5, supmonthly: 4, quarter: 5, year: 6 }

// 根据套餐类型获取等级（优先使用 packages 中的 level 字段）
function getPackageLevel(type) {
  const pkg = packages.value.find(p => p.type === type)
  if (pkg && typeof pkg.level === 'number') {
    return pkg.level
  }
  return packageOrder[type] || 0
}

// 获取当前用户套餐的等级
function getCurrentPackageLevel() {
  if (!activePackage.value) return 0
  // 优先使用 user_packages 中存储的 package_level
  if (typeof activePackage.value.package_level === 'number' && activePackage.value.package_level > 0) {
    return activePackage.value.package_level
  }
  // 回退到根据类型查找
  return getPackageLevel(activePackage.value.package_type)
}

// 判断是否为降级（降级不允许购买）
function isDowngrade(type) {
  if (!activePackage.value) {
    return false
  }
  const currentLevel = getCurrentPackageLevel()
  const newLevel = getPackageLevel(type)
  return newLevel < currentLevel
}

// 判断是否为当前套餐（续费）
function isCurrentPackage(type) {
  return activePackage.value && activePackage.value.package_type === type
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

// 计算购买信息
const purchaseInfo = computed(() => {
  if (!selectedPackage.value || !props.userInfo) return null
  
  const pkg = selectedPackage.value
  const balance = props.userInfo.balance || 0
  
  const isCurrent = isCurrentPackage(pkg.type)
  const action = isCurrent ? '续费' : '购买'
  
  // 套餐价格
  let finalPrice = pkg.price
  
  // 应用优惠券
  const priceAfterCoupon = finalPrice - purchaseCouponDiscount.value
  
  // 计算余额使用
  const balanceUsed = Math.min(balance, priceAfterCoupon)
  
  // 计算需要在线支付的金额
  const needPay = priceAfterCoupon - balanceUsed
  
  return {
    action,
    isCurrent,
    totalAmount: finalPrice,
    couponDiscount: purchaseCouponDiscount.value,
    priceAfterCoupon,
    balance,
    balanceUsed,
    needPay: Math.max(0, needPay),
    canPayWithBalance: balance >= priceAfterCoupon,
    needOnlinePayment: needPay > 0
  }
})

// 打开套餐购买面板
async function purchasePackage(pkg) {
  // 检查是否为降级购买
  if (isDowngrade(pkg.type)) {
    showAlert('不支持降级套餐，请选择同级或更高级别的套餐')
    return
  }
  
  // 打开购买面板
  selectedPackage.value = pkg
  showPurchasePanel.value = true
  purchasePaymentMethod.value = null
  purchaseError.value = ''
  purchaseCouponCode.value = ''
  appliedPurchaseCoupon.value = null
  purchaseCouponDiscount.value = 0
  purchaseCouponError.value = ''
  showPaymentEmbed.value = false
  paymentUrl.value = ''
  
  // 加载支付方式
  try {
    const headers = { ...getTenantHeaders(), Authorization: `Bearer ${token}` }
    const res = await fetch('/api/user/payment-methods', { headers })
    if (res.ok) {
      const data = await res.json()
      paymentMethods.value = data.methods || []
      if (paymentMethods.value.length > 0) {
        purchasePaymentMethod.value = paymentMethods.value[0].id
      }
    }
  } catch (e) {
    console.error('[purchasePackage] 加载支付方式失败:', e)
  }
}

// 关闭购买面板
function closePurchasePanel() {
  showPurchasePanel.value = false
  selectedPackage.value = null
  showPaymentEmbed.value = false
  paymentUrl.value = ''
  // 清除支付检查定时器
  if (paymentCheckInterval.value) {
    clearInterval(paymentCheckInterval.value)
    paymentCheckInterval.value = null
  }
}

// 应用优惠券
async function applyPurchaseCoupon() {
  if (!purchaseCouponCode.value || !purchaseCouponCode.value.trim()) {
    purchaseCouponError.value = '请输入优惠券码'
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
        code: purchaseCouponCode.value.trim().toUpperCase(),
        package_id: selectedPackage.value?.id,
        amount: selectedPackage.value?.price
      })
    })
    
    const data = await res.json()
    
    if (!res.ok) {
      purchaseCouponError.value = data.message || '优惠券验证失败'
      return
    }
    
    appliedPurchaseCoupon.value = data.coupon
    purchaseCouponDiscount.value = data.discount_amount
    purchaseCouponError.value = ''
    
  } catch (e) {
    console.error('[applyPurchaseCoupon] error:', e)
    purchaseCouponError.value = '优惠券验证失败'
  }
}

// 移除优惠券
function removePurchaseCoupon() {
  purchaseCouponCode.value = ''
  appliedPurchaseCoupon.value = null
  purchaseCouponDiscount.value = 0
  purchaseCouponError.value = ''
}

// 确认购买
async function confirmPurchase() {
  if (purchaseLoading.value) return
  
  const info = purchaseInfo.value
  if (!info) return
  
  // 如果需要在线支付但没有选择支付方式
  if (info.needOnlinePayment && !purchasePaymentMethod.value) {
    purchaseError.value = '请选择支付方式'
    return
  }
  
  try {
    purchaseLoading.value = true
    purchaseError.value = ''
    
    const headers = {
      ...getTenantHeaders(),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
    
    const payload = {
      package_id: selectedPackage.value.id
    }
    
    // 如果使用了优惠券
    if (appliedPurchaseCoupon.value) {
      payload.coupon_code = purchaseCouponCode.value.trim().toUpperCase()
    }
    
    // 如果需要在线支付
    if (info.needOnlinePayment) {
      payload.payment_method_id = purchasePaymentMethod.value
    }
    
    const res = await fetch('/api/packages/purchase', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    
    const data = await res.json()
    
    if (res.ok) {
      if (data.pay_url) {
        // 需要在线支付，在新窗口打开支付页面
        paymentUrl.value = data.pay_url
        showPaymentEmbed.value = true
        
        // 在新窗口打开支付页面
        window.open(data.pay_url, '_blank', 'width=500,height=700,left=200,top=100')
        
        // 开始轮询支付状态
        startPaymentCheck(data.order_id || data.order_no)
      } else {
        // 余额支付成功
        showAlert(data.message || `🎉 套餐购买成功！获得 ${selectedPackage.value.points} 积分`, '购买成功')
        closePurchasePanel()
        emit('update')
        await loadData() // 重新加载数据
      }
    } else {
      purchaseError.value = data.message || data.error || '购买失败，请重试'
    }
  } catch (e) {
    console.error('[confirmPurchase] error:', e)
    purchaseError.value = '购买失败，请重试'
  } finally {
    purchaseLoading.value = false
  }
}

// 开始轮询支付状态
function startPaymentCheck(orderId) {
  if (!orderId) return
  
  // 每3秒检查一次支付状态
  paymentCheckInterval.value = setInterval(async () => {
    try {
      const headers = {
        ...getTenantHeaders(),
        Authorization: `Bearer ${token}`
      }
      
      const res = await fetch(`/api/orders/${orderId}/status`, { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'paid' || data.status === 'completed') {
          // 支付成功
          clearInterval(paymentCheckInterval.value)
          paymentCheckInterval.value = null
          showAlert(`🎉 支付成功！套餐已激活，获得 ${selectedPackage.value.points} 积分`, '支付成功')
          closePurchasePanel()
          emit('update')
          await loadData()
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          // 支付失败
          clearInterval(paymentCheckInterval.value)
          paymentCheckInterval.value = null
          purchaseError.value = '支付已取消或失败'
          showPaymentEmbed.value = false
        }
      }
    } catch (e) {
      console.error('[paymentCheck] error:', e)
    }
  }, 3000)
}

// 手动完成支付检查
async function manualPaymentCheck() {
  purchaseLoading.value = true
  purchaseError.value = ''
  try {
    // 刷新用户数据
    emit('update')
    await loadData()
    
    // 检查套餐是否已激活
    if (activePackage.value && activePackage.value.package_type === selectedPackage.value?.type) {
      showAlert(`🎉 支付成功！套餐已激活，获得 ${selectedPackage.value.points} 积分`, '支付成功')
      closePurchasePanel()
    } else {
      purchaseError.value = '支付尚未完成，请在新窗口完成支付后再点击确认'
      showPaymentEmbed.value = true // 保持在等待状态
    }
  } catch (e) {
    purchaseError.value = '检查支付状态失败，请稍后重试'
  } finally {
    purchaseLoading.value = false
  }
}

// 重新打开支付窗口
function openPaymentWindow() {
  if (paymentUrl.value) {
    window.open(paymentUrl.value, '_blank', 'width=500,height=700,left=200,top=100')
  }
}

// 取消支付
function cancelPayment() {
  showPaymentEmbed.value = false
  paymentUrl.value = ''
  purchaseError.value = ''
  // 清除支付检查定时器
  if (paymentCheckInterval.value) {
    clearInterval(paymentCheckInterval.value)
    paymentCheckInterval.value = null
  }
}

// 打开充值面板
async function openRechargePanel() {
  showRechargePanel.value = true
  rechargeAmount.value = 0
  rechargeCustomAmount.value = ''
  rechargeSelectedMethod.value = null
  selectedRechargeCard.value = null
  rechargeError.value = ''
  rechargeCouponCode.value = ''
  appliedRechargeCoupon.value = null
  rechargeCouponDiscount.value = 0
  rechargeCouponError.value = ''

  // 并行加载支付方式和充值卡片
  try {
    const headers = { ...getTenantHeaders(), Authorization: `Bearer ${token}` }

    const [paymentRes, cardsRes] = await Promise.all([
      fetch('/api/user/payment-methods', { headers }),
      fetch('/api/recharge-cards', { headers: getTenantHeaders() })
    ])

    // 处理支付方式
    if (paymentRes.ok) {
      const data = await paymentRes.json()
      paymentMethods.value = data.methods || []
      if (paymentMethods.value.length > 0) {
        rechargeSelectedMethod.value = paymentMethods.value[0].id
      }
    }

    // 处理充值卡片
    if (cardsRes.ok) {
      const data = await cardsRes.json()
      rechargeCards.value = data.recharge_cards || []
    }
  } catch (e) {
    console.error('[openRechargePanel] 加载数据失败:', e)
  }
}

// 选择充值卡片
function selectRechargeCard(card) {
  selectedRechargeCard.value = card
  rechargeAmount.value = card.amount
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

    // 如果选择了充值卡片，传递卡片ID
    if (selectedRechargeCard.value) {
      payload.recharge_card_id = selectedRechargeCard.value.id
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
      // 记录充值金额和支付URL
      rechargePaymentUrl.value = data.pay_url
      rechargeOrderAmount.value = amount
      // 在新窗口打开支付页面
      window.open(data.pay_url, '_blank', 'width=500,height=700,left=200,top=100')
      // 显示等待支付视图
      showRechargePaymentEmbed.value = true
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

// 充值支付确认
function confirmRechargePayment() {
  rechargeLoading.value = true
  rechargeError.value = ''
  
  // 刷新用户数据
  emit('update')
  loadData()
  
  // 延迟检查，给后端时间处理
  setTimeout(() => {
    rechargeLoading.value = false
    showAlert(t('user.rechargeSuccess') || '充值成功！余额已到账', `🎉 ${t('common.success')}`)
    closeRechargePaymentEmbed()
    showRechargePanel.value = false
  }, 1500)
}

// 重新打开充值支付窗口
function openRechargePaymentWindow() {
  if (rechargePaymentUrl.value) {
    window.open(rechargePaymentUrl.value, '_blank', 'width=500,height=700,left=200,top=100')
  }
}

// 取消充值支付
function cancelRechargePayment() {
  showRechargePaymentEmbed.value = false
  rechargePaymentUrl.value = ''
  rechargeOrderAmount.value = 0
  rechargeError.value = ''
}

// 关闭充值支付等待视图
function closeRechargePaymentEmbed() {
  showRechargePaymentEmbed.value = false
  rechargePaymentUrl.value = ''
  rechargeOrderAmount.value = 0
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
  // 尝试从 pointsType 中查找翻译
  const pointsTypeKey = `pointsType.${type}`
  const pointsTypeText = t(pointsTypeKey)
  
  // 如果找到翻译（不是key本身），返回翻译
  if (pointsTypeText !== pointsTypeKey) {
    return pointsTypeText
  }
  
  // 否则尝试从 user.ledgerType 中查找翻译
  const ledgerTypeKey = `user.ledgerType.${type}`
  const ledgerTypeText = t(ledgerTypeKey)
  
  // 如果找到翻译（不是key本身），返回翻译
  if (ledgerTypeText !== ledgerTypeKey) {
    return ledgerTypeText
  }
  
  // 都没找到，返回原始type
  return type
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
                  :class="['package-card', { popular: pkg.popular, hovered: hoveredPackage?.id === pkg.id, downgrade: isDowngrade(pkg.type) }]"
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
                  <button 
                    :class="['btn-purchase', { disabled: isDowngrade(pkg.type), current: isCurrentPackage(pkg.type) }]" 
                    :disabled="isDowngrade(pkg.type)"
                    @click="purchasePackage(pkg)"
                  >
                    <template v-if="isCurrentPackage(pkg.type)">续费</template>
                    <template v-else-if="isDowngrade(pkg.type)">不可降级</template>
                    <template v-else>{{ t('packages.buy') }}</template>
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
                  <span class="stat-num">{{ (invite.uses?.length || 0) * (appSettings.inviter_bonus || 10) }}</span>
                  <span class="stat-label">{{ t('user.earnedPoints') }}</span>
                </div>
              </div>

              <div class="invite-tips">
                <h5>{{ t('user.inviteRules') }}</h5>
                <ul>
                  <li>每邀请一位好友注册，您获得 {{ appSettings.inviter_bonus || 10 }} 积分</li>
                  <li>被邀请人也可获得 {{ appSettings.invitee_bonus || 5 }} 积分奖励</li>
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
              <button class="close-btn" @click="showRechargePanel = false; closeRechargePaymentEmbed()">×</button>
            </div>
            
            <!-- 等待支付视图 -->
            <template v-if="showRechargePaymentEmbed">
              <div class="recharge-waiting-view">
                <div class="waiting-icon-container">
                  <div class="waiting-icon-bg">
                    <svg class="waiting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                    </svg>
                  </div>
                  <div class="waiting-pulse"></div>
                </div>
                
                <h3 class="waiting-title">等待支付完成</h3>
                <p class="waiting-desc">支付页面已在新窗口打开，请在新窗口完成支付</p>
                
                <div class="waiting-order-info">
                  <div class="order-info-row">
                    <span class="order-label">充值金额</span>
                    <span class="order-value highlight">¥{{ (rechargeOrderAmount / 100).toFixed(2) }}</span>
                  </div>
                </div>
                
                <div class="waiting-tips">
                  <div class="tip-item">
                    <span class="tip-number">1</span>
                    <span class="tip-text">在新窗口完成支付</span>
                  </div>
                  <div class="tip-arrow">→</div>
                  <div class="tip-item">
                    <span class="tip-number">2</span>
                    <span class="tip-text">返回点击确认按钮</span>
                  </div>
                  <div class="tip-arrow">→</div>
                  <div class="tip-item">
                    <span class="tip-number">3</span>
                    <span class="tip-text">余额自动到账</span>
                  </div>
                </div>
                
                <div class="waiting-actions">
                  <button 
                    class="btn-waiting-primary"
                    @click="confirmRechargePayment"
                    :disabled="rechargeLoading"
                  >
                    <span v-if="rechargeLoading" class="btn-loading-icon">⏳</span>
                    {{ rechargeLoading ? '正在确认支付状态...' : '✓ 我已完成支付' }}
                  </button>
                  <button 
                    class="btn-waiting-link"
                    @click="openRechargePaymentWindow"
                  >
                    🔗 重新打开支付页面
                  </button>
                  <button 
                    class="btn-waiting-cancel"
                    @click="cancelRechargePayment"
                  >
                    取消支付
                  </button>
                </div>
              </div>
            </template>
            
            <!-- 充值表单视图 -->
            <template v-else>
            <!-- 充值卡片选择 -->
            <div v-if="rechargeCards.length > 0" class="form-section">
              <label class="form-label">{{ t('user.selectRechargeCard') || '选择充值卡片' }}</label>
              <div class="recharge-amounts">
                <button
                  v-for="card in rechargeCards"
                  :key="card.id"
                  :class="['amount-btn', 'card-btn-v2', { active: selectedRechargeCard?.id === card.id }]"
                  @click="selectRechargeCard(card)"
                >
                  <!-- 奖励标识：白色小星星 -->
                  <span v-if="card.bonus_enabled" class="bonus-star">★</span>
                  <div class="card-amount-v2">¥{{ (card.amount / 100).toFixed(0) }}</div>
                  <!-- 奖励说明：悬停时显示 -->
                  <div v-if="card.bonus_enabled" class="card-bonus-hover">
                    <span v-if="card.bonus_type === 'random'">+{{ card.bonus_min }}~{{ card.bonus_max }} 随机积分</span>
                    <span v-else>+{{ card.bonus_fixed }} 积分奖励</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- 快捷金额（如果没有充值卡片时显示） -->
            <div v-else class="form-section">
              <label class="form-label">{{ t('user.selectAmount') }}</label>
              <div class="recharge-amounts">
                <button
                  v-for="amount in quickAmounts"
                  :key="amount"
                  :class="['amount-btn', { active: rechargeAmount === amount }]"
                  @click="rechargeAmount = amount; rechargeCustomAmount = ''; selectedRechargeCard = null"
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
            </template>
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
  
  <!-- 套餐购买大弹窗（独立Teleport确保最高层级） -->
  <Teleport to="body">
    <Transition name="purchase-modal">
      <div v-if="showPurchasePanel" class="purchase-modal-overlay" @click.self="closePurchasePanel">
        <div class="purchase-modal">
          <!-- 弹窗头部 -->
          <div class="purchase-modal-header">
            <h3>{{ purchaseInfo?.action || '购买' }}套餐</h3>
            <button class="modal-close-btn" @click="closePurchasePanel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <!-- 弹窗内容 -->
          <div class="purchase-modal-body">
            <!-- 等待支付视图 -->
            <template v-if="showPaymentEmbed">
              <div class="payment-waiting-view">
                <div class="waiting-icon-container">
                  <div class="waiting-icon-bg">
                    <svg class="waiting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                    </svg>
                  </div>
                  <div class="waiting-pulse"></div>
                </div>
                
                <h3 class="waiting-title">等待支付完成</h3>
                <p class="waiting-desc">支付页面已在新窗口打开，请在新窗口完成支付</p>
                
                <div class="waiting-order-info">
                  <div class="order-info-row">
                    <span class="order-label">套餐</span>
                    <span class="order-value">{{ selectedPackage?.name }}</span>
                  </div>
                  <div class="order-info-row">
                    <span class="order-label">金额</span>
                    <span class="order-value highlight">¥{{ ((purchaseInfo?.needPay || 0) / 100).toFixed(2) }}</span>
                  </div>
                </div>
                
                <div class="waiting-tips">
                  <div class="tip-item">
                    <span class="tip-number">1</span>
                    <span class="tip-text">在新窗口完成支付</span>
                  </div>
                  <div class="tip-arrow">→</div>
                  <div class="tip-item">
                    <span class="tip-number">2</span>
                    <span class="tip-text">返回点击确认按钮</span>
                  </div>
                  <div class="tip-arrow">→</div>
                  <div class="tip-item">
                    <span class="tip-number">3</span>
                    <span class="tip-text">套餐自动激活</span>
                  </div>
                </div>
                
                <div class="waiting-actions">
                  <button 
                    class="btn-waiting-primary"
                    @click="manualPaymentCheck"
                    :disabled="purchaseLoading"
                  >
                    <span v-if="purchaseLoading" class="btn-loading-icon">⏳</span>
                    {{ purchaseLoading ? '正在确认支付状态...' : '✓ 我已完成支付' }}
                  </button>
                  <button 
                    class="btn-waiting-link"
                    @click="openPaymentWindow"
                  >
                    🔗 重新打开支付页面
                  </button>
                  <button 
                    class="btn-waiting-cancel"
                    @click="cancelPayment"
                  >
                    取消支付
                  </button>
                </div>
              </div>
            </template>
            
            <!-- 购买确认视图 -->
            <template v-else>
              <div class="purchase-content-grid">
                <!-- 左侧：套餐信息 -->
                <div class="purchase-left">
                  <div class="package-detail-card" v-if="selectedPackage">
                    <div class="package-detail-header">
                      <span class="package-detail-name">{{ selectedPackage.name }}</span>
                      <span v-if="purchaseInfo?.isCurrent" class="package-current-tag">当前套餐</span>
                    </div>
                    <div class="package-detail-price">
                      <span class="price-amount">¥{{ (selectedPackage.price / 100).toFixed(0) }}</span>
                      <span class="price-unit">/{{ selectedPackage.duration_days }}天</span>
                    </div>
                    <div class="package-detail-features">
                      <div class="feature-item">
                        <span class="feature-icon">💎</span>
                        <span class="feature-text">{{ selectedPackage.points }} 积分</span>
                      </div>
                      <div class="feature-item">
                        <span class="feature-icon">⏱️</span>
                        <span class="feature-text">{{ selectedPackage.duration_days }} 天有效期</span>
                      </div>
                      <div class="feature-item">
                        <span class="feature-icon">⚡</span>
                        <span class="feature-text">{{ selectedPackage.concurrent_limit || 1 }} 个并发</span>
                      </div>
                    </div>
                    <p v-if="selectedPackage.description" class="package-detail-desc">
                      {{ selectedPackage.description }}
                    </p>
                  </div>
                </div>
                
                <!-- 右侧：支付信息 -->
                <div class="purchase-right">
                  <!-- 优惠券 -->
                  <div class="purchase-section">
                    <label class="section-label">优惠券</label>
                    <div class="coupon-input-row">
                      <input 
                        v-model="purchaseCouponCode" 
                        type="text" 
                        class="coupon-input"
                        placeholder="输入优惠券码（可选）"
                        :disabled="!!appliedPurchaseCoupon"
                        @input="purchaseCouponCode = purchaseCouponCode.toUpperCase()"
                      />
                      <button 
                        v-if="!appliedPurchaseCoupon"
                        class="btn-coupon-apply" 
                        @click="applyPurchaseCoupon"
                        :disabled="!purchaseCouponCode.trim()"
                      >
                        应用
                      </button>
                      <button 
                        v-else
                        class="btn-coupon-remove" 
                        @click="removePurchaseCoupon"
                      >
                        移除
                      </button>
                    </div>
                    <div v-if="purchaseCouponError" class="coupon-error">{{ purchaseCouponError }}</div>
                    <div v-if="appliedPurchaseCoupon" class="coupon-success">
                      ✓ 已优惠 ¥{{ (purchaseCouponDiscount / 100).toFixed(2) }}
                    </div>
                  </div>
                  
                  <!-- 支付方式 -->
                  <div v-if="purchaseInfo?.needOnlinePayment && paymentMethods.length > 0" class="purchase-section">
                    <label class="section-label">支付方式</label>
                    <div class="payment-method-list">
                      <label 
                        v-for="method in paymentMethods" 
                        :key="method.id"
                        :class="['payment-method-option', { active: purchasePaymentMethod === method.id }]"
                      >
                        <input 
                          type="radio" 
                          :value="method.id" 
                          v-model="purchasePaymentMethod"
                          class="hidden"
                        />
                        <span class="method-radio"></span>
                        <span class="method-label">{{ method.name }}</span>
                      </label>
                    </div>
                  </div>
                  
                  <!-- 价格明细 -->
                  <div class="purchase-section">
                    <label class="section-label">支付明细</label>
                    <div class="price-breakdown" v-if="purchaseInfo">
                      <div class="price-line">
                        <span>套餐价格</span>
                        <span>¥{{ (purchaseInfo.totalAmount / 100).toFixed(2) }}</span>
                      </div>
                      <div v-if="purchaseInfo.couponDiscount > 0" class="price-line discount">
                        <span>优惠券</span>
                        <span>-¥{{ (purchaseInfo.couponDiscount / 100).toFixed(2) }}</span>
                      </div>
                      <div class="price-line">
                        <span>账户余额</span>
                        <span>¥{{ (purchaseInfo.balance / 100).toFixed(2) }}</span>
                      </div>
                      <div v-if="purchaseInfo.balanceUsed > 0" class="price-line used">
                        <span>余额抵扣</span>
                        <span>-¥{{ (purchaseInfo.balanceUsed / 100).toFixed(2) }}</span>
                      </div>
                      <div class="price-line final">
                        <span>{{ purchaseInfo.needOnlinePayment ? '还需支付' : '余额支付' }}</span>
                        <span class="final-amount">
                          ¥{{ purchaseInfo.needOnlinePayment 
                            ? (purchaseInfo.needPay / 100).toFixed(2) 
                            : (purchaseInfo.balanceUsed / 100).toFixed(2) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 错误提示 -->
                  <div v-if="purchaseError" class="purchase-error">{{ purchaseError }}</div>
                  
                  <!-- 提示信息 -->
                  <div class="purchase-hint">
                    <span v-if="purchaseInfo?.canPayWithBalance">💡 余额充足，将直接从余额扣款</span>
                    <span v-else>💡 余额不足 ¥{{ ((purchaseInfo?.needPay || 0) / 100).toFixed(2) }}，需在线支付</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
          
          <!-- 弹窗底部 -->
          <div v-if="!showPaymentEmbed" class="purchase-modal-footer">
            <button class="btn-modal-cancel" @click="closePurchasePanel">
              取消
            </button>
            <button 
              class="btn-modal-confirm"
              @click="confirmPurchase" 
              :disabled="purchaseLoading || (purchaseInfo?.needOnlinePayment && !purchasePaymentMethod)"
            >
              {{ purchaseLoading ? '处理中...' : (purchaseInfo?.needOnlinePayment ? '去支付 →' : '确认购买') }}
            </button>
          </div>
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

.btn-purchase:hover:not(:disabled) {
  background: #667eea;
  border-color: #667eea;
}

.btn-purchase.disabled,
.btn-purchase:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

/* 降级套餐卡片样式 */
.package-card.downgrade {
  opacity: 0.6;
  border-color: rgba(255, 255, 255, 0.05);
}

/* 续费按钮样式（当前套餐） */
.btn-purchase.current {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.5);
  color: #10b981;
}

.btn-purchase.current:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.3);
  border-color: rgba(16, 185, 129, 0.7);
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

/* 充值卡片 - 黑白灰风格 V2 */
.card-btn-v2 {
  position: relative;
  padding: 12px 10px;
  background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  min-height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-btn-v2:hover {
  background: linear-gradient(145deg, #3a3a3a, #2a2a2a);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.card-btn-v2.active {
  background: linear-gradient(145deg, #404040, #303030);
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.15);
}

/* 白色小星星标识 - 右上角 */
.bonus-star {
  position: absolute;
  top: 4px;
  right: 4px;
  color: #ffffff;
  font-size: 10px;
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.5);
  opacity: 0.85;
  transition: all 0.25s ease;
  z-index: 2;
}

.card-btn-v2:hover .bonus-star {
  opacity: 0;
  transform: scale(0);
}

/* 金额样式 - 更小尺寸 */
.card-amount-v2 {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: 0.3px;
  transition: all 0.25s ease;
}

.card-btn-v2.active .card-amount-v2 {
  color: #ffffff;
}

/* 奖励说明 - 默认隐藏，悬停时显示 */
.card-bonus-hover {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 6px;
  background: rgba(60, 60, 60, 0.95);
  border-radius: 0 0 9px 9px;
  font-size: 10px;
  color: #d0d0d0;
  font-weight: 500;
  opacity: 0;
  transform: translateY(100%);
  transition: all 0.25s ease;
  white-space: nowrap;
}

.card-btn-v2:hover .card-bonus-hover {
  opacity: 1;
  transform: translateY(0);
}

/* 保留旧版卡片样式以兼容 */
.card-btn {
  position: relative;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.card-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

.card-btn.active {
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.5);
}

/* 保留旧版奖励样式以兼容 */
.bonus-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(251, 191, 36, 0.2);
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

/* 保留旧版金额样式 */
.card-amount {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}

/* 保留旧版奖励文本 */
.card-bonus {
  font-size: 12px;
  color: rgba(251, 191, 36, 0.9);
  font-weight: 500;
  margin-top: 4px;
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

/* 套餐购买面板 */
.purchase-panel {
  position: absolute;
  inset: 0;
  background: rgba(26, 26, 26, 0.98);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.purchase-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.purchase-header h4 {
  margin: 0;
  font-size: 18px;
  color: #fff;
}

/* 套餐信息摘要 */
.package-summary {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.summary-label {
  color: rgba(255, 255, 255, 0.6);
}

.summary-value {
  color: rgba(255, 255, 255, 0.95);
  font-weight: 500;
}

.summary-value.highlight {
  color: #fbbf24;
  font-weight: 600;
}

/* 支付方式选择 */
.payment-methods {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.payment-method-item {
  flex: 1;
  min-width: 100px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.payment-method-item:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.payment-method-item.active {
  background: rgba(102, 126, 234, 0.2);
  border-color: rgba(102, 126, 234, 0.5);
}

.payment-method-item .method-name {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
}

.hidden {
  display: none;
}

/* 价格汇总 */
.price-summary {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.price-summary .price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.price-summary .price-row.discount,
.price-summary .price-row.used {
  color: rgba(34, 197, 94, 0.9);
}

.price-summary .price-row.total {
  padding-top: 10px;
  margin-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
}

.price-summary .total-price {
  font-size: 20px;
  color: #fbbf24;
}

/* 购买提示 */
.purchase-tips {
  margin-top: 8px;
  padding: 12px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
}

.purchase-tips p {
  margin: 0;
  font-size: 12px;
  color: rgba(59, 130, 246, 0.9);
}

/* 次要按钮 */
.btn-secondary {
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

/* 内嵌支付 */
.payment-embed-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.payment-embed-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 10px;
  color: rgba(16, 185, 129, 0.95);
  font-size: 14px;
  font-weight: 500;
}

.payment-icon {
  font-size: 20px;
}

.payment-embed-frame {
  flex: 1;
  min-height: 300px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.payment-iframe {
  width: 100%;
  height: 100%;
  min-height: 300px;
  border: none;
}

.payment-embed-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.payment-tip {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
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

/* ==================== 套餐购买大弹窗 ==================== */
.purchase-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  padding: 20px;
}

.purchase-modal {
  width: 100%;
  max-width: 900px;
  max-height: calc(100vh - 40px);
  background: linear-gradient(145deg, rgba(32, 32, 38, 0.98) 0%, rgba(24, 24, 28, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  box-shadow: 0 32px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.purchase-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.purchase-modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.modal-close-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.modal-close-btn svg {
  width: 18px;
  height: 18px;
}

.purchase-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.purchase-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 28px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

/* 内容网格布局 */
.purchase-content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
}

/* 左侧套餐卡片 */
.purchase-left {
  display: flex;
  flex-direction: column;
}

.package-detail-card {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 16px;
  padding: 24px;
  height: 100%;
}

.package-detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.package-detail-name {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}

.package-current-tag {
  padding: 4px 10px;
  background: rgba(16, 185, 129, 0.8);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.package-detail-price {
  margin-bottom: 20px;
}

.price-amount {
  font-size: 36px;
  font-weight: 800;
  color: #fbbf24;
}

.price-unit {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 4px;
}

.package-detail-features {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.85);
}

.feature-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.package-detail-desc {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.6;
}

/* 右侧支付信息 */
.purchase-right {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.purchase-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 优惠券输入 */
.coupon-input-row {
  display: flex;
  gap: 8px;
}

.coupon-input {
  flex: 1;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  transition: all 0.2s;
}

.coupon-input:focus {
  outline: none;
  border-color: rgba(102, 126, 234, 0.5);
  background: rgba(102, 126, 234, 0.1);
}

.coupon-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.coupon-input:disabled {
  opacity: 0.6;
}

.btn-coupon-apply,
.btn-coupon-remove {
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-coupon-apply {
  background: rgba(102, 126, 234, 0.9);
  color: #fff;
}

.btn-coupon-apply:hover:not(:disabled) {
  background: #667eea;
}

.btn-coupon-apply:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-coupon-remove {
  background: rgba(239, 68, 68, 0.8);
  color: #fff;
}

.btn-coupon-remove:hover {
  background: #ef4444;
}

.coupon-error {
  font-size: 13px;
  color: #ef4444;
}

.coupon-success {
  font-size: 13px;
  color: #10b981;
  font-weight: 500;
}

/* 支付方式 */
.payment-method-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.payment-method-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.payment-method-option:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.payment-method-option.active {
  background: rgba(102, 126, 234, 0.15);
  border-color: rgba(102, 126, 234, 0.5);
}

.method-radio {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  position: relative;
  transition: all 0.2s;
}

.payment-method-option.active .method-radio {
  border-color: #667eea;
}

.payment-method-option.active .method-radio::after {
  content: '';
  position: absolute;
  inset: 3px;
  background: #667eea;
  border-radius: 50%;
}

.method-label {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.85);
}

/* 价格明细 */
.price-breakdown {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.price-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.price-line.discount,
.price-line.used {
  color: #10b981;
}

.price-line.final {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.final-amount {
  font-size: 22px;
  font-weight: 700;
  color: #fbbf24;
}

/* 提示和错误 */
.purchase-error {
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  color: #ef4444;
  font-size: 14px;
}

.purchase-hint {
  padding: 12px 16px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 10px;
  font-size: 13px;
  color: rgba(59, 130, 246, 0.9);
}

/* 底部按钮 */
.btn-modal-cancel {
  padding: 14px 28px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-modal-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.btn-modal-confirm {
  padding: 14px 36px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}

.btn-modal-confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 24px rgba(102, 126, 234, 0.5);
}

.btn-modal-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* 等待支付视图 */
.payment-waiting-view,
.recharge-waiting-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

/* 充值等待视图小尺寸优化 */
.recharge-waiting-view {
  padding: 24px 16px;
}

.recharge-waiting-view .waiting-icon-container {
  width: 72px;
  height: 72px;
  margin-bottom: 16px;
}

.recharge-waiting-view .waiting-icon {
  width: 36px;
  height: 36px;
}

.recharge-waiting-view .waiting-title {
  font-size: 18px;
  margin-bottom: 6px;
}

.recharge-waiting-view .waiting-desc {
  font-size: 13px;
  margin-bottom: 16px;
}

.recharge-waiting-view .waiting-order-info {
  padding: 12px 16px;
  margin-bottom: 16px;
  min-width: auto;
}

.recharge-waiting-view .waiting-tips {
  padding: 10px 14px;
  margin-bottom: 16px;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.recharge-waiting-view .tip-number {
  width: 20px;
  height: 20px;
  font-size: 11px;
}

.recharge-waiting-view .tip-text {
  font-size: 11px;
}

.recharge-waiting-view .tip-arrow {
  font-size: 12px;
}

.recharge-waiting-view .waiting-actions {
  gap: 8px;
  max-width: 100%;
}

.recharge-waiting-view .btn-waiting-primary {
  padding: 12px 16px;
  font-size: 14px;
}

.recharge-waiting-view .btn-waiting-link,
.recharge-waiting-view .btn-waiting-cancel {
  padding: 10px 12px;
  font-size: 12px;
}

.waiting-icon-container {
  position: relative;
  width: 100px;
  height: 100px;
  margin-bottom: 24px;
}

.waiting-icon-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.waiting-icon {
  width: 48px;
  height: 48px;
  color: #10b981;
}

.waiting-pulse {
  position: absolute;
  inset: -10px;
  border: 2px solid rgba(16, 185, 129, 0.4);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.5; }
}

.waiting-title {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.waiting-desc {
  margin: 0 0 28px 0;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
}

.waiting-order-info {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px 24px;
  margin-bottom: 28px;
  min-width: 280px;
}

.order-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.order-info-row:not(:last-child) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.order-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
}

.order-value {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.order-value.highlight {
  color: #fbbf24;
  font-size: 18px;
}

.waiting-tips {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
  padding: 16px 24px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px;
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tip-number {
  width: 24px;
  height: 24px;
  background: rgba(59, 130, 246, 0.8);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.tip-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.tip-arrow {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.3);
}

.waiting-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 360px;
}

.btn-waiting-primary {
  width: 100%;
  padding: 16px 24px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-waiting-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
}

.btn-waiting-primary:disabled {
  opacity: 0.7;
  cursor: wait;
}

.btn-loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-waiting-link {
  width: 100%;
  padding: 14px 24px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 10px;
  color: rgba(59, 130, 246, 0.95);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-waiting-link:hover {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
}

.btn-waiting-cancel {
  width: 100%;
  padding: 12px 24px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-waiting-cancel:hover {
  color: rgba(255, 255, 255, 0.7);
}

/* 弹窗动画 */
.purchase-modal-enter-active,
.purchase-modal-leave-active {
  transition: all 0.3s ease;
}

.purchase-modal-enter-from,
.purchase-modal-leave-to {
  opacity: 0;
}

.purchase-modal-enter-from .purchase-modal,
.purchase-modal-leave-to .purchase-modal {
  transform: scale(0.9) translateY(20px);
  opacity: 0;
}

/* 响应式 */
@media (max-width: 640px) {
  .purchase-modal-overlay {
    padding: 20px;
  }
  
  .purchase-content-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  
  .purchase-modal {
    max-height: calc(100vh - 40px);
  }
  
  .package-detail-card {
    padding: 20px;
  }
  
  .price-amount {
    font-size: 28px;
  }
}
</style>

