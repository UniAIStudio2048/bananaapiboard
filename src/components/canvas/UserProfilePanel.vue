<script setup>
/**
 * UserProfilePanel.vue - 画布模式个人中心浮动面板
 * 点击左侧工具栏的P按钮时弹出
 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { redeemVoucher as redeemVoucherApi, updateUserPreferences, clearAuthSession } from '@/api/client'
import { getTenantHeaders, getApiUrl } from '@/config/tenant'
import { formatPoints, formatBalance } from '@/utils/format'
import { useI18n } from '@/i18n'
import { useTeamStore } from '@/stores/team'

const { t } = useI18n()
const teamStore = useTeamStore()

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

// 返利中心
const referralStats = ref({ available: 0, total_earned: 0, pending: 0, withdrawn: 0, transferred: 0, invitee_count: 0 })
const referralRecords = ref([])
const referralWithdrawals = ref([])
const referralActionAmount = ref('')
const referralAlipayName = ref('')
const referralAlipayAccount = ref('')
const referralSubmitting = ref(false)

// 新手引导设置
const onboardingEnabled = ref(localStorage.getItem('canvasOnboardingEnabled') === 'true')

// 客服二维码弹窗
const showSupportQrModal = ref(false)
const supportQrImage = ref('')

// 空间切换相关
const showSpaceDropdown = ref(false)
const showCreateTeamModal = ref(false)
const createTeamForm = ref({ name: '', description: '' })
const createTeamLoading = ref(false)
const createTeamError = ref('')

// 团队管理相关
const showInviteMemberModal = ref(false)
const inviteMemberForm = ref({ query: '', selectedUser: null, role: 'member', message: '' })
const inviteSearchResults = ref([])
const inviteSearchLoading = ref(false)
const inviteLoading = ref(false)
const showTeamSettingsModal = ref(false)
const editingTeam = ref(null)
const showTransferOwnershipModal = ref(false)
const transferTargetUser = ref(null)
// 成员管理弹窗
const showMemberManageModal = ref(false)
const memberManageTeam = ref(null)
const memberManageLoading = ref(false)

// 重命名团队弹窗
const showRenameTeamModal = ref(false)
const renameTeamForm = ref({ name: '' })
const renameTeamLoading = ref(false)
const renameTeamError = ref('')
const renamingTeam = ref(null)

// 连线样式设置
const edgeStyleOptions = [
  { value: 'smoothstep', labelKey: 'onboarding.settings.edgeStyleSmoothstep' },
  { value: 'bezier', labelKey: 'onboarding.settings.edgeStyleBezier' },
  { value: 'straight', labelKey: 'onboarding.settings.edgeStyleStraight' },
  { value: 'hidden', labelKey: 'onboarding.settings.edgeStyleHidden' }
]

// 初始化连线样式 - 优先从用户偏好加载，其次从localStorage，最后使用默认值
const selectedEdgeStyle = ref(
  props.userInfo?.preferences?.canvas?.edgeStyle ||
  localStorage.getItem('canvasEdgeStyle') ||
  'bezier'
)

// 监听用户信息变化，更新连线样式
watch(() => props.userInfo?.preferences?.canvas?.edgeStyle, (newStyle) => {
  if (newStyle && newStyle !== selectedEdgeStyle.value) {
    selectedEdgeStyle.value = newStyle
    localStorage.setItem('canvasEdgeStyle', newStyle)
    window.dispatchEvent(new CustomEvent('canvas-edge-style-change', { detail: { style: newStyle } }))
  }
})

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
async function changeEdgeStyle(style) {
  selectedEdgeStyle.value = style
  localStorage.setItem('canvasEdgeStyle', style)

  // 通知画布更新连线样式
  window.dispatchEvent(new CustomEvent('canvas-edge-style-change', { detail: { style } }))

  // 保存到后端用户偏好
  try {
    const currentPreferences = props.userInfo?.preferences || {}
    const updatedPreferences = {
      ...currentPreferences,
      canvas: {
        ...(currentPreferences.canvas || {}),
        edgeStyle: style
      }
    }

    const result = await updateUserPreferences(updatedPreferences)
    if (result) {
      console.log('[UserProfilePanel] 连线样式偏好已保存到后端:', style)
      // 通知父组件更新用户信息
      emit('update')
    } else {
      console.warn('[UserProfilePanel] 保存连线样式偏好失败')
    }
  } catch (error) {
    console.error('[UserProfilePanel] 保存连线样式偏好时出错:', error)
  }
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
  { id: 'teams', icon: 'users', label: '团队空间', badge: teamStore.pendingInvitationsCount.value > 0 ? teamStore.pendingInvitationsCount.value : null },
  { id: 'packages', icon: 'package', label: t('user.packages') },
  { id: 'points', icon: 'diamond', label: t('user.pointsManage') },
  { id: 'voucher', icon: 'ticket', label: t('user.redeemCenter') },
  ...(props.userInfo?.referral_enabled ? [{ id: 'referral', icon: 'dollar-sign', label: '返利中心' }] : []),
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
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  credit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
  brush: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 114.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 00-3-3.02z"/></svg>`,
  message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12"/><path d="M15 9.5a3 3 0 00-3-2.5c-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5a3 3 0 01-3-2.5"/></svg>`,
  'dollar-sign': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`
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
      // 设置当前用户ID到 teamStore
      teamStore.setCurrentUserId(props.userInfo.id)
    }
    // 加载团队数据
    await teamStore.loadMyTeams()
    await teamStore.loadPendingInvitations()
  }
}, { immediate: true })

// 点击外部关闭空间下拉
watch(() => showSpaceDropdown.value, (val) => {
  if (val) {
    const closeDropdown = (e) => {
      if (!e.target.closest('.space-switcher-section')) {
        showSpaceDropdown.value = false
        document.removeEventListener('click', closeDropdown)
      }
    }
    setTimeout(() => document.addEventListener('click', closeDropdown), 0)
  }
})

// 切换到返利中心时加载数据
watch(activeMenu, (val) => {
  if (val === 'referral') loadReferralData()
})

// 加载数据
async function loadData() {
  if (!token) return
  loading.value = true

  try {
    const headers = { ...getTenantHeaders(), Authorization: `Bearer ${token}` }

    const [ledgerRes, packagesRes, inviteRes, checkinRes, activePackageRes, settingsRes, pointsConfigRes] = await Promise.all([
      fetch(getApiUrl('/api/user/points'), { headers }),
      fetch(getApiUrl('/api/packages'), { headers }),
      fetch(getApiUrl('/api/user/invite-code'), { headers }),
      fetch(getApiUrl('/api/user/checkin-status'), { headers }),
      fetch(getApiUrl('/api/user/package'), { headers }),
      fetch(getApiUrl('/api/settings/app'), { headers }), // 🔧 加载租户配置
      fetch(getApiUrl('/api/points-config'), { headers: getTenantHeaders() }) // 🔧 加载积分配置（包含汇率）
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
    // 🔧 加载积分配置（包含余额兑换汇率）
    if (pointsConfigRes.ok) {
      const configData = await pointsConfigRes.json()
      if (configData.exchange_rate_points_per_currency) {
        exchangeRate.value = Number(configData.exchange_rate_points_per_currency)
        console.log('[UserProfilePanel] 余额兑换汇率:', exchangeRate.value)
      }
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

// ==================== 空间切换相关方法 ====================

// 选择空间
async function selectSpace(type, teamId = null) {
  showSpaceDropdown.value = false
  if (type === 'personal') {
    teamStore.switchToPersonalSpace()
  } else if (type === 'team' && teamId) {
    await teamStore.switchToTeam(teamId)
  }
}

// 获取角色标签
function getRoleLabel(role) {
  const labels = {
    owner: '所有者',
    admin: '管理员',
    member: '成员'
  }
  return labels[role] || role
}

// 打开创建团队弹窗
function openCreateTeamModal() {
  showSpaceDropdown.value = false
  createTeamForm.value = { name: '', description: '' }
  createTeamError.value = ''
  showCreateTeamModal.value = true
}

// 创建团队
async function handleCreateTeam() {
  if (!createTeamForm.value.name.trim()) {
    createTeamError.value = '请输入团队名称'
    return
  }
  
  createTeamLoading.value = true
  createTeamError.value = ''
  
  try {
    const result = await teamStore.createTeam(
      createTeamForm.value.name.trim(),
      createTeamForm.value.description.trim()
    )
    
    if (result.success) {
      showCreateTeamModal.value = false
      // 自动切换到新创建的团队
      await teamStore.switchToTeam(result.team.id)
    } else {
      createTeamError.value = result.message || '创建失败'
    }
  } catch (error) {
    console.error('[Team] 创建团队失败:', error)
    createTeamError.value = '创建失败，请重试'
  } finally {
    createTeamLoading.value = false
  }
}

// 打开重命名团队弹窗
function openRenameTeamModal(team) {
  renamingTeam.value = team
  renameTeamForm.value.name = team.name
  renameTeamError.value = ''
  showRenameTeamModal.value = true
}

// 重命名团队
async function handleRenameTeam() {
  const newName = renameTeamForm.value.name.trim()
  if (!newName) {
    renameTeamError.value = '请输入团队名称'
    return
  }
  if (newName === renamingTeam.value.name) {
    showRenameTeamModal.value = false
    return
  }

  renameTeamLoading.value = true
  renameTeamError.value = ''

  try {
    const result = await teamStore.updateTeam(renamingTeam.value.id, { name: newName })
    if (result.success) {
      showRenameTeamModal.value = false
      showAlert('团队已重命名', '成功')
    } else {
      renameTeamError.value = result.message || '重命名失败'
    }
  } catch (error) {
    console.error('[Team] 重命名团队失败:', error)
    renameTeamError.value = '重命名失败，请重试'
  } finally {
    renameTeamLoading.value = false
  }
}

// 接受邀请
async function handleAcceptInvitation(inviteId) {
  const result = await teamStore.acceptInvitation(inviteId)
  if (result.success) {
    showAlert('已加入团队', '成功')
  } else {
    showAlert(result.message || '加入失败', '错误')
  }
}

// 拒绝邀请
async function handleRejectInvitation(inviteId) {
  const result = await teamStore.rejectInvitation(inviteId)
  if (!result.success) {
    showAlert(result.message || '操作失败', '错误')
  }
}

// 打开邀请成员弹窗
function openInviteMemberModal(team) {
  editingTeam.value = team
  inviteMemberForm.value = { query: '', selectedUser: null, role: 'member', message: '' }
  inviteSearchResults.value = []
  showInviteMemberModal.value = true
}

// 搜索用户
let searchTimeout = null
async function handleSearchUsers(query) {
  if (searchTimeout) clearTimeout(searchTimeout)
  
  // 输入5个字符以上才触发搜索推荐
  if (!query || query.trim().length < 5) {
    inviteSearchResults.value = []
    return
  }
  
  // 防抖300ms后触发搜索
  searchTimeout = setTimeout(async () => {
    inviteSearchLoading.value = true
    const result = await teamStore.searchUsers(query.trim(), editingTeam.value?.id)
    inviteSearchResults.value = result.users || []
    inviteSearchLoading.value = false
  }, 300)
}

// 选择要邀请的用户
function selectUserToInvite(user) {
  inviteMemberForm.value.selectedUser = user
  inviteMemberForm.value.query = user.username
  inviteSearchResults.value = []
}

// 验证邮箱格式
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// 检查是否可以发送邀请（选中了用户 或 输入了有效邮箱）
function canSendInvite() {
  if (inviteMemberForm.value.selectedUser) return true
  const query = inviteMemberForm.value.query?.trim()
  return query && isValidEmail(query)
}

// 发送邀请
async function handleInviteMember() {
  const selectedUser = inviteMemberForm.value.selectedUser
  const inputEmail = inviteMemberForm.value.query?.trim()
  
  // 如果选中了用户，使用用户ID邀请
  // 否则检查是否输入了有效邮箱
  if (!selectedUser && !isValidEmail(inputEmail)) {
    showAlert('请选择要邀请的用户，或输入有效的邮箱地址', '提示')
    return
  }
  
  inviteLoading.value = true
  try {
    const result = await teamStore.inviteMember(
      editingTeam.value.id,
      selectedUser?.id || null,  // 用户ID（可选）
      inviteMemberForm.value.role,
      inviteMemberForm.value.message,
      selectedUser ? null : inputEmail  // 邮箱（当没有选中用户时使用）
    )
    
    if (result.success) {
      if (result.autoAccepted) {
        showAlert('对方已自动加入团队（你们已有共创空间）', '成功')
      } else {
        showAlert('邀请已发送', '成功')
      }
      showInviteMemberModal.value = false
    } else {
      showAlert(result.message || '邀请失败', '错误')
    }
  } finally {
    inviteLoading.value = false
  }
}

// 打开成员管理弹窗
async function openMemberManageModal(team) {
  memberManageTeam.value = team
  memberManageLoading.value = true
  showMemberManageModal.value = true
  await teamStore.loadTeamMembers(team.id)
  memberManageLoading.value = false
}

// 移除成员
async function handleRemoveMember(team, userId) {
  const confirmed = await showConfirm('确定要移除该成员吗？')
  if (!confirmed) return
  
  const result = await teamStore.removeMember(team.id, userId)
  if (result.success) {
    showAlert('已移除成员', '成功')
  } else {
    showAlert(result.message || '移除失败', '错误')
  }
}

// 修改成员角色
async function handleChangeMemberRole(team, userId, newRole) {
  const result = await teamStore.changeMemberRole(team.id, userId, newRole)
  if (result.success) {
    showAlert('角色已更新', '成功')
  } else {
    showAlert(result.message || '修改失败', '错误')
  }
}

// 退出团队
async function handleLeaveTeam(team) {
  const confirmed = await showConfirm(`确定要退出团队「${team.name}」吗？`)
  if (!confirmed) return
  
  const result = await teamStore.leaveTeam(team.id)
  if (result.success) {
    showAlert('已退出团队', '成功')
  } else {
    showAlert(result.message || '退出失败', '错误')
  }
}

// 解散团队
async function handleDissolveTeam(team) {
  const confirmed = await showConfirm(`确定要解散团队「${team.name}」吗？此操作不可恢复！`)
  if (!confirmed) return
  
  const result = await teamStore.dissolveTeam(team.id)
  if (result.success) {
    showAlert('团队已解散', '成功')
  } else {
    showAlert(result.message || '解散失败', '错误')
  }
}

// 转让所有权
async function handleTransferOwnership(team, newOwnerId) {
  const confirmed = await showConfirm('确定要转让团队所有权吗？您将变为管理员。')
  if (!confirmed) return
  
  const result = await teamStore.transferOwnership(team.id, newOwnerId)
  if (result.success) {
    showAlert('所有权已转让', '成功')
    showTransferOwnershipModal.value = false
  } else {
    showAlert(result.message || '转让失败', '错误')
  }
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
    
    // 获取兑换券的面值余额
    const voucherBalance = result.balance || 0
    
    console.log('[Canvas/redeemVoucher] 兑换成功，兑换券面值余额:', voucherBalance, '分 (¥' + (voucherBalance/100).toFixed(2) + ')')
    
    // 如果兑换券有余额，尝试自动购买套餐
    if (voucherBalance > 0) {
      console.log('[Canvas/redeemVoucher] 开始自动购买套餐流程...')
      const autoPurchaseResult = await tryAutoPurchasePackage(voucherBalance)
      
      if (autoPurchaseResult.success) {
        // 自动购买成功
        let actionText = '已自动购买'
        let detailText = ''
        if (autoPurchaseResult.isRenewal) {
          actionText = '已自动续费'
          detailText = `\n• 有效期延长：${autoPurchaseResult.durationDays}天\n• 累加积分：+${formatPoints(autoPurchaseResult.points)}`
        } else if (autoPurchaseResult.isUpgrade) {
          actionText = '已自动升级'
          detailText = `\n• 赠送积分：${formatPoints(autoPurchaseResult.points)}\n• 并发限制：${autoPurchaseResult.concurrentLimit}个\n• 有效期：${autoPurchaseResult.durationDays}天`
        } else {
          detailText = `\n• 赠送积分：${formatPoints(autoPurchaseResult.points)}\n• 并发限制：${autoPurchaseResult.concurrentLimit}个\n• 有效期：${autoPurchaseResult.durationDays}天`
        }
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(voucherBalance / 100).toFixed(2)} 余额\n\n🎉 ${actionText}「${autoPurchaseResult.packageName}」套餐${detailText}\n\n💰 剩余余额：¥${(autoPurchaseResult.remainingBalance / 100).toFixed(2)}`
      } else if (autoPurchaseResult.reason === 'no_package') {
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(voucherBalance / 100).toFixed(2)} 余额\n\n💡 ${autoPurchaseResult.message}`
      } else if (autoPurchaseResult.reason === 'purchase_failed') {
        voucherSuccess.value = `✅ 兑换成功！获得 ¥${(voucherBalance / 100).toFixed(2)} 余额\n\n⚠️ 自动购买套餐失败：${autoPurchaseResult.message}`
      } else {
        voucherSuccess.value = result.message || t('voucher.redeemSuccess')
      }
    } else if (result.points > 0) {
      voucherSuccess.value = `✅ 成功兑换 ${formatPoints(result.points)} 积分！`
    } else {
      voucherSuccess.value = result.message || t('voucher.redeemSuccess')
    }
    
    voucherCode.value = ''
    emit('update')
    // 延长显示时间让用户看到详情
    setTimeout(() => { voucherSuccess.value = '' }, 8000)
  } catch (e) {
    voucherError.value = e.message || t('voucher.redeemFailed')
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
    
    console.log('[Canvas/tryAutoPurchasePackage] 兑换券面值:', voucherBalance, '分')
    
    // 获取套餐列表
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
    const pkgRes = await fetch('/api/packages', { headers })
    if (!pkgRes.ok) {
      return { success: false, reason: 'fetch_failed', message: '获取套餐列表失败' }
    }
    const pkgData = await pkgRes.json()
    const pkgList = pkgData.packages || []
    
    if (pkgList.length === 0) {
      return { success: false, reason: 'no_package', message: '暂无可用套餐' }
    }
    
    // 获取当前用户套餐
    const activeRes = await fetch('/api/user/package', { headers })
    let currentPackage = null
    if (activeRes.ok) {
      const activeData = await activeRes.json()
      currentPackage = activeData.package
    }
    
    // 套餐等级定义
    const packageOrder = { daily: 1, weekly: 2, monthly: 3, quarterly: 4, yearly: 5 }
    const currentOrder = currentPackage ? (packageOrder[currentPackage.package_type] || 0) : 0
    
    // 找到兑换券面值范围内可以购买的套餐（同级续费或升级，不能降级）
    const affordablePackages = pkgList.filter(pkg => {
      if (pkg.price > voucherBalance) return false
      const newOrder = packageOrder[pkg.type] || 0
      if (currentPackage && newOrder < currentOrder) return false
      return true
    })
    
    if (affordablePackages.length === 0) {
      const minPrice = pkgList.reduce((min, p) => (!min || p.price < min.price) ? p : min, null)?.price || 0
      let hint = '兑换券面值不足以购买套餐'
      if (minPrice > 0 && voucherBalance < minPrice) {
        hint = `最低套餐需要 ¥${(minPrice/100).toFixed(2)}，兑换券面值 ¥${(voucherBalance/100).toFixed(2)} 不足`
      }
      return { success: false, reason: 'no_package', message: hint }
    }
    
    // 按套餐等级排序，选择最大的
    affordablePackages.sort((a, b) => (packageOrder[b.type] || 0) - (packageOrder[a.type] || 0))
    
    const selectedPackage = affordablePackages[0]
    const selectedOrder = packageOrder[selectedPackage.type] || 0
    const isRenewal = currentPackage && selectedOrder === currentOrder
    const isUpgrade = currentPackage && selectedOrder > currentOrder
    
    console.log(`[Canvas/tryAutoPurchasePackage] 选择套餐: "${selectedPackage.name}" (${isRenewal ? '续费' : isUpgrade ? '升级' : '新购'})`)
    
    // 购买套餐
    const purchaseRes = await fetch('/api/packages/purchase', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_id: selectedPackage.id })
    })
    
    const purchaseData = await purchaseRes.json()
    
    if (purchaseRes.ok && !purchaseData.pay_url) {
      // 购买成功，获取最新余额
      const userRes = await fetch('/api/user/me', { headers })
      let remainingBalance = 0
      if (userRes.ok) {
        const userData = await userRes.json()
        remainingBalance = userData.balance || 0
      }
      
      return {
        success: true,
        packageName: selectedPackage.name,
        points: selectedPackage.points,
        isRenewal,
        isUpgrade,
        concurrentLimit: selectedPackage.concurrent_limit,
        durationDays: selectedPackage.duration_days,
        remainingBalance
      }
    } else {
      return { success: false, reason: 'purchase_failed', message: purchaseData.message || '购买失败' }
    }
  } catch (e) {
    console.error('[Canvas/tryAutoPurchasePackage] 异常:', e)
    return { success: false, reason: 'error', message: e.message || '网络错误' }
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
    
    const res = await fetch('/api/user/coupons/validate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code: purchaseCouponCode.value.trim().toUpperCase(),
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
        showAlert(data.message || `🎉 套餐购买成功！获得 ${formatPoints(selectedPackage.value.points)} 积分`, '购买成功')
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
          showAlert(`🎉 支付成功！套餐已激活，获得 ${formatPoints(selectedPackage.value.points)} 积分`, '支付成功')
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
      showAlert(`🎉 支付成功！套餐已激活，获得 ${formatPoints(selectedPackage.value.points)} 积分`, '支付成功')
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
    t('user.transferConfirmMsg', { amount: yuan.toFixed(2), points: formatPoints(points) }), 
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
      showAlert(data.message || t('user.transferSuccessMsg', { points: formatPoints(data.points || points) }), `🎉 ${t('user.transferSuccess')}`)
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

// ===== 返利中心 =====
async function loadReferralData() {
  const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}` }
  try {
    const [statsRes, recordsRes, withdrawalsRes] = await Promise.all([
      fetch('/api/user/referral/stats', { headers }),
      fetch('/api/user/referral/records?page_size=50', { headers }),
      fetch('/api/user/referral/withdrawals?page_size=50', { headers })
    ])
    if (statsRes.ok) referralStats.value = await statsRes.json()
    if (recordsRes.ok) { const d = await recordsRes.json(); referralRecords.value = d.records || [] }
    if (withdrawalsRes.ok) { const d = await withdrawalsRes.json(); referralWithdrawals.value = d.withdrawals || [] }
  } catch (e) {
    console.error('[referral] load error:', e)
  }
}

async function doReferralWithdraw() {
  const amt = Number(referralActionAmount.value)
  if (!amt || amt <= 0) { showAlert('请输入有效金额', '提示'); return }
  if (!referralAlipayName.value.trim()) { showAlert('请输入支付宝真实姓名', '提示'); return }
  if (!referralAlipayAccount.value.trim()) { showAlert('请输入支付宝账号', '提示'); return }
  const amtFen = Math.round(amt * 100)
  const confirmed = await showConfirm(`确定申请提现 ¥${amt.toFixed(2)} 到支付宝账号 ${referralAlipayAccount.value} 吗？提现需要审核通过后才能到账。`, '确认提现')
  if (!confirmed) return
  referralSubmitting.value = true
  try {
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    const res = await fetch('/api/user/referral/withdraw', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: amtFen,
        alipay_name: referralAlipayName.value.trim(),
        alipay_account: referralAlipayAccount.value.trim()
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || '提现失败')
    showAlert('提现申请已提交，等待审核', '成功')
    referralActionAmount.value = ''
    referralAlipayName.value = ''
    referralAlipayAccount.value = ''
    loadReferralData()
  } catch (e) {
    showAlert(e.message, '错误')
  } finally {
    referralSubmitting.value = false
  }
}

async function doReferralTransfer() {
  const amt = Number(referralActionAmount.value)
  if (!amt || amt <= 0) { showAlert('请输入有效金额', '提示'); return }
  const amtFen = Math.round(amt * 100)
  const confirmed = await showConfirm(`确定将 ¥${amt.toFixed(2)} 划转到余额吗？划转后不可再提现。`, '确认划转')
  if (!confirmed) return
  referralSubmitting.value = true
  try {
    const headers = { ...getTenantHeaders(), 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    const res = await fetch('/api/user/referral/transfer', { method: 'POST', headers, body: JSON.stringify({ amount: amtFen }) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || '划转失败')
    showAlert('划转成功，已到账余额', '成功')
    referralActionAmount.value = ''
    loadReferralData()
    emit('update')
  } catch (e) {
    showAlert(e.message, '错误')
  } finally {
    referralSubmitting.value = false
  }
}

function formatRebateAmount(fen) {
  return ((fen || 0) / 100).toFixed(2)
}

function formatRebateTime(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN')
}

// 退出登录
async function logout() {
  const confirmed = await showConfirm(t('user.logoutConfirmMsg'), t('user.logoutConfirm'))
  if (confirmed) {
    clearAuthSession()
    localStorage.removeItem('userMode')
    router.push('/')
  }
}

// 跳转到帮助
function goToHelp() {
  // 可以打开帮助弹窗或跳转
  window.open('/help', '_blank')
}

// 打开帮助链接
function openHelpLink(linkType) {
  const helpLinks = appSettings.value.help_links || {}
  
  // 特殊处理联系客服：如果有二维码图片，显示二维码弹窗
  if (linkType === 'contact_support') {
    const qrImage = helpLinks.contact_support_qr
    if (qrImage) {
      supportQrImage.value = qrImage
      showSupportQrModal.value = true
      return
    }
  }
  
  const url = helpLinks[linkType]
  if (url) {
    window.open(url, '_blank')
  } else {
    console.warn(`[UserProfilePanel] 帮助链接未配置: ${linkType}`)
  }
}

// 关闭客服二维码弹窗
function closeSupportQrModal() {
  showSupportQrModal.value = false
  supportQrImage.value = ''
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
          
          <!-- 空间切换器 -->
          <div class="space-switcher-section">
            <div class="current-space" @click="showSpaceDropdown = !showSpaceDropdown">
              <span class="space-icon">{{ teamStore.currentSpaceIcon.value }}</span>
              <span class="space-name">{{ teamStore.currentSpaceLabel.value }}</span>
              <span class="dropdown-arrow">▼</span>
            </div>
            <div v-if="showSpaceDropdown" class="space-dropdown" @click.stop>
              <div 
                class="space-option"
                :class="{ active: teamStore.globalSpaceType.value === 'personal' }"
                @click="selectSpace('personal')"
              >
                <span class="space-icon">👤</span>
                <span>{{ t('team.personalSpace') }}</span>
                <span v-if="teamStore.globalSpaceType.value === 'personal'" class="check-mark">✓</span>
              </div>
              <div class="space-divider" v-if="teamStore.myTeams.value.length > 0"></div>
              <div 
                v-for="team in teamStore.myTeams.value"
                :key="team.id"
                class="space-option"
                :class="{ active: teamStore.globalTeamId.value === team.id }"
                @click="selectSpace('team', team.id)"
              >
                <span class="space-icon">👥</span>
                <span class="team-name">{{ team.name }}</span>
                <span class="team-meta">{{ team.member_count }}人 · {{ getRoleLabel(team.my_role) }}</span>
                <span v-if="teamStore.globalTeamId.value === team.id" class="check-mark">✓</span>
              </div>
              <div class="space-divider"></div>
              <div class="space-option create-team" @click="openCreateTeamModal">
                <span class="space-icon">➕</span>
                <span>{{ t('team.createTeamSpace') }}</span>
              </div>
              <div 
                v-if="teamStore.pendingInvitationsCount.value > 0" 
                class="space-option invitations"
                @click="activeMenu = 'teams'; showSpaceDropdown = false"
              >
                <span class="space-icon">📨</span>
                <span>邀请通知</span>
                <span class="invite-badge">{{ teamStore.pendingInvitationsCount.value }}</span>
              </div>
            </div>
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
              <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
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

            <!-- 团队空间管理 -->
            <div v-else-if="activeMenu === 'teams'" class="content-section teams-section">
              <!-- 待处理邀请 -->
              <div v-if="teamStore.pendingInvitations.value.length > 0" class="invitations-section">
                <h4 class="section-title">
                  📨 待处理邀请 ({{ teamStore.pendingInvitations.value.length }})
                </h4>
                <div class="invitation-list">
                  <div 
                    v-for="invite in teamStore.pendingInvitations.value" 
                    :key="invite.id"
                    class="invitation-card"
                  >
                    <div class="invitation-info">
                      <div class="team-avatar">👥</div>
                      <div class="invitation-details">
                        <div class="team-name">{{ invite.team_name }}</div>
                        <div class="inviter-info">{{ invite.inviter_username }} 邀请您加入</div>
                        <div v-if="invite.message" class="invite-message">「{{ invite.message }}」</div>
                      </div>
                    </div>
                    <div class="invitation-actions">
                      <button class="btn-accept" @click="handleAcceptInvitation(invite.id)">接受</button>
                      <button class="btn-reject" @click="handleRejectInvitation(invite.id)">拒绝</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 我的团队 -->
              <div class="my-teams-section">
                <div class="section-header">
                  <h4 class="section-title">👥 我的团队 ({{ teamStore.myTeams.value.length }})</h4>
                  <button class="btn-create-team" @click="openCreateTeamModal">
                    <span>➕</span> 创建团队
                  </button>
                </div>
                
                <div v-if="teamStore.myTeams.value.length === 0" class="empty-teams">
                  <p>您还没有加入任何团队</p>
                  <p class="hint">创建团队或接受邀请来开始协作</p>
                </div>
                
                <div v-else class="team-list">
                  <div 
                    v-for="team in teamStore.myTeams.value" 
                    :key="team.id"
                    class="team-card"
                    :class="{ active: teamStore.globalTeamId.value === team.id }"
                  >
                    <!-- 第一行：头像 + 团队信息 + 角色 -->
                    <div class="team-card-header">
                      <div class="team-avatar-large">{{ team.name.charAt(0).toUpperCase() }}</div>
                      <div class="team-details">
                        <div class="team-name-row">
                          <span class="team-name">{{ team.name }}</span>
                          <span class="role-tag" :class="'role-' + team.my_role">{{ getRoleLabel(team.my_role) }}</span>
                        </div>
                        <div class="team-meta">{{ team.member_count }} 名成员</div>
                      </div>
                    </div>
                    <!-- 第二行：操作按钮 -->
                    <div class="team-card-actions">
                      <button 
                        v-if="team.my_role === 'owner' || team.my_role === 'admin'"
                        class="btn-team-action"
                        @click="openInviteMemberModal(team)"
                        title="邀请成员"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <line x1="19" y1="8" x2="19" y2="14"/>
                          <line x1="22" y1="11" x2="16" y2="11"/>
                        </svg>
                        <span>邀请</span>
                      </button>
                      <button
                        v-if="team.my_role === 'owner'"
                        class="btn-team-action"
                        @click="openRenameTeamModal(team)"
                        title="重命名团队"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                          <path d="m15 5 4 4"/>
                        </svg>
                        <span>重命名</span>
                      </button>
                      <button
                        v-if="team.my_role === 'owner'"
                        class="btn-team-action"
                        @click="openMemberManageModal(team)"
                        title="管理成员"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <span>管理</span>
                      </button>
                      <button 
                        v-if="team.my_role === 'owner'"
                        class="btn-team-action danger"
                        @click="handleDissolveTeam(team)"
                        title="解散团队"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M3 6h18"/>
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                        <span>解散</span>
                      </button>
                      <button 
                        v-if="team.my_role !== 'owner'"
                        class="btn-team-action"
                        @click="handleLeaveTeam(team)"
                        title="退出团队"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        <span>退出</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
                  <div class="package-points">{{ formatPoints(pkg.points) }} {{ t('user.points') }}</div>
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
                          <span class="detail-text">{{ t('packages.includePoints', { points: formatPoints(hoveredPackage.points) }) }}</span>
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

            <!-- 返利中心 -->
            <div v-else-if="activeMenu === 'referral'" class="content-section">
              <!-- 统计卡片 -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;text-align:center;">
                  <div style="font-size:11px;color:#aaa;margin-bottom:4px;">可用返利</div>
                  <div style="font-size:18px;font-weight:bold;color:#e5e7eb;">¥{{ formatRebateAmount(referralStats.available) }}</div>
                </div>
                <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;text-align:center;">
                  <div style="font-size:11px;color:#aaa;margin-bottom:4px;">累计返利</div>
                  <div style="font-size:18px;font-weight:bold;color:#e5e7eb;">¥{{ formatRebateAmount(referralStats.total_earned) }}</div>
                </div>
                <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;text-align:center;">
                  <div style="font-size:11px;color:#aaa;margin-bottom:4px;">待审核提现</div>
                  <div style="font-size:18px;font-weight:bold;color:#e5e7eb;">¥{{ formatRebateAmount(referralStats.pending) }}</div>
                </div>
                <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;text-align:center;">
                  <div style="font-size:11px;color:#aaa;margin-bottom:4px;">邀请人数</div>
                  <div style="font-size:18px;font-weight:bold;color:#e5e7eb;">{{ referralStats.invitee_count }}</div>
                </div>
              </div>
              <!-- 操作区 -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                <!-- 申请提现 -->
                <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;">
                  <div style="font-size:12px;font-weight:600;color:#f59e0b;margin-bottom:10px;">申请提现到支付宝</div>
                  <div style="margin-bottom:8px;">
                    <div style="font-size:11px;color:#aaa;margin-bottom:4px;">提现金额（元）</div>
                    <input v-model.number="referralActionAmount" type="number" step="0.01" min="0.01" placeholder="输入提现金额"
                      style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#e5e7eb;font-size:13px;outline:none;box-sizing:border-box;" />
                  </div>
                  <div style="margin-bottom:8px;">
                    <div style="font-size:11px;color:#aaa;margin-bottom:4px;">支付宝真实姓名</div>
                    <input v-model="referralAlipayName" type="text" placeholder="请输入收款人姓名" maxlength="50"
                      style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#e5e7eb;font-size:13px;outline:none;box-sizing:border-box;" />
                  </div>
                  <div style="margin-bottom:8px;">
                    <div style="font-size:11px;color:#aaa;margin-bottom:4px;">支付宝账号</div>
                    <input v-model="referralAlipayAccount" type="text" placeholder="手机号或邮箱" maxlength="200"
                      style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#e5e7eb;font-size:13px;outline:none;box-sizing:border-box;" />
                  </div>
                  <button @click="doReferralWithdraw" :disabled="referralSubmitting"
                    style="width:100%;background:rgba(255,255,255,0.15);color:#e5e7eb;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:8px;font-size:12px;cursor:pointer;">
                    {{ referralSubmitting ? '处理中...' : '申请提现' }}
                  </button>
                  <div style="font-size:11px;color:#888;margin-top:6px;">提现需管理员审核通过后打款到您的支付宝</div>
                </div>
                <!-- 划转余额 -->
                <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;">
                  <div style="font-size:12px;font-weight:600;color:#10b981;margin-bottom:10px;">划转到账户余额</div>
                  <div style="margin-bottom:8px;">
                    <div style="font-size:11px;color:#aaa;margin-bottom:4px;">划转金额（元）</div>
                    <input v-model.number="referralActionAmount" type="number" step="0.01" min="0.01" placeholder="输入划转金额"
                      style="width:100%;padding:6px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#e5e7eb;font-size:13px;outline:none;box-sizing:border-box;" />
                  </div>
                  <button @click="doReferralTransfer" :disabled="referralSubmitting"
                    style="width:100%;background:rgba(255,255,255,0.25);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:8px;font-size:12px;cursor:pointer;">
                    {{ referralSubmitting ? '处理中...' : '划转余额' }}
                  </button>
                  <div style="font-size:11px;color:#888;margin-top:6px;">即时到账，划转后可用于消费但不可再提现</div>
                </div>
              </div>
              <!-- 返利记录 -->
              <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;margin-bottom:12px;">
                <div style="font-size:13px;font-weight:600;margin-bottom:10px;">返利记录</div>
                <div v-if="referralRecords.length === 0" style="text-align:center;color:#888;font-size:12px;padding:16px 0;">暂无返利记录</div>
                <div v-for="r in referralRecords" :key="r.id" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;">
                  <div>
                    <div style="color:#ddd;">{{ r.invitee_name || r.invitee_email || '用户' }}</div>
                    <div style="color:#888;font-size:11px;">{{ formatRebateTime(r.created_at) }}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="color:#e5e7eb;">+¥{{ formatRebateAmount(r.rebate_amount) }}</div>
                    <div style="color:#888;font-size:11px;">{{ ((r.rebate_rate || 0) * 100).toFixed(0) }}%</div>
                  </div>
                </div>
              </div>
              <!-- 提现记录 -->
              <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;">
                <div style="font-size:13px;font-weight:600;margin-bottom:10px;">提现记录</div>
                <div v-if="referralWithdrawals.length === 0" style="text-align:center;color:#888;font-size:12px;padding:16px 0;">暂无提现记录</div>
                <div v-for="w in referralWithdrawals" :key="w.id" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                      <span :style="{ color: w.type === 'withdraw' ? '#f59e0b' : '#3b82f6', fontWeight: 500 }">{{ w.type === 'withdraw' ? '提现' : '划转余额' }}</span>
                      <span :style="{ color: w.status === 'approved' ? '#10b981' : w.status === 'rejected' ? '#ef4444' : '#eab308', marginLeft: '6px' }">
                        {{ w.status === 'approved' ? '已通过' : w.status === 'rejected' ? '已拒绝' : '待审核' }}
                      </span>
                    </div>
                    <div style="color:#ddd;font-weight:600;">¥{{ formatRebateAmount(w.amount) }}</div>
                  </div>
                  <div v-if="w.alipay_name" style="color:#888;font-size:11px;margin-top:2px;">{{ w.alipay_name }} · {{ w.alipay_account }}</div>
                  <div style="color:#888;font-size:11px;margin-top:2px;">{{ formatRebateTime(w.created_at) }}</div>
                  <div v-if="w.admin_note" style="color:#888;font-size:11px;margin-top:2px;">备注：{{ w.admin_note }}</div>
                </div>
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
                  <li>每邀请一位好友注册，您获得 {{ formatPoints(appSettings.inviter_bonus || 10) }} 积分</li>
                  <li>被邀请人也可获得 {{ formatPoints(appSettings.invitee_bonus || 5) }} 积分奖励</li>
                  <li>{{ t('user.inviteRule3') }}</li>
                </ul>
              </div>
            </div>

            <!-- 使用教程 -->
            <div v-else-if="activeMenu === 'help'" class="content-section">
              <div class="help-list">
                <div class="help-item" @click="openHelpLink('quick_start')">
                  <span class="help-icon" v-html="icons.book"></span>
                  <span class="help-text">{{ t('user.quickStart') }}</span>
                  <span class="help-arrow">→</span>
                </div>
                <div class="help-item" @click="openHelpLink('canvas_tutorial')">
                  <span class="help-icon" v-html="icons.brush"></span>
                  <span class="help-text">{{ t('user.canvasTutorial') }}</span>
                  <span class="help-arrow">→</span>
                </div>
                <div class="help-item" @click="openHelpLink('ai_generate_tips')">
                  <span class="help-icon" v-html="icons.diamond"></span>
                  <span class="help-text">{{ t('user.aiGenerateTips') }}</span>
                  <span class="help-arrow">→</span>
                </div>
                <div class="help-item" @click="openHelpLink('contact_support')">
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
                    <span v-if="card.bonus_type === 'random'">+{{ formatPoints(card.bonus_min) }}~{{ formatPoints(card.bonus_max) }} 随机积分</span>
                    <span v-else>+{{ formatPoints(card.bonus_fixed) }} 积分奖励</span>
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

  <!-- 客服二维码弹窗 -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div 
        v-if="showSupportQrModal" 
        class="support-qr-modal-overlay"
        @click.self="closeSupportQrModal"
      >
        <div class="support-qr-modal">
          <div class="support-qr-header">
            <span>{{ t('user.contactSupport') }}</span>
            <button class="support-qr-close" @click="closeSupportQrModal">×</button>
          </div>
          <div class="support-qr-body">
            <img :src="supportQrImage" alt="客服二维码" class="support-qr-image" />
            <p class="support-qr-tip">请使用微信扫描二维码</p>
            <!-- 如果有链接也显示 -->
            <button 
              v-if="appSettings?.help_links?.contact_support"
              class="support-qr-link-btn"
              @click="() => { window.open(appSettings.help_links.contact_support, '_blank'); closeSupportQrModal(); }"
            >
              <svg class="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              <span>{{ appSettings?.help_links?.contact_support_name || '在线客服' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  
  <!-- 创建团队弹窗 -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showCreateTeamModal" class="modal-overlay" @click.self="showCreateTeamModal = false">
        <div class="modal-content team-modal">
          <div class="modal-header">
            <h3>{{ t('team.createTeamSpace') }}</h3>
            <button class="modal-close" @click="showCreateTeamModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>团队名称 <span class="required">*</span></label>
              <input 
                v-model="createTeamForm.name" 
                type="text" 
                placeholder="输入团队名称" 
                maxlength="50"
                @keyup.enter="handleCreateTeam"
              />
            </div>
            <div class="form-group">
              <label>团队描述</label>
              <textarea 
                v-model="createTeamForm.description" 
                placeholder="简单描述您的团队（可选）" 
                rows="3"
                maxlength="200"
              ></textarea>
            </div>
            <div v-if="createTeamError" class="error-message">{{ createTeamError }}</div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="showCreateTeamModal = false">取消</button>
            <button class="btn-confirm" @click="handleCreateTeam" :disabled="createTeamLoading">
              {{ createTeamLoading ? '创建中...' : '创建团队' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 重命名团队弹窗 -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showRenameTeamModal" class="modal-overlay" @click.self="showRenameTeamModal = false">
        <div class="modal-content team-modal">
          <div class="modal-header">
            <h3>重命名团队</h3>
            <button class="modal-close" @click="showRenameTeamModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>团队名称 <span class="required">*</span></label>
              <input
                v-model="renameTeamForm.name"
                type="text"
                placeholder="输入新的团队名称"
                maxlength="50"
                @keyup.enter="handleRenameTeam"
              />
            </div>
            <div v-if="renameTeamError" class="error-message">{{ renameTeamError }}</div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="showRenameTeamModal = false">取消</button>
            <button class="btn-confirm" @click="handleRenameTeam" :disabled="renameTeamLoading">
              {{ renameTeamLoading ? '保存中...' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 邀请成员弹窗 -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showInviteMemberModal" class="modal-overlay" @click.self="showInviteMemberModal = false">
        <div class="modal-content team-modal">
          <div class="modal-header">
            <h3>邀请成员加入「{{ editingTeam?.name }}」</h3>
            <button class="modal-close" @click="showInviteMemberModal = false">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>搜索用户或输入邮箱</label>
              <input 
                v-model="inviteMemberForm.query" 
                type="text" 
                placeholder="输入用户名/邮箱搜索，或直接输入邮箱邀请" 
                @input="handleSearchUsers(inviteMemberForm.query)"
              />
              <div v-if="inviteSearchLoading" class="search-loading">搜索中...</div>
              <div v-else-if="inviteSearchResults.length > 0" class="search-results">
                <div 
                  v-for="user in inviteSearchResults" 
                  :key="user.id"
                  class="search-result-item"
                  @click="selectUserToInvite(user)"
                >
                  <div class="user-avatar-small">{{ user.username.charAt(0).toUpperCase() }}</div>
                  <div class="user-info-small">
                    <div class="username">{{ user.username }}</div>
                    <div class="email">{{ user.email }}</div>
                  </div>
                </div>
              </div>
              <div v-else-if="inviteMemberForm.query && inviteMemberForm.query.length >= 5 && !inviteSearchLoading" class="search-hint">
                未找到用户？可直接输入完整邮箱发送邀请
              </div>
            </div>
            <div v-if="inviteMemberForm.selectedUser" class="selected-user">
              已选择: <strong>{{ inviteMemberForm.selectedUser.username }}</strong>
            </div>
            <div v-else-if="isValidEmail(inviteMemberForm.query)" class="selected-user email-invite">
              将邀请邮箱: <strong>{{ inviteMemberForm.query }}</strong>
            </div>
            <div class="form-group">
              <label>成员角色</label>
              <select v-model="inviteMemberForm.role">
                <option value="member">成员</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div class="form-group">
              <label>邀请留言（可选）</label>
              <input 
                v-model="inviteMemberForm.message" 
                type="text" 
                placeholder="给对方的留言" 
                maxlength="100"
              />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="showInviteMemberModal = false">取消</button>
            <button class="btn-confirm" @click="handleInviteMember" :disabled="inviteLoading || !canSendInvite()">
              {{ inviteLoading ? '发送中...' : '发送邀请' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 成员管理弹窗 -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showMemberManageModal" class="modal-overlay" @click.self="showMemberManageModal = false">
        <div class="modal-content team-modal member-manage-modal">
          <div class="modal-header">
            <h3>管理成员 - {{ memberManageTeam?.name }}</h3>
            <button class="modal-close" @click="showMemberManageModal = false">×</button>
          </div>
          <div class="modal-body">
            <div v-if="memberManageLoading" class="loading-hint">加载中...</div>
            <div v-else-if="teamStore.teamMembers.value.length === 0" class="empty-hint">暂无成员</div>
            <div v-else class="member-list">
              <div 
                v-for="member in teamStore.teamMembers.value" 
                :key="member.user_id"
                class="member-item"
              >
                <div class="member-info">
                  <div class="member-avatar">{{ member.username?.charAt(0).toUpperCase() || '?' }}</div>
                  <div class="member-details">
                    <div class="member-name">{{ member.username || member.email }}</div>
                    <div class="member-email">{{ member.email }}</div>
                  </div>
                </div>
                <div class="member-controls">
                  <!-- 角色选择器（不能修改自己，owner不能被修改） -->
                  <select 
                    v-if="member.role !== 'owner'"
                    class="role-select"
                    :value="member.role"
                    @change="handleChangeMemberRole(memberManageTeam, member.user_id, $event.target.value)"
                    :disabled="member.user_id === props.userInfo?.id"
                  >
                    <option value="admin">管理员</option>
                    <option value="member">成员</option>
                  </select>
                  <span v-else class="role-label owner">所有者</span>
                  <!-- 移除按钮（不能移除owner和自己） -->
                  <button 
                    v-if="member.role !== 'owner' && member.user_id !== props.userInfo?.id"
                    class="btn-remove-member"
                    @click="handleRemoveMember(memberManageTeam, member.user_id)"
                    title="移除成员"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="showMemberManageModal = false">关闭</button>
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
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.22);
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
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  /* 优化滚动体验 */
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.recharge-panel::-webkit-scrollbar {
  width: 6px;
}

