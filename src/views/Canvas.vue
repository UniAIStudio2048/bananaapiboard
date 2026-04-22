<script setup>
/**
 * Canvas.vue - 创作者画布主页面
 */
import { ref, computed, watch, onMounted, onUnmounted, provide, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getMe, updateUserPreferences } from '@/api/client'
import { formatPoints } from '@/utils/format'
import { getTenantHeaders, getBrand, isCanvasLogoEnabled } from '@/config/tenant'
import { useCanvasStore, useUploadManager } from '@/stores/canvas'
import { useTeamStore } from '@/stores/team'
import { loadWorkflow as loadWorkflowFromServer } from '@/api/canvas/workflow'
import CanvasBoard from '@/components/canvas/CanvasBoard.vue'
import CanvasToolbar from '@/components/canvas/CanvasToolbar.vue'
import CanvasEmptyState from '@/components/canvas/CanvasEmptyState.vue'
import NodeSelector from '@/components/canvas/NodeSelector.vue'
import NodeContextMenu from '@/components/canvas/NodeContextMenu.vue'
import CanvasContextMenu from '@/components/canvas/CanvasContextMenu.vue'
import WorkflowTemplates from '@/components/canvas/WorkflowTemplates.vue'
import GroupToolbar from '@/components/canvas/GroupToolbar.vue'
import ImageToolbar from '@/components/canvas/ImageToolbar.vue'
import SaveWorkflowDialog from '@/components/canvas/SaveWorkflowDialog.vue'
import WorkflowPanel from '@/components/canvas/WorkflowPanel.vue'
import WorkflowTabs from '@/components/canvas/WorkflowTabs.vue'
import AssetPanel from '@/components/canvas/AssetPanel.vue'
import HistoryPanel from '@/components/canvas/HistoryPanel.vue'
import ImageEditMode from '@/components/canvas/ImageEditMode.vue'
import InplaceImageEditor from '@/components/canvas/InplaceImageEditor.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import OnboardingGuide from '@/components/canvas/OnboardingGuide.vue'
import AIAssistantPanel from '@/components/canvas/AIAssistantPanel.vue'
import CanvasNotification from '@/components/canvas/CanvasNotification.vue'
import CanvasSupport from '@/components/canvas/CanvasSupport.vue'
import CanvasToast from '@/components/canvas/CanvasToast.vue'
import PackageModal from '@/components/canvas/PackageModal.vue'
import TicketButton from '@/components/ticket/TicketButton.vue'
import CanvasSpaceSwitcher from '@/components/canvas/CanvasSpaceSwitcher.vue'
import TicketDrawer from '@/components/ticket/TicketDrawer.vue'
import TicketList from '@/components/ticket/TicketList.vue'
import TicketDetail from '@/components/ticket/TicketDetail.vue'
import CreateTicketForm from '@/components/ticket/CreateTicketForm.vue'
import { useI18n } from '@/i18n'
import { startAutoSave as startHistoryAutoSave, stopAutoSave as stopHistoryAutoSave, manualSave as saveToHistory, getWorkflowHistory } from '@/stores/canvas/workflowAutoSave'
import { initBackgroundTaskManager, getPendingTasks, subscribeTask, removeCompletedTask, cleanup as cleanupBackgroundTasks } from '@/stores/canvas/backgroundTaskManager'
import { showAlert, showConfirm } from '@/composables/useCanvasDialog'
import { needsMigration, analyzeWorkflow, migrateWorkflowData } from '@/utils/workflowMigration'
// 🔧 画布诊断工具 - 用于调试画布强制重新加载问题
import { initCanvasDiagnostic, printCanvasDiagnosticReport } from '@/utils/canvasDiagnostic'

// 导入画布样式
import '@/styles/canvas.css'

const { t } = useI18n()

const router = useRouter()
const route = useRoute()
const canvasStore = useCanvasStore()
const teamStore = useTeamStore()
const uploadManager = useUploadManager()

// 画布底部Logo状态
const brandConfig = computed(() => getBrand())
const showCanvasLogo = computed(() => {
  if (!isCanvasLogoEnabled()) return false
  if (canvasStore.selectedNodeId) return false
  if (canvasStore.selectedNodeIds && canvasStore.selectedNodeIds.length > 0) return false
  if (canvasStore.editingNodeId) return false
  return true
})

// 用户信息
const me = ref(null)
const loading = ref(true)
const canvasReady = ref(false) // 画布是否准备好渲染（等待转场动画完成）

// 模板面板
const showTemplates = ref(false)

// 帮助面板
const showHelp = ref(false)

// 保存工作流对话框
const showSaveDialog = ref(false)

// 工作流面板
const showWorkflowPanel = ref(false)
const workflowPanelRef = ref(null)

// 资产面板
const showAssetPanel = ref(false)

// 历史记录面板
const showHistoryPanel = ref(false)

// CanvasBoard组件引用
const canvasBoardRef = ref(null)

// 新手引导
const showOnboarding = ref(false)

// AI 灵感助手
const showAIAssistant = ref(false)
const aiPanelWidth = ref(0) // AI 面板宽度
const aiAssistantRef = ref(null) // AI 面板组件引用
const canvasPickMode = ref(false) // 画布选择模式（从AI助手触发）

// 套餐购买弹窗
const showPackageModal = ref(false)

// 工单系统
const showTicketDrawer = ref(false)
const ticketView = ref('list') // list | detail | create
const selectedTicketId = ref(null)
const ticketButtonRef = ref(null)
const ticketListRef = ref(null)

// 画布主题切换 (dark / light)
const canvasTheme = ref('dark')

// 交互模式 (comfyui / infinite-canvas)
const interactionMode = ref('comfyui')

// 自动保存定时器
const autoSaveInterval = ref(null)
const lastAutoSave = ref(null)
const autoSaveEnabled = ref(false) // 只有保存过的工作流才启用自动保存

// 🔧 Toast 通知状态（用于显示保存状态等）
const toastMessage = ref('')
const toastType = ref('info') // success | error | info | warning
const showToast = ref(false)
const toastDuration = ref(3000)

// 模式切换
const isTransitioning = ref(false)
const showModePopup = ref(false)
let modeHoverTimer = null

// 性能优化: 追踪画布拖拽状态，防止自动保存在拖拽中途触发导致卡顿
// 监听 CanvasBoard 发出的 canvas-drag-start / canvas-drag-end 自定义事件
let _isCanvasDragging = false
function _onCanvasDragStart() { _isCanvasDragging = true }
function _onCanvasDragEnd() { _isCanvasDragging = false }

// 积分转让
const showPointsTransferModal = ref(false)
const showTransferConfirmModal = ref(false)
const pointsTransferForm = ref({
  recipientQuery: '',
  selectedRecipient: null,
  amount: null,
  memo: '',
  recipientError: '',
  amountError: ''
})
const recipientSuggestions = ref([])
const transferring = ref(false)
let searchTimeout = null

// 鼠标进入模式切换按钮
function handleModeSwitchEnter() {
  // 1.5秒后显示弹窗
  modeHoverTimer = setTimeout(() => {
    showModePopup.value = true
  }, 1500)
}

// 鼠标离开模式切换按钮
function handleModeSwitchLeave() {
  if (modeHoverTimer) {
    clearTimeout(modeHoverTimer)
    modeHoverTimer = null
  }
}

// 点击模式切换按钮 - 直接显示弹窗
function handleModeSwitchClick() {
  if (modeHoverTimer) {
    clearTimeout(modeHoverTimer)
    modeHoverTimer = null
  }
  showModePopup.value = true
}

// 关闭模式弹窗
function closeModePopup() {
  showModePopup.value = false
}

// 确认切换到新手模式
async function confirmSwitchToSimpleMode() {
  if (isTransitioning.value) return
  isTransitioning.value = true
  showModePopup.value = false
  
  // 保存模式选择
  localStorage.setItem('userMode', 'simple')
  
  // 通知 App.vue 刷新用户信息，确保导航栏显示正确的登录状态
  window.dispatchEvent(new CustomEvent('user-info-updated'))
  
  // 等待转场动画
  await nextTick()
  setTimeout(() => {
    router.push('/generate')
  }, 600)
}

// 计算用户积分总和（套餐积分 + 永久积分）
const totalPoints = computed(() => {
  if (!me.value) return '0'
  const packagePoints = parseFloat(me.value.package_points) || 0
  const permanentPoints = parseFloat(me.value.points) || 0
  return formatPoints(packagePoints + permanentPoints)
})

// 🔧 监控节点数量，防止内存溢出 + 大画布性能优化（静默处理，不打扰用户）
let nodeCountWarningShown = false
let nodeCountCriticalShown = false
let performanceModeShown = false

watch(() => canvasStore.nodes.length, (count) => {
  const { NODE_WARNING_THRESHOLD, NODE_CRITICAL_THRESHOLD, performanceMode } = canvasStore
  
  // 🔧 大画布性能模式（30+节点时进入优化模式）- 静默处理
  if (count > 30 && !performanceModeShown) {
    performanceModeShown = true
    const modeText = performanceMode === 'minimal' ? '最小化渲染' : 
                     performanceMode === 'reduced' ? '简化渲染' : '优化渲染'
    console.log(`[Canvas] 🚀 已启用 ${modeText} 模式 (${count} 个节点)`)
    // 静默处理，不显示 toast 提示
  }
  
  // 警告阈值（50个节点）- 静默裁剪历史记录，保留最近5个操作
  if (count >= NODE_WARNING_THRESHOLD && !nodeCountWarningShown) {
    nodeCountWarningShown = true
    console.log(`[Canvas] ⚠️ 节点数量较多 (${count})，已静默启用性能优化模式`)
    // 静默裁剪历史记录，保留最近5个操作的撤销/重做能力
    canvasStore.trimHistory(5)
  }
  
  // 危险阈值（100个节点）- 静默自动保存
  if (count >= NODE_CRITICAL_THRESHOLD && !nodeCountCriticalShown) {
    nodeCountCriticalShown = true
    console.log(`[Canvas] 🚨 节点数量较多 (${count})，静默触发自动保存`)
    // 静默自动保存，不打扰用户
    autoSaveWorkflow()
  }
  
  // 重置警告标志
  if (count < 30) {
    performanceModeShown = false
  }
  if (count < NODE_WARNING_THRESHOLD) {
    nodeCountWarningShown = false
    nodeCountCriticalShown = false
  }
}, { immediate: true })

// 选中的编组节点
const selectedGroupNode = computed(() => {
  // 检查 selectedNodeId
  const selectedId = canvasStore.selectedNodeId
  if (!selectedId) return null

  // 查找节点
  const node = canvasStore.nodes.find(n => n.id === selectedId)
  if (node && node.type === 'group') {
    return node
  }
  return null
})

// 选中的图像节点（用于显示图像工具栏）
// 性能优化: 移除高频 console.log，避免每次节点选择都产生大量日志输出导致卡顿
const selectedImageNode = computed(() => {
  const selectedId = canvasStore.selectedNodeId
  if (!selectedId) return null

  const node = canvasStore.nodes.find(n => n.id === selectedId)
  if (!node) return null

  // 检查是否是图像类型节点（包括所有可能的图像类型）
  const imageTypes = ['image', 'image-input', 'image-gen', 'text-to-image', 'image-to-image']
  if (imageTypes.includes(node.type)) {
    // 检查是否有图片内容（输出图片或源图片）
    const hasOutput = node.data?.output?.urls?.length > 0 || node.data?.output?.url
    const hasSource = node.data?.sourceImages?.length > 0

    if (hasOutput || hasSource) {
      return node
    }
  }
  return null
})

// 显示编组工具栏
const showGroupToolbar = computed(() => {
  return selectedGroupNode.value !== null
})

// 显示图像工具栏（当有图像节点被选中且没有显示编组工具栏时）
const showImageToolbar = computed(() => {
  // 如果正在显示编组工具栏，不显示图像工具栏
  if (showGroupToolbar.value) return false
  return selectedImageNode.value !== null
})

// 🔧 缓存 DOM 元素引用，避免频繁查询
let cachedCanvasBoardRect = null
let lastRectUpdateTime = 0
const RECT_CACHE_DURATION = 100 // 缓存100ms

function getCanvasBoardRect() {
  const now = Date.now()
  if (cachedCanvasBoardRect && now - lastRectUpdateTime < RECT_CACHE_DURATION) {
    return cachedCanvasBoardRect
  }
  const container = document.querySelector('.canvas-board')
  if (container) {
    cachedCanvasBoardRect = container.getBoundingClientRect()
    lastRectUpdateTime = now
  }
  return cachedCanvasBoardRect
}

// 编组工具栏位置
const groupToolbarPosition = computed(() => {
  if (!selectedGroupNode.value) return { x: 0, y: 0 }
  
  const node = selectedGroupNode.value
  const viewport = canvasStore.viewport
  
  // 计算工具栏位置（在编组上方居中，保持一定距离）
  const rect = getCanvasBoardRect()
  if (!rect) return { x: window.innerWidth / 2, y: 100 }
  
  const nodeWidth = node.data?.width || 400
  
  const x = rect.left + (node.position.x * viewport.zoom) + viewport.x + (nodeWidth * viewport.zoom) / 2
  // 增加与编组的距离（-50 改为固定在屏幕顶部附近）
  const y = Math.max(60, rect.top + (node.position.y * viewport.zoom) + viewport.y - 50)
  
  return { x: Math.max(250, x), y }
})

