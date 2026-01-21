<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getTenantHeaders } from '@/config/tenant'
import { formatPoints } from '@/utils/format'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'purchase-success'])

// 数据状态
const loading = ref(true)
const packages = ref([])
const user = ref(null)
const activePackage = ref(null)
const error = ref(null)

// 购买确认弹窗状态
const showPurchaseModal = ref(false)
const selectedPackage = ref(null)
const purchaseLoading = ref(false)
const purchaseError = ref('')
const paymentMethods = ref([])
const purchasePaymentMethod = ref(null)

// 优惠券状态
const purchaseCouponCode = ref('')
const appliedCoupon = ref(null)
const couponDiscount = ref(0)
const couponError = ref('')
const couponLoading = ref(false)

// 等待支付状态
const showPaymentWaiting = ref(false)
const paymentUrl = ref('')
const pendingOrderNo = ref('')
const checkingPayment = ref(false)

// 充值弹窗状态
const showRechargeModal = ref(false)
const rechargeAmount = ref(null)
const lastRechargeAmount = ref(0) // 记录最后一次充值的金额，用于等待界面显示
const customAmount = ref('')
const rechargePaymentMethod = ref(null) // 在打开弹窗时设置默认值
const rechargeCouponCode = ref('')
const rechargeLoading = ref(false)
const rechargeError = ref('')

// 快捷充值金额（单位：分）
const quickAmounts = [
  { label: '¥3', value: 300 },
  { label: '¥20', value: 2000 },
  { label: '¥50', value: 5000 },
  { label: '¥100', value: 10000 },
  { label: '¥200', value: 20000 },
  { label: '¥500', value: 50000 },
  { label: '¥888', value: 88800 }
]

// 默认支付方式
const defaultPaymentMethods = [
  { id: 'alipay_wechat', name: '支付宝/微信' }
]

// 充值支付方式选项（优先使用后端返回的，否则使用默认）
const rechargePaymentOptions = computed(() => {
  return paymentMethods.value.length > 0 ? paymentMethods.value : defaultPaymentMethods
})

// 套餐等级映射
const packageLevels = {
  daily: 1,
  weekly: 2,
  monthly: 3,
  supmonthly: 4,
  quarterly: 5,
  quarter: 5,
  year: 6,
  yearly: 6
}

// 加载套餐列表
async function loadPackages() {
  loading.value = true
  error.value = null

  try {
    const token = localStorage.getItem('token')
    if (!token) {
      error.value = '请先登录'
      loading.value = false
      return
    }

    // 获取用户信息
    const userRes = await fetch('/api/user/me', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (userRes.ok) {
      user.value = await userRes.json()
    }

    // 获取套餐列表
    const pkgRes = await fetch('/api/packages', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (pkgRes.ok) {
      const data = await pkgRes.json()
      packages.value = data.packages || []
    } else {
      error.value = '加载套餐失败'
    }

    // 获取当前套餐
    const activeRes = await fetch('/api/user/package', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (activeRes.ok) {
      const data = await activeRes.json()
      activePackage.value = data.package
    }
  } catch (e) {
    console.error('[PackageModal] 加载套餐失败:', e)
    error.value = '加载套餐失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

// 判断是否是当前套餐
function isCurrentPackage(pkgType) {
  if (!activePackage.value) return false
  return activePackage.value.package_type === pkgType
}

// 判断是否可以升级
function canUpgrade(pkgType) {
  if (!activePackage.value) return true
  const currentLevel = packageLevels[activePackage.value.package_type] || 0
  const targetLevel = packageLevels[pkgType] || 0
  return targetLevel > currentLevel
}

// 判断是否是降级
function isDowngrade(pkgType) {
  if (!activePackage.value) return false
  const currentLevel = packageLevels[activePackage.value.package_type] || 0
  const targetLevel = packageLevels[pkgType] || 0
  return targetLevel < currentLevel
}

// 打开购买确认弹窗
async function purchasePackage(pkg) {
  if (isDowngrade(pkg.type)) {
    error.value = '不支持降级套餐'
    return
  }

  // 打开支付确认模态框
  selectedPackage.value = pkg
  showPurchaseModal.value = true
  purchasePaymentMethod.value = null
  purchaseError.value = ''
  purchaseCouponCode.value = ''
  appliedCoupon.value = null
  couponDiscount.value = 0
  couponError.value = ''

  // 加载支付方式
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/user/payment-methods', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      paymentMethods.value = data.methods || []
      if (paymentMethods.value.length > 0) {
        purchasePaymentMethod.value = paymentMethods.value[0].id
      }
    }
  } catch (e) {
    console.error('[loadPaymentMethods] error:', e)
  }
}

// 关闭购买确认弹窗
function closePurchaseModal() {
  showPurchaseModal.value = false
  selectedPackage.value = null
  purchasePaymentMethod.value = null
  purchaseError.value = ''
  purchaseCouponCode.value = ''
  appliedCoupon.value = null
  couponDiscount.value = 0
  couponError.value = ''
  showPaymentWaiting.value = false
  paymentUrl.value = ''
  pendingOrderNo.value = ''
}

// 打开充值弹窗
async function openRechargeModal() {
  // 先重置状态
  rechargeAmount.value = null
  customAmount.value = ''
  rechargeCouponCode.value = ''
  rechargeError.value = ''
  rechargePaymentMethod.value = null
  
  // 加载支付方式
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/user/payment-methods', {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      paymentMethods.value = data.methods || []
    }
  } catch (e) {
    console.error('[openRechargeModal] 加载支付方式失败:', e)
  }
  
  // 默认选中第一个支付方式（无论是从后端加载的还是默认的）
  const options = rechargePaymentOptions.value
  if (options.length > 0) {
    rechargePaymentMethod.value = options[0].id
  }
  
  // 加载完成后再显示弹窗
  showRechargeModal.value = true
}

// 选择充值支付方式
function selectRechargePaymentMethod(methodId) {
  rechargePaymentMethod.value = methodId
  rechargeError.value = '' // 清除错误提示
}

// 关闭充值弹窗
function closeRechargeModal() {
  showRechargeModal.value = false
  rechargeAmount.value = null
  customAmount.value = ''
  rechargePaymentMethod.value = null
  rechargeCouponCode.value = ''
  rechargeError.value = ''
}

// 选择快捷金额
function selectQuickAmount(amount) {
  rechargeAmount.value = amount
  customAmount.value = ''
}

// 获取实际充值金额（分）
function getRechargeAmountInCents() {
  if (rechargeAmount.value) {
    return rechargeAmount.value
  }
  if (customAmount.value) {
    const amount = parseFloat(customAmount.value)
    if (!isNaN(amount) && amount > 0) {
      return Math.round(amount * 100)
    }
  }
  return 0
}

// 确认充值
async function confirmRecharge() {
  const amountInCents = getRechargeAmountInCents()
  
  if (amountInCents <= 0) {
    rechargeError.value = '请选择或输入充值金额'
    return
  }
  
  // 验证支付方式
  if (!rechargePaymentMethod.value) {
    rechargeError.value = '请选择支付方式'
    return
  }
  
  const paymentMethod = rechargePaymentMethod.value
  
  rechargeLoading.value = true
  rechargeError.value = ''
  
  try {
    const token = localStorage.getItem('token')
    const response = await fetch('/api/user/recharge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...getTenantHeaders()
      },
      body: JSON.stringify({
        amount: amountInCents,
        payment_method_id: paymentMethod
      })
    })
    
    const data = await response.json()
    
    if (!response.ok || !data.success) {
      throw new Error(data.message || data.error || '充值请求失败')
    }
    
    // 如果是在线支付，显示支付等待界面
    if (data.pay_url) {
      paymentUrl.value = data.pay_url
      pendingOrderNo.value = data.order_no
      lastRechargeAmount.value = amountInCents
      
      closeRechargeModal()
      
      // 复用购买模态框的等待支付界面
      showPaymentWaiting.value = true
      showPurchaseModal.value = true
      
      // 打开支付页面
      window.open(data.pay_url, '_blank', 'width=500,height=700')
    } else {
      // 直接充值成功（余额支付等）
      closeRechargeModal()
      // 刷新数据
      await loadPackages()
      emit('purchase-success')
      // 触发全局用户信息更新事件
      window.dispatchEvent(new CustomEvent('user-info-updated'))
    }
  } catch (err) {
    console.error('充值失败:', err)
    rechargeError.value = err.message || '充值失败，请稍后重试'
  } finally {
    rechargeLoading.value = false
  }
}