.recharge-panel::-webkit-scrollbar-track {
  background: transparent;
}

.recharge-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.recharge-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 充值面板底部按钮 - 确保不被压缩 */
.recharge-panel .btn-primary.full-width {
  flex-shrink: 0;
  margin-top: auto;
  min-height: 44px;
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

/* 小屏幕高度适配 - 确保内容可滚动 */
@media (max-height: 700px) {
  .profile-panel {
    max-height: calc(100vh - 60px);
  }
  
  .recharge-panel {
    padding: 16px;
    gap: 10px;
  }
  
  .recharge-panel .form-section {
    gap: 6px;
  }
  
  .recharge-panel .form-label {
    font-size: 12px;
  }
  
  .recharge-panel .form-input,
  .recharge-panel .form-select {
    padding: 10px 12px;
    font-size: 13px;
  }
  
  .recharge-panel .amount-btn {
    padding: 12px;
    font-size: 14px;
  }
  
  .recharge-panel .price-info {
    padding: 12px;
  }
  
  .recharge-panel .btn-primary.full-width {
    padding: 12px 16px;
    font-size: 14px;
  }
  
  .purchase-modal {
    max-height: calc(100vh - 30px);
  }
  
  .purchase-modal-body {
    padding: 16px;
  }
  
  .purchase-modal-footer {
    padding: 16px;
  }
}

/* 超小屏幕高度适配 */
@media (max-height: 550px) {
  .profile-panel {
    max-height: calc(100vh - 40px);
  }
  
  .recharge-panel {
    padding: 12px;
    gap: 8px;
  }
  
  .recharge-panel .recharge-header h4 {
    font-size: 16px;
  }
  
  .recharge-panel .recharge-amounts {
    gap: 8px;
  }
  
  .recharge-panel .amount-btn {
    padding: 10px;
    font-size: 13px;
  }
  
  .recharge-panel .card-btn-v2 {
    min-height: 40px;
    padding: 8px;
  }
  
  .recharge-panel .card-amount-v2 {
    font-size: 14px;
  }
  
  .purchase-modal {
    max-height: calc(100vh - 20px);
  }
  
  .purchase-modal-header {
    padding: 16px 20px;
  }
  
  .purchase-modal-header h3 {
    font-size: 18px;
  }
}

/* 宽屏但矮屏幕适配（如超宽显示器） */
@media (min-width: 1200px) and (max-height: 800px) {
  .purchase-modal {
    max-width: 800px;
    max-height: calc(100vh - 60px);
  }
  
  .purchase-content-grid {
    gap: 16px;
  }
  
  .package-detail-features {
    gap: 8px;
  }
}

/* 套餐购买弹窗 - 矮屏幕适配 */
@media (max-height: 650px) {
  .purchase-modal {
    max-height: calc(100vh - 20px);
    border-radius: 16px;
  }
  
  .purchase-modal-header {
    padding: 14px 20px;
  }
  
  .purchase-modal-header h3 {
    font-size: 16px;
  }
  
  .purchase-modal-body {
    padding: 12px 16px;
  }
  
  .purchase-content-grid {
    gap: 16px;
  }
  
  .package-detail-card {
    padding: 14px;
  }
  
  .package-detail-name {
    font-size: 16px;
  }
  
  .price-amount {
    font-size: 24px;
  }
  
  .feature-item {
    font-size: 13px;
    gap: 6px;
  }
  
  .purchase-section {
    margin-bottom: 12px;
  }
  
  .section-label {
    font-size: 12px;
    margin-bottom: 6px;
  }
  
  .price-breakdown {
    padding: 10px;
  }
  
  .price-line {
    font-size: 13px;
    padding: 4px 0;
  }
  
  .purchase-modal-footer {
    padding: 12px 16px;
  }
  
  .btn-modal-cancel,
  .btn-modal-confirm {
    padding: 10px 20px;
    font-size: 14px;
  }
  
  /* 等待支付视图紧凑化 */
  .payment-waiting-view,
  .recharge-waiting-view {
    padding: 20px 16px;
  }
  
  .waiting-icon-bg {
    width: 50px;
    height: 50px;
  }
  
  .waiting-title {
    font-size: 18px;
    margin-top: 12px;
  }
  
  .waiting-desc {
    font-size: 13px;
  }
  
  .waiting-order-info {
    padding: 12px;
    margin: 12px 0;
  }
  
  .waiting-tips {
    margin: 12px 0;
    gap: 8px;
  }
  
  .tip-number {
    width: 20px;
    height: 20px;
    font-size: 11px;
  }
  
  .tip-text {
    font-size: 12px;
  }
  
  .waiting-actions {
    gap: 8px;
  }
  
  .btn-waiting-primary {
    padding: 10px 20px;
    font-size: 14px;
  }
}

/* 超矮屏幕 - 强制紧凑布局 */
@media (max-height: 500px) {
  .purchase-modal {
    max-height: 100vh;
    border-radius: 0;
  }
  
  .purchase-modal-overlay {
    padding: 0;
  }
  
  .purchase-content-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  .purchase-modal-header {
    padding: 10px 16px;
  }
  
  .purchase-modal-body {
    padding: 10px 12px;
  }
  
  .purchase-modal-footer {
    padding: 10px 12px;
  }
}

/* 客服二维码弹窗 */
.support-qr-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.support-qr-modal {
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  min-width: 300px;
  max-width: 360px;
  overflow: hidden;
}

.support-qr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  font-weight: 500;
}

