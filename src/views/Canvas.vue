<script setup>
/**
 * Canvas.vue - 创作者画布主页面
 */
import { ref, computed, watch, onMounted, onUnmounted, provide, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getMe } from '@/api/client'
import { useCanvasStore } from '@/stores/canvas'
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
import { useI18n } from '@/i18n'
import { startAutoSave as startHistoryAutoSave, stopAutoSave as stopHistoryAutoSave, manualSave as saveToHistory } from '@/stores/canvas/workflowAutoSave'

// 导入画布样式
import '@/styles/canvas.css'

const { t } = useI18n()

const router = useRouter()
const route = useRoute()
const canvasStore = useCanvasStore()

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

// 资产面板
const showAssetPanel = ref(false)

// 历史记录面板
const showHistoryPanel = ref(false)

// 新手引导
const showOnboarding = ref(false)

// AI 灵感助手
const showAIAssistant = ref(false)

// 自动保存定时器
const autoSaveInterval = ref(null)
const lastAutoSave = ref(null)
const autoSaveEnabled = ref(false) // 只有保存过的工作流才启用自动保存

// 模式切换
const isTransitioning = ref(false)
const showModePopup = ref(false)
let modeHoverTimer = null

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

// 选中的编组节点
const selectedGroupNode = computed(() => {
  // 检查 selectedNodeId
  const selectedId = canvasStore.selectedNodeId
  if (!selectedId) return null
  
  // 查找节点
  const node = canvasStore.nodes.find(n => n.id === selectedId)
  if (node && node.type === 'group') {
    console.log('[Canvas] 检测到选中编组:', node.id)
    return node
  }
  return null
})