// 计算支付信息
const purchaseInfo = computed(() => {
  if (!selectedPackage.value || !user.value) return null

  const pkg = selectedPackage.value
  const balance = user.value.balance || 0

  const isCurrent = isCurrentPackage(pkg.type)
  const isUpgrade = canUpgrade(pkg.type)
  const action = isCurrent ? '续费' : (isUpgrade ? '升级' : '购买')

  // 1. 原始套餐价格
  let finalPrice = pkg.price
  let upgradeDiscount = 0

  // 2. 如果是升级，计算折抵（这里简化处理，实际折抵在后端计算）
  if (isUpgrade && activePackage.value) {
    upgradeDiscount = 0 // 暂时不在前端计算，等后端返回
  }

  // 3. 应用优惠券
  const priceAfterUpgrade = finalPrice - upgradeDiscount
  const priceAfterCoupon = priceAfterUpgrade - couponDiscount.value

  // 4. 计算余额使用
  const balanceUsed = Math.min(balance, priceAfterCoupon)

  // 5. 计算需要在线支付的金额
  const needPay = priceAfterCoupon - balanceUsed

  return {
    action,
    isCurrent,
    isUpgrade,
    totalAmount: finalPrice,
    upgradeDiscount,
    couponDiscount: couponDiscount.value,
    priceAfterCoupon,
    balance,
    balanceUsed,
    needPay: Math.max(0, needPay),
    canPayWithBalance: balance >= priceAfterCoupon,
    needOnlinePayment: needPay > 0
  }
})

// 应用优惠券
async function applyCoupon() {
  if (!purchaseCouponCode.value) return

  couponError.value = ''
  couponLoading.value = true

  try {
    const token = localStorage.getItem('token')
    const priceToValidate = selectedPackage.value.price

    const res = await fetch('/api/user/coupons/validate', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: purchaseCouponCode.value,
        amount: priceToValidate
      })
    })

    const data = await res.json()

    if (!res.ok) {
      couponError.value = data.message || '优惠券无效'
      appliedCoupon.value = null
      couponDiscount.value = 0
      return
    }
    
    appliedCoupon.value = data.coupon
    couponDiscount.value = data.discount_amount || 0
  } catch (e) {
    console.error('[applyCoupon] error:', e)
    couponError.value = '验证失败，请稍后重试'
  } finally {
    couponLoading.value = false
  }
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

    const token = localStorage.getItem('token')
    const payload = {
      package_id: selectedPackage.value.id
    }

    // 如果使用了优惠券，添加优惠券码
    if (appliedCoupon.value) {
      payload.coupon_code = purchaseCouponCode.value
    }

    // 如果需要在线支付，添加支付方式
    if (info.needOnlinePayment) {
      payload.payment_method_id = purchasePaymentMethod.value
    }

    const res = await fetch('/api/packages/purchase', {
      method: 'POST',
      headers: {
        ...getTenantHeaders(),
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })

    const data = await res.json()

    if (res.ok) {
      // 如果返回了支付链接，打开新窗口并显示等待界面
      if (data.pay_url) {
        paymentUrl.value = data.pay_url
        pendingOrderNo.value = data.order_no || ''
        showPaymentWaiting.value = true
        // 打开新窗口进行支付
        window.open(data.pay_url, '_blank', 'width=500,height=700')
        return
      }

      // 余额支付成功，立即刷新用户信息
      if (data.user) {
        user.value = data.user
      }

      // 立即刷新页面数据
      await loadPackages()

      closePurchaseModal()

      // 触发成功事件
      emit('purchase-success', data)

      // 触发全局用户信息更新事件
      window.dispatchEvent(new CustomEvent('user-info-updated'))
    } else {
      purchaseError.value = data.message || `${info.action}失败`
    }
  } catch (e) {
    console.error('[confirmPurchase] error:', e)
    purchaseError.value = '操作失败，请稍后重试'
  } finally {
    purchaseLoading.value = false
  }
}

// 关闭弹窗
function close() {
  emit('close')
}

// 重新打开支付页面
function reopenPaymentPage() {
  if (paymentUrl.value) {
    window.open(paymentUrl.value, '_blank', 'width=500,height=700')
  }
}

// 确认支付完成
async function confirmPaymentDone() {
  if (checkingPayment.value) return
  
  checkingPayment.value = true
  purchaseError.value = ''
  
  try {
    const token = localStorage.getItem('token')
    // 检查订单支付状态
    const res = await fetch(`/api/payment/check-status?order_no=${pendingOrderNo.value}`, {
      headers: { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    })
    
    const data = await res.json()
    
    if (res.ok && data.paid) {
      // 支付成功
      showPaymentWaiting.value = false
      paymentUrl.value = ''
      pendingOrderNo.value = ''
      
      // 刷新用户信息
      await loadPackages()
      closePurchaseModal()
      
      emit('purchase-success', data)
      window.dispatchEvent(new CustomEvent('user-info-updated'))
    } else {
      purchaseError.value = data.message || '支付尚未完成，请完成支付后再确认'
    }
  } catch (e) {
    console.error('[confirmPaymentDone] error:', e)
    purchaseError.value = '检查支付状态失败，请稍后重试'
  } finally {
    checkingPayment.value = false
  }
}

// 取消支付
function cancelPayment() {
  showPaymentWaiting.value = false
  paymentUrl.value = ''
  pendingOrderNo.value = ''
  purchaseError.value = ''
}

// 格式化剩余时间
function formatRemainingTime(expiresAt) {
  if (!expiresAt) return '永久'

  const now = Date.now()
  const remaining = expiresAt - now

  if (remaining <= 0) return '已过期'

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0) {
    return `${days}天${hours}小时`
  } else {
    return `${hours}小时`
  }
}

// 获取套餐类型标签
function getPackageTypeLabel(type) {
  const labels = {
    daily: '日卡',
    weekly: '周卡',
    monthly: '月卡',
    supmonthly: '超级月卡',
    quarterly: '季卡',
    quarter: '季卡',
    yearly: '年卡'
  }
  return labels[type] || type
}