.support-qr-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  border-radius: 6px;
  font-size: 20px;
  transition: all 0.2s;
}

.support-qr-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.support-qr-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.support-qr-image {
  width: 200px;
  height: 200px;
  object-fit: contain;
  border-radius: 8px;
  background: white;
  padding: 8px;
}

.support-qr-tip {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.support-qr-link-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  color: rgba(59, 130, 246, 1);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.support-qr-link-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
}

.support-qr-link-btn .link-icon {
  width: 16px;
  height: 16px;
}

/* 弹窗淡入淡出动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* ==================== 空间切换器样式 ==================== */
.space-switcher-section {
  padding: 12px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}

.current-space {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.current-space:hover {
  background: rgba(255, 255, 255, 0.1);
}

.current-space .space-icon {
  font-size: 16px;
}

.current-space .space-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.current-space .dropdown-arrow {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  transition: transform 0.2s ease;
}

.space-dropdown {
  position: absolute;
  left: 24px;
  right: 24px;
  top: 100%;
  margin-top: 4px;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  z-index: 100;
  overflow: hidden;
}

.space-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.space-option:hover {
  background: rgba(255, 255, 255, 0.08);
}

.space-option.active {
  background: rgba(251, 191, 36, 0.15);
}

.space-option .space-icon {
  font-size: 14px;
}

.space-option .team-name {
  flex: 1;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
}

.space-option .team-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.space-option .check-mark {
  color: #FBBF24;
  font-weight: bold;
}

.space-option.create-team {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.space-option.create-team:hover {
  color: rgba(255, 255, 255, 0.95);
}

.space-option.invitations {
  color: #60A5FA;
}

.space-option .invite-badge {
  background: #EF4444;
  color: white;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.space-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

/* ==================== 导航菜单徽章 ==================== */
.nav-item {
  position: relative;
}

.nav-badge {
  position: absolute;
  top: 4px;
  right: 8px;
  background: #EF4444;
  color: white;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

/* ==================== 团队管理页面样式 ==================== */
.teams-section {
  padding: 0 !important;
}

.invitations-section {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(251, 191, 36, 0.05);
}

.invitation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.invitation-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.invitation-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.invitation-info .team-avatar {
  font-size: 24px;
}

.invitation-details {
  flex: 1;
  min-width: 0;
}

.invitation-details .team-name {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 2px;
}

.invitation-details .inviter-info {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.invitation-details .invite-message {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
  margin-top: 4px;
}

.invitation-actions {
  display: flex;
  gap: 8px;
}

.btn-accept {
  padding: 6px 12px;
  background: #FBBF24;
  color: #000;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-accept:hover {
  background: #F59E0B;
}

.btn-reject {
  padding: 6px 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-reject:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.my-teams-section {
  padding: 16px 20px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.btn-create-team {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-create-team:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.95);
}

.empty-teams {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.5);
}

.empty-teams .hint {
  font-size: 12px;
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.35);
}

.team-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.team-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.2s ease;
}

.team-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.team-card.active {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

.team-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-avatar-large {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  flex-shrink: 0;
}

.team-details {
  flex: 1;
  min-width: 0;
}

.team-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.team-name-row .team-name {
  font-weight: 600;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-details .team-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

/* 角色标签 - 简约风格 */
.role-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.role-tag.role-owner {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.75);
}

.role-tag.role-admin {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
}

.role-tag.role-member {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.5);
}

/* 团队操作按钮行 */
.team-card-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.team-details .team-description {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-team-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: rgba(255, 255, 255, 0.55);
}

.btn-team-action span {
  font-weight: 500;
}

.btn-team-action:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.btn-team-action.danger {
  color: rgba(255, 255, 255, 0.45);
}

.btn-team-action.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.2);
  color: rgba(239, 68, 68, 0.85);
}

/* ==================== 团队弹窗样式 ==================== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
}

.modal-content {
  background: rgba(26, 26, 26, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

/* 弹窗动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(-10px);
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.25s ease;
}

.team-modal {
  width: 400px;
  max-width: 90vw;
}

.team-modal .modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.team-modal .modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  margin: 0;
}

.team-modal .modal-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 20px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.team-modal .modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.team-modal .modal-body {
  padding: 20px 24px;
}

.team-modal .form-group {
  margin-bottom: 16px;
}

.team-modal .form-group label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
}

.team-modal .form-group label .required {
  color: #EF4444;
}

.team-modal .form-group input,
.team-modal .form-group textarea,
.team-modal .form-group select {
  width: 100%;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  transition: all 0.15s ease;
}

.team-modal .form-group input:focus,
.team-modal .form-group textarea:focus,
.team-modal .form-group select:focus {
  outline: none;
  border-color: rgba(251, 191, 36, 0.5);
  background: rgba(255, 255, 255, 0.08);
}

.team-modal .form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.team-modal .error-message {
  color: #EF4444;
  font-size: 13px;
  margin-top: 8px;
}

.team-modal .modal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.team-modal .btn-cancel {
  padding: 10px 20px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.team-modal .btn-cancel:hover {
  background: rgba(255, 255, 255, 0.1);
}

.team-modal .btn-confirm {
  padding: 10px 20px;
  background: #FBBF24;
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.team-modal .btn-confirm:hover:not(:disabled) {
  background: #F59E0B;
}

.team-modal .btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================== 成员管理弹窗样式 ==================== */
.member-manage-modal {
  max-width: 480px;
}

.member-manage-modal .modal-body {
  max-height: 400px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

.member-manage-modal .modal-body::-webkit-scrollbar {
  width: 5px;
}

.member-manage-modal .modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.member-manage-modal .modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}

.member-manage-modal .modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.22);
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  transition: all 0.15s ease;
}