// 图像工具栏位置（在图像节点上方居中）
const imageToolbarPosition = computed(() => {
  if (!selectedImageNode.value) return { x: 0, y: 0 }
  
  const node = selectedImageNode.value
  const viewport = canvasStore.viewport
  
  // 🔧 使用缓存的 rect，避免频繁 DOM 查询
  const rect = getCanvasBoardRect()
  if (!rect) return { x: window.innerWidth / 2, y: 100 }
  
  const nodeWidth = node.data?.width || 380
  
  // 计算节点在屏幕上的位置
  const x = rect.left + (node.position.x * viewport.zoom) + viewport.x + (nodeWidth * viewport.zoom) / 2
  const y = rect.top + (node.position.y * viewport.zoom) + viewport.y - 10 // 在节点上方10px
  
  return { 
    x: Math.max(300, Math.min(x, window.innerWidth - 300)), 
    y: Math.max(80, y) 
  }
})

// 提供用户信息给子组件
provide('userInfo', me)

// 提供交互模式给子组件
provide('interactionMode', interactionMode)

// 打开模板面板
function openTemplates() {
  showTemplates.value = true
}

// 关闭模板面板
function closeTemplates() {
  showTemplates.value = false
}

// 提供打开模板函数给子组件
provide('openTemplates', openTemplates)

// 切换工作流面板（打开/关闭）
function openWorkflowPanel() {
  showWorkflowPanel.value = !showWorkflowPanel.value
}

// 关闭工作流面板
function closeWorkflowPanel() {
  showWorkflowPanel.value = false
}

// 工作流加载后的回调（在新标签中打开）
async function handleWorkflowLoaded(workflow) {
  try {
    console.log('[Canvas] 工作流已加载:', workflow?.name, 'nodes:', workflow?.nodes?.length)
    
    if (!workflow || !workflow.nodes) {
      console.error('[Canvas] 工作流数据无效:', workflow)
      displayToast('工作流数据无效', 'error')
      return
    }
    
    // 检测是否需要迁移（旧的 blob URL 或 base64 数据）
    if (needsMigration(workflow)) {
      console.log('[Canvas] 检测到需要迁移的旧数据格式')
      const analysis = analyzeWorkflow(workflow)
      
      if (analysis.base64Data.length > 0) {
        try {
          displayToast('正在迁移旧数据到云存储...', 'info', 30000)
          const result = await migrateWorkflowData(workflow, (current, total, status) => {
            console.log(`[Canvas] 迁移进度: ${current}/${total} - ${status}`)
          })
          workflow.nodes = result.nodes
          closeToast()
          if (result.migratedCount > 0) {
            displayToast(`已将 ${result.migratedCount} 个文件迁移到云存储`, 'success')
          }
        } catch (error) {
          console.error('[Canvas] 数据迁移失败:', error)
          closeToast()
          displayToast('数据迁移失败: ' + error.message, 'error')
        }
      } else if (analysis.blobUrls.length > 0) {
        displayToast(`${analysis.blobUrls.length} 个本地临时文件已失效，需要重新上传`, 'warning')
      }
    }
    
    // 在新标签中打开
    const tab = canvasStore.openWorkflowInNewTab(workflow)
    if (!tab) {
      displayToast('标签页已达上限，请关闭一些标签后重试', 'warning')
      return
    }
    
    // 如果是已保存的工作流，启用自动保存
    if (workflow.id && !autoSaveEnabled.value) {
      autoSaveEnabled.value = true
      startAutoSave()
    }
    
    console.log('[Canvas] 工作流加载完成, tab:', tab?.id)
  } catch (error) {
    console.error('[Canvas] 工作流加载异常:', error)
    displayToast('工作流加载失败: ' + error.message, 'error')
  }
}

// 新建工作流的回调
function handleWorkflowNew() {
  console.log('[Canvas] 新建工作流')
  canvasStore.createTab()
}

// 标签切换
function handleTabSwitch(tab) {
  canvasStore.switchToTab(tab.id)
}

// 标签关闭
async function handleTabClose(tabId) {
  const isLastTab = canvasStore.workflowTabs.length === 1

  canvasStore.closeTab(tabId)

  if (isLastTab) {
    await router.push('/')
  }
}

// 新建标签
function handleTabNew() {
  canvasStore.createTab()
}

// 标签保存
function handleTabSave(tabId) {
  // 切换到该标签并打开保存对话框
  canvasStore.switchToTab(tabId)
  showSaveDialog.value = true
}

// 提供打开工作流面板函数给子组件
provide('openWorkflowPanel', openWorkflowPanel)

// 切换资产面板（打开/关闭）
function openAssetPanel() {
  showAssetPanel.value = !showAssetPanel.value
}

// 关闭资产面板
function closeAssetPanel() {
  showAssetPanel.value = false
}

// 资产插入到画布
function handleAssetInsert(asset) {
  console.log('[Canvas] 插入资产:', asset)
  
  // 计算当前画布视口中心偏左的位置
  const viewport = canvasStore.viewport
  const zoom = viewport.zoom || 1
  
  // 屏幕中心（考虑左侧工具栏约90px）
  const screenCenterX = (window.innerWidth - 90) / 2 + 90
  const screenCenterY = window.innerHeight / 2
  
  // 将屏幕坐标转换为画布坐标，并偏左200px
  const position = {
    x: (screenCenterX - viewport.x) / zoom - 200,
    y: (screenCenterY - viewport.y) / zoom - 100
  }
  
  let nodeType = 'text-input'
  let nodeData = {}
  
  switch (asset.type) {
    case 'text':
      nodeType = 'text-input'
      nodeData = {
        title: asset.name || '文本资产',
        text: asset.content || '',  // TextNode 使用 text 字段
        fromAsset: true,
        assetId: asset.id
      }
      break
    case 'image':
      nodeType = 'image-input'
      nodeData = {
        title: asset.name || t('canvas.nodes.imageAsset'),
        label: asset.name || t('canvas.nodes.image'),
        // ImageNode 使用 sourceImages 数组存储上传的图片
        sourceImages: [asset.url],
        nodeRole: 'source',
        fromAsset: true,
        assetId: asset.id
      }
      break
    case 'video':
      nodeType = 'video-input'
      nodeData = {
        title: asset.name || t('canvas.nodes.videoAsset'),
        label: asset.name || t('canvas.nodes.video'),
        // VideoNode 使用 output.url 显示视频
        // 设置 status 为 success 触发视频预览显示
        status: 'success',
        output: {
          type: 'video',
          url: asset.url
        },
        fromAsset: true,
        assetId: asset.id
      }
      break
    case 'audio':
      nodeType = 'audio-input'
      nodeData = {
        title: asset.name || t('canvas.nodes.audioAsset'),
        label: asset.name || t('canvas.nodes.audio'),
        // AudioNode 支持 audioUrl 和 output.url
        audioUrl: asset.url,
        status: 'success',
        output: {
          type: 'audio',
          url: asset.url
        },
        fromAsset: true,
        assetId: asset.id
      }
      break
    case 'sora-character':
      nodeType = 'character-card'
      nodeData = {
        title: asset.name || 'Sora角色',
        name: asset.name || '未命名角色',
        username: asset.metadata?.username || '',
        avatar: asset.url || asset.thumbnail_url || '',
        fromAsset: true,
        assetId: asset.id
      }
      break
    case 'seedance-character':
      nodeType = 'seedance-character'
      nodeData = {
        title: asset.assetName || 'Seedance角色',
        assetId: asset.assetId,
        assetUri: asset.assetUri || `asset://${asset.assetId}`,
        assetUrl: asset.assetUrl,
        groupId: asset.groupId,
        assetName: asset.assetName,
        status: asset.status || 'Active',
        assetType: asset.assetType,
        width: 220,
        output: {
          type: 'image',
          url: asset.assetUrl
        }
      }
      break
  }
  
  canvasStore.addNode({
    type: nodeType,
    position,
    data: nodeData
  })
}

// 提供打开资产面板函数给子组件
provide('openAssetPanel', openAssetPanel)

// 切换历史记录面板（打开/关闭）
function openHistoryPanel() {
  showHistoryPanel.value = !showHistoryPanel.value
}

// 关闭历史记录面板
function closeHistoryPanel() {
  showHistoryPanel.value = false
}

// 历史记录应用到画布（同时加载工作流节点）
function handleHistoryApply(historyItem) {
  console.log('[Canvas] 应用历史记录:', historyItem)
  
  // 计算当前画布视口中心偏左的位置
  const viewport = canvasStore.viewport
  const zoom = viewport.zoom || 1
  
  // 屏幕中心（考虑左侧工具栏约90px）
  const screenCenterX = (window.innerWidth - 90) / 2 + 90
  const screenCenterY = window.innerHeight / 2
  
  // 将屏幕坐标转换为画布坐标，并偏左200px
  const position = {
    x: (screenCenterX - viewport.x) / zoom - 200,
    y: (screenCenterY - viewport.y) / zoom - 100
  }
  
  let nodeType = 'image-input'
  let nodeData = {}
  
  switch (historyItem.type) {
    case 'image':
      nodeType = 'image-input'
      nodeData = {
        title: historyItem.name || t('canvas.historyPanel.imageResult'),
        label: historyItem.name || t('canvas.nodes.image'),
        sourceImages: [historyItem.url],
        nodeRole: 'source',
        fromHistory: true,
        historyId: historyItem.id,
        prompt: historyItem.prompt,
        model: historyItem.model
      }
      break
    case 'video':
      nodeType = 'video-input'
      nodeData = {
        title: historyItem.name || t('canvas.historyPanel.videoResult'),
        label: historyItem.name || t('canvas.nodes.video'),
        status: 'success',
        output: {
          type: 'video',
          url: historyItem.url
        },
        fromHistory: true,
        historyId: historyItem.id,
        prompt: historyItem.prompt,
        model: historyItem.model,
        // 传递 task_id 用于角色创建
        taskId: historyItem.task_id,
        soraTaskId: historyItem.task_id
      }
      break
    case 'audio':
      nodeType = 'audio-input'
      nodeData = {
        title: historyItem.name || t('canvas.historyPanel.audioResult'),
        label: historyItem.name || t('canvas.nodes.audio'),
        audioUrl: historyItem.url,
        status: 'success',
        output: {
          type: 'audio',
          url: historyItem.url
        },
        fromHistory: true,
        historyId: historyItem.id,
        prompt: historyItem.prompt,
        model: historyItem.model
      }
      break
  }
  
  // 添加节点
  const newNode = canvasStore.addNode({
    type: nodeType,
    position,
    data: nodeData
  })
  
  // 如果有工作流快照，尝试恢复相关节点
  if (historyItem.workflow_snapshot) {
    try {
      const snapshot = typeof historyItem.workflow_snapshot === 'string' 
        ? JSON.parse(historyItem.workflow_snapshot) 
        : historyItem.workflow_snapshot
      
      if (snapshot.nodes && Array.isArray(snapshot.nodes)) {
        console.log('[Canvas] 恢复工作流快照节点:', snapshot.nodes.length)
        // 在新节点右侧依次添加快照中的节点
        let offsetX = 450
        snapshot.nodes.forEach((snapshotNode, index) => {
          if (snapshotNode.type && snapshotNode.data) {
            canvasStore.addNode({
              type: snapshotNode.type,
              position: {
                x: position.x + offsetX,
                y: position.y + (index * 50)
              },
              data: {
                ...snapshotNode.data,
                fromSnapshot: true
              }
            })
            offsetX += 400
          }
        })
      }
    } catch (error) {
      console.error('[Canvas] 解析工作流快照失败:', error)
    }
  }
}

// 提供打开历史记录面板函数给子组件
provide('openHistoryPanel', openHistoryPanel)

// 打开保存对话框
function openSaveDialog() {
  showSaveDialog.value = true
}

// 快速保存工作流（Ctrl+S 调用）
// 已有工作流直接更新，新工作流弹出对话框
async function quickSaveWorkflow() {
  const currentTab = canvasStore.getCurrentTab()
  
  // 检查是否有内容
  const workflowData = canvasStore.exportWorkflow()
  if (!workflowData.nodes || workflowData.nodes.length === 0) {
    displayToast('画布为空，无需保存', 'warning', 2000)
    return
  }
  
  // 如果是已保存过的工作流，直接更新
  if (currentTab?.workflowId) {
    try {
      displayToast('正在保存...', 'info', 10000)
      
      const { saveWorkflow } = await import('@/api/canvas/workflow')
      const spaceParams = teamStore.getSpaceParams('current')
      
      await saveWorkflow({
        id: currentTab.workflowId,
        name: currentTab.name,
        uploadToCloud: false,
        spaceType: spaceParams.spaceType,
        teamId: spaceParams.teamId,
        ...workflowData
      })
      
      canvasStore.markCurrentTabSaved()
      lastAutoSave.value = new Date()
      displayToast(`「${currentTab.name}」已保存`, 'success', 2000)
      console.log('[Canvas] 快速保存成功:', currentTab.name)
      
      // 刷新工作流面板
      if (workflowPanelRef.value && typeof workflowPanelRef.value.forceRefresh === 'function') {
        workflowPanelRef.value.forceRefresh()
      }
    } catch (error) {
      console.error('[Canvas] 快速保存失败:', error)
      displayToast(`保存失败：${error.message || '未知错误'}`, 'error', 3000)
    }
  } else {
    // 新建工作流，打开保存对话框
    showSaveDialog.value = true
  }
}

// 提供快速保存函数给子组件（Ctrl+S 使用）
provide('quickSaveWorkflow', quickSaveWorkflow)

// 提供打开保存对话框函数给子组件
provide('openSaveDialog', openSaveDialog)

// 关闭保存对话框
function closeSaveDialog() {
  showSaveDialog.value = false
}

// 🔧 显示 Toast 通知
function displayToast(message, type = 'info', duration = 3000) {
  toastMessage.value = message
  toastType.value = type
  toastDuration.value = duration
  showToast.value = true
}

// 🔧 关闭 Toast
function closeToast() {
  showToast.value = false
}

// 🔧 保存中回调（立即显示保存中提示）
function handleWorkflowSaving(data) {
  console.log('[Canvas] 工作流保存中:', data.name)
  displayToast(`正在保存「${data.name}」...`, 'info', 10000) // 10秒超时
}