// 选中的图像节点（用于显示图像工具栏）
const selectedImageNode = computed(() => {
  const selectedId = canvasStore.selectedNodeId
  console.log('[Canvas] selectedImageNode 检查 - selectedId:', selectedId)
  if (!selectedId) return null
  
  const node = canvasStore.nodes.find(n => n.id === selectedId)
  console.log('[Canvas] selectedImageNode 检查 - node:', node?.id, node?.type, node?.data)
  if (!node) return null
  
  // 检查是否是图像类型节点（包括所有可能的图像类型）
  const imageTypes = ['image', 'image-input', 'image-gen', 'text-to-image', 'image-to-image']
  if (imageTypes.includes(node.type)) {
    // 检查是否有图片内容（输出图片或源图片）
    const hasOutput = node.data?.output?.urls?.length > 0 || node.data?.output?.url
    const hasSource = node.data?.sourceImages?.length > 0
    
    console.log('[Canvas] 图像节点检查:', { hasOutput, hasSource, output: node.data?.output, sourceImages: node.data?.sourceImages })
    
    if (hasOutput || hasSource) {
      console.log('[Canvas] ✅ 检测到选中图像节点，应显示工具栏:', node.id, node.type)
      return node
    }
  } else {
    console.log('[Canvas] 节点类型不匹配:', node.type, '不在', imageTypes)
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

// 编组工具栏位置
const groupToolbarPosition = computed(() => {
  if (!selectedGroupNode.value) return { x: 0, y: 0 }
  
  const node = selectedGroupNode.value
  const viewport = canvasStore.viewport
  
  // 计算工具栏位置（在编组上方居中，保持一定距离）
  const container = document.querySelector('.canvas-board')
  if (!container) return { x: window.innerWidth / 2, y: 100 }
  
  const rect = container.getBoundingClientRect()
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
  
  const container = document.querySelector('.canvas-board')
  if (!container) return { x: window.innerWidth / 2, y: 100 }
  
  const rect = container.getBoundingClientRect()
  const nodeWidth = node.data?.width || 380
  const labelHeight = 28 // 节点标签高度
  
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
function handleWorkflowLoaded(workflow) {
  console.log('[Canvas] 工作流已加载:', workflow.name)
  // 在新标签中打开
  canvasStore.openWorkflowInNewTab(workflow)
  
  // 如果是已保存的工作流，启用自动保存
  if (workflow.id && !autoSaveEnabled.value) {
    autoSaveEnabled.value = true
    startAutoSave()
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
function handleTabClose(tabId) {
  canvasStore.closeTab(tabId)
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
  
  // 根据资产类型创建相应的节点
  const position = {
    x: 300,
    y: window.innerHeight / 2 - 100
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
  
  // 根据历史记录类型创建相应的节点
  const position = {
    x: 300,
    y: window.innerHeight / 2 - 100
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
        model: historyItem.model
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

// 关闭保存对话框
function closeSaveDialog() {
  showSaveDialog.value = false
}

// 保存成功回调
function handleWorkflowSaved(workflow) {
  console.log('[Canvas] 工作流保存成功:', workflow)
  
  // 更新当前标签名称和工作流ID
  canvasStore.updateCurrentTabName(workflow.name)
  canvasStore.markCurrentTabSaved(workflow.id)
  
  // 启用自动保存
  if (!autoSaveEnabled.value) {
    autoSaveEnabled.value = true
    startAutoSave()
  }
  
  lastAutoSave.value = new Date()
}

// 自动保存函数
async function autoSaveWorkflow() {
  const currentTab = canvasStore.getCurrentTab()
  
  // 只有已保存过的工作流（有workflowId）才自动保存
  if (!currentTab || !currentTab.workflowId) {
    return
  }
  
  // 如果没有变更，跳过
  if (!currentTab.hasChanges) {
    return
  }
  
  try {
    const { saveWorkflow } = await import('@/api/canvas/workflow')
    const workflowData = canvasStore.exportWorkflow()
    
    await saveWorkflow({
      id: currentTab.workflowId,
      name: currentTab.name,
      ...workflowData
    })
    
    canvasStore.markCurrentTabSaved()
    lastAutoSave.value = new Date()
    console.log('[Canvas] 自动保存成功:', currentTab.name)
  } catch (error) {
    console.error('[Canvas] 自动保存失败:', error)
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

// 启动历史工作流自动保存（localStorage，1分钟间隔）
function initHistoryAutoSave() {
  startHistoryAutoSave(getCurrentWorkflowData)
  console.log('[Canvas] 历史工作流自动保存已启动')
}

// 页面关闭前保存当前工作流到历史
function handleBeforeUnload() {
  const workflowData = getCurrentWorkflowData()
  if (workflowData && workflowData.nodes && workflowData.nodes.length > 0) {
    saveToHistory(workflowData)
    console.log('[Canvas] 页面关闭前保存工作流到历史')
  }
}

// 加载用户信息
async function loadUserInfo() {
  try {
    me.value = await getMe()
    if (!me.value) {
      // 未登录，跳转到落地页
      router.push('/')
    }
  } catch (e) {
    console.error('[Canvas] 加载用户信息失败:', e)
  } finally {
    loading.value = false
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

// 处理画布右键菜单的上传事件
function handleCanvasUpload(type) {
  // 打开文件选择器上传
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = type === 'image' ? 'image/*' : 'video/*'
  input.multiple = type === 'image' // 图片支持多选
  
  input.onchange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    const position = canvasStore.canvasContextMenuPosition
    const baseX = position.flowX || 100
    const baseY = position.flowY || 100
    
    if (type === 'image') {
      // 过滤出图片文件
      const imageFiles = files.filter(f => f.type.startsWith('image/'))
      
      if (imageFiles.length === 0) {
        console.warn('[Canvas] 没有选择有效的图片文件')
        return
      }
      
      // 每个图片创建一个节点，或者多张图片合并到一个节点
      if (imageFiles.length === 1) {
        // 单张图片：创建一个节点
        const url = URL.createObjectURL(imageFiles[0])
        canvasStore.addNode({
          type: 'image-input',
          position: { x: baseX, y: baseY },
          data: { 
            images: [url],
            fileName: imageFiles[0].name 
          }
        })
        console.log(`[Canvas] 上传图片: ${imageFiles[0].name}`)
      } else {
        // 多张图片：可以选择创建多个节点或一个节点
        // 这里我们为每张图片创建一个独立节点，并排列布局
        const nodeWidth = 250
        const nodeHeight = 200
        const gap = 30
        const columns = Math.ceil(Math.sqrt(imageFiles.length))
        
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i]
          const url = URL.createObjectURL(file)
          
          // 计算节点位置（网格布局）
          const col = i % columns
          const row = Math.floor(i / columns)
          const nodeX = baseX + col * (nodeWidth + gap)
          const nodeY = baseY + row * (nodeHeight + gap)
          
          canvasStore.addNode({
            type: 'image-input',
            position: { x: nodeX, y: nodeY },
            data: { 
              images: [url],
              fileName: file.name 
            }
          })
        }
        console.log(`[Canvas] 上传 ${imageFiles.length} 张图片`)
      }
    } else if (type === 'video') {
      // 视频只处理第一个文件
      const videoFile = files.find(f => f.type.startsWith('video/'))
      if (!videoFile) {
        console.warn('[Canvas] 没有选择有效的视频文件')
        return
      }
      
      const url = URL.createObjectURL(videoFile)
      canvasStore.addNode({
        type: 'video-input',
        position: { x: baseX, y: baseY },
        data: { 
          video: url,
          fileName: videoFile.name 
        }
      })
      console.log(`[Canvas] 上传视频: ${videoFile.name}`)
    }
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

// 键盘快捷键（页面级别）
// 注意：大部分快捷键已移至 CanvasBoard.vue 中实现
function handleKeyDown(event) {
  // 检查是否在输入框或可编辑区域中
  const target = event.target
  const isInInput = target.tagName === 'INPUT' || 
                    target.tagName === 'TEXTAREA' || 
                    target.isContentEditable ||
                    target.closest('[contenteditable="true"]')
  
  // Escape 关闭弹窗
  if (event.key === 'Escape') {
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
        if (confirm('确定要删除这个编组吗？编组内的节点将被恢复为独立节点。')) {
          handleDisbandGroup()
        }
      } else {
        // 普通节点直接删除
        canvasStore.removeNode(canvasStore.selectedNodeId)
        canvasStore.selectedNodeId = null
      }
    }
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
function handleExecuteGroup() {
  if (selectedGroupNode.value) {
    const nodeIds = selectedGroupNode.value.data?.nodeIds || []
    console.log('[Canvas] 整组执行', nodeIds)
    // TODO: 实现批量执行逻辑
    alert(`将执行编组内 ${nodeIds.length} 个节点的生成任务`)
  }
}

// 处理保存工作流
function handleSaveWorkflow() {
  const workflow = canvasStore.exportWorkflow()
  console.log('[Canvas] 保存工作流', workflow)
  // TODO: 实现保存工作流逻辑
  alert('工作流已保存（功能开发中）')
}

// ========== 图像工具栏事件处理 ==========
// 重绘（预留接口）
function handleImageRepaint(data) {
  console.log('[Canvas] 图像重绘', data)
  // TODO: 接入重绘API
  alert('重绘功能开发中，请稍后...')
}

// 擦除（预留接口）
function handleImageErase(data) {
  console.log('[Canvas] 图像擦除', data)
  // TODO: 接入擦除API
  alert('擦除功能开发中，请稍后...')
}

// 增强（预留接口）
function handleImageEnhance(data) {
  console.log('[Canvas] 图像增强', data)
  // TODO: 接入图像增强/超分辨率API
  alert('增强功能开发中，请稍后...')
}

// 抠图（预留接口）
function handleImageCutout(data) {
  console.log('[Canvas] 图像抠图', data)
  // TODO: 接入抠图/去背景API
  alert('抠图功能开发中，请稍后...')
}

// 扩图（预留接口）
function handleImageExpand(data) {
  console.log('[Canvas] 图像扩图', data)
  // TODO: 接入扩图/outpainting API
  alert('扩图功能开发中，请稍后...')
}

// 标注（预留接口）
function handleImageAnnotate(data) {
  console.log('[Canvas] 图像标注', data)
  // TODO: 打开标注工具
  alert('标注功能开发中，请稍后...')
}

// 裁剪（预留接口，可后续实现裁剪组件）
function handleImageCrop(data) {
  console.log('[Canvas] 图像裁剪', data)
  // TODO: 打开裁剪工具
  alert('裁剪功能开发中，请稍后...')
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

onMounted(async () => {
  await loadUserInfo()
  
  // 初始化默认标签
  canvasStore.initDefaultTab()
  
  // 启动历史工作流自动保存服务（localStorage 缓存）
  initHistoryAutoSave()
  
  // 监听页面关闭事件，保存工作流到历史
  window.addEventListener('beforeunload', handleBeforeUnload)
  
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
      alert('加载工作流失败：' + error.message)
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
  stopAutoSave()
  stopHistoryAutoSave()
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
    <div v-else class="canvas-container">
      <!-- 无限画布 - 使用 key 强制在就绪后重新挂载 -->
      <CanvasBoard :key="'canvas-board-' + canvasReady" @dblclick="handleCanvasDoubleClick" @pane-click="handlePaneClick" />
      
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
      
      <!-- 缩放控制 -->
      <div class="canvas-zoom-controls">
        <button class="canvas-zoom-btn" @click="() => {}">−</button>
        <span class="canvas-zoom-value">{{ Math.round(canvasStore.viewport.zoom * 100) }}%</span>
        <button class="canvas-zoom-btn" @click="() => {}">+</button>
      </div>
      
      <!-- 右上角控制区域 -->
      <div class="canvas-top-right-controls" :class="{ 'panel-open': showAIAssistant }">
        <!-- 语言切换 -->
        <LanguageSwitcher :isDark="true" direction="down" :compact="true" />
        
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
              <h4>🖱️ {{ t('canvas.mouseOperations') }}</h4>
              <ul>
                <li><kbd>{{ t('canvas.leftDrag') }}</kbd> {{ t('canvas.leftDragDesc') }}</li>
                <li><kbd>{{ t('canvas.rightClick') }}</kbd> {{ t('canvas.rightClickDesc') }}</li>
                <li><kbd>{{ t('canvas.ctrlDrag') }}</kbd> {{ t('canvas.ctrlDragDesc') }}</li>
                <li><kbd>{{ t('canvas.spaceDrag') }}</kbd> {{ t('canvas.spaceDragDesc') }}</li>
                <li><kbd>{{ t('canvas.leftClick') }}</kbd> {{ t('canvas.leftClickDesc') }}</li>
                <li><kbd>{{ t('canvas.doubleClickBlank') }}</kbd> {{ t('canvas.doubleClickBlankDesc') }}</li>
                <li><kbd>{{ t('canvas.scrollUp') }}</kbd> {{ t('canvas.scrollUpDesc') }}</li>
                <li><kbd>{{ t('canvas.scrollDown') }}</kbd> {{ t('canvas.scrollDownDesc') }}</li>
              </ul>
            </div>
            <div class="help-section">
              <h4>⌨️ {{ t('canvas.keyboardShortcuts') }}</h4>
              <ul>
                <li><kbd>Ctrl+Z</kbd> {{ t('canvas.undoShortcut') }}</li>
                <li><kbd>Ctrl+Y</kbd> {{ t('canvas.redoShortcut') }}</li>
                <li><kbd>Ctrl+C</kbd> {{ t('canvas.copyNode') }}</li>
                <li><kbd>Ctrl+V</kbd> {{ t('canvas.pasteNode') }}</li>
                <li><kbd>Ctrl+A</kbd> {{ t('canvas.selectAllNodes') }}</li>
                <li><kbd>Ctrl+G</kbd> {{ t('canvas.groupNodes') }}</li>
                <li><kbd>Delete</kbd> / <kbd>Backspace</kbd> {{ t('canvas.deleteSelected') }}</li>
                <li><kbd>Escape</kbd> {{ t('canvas.closeDialog') }}</li>
                <li><kbd>Ctrl+Enter</kbd> {{ t('canvas.startGenerate') }}</li>
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
      />
      
      <!-- 画布右键菜单（空白区域） -->
      <CanvasContextMenu
        v-if="canvasStore.isCanvasContextMenuOpen"
        :position="canvasStore.canvasContextMenuPosition"
        @close="canvasStore.closeCanvasContextMenu()"
        @upload="handleCanvasUpload"
        @add-node="handleCanvasAddNode"
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
        @saved="handleWorkflowSaved"
      />
      
      <!-- 工作流面板 -->
      <WorkflowPanel
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
        @close="closeOnboarding"
        @complete="handleOnboardingComplete"
      />

      <!-- AI 灵感助手面板 -->
      <AIAssistantPanel
        :visible="showAIAssistant"
        @close="showAIAssistant = false"
      />

      <!-- AI 助手触发按钮 - 苹果风格3D图标 -->
      <button
        class="ai-assistant-trigger"
        :class="{ active: showAIAssistant }"
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

/* 帮助弹窗 */
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
  background: #1e1e1e;
  border: 1px solid #3a3a3a;
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.canvas-help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #3a3a3a;
}

.canvas-help-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.canvas-help-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #888888;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.canvas-help-close:hover {
  background: #2a2a2a;
  color: #ffffff;
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
  color: rgba(255, 255, 255, 0.9);
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
  color: #cccccc;
  font-size: 14px;
  border-bottom: 1px solid #2a2a2a;
}

.help-section li:last-child {
  border-bottom: none;
}

.help-section kbd {
  display: inline-block;
  padding: 4px 10px;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  color: #ffffff;
  background: #333333;
  border: 1px solid #444444;
  border-radius: 6px;
  box-shadow: 0 2px 0 #222222;
}

.help-section strong {
  color: #ffffff;
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

/* 当 AI 面板打开时，右上角控制区域向左移动 */
.canvas-top-right-controls.panel-open {
  right: 444px; /* 面板宽度 420px + 24px 间距 */
}

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

/* 当 AI 面板打开时，按钮位置调整避免遮挡 */
.ai-assistant-trigger.active {
  right: 444px; /* 面板宽度 420px + 24px 间距 */
}


</style>