.member-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  flex-shrink: 0;
}

.member-details {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-email {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.member-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.role-select {
  padding: 6px 10px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.role-select:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.role-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.role-label {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 6px;
  font-weight: 500;
}

.role-label.owner {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.btn-remove-member {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-remove-member:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #EF4444;
}

.loading-hint {
  text-align: center;
  padding: 30px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* 搜索结果 */
.search-results {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  margin-top: 4px;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.search-result-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.user-avatar-small {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.user-info-small .username {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
}

.user-info-small .email {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.search-loading {
  padding: 10px 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.selected-user {
  padding: 10px 14px;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 16px;
}

.selected-user strong {
  color: #FBBF24;
}

.selected-user.email-invite {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.2);
}

.selected-user.email-invite strong {
  color: #3B82F6;
}

.search-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding: 8px 0;
}

:root.canvas-theme-light .search-hint {
  color: rgba(0, 0, 0, 0.5);
}

/* 亮色主题适配 */
:root.canvas-theme-light .space-switcher-section {
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .current-space {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .current-space:hover {
  background: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .current-space .space-name {
  color: rgba(0, 0, 0, 0.9);
}

:root.canvas-theme-light .space-dropdown {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .space-option:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .space-option .team-name {
  color: rgba(0, 0, 0, 0.9);
}

:root.canvas-theme-light .space-option .team-meta {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .btn-create-team {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.7);
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .btn-create-team:hover {
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.9);
  border-color: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .space-option.create-team {
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .space-option.create-team:hover {
  color: rgba(0, 0, 0, 0.9);
}

:root.canvas-theme-light .team-card {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .team-card:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .team-card.active {
  border-color: rgba(0, 0, 0, 0.15);
  background: rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .team-name-row .team-name {
  color: rgba(0, 0, 0, 0.85);
}

:root.canvas-theme-light .team-details .team-meta {
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .role-tag.role-owner {
  background: rgba(0, 0, 0, 0.07);
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .role-tag.role-admin {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.55);
}

:root.canvas-theme-light .role-tag.role-member {
  background: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .team-avatar-large {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.65);
}

:root.canvas-theme-light .team-card-actions {
  border-top-color: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .btn-team-action {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .btn-team-action:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.12);
  color: rgba(0, 0, 0, 0.75);
}

:root.canvas-theme-light .btn-team-action.danger:hover {
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.18);
  color: rgba(220, 38, 38, 0.85);
}

:root.canvas-theme-light .modal-content {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .team-modal .modal-header h3 {
  color: rgba(0, 0, 0, 0.9);
}

:root.canvas-theme-light .team-modal .modal-header {
  border-bottom-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .team-modal .modal-close {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .team-modal .modal-close:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.9);
}

:root.canvas-theme-light .team-modal .form-group label {
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .team-modal .form-group input,
:root.canvas-theme-light .team-modal .form-group textarea,
:root.canvas-theme-light .team-modal .form-group select {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.9);
}

:root.canvas-theme-light .team-modal .modal-footer {
  border-top-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .team-modal .btn-cancel {
  color: rgba(0, 0, 0, 0.7);
  border-color: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .team-modal .btn-cancel:hover {
  background: rgba(0, 0, 0, 0.06);
}

/* 成员管理弹窗浅色主题 */
:root.canvas-theme-light .member-item {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .member-item:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .member-avatar {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .member-name {
  color: rgba(0, 0, 0, 0.85);
}

:root.canvas-theme-light .member-email {
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .role-select {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.75);
}

:root.canvas-theme-light .role-select:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .role-label.owner {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.8);
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .btn-remove-member {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .btn-remove-member:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.25);
  color: #DC2626;
}

/* 成员管理弹窗滚动条浅色主题 */
:root.canvas-theme-light .member-manage-modal .modal-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .member-manage-modal .modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   UserProfilePanel 白昼模式样式适配
   ======================================== */

/* 面板背景 */
:root.canvas-theme-light .profile-panel {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 
    0 20px 60px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.03) inset !important;
}

/* 头部 */
:root.canvas-theme-light .profile-panel .panel-header {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .user-avatar {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
}

:root.canvas-theme-light .profile-panel .user-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .user-level {
  background: rgba(99, 102, 241, 0.1) !important;
  color: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .close-btn {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .profile-panel .close-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #1c1917 !important;
}

/* 积分信息 */
:root.canvas-theme-light .profile-panel .points-section {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.03) 100%) !important;
  border-color: rgba(99, 102, 241, 0.1) !important;
}

:root.canvas-theme-light .profile-panel .points-label {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .profile-panel .points-value {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .points-detail {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .profile-panel .points-icon {
  color: #f59e0b !important;
}

/* 余额信息 */
:root.canvas-theme-light .profile-panel .balance-section {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .balance-label {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .profile-panel .balance-value {
  color: #1c1917 !important;
}

/* 菜单项 */
:root.canvas-theme-light .profile-panel .menu-section {
  border-top-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .menu-item {
  color: rgba(0, 0, 0, 0.75) !important;
}

:root.canvas-theme-light .profile-panel .menu-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .menu-item.active {
  background: rgba(99, 102, 241, 0.08) !important;
  color: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .menu-item svg {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .profile-panel .menu-item:hover svg,
:root.canvas-theme-light .profile-panel .menu-item.active svg {
  color: currentColor !important;
}

:root.canvas-theme-light .profile-panel .menu-divider {
  background: rgba(0, 0, 0, 0.06) !important;
}

/* 内容区 */
:root.canvas-theme-light .profile-panel .panel-content {
  background: transparent !important;
}

:root.canvas-theme-light .profile-panel .panel-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.02) !important;
}

:root.canvas-theme-light .profile-panel .panel-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .profile-panel .panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2) !important;
}

/* 子面板标题 */
:root.canvas-theme-light .profile-panel .section-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .section-desc {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 余额划转区域 - 浅色模式 */
:root.canvas-theme-light .profile-panel .transfer-section {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .transfer-hint {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .profile-panel .transfer-form input {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .transfer-form input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .profile-panel .transfer-form input:focus {
  border-color: #6366f1 !important;
  background: rgba(99, 102, 241, 0.03) !important;
}

/* 卡片样式 */
:root.canvas-theme-light .profile-panel .card,
:root.canvas-theme-light .profile-panel .info-card,
:root.canvas-theme-light .profile-panel .stat-card {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .card:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .profile-panel .card-title,
:root.canvas-theme-light .profile-panel .stat-label {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .profile-panel .card-value,
:root.canvas-theme-light .profile-panel .stat-value {
  color: #1c1917 !important;
}

/* 输入框 */
:root.canvas-theme-light .profile-panel input,
:root.canvas-theme-light .profile-panel textarea,
:root.canvas-theme-light .profile-panel select {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel input:focus,
:root.canvas-theme-light .profile-panel textarea:focus,
:root.canvas-theme-light .profile-panel select:focus {
  border-color: rgba(99, 102, 241, 0.4) !important;
  background: rgba(0, 0, 0, 0.03) !important;
}

:root.canvas-theme-light .profile-panel input::placeholder,
:root.canvas-theme-light .profile-panel textarea::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

/* 按钮 */
:root.canvas-theme-light .profile-panel .primary-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}

:root.canvas-theme-light .profile-panel .primary-btn:hover {
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35) !important;
}

:root.canvas-theme-light .profile-panel .secondary-btn {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .profile-panel .secondary-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .danger-btn {
  background: rgba(239, 68, 68, 0.08) !important;
  color: #ef4444 !important;
}

:root.canvas-theme-light .profile-panel .danger-btn:hover {
  background: rgba(239, 68, 68, 0.15) !important;
}

/* 底部退出登录按钮 */
:root.canvas-theme-light .profile-panel .panel-footer {
  border-top-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .logout-btn {
  background: transparent !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .profile-panel .logout-btn:hover {
  background: rgba(239, 68, 68, 0.08) !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
  color: #ef4444 !important;
}

:root.canvas-theme-light .profile-panel .logout-icon {
  color: inherit !important;
}

/* 套餐卡片 */
:root.canvas-theme-light .profile-panel .package-card {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .package-card:hover {
  border-color: rgba(99, 102, 241, 0.3) !important;
  background: rgba(99, 102, 241, 0.03) !important;
}

:root.canvas-theme-light .profile-panel .package-card.selected {
  border-color: #6366f1 !important;
  background: rgba(99, 102, 241, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .package-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .package-price {
  color: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .package-price .price {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .package-price .unit {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .profile-panel .package-points {
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .profile-panel .package-desc {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .profile-panel .package-feature {
  color: rgba(0, 0, 0, 0.65) !important;
}

/* 邀请码 */
:root.canvas-theme-light .profile-panel .invite-code-box {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .invite-code {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .copy-btn {
  background: #6366f1 !important;
  color: #fff !important;
}

/* 积分记录列表 - 浅色模式 */
:root.canvas-theme-light .profile-panel .ledger-list {
  gap: 6px !important;
}

:root.canvas-theme-light .profile-panel .ledger-item {
  background: rgba(0, 0, 0, 0.02) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  border-radius: 10px !important;
}

:root.canvas-theme-light .profile-panel .ledger-item:hover {
  background: rgba(99, 102, 241, 0.04) !important;
  border-color: rgba(99, 102, 241, 0.15) !important;
}

:root.canvas-theme-light .profile-panel .ledger-icon {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .profile-panel .ledger-type {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .ledger-desc {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .ledger-time {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .profile-panel .ledger-amount.positive {
  color: #059669 !important;
}

:root.canvas-theme-light .profile-panel .ledger-amount.negative {
  color: #dc2626 !important;
}

/* 标签页 */
:root.canvas-theme-light .profile-panel .tab-btn {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .profile-panel .tab-btn:hover {
  color: rgba(0, 0, 0, 0.8) !important;
}

:root.canvas-theme-light .profile-panel .tab-btn.active {
  color: #6366f1 !important;
  border-bottom-color: #6366f1 !important;
}

/* 快捷金额按钮 */
:root.canvas-theme-light .profile-panel .quick-amount-btn {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .profile-panel .quick-amount-btn:hover {
  border-color: rgba(99, 102, 241, 0.3) !important;
  color: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .quick-amount-btn.selected {
  background: rgba(99, 102, 241, 0.08) !important;
  border-color: #6366f1 !important;
  color: #6366f1 !important;
}

/* 支付方式 */
:root.canvas-theme-light .profile-panel .payment-method {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .payment-method:hover {
  border-color: rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .profile-panel .payment-method.selected {
  border-color: #6366f1 !important;
  background: rgba(99, 102, 241, 0.04) !important;
}

:root.canvas-theme-light .profile-panel .payment-method-name {
  color: #1c1917 !important;
}

/* 设置项 */
:root.canvas-theme-light .profile-panel .setting-item {
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .profile-panel .setting-label {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .setting-desc {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 开关按钮 */
:root.canvas-theme-light .profile-panel .toggle-switch {
  background: rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .profile-panel .toggle-switch.active {
  background: #6366f1 !important;
}

/* 连线样式选择 */
:root.canvas-theme-light .profile-panel .edge-style-btn {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .profile-panel .edge-style-btn:hover {
  border-color: rgba(0, 0, 0, 0.15) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .edge-style-btn.active {
  background: rgba(99, 102, 241, 0.08) !important;
  border-color: #6366f1 !important;
  color: #6366f1 !important;
}

/* 对话框 */
:root.canvas-theme-light .profile-panel .dialog-overlay {
  background: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .profile-panel .dialog-content {
  background: #fff !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .profile-panel .dialog-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .dialog-message {
  color: rgba(0, 0, 0, 0.65) !important;
}

/* 自定义对话框 - 签到等弹窗白昼模式 */
:root.canvas-theme-light .profile-panel .custom-dialog-overlay {
  background: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .profile-panel .custom-dialog {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .profile-panel .custom-dialog .dialog-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .custom-dialog .dialog-message {
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .profile-panel .custom-dialog .dialog-footer {
  border-top-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .custom-dialog .dialog-btn.cancel {
  color: rgba(0, 0, 0, 0.55) !important;
  border-right-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .custom-dialog .dialog-btn.cancel:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  color: rgba(0, 0, 0, 0.75) !important;
}

:root.canvas-theme-light .profile-panel .custom-dialog .dialog-btn.confirm {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .custom-dialog .dialog-btn.confirm:hover {
  background: rgba(0, 0, 0, 0.06) !important;
}

/* ========================================
   充值面板 - 白昼模式
   ======================================== */
:root.canvas-theme-light .profile-panel .recharge-panel {
  background: rgba(255, 255, 255, 0.98) !important;
  scrollbar-color: rgba(0, 0, 0, 0.15) transparent !important;
}

:root.canvas-theme-light .profile-panel .recharge-panel::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .profile-panel .recharge-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25) !important;
}

:root.canvas-theme-light .profile-panel .recharge-header h4 {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .recharge-header .close-btn {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .profile-panel .recharge-header .close-btn:hover {
  color: rgba(0, 0, 0, 0.8) !important;
  background: rgba(0, 0, 0, 0.05) !important;
}

/* 充值卡片按钮 - 白昼模式 */
:root.canvas-theme-light .profile-panel .card-btn-v2 {
  background: linear-gradient(145deg, #ffffff, #f5f5f4) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .card-btn-v2:hover {
  background: linear-gradient(145deg, #fafafa, #f0f0ef) !important;
  border-color: rgba(0, 0, 0, 0.15) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .profile-panel .card-btn-v2.active {
  background: linear-gradient(145deg, #f5f5f4, #e7e5e4) !important;
  border-color: rgba(99, 102, 241, 0.5) !important;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15) !important;
}

:root.canvas-theme-light .profile-panel .card-amount-v2 {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .card-bonus-hover {
  background: rgba(245, 245, 244, 0.98) !important;
  color: #57534e !important;
}

:root.canvas-theme-light .profile-panel .bonus-star {
  color: #78716c !important;
  text-shadow: none !important;
}

/* 金额按钮 - 白昼模式 */
:root.canvas-theme-light .profile-panel .amount-btn {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .amount-btn:hover {
  border-color: rgba(0, 0, 0, 0.2) !important;
  background: rgba(0, 0, 0, 0.05) !important;
}

:root.canvas-theme-light .profile-panel .amount-btn.active {
  background: rgba(99, 102, 241, 0.08) !important;
  border-color: rgba(99, 102, 241, 0.5) !important;
  color: #1c1917 !important;
}

/* 表单元素 - 白昼模式 */
:root.canvas-theme-light .profile-panel .form-label {
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .profile-panel .form-input,
:root.canvas-theme-light .profile-panel .form-select {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .form-input:focus,
:root.canvas-theme-light .profile-panel .form-select:focus {
  border-color: rgba(99, 102, 241, 0.5) !important;
  background: rgba(0, 0, 0, 0.02) !important;
}

:root.canvas-theme-light .profile-panel .form-input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

/* 价格信息 - 白昼模式 */
:root.canvas-theme-light .profile-panel .price-info {
  background: rgba(0, 0, 0, 0.03) !important;
}

:root.canvas-theme-light .profile-panel .price-row {
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .profile-panel .price-row.discount {
  color: #10b981 !important;
}

:root.canvas-theme-light .profile-panel .price-row.total {
  border-top-color: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .total-price {
  color: #6366f1 !important;
}

/* 支付方式选择 - 白昼模式 */
:root.canvas-theme-light .profile-panel .payment-method-btn {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #57534e !important;
}

:root.canvas-theme-light .profile-panel .payment-method-btn:hover {
  border-color: rgba(0, 0, 0, 0.2) !important;
  background: rgba(0, 0, 0, 0.05) !important;
}

:root.canvas-theme-light .profile-panel .payment-method-btn.active {
  background: rgba(99, 102, 241, 0.08) !important;
  border-color: rgba(99, 102, 241, 0.5) !important;
  color: #1c1917 !important;
}

/* 等待支付视图 - 白昼模式 */
:root.canvas-theme-light .profile-panel .recharge-waiting-view {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .waiting-icon-bg {
  background: rgba(0, 0, 0, 0.05) !important;
}

:root.canvas-theme-light .profile-panel .waiting-icon {
  color: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .waiting-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .waiting-subtitle {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .profile-panel .waiting-amount {
  color: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .waiting-tip {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .profile-panel .waiting-btn-secondary {
  background: rgba(0, 0, 0, 0.05) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #57534e !important;
}

:root.canvas-theme-light .profile-panel .waiting-btn-secondary:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

/* 充值卡片 */
:root.canvas-theme-light .profile-panel .recharge-card {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .recharge-card:hover {
  border-color: rgba(99, 102, 241, 0.3) !important;
}

:root.canvas-theme-light .profile-panel .recharge-card.selected {
  border-color: #6366f1 !important;
  background: rgba(99, 102, 241, 0.04) !important;
}

:root.canvas-theme-light .profile-panel .recharge-amount {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .recharge-bonus {
  color: #10b981 !important;
}

/* 空状态 */
:root.canvas-theme-light .profile-panel .empty-state {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .profile-panel .empty-state svg {
  color: rgba(0, 0, 0, 0.25) !important;
}

/* 提示信息 */
:root.canvas-theme-light .profile-panel .tip,
:root.canvas-theme-light .profile-panel .hint {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .profile-panel .success-text {
  color: #10b981 !important;
}

:root.canvas-theme-light .profile-panel .error-text {
  color: #ef4444 !important;
}

:root.canvas-theme-light .profile-panel .warning-text {
  color: #f59e0b !important;
}

/* 标签 */
:root.canvas-theme-light .profile-panel .tag {
  background: rgba(0, 0, 0, 0.05) !important;
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .profile-panel .tag.primary {
  background: rgba(99, 102, 241, 0.1) !important;
  color: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .tag.success {
  background: rgba(16, 185, 129, 0.1) !important;
  color: #10b981 !important;
}

/* 内嵌支付弹窗 */
:root.canvas-theme-light .profile-panel .payment-embed-overlay {
  background: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .profile-panel .payment-embed-modal {
  background: #fff !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .profile-panel .payment-embed-header {
  border-bottom-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .payment-embed-title {
  color: #1c1917 !important;
}

/* 签到状态 */
:root.canvas-theme-light .profile-panel .checkin-btn {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
}

:root.canvas-theme-light .profile-panel .checkin-btn.checked {
  background: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .profile-panel .checkin-info {
  color: rgba(0, 0, 0, 0.55) !important;
}

/* 客服二维码弹窗 */
:root.canvas-theme-light .profile-panel .support-qr-modal {
  background: #fff !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .profile-panel .support-qr-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .support-qr-hint {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 分隔线 */
:root.canvas-theme-light .profile-panel .divider {
  background: rgba(0, 0, 0, 0.06) !important;
}

/* 工具提示 */
:root.canvas-theme-light .profile-panel .tooltip {
  background: rgba(28, 25, 23, 0.95) !important;
  color: #fff !important;
}

/* 优惠券输入 */
:root.canvas-theme-light .profile-panel .coupon-input {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .profile-panel .coupon-apply-btn {
  background: #6366f1 !important;
  color: #fff !important;
}

:root.canvas-theme-light .profile-panel .coupon-success {
  background: rgba(16, 185, 129, 0.08) !important;
  border-color: rgba(16, 185, 129, 0.2) !important;
  color: #10b981 !important;
}

:root.canvas-theme-light .profile-panel .coupon-error {
  color: #ef4444 !important;
}

/* 用户邮箱 */
:root.canvas-theme-light .profile-panel .user-email {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 快捷数据区域 */
:root.canvas-theme-light .profile-panel .quick-stats {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .stat-item {
  background: rgba(0, 0, 0, 0.03) !important;
}

:root.canvas-theme-light .profile-panel .stat-icon {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .profile-panel .stat-value {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .stat-label {
  color: rgba(0, 0, 0, 0.45) !important;
}

/* 导航菜单 */
:root.canvas-theme-light .profile-panel .panel-nav {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .nav-item {
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .profile-panel .nav-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  color: rgba(0, 0, 0, 0.85) !important;
}

:root.canvas-theme-light .profile-panel .nav-item.active {
  background: rgba(99, 102, 241, 0.08) !important;
  color: #6366f1 !important;
  border-color: rgba(99, 102, 241, 0.2) !important;
}

:root.canvas-theme-light .profile-panel .nav-icon {
  color: inherit !important;
}

/* 签到卡片 */
:root.canvas-theme-light .profile-panel .checkin-card {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .checkin-days {
  color: rgba(0, 0, 0, 0.75) !important;
}

:root.canvas-theme-light .profile-panel .checkin-btn.disabled {
  background: rgba(0, 0, 0, 0.04) !important;
  color: rgba(0, 0, 0, 0.35) !important;
}

/* 快捷操作按钮 */
:root.canvas-theme-light .profile-panel .quick-actions {
  /* 无需额外样式 */
}

:root.canvas-theme-light .profile-panel .action-btn {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .profile-panel .action-btn:hover {
  background: rgba(0, 0, 0, 0.05) !important;
  border-color: rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .profile-panel .action-btn.primary {
  background: rgba(99, 102, 241, 0.08) !important;
  border-color: rgba(99, 102, 241, 0.2) !important;
  color: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .action-btn.primary:hover {
  background: rgba(99, 102, 241, 0.12) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
}

:root.canvas-theme-light .profile-panel .action-icon {
  color: inherit !important;
}

/* 内容区分隔线 */
:root.canvas-theme-light .profile-panel .content-section-title {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 表单样式 */
:root.canvas-theme-light .profile-panel .form-group label {
  color: rgba(0, 0, 0, 0.65) !important;
}

/* 按钮通用样式 */
:root.canvas-theme-light .profile-panel .btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}

:root.canvas-theme-light .profile-panel .btn-primary:hover {
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35) !important;
}

/* 兑换表单 */
:root.canvas-theme-light .profile-panel .voucher-form input {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .voucher-form input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

/* 提示框 */
:root.canvas-theme-light .profile-panel .voucher-tips,
:root.canvas-theme-light .profile-panel .invite-tips {
  background: rgba(0, 0, 0, 0.02) !important;
}

:root.canvas-theme-light .profile-panel .voucher-tips h5,
:root.canvas-theme-light .profile-panel .invite-tips h5 {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .profile-panel .voucher-tips li,
:root.canvas-theme-light .profile-panel .invite-tips li {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 邀请卡片 */
:root.canvas-theme-light .profile-panel .invite-card {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .invite-card h4 {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .profile-panel .invite-code {
  background: rgba(0, 0, 0, 0.04) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .btn-copy {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .profile-panel .btn-copy:hover {
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .profile-panel .invite-stats .stat-num {
  color: #1c1917 !important;
}

:root.canvas-theme-light .profile-panel .invite-stats .stat-label {
  color: rgba(0, 0, 0, 0.45) !important;
}

/* 帮助列表 */
:root.canvas-theme-light .profile-panel .help-item {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .help-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .profile-panel .help-icon {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .profile-panel .help-text {
  color: rgba(0, 0, 0, 0.75) !important;
}

:root.canvas-theme-light .profile-panel .help-arrow {
  color: rgba(0, 0, 0, 0.35) !important;
}

/* 设置区域 */
:root.canvas-theme-light .profile-panel .settings-section {
  border-top-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .setting-item {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .profile-panel .setting-label {
  color: rgba(0, 0, 0, 0.85) !important;
}

:root.canvas-theme-light .profile-panel .setting-desc {
  color: rgba(0, 0, 0, 0.45) !important;
}

/* Toggle 开关 */
:root.canvas-theme-light .profile-panel .toggle-slider {
  background: rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .profile-panel .toggle-switch input:checked + .toggle-slider {
  background: #6366f1 !important;
}

:root.canvas-theme-light .profile-panel .toggle-switch input:checked + .toggle-slider:before {
  background-color: #fff !important;
}

/* 空状态提示 */
:root.canvas-theme-light .profile-panel .empty-hint {
  color: rgba(0, 0, 0, 0.4) !important;
}

/* 账单类型 */
:root.canvas-theme-light .profile-panel .ledger-type {
  color: rgba(0, 0, 0, 0.75) !important;
}

:root.canvas-theme-light .profile-panel .ledger-icon {
  color: rgba(0, 0, 0, 0.5) !important;
}

/* 套餐状态 */
:root.canvas-theme-light .profile-panel .package-status {
  background: rgba(99, 102, 241, 0.06) !important;
  border-color: rgba(99, 102, 241, 0.15) !important;
}

:root.canvas-theme-light .profile-panel .package-badge {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}

:root.canvas-theme-light .profile-panel .package-info {
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .profile-panel .expire-hint {
  color: rgba(0, 0, 0, 0.45) !important;
}

/* 套餐购买按钮 */
:root.canvas-theme-light .profile-panel .btn-purchase {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  color: #fff !important;
}

:root.canvas-theme-light .profile-panel .btn-purchase:hover {
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35) !important;
}

:root.canvas-theme-light .profile-panel .btn-purchase.disabled {
  background: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .profile-panel .btn-purchase.current {
  background: rgba(16, 185, 129, 0.1) !important;
  color: #10b981 !important;
}

/* 消息样式 */
:root.canvas-theme-light .profile-panel .msg-error {
  background: rgba(239, 68, 68, 0.08) !important;
  border-color: rgba(239, 68, 68, 0.2) !important;
  color: #ef4444 !important;
}

:root.canvas-theme-light .profile-panel .msg-success {
  background: rgba(16, 185, 129, 0.08) !important;
  border-color: rgba(16, 185, 129, 0.2) !important;
  color: #10b981 !important;
}

/* 套餐详情提示 - 浅色模式适配（Teleport 到 body，需要直接选择器） */
:root.canvas-theme-light .package-tooltip {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%) !important;
  border-color: rgba(0, 0, 0, 0.12) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
}

:root.canvas-theme-light .package-tooltip .tooltip-header {
  border-bottom-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .package-tooltip .tooltip-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .package-tooltip .tooltip-desc {
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .package-tooltip .detail-item {
  color: rgba(0, 0, 0, 0.75) !important;
}

:root.canvas-theme-light .package-tooltip .detail-text strong {
  color: #1c1917 !important;
}

:root.canvas-theme-light .package-tooltip .detail-item.price-highlight {
  border-top-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .package-tooltip .detail-item.price-highlight strong {
  color: #5b6fe6 !important;
}

:root.canvas-theme-light .package-tooltip .tooltip-arrow {
  background: rgba(255, 255, 255, 0.98) !important;
  border-left-color: rgba(0, 0, 0, 0.12) !important;
  border-bottom-color: rgba(0, 0, 0, 0.12) !important;
}
</style>