// 🔧 保存失败回调
function handleWorkflowSaveError(data) {
  console.error('[Canvas] 工作流保存失败:', data.message)
  displayToast(`保存失败：${data.message}`, 'error', 5000)
}

// 保存成功回调
function handleWorkflowSaved(workflow) {
  console.log('[Canvas] 工作流保存成功:', workflow)

  // 🔧 显示保存成功提示
  displayToast(`工作流「${workflow.name}」保存成功`, 'success', 2000)

  // 更新当前标签名称和工作流ID
  canvasStore.updateCurrentTabName(workflow.name)
  canvasStore.markCurrentTabSaved(workflow.id, workflow.workflow_uid, {
    space_type: workflow.space_type,
    team_id: workflow.team_id
  })

  // 启用自动保存
  if (!autoSaveEnabled.value) {
    autoSaveEnabled.value = true
    startAutoSave()
  }

  lastAutoSave.value = new Date()

  // 🔧 修复：立即刷新工作流面板，确保用户能立即看到最新保存的工作流
  if (workflowPanelRef.value && typeof workflowPanelRef.value.forceRefresh === 'function') {
    workflowPanelRef.value.forceRefresh()
    console.log('[Canvas] 已触发工作流面板刷新')
  }
}

// 自动保存函数
async function autoSaveWorkflow() {
  // 性能优化: 拖拽中途跳过自动保存，避免在高频事件期间触发昂贵的序列化和网络请求
  if (_isCanvasDragging) {
    console.log('[Canvas] 自动保存跳过：节点拖拽中')
    return
  }

  const currentTab = canvasStore.getCurrentTab()

  // 检查是否有内容需要保存
  if (!currentTab) {
    return
  }
  
  // 检查是否有节点正在上传文件，如果有则延迟保存，避免丢失数据
  const uploadingNodes = canvasStore.nodes.filter(n => n.data?.isUploading)
  if (uploadingNodes.length > 0) {
    console.log(`[Canvas] 自动保存跳过：${uploadingNodes.length} 个节点正在上传文件，等待上传完成`)
    return
  }
  
  // 检查是否有上传失败的节点，触发后台重试
  const failedNodes = canvasStore.nodes.filter(n => n.data?.uploadFailed)
  if (failedNodes.length > 0 && uploadManager.failedCount > 0) {
    console.log(`[Canvas] 发现 ${failedNodes.length} 个上传失败的节点，触发后台重试`)
    uploadManager.retryAllFailed()
  }
  
  // 🔧 使用 exportWorkflowForSave 清理 base64/blob 数据，避免存储膨胀
  const workflowData = canvasStore.exportWorkflowForSave()
  
  // 如果画布为空，不需要保存
  if (!workflowData.nodes || workflowData.nodes.length === 0) {
    return
  }
  
  // 如果是已保存的工作流且没有变更，跳过
  if (currentTab.workflowId && !currentTab.hasChanges) {
    return
  }
  
  try {
    const { saveWorkflow } = await import('@/api/canvas/workflow')
    
    // 🔧 预检：计算数据大小，如果过大则跳过自动保存（提升限制支持大画布）
    const nodesJson = JSON.stringify(workflowData.nodes || [])
    const edgesJson = JSON.stringify(workflowData.edges || [])
    const dataSize = new Blob([nodesJson, edgesJson]).size
    const MAX_AUTO_SAVE_SIZE = 100 * 1024 * 1024 // 100MB（支持大画布自动保存）
    
    if (dataSize > MAX_AUTO_SAVE_SIZE) {
      console.warn(`[Canvas] 自动保存跳过：数据过大 (${(dataSize / 1024 / 1024).toFixed(1)}MB)，请手动保存`)
      // 大数据时给用户一个提示
      displayToast(`工作流较大(${(dataSize / 1024 / 1024).toFixed(0)}MB)，请手动保存`, 'warning', 3000)
      return
    }
    
    // 获取当前空间参数
    const spaceParams = teamStore.getSpaceParams('current')
    
    // 🔧 新建工作流也支持自动保存（作为草稿）
    if (currentTab.workflowId) {
      // 已保存的工作流：更新保存
      await saveWorkflow({
        id: currentTab.workflowId,
        name: currentTab.name,
        uploadToCloud: false,
        spaceType: spaceParams.spaceType,
        teamId: spaceParams.teamId,
        ...workflowData
      })
      canvasStore.markCurrentTabSaved()
      lastAutoSave.value = new Date()
      console.log('[Canvas] 自动保存成功（更新）:', currentTab.name)
    } else {
      // 🔧 新建工作流：创建草稿保存
      // 只有节点数量 >= 2 时才自动创建草稿（避免误触发）
      if (workflowData.nodes.length >= 2) {
        const result = await saveWorkflow({
          name: currentTab.name || `草稿_${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
          uploadToCloud: false,
          isDraft: true, // 标记为草稿
          spaceType: spaceParams.spaceType,
          teamId: spaceParams.teamId,
          ...workflowData
        })
        
        // 更新标签信息
        if (result?.workflow?.id) {
          canvasStore.markCurrentTabSaved(result.workflow.id, result.workflow.workflow_uid, {
            space_type: result.workflow.space_type,
            team_id: result.workflow.team_id
          })
          canvasStore.updateCurrentTabName(result.workflow.name)
          lastAutoSave.value = new Date()
          console.log('[Canvas] 自动保存成功（新建草稿）:', result.workflow.name)
          
          // 显示保存成功提示
          displayToast('工作流已自动保存', 'success', 2000)
        }
      }
    }
  } catch (error) {
    // 自动保存失败时，只记录日志不打断用户
    if (error.message?.includes('过大') || error.message?.includes('too large')) {
      console.warn('[Canvas] 自动保存失败：数据过大，请手动保存')
    } else {
      console.error('[Canvas] 自动保存失败:', error.message || error)
    }
  }
}

// 启动自动保存定时器（每5分钟）
function startAutoSave() {
  if (autoSaveInterval.value) {
    clearInterval(autoSaveInterval.value)
  }
  
  // 每5分钟自动保存
  autoSaveInterval.value = setInterval(() => {
    autoSaveWorkflow()
  }, 5 * 60 * 1000)
  
  console.log('[Canvas] 自动保存已启用，间隔: 5分钟')
}

// 停止自动保存
function stopAutoSave() {
  if (autoSaveInterval.value) {
    clearInterval(autoSaveInterval.value)
    autoSaveInterval.value = null
  }
}

// 获取当前工作流数据（用于历史自动保存）
function getCurrentWorkflowData() {
  const currentTab = canvasStore.getCurrentTab()
  if (!currentTab) return null
  
  // 同步当前画布状态到 tab
  const workflowData = canvasStore.exportWorkflow()
  
  return {
    name: currentTab.name || '未命名工作流',
    tabId: currentTab.id,
    workflowId: currentTab.workflowId,
    nodes: workflowData.nodes,
    edges: workflowData.edges,
    viewport: workflowData.viewport
  }
}

// 🆕 自动恢复最近的工作流（刷新页面时使用）
// 如果有 5 分钟内保存的工作流历史，自动恢复到画布
function tryAutoRestoreRecentWorkflow() {
  try {
    const history = getWorkflowHistory()
    if (!history || history.length === 0) {
      console.log('[Canvas] 没有工作流历史记录')
      return false
    }
    
    // 获取最近的历史记录
    const recentWorkflow = history[0]
    const now = Date.now()
    const savedAt = recentWorkflow.savedAt || 0
    const ageMinutes = (now - savedAt) / (1000 * 60)
    
    // 只恢复 5 分钟内保存的工作流（避免恢复过旧的数据）
    if (ageMinutes > 5) {
      console.log(`[Canvas] 最近的工作流已过期 (${ageMinutes.toFixed(1)} 分钟前)，不自动恢复`)
      return false
    }
    
    // 检查是否有有效的节点数据
    if (!recentWorkflow.nodes || recentWorkflow.nodes.length === 0) {
      console.log('[Canvas] 最近的工作流没有节点数据')
      return false
    }
    
    console.log(`[Canvas] 自动恢复工作流: "${recentWorkflow.name}" | 节点数: ${recentWorkflow.nodeCount} | ${ageMinutes.toFixed(1)} 分钟前保存`)
    
    // 使用 canvasStore 恢复工作流
    canvasStore.openWorkflowInNewTab({
      id: recentWorkflow.workflowId || null,
      name: recentWorkflow.name || '恢复的工作流',
      nodes: recentWorkflow.nodes,
      edges: recentWorkflow.edges || [],
      viewport: recentWorkflow.viewport || { x: 0, y: 0, zoom: 1 }
    })
    
    return true
  } catch (error) {
    console.error('[Canvas] 自动恢复工作流失败:', error)
    return false
  }
}

// 启动历史工作流自动保存（localStorage，1分钟间隔）
function initHistoryAutoSave() {
  startHistoryAutoSave(getCurrentWorkflowData)
  console.log('[Canvas] 历史工作流自动保存已启动')
}

// 恢复后台任务 - 为未完成的任务订阅更新
function restoreBackgroundTasks() {
  const pendingTasks = getPendingTasks()
  console.log(`[Canvas] 恢复 ${pendingTasks.length} 个后台任务`)
  
  for (const task of pendingTasks) {
    // 订阅任务更新
    subscribeTask(task.taskId, {
      onProgress: (updatedTask) => {
        // 更新节点状态
        updateNodeFromTask(updatedTask)
      },
      onComplete: (completedTask) => {
        console.log('[Canvas] 后台任务完成:', completedTask.taskId)
        updateNodeFromTask(completedTask)
        // 延迟清理完成的任务
        setTimeout(() => removeCompletedTask(completedTask.taskId), 5000)
      },
      onError: (failedTask) => {
        console.log('[Canvas] 后台任务失败:', failedTask.taskId)
        updateNodeFromTask(failedTask)
        setTimeout(() => removeCompletedTask(failedTask.taskId), 5000)
      }
    })
  }
}

// 根据任务更新节点状态
function updateNodeFromTask(task) {
  const node = canvasStore.nodes.find(n => n.id === task.nodeId)
  if (!node) {
    console.log(`[Canvas] 找不到任务关联的节点: ${task.nodeId}`)
    return
  }
  
  if (task.status === 'completed' && task.result) {
    // 任务完成，更新节点数据
    const result = task.result
    
    if (task.type === 'image') {
      const imageUrl = result.url || result.urls?.[0]
      if (imageUrl) {
        canvasStore.updateNodeData(task.nodeId, {
          status: 'success',
          output: {
            type: 'image',
            urls: [imageUrl]
          }
        })
      }
    } else if (task.type === 'video-hd') {
      // 视频高清任务完成
      const videoUrl = result.outputUrl || result.url
      if (videoUrl) {
        canvasStore.updateNodeData(task.nodeId, {
          status: 'success',
          progress: null,
          output: {
            type: 'video',
            url: videoUrl,
            sourceUrl: task.metadata?.sourceUrl
          },
          pointsCost: result.pointsCost || 0
        })
        console.log(`[Canvas] 高清任务完成，节点 ${task.nodeId} 已更新`)
      }
    } else if (task.type === 'image-hd') {
      const imageUrl = result.outputUrl || result.url
      if (imageUrl) {
        canvasStore.updateNodeData(task.nodeId, {
          status: 'success',
          progress: null,
          output: {
            type: 'image',
            urls: [imageUrl]
          },
          pointsCost: result.pointsCost || 0,
          hdUpscaled: true
        })
        console.log(`[Canvas] 图片高清任务完成，节点 ${task.nodeId} 已更新`)
      }
    } else if (task.type === 'video') {
      // 视频任务完成
      if (result.url) {
        canvasStore.updateNodeData(task.nodeId, {
          status: 'completed',
          output: {
            ...node.data.output,
            url: result.url,
            thumbnail: result.thumbnail
          }
        })
      }
    }
    
    console.log(`[Canvas] 节点 ${task.nodeId} 已更新为完成状态`)
  } else if (task.status === 'failed') {
    // 任务失败
    const errorMsg = (task.type === 'video-hd' || task.type === 'image-hd') ? '高清处理失败' : '任务执行失败'
    canvasStore.updateNodeData(task.nodeId, {
      status: 'error',
      progress: null,
      error: task.error || errorMsg
    })
  } else if (task.status === 'processing') {
    // 任务进行中
    const progressText = (task.type === 'video-hd' || task.type === 'image-hd') ? '高清处理中...' : task.progress
    canvasStore.updateNodeData(task.nodeId, {
      status: 'processing',
      progress: progressText || task.progress
    })
  }
}

// 页面关闭前静默保存当前工作流（不弹出任何确认框）
function handleBeforeUnload(event) {
  const workflowData = getCurrentWorkflowData()
  if (!workflowData || !workflowData.nodes || workflowData.nodes.length === 0) {
    return
  }
  
  // 1. 始终保存到 localStorage 历史（作为备份）
  saveToHistory(workflowData)
  console.log('[Canvas] 页面关闭前保存工作流到历史')
  
  // 2. 尝试使用 sendBeacon 保存到服务器（不阻塞页面关闭）
  const currentTab = canvasStore.getCurrentTab()
  if (currentTab?.hasChanges) {
    // 有文件正在上传时跳过 beacon 保存，避免持久化不完整的数据
    const hasUploading = canvasStore.nodes.some(n => n.data?.isUploading)
    if (hasUploading) {
      console.log('[Canvas] 跳过 beacon 保存：有文件正在上传')
      return
    }
    try {
      const cleanedData = canvasStore.exportWorkflowForSave()
      
      const saveData = {
        id: currentTab.workflowId || null,
        name: currentTab.name || '未保存的工作流',
        nodes: cleanedData.nodes,
        edges: cleanedData.edges,
        viewport: cleanedData.viewport,
        uploadToCloud: false,
        isBeforeUnload: true
      }
      
      const headers = getTenantHeaders()
      const token = localStorage.getItem('token')
      const blob = new Blob([JSON.stringify({
        ...saveData,
        _headers: {
          ...headers,
          Authorization: token ? `Bearer ${token}` : undefined
        }
      })], { type: 'application/json' })
      
      if (blob.size < 64 * 1024) {
        const beaconUrl = '/api/canvas/workflows/beacon-save'
        navigator.sendBeacon(beaconUrl, blob)
        console.log('[Canvas] 已发送 sendBeacon 保存请求')
      } else {
        console.log('[Canvas] 数据过大，跳过 sendBeacon 保存')
      }
    } catch (e) {
      console.warn('[Canvas] sendBeacon 保存失败:', e)
    }
  }
  
  // 🔧 不再设置 event.returnValue，不弹出任何"重新加载此网站？"确认框
  // 数据已通过 localStorage + sendBeacon 静默保存
}

// 加载用户信息
async function loadUserInfo() {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      console.log('[Canvas] 无 token，跳转到落地页')
      router.push('/')
      return
    }
    
    me.value = await getMe()
    if (!me.value) {
      // getMe 返回 null 可能是网络错误、超时或 token 过期
      // 🔧 修复：不再跳转，保留在画布页面。用户已通过路由守卫认证，
      // 临时的 API 失败（网络抖动、后端重启）不应将用户踢出画布
      console.warn('[Canvas] 获取用户信息失败，保留在当前页面（不跳转）')
    } else {
      // 🔧 修复：检查是否切换了用户，如果是则清除上一个用户的工作流历史
      // 通过检查 sessionStorage 中保存的用户ID来判断
      const lastUserId = sessionStorage.getItem('canvas_last_user_id')
      if (lastUserId && lastUserId !== me.value.id.toString()) {
        console.log('[Canvas] 检测到用户切换，清除上一个用户的工作流历史')
        try {
          localStorage.removeItem('workflow_auto_saves')
          localStorage.removeItem('canvas_background_tasks')
          console.log('[Canvas] 已清除上一个用户的工作流历史和后台任务')
        } catch (e) {
          console.warn('[Canvas] 清除用户数据失败:', e)
        }
      }
      // 保存当前用户ID到 sessionStorage
      sessionStorage.setItem('canvas_last_user_id', me.value.id.toString())
      
      // 初始化团队空间
      teamStore.setCurrentUserId(me.value.id)
      await teamStore.restoreSpaceState()
    }
  } catch (e) {
    console.error('[Canvas] 加载用户信息失败:', e)
  } finally {
    loading.value = false
  }
}

// 处理用户信息更新事件
async function handleUserInfoUpdated() {
  try {
    // 强制刷新用户信息，获取最新的积分余额
    me.value = await getMe(true)
    console.log('[Canvas] 用户信息已更新:', { 
      points: me.value?.points, 
      package_points: me.value?.package_points,
      balance: me.value?.balance 
    })
  } catch (e) {
    console.error('[Canvas] 刷新用户信息失败:', e)
  }
}

// 🔧 处理浏览器后退/前进按钮，防止意外离开画布
function handlePopState(event) {
  const workflowData = getCurrentWorkflowData()
  const hasWork = workflowData?.nodes?.length > 0
  
  if (hasWork) {
    // 有未保存的工作，阻止导航并提示用户
    console.log('[Canvas] 检测到 popstate 事件，有未保存的工作')
    
    // 将用户推回当前页面
    history.pushState(null, '', window.location.href)
    
    // 可以在这里显示一个确认对话框
    // 暂时只记录日志，不打断用户操作
  }
}

// 🔧 页面卸载时记录，用于调试意外刷新
function handleUnload() {
  // 记录卸载时间戳到 sessionStorage（localStorage 可能来不及写入）
  try {
    sessionStorage.setItem('canvas_unload_timestamp', Date.now().toString())
    sessionStorage.setItem('canvas_unload_reason', 'unload_event')
    
    // 检查是否是正常退出（用户主动操作）还是异常退出
    const workflowData = getCurrentWorkflowData()
    if (workflowData?.nodes?.length > 0) {
      sessionStorage.setItem('canvas_had_unsaved_work', 'true')
    }
  } catch (e) {
    // 忽略
  }
}

// 检查并显示新手引导
function checkOnboarding() {
  const completed = localStorage.getItem('canvasOnboardingCompleted')
  const enabled = localStorage.getItem('canvasOnboardingEnabled')
  
  // 如果从未完成过（新用户），或者用户启用了每次提示
  if (!completed || enabled === 'true') {
    // 延迟显示，让画布先渲染完成
    setTimeout(() => {
      showOnboarding.value = true
    }, 500)
  }
}

// 关闭新手引导
function closeOnboarding() {
  showOnboarding.value = false
}

// 新手引导完成回调
function handleOnboardingComplete({ skipped }) {
  console.log('[Canvas] 新手引导已完成', skipped ? '(跳过)' : '(完整)')
}

// 处理画布双击 - 双击空白处弹出节点选择器
function handleCanvasDoubleClick(event) {
  const target = event.target
  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || 
      target.isContentEditable || target.closest('[contenteditable="true"]') ||
      target.closest('.vue-flow__node')) {
    return
  }

  // 获取画布容器来计算画布坐标
  const container = document.querySelector('.canvas-board')
  if (!container) return
  
  const rect = container.getBoundingClientRect()
  const viewport = canvasStore.viewport
  
  // 将屏幕坐标转换为画布坐标
  const flowX = (event.clientX - rect.left - viewport.x) / viewport.zoom
  const flowY = (event.clientY - rect.top - viewport.y) / viewport.zoom
  
  // 打开节点选择器，并传入 flowPosition
  canvasStore.openNodeSelector(
    { x: event.clientX, y: event.clientY }, 
    'canvas', 
    null, 
    { x: flowX, y: flowY }
  )
}

// 处理画布空白区域点击（来自 CanvasBoard 的 pane-click 事件）
function handlePaneClick(event) {
  // 点击空白处时关闭资产面板
  if (showAssetPanel.value) {
    showAssetPanel.value = false
  }
  
  // 点击空白处时关闭历史记录面板
  if (showHistoryPanel.value) {
    showHistoryPanel.value = false
  }
  
  // 点击空白处时关闭工作流面板
  if (showWorkflowPanel.value) {
    showWorkflowPanel.value = false
  }
}

// 处理节点右键「发送到灵感助手」
async function handleSendToAssistant({ url, type }) {
  // 打开 AI 面板
  showAIAssistant.value = true
  // 等待面板渲染完成后添加附件
  await nextTick()
  // 再等一帧确保 AIAssistantPanel 已完全挂载
  await nextTick()
  aiAssistantRef.value?.addAttachmentFromUrl(url, type)
}

// 进入画布选择模式（从AI助手附件菜单触发）
function startCanvasPick() {
  canvasPickMode.value = true
}

// 退出画布选择模式
function cancelCanvasPick() {
  canvasPickMode.value = false
}

// 画布选择模式下点击节点
function handlePickNode(nodeId) {
  const node = canvasStore.nodes.find(n => n.id === nodeId)
  if (!node) return

  const nodeType = node.type

  // 提取媒体 URL
  let url = null
  let type = null

  // 图片类节点
  const imageTypes = ['image', 'image-input', 'image-gen', 'imageGen', 'text-to-image', 'image-to-image', 'grid-preview']
  // 视频类节点
  const videoTypes = ['video', 'video-input', 'video-gen', 'videoGen', 'text-to-video', 'image-to-video']
  // 音频类节点
  const audioTypes = ['audio', 'audio-input']

  if (imageTypes.includes(nodeType)) {
    url = node.data.sourceImages?.[0] || node.data.output?.urls?.[0] || node.data.output?.url || node.data.images?.[0]
    type = 'image'
  } else if (videoTypes.includes(nodeType)) {
    url = node.data.output?.url || node.data.sourceVideo
    type = 'video'
  }else if (audioTypes.includes(nodeType)) {
    // 优先使用音频专用字段
    url = node.data.audioUrl || node.data.audioData || node.data.output?.url
    type = 'audio'
    
    // 如果 URL 存在，确保文件名有正确的扩展名
    if (url) {
      const urlLower = url.toLowerCase()
      // 检查 URL 是否看起来像音频文件
      const isAudioUrl = urlLower.includes('/audio/') || 
                        urlLower.includes('/canvas/audio/') ||
                        /\.(mp3|wav|ogg|flac|aac|m4a)(\?|$)/i.test(url)
      
      // 如果 URL 看起来不像音频文件，但节点类型是音频，记录警告
      if (!isAudioUrl && !urlLower.includes('/images/')) {
        console.warn('[CanvasPick] 音频节点的 URL 可能不正确:', url, node.data)
      }
    }
  }

  if (!url) {
    console.warn('[CanvasPick] 该节点没有可引用的媒体文件', nodeType, node.data)
    return
  }

  // 退出选择模式
  canvasPickMode.value = false

  // 添加到 AI 助手附件
  showAIAssistant.value = true
  nextTick(() => {
    nextTick(() => {
      // 从 URL 或节点数据中提取文件名
      let name = node.data.title || node.data.fileName
      if (!name) {
        // 尝试从 URL 中提取文件名
        const urlMatch = url.match(/([^/]+\.(mp3|wav|ogg|flac|aac|m4a|mp4|webm|mov|jpg|jpeg|png|gif|webp))(\?|$)/i)
        if (urlMatch) {
          name = urlMatch[1]
        } else {
          // 根据类型生成默认文件名
          const ext = type === 'audio' ? '.mp3' : type === 'video' ? '.mp4' : '.png'
          name = `${type}_${Date.now()}${ext}`
        }
      } else {
        // 确保文件名有正确的扩展名
        const ext = name.split('.').pop()?.toLowerCase()
        if (type === 'audio' && !['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
          name = name.replace(/\.[^.]+$/, '') + '.mp3'
        } else if (type === 'video' && !['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
          name = name.replace(/\.[^.]+$/, '') + '.mp4'
        } else if (type === 'image' && !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
          name = name.replace(/\.[^.]+$/, '') + '.png'
        }
      }
      
      console.log(`[CanvasPick] 添加附件到 AI 助手: type=${type}, url=${url}, name=${name}`)
      aiAssistantRef.value?.addAttachmentFromUrl(url, type, name)
    })
  })
}

// 处理画布右键菜单的上传事件（复用 handleClipboardFiles 确保数据结构一致 + 云上传）
function handleCanvasUpload(type) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = type === 'image' ? 'image/*' : 'video/*'
  input.multiple = type === 'image'

  input.onchange = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    if (!canvasBoardRef.value?.handleClipboardFiles) return

    const position = canvasStore.canvasContextMenuPosition
    const flowPos = {
      x: position.flowX || 100,
      y: position.flowY || 100
    }
    canvasBoardRef.value.handleClipboardFiles(files, flowPos)
  }

  input.click()
}

// 处理画布右键菜单的添加节点事件
function handleCanvasAddNode(position) {
  // 从位置对象中提取 flowPosition
  const flowPosition = (position.flowX !== undefined && position.flowY !== undefined)
    ? { x: position.flowX, y: position.flowY }
    : null

  canvasStore.openNodeSelector(position, 'canvas', null, flowPosition)
}

// 处理画布右键菜单的编组事件
function handleCanvasGroup() {
  console.log('[Canvas] 右键菜单触发编组')
  if (canvasBoardRef.value?.groupSelectedNodes) {
    canvasBoardRef.value.groupSelectedNodes()
  }
}

// 处理画布右键菜单的剪贴板粘贴事件
function handlePasteClipboard(files) {
  if (!canvasBoardRef.value?.handleClipboardFiles) return
  const position = canvasStore.canvasContextMenuPosition
  const flowPos = {
    x: position.flowX || 100,
    y: position.flowY || 100
  }
  canvasBoardRef.value.handleClipboardFiles(files, flowPos)
}

// ========== 缩放控制 ==========
// 缩放步进值
const ZOOM_STEP = 0.1
const MIN_ZOOM = 0.1  // 最小10%
const MAX_ZOOM = 5.0  // 最大500%

// 放大画布
function handleZoomIn() {
  const newZoom = Math.min(canvasStore.viewport.zoom + ZOOM_STEP, MAX_ZOOM)
  zoomToCenter(newZoom)
}

// 缩小画布
function handleZoomOut() {
  const newZoom = Math.max(canvasStore.viewport.zoom - ZOOM_STEP, MIN_ZOOM)
  zoomToCenter(newZoom)
}

// 滑块拖动处理
function handleZoomSlider(event) {
  const value = parseFloat(event.target.value)
  zoomToCenter(value)
}

// 以画布中心点为锚点进行缩放
function zoomToCenter(newZoom) {
  // 获取画布容器
  const canvasContainer = document.querySelector('.canvas-board')
  if (!canvasContainer) {
    // 如果没有找到容器，直接更新 zoom
    canvasStore.updateViewport({
      ...canvasStore.viewport,
      zoom: newZoom
    })
    return
  }
  
  const rect = canvasContainer.getBoundingClientRect()
  const centerX = rect.width / 2
  const centerY = rect.height / 2
  
  const oldZoom = canvasStore.viewport.zoom
  const oldViewport = canvasStore.viewport
  
  // 计算画布中心点在画布坐标系中的位置
  const canvasCenterX = (centerX - oldViewport.x) / oldZoom
  const canvasCenterY = (centerY - oldViewport.y) / oldZoom
  
  // 计算新的偏移，使画布中心点保持在屏幕中心
  const newX = centerX - canvasCenterX * newZoom
  const newY = centerY - canvasCenterY * newZoom
  
  canvasStore.updateViewport({
    x: newX,
    y: newY,
    zoom: newZoom
  })
}

// 重置缩放到100%
function handleZoomReset() {
  zoomToCenter(1.0)
}

// 键盘快捷键（页面级别）
// 注意：大部分快捷键已移至 CanvasBoard.vue 中实现
async function handleKeyDown(event) {
  // 检查是否在输入框或可编辑区域中
  const target = event.target
  const isInInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable ||
                    target.closest('[contenteditable="true"]')
  
  // Tab 键切换 AI 灵感助手面板（在任何情况下都生效）
  if (event.key === 'Tab') {
    event.preventDefault() // 完全阻止 Tab 的默认焦点切换行为
    event.stopPropagation()
    showAIAssistant.value = !showAIAssistant.value
    return
  }
  
  // Escape 关闭弹窗
  if (event.key === 'Escape') {
    // 如果在画布选择模式，先退出
    if (canvasPickMode.value) {
      canvasPickMode.value = false
      return
    }
    // 如果 AI 助手面板打开，先关闭它
    if (showAIAssistant.value) {
      showAIAssistant.value = false
      return
    }
    canvasStore.closeNodeSelector()
    canvasStore.closeAllContextMenus()
    // 不清除选择，让用户可以继续操作选中的节点
  }
  
  // Delete 或 Backspace 删除选中的节点
  if ((event.key === 'Delete' || event.key === 'Backspace') && !isInInput) {
    event.preventDefault() // 阻止默认行为
    
    // 检查是否有选中的节点
    if (canvasStore.selectedNodeId) {
      const selectedNode = canvasStore.nodes.find(n => n.id === canvasStore.selectedNodeId)
      
      // 如果是编组节点，需要特殊处理
      if (selectedNode?.type === 'group') {
        const confirmed = await showConfirm(
          '编组内的节点将被恢复为独立节点',
          '确定要删除这个编组吗？'
        )
        if (confirmed) {
          handleDisbandGroup()
        }
      } else {
        // 普通节点直接删除
        canvasStore.removeNode(canvasStore.selectedNodeId)
        canvasStore.selectedNodeId = null
      }
    }
  }
  
  // ========== 快捷创建节点 (i/v/t/a) ==========
  // 在选中节点的下游快速创建对应类型节点并连线
  if (!isInInput && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const key = event.key.toLowerCase()
    const nodeTypeMap = {
      'i': { type: 'image-input', title: '图片' },
      'v': { type: 'video', title: '视频' },
      't': { type: 'text-input', title: '文本' },
      'a': { type: 'audio-input', title: '音频' }
    }
    
    if (nodeTypeMap[key]) {
      event.preventDefault()
      createDownstreamNode(nodeTypeMap[key].type, nodeTypeMap[key].title)
      return
    }
    
    // D 键下载选中节点的文件
    if (key === 'd') {
      event.preventDefault()
      downloadSelectedNodeFile()
      return
    }
  }
}

// 在选中节点下游创建新节点并连线
// 多选时：创建一个下游节点，所有选中节点同时连接到该节点
function createDownstreamNode(nodeType, nodeTitle) {
  // 获取选中的节点（支持多选）
  // 优先从 VueFlow 节点的 selected 属性获取（最准确）
  const selectedFromNodes = canvasStore.nodes.filter(n => n.selected).map(n => n.id)
  // 备选：从 store 的多选列表获取
  const selectedFromStore = canvasStore.selectedNodeIds.length > 0 
    ? [...canvasStore.selectedNodeIds] 
    : (canvasStore.selectedNodeId ? [canvasStore.selectedNodeId] : [])
  
  // 使用节点 selected 属性为主，如果为空则使用 store 的选中状态
  const selectedIds = selectedFromNodes.length > 0 ? selectedFromNodes : selectedFromStore
  
  console.log('[Canvas] 创建下游节点 - 选中状态:', {
    fromNodes: selectedFromNodes,
    fromStore: selectedFromStore,
    final: selectedIds
  })
  
  if (selectedIds.length === 0) {
    console.log('[Canvas] 没有选中的节点，无法创建下游节点')
    return
  }
  
  const NODE_WIDTH = 280
  const GAP_X = 80
  
  // 获取所有选中节点的位置信息
  const selectedNodes = selectedIds
    .map(id => canvasStore.nodes.find(n => n.id === id))
    .filter(Boolean)
  
  if (selectedNodes.length === 0) return
  
  // 计算新节点位置：在所有选中节点的右侧，垂直居中
  const maxX = Math.max(...selectedNodes.map(n => n.position.x))
  const minY = Math.min(...selectedNodes.map(n => n.position.y))
  const maxY = Math.max(...selectedNodes.map(n => n.position.y))
  const centerY = (minY + maxY) / 2
  
  const newPosition = {
    x: maxX + NODE_WIDTH + GAP_X,
    y: centerY
  }
  
  // 生成唯一 ID
  const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  // 根据节点类型准备正确的初始数据
  let nodeData = { title: nodeTitle }
  
  switch (nodeType) {
    case 'image-input':
      nodeData = {
        title: nodeTitle,
        nodeRole: 'generator',  // 作为生成器，接收上游输入
        sourceImages: [],
        status: 'idle'
      }
      break
    case 'video':
      nodeData = {
        title: nodeTitle,
        label: nodeTitle,
        status: 'idle',
        generationMode: 'image'  // 默认图生视频模式（有上游输入）
      }
      break
    case 'text-input':
      nodeData = {
        title: nodeTitle,
        text: '',
        placeholder: '输入提示词...'
      }
      break
    case 'audio-input':
      nodeData = {
        title: nodeTitle,
        audioUrl: null,
        status: 'idle'
      }
      break
  }
  
  // 创建新节点
  const newNode = canvasStore.addNode({
    id: newNodeId,
    type: nodeType,
    position: newPosition,
    data: nodeData
  }, true) // skipHistory = true，最后统一保存
  
  // 为所有选中节点创建到新节点的连线
  if (newNode) {
    selectedIds.forEach(sourceNodeId => {
      canvasStore.addEdge({
        id: `e-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        sourceHandle: 'output',
        targetHandle: 'input'
      })
    })
  }
  
  // 保存历史记录
  canvasStore.saveHistory()
  console.log(`[Canvas] 快捷键创建 ${nodeType} 节点，${selectedIds.length} 个源节点连接到该节点`)
}