// 监听弹窗显示
onMounted(() => {
  if (props.visible) {
    loadPackages()
  }
})

// 监听 visible 变化
watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadPackages()
  }
})
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="visible" class="package-modal-overlay" @click.self="close">
      <div class="package-modal-container">
        <!-- 头部 -->
        <div class="package-modal-header">
          <div class="header-left">
            <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"/>
              <circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            <h2 class="header-title">套餐购买</h2>
          </div>
          <button class="close-btn" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- 可滚动的内容区域 -->
        <div class="package-modal-body">
          <!-- 当前套餐信息 -->
          <div v-if="activePackage" class="active-package-banner">
            <div class="banner-content">
              <div class="banner-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div class="banner-info">
                <div class="banner-label">当前套餐</div>
                <div class="banner-name">{{ activePackage.package_name }}</div>
              </div>
              <div class="banner-stats">
                <div class="stat-item">
                  <div class="stat-label">并发</div>
                  <div class="stat-value">{{ activePackage.concurrent_limit }}</div>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item">
                  <div class="stat-label">剩余</div>
                  <div class="stat-value">{{ formatRemainingTime(activePackage.expires_at) }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 余额显示 -->
          <div class="balance-banner">
            <div class="balance-content">
              <svg class="balance-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              <span class="balance-label">账户余额</span>
              <span class="balance-value">¥{{ ((user?.balance || 0) / 100).toFixed(2) }}</span>
            </div>
            <button type="button" class="recharge-entry-btn" @click.stop.prevent="openRechargeModal">
              充值
            </button>
          </div>

          <!-- 错误提示 -->
          <div v-if="error" class="error-banner">
            <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{{ error }}</span>
          </div>

          <!-- 套餐列表 -->
          <div v-if="loading" class="loading-state">
            <div class="loading-spinner"></div>
            <p>加载套餐中...</p>
          </div>

          <div v-else-if="packages.length === 0" class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>暂无可用套餐</p>
          </div>

          <div v-else class="packages-grid">
            <div
              v-for="pkg in packages"
              :key="pkg.id"
              class="package-card"
              :class="{ 'is-active': activePackage && activePackage.package_id === pkg.id }"
            >
              <!-- 推荐标签 -->
              <div v-if="pkg.type === 'monthly'" class="package-badge">推荐</div>

              <!-- 套餐类型 -->
              <div class="package-type">{{ getPackageTypeLabel(pkg.type) }}</div>

              <!-- 套餐名称 -->
              <div class="package-name">{{ pkg.name }}</div>

              <!-- 套餐描述 -->
              <div class="package-description">{{ pkg.description }}</div>

              <!-- 价格 -->
              <div class="package-price">
                <span class="price-symbol">¥</span>
                <span class="price-value">{{ (pkg.price / 100).toFixed(0) }}</span>
              </div>

              <!-- 特性列表 -->
              <div class="package-features">
                <div class="feature-item">
                  <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>到账积分: {{ pkg.points }}积分（过期清零）</span>
                </div>
                <div class="feature-item">
                  <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>并发限制: {{ pkg.concurrent_limit }}</span>
                </div>
                <div class="feature-item">
                  <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>有效期: {{ pkg.duration_days }}天</span>
                </div>
              </div>

              <!-- 购买按钮 -->
              <button
                class="purchase-btn"
                :class="{ 'is-current': isCurrentPackage(pkg.type) }"
                :disabled="isDowngrade(pkg.type) && !isCurrentPackage(pkg.type)"
                @click="purchasePackage(pkg)"
              >
                <span v-if="isCurrentPackage(pkg.type)">立即续费</span>
                <span v-else-if="isDowngrade(pkg.type)">不可降级</span>
                <span v-else-if="canUpgrade(pkg.type)">升级套餐</span>
                <span v-else>立即购买</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 购买确认弹窗 - 居中模态框 -->
      <Transition name="modal-scale">
        <div v-if="showPurchaseModal" class="purchase-modal-overlay" @click.self="closePurchaseModal">
          <div class="purchase-modal">
            <!-- 头部 -->
            <div class="modal-header">
              <div class="modal-header-content">
                <div class="modal-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                </div>
                <div class="modal-title-group">
                  <h3 class="modal-title">确认{{ selectedPackage ? purchaseInfo?.action : '充值' }}</h3>
                  <p class="modal-subtitle">{{ selectedPackage ? selectedPackage.name : '账户充值' }}</p>
                </div>
              </div>
              <button class="modal-close" @click="closePurchaseModal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <!-- 内容 -->
            <div v-if="(selectedPackage && purchaseInfo) || showPaymentWaiting" class="modal-body">
              <!-- 等待支付视图 -->
              <template v-if="showPaymentWaiting">
                <div class="payment-waiting">
                  <!-- 顶部状态 -->
                  <div class="waiting-header">
                    <div class="waiting-icon-wrap">
                      <div class="waiting-icon-inner">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <rect x="2" y="5" width="20" height="14" rx="2"/>
                          <line x1="2" y1="10" x2="22" y2="10"/>
                        </svg>
                      </div>
                      <div class="waiting-spinner"></div>
                    </div>
                    <div class="waiting-text">
                      <div class="waiting-title">等待支付完成</div>
                      <div class="waiting-subtitle">支付页面已在新窗口打开</div>
                    </div>
                  </div>
                  
                  <!-- 订单信息 -->
                  <div class="waiting-order-card">
                    <div class="order-info-row">
                      <span class="order-info-label">{{ selectedPackage ? '套餐' : '项目' }}</span>
                      <span class="order-info-value">{{ selectedPackage ? selectedPackage.name : '账户充值' }}</span>
                    </div>
                    <div class="order-info-divider"></div>
                    <div class="order-info-row">
                      <span class="order-info-label">支付金额</span>
                      <span class="order-info-amount">¥{{ selectedPackage ? (purchaseInfo.needPay / 100).toFixed(2) : (lastRechargeAmount / 100).toFixed(2) }}</span>
                    </div>
                  </div>
                  
                  <!-- 步骤提示 -->
                  <div class="waiting-steps-bar">
                    <div class="step-dot active">1</div>
                    <div class="step-line"></div>
                    <div class="step-dot">2</div>
                    <div class="step-line"></div>
                    <div class="step-dot">3</div>
                  </div>
                  <div class="waiting-steps-labels">
                    <span>完成支付</span>
                    <span>点击确认</span>
                    <span>激活套餐</span>
                  </div>
                  
                  <!-- 错误提示 -->
                  <div v-if="purchaseError" class="waiting-error">{{ purchaseError }}</div>
                  
                  <!-- 操作按钮 -->
                  <div class="waiting-btn-group">
                    <button class="waiting-btn-primary" @click="confirmPaymentDone" :disabled="checkingPayment">
                      {{ checkingPayment ? '确认中...' : '我已完成支付' }}
                    </button>
                    <div class="waiting-btn-row">
                      <button class="waiting-btn-secondary" @click="reopenPaymentPage">重新打开</button>
                      <button class="waiting-btn-ghost" @click="cancelPayment">取消</button>
                    </div>
                  </div>
                </div>
              </template>
              
              <!-- 购买确认视图 -->
              <template v-else>
              <!-- 套餐权益 -->
              <div class="benefits-section">
                <div class="benefits-grid">
                  <div class="benefit-item">
                    <div class="benefit-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                      </svg>
                    </div>
                    <div class="benefit-info">
                      <div class="benefit-value">{{ selectedPackage.points }}积分</div>
                      <div class="benefit-label">到账积分（过期清零）</div>
                    </div>
                  </div>
                  <div class="benefit-item">
                    <div class="benefit-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                    </div>
                    <div class="benefit-info">
                      <div class="benefit-value">{{ selectedPackage.concurrent_limit }}</div>
                      <div class="benefit-label">并发限制</div>
                    </div>
                  </div>
                  <div class="benefit-item">
                    <div class="benefit-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </div>
                    <div class="benefit-info">
                      <div class="benefit-value">{{ selectedPackage.duration_days }}天</div>
                      <div class="benefit-label">有效期</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 价格计算区 -->
              <div class="pricing-section">
                <!-- 优惠券 -->
                <div class="coupon-row">
                  <div class="coupon-input-wrapper">
                    <input
                      v-model="purchaseCouponCode"
                      type="text"
                      placeholder="优惠券码（可选）"
                      class="coupon-input"
                      :disabled="couponLoading || appliedCoupon"
                    />
                    <button
                      v-if="!appliedCoupon"
                      @click="applyCoupon"
                      class="coupon-btn"
                      :disabled="!purchaseCouponCode || couponLoading"
                    >
                      {{ couponLoading ? '...' : '使用' }}
                    </button>
                    <button
                      v-else
                      @click="() => { appliedCoupon = null; couponDiscount = 0; purchaseCouponCode = '' }"
                      class="coupon-btn remove"
                    >
                      移除
                    </button>
                  </div>
                  <div v-if="couponError" class="coupon-error">{{ couponError }}</div>
                  <div v-if="appliedCoupon" class="coupon-success">✓ 已优惠 ¥{{ (couponDiscount / 100).toFixed(2) }}</div>
                </div>

                <!-- 价格明细 -->
                <div class="price-breakdown">
                  <div class="price-row">
                    <span class="price-label">套餐价格</span>
                    <span class="price-value">¥{{ (purchaseInfo.totalAmount / 100).toFixed(2) }}</span>
                  </div>
                  <div v-if="purchaseInfo.upgradeDiscount > 0" class="price-row discount">
                    <span class="price-label">升级折抵</span>
                    <span class="price-value">-¥{{ (purchaseInfo.upgradeDiscount / 100).toFixed(2) }}</span>
                  </div>
                  <div v-if="purchaseInfo.couponDiscount > 0" class="price-row discount">
                    <span class="price-label">优惠券</span>
                    <span class="price-value">-¥{{ (purchaseInfo.couponDiscount / 100).toFixed(2) }}</span>
                  </div>
                  <div class="price-row">
                    <span class="price-label">
                      账户余额
                      <span class="balance-hint">¥{{ (purchaseInfo.balance / 100).toFixed(2) }}</span>
                    </span>
                    <span class="price-value">-¥{{ (purchaseInfo.balanceUsed / 100).toFixed(2) }}</span>
                  </div>
                </div>

                <!-- 应付金额 -->
                <div class="total-row">
                  <span class="total-label">{{ purchaseInfo.needOnlinePayment ? '需支付' : '余额支付' }}</span>
                  <span class="total-value">¥{{ (purchaseInfo.needPay / 100).toFixed(2) }}</span>
                </div>
              </div>

              <!-- 支付方式 -->
              <div v-if="purchaseInfo.needOnlinePayment && paymentMethods.length > 0" class="payment-section">
                <div class="payment-label">支付方式</div>
                <div class="payment-grid">
                  <label
                    v-for="method in paymentMethods"
                    :key="method.id"
                    class="payment-item"
                    :class="{ active: purchasePaymentMethod === method.id }"
                  >
                    <input
                      type="radio"
                      :value="method.id"
                      v-model="purchasePaymentMethod"
                      class="sr-only"
                    />
                    <span class="payment-radio-dot"></span>
                    <span class="payment-text">{{ method.name }}</span>
                  </label>
                </div>
              </div>

              <!-- 余额充足提示 -->
              <div v-if="!purchaseInfo.needOnlinePayment" class="balance-tip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span>余额充足，将直接从账户余额扣款</span>
              </div>

              <!-- 错误提示 -->
              <div v-if="purchaseError" class="error-tip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{{ purchaseError }}</span>
              </div>
              </template>
            </div>

            <!-- 底部按钮（等待支付时隐藏） -->
            <div v-if="!showPaymentWaiting" class="modal-footer">
              <button class="btn-cancel" @click="closePurchaseModal">取消</button>
              <button
                class="btn-confirm"
                @click="confirmPurchase"
                :disabled="purchaseLoading || (purchaseInfo?.needOnlinePayment && !purchasePaymentMethod)"
              >
                <span v-if="purchaseLoading" class="loading-dot"></span>
                {{ purchaseLoading ? '处理中...' : (purchaseInfo?.needOnlinePayment ? '去支付' : '确认购买') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 充值弹窗 -->
      <div v-if="showRechargeModal" class="recharge-modal-overlay" @click.self="closeRechargeModal">
        <div class="recharge-modal-container">
          <!-- 头部 -->
          <div class="recharge-modal-header">
            <h3>账户充值</h3>
            <button class="close-btn" @click="closeRechargeModal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <!-- 内容 -->
          <div class="recharge-modal-body">
            <!-- 快捷金额选择 -->
            <div class="recharge-section">
              <label class="section-label">选择充值金额</label>
              <div class="quick-amounts">
                <button
                  v-for="item in quickAmounts"
                  :key="item.value"
                  class="amount-btn"
                  :class="{ active: rechargeAmount === item.value }"
                  @click="selectQuickAmount(item.value)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <!-- 自定义金额 -->
            <div class="recharge-section">
              <label class="section-label">或输入自定义金额（元）</label>
              <div class="custom-amount-wrapper">
                <span class="currency-prefix">¥</span>
                <input
                  type="number"
                  v-model="customAmount"
                  placeholder="1-10000"
                  min="1"
                  max="10000"
                  class="custom-amount-input"
                  @input="rechargeAmount = null"
                />
              </div>
            </div>

            <!-- 支付方式 -->
            <div class="recharge-section">
              <label class="section-label">支付方式</label>
              <div class="payment-methods" v-if="rechargePaymentOptions.length > 0">
                <label
                  v-for="method in rechargePaymentOptions"
                  :key="method.id"
                  class="payment-method-item"
                  :class="{ active: rechargePaymentMethod === method.id }"
                  @click="selectRechargePaymentMethod(method.id)"
                >
                  <input
                    type="radio"
                    :value="method.id"
                    v-model="rechargePaymentMethod"
                    class="hidden-radio"
                    @change="rechargeError = ''"
                  />
                  <span class="method-icon">💰</span>
                  <span class="method-name">{{ method.name }}</span>
                </label>
              </div>
              <div v-else class="payment-methods-empty">
                <span>暂无可用支付方式</span>
              </div>
            </div>

            <!-- 错误提示 -->
            <div v-if="rechargeError" class="recharge-error">
              {{ rechargeError }}
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="recharge-modal-footer">
            <button
              class="confirm-recharge-btn"
              @click="confirmRecharge"
              :disabled="rechargeLoading || (getRechargeAmountInCents() <= 0)"
            >
              <span v-if="rechargeLoading" class="loading-dot"></span>
              {{ rechargeLoading ? '处理中...' : '确认充值' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 弹窗遮罩 */
.package-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

/* 弹窗容器 */
.package-modal-container {
  background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  width: 100%;
  max-width: 1200px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
}

/* 头部 */
.package-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
  border-bottom: 1px solid #2a2a2a;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  width: 24px;
  height: 24px;
  color: #ffffff;
}

.header-title {
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid #2a2a2a;
  color: #888888;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #2a2a2a;
  border-color: #3a3a3a;
  color: #ffffff;
}

.close-btn svg {
  width: 18px;
  height: 18px;
}

/* 当前套餐横幅 */
.active-package-banner {
  margin: 24px 32px;
  padding: 20px;
  background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
  border: 1px solid #3a3a3a;
  border-radius: 12px;
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.banner-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.banner-icon svg {
  width: 24px;
  height: 24px;
  color: #1a1a1a;
}

.banner-info {
  flex: 1;
}

.banner-label {
  font-size: 12px;
  color: #888888;
  margin-bottom: 4px;
}

.banner-name {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.banner-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  font-size: 11px;
  color: #888888;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: #3a3a3a;
}

/* 余额横幅 */
.balance-banner {
  margin: 0 32px 24px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
  border: 1px solid #3a3a3a;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.balance-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.balance-icon {
  width: 20px;
  height: 20px;
  color: #ffffff;
}

.balance-label {
  font-size: 14px;
  color: #888888;
}

.balance-value {
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
}

.recharge-entry-btn {
  padding: 6px 14px;
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
  border: none;
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.recharge-entry-btn:hover {
  background: linear-gradient(135deg, #8b5cf6 0%, #818cf8 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}

/* 错误横幅 */
.error-banner {
  margin: 0 32px 24px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #ef4444;
  font-size: 14px;
}

.error-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* 弹窗主体 */
.package-modal-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 32px 32px;
  /* 优化滚动体验 */
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.package-modal-body::-webkit-scrollbar {
  width: 6px;
}

.package-modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.package-modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.package-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #2a2a2a;
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p {
  color: #888888;
  font-size: 14px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  color: #3a3a3a;
}

.empty-state p {
  color: #888888;
  font-size: 14px;
}

/* 套餐网格 */
.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  padding-top: 12px;
  overflow: visible;
}

/* 套餐卡片 */
.package-card {
  position: relative;
  background: linear-gradient(180deg, #1f1f1f 0%, #1a1a1a 100%);
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 24px;
  transition: all 0.3s ease;
  overflow: visible;
}

.package-card:hover {
  border-color: #3a3a3a;
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.package-card.is-active {
  border-color: #ffffff;
  background: linear-gradient(180deg, #2a2a2a 0%, #1f1f1f 100%);
}

/* 推荐标签 */
.package-badge {
  position: absolute;
  top: -10px;
  right: 20px;
  padding: 4px 12px;
  background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
  color: #1a1a1a;
  font-size: 11px;
  font-weight: 600;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* 套餐类型 */
.package-type {
  font-size: 12px;
  color: #888888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

/* 套餐名称 */
.package-name {
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 8px;
}

/* 套餐描述 */
.package-description {
  font-size: 13px;
  color: #888888;
  margin-bottom: 16px;
  min-height: 36px;
}

/* 价格 */
.package-price {
  display: flex;
  align-items: baseline;
  margin-bottom: 20px;
}

.price-symbol {
  font-size: 20px;
  color: #ffffff;
  margin-right: 4px;
}

.price-value {
  font-size: 36px;
  font-weight: 700;
  color: #ffffff;
}

/* 特性列表 */
.package-features {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #cccccc;
}

.feature-icon {
  width: 16px;
  height: 16px;
  color: #ffffff;
  flex-shrink: 0;
}

/* 购买按钮 */
.purchase-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
  border: none;
  border-radius: 8px;
  color: #1a1a1a;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.purchase-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #e0e0e0 0%, #c0c0c0 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
}

.purchase-btn:active:not(:disabled) {
  transform: translateY(0);
}

.purchase-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.package-card.is-active .purchase-btn {
  background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
  color: #1a1a1a;
}

.purchase-btn.is-current {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #ffffff;
}

.purchase-btn.is-current:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

/* 弹窗动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .package-modal-container,
.modal-fade-leave-to .package-modal-container {
  transform: scale(0.95) translateY(20px);
}

/* 滚动条样式 */
.package-modal-body::-webkit-scrollbar {
  width: 8px;
}

.package-modal-body::-webkit-scrollbar-track {
  background: #1a1a1a;
  border-radius: 4px;
}

.package-modal-body::-webkit-scrollbar-thumb {
  background: #3a3a3a;
  border-radius: 4px;
}

.package-modal-body::-webkit-scrollbar-thumb:hover {
  background: #4a4a4a;
}

/* 响应式 */
@media (max-width: 768px) {
  .package-modal-container {
    max-width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .package-modal-header {
    padding: 20px;
  }

  .active-package-banner,
  .balance-banner,
  .error-banner {
    margin-left: 20px;
    margin-right: 20px;
  }

  .package-modal-body {
    padding: 0 20px 20px;
  }

  .packages-grid {
    grid-template-columns: 1fr;
  }

  .banner-content {
    flex-wrap: wrap;
  }

  .banner-stats {
    width: 100%;
    justify-content: space-around;
  }
}

/* ========== 购买确认模态框样式 ========== */
.purchase-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 20px;
}

.purchase-modal {
  width: 100%;
  max-width: 420px;
  background: linear-gradient(180deg, #1c1c1e 0%, #141416 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

/* 头部 */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header-content {
  display: flex;
  align-items: center;
  gap: 14px;
}

.modal-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-icon svg {
  width: 22px;
  height: 22px;
  color: rgba(255, 255, 255, 0.8);
}

.modal-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #fff;
}

.modal-subtitle {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.modal-close svg {
  width: 16px;
  height: 16px;
}

/* 内容区 */
.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 套餐权益 */
.benefits-section {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  padding: 16px;
}

.benefits-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.benefit-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.benefit-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.benefit-icon svg {
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.7);
}

.benefit-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.benefit-value {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.benefit-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

/* 价格计算区 */
.pricing-section {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 优惠券行 */
.coupon-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.coupon-input-wrapper {
  display: flex;
  gap: 8px;
}

.coupon-input {
  flex: 1;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  outline: none;
  transition: all 0.2s;
}

.coupon-input:focus {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.4);
}

.coupon-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.coupon-input:disabled {
  opacity: 0.6;
}

.coupon-btn {
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.coupon-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.coupon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.coupon-btn.remove {
  color: #ef4444;
}

.coupon-error {
  font-size: 12px;
  color: #ef4444;
  padding-left: 2px;
}

.coupon-success {
  font-size: 12px;
  color: #10b981;
  padding-left: 2px;
}

/* 价格明细 */
.price-breakdown {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}

.price-row.discount {
  color: #10b981;
}

.price-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.balance-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

.price-value {
  font-weight: 500;
}

/* 应付金额 */
.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.total-value {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
}

/* 支付方式 */
.payment-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.payment-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.payment-grid {
  display: flex;
  gap: 10px;
}

.payment-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.payment-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.payment-item.active {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.payment-radio-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  position: relative;
  transition: all 0.2s;
  flex-shrink: 0;
}

.payment-item.active .payment-radio-dot {
  border-color: #fff;
}

.payment-item.active .payment-radio-dot::after {
  content: '';
  position: absolute;
  inset: 3px;
  background: #fff;
  border-radius: 50%;
}

.payment-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.payment-item.active .payment-text {
  color: #fff;
  font-weight: 500;
}

/* 提示信息 */
.balance-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(16, 185, 129, 0.1);
  border-radius: 10px;
  font-size: 13px;
  color: #10b981;
}

.balance-tip svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.error-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 10px;
  font-size: 13px;
  color: #ef4444;
}

.error-tip svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* 底部按钮 */
.modal-footer {
  display: flex;
  gap: 10px;
  padding: 16px 24px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-cancel {
  flex: 1;
  padding: 14px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.btn-confirm {
  flex: 1.5;
  padding: 14px;
  background: linear-gradient(135deg, #fff 0%, #e8e8e8 100%);
  border: none;
  border-radius: 12px;
  color: #111;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(255, 255, 255, 0.15);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.loading-dot {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top-color: #111;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* ========== 等待支付样式 ========== */
.payment-waiting {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部状态 */
.waiting-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
}

.waiting-icon-wrap {
  width: 48px;
  height: 48px;
  position: relative;
  flex-shrink: 0;
}

.waiting-icon-inner {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.waiting-icon-inner svg {
  width: 22px;
  height: 22px;
  color: rgba(255, 255, 255, 0.7);
}

.waiting-spinner {
  position: absolute;
  inset: -3px;
  border-radius: 14px;
  border: 2px solid transparent;
  border-top-color: rgba(255, 255, 255, 0.4);
  animation: spin 1s linear infinite;
}

.waiting-text {
  flex: 1;
}

.waiting-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
}

.waiting-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

/* 订单信息卡片 */
.waiting-order-card {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 14px 16px;
}

.order-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-info-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.order-info-value {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}

.order-info-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 10px 0;
}

.order-info-amount {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
}

/* 步骤指示器 */
.waiting-steps-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 16px 0 8px;
}

.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
}

.step-dot.active {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.step-line {
  width: 48px;
  height: 1px;
  background: rgba(255, 255, 255, 0.15);
}

.waiting-steps-labels {
  display: flex;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

/* 错误提示 */
.waiting-error {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.12);
  border-radius: 8px;
  font-size: 13px;
  color: #f87171;
  text-align: center;
}

/* 操作按钮组 */
.waiting-btn-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.waiting-btn-primary {
  width: 100%;
  padding: 14px;
  background: #fff;
  border: none;
  border-radius: 12px;
  color: #111;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.waiting-btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(255, 255, 255, 0.15);
}

.waiting-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.waiting-btn-row {
  display: flex;
  gap: 10px;
}

.waiting-btn-secondary {
  flex: 1;
  padding: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.waiting-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}

.waiting-btn-ghost {
  flex: 1;
  padding: 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.waiting-btn-ghost:hover {
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
}

/* 模态框动画 */
.modal-scale-enter-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-scale-leave-active {
  transition: all 0.2s ease-in;
}

.modal-scale-enter-from,
.modal-scale-leave-to {
  opacity: 0;
}

.modal-scale-enter-from .purchase-modal,
.modal-scale-leave-to .purchase-modal {
  transform: scale(0.92);
  opacity: 0;
}

/* 响应式 */
@media (max-width: 480px) {
  .purchase-modal {
    max-width: 100%;
    border-radius: 16px;
  }

  .benefits-grid {
    gap: 8px;
  }

  .benefit-value {
    font-size: 14px;
  }

  .total-value {
    font-size: 24px;
  }

  .payment-grid {
    flex-direction: column;
  }
}

/* 矮屏幕适配 - 确保支付按钮可见 */
@media (max-height: 700px) {
  .package-modal-container {
    max-height: calc(100vh - 40px);
  }
  
  .package-modal-header {
    padding: 16px 24px;
  }
  
  .header-title {
    font-size: 18px;
  }
  
  .package-modal-body {
    padding: 0 24px 24px;
  }
  
  .active-package-banner,
  .balance-banner {
    padding: 14px 18px;
    margin-bottom: 16px;
  }
  
  .packages-grid {
    gap: 14px;
  }
  
  .package-card {
    padding: 18px;
  }
  
  .package-name {
    font-size: 16px;
  }
  
  .package-description {
    font-size: 12px;
  }
  
  .package-price-display {
    font-size: 22px;
    margin: 10px 0;
  }
  
  .features-list {
    gap: 6px;
    margin-bottom: 14px;
  }
  
  .purchase-button {
    padding: 10px 16px;
    font-size: 13px;
  }
}

@media (max-height: 550px) {
  .package-modal-container {
    max-height: 100vh;
    border-radius: 12px;
  }
  
  .package-modal-header {
    padding: 12px 20px;
  }
  
  .package-modal-body {
    padding: 0 16px 16px;
  }
  
  .packages-grid {
    gap: 10px;
  }
  
  .package-card {
    padding: 14px;
  }
  
  .package-price-display {
    font-size: 20px;
    margin: 8px 0;
  }
  
  /* 购买确认弹窗紧凑化 */
  .purchase-modal {
    padding: 20px;
  }
  
  .purchase-modal-body {
    padding: 16px;
    gap: 14px;
  }
  
  .benefits-grid {
    gap: 10px;
  }
  
  .benefit-item {
    padding: 10px;
  }
  
  .price-summary {
    padding: 14px;
  }
  
  .purchase-modal-footer {
    padding: 16px;
    gap: 10px;
  }
  
  .btn-cancel,
  .btn-confirm {
    padding: 10px 20px;
    font-size: 14px;
  }
}

/* 等待支付视图响应式 */
@media (max-height: 600px) {
  .waiting-view {
    padding: 24px 20px;
  }
  
  .waiting-icon-container {
    margin-bottom: 16px;
  }
  
  .waiting-icon-bg {
    width: 56px;
    height: 56px;
  }
  
  .waiting-title {
    font-size: 18px;
  }
  
  .waiting-subtitle {
    font-size: 13px;
  }
  
  .order-info-card {
    padding: 12px 16px;
    margin: 12px 0;
  }
  
  .waiting-steps {
    margin: 12px 0;
    gap: 6px;
  }
  
  .step-number {
    width: 22px;
    height: 22px;
    font-size: 11px;
  }
  
  .step-text {
    font-size: 12px;
  }
  
  .waiting-actions {
    gap: 8px;
    margin-top: 16px;
  }
  
  .btn-confirm-payment {
    padding: 10px 24px;
    font-size: 14px;
  }
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   充值弹窗样式（必须在全局样式中）
   ======================================== */
.recharge-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10100;
  padding: 20px;
}

.recharge-modal-container {
  background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  overflow: hidden;
}

.recharge-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #2a2a2a;
}

.recharge-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.recharge-modal-header .close-btn {
  background: transparent;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: #666666;
  transition: color 0.2s ease;
  border-radius: 6px;
}

.recharge-modal-header .close-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.recharge-modal-header .close-btn svg {
  width: 18px;
  height: 18px;
}

.recharge-modal-body {
  padding: 24px;
}

.recharge-section {
  margin-bottom: 20px;
}

.recharge-section:last-child {
  margin-bottom: 0;
}

.section-label {
  display: block;
  font-size: 13px;
  color: #888888;
  margin-bottom: 12px;
}

.quick-amounts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.amount-btn {
  padding: 14px 8px;
  background: #1f1f1f;
  border: 1px solid #333333;
  border-radius: 10px;
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.amount-btn:hover {
  background: #2a2a2a;
  border-color: #444444;
}

.amount-btn.active {
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
  border-color: #7c3aed;
}

.custom-amount-wrapper {
  display: flex;
  align-items: center;
  background: #1f1f1f;
  border: 1px solid #333333;
  border-radius: 10px;
  padding: 0 16px;
  transition: border-color 0.2s ease;
}

.custom-amount-wrapper:focus-within {
  border-color: #7c3aed;
}

.currency-prefix {
  color: #888888;
  font-size: 16px;
  font-weight: 500;
}

.custom-amount-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  padding: 14px 12px;
  color: #ffffff;
  font-size: 16px;
}

.custom-amount-input::placeholder {
  color: #555555;
}

.custom-amount-input::-webkit-outer-spin-button,
.custom-amount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.payment-methods {
  background: #1f1f1f;
  border: 1px solid #333333;
  border-radius: 10px;
  overflow: hidden;
}

.payment-method-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  border-bottom: 1px solid #2a2a2a;
}

.payment-method-item:last-child {
  border-bottom: none;
}

.payment-method-item:hover {
  background: #252525;
}

.payment-method-item.active {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%);
}

.hidden-radio {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.method-icon {
  font-size: 20px;
}

.method-name {
  color: #ffffff;
  font-size: 14px;
}

.payment-methods-empty {
  padding: 20px;
  text-align: center;
  color: #666666;
  font-size: 14px;
  background: #1f1f1f;
  border: 1px solid #333333;
  border-radius: 10px;
}

.coupon-input-wrapper {
  display: flex;
  gap: 10px;
}

.coupon-input {
  flex: 1;
  background: #1f1f1f;
  border: 1px solid #333333;
  border-radius: 10px;
  padding: 12px 16px;
  color: #ffffff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.coupon-input:focus {
  border-color: #7c3aed;
}

.coupon-input::placeholder {
  color: #555555;
}

.apply-coupon-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.apply-coupon-btn:hover {
  background: linear-gradient(135deg, #8b5cf6 0%, #818cf8 100%);
}

.recharge-error {
  margin-top: 16px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #f87171;
  font-size: 13px;
}

.recharge-modal-footer {
  padding: 20px 24px;
  border-top: 1px solid #2a2a2a;
}

.confirm-recharge-btn {
  width: 100%;
  padding: 14px 24px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.confirm-recharge-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.confirm-recharge-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ========================================
   PackageModal 白昼模式样式适配
   ======================================== */

/* 主遮罩层 */
:root.canvas-theme-light .package-modal-overlay {
  background: rgba(0, 0, 0, 0.4) !important;
}

/* 主容器 */
:root.canvas-theme-light .package-modal-container {
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.15) !important;
}

/* 头部 */
:root.canvas-theme-light .package-modal-header {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .header-icon {
  color: #1c1917 !important;
}

:root.canvas-theme-light .header-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .close-btn {
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .close-btn:hover {
  background: rgba(0, 0, 0, 0.05) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: #1c1917 !important;
}

/* 当前套餐横幅 */
:root.canvas-theme-light .active-package-banner {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%) !important;
  border-color: rgba(99, 102, 241, 0.15) !important;
}

:root.canvas-theme-light .banner-icon {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
}

:root.canvas-theme-light .banner-icon svg {
  color: #fff !important;
}

:root.canvas-theme-light .banner-label {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .banner-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .stat-label {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .stat-value {
  color: #1c1917 !important;
}

:root.canvas-theme-light .stat-divider {
  background: rgba(0, 0, 0, 0.1) !important;
}

/* 余额横幅 */
:root.canvas-theme-light .balance-banner {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .balance-icon {
  color: #1c1917 !important;
}

:root.canvas-theme-light .balance-label {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .balance-value {
  color: #1c1917 !important;
}

/* 错误横幅 */
:root.canvas-theme-light .error-banner {
  background: rgba(239, 68, 68, 0.08) !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
  color: #dc2626 !important;
}

/* 弹窗主体 */
:root.canvas-theme-light .package-modal-body {
  scrollbar-color: rgba(0, 0, 0, 0.15) transparent !important;
}

:root.canvas-theme-light .package-modal-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02) !important;
}

:root.canvas-theme-light .package-modal-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .package-modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2) !important;
}

/* 加载状态 */
:root.canvas-theme-light .loading-spinner {
  border-color: rgba(0, 0, 0, 0.1) !important;
  border-top-color: #6366f1 !important;
}

:root.canvas-theme-light .loading-state p {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 空状态 */
:root.canvas-theme-light .empty-icon {
  color: rgba(0, 0, 0, 0.2) !important;
}

:root.canvas-theme-light .empty-state p {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 套餐卡片 */
:root.canvas-theme-light .package-card {
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .package-card:hover {
  border-color: rgba(0, 0, 0, 0.15) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .package-card.is-active {
  border-color: #6366f1 !important;
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.05) 0%, #ffffff 100%) !important;
}

/* 推荐标签 */
:root.canvas-theme-light .package-badge {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}

/* 套餐信息 */
:root.canvas-theme-light .package-type {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .package-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .package-description {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .price-symbol,
:root.canvas-theme-light .price-value {
  color: #1c1917 !important;
}

/* 特性列表 */
:root.canvas-theme-light .feature-item {
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .feature-icon {
  color: #10b981 !important;
}

/* 购买按钮 */
:root.canvas-theme-light .purchase-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}

:root.canvas-theme-light .purchase-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%) !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3) !important;
}

:root.canvas-theme-light .purchase-btn.is-current {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
}

:root.canvas-theme-light .purchase-btn.is-current:hover {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3) !important;
}

/* ========== 购买确认弹窗 ========== */
:root.canvas-theme-light .purchase-modal-overlay {
  background: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .purchase-modal {
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.15) !important;
}

/* 弹窗头部 */
:root.canvas-theme-light .modal-header {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .modal-icon {
  background: rgba(99, 102, 241, 0.1) !important;
  border-color: rgba(99, 102, 241, 0.15) !important;
}

:root.canvas-theme-light .modal-icon svg {
  color: #6366f1 !important;
}

:root.canvas-theme-light .modal-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .modal-subtitle {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .modal-close {
  background: rgba(0, 0, 0, 0.05) !important;
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .modal-close:hover {
  background: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

/* 套餐权益 */
:root.canvas-theme-light .benefits-section {
  background: rgba(0, 0, 0, 0.02) !important;
}

:root.canvas-theme-light .benefit-icon {
  background: rgba(99, 102, 241, 0.08) !important;
  border-color: rgba(99, 102, 241, 0.12) !important;
}

:root.canvas-theme-light .benefit-icon svg {
  color: #6366f1 !important;
}

:root.canvas-theme-light .benefit-value {
  color: #1c1917 !important;
}

:root.canvas-theme-light .benefit-label {
  color: rgba(0, 0, 0, 0.45) !important;
}

/* 价格计算区 */
:root.canvas-theme-light .pricing-section {
  background: rgba(0, 0, 0, 0.02) !important;
}

/* 优惠券 */
:root.canvas-theme-light .coupon-input {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .coupon-input:focus {
  border-color: rgba(99, 102, 241, 0.4) !important;
  background: #fff !important;
}

:root.canvas-theme-light .coupon-input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .coupon-btn {
  background: rgba(99, 102, 241, 0.1) !important;
  color: #6366f1 !important;
}

:root.canvas-theme-light .coupon-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.15) !important;
}

:root.canvas-theme-light .coupon-btn.remove {
  color: #dc2626 !important;
  background: rgba(220, 38, 38, 0.08) !important;
}

:root.canvas-theme-light .coupon-error {
  color: #dc2626 !important;
}

:root.canvas-theme-light .coupon-success {
  color: #059669 !important;
}

/* 价格明细 */
:root.canvas-theme-light .price-breakdown {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .price-row {
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .price-row.discount {
  color: #059669 !important;
}

:root.canvas-theme-light .balance-hint {
  color: rgba(0, 0, 0, 0.4) !important;
}

/* 应付金额 */
:root.canvas-theme-light .total-label {
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .total-value {
  color: #1c1917 !important;
}

/* 支付方式 */
:root.canvas-theme-light .payment-label {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .payment-item {
  background: rgba(0, 0, 0, 0.02) !important;
}

:root.canvas-theme-light .payment-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .payment-item.active {
  border-color: #6366f1 !important;
  background: rgba(99, 102, 241, 0.05) !important;
}

:root.canvas-theme-light .payment-radio-dot {
  border-color: rgba(0, 0, 0, 0.2) !important;
}

:root.canvas-theme-light .payment-item.active .payment-radio-dot {
  border-color: #6366f1 !important;
}

:root.canvas-theme-light .payment-item.active .payment-radio-dot::after {
  background: #6366f1 !important;
}

:root.canvas-theme-light .payment-text {
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .payment-item.active .payment-text {
  color: #6366f1 !important;
}

/* 提示信息 */
:root.canvas-theme-light .balance-tip {
  background: rgba(16, 185, 129, 0.08) !important;
  color: #059669 !important;
}

:root.canvas-theme-light .error-tip {
  background: rgba(220, 38, 38, 0.08) !important;
  color: #dc2626 !important;
}

/* 底部按钮 */
:root.canvas-theme-light .modal-footer {
  border-top-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .btn-cancel {
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .btn-cancel:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .btn-confirm {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}

:root.canvas-theme-light .btn-confirm:hover:not(:disabled) {
  box-shadow: 0 8px 20px rgba(99, 102, 241, 0.25) !important;
}

:root.canvas-theme-light .loading-dot {
  border-top-color: #fff !important;
}

/* ========== 等待支付状态 ========== */
:root.canvas-theme-light .waiting-header {
  background: rgba(99, 102, 241, 0.05) !important;
}

:root.canvas-theme-light .waiting-icon-inner {
  background: rgba(99, 102, 241, 0.1) !important;
}

:root.canvas-theme-light .waiting-icon-inner svg {
  color: #6366f1 !important;
}

:root.canvas-theme-light .waiting-spinner {
  border-top-color: #6366f1 !important;
}

:root.canvas-theme-light .waiting-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .waiting-subtitle {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 订单信息卡片 */
:root.canvas-theme-light .waiting-order-card {
  background: rgba(0, 0, 0, 0.02) !important;
}

:root.canvas-theme-light .order-info-label {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .order-info-value {
  color: #1c1917 !important;
}

:root.canvas-theme-light .order-info-divider {
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .order-info-amount {
  color: #1c1917 !important;
}

/* 步骤指示器 */
:root.canvas-theme-light .step-dot {
  background: rgba(0, 0, 0, 0.05) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .step-dot.active {
  background: rgba(99, 102, 241, 0.1) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
  color: #6366f1 !important;
}

:root.canvas-theme-light .step-line {
  background: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .waiting-steps-labels {
  color: rgba(0, 0, 0, 0.4) !important;
}

/* 等待支付错误 */
:root.canvas-theme-light .waiting-error {
  background: rgba(220, 38, 38, 0.08) !important;
  color: #dc2626 !important;
}

/* 等待支付按钮 */
:root.canvas-theme-light .waiting-btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}

:root.canvas-theme-light .waiting-btn-primary:hover:not(:disabled) {
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.25) !important;
}

:root.canvas-theme-light .waiting-btn-secondary {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .waiting-btn-secondary:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .waiting-btn-ghost {
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .waiting-btn-ghost:hover {
  border-color: rgba(0, 0, 0, 0.12) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

/* ========== 充值按钮白昼模式 ========== */
:root.canvas-theme-light .recharge-entry-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.2) !important;
}

:root.canvas-theme-light .recharge-entry-btn:hover {
  background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%) !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3) !important;
}

/* ========== 充值弹窗白昼模式 ========== */
:root.canvas-theme-light .recharge-modal-overlay {
  background: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .recharge-modal-container {
  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .recharge-modal-header {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .recharge-modal-header h3 {
  color: #1c1917 !important;
}

:root.canvas-theme-light .recharge-modal-header .close-btn {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .recharge-modal-header .close-btn:hover {
  color: #1c1917 !important;
  background: rgba(0, 0, 0, 0.05) !important;
}

:root.canvas-theme-light .section-label {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .amount-btn {
  background: #f5f5f5 !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .amount-btn:hover {
  background: #eeeeee !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .amount-btn.active {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  border-color: #6366f1 !important;
  color: #ffffff !important;
}

:root.canvas-theme-light .custom-amount-wrapper {
  background: #f5f5f5 !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .custom-amount-wrapper:focus-within {
  border-color: #6366f1 !important;
}

:root.canvas-theme-light .currency-prefix {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .custom-amount-input {
  color: #1c1917 !important;
}

:root.canvas-theme-light .custom-amount-input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .payment-methods {
  background: #f5f5f5 !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .payment-method-item {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .payment-method-item:hover {
  background: #eeeeee !important;
}

:root.canvas-theme-light .payment-method-item.active {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%) !important;
}

:root.canvas-theme-light .method-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .payment-methods-empty {
  background: #f5f5f5 !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .coupon-input {
  background: #f5f5f5 !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .coupon-input:focus {
  border-color: #6366f1 !important;
}

:root.canvas-theme-light .coupon-input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .apply-coupon-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
}

:root.canvas-theme-light .apply-coupon-btn:hover {
  background: linear-gradient(135deg, #818cf8 0%, #a78bfa 100%) !important;
}

:root.canvas-theme-light .recharge-error {
  background: rgba(220, 38, 38, 0.08) !important;
  border-color: rgba(220, 38, 38, 0.2) !important;
  color: #dc2626 !important;
}

:root.canvas-theme-light .recharge-modal-footer {
  border-top-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .confirm-recharge-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
}

:root.canvas-theme-light .confirm-recharge-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%) !important;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25) !important;
}
</style>