// 下载选中节点的文件
async function downloadSelectedNodeFile() {
  const selectedId = canvasStore.selectedNodeId
  if (!selectedId) {
    console.log('[Canvas] 没有选中的节点')
    return
  }
  
  const node = canvasStore.nodes.find(n => n.id === selectedId)
  if (!node) return
  
  const data = node.data || {}
  let fileUrl = null
  let fileName = ''
  let isVideo = false
  
  // 根据节点类型获取文件 URL
  // 图片节点
  if (data.sourceImages?.length > 0) {
    fileUrl = data.sourceImages[0]
    fileName = `image_${selectedId}.png`
  } else if (data.output?.urls?.length > 0) {
    fileUrl = data.output.urls[0]
    fileName = `image_${selectedId}.png`
  } else if (data.images?.length > 0) {
    fileUrl = data.images[0]
    fileName = `image_${selectedId}.png`
  }
  // 视频节点
  else if (data.output?.url && (data.output?.type === 'video' || node.type.includes('video'))) {
    fileUrl = data.output.url
    fileName = `video_${selectedId}.mp4`
    isVideo = true
  } else if (data.video) {
    fileUrl = data.video
    fileName = `video_${selectedId}.mp4`
    isVideo = true
  }
  // 音频节点
  else if (data.audioData || data.audioUrl) {
    fileUrl = data.audioData || data.audioUrl
    fileName = `audio_${selectedId}.mp3`
  }
  // 文本节点 - 导出为 txt
  else if (data.text) {
    const blob = new Blob([data.text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `text_${selectedId}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    console.log('[Canvas] 下载文本文件:', link.download)
    return
  }
  
  if (!fileUrl) {
    console.log('[Canvas] 选中的节点没有可下载的文件')
    return
  }
  
  try {
    // dataUrl 或 blob URL 直接下载
    if (fileUrl.startsWith('data:') || fileUrl.startsWith('blob:')) {
      const response = fileUrl.startsWith('data:') ? null : await fetch(fileUrl)
      let blob
      if (fileUrl.startsWith('data:')) {
        const parts = fileUrl.split(',')
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream'
        const base64 = parts[1]
        const byteCharacters = atob(base64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        blob = new Blob([new Uint8Array(byteNumbers)], { type: mime })
      } else {
        blob = await response.blob()
      }
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
      console.log('[Canvas] 下载文件:', fileName)
      return
    }
    
    // 远程 URL 统一使用 smartDownload（fetch+blob，自动验证完整性）
    const { smartDownload, buildVideoDownloadUrl, isQiniuCdnUrl } = await import('@/api/client')
    if (isVideo) {
      if (isQiniuCdnUrl(fileUrl)) {
        const downloadUrl = buildVideoDownloadUrl(fileUrl, fileName)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        await smartDownload(fileUrl, fileName)
      }
    } else {
      await smartDownload(fileUrl, fileName)
    }
    console.log('[Canvas] 下载文件:', fileName)
  } catch (error) {
    console.error('[Canvas] 下载失败:', error)
  }
}

// 处理解散编组
function handleDisbandGroup() {
  if (selectedGroupNode.value) {
    const groupId = selectedGroupNode.value.id
    const nodeIds = selectedGroupNode.value.data?.nodeIds || []
    
    // 恢复组内节点的可拖拽状态
    nodeIds.forEach(nodeId => {
      const node = canvasStore.nodes.find(n => n.id === nodeId)
      if (node) {
        node.draggable = true
      }
    })
    
    canvasStore.disbandGroup(groupId)
    canvasStore.removeNode(groupId)
  }
}

// 处理整组执行
async function handleExecuteGroup() {
  if (selectedGroupNode.value) {
    const groupId = selectedGroupNode.value.id
    const nodeIds = selectedGroupNode.value.data?.nodeIds || []
    if (!nodeIds.length) {
      await showAlert('编组内没有可执行的节点', '提示')
      return
    }
    console.log('[Canvas] 整组执行', groupId, nodeIds)
    canvasStore.executeGroup(groupId)
  }
}

// 处理保存工作流
async function handleSaveWorkflow() {
  const workflow = canvasStore.exportWorkflow()
  console.log('[Canvas] 保存工作流', workflow)
  // TODO: 实现保存工作流逻辑
  await showAlert('工作流已保存（功能开发中）', '提示')
}

// ========== 图像工具栏事件处理 ==========
// 重绘（预留接口）
async function handleImageRepaint(data) {
  console.log('[Canvas] 图像重绘', data)
  // TODO: 接入重绘API
  await showAlert('重绘功能开发中，请稍后...', '提示')
}

// 擦除（预留接口）
async function handleImageErase(data) {
  console.log('[Canvas] 图像擦除', data)
  // TODO: 接入擦除API
  await showAlert('擦除功能开发中，请稍后...', '提示')
}

// 增强（预留接口）
async function handleImageEnhance(data) {
  console.log('[Canvas] 图像增强', data)
  // TODO: 接入图像增强/超分辨率API
  await showAlert('增强功能开发中，请稍后...', '提示')
}

// 抠图（预留接口）
async function handleImageCutout(data) {
  console.log('[Canvas] 图像抠图', data)
  // TODO: 接入抠图/去背景API
  await showAlert('抠图功能开发中，请稍后...', '提示')
}

// 扩图（预留接口）
async function handleImageExpand(data) {
  console.log('[Canvas] 图像扩图', data)
  // TODO: 接入扩图/outpainting API
  await showAlert('扩图功能开发中，请稍后...', '提示')
}

// 标注（预留接口）
async function handleImageAnnotate(data) {
  console.log('[Canvas] 图像标注', data)
  // TODO: 打开标注工具
  await showAlert('标注功能开发中，请稍后...', '提示')
}

// 裁剪（预留接口，可后续实现裁剪组件）
async function handleImageCrop(data) {
  console.log('[Canvas] 图像裁剪', data)
  // TODO: 打开裁剪工具
  await showAlert('裁剪功能开发中，请稍后...', '提示')
}

// 下载
function handleImageDownload(data) {
  console.log('[Canvas] 图像下载', data)
  // 下载功能已在 ImageToolbar 组件中实现
}

// 放大预览
function handleImagePreview(data) {
  console.log('[Canvas] 图像放大预览', data)
  // 预览功能已在 ImageToolbar 组件中实现
}

// 主题切换功能
function toggleCanvasTheme() {
  const newTheme = canvasTheme.value === 'dark' ? 'light' : 'dark'
  applyCanvasTheme(newTheme)
}

// 应用画布主题
function applyCanvasTheme(theme) {
  canvasTheme.value = theme
  const root = document.documentElement

  if (theme === 'light') {
    root.classList.add('canvas-theme-light')
  } else {
    root.classList.remove('canvas-theme-light')
  }

  // 保存到用户偏好
  saveCanvasThemePreference(theme)
}

// 保存主题偏好到后端
async function saveCanvasThemePreference(theme) {
  try {
    const currentPreferences = me.value?.preferences || {}
    const updatedPreferences = {
      ...currentPreferences,
      canvas: {
        ...(currentPreferences.canvas || {}),
        theme: theme
      }
    }

    const result = await updateUserPreferences(updatedPreferences)
    if (result) {
      console.log('[Canvas] 主题偏好已保存:', theme)
      // 更新本地用户信息
      if (me.value) {
        me.value.preferences = updatedPreferences
      }
    }
  } catch (error) {
    console.error('[Canvas] 保存主题偏好失败:', error)
  }
}

// 打开套餐购买弹窗
function openPackageModal() {
  showPackageModal.value = true
}

// 关闭套餐购买弹窗
function closePackageModal() {
  showPackageModal.value = false
}

// 套餐购买成功回调
function handlePurchaseSuccess(data) {
  console.log('[Canvas] 套餐购买成功:', data)
  displayToast('套餐购买成功！', 'success', 3000)
  // 刷新用户信息
  handleUserInfoUpdated()
}

// 工单系统处理函数
function handleSelectTicket(ticket) {
  selectedTicketId.value = ticket.id
  ticketView.value = 'detail'
}

function handleBackToList() {
  ticketView.value = 'list'
  selectedTicketId.value = null
  // 刷新列表
  nextTick(() => {
    ticketListRef.value?.refresh()
  })
}

function handleCreateSuccess() {
  ticketView.value = 'list'
  // 刷新列表和未读数
  nextTick(() => {
    ticketListRef.value?.refresh()
    ticketButtonRef.value?.refresh()
  })
  displayToast('工单创建成功！', 'success', 3000)
}

function handleTicketUpdated() {
  // 刷新列表和未读数
  nextTick(() => {
    ticketListRef.value?.refresh()
    ticketButtonRef.value?.refresh()
  })
}

// 加载主题偏好
function loadCanvasThemePreference() {
  const userTheme = me.value?.preferences?.canvas?.theme
  if (userTheme) {
    applyCanvasTheme(userTheme)
    console.log('[Canvas] 已加载用户主题偏好:', userTheme)
  } else {
    applyCanvasTheme('dark')
  }
}

// 加载交互模式偏好
function loadInteractionMode() {
  const mode = me.value?.preferences?.canvas?.interactionMode
  if (mode === 'infinite-canvas' || mode === 'comfyui') {
    interactionMode.value = mode
  } else {
    interactionMode.value = 'comfyui'
  }
}

// 保存交互模式到后端
async function saveInteractionMode(mode) {
  try {
    const currentPreferences = me.value?.preferences || {}
    const updatedPreferences = {
      ...currentPreferences,
      canvas: {
        ...(currentPreferences.canvas || {}),
        interactionMode: mode
      }
    }
    const result = await updateUserPreferences(updatedPreferences)
    if (result && me.value) {
      me.value.preferences = updatedPreferences
    }
  } catch (error) {
    console.error('[Canvas] 保存交互模式失败:', error)
  }
}

// 切换交互模式
function toggleInteractionMode() {
  const newMode = interactionMode.value === 'comfyui' ? 'infinite-canvas' : 'comfyui'
  interactionMode.value = newMode
  saveInteractionMode(newMode)
}

// 新手引导中选择交互模式
function handleOnboardingModeSelect(mode) {
  interactionMode.value = mode
  saveInteractionMode(mode)
}

onMounted(async () => {
  // 🔧 初始化画布诊断工具 - 用于调试画布强制重新加载问题
  // 在浏览器控制台运行 printCanvasDiagnosticReport() 查看诊断报告
  initCanvasDiagnostic(canvasStore)

  // 性能优化: 监听拖拽状态，防止自动保存在拖拽中途触发
  window.addEventListener('canvas-drag-start', _onCanvasDragStart)
  window.addEventListener('canvas-drag-end', _onCanvasDragEnd)

  await loadUserInfo()

  // 加载画布主题偏好
  loadCanvasThemePreference()
  
  // 加载交互模式偏好
  loadInteractionMode()
  
  // 🆕 自动恢复：检查是否有最近的工作流历史（5分钟内），刷新后自动恢复
  const autoRestored = tryAutoRestoreRecentWorkflow()
  
  // 如果没有自动恢复，则初始化默认标签
  if (!autoRestored) {
    canvasStore.initDefaultTab()
  }
  
  // 🔧 检测是否是异常刷新后的恢复（用于调试页面意外刷新问题）
  // 仅在当前页面确实由浏览器刷新重新加载时才提示，避免将正常进入 /canvas 误判为异常刷新。
  const lastUnloadTimestamp = sessionStorage.getItem('canvas_unload_timestamp')
  const hadUnsavedWork = sessionStorage.getItem('canvas_had_unsaved_work')
  const navigationEntry = performance.getEntriesByType('navigation')?.[0]
  const isReloadNavigation = navigationEntry?.type === 'reload'
  if (lastUnloadTimestamp) {
    const elapsed = Date.now() - parseInt(lastUnloadTimestamp)
    // 只有真正的 reload 且距离上次卸载很近时，才认为可能是异常刷新
    if (isReloadNavigation && elapsed < 3000) {
      console.warn('[Canvas] ⚠️ 检测到可能的异常刷新，距上次卸载:', elapsed, 'ms')
      if (hadUnsavedWork === 'true') {
        console.warn('[Canvas] ⚠️ 上次退出时有未保存的工作')
      }
    }
    // 清理标记
    sessionStorage.removeItem('canvas_unload_timestamp')
    sessionStorage.removeItem('canvas_had_unsaved_work')
    sessionStorage.removeItem('canvas_unload_reason')
  }
  
  // 启动历史工作流自动保存服务（localStorage 缓存）
  initHistoryAutoSave()
  
  // 初始化后台任务管理器，恢复未完成的任务
  initBackgroundTaskManager()
  restoreBackgroundTasks()
  
  // 监听页面关闭事件，保存工作流到历史
  window.addEventListener('beforeunload', handleBeforeUnload)
  
  // 监听用户信息更新事件，实时更新积分余额
  window.addEventListener('user-info-updated', handleUserInfoUpdated)
  
  // 🔧 防止页面意外刷新：监听 popstate 事件（浏览器后退/前进）
  window.addEventListener('popstate', handlePopState)
  
  // 🔧 防止页面意外刷新：监听 unload 事件，记录异常退出
  window.addEventListener('unload', handleUnload)
  
  // 检查URL参数，如果有load参数则加载工作流
  const loadWorkflowId = route.query.load
  if (loadWorkflowId && me.value) {
    try {
      console.log('[Canvas] 从URL加载工作流:', loadWorkflowId)
      const result = await loadWorkflowFromServer(loadWorkflowId)
      
      if (result.workflow) {
        const workflow = result.workflow
        
        // 在新标签中打开工作流
        canvasStore.openWorkflowInNewTab(workflow)
      }
    } catch (error) {
      console.error('[Canvas] 加载工作流失败:', error)
      await showAlert('加载工作流失败：' + error.message, '错误')
    }
  }
  
  document.addEventListener('keydown', handleKeyDown)
  
  // 延迟设置画布就绪状态，确保转场动画完成后再渲染 VueFlow
  // 这解决了转场动画与 VueFlow 初始化冲突导致画布卡住的问题
  await nextTick()
  
  // 使用更长的延迟确保页面完全稳定
  setTimeout(() => {
    canvasReady.value = true
    console.log('[Canvas] 画布已就绪')
    
    // 强制触发一次重绘
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
    })
    
    // 检查是否需要显示新手引导
    checkOnboarding()
  }, 150)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('user-info-updated', handleUserInfoUpdated)
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('unload', handleUnload)
  // 性能优化: 清理拖拽状态监听器
  window.removeEventListener('canvas-drag-start', _onCanvasDragStart)
  window.removeEventListener('canvas-drag-end', _onCanvasDragEnd)
  stopAutoSave()
  stopHistoryAutoSave()

  // 🔧 清理定时器，防止内存泄漏
  if (modeHoverTimer) {
    clearTimeout(modeHoverTimer)
    modeHoverTimer = null
  }
  if (searchTimeout) {
    clearTimeout(searchTimeout)
    searchTimeout = null
  }

  // 🔧 清理后台任务管理器
  cleanupBackgroundTasks()
  
  // 清理上传管理器定时器
  uploadManager.destroy()
})
</script>

<template>
  <div class="canvas-page" :class="{ 'is-transitioning': isTransitioning }">
    <!-- 转场遮罩 -->
    <Transition name="page-transition">
      <div v-if="isTransitioning" class="transition-overlay">
        <div class="transition-content">
          <div class="transition-spinner"></div>
          <span>{{ t('canvas.switching') }}</span>
        </div>
      </div>
    </Transition>

    <!-- 模式切换按钮 -->
    <!-- 模式切换按钮 -->
    <div 
      class="mode-switch-btn"
      @mouseenter="handleModeSwitchEnter"
      @mouseleave="handleModeSwitchLeave"
      @click="handleModeSwitchClick"
    >
      <div class="mode-switch-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </div>
    </div>

    <!-- 模式切换弹窗 -->
    <Transition name="popup-fade">
      <div v-if="showModePopup" class="mode-popup-overlay" @click.self="closeModePopup">
        <div class="mode-popup">
          <div class="mode-popup-header">
            <span class="mode-popup-title">{{ t('canvas.switchMode') }}</span>
            <button class="mode-popup-close" @click="closeModePopup">×</button>
          </div>
          <div class="mode-popup-content">
            <p>{{ t('canvas.switchModeQuestion') }}</p>
            <p class="mode-popup-hint">{{ t('canvas.switchModeHint') }}</p>
          </div>
          <div class="mode-popup-actions">
            <button class="mode-popup-btn cancel" @click="closeModePopup">{{ t('common.cancel') }}</button>
            <button class="mode-popup-btn confirm" @click="confirmSwitchToSimpleMode">{{ t('canvas.switchToSimpleMode') }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 加载状态 -->
    <div v-if="loading || !canvasReady" class="canvas-loading-screen">
      <div class="canvas-loading">
        <div class="canvas-loading-spinner"></div>
        <span>{{ loading ? t('canvas.loading') : t('canvas.preparingCanvas') }}</span>
      </div>
    </div>
    
    <!-- 画布主体 -->
    <div 
      v-else 
      class="canvas-container" 
      :class="{ 'ai-panel-open': showAIAssistant, 'pick-mode': canvasPickMode }"
      :style="{ '--ai-panel-offset': (aiPanelWidth / 2) + 'px' }"
    >
      <!-- 画布选择模式提示条 -->
      <Transition name="pick-banner">
        <div v-if="canvasPickMode" class="canvas-pick-banner">
          <div class="pick-banner-content">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
              <path d="M13 13l6 6"/>
            </svg>
            <span>点击画布中的图片、视频或音频节点进行引用</span>
          </div>
          <button class="pick-banner-cancel" @click="cancelCanvasPick">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            <span>取消</span>
          </button>
        </div>
      </Transition>
      <!-- 无限画布 - 使用 key 强制在就绪后重新挂载 -->
      <CanvasBoard ref="canvasBoardRef" :key="'canvas-board-' + canvasReady" :pick-mode="canvasPickMode" @dblclick="handleCanvasDoubleClick" @pane-click="handlePaneClick" @pick-node="handlePickNode" />
      
      <!-- 顶部标签栏 - 仅在有标签时显示 -->
      <div v-if="canvasStore.workflowTabs.length > 0" class="tabs-container">
        <WorkflowTabs
          :tabs="canvasStore.workflowTabs"
          :active-tab-id="canvasStore.activeTabId"
          @switch="handleTabSwitch"
          @close="handleTabClose"
          @new="handleTabNew"
          @save="handleTabSave"
        />
      </div>
      
      <!-- 左侧工具栏 -->
      <CanvasToolbar @open-save-dialog="openSaveDialog" />
      
      <!-- 空白状态引导 - 当画布为空或没有标签时显示 -->
      <CanvasEmptyState v-if="canvasStore.isEmpty || canvasStore.workflowTabs.length === 0" />
      
      <!-- 底部品牌 Logo -->
      <Transition name="canvas-logo-fade">
        <div v-if="showCanvasLogo" class="canvas-bottom-logo">
          <img 
            v-if="brandConfig.logo && brandConfig.logo !== '/logo.png'" 
            :src="brandConfig.logo" 
            :alt="brandConfig.name"
            class="canvas-bottom-logo-img"
          />
          <span v-else class="canvas-bottom-logo-text">{{ brandConfig.name }}</span>
        </div>
      </Transition>

      <!-- 底部左侧控制区域 -->
      <div class="canvas-bottom-left-controls">
        <!-- 交互模式切换 -->
        <button 
          class="canvas-mode-switch-btn"
          @click="toggleInteractionMode"
          @mousedown.stop
          :title="interactionMode === 'comfyui' ? t('canvas.switchToInfiniteCanvas') : t('canvas.switchToComfyui')"
        >
          <svg v-if="interactionMode === 'comfyui'" class="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 12h4l3-9 4 18 3-9h4"/>
          </svg>
          <svg v-else class="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.3"/>
          </svg>
        </button>
        
        <!-- 缩放控制 -->
        <div class="canvas-zoom-controls" @mousedown.stop @touchstart.stop>
          <button class="canvas-zoom-btn" @click="handleZoomOut" :disabled="canvasStore.viewport.zoom <= MIN_ZOOM" title="缩小 (-)">−</button>
          <input
            type="range"
            class="canvas-zoom-slider"
            :min="MIN_ZOOM"
            :max="MAX_ZOOM"
            step="0.01"
            :value="canvasStore.viewport.zoom"
            @input="handleZoomSlider"
            @mousedown.stop
            @touchstart.stop
            :title="`缩放: ${Math.round(canvasStore.viewport.zoom * 100)}%`"
          />
          <span
            class="canvas-zoom-value"
            @click="handleZoomReset"
            :title="'点击重置为100%'"
          >{{ Math.round(canvasStore.viewport.zoom * 100) }}%</span>
          <button class="canvas-zoom-btn" @click="handleZoomIn" :disabled="canvasStore.viewport.zoom >= MAX_ZOOM" title="放大 (+)">+</button>
        </div>
      </div>
      
      <!-- 右上角控制区域 -->
      <div 
        class="canvas-top-right-controls" 
        :class="{ 'panel-open': showAIAssistant }"
        :style="showAIAssistant ? { right: (aiPanelWidth + 24) + 'px' } : {}"
      >
        <!-- 空间切换 -->
        <CanvasSpaceSwitcher />

        <!-- 积分显示 -->
        <div v-if="me" class="canvas-points-display" :title="t('canvas.pointsDetail')">
          <svg class="points-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v12"/>
            <path d="M8 10h8"/>
            <path d="M8 14h8"/>
          </svg>
          <span class="points-value">{{ totalPoints }}</span>
        </div>

        <!-- 购物车按钮 -->
        <button
          class="canvas-icon-btn canvas-cart-btn"
          title="套餐购买"
          @click="openPackageModal"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        </button>

        <!-- 通知铃铛 -->
        <CanvasNotification :theme="canvasTheme" />
        
        <!-- 客服支持 -->
        <CanvasSupport :theme="canvasTheme" />

        <!-- 主题切换按钮 -->
        <button
          class="canvas-icon-btn canvas-theme-toggle"
          :title="canvasTheme === 'dark' ? '切换到白昼模式' : '切换到夜晚模式'"
          @click="toggleCanvasTheme"
        >
          <!-- 太阳图标（白昼模式） -->
          <svg v-if="canvasTheme === 'dark'" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2"/>
            <path d="M12 20v2"/>
            <path d="m4.93 4.93 1.41 1.41"/>
            <path d="m17.66 17.66 1.41 1.41"/>
            <path d="M2 12h2"/>
            <path d="M20 12h2"/>
            <path d="m6.34 17.66-1.41 1.41"/>
            <path d="m19.07 4.93-1.41 1.41"/>
          </svg>
          <!-- 月亮图标（夜晚模式） -->
          <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>

        <!-- 语言切换 -->
        <LanguageSwitcher :isDark="canvasTheme === 'dark'" direction="down" :compact="true" />

        <!-- 工单按钮 -->
        <TicketButton ref="ticketButtonRef" @open="showTicketDrawer = true" />

        <!-- 帮助/快捷键按钮（仅图标） -->
        <button class="canvas-icon-btn" :title="t('common.help')" @click="showHelp = true">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
      </div>

      
      <!-- 帮助弹窗 -->
      <div v-if="showHelp" class="canvas-help-modal" @click.self="showHelp = false">
        <div class="canvas-help-content">
          <div class="canvas-help-header">
            <h3>🎨 {{ t('canvas.helpGuide') }}</h3>
            <button class="canvas-help-close" @click="showHelp = false">×</button>
          </div>
          <div class="canvas-help-body">
            <div class="help-section">
              <h4>🖱️ {{ t('canvas.mouseOperations') }}
                <span class="help-mode-badge">{{ interactionMode === 'comfyui' ? t('canvas.comfyuiModeShort') : t('canvas.infiniteCanvasModeShort') }}</span>
              </h4>
              <!-- ComfyUI 模式 -->
              <ul v-if="interactionMode === 'comfyui'">
                <li><kbd>{{ t('canvas.leftDrag') }}</kbd> {{ t('canvas.leftDragDesc') }}</li>
                <li><kbd>{{ t('canvas.rightClick') }}</kbd> {{ t('canvas.rightClickDesc') }}</li>
                <li><kbd>{{ t('canvas.ctrlDrag') }}</kbd> {{ t('canvas.ctrlDragDesc') }}</li>
                <li><kbd>{{ t('canvas.spaceDrag') }}</kbd> {{ t('canvas.spaceDragDesc') }}</li>
                <li><kbd>{{ t('canvas.leftClick') }}</kbd> {{ t('canvas.leftClickDesc') }}</li>
                <li><kbd>{{ t('canvas.doubleClickBlank') }}</kbd> {{ t('canvas.doubleClickBlankDesc') }}</li>
                <li><kbd>{{ t('canvas.scrollUp') }}</kbd> {{ t('canvas.scrollUpDesc') }}</li>
                <li><kbd>{{ t('canvas.scrollDown') }}</kbd> {{ t('canvas.scrollDownDesc') }}</li>
                <li><kbd>{{ t('canvas.shiftScroll') }}</kbd> {{ t('canvas.shiftScrollDesc') }}</li>
                <li><kbd>{{ t('canvas.ctrlScroll') }}</kbd> {{ t('canvas.ctrlScrollDesc') }}</li>
                <li><kbd>{{ t('canvas.middleDrag') }}</kbd> {{ t('canvas.middleDragDesc') }}</li>
              </ul>
              <!-- 无限画布模式 -->
              <ul v-else>
                <li><kbd>{{ t('canvas.leftDrag') }}</kbd> {{ t('canvas.infiniteLeftDragDesc') }}</li>
                <li><kbd>{{ t('canvas.rightClick') }}</kbd> {{ t('canvas.rightClickDesc') }}</li>
                <li><kbd>{{ t('canvas.spaceDrag') }}</kbd> {{ t('canvas.spaceDragDesc') }}</li>
                <li><kbd>{{ t('canvas.leftClick') }}</kbd> {{ t('canvas.leftClickDesc') }}</li>
                <li><kbd>{{ t('canvas.doubleClickBlank') }}</kbd> {{ t('canvas.doubleClickBlankDesc') }}</li>
                <li><kbd>{{ t('canvas.scrollUp') }}</kbd> {{ t('canvas.infiniteScrollDesc') }}</li>
                <li><kbd>{{ t('canvas.scrollDown') }}</kbd> {{ t('canvas.infiniteScrollDesc') }}</li>
                <li><kbd>{{ t('canvas.shiftScroll') }}</kbd> {{ t('canvas.shiftScrollDesc') }}</li>
                <li><kbd>{{ t('canvas.ctrlScroll') }}</kbd> {{ t('canvas.infiniteCtrlScrollDesc') }}</li>
                <li><kbd>{{ t('canvas.middleDrag') }}</kbd> {{ t('canvas.middleDragDesc') }}</li>
              </ul>
            </div>
            <div class="help-section">
              <h4>⌨️ {{ t('canvas.keyboardShortcuts') }}</h4>
              <ul>
                <li><kbd>Ctrl+S</kbd> {{ t('canvas.saveWorkflow') }}</li>
                <li><kbd>Ctrl+Z</kbd> {{ t('canvas.undoShortcut') }}</li>
                <li><kbd>Ctrl+X</kbd> / <kbd>Ctrl+Y</kbd> {{ t('canvas.redoShortcut') }}</li>
                <li><kbd>Ctrl+C</kbd> {{ t('canvas.copyNode') }}</li>
                <li><kbd>Ctrl+V</kbd> {{ t('canvas.pasteNode') }}</li>
                <li><kbd>Ctrl+A</kbd> {{ t('canvas.selectAllNodes') }}</li>
                <li><kbd>Ctrl+G</kbd> {{ t('canvas.groupNodes') }}</li>
                <li><kbd>Delete</kbd> / <kbd>Backspace</kbd> {{ t('canvas.deleteSelected') }}</li>
                <li><kbd>Escape</kbd> {{ t('canvas.closeDialog') }}</li>
                <li><kbd>Ctrl+Enter</kbd> {{ t('canvas.startGenerate') }}</li>
                <li><kbd>Tab</kbd> {{ t('canvas.toggleAIAssistant') || '展开/收起 AI 灵感助手' }}</li>
                <li><kbd>I</kbd> {{ t('canvas.createImageNode') || '在下游创建图像节点' }}</li>
                <li><kbd>V</kbd> {{ t('canvas.createVideoNode') || '在下游创建视频节点' }}</li>
                <li><kbd>T</kbd> {{ t('canvas.createTextNode') || '在下游创建文本节点' }}</li>
                <li><kbd>A</kbd> {{ t('canvas.createAudioNode') || '在下游创建音频节点' }}</li>
                <li><kbd>D</kbd> {{ t('canvas.downloadNodeFile') || '下载选中节点的文件' }}</li>
              </ul>
            </div>
            <div class="help-section">
              <h4>📌 {{ t('canvas.nodeOperations') }}</h4>
              <ul>
                <li>{{ t('canvas.dragConnection') }}</li>
                <li>{{ t('canvas.rightClickNode') }}</li>
                <li>{{ t('canvas.clickPlus') }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 节点选择器弹窗 -->
      <NodeSelector 
        v-if="canvasStore.isNodeSelectorOpen"
        :position="canvasStore.nodeSelectorPosition"
        :trigger="canvasStore.nodeSelectorTrigger"
        :trigger-node-id="canvasStore.triggerNodeId"
        @close="canvasStore.closeNodeSelector()"
      />
      
      <!-- 节点右键菜单 -->
      <NodeContextMenu
        v-if="canvasStore.isContextMenuOpen"
        :position="canvasStore.contextMenuPosition"
        :node="canvasStore.contextMenuTargetNode"
        @close="canvasStore.closeContextMenu()"
        @send-to-assistant="handleSendToAssistant"
      />
      
      <!-- 画布右键菜单（空白区域） -->
      <CanvasContextMenu
        v-if="canvasStore.isCanvasContextMenuOpen"
        :position="canvasStore.canvasContextMenuPosition"
        @close="canvasStore.closeCanvasContextMenu()"
        @upload="handleCanvasUpload"
        @add-node="handleCanvasAddNode"
        @group="handleCanvasGroup"
        @paste-clipboard="handlePasteClipboard"
      />

      <!-- 工作流模板面板 -->
      <WorkflowTemplates
        :visible="showTemplates"
        @close="closeTemplates"
        @select="closeTemplates"
      />
      
      <!-- 保存工作流对话框 -->
      <SaveWorkflowDialog
        :visible="showSaveDialog"
        @close="closeSaveDialog"
        @saving="handleWorkflowSaving"
        @saved="handleWorkflowSaved"
        @error="handleWorkflowSaveError"
      />
      
      <!-- 工作流面板 -->
      <WorkflowPanel
        ref="workflowPanelRef"
        :visible="showWorkflowPanel"
        @close="closeWorkflowPanel"
        @load="handleWorkflowLoaded"
        @new="handleWorkflowNew"
      />
      
      <!-- 资产面板 -->
      <AssetPanel
        :visible="showAssetPanel"
        @close="closeAssetPanel"
        @insert-asset="handleAssetInsert"
      />
      
      <!-- 历史记录面板 -->
      <HistoryPanel
        :visible="showHistoryPanel"
        @close="closeHistoryPanel"
        @apply-history="handleHistoryApply"
      />
      
      <!-- 编组工具栏 -->
      <GroupToolbar
        v-if="showGroupToolbar"
        :group-node="selectedGroupNode"
        :position="groupToolbarPosition"
        :style="{
          position: 'fixed',
          left: `${groupToolbarPosition.x}px`,
          top: `${groupToolbarPosition.y}px`,
          transform: 'translateX(-50%)',
          zIndex: 9999
        }"
        @disband="handleDisbandGroup"
        @execute="handleExecuteGroup"
        @save-workflow="handleSaveWorkflow"
      />
      
      <!-- 图像节点工具栏已移至 ImageNode.vue 内部，使用 props.selected 控制显示 -->
      
      <!-- 图片编辑模式（全屏覆盖层） - 用于裁剪、标注等 -->
      <ImageEditMode />
      
      <!-- 原地图片编辑器 - 用于重绘、擦除 -->
      <InplaceImageEditor />
      
      <!-- 新手引导 -->
      <OnboardingGuide
        :visible="showOnboarding"
        :interaction-mode="interactionMode"
        @close="closeOnboarding"
        @complete="handleOnboardingComplete"
        @mode-select="handleOnboardingModeSelect"
      />

      <!-- AI 灵感助手面板 -->
      <AIAssistantPanel
        ref="aiAssistantRef"
        :visible="showAIAssistant"
        @close="showAIAssistant = false"
        @width-change="aiPanelWidth = $event"
        @start-canvas-pick="startCanvasPick"
      />

      <!-- AI 助手触发按钮 - 苹果风格3D图标 -->
      <button
        class="ai-assistant-trigger"
        :class="{ active: showAIAssistant }"
        :style="showAIAssistant ? { right: (aiPanelWidth + 24) + 'px' } : {}"
        @click="showAIAssistant = !showAIAssistant"
        :title="showAIAssistant ? '关闭 AI 助手' : '打开 AI 助手'"
      >
        <div class="trigger-icon">
          <!-- 星光图标 - 灵感/AI -->
          <svg viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="sparkle-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#a78bfa"/>
                <stop offset="50%" stop-color="#818cf8"/>
                <stop offset="100%" stop-color="#6366f1"/>
              </linearGradient>
            </defs>
            <!-- 主星 -->
            <path
              d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
              fill="url(#sparkle-gradient)"
            />
            <!-- 小星1 -->
            <path
              d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
              fill="url(#sparkle-gradient)"
              opacity="0.8"
            />
            <!-- 小星2 -->
            <path
              d="M5 15L5.5 16.5L7 17L5.5 17.5L5 19L4.5 17.5L3 17L4.5 16.5L5 15Z"
              fill="url(#sparkle-gradient)"
              opacity="0.6"
            />
          </svg>
        </div>
        <div class="trigger-glow"></div>
      </button>

    </div>
    
    <!-- 🔧 Toast 通知 -->
    <CanvasToast
      v-if="showToast"
      :message="toastMessage"
      :type="toastType"
      :duration="toastDuration"
      @close="closeToast"
    />

    <!-- 套餐购买弹窗 -->
    <PackageModal
      :visible="showPackageModal"
      @close="closePackageModal"
      @purchase-success="handlePurchaseSuccess"
    />

    <!-- 工单弹窗 -->
    <TicketDrawer :visible="showTicketDrawer" @close="showTicketDrawer = false">
      <!-- 工单列表 -->
      <TicketList
        v-show="ticketView === 'list'"
        ref="ticketListRef"
        @select="handleSelectTicket"
        @create="ticketView = 'create'"
        @close="showTicketDrawer = false"
      />

      <!-- 工单详情 -->
      <TicketDetail
        v-if="selectedTicketId"
        v-show="ticketView === 'detail'"
        :ticket-id="selectedTicketId"
        @back="handleBackToList"
        @updated="handleTicketUpdated"
        @close="showTicketDrawer = false"
      />

      <!-- 创建工单 -->
      <CreateTicketForm
        v-show="ticketView === 'create'"
        @back="ticketView = 'list'"
        @success="handleCreateSuccess"
        @close="showTicketDrawer = false"
      />
    </TicketDrawer>
  </div>
</template>

<style scoped>
.canvas-page {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.canvas-page.is-transitioning {
  pointer-events: none;
}

/* 标签容器 - 左上角，在模式切换按钮右侧 */
.tabs-container {
  position: fixed;
  top: 16px;
  left: 70px;
  z-index: 100;
}

/* 模式切换按钮 */
.mode-switch-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.mode-switch-icon {
  width: 40px;
  height: 40px;
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.mode-switch-icon svg {
  width: 20px;
  height: 20px;
}

.mode-switch-btn:hover .mode-switch-icon {
  background: rgba(60, 60, 60, 0.95);
  border-color: rgba(255, 255, 255, 0.25);
  color: #ffffff;
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* 模式切换弹窗 */
.mode-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 80px 0 0 80px;
  z-index: 1000;
}

.mode-popup {
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 320px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
}

.mode-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mode-popup-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.mode-popup-close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.mode-popup-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.mode-popup-content {
  padding: 20px;
}

.mode-popup-content p {
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.5;
}

.mode-popup-hint {
  margin-top: 8px !important;
  color: rgba(255, 255, 255, 0.5) !important;
  font-size: 13px !important;
}

.mode-popup-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.mode-popup-btn {
  flex: 1;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-popup-btn.cancel {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
}

.mode-popup-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.mode-popup-btn.confirm {
  background: rgba(255, 255, 255, 0.9);
  border: none;
  color: #1a1a1a;
}

.mode-popup-btn.confirm:hover {
  background: #fff;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
}

.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: all 0.25s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}

.popup-fade-enter-from .mode-popup,
.popup-fade-leave-to .mode-popup {
  transform: scale(0.95) translateY(-10px);
}

/* 转场遮罩 */
.transition-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: radial-gradient(ellipse at center, rgba(20, 20, 20, 0.98) 0%, rgba(0, 0, 0, 0.99) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.transition-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 16px;
}

.transition-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.page-transition-enter-active {
  animation: transitionIn 0.4s ease-out;
}

.page-transition-leave-active {
  animation: transitionOut 0.3s ease-in;
}

@keyframes transitionIn {
  from {
    opacity: 0;
    transform: scale(1.1);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes transitionOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}

.canvas-loading-screen {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--canvas-bg-primary);
}

/* 帮助弹窗 - 支持日夜模式 */
.canvas-help-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.canvas-help-content {
  background: var(--canvas-bg-secondary);
  border: 1px solid var(--canvas-border-default);
  border-radius: var(--canvas-radius-lg);
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--canvas-shadow-lg);
}

.canvas-help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--canvas-border-default);
}

.canvas-help-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--canvas-text-primary);
}

.canvas-help-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--canvas-text-tertiary);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.canvas-help-close:hover {
  background: var(--canvas-bg-elevated);
  color: var(--canvas-text-primary);
}

.canvas-help-body {
  padding: 24px;
}

.help-section {
  margin-bottom: 24px;
}

.help-section:last-child {
  margin-bottom: 0;
}

.help-section h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--canvas-text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-mode-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--canvas-text-secondary);
  border: 1px solid var(--canvas-border-subtle);
}

.help-section ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.help-section li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 0;
  color: var(--canvas-text-secondary);
  font-size: 14px;
  border-bottom: 1px solid var(--canvas-border-subtle);
}

.help-section li:last-child {
  border-bottom: none;
}

.help-section kbd {
  display: inline-block;
  padding: 4px 10px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  color: var(--canvas-text-primary);
  background: var(--canvas-bg-elevated);
  border: 1px solid var(--canvas-border-active);
  border-radius: 6px;
  box-shadow: 0 2px 0 var(--canvas-border-subtle);
}

.help-section strong {
  color: var(--canvas-text-primary);
}

/* 右上角控制区域 */
.canvas-top-right-controls {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: right 0.25s ease;
}

/* 积分显示 */
.canvas-points-display {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(18, 18, 18, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 500;
  backdrop-filter: blur(20px);
  cursor: default;
  transition: all 0.25s ease;
}

.canvas-points-display:hover {
  background: rgba(30, 30, 30, 0.98);
  border-color: rgba(255, 255, 255, 0.2);
}

.canvas-points-display .points-icon {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.85);
  flex-shrink: 0;
}

.canvas-points-display .points-value {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 积分显示 - 白昼模式 */
:root.canvas-theme-light .canvas-points-display {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: rgba(28, 25, 23, 0.85);
}

:root.canvas-theme-light .canvas-points-display:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .canvas-points-display .points-icon {
  color: rgba(28, 25, 23, 0.85);
}

:root.canvas-theme-light .canvas-points-display .points-value {
  color: rgba(28, 25, 23, 0.85);
}

/* 当 AI 面板打开时，右上角控制区域向左移动 - 通过内联样式动态控制 */

.canvas-help-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: rgba(18, 18, 18, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(20px);
}

.canvas-help-btn:hover {
  background: rgba(30, 30, 30, 0.98);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.95);
  transform: translateY(-1px);
}

.canvas-help-btn .btn-label {
  font-weight: 500;
}

/* 仅图标的按钮样式 */
.canvas-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: rgba(18, 18, 18, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(20px);
}

.canvas-icon-btn:hover {
  background: rgba(30, 30, 30, 0.98);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.95);
  transform: translateY(-1px);
}

/* 亮色主题下的按钮样式 */
:root.canvas-theme-light .canvas-icon-btn {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: rgba(28, 25, 23, 0.8);
}

:root.canvas-theme-light .canvas-icon-btn:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(0, 0, 0, 0.15);
  color: rgba(28, 25, 23, 1);
}

/* 主题切换按钮特殊效果 */
.canvas-theme-toggle:hover {
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}

/* 购物车按钮特殊效果 */
.canvas-cart-btn:hover {
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
}

/* 确保语言切换器在画布模式下样式正确 */
.canvas-top-right-controls :deep(.language-switcher) {
  z-index: 9001;
}

.canvas-top-right-controls :deep(.lang-trigger) {
  background: rgba(30, 30, 30, 0.9);
  border-color: rgba(255, 255, 255, 0.15);
  padding: 8px 12px;
}

.canvas-top-right-controls :deep(.lang-trigger:hover) {
  background: rgba(50, 50, 50, 0.95);
  border-color: rgba(255, 255, 255, 0.25);
}

/* AI 助手触发按钮 - 苹果风格3D效果 */
.ai-assistant-trigger {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 8999;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: linear-gradient(145deg, #2a2a2e 0%, #1a1a1e 100%);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  /* 3D 阴影效果 */
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.3),
    0 8px 16px rgba(0, 0, 0, 0.3),
    0 16px 32px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.2);
  /* 玻璃质感边框 */
  outline: 1px solid rgba(255, 255, 255, 0.08);
  outline-offset: -1px;
}

.ai-assistant-trigger .trigger-icon {
  width: 26px;
  height: 26px;
  position: relative;
  z-index: 2;
  transition: transform 0.3s ease;
}

.ai-assistant-trigger .trigger-icon svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 2px 4px rgba(99, 102, 241, 0.4));
}

.ai-assistant-trigger .trigger-glow {
  position: absolute;
  inset: -2px;
  border-radius: 18px;
  background: radial-gradient(circle at center, rgba(139, 92, 246, 0.3) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 1;
}

.ai-assistant-trigger:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.3),
    0 12px 24px rgba(0, 0, 0, 0.3),
    0 24px 48px rgba(0, 0, 0, 0.2),
    0 0 40px rgba(139, 92, 246, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    inset 0 -1px 0 rgba(0, 0, 0, 0.2);
}

.ai-assistant-trigger:hover .trigger-icon {
  transform: scale(1.1);
}

.ai-assistant-trigger:hover .trigger-glow {
  opacity: 1;
}

.ai-assistant-trigger:active {
  transform: translateY(-1px) scale(1.02);
}

.ai-assistant-trigger.active {
  background: linear-gradient(145deg, #3a3a42 0%, #2a2a32 100%);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.3),
    0 8px 16px rgba(0, 0, 0, 0.3),
    0 0 30px rgba(139, 92, 246, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.2);
}

.ai-assistant-trigger.active .trigger-glow {
  opacity: 0.8;
}

/* 当 AI 面板打开时，按钮位置调整避免遮挡 - 通过内联样式动态控制 */

/* 缩放滑块样式 */
.canvas-zoom-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 120px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.canvas-zoom-slider:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* 滑块按钮 - WebKit浏览器 */
.canvas-zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: linear-gradient(145deg, #ffffff 0%, #e0e0e0 100%);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.canvas-zoom-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.2);
}

.canvas-zoom-slider::-webkit-slider-thumb:active {
  transform: scale(1.05);
  background: linear-gradient(145deg, #e0e0e0 0%, #c0c0c0 100%);
}

/* 滑块按钮 - Firefox */
.canvas-zoom-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: linear-gradient(145deg, #ffffff 0%, #e0e0e0 100%);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.canvas-zoom-slider::-moz-range-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.2);
}

.canvas-zoom-slider::-moz-range-thumb:active {
  transform: scale(1.05);
  background: linear-gradient(145deg, #e0e0e0 0%, #c0c0c0 100%);
}

/* 滑块轨道 - Firefox */
.canvas-zoom-slider::-moz-range-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* 百分比值可点击重置 */
.canvas-zoom-value {
  cursor: pointer;
  user-select: none;
  transition: color 0.2s ease;
}

.canvas-zoom-value:hover {
  color: rgba(255, 255, 255, 0.9);
}

/* 缩放按钮禁用状态 */
.canvas-zoom-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.canvas-zoom-btn:disabled:hover {
  background: transparent;
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.5));
}

/* ========================================
   白昼模式额外样式适配
   ======================================== */

/* 模式切换按钮 - 白昼模式 */
:root.canvas-theme-light .mode-switch-icon {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .mode-switch-btn:hover .mode-switch-icon {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.15);
  color: #1c1917;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .mode-switch-btn span {
  color: #57534e;
}

/* 右上角控制按钮 - 白昼模式 */
:root.canvas-theme-light .canvas-top-right-controls :deep(.lang-trigger) {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .canvas-top-right-controls :deep(.lang-trigger:hover) {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.15);
}

/* AI 助手触发按钮 - 白昼模式 */
:root.canvas-theme-light .ai-assistant-trigger {
  background: linear-gradient(145deg, #ffffff 0%, #f5f5f4 100%);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.08),
    0 8px 16px rgba(0, 0, 0, 0.08),
    0 16px 32px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.05);
  outline-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .ai-assistant-trigger:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.1),
    0 12px 24px rgba(0, 0, 0, 0.1),
    0 24px 48px rgba(0, 0, 0, 0.08),
    0 0 40px rgba(139, 92, 246, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 1),
    inset 0 -1px 0 rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .ai-assistant-trigger.active {
  background: linear-gradient(145deg, #f5f5f4 0%, #e7e5e4 100%);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.1),
    0 8px 16px rgba(0, 0, 0, 0.1),
    0 0 30px rgba(139, 92, 246, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    inset 0 -1px 0 rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .ai-assistant-trigger .trigger-icon svg {
  filter: drop-shadow(0 2px 4px rgba(99, 102, 241, 0.3));
}

/* 缩放控制 - 白昼模式 */
:root.canvas-theme-light .canvas-zoom-slider {
  background: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .canvas-zoom-slider:hover {
  background: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .canvas-zoom-slider::-webkit-slider-thumb {
  background: linear-gradient(145deg, #1c1917 0%, #292524 100%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .canvas-zoom-slider::-moz-range-thumb {
  background: linear-gradient(145deg, #1c1917 0%, #292524 100%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .canvas-zoom-slider::-moz-range-track {
  background: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .canvas-zoom-value {
  color: #57534e;
}

:root.canvas-theme-light .canvas-zoom-value:hover {
  color: #1c1917;
}

/* 模式切换弹窗 - 白昼模式 */
:root.canvas-theme-light .mode-popup-overlay {
  background: rgba(255, 255, 255, 0.6);
}

:root.canvas-theme-light .mode-popup {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .mode-popup-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .mode-popup-title {
  color: #1c1917;
}

:root.canvas-theme-light .mode-popup-close {
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .mode-popup-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .mode-popup-content p {
  color: #1c1917;
}

:root.canvas-theme-light .mode-popup-hint {
  color: #78716c !important;
}

:root.canvas-theme-light .mode-popup-actions {
  border-top-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .mode-popup-btn.cancel {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .mode-popup-btn.cancel:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #1c1917;
}

:root.canvas-theme-light .mode-popup-btn.confirm {
  background: #1c1917;
  color: #ffffff;
}

:root.canvas-theme-light .mode-popup-btn.confirm:hover {
  background: #292524;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 画布选择模式 */
.canvas-container.pick-mode {
  cursor: crosshair;
}

.canvas-pick-banner {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9500;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: rgba(59, 130, 246, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.15) inset;
  backdrop-filter: blur(12px);
  color: white;
  font-size: 14px;
  pointer-events: auto;
}

.pick-banner-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pick-banner-content svg {
  flex-shrink: 0;
  opacity: 0.9;
}

.pick-banner-cancel {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.pick-banner-cancel:hover {
  background: rgba(255, 255, 255, 0.3);
}

.pick-banner-enter-active,
.pick-banner-leave-active {
  transition: all 0.25s ease;
}

.pick-banner-enter-from,
.pick-banner-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}

</style>

