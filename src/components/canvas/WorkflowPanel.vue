<script setup>
/**
 * WorkflowPanel.vue - 统一的工作流面板
 * 整合"我的工作流"和"工作流模板"，支持标签切换
 * 我的工作流现在分为：左边手动保存的工作流 | 右边历史记录工作流
 */
import { ref, watch, onMounted, computed, nextTick, onUnmounted } from 'vue'
import { getWorkflowList, deleteWorkflow, loadWorkflow, getStorageQuota, getWorkflowTemplates } from '@/api/canvas/workflow'
import { useCanvasStore } from '@/stores/canvas'
import { useI18n } from '@/i18n'
import { 
  getWorkflowHistory, 
  deleteWorkflowHistory, 
  clearWorkflowHistory,
  formatSaveTime 
} from '@/stores/canvas/workflowAutoSave'

const { t } = useI18n()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'load', 'new'])

const canvasStore = useCanvasStore()

// ========== 标签页状态 ==========
const activeTab = ref('my') // 'my' | 'templates'

// ========== 我的工作流数据 ==========
const workflows = ref([])
const loading = ref(false)
const quota = ref(null)
const searchQuery = ref('')
const selectedId = ref(null)
const isDragging = ref(false)

// ========== 历史工作流数据 ==========
const historyWorkflows = ref([])
const historyLoading = ref(false)
const selectedHistoryId = ref(null)

// ========== 工作流模板数据 ==========
const templates = ref([])
const templatesLoading = ref(false)
const selectedCategory = ref('all')

// ========== 缓存和延迟渲染 ==========
const workflowsCached = ref(false)
const templatesCached = ref(false)
const lastWorkflowsLoad = ref(0)
const lastTemplatesLoad = ref(0)
const CACHE_DURATION = 60000 // 缓存有效期 60 秒
const isContentReady = ref(false) // 延迟渲染标记

// 分类（使用computed以便响应语言切换）
const categories = computed(() => [
  { key: 'all', label: t('canvas.categories.all') },
  { key: 'basic', label: t('canvas.categories.basic') },
  { key: 'advanced', label: t('canvas.categories.advanced') },
  { key: 'video', label: t('canvas.categories.video') }
])

// 删除确认
const deleteConfirm = ref({
  visible: false,
  workflow: null,
  isHistory: false  // 是否是历史记录
})

// 清空历史确认
const clearHistoryConfirm = ref(false)

// ========== 计算属性 ==========

// 筛选后的工作流
const filteredWorkflows = computed(() => {
  if (!searchQuery.value.trim()) return workflows.value
  const query = searchQuery.value.toLowerCase()
  return workflows.value.filter(w => 
    w.name.toLowerCase().includes(query) || 
    (w.description && w.description.toLowerCase().includes(query))
  )
})

// 筛选后的历史工作流
const filteredHistoryWorkflows = computed(() => {
  if (!searchQuery.value.trim()) return historyWorkflows.value
  const query = searchQuery.value.toLowerCase()
  return historyWorkflows.value.filter(w => 
    w.name.toLowerCase().includes(query)
  )
})

// 筛选后的模板
const filteredTemplates = computed(() => {
  if (selectedCategory.value === 'all') {
    return templates.value
  }
  return templates.value.filter(t => t.category === selectedCategory.value)
})

// ========== 加载函数 ==========

// 加载我的工作流列表（带缓存）
async function loadWorkflows(forceRefresh = false) {
  const now = Date.now()
  
  // 如果有缓存且未过期，使用缓存
  if (!forceRefresh && workflowsCached.value && (now - lastWorkflowsLoad.value < CACHE_DURATION)) {
    console.log('[WorkflowPanel] 使用工作流缓存数据')
    // 仍然检查是否需要切换到模板标签
    if (workflows.value.length === 0 && historyWorkflows.value.length === 0 && activeTab.value === 'my') {
      activeTab.value = 'templates'
    }
    return
  }
  
  loading.value = true
  try {
    const result = await getWorkflowList({ page: 1, pageSize: 50 })
    workflows.value = result.list || []
    workflowsCached.value = true
    lastWorkflowsLoad.value = now
    
    // 如果我的工作流和历史记录都为空，自动切换到模板标签
    if (workflows.value.length === 0 && historyWorkflows.value.length === 0 && activeTab.value === 'my') {
      activeTab.value = 'templates'
    }
  } catch (error) {
    console.error('[WorkflowPanel] 加载失败:', error)
  } finally {
    loading.value = false
  }
}

// 加载历史工作流
function loadHistoryWorkflows() {
  historyLoading.value = true
  try {
    historyWorkflows.value = getWorkflowHistory()
  } catch (error) {
    console.error('[WorkflowPanel] 加载历史工作流失败:', error)
    historyWorkflows.value = []
  } finally {
    historyLoading.value = false
  }
}

// 加载配额
async function loadQuotaInfo() {
  try {
    const result = await getStorageQuota()
    quota.value = result.quota
  } catch (error) {
    console.error('[WorkflowPanel] 加载配额失败:', error)
  }
}

// 加载模板（带缓存）
async function loadTemplates(forceRefresh = false) {
  const now = Date.now()
  
  // 如果有缓存且未过期，使用缓存
  if (!forceRefresh && templatesCached.value && (now - lastTemplatesLoad.value < CACHE_DURATION)) {
    console.log('[WorkflowPanel] 使用模板缓存数据')
    return
  }
  
  templatesLoading.value = true
  try {
    const data = await getWorkflowTemplates()
    templates.value = data.templates || []
    templatesCached.value = true
    lastTemplatesLoad.value = now
  } catch (e) {
    console.error('加载模板失败:', e)
    templates.value = getBuiltinTemplates()
    templatesCached.value = true
    lastTemplatesLoad.value = now
  } finally {
    templatesLoading.value = false
  }
}

// 内置模板（离线可用）- 黑白灰简洁风格图标
function getBuiltinTemplates() {
  return [
    {
      id: 'tpl-quick-image',
      name: '快速出图',
      description: '文本直接生成图片',
      icon: '⬡',
      category: 'basic',
      nodes: [
        { id: 'n1', type: 'text-input', position: { x: 100, y: 200 }, data: { title: '输入提示词' } },
        { id: 'n2', type: 'text-to-image', position: { x: 400, y: 200 }, data: { title: '生成图片' } }
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }]
    },
    {
      id: 'tpl-prompt-enhance',
      name: '智能优化出图',
      description: 'AI 优化提示词后生成图片',
      icon: 'A+',
      category: 'advanced',
      nodes: [
        { id: 'n1', type: 'text-input', position: { x: 100, y: 200 }, data: { title: '输入想法' } },
        { id: 'n2', type: 'llm-prompt-enhance', position: { x: 350, y: 200 }, data: { title: '提示词优化', type: 'llm-prompt-enhance' } },
        { id: 'n3', type: 'text-to-image', position: { x: 600, y: 200 }, data: { title: '生成图片' } }
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }, { id: 'e2', source: 'n2', target: 'n3' }]
    },
    {
      id: 'tpl-image-to-video',
      name: '图片转视频',
      description: '上传图片生成视频',
      icon: '◈',
      category: 'video',
      nodes: [
        { id: 'n1', type: 'image-input', position: { x: 100, y: 200 }, data: { title: '上传图片' } },
        { id: 'n2', type: 'image-to-video', position: { x: 400, y: 200 }, data: { title: '生成视频' } }
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }]
    },
    {
      id: 'tpl-text-to-video',
      name: '文字生视频',
      description: '文本直接生成视频',
      icon: '▶',
      category: 'video',
      nodes: [
        { id: 'n1', type: 'text-input', position: { x: 100, y: 200 }, data: { title: '输入描述' } },
        { id: 'n2', type: 'text-to-video', position: { x: 400, y: 200 }, data: { title: '生成视频' } }
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }]
    },
    {
      id: 'tpl-style-transfer',
      name: '风格迁移',
      description: '图片反推提示词后重新生成',
      icon: '⟲',
      category: 'advanced',
      nodes: [
        { id: 'n1', type: 'image-input', position: { x: 100, y: 200 }, data: { title: '参考图片' } },
        { id: 'n2', type: 'llm-image-describe', position: { x: 350, y: 200 }, data: { title: '图片描述', type: 'llm-image-describe' } },
        { id: 'n3', type: 'text-to-image', position: { x: 600, y: 200 }, data: { title: '风格生成' } }
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }, { id: 'e2', source: 'n2', target: 'n3' }]
    }
  ]
}

// ========== 我的工作流操作 ==========

// 选择工作流
async function selectWorkflow(workflow) {
  selectedHistoryId.value = null  // 清除历史选中
  if (selectedId.value === workflow.id) {
    // 双击加载
    await handleLoadMyWorkflow(workflow)
  } else {
    selectedId.value = workflow.id
  }
}

// 加载我的工作流到画布（在新标签中打开）
async function handleLoadMyWorkflow(workflow) {
  try {
    loading.value = true
    const result = await loadWorkflow(workflow.id)
    
    if (result.workflow) {
      emit('load', result.workflow)
      emit('close')
    }
  } catch (error) {
    console.error('[WorkflowPanel] 加载工作流失败:', error)
    alert('加载失败：' + error.message)
  } finally {
    loading.value = false
  }
}

// 新建工作流
function handleNew() {
  canvasStore.clearCanvas()
  canvasStore.workflowMeta = null
  emit('new')
  emit('close')
}

// 确认删除
function confirmDelete(e, workflow, isHistory = false) {
  e.stopPropagation()
  deleteConfirm.value = { visible: true, workflow, isHistory }
}

// 取消删除
function cancelDelete() {
  deleteConfirm.value = { visible: false, workflow: null, isHistory: false }
}

// 执行删除
async function handleDelete() {
  if (!deleteConfirm.value.workflow) return
  
  try {
    if (deleteConfirm.value.isHistory) {
      // 删除历史记录
      deleteWorkflowHistory(deleteConfirm.value.workflow.id)
      loadHistoryWorkflows()
    } else {
      // 删除数据库工作流
      await deleteWorkflow(deleteConfirm.value.workflow.id)
      await loadWorkflows()
      await loadQuotaInfo()
    }
    cancelDelete()
  } catch (error) {
    console.error('[WorkflowPanel] 删除失败:', error)
    alert('删除失败：' + error.message)
  }
}

// ========== 历史工作流操作 ==========

// 选择历史工作流
function selectHistoryWorkflow(workflow) {
  selectedId.value = null  // 清除手动保存的选中
  if (selectedHistoryId.value === workflow.id) {
    // 双击加载
    handleLoadHistoryWorkflow(workflow)
  } else {
    selectedHistoryId.value = workflow.id
  }
}

// 加载历史工作流到画布
function handleLoadHistoryWorkflow(historyWorkflow) {
  try {
    // 构造工作流对象
    const workflow = {
      id: null, // 历史记录不是已保存的工作流
      name: historyWorkflow.name + ' (恢复)',
      nodes: JSON.parse(JSON.stringify(historyWorkflow.nodes)),
      edges: JSON.parse(JSON.stringify(historyWorkflow.edges)),
      viewport: historyWorkflow.viewport || { x: 0, y: 0, zoom: 1 }
    }
    
    emit('load', workflow)
    emit('close')
  } catch (error) {
    console.error('[WorkflowPanel] 恢复历史工作流失败:', error)
    alert('恢复失败：' + error.message)
  }
}

// 清空所有历史
function handleClearHistory() {
  clearWorkflowHistory()
  loadHistoryWorkflows()
  clearHistoryConfirm.value = false
}

// 开始拖拽工作流
function handleDragStart(e, workflow) {
  console.log('[WorkflowPanel] 开始拖拽工作流:', workflow.name, workflow.id)
  
  e.dataTransfer.setData('application/json', JSON.stringify({
    type: 'workflow-merge',
    workflowId: workflow.id,
    workflowName: workflow.name
  }))
  e.dataTransfer.effectAllowed = 'copy'
  
  setTimeout(() => {
    isDragging.value = true
    emit('close')
  }, 100)
}

// 拖拽历史工作流
function handleHistoryDragStart(e, workflow) {
  console.log('[WorkflowPanel] 开始拖拽历史工作流:', workflow.name)
  
  e.dataTransfer.setData('application/json', JSON.stringify({
    type: 'template-merge',
    template: {
      name: workflow.name,
      nodes: workflow.nodes,
      edges: workflow.edges
    }
  }))
  e.dataTransfer.effectAllowed = 'copy'
  
  setTimeout(() => {
    isDragging.value = true
    emit('close')
  }, 100)
}

// 结束拖拽
function handleDragEnd() {
  console.log('[WorkflowPanel] 拖拽结束')
  isDragging.value = false
}

// ========== 模板操作 ==========

// 应用模板（在新标签中打开）
function applyTemplate(template) {
  // 为节点生成新的唯一 ID
  const idMap = {}
  const newNodes = template.nodes.map(node => {
    const newId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    idMap[node.id] = newId
    return {
      ...node,
      id: newId,
      data: { ...node.data, status: 'idle' }
    }
  })
  
  // 更新连线的 source/target
  const newEdges = template.edges.map(edge => ({
    ...edge,
    id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    source: idMap[edge.source],
    target: idMap[edge.target]
  }))
  
  // 构造工作流对象
  const workflow = {
    id: null, // 模板不是已保存的工作流
    name: template.name,
    nodes: newNodes,
    edges: newEdges,
    viewport: { x: 0, y: 0, zoom: 1 }
  }
  
  // 触发加载事件
  emit('load', workflow)
  emit('close')
}

// 拖拽模板
function handleTemplateDragStart(e, template) {
  console.log('[WorkflowPanel] 开始拖拽模板:', template.name)
  
  // 为节点生成新的唯一 ID
  const idMap = {}
  const newNodes = template.nodes.map(node => {
    const newId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    idMap[node.id] = newId
    return {
      ...node,
      id: newId,
      data: { ...node.data, status: 'idle' }
    }
  })
  
  const newEdges = template.edges.map(edge => ({
    ...edge,
    id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    source: idMap[edge.source],
    target: idMap[edge.target]
  }))
  
  e.dataTransfer.setData('application/json', JSON.stringify({
    type: 'template-merge',
    template: {
      name: template.name,
      nodes: newNodes,
      edges: newEdges
    }
  }))
  e.dataTransfer.effectAllowed = 'copy'
  
  setTimeout(() => {
    isDragging.value = true
    emit('close')
  }, 100)
}

// ========== 工具函数 ==========

// 格式化时间
function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  const now = new Date()
  const diff = now - d
  
  if (diff < 60000) return t('time.justNow')
  if (diff < 3600000) return t('time.minutesAgo', { 0: Math.floor(diff / 60000) })
  if (diff < 86400000) return t('time.hoursAgo', { 0: Math.floor(diff / 3600000) })
  if (diff < 604800000) return t('time.daysAgo', { 0: Math.floor(diff / 86400000) })
  
  return d.toLocaleDateString()
}

// ========== 生命周期 ==========

// 监听显示状态
watch(() => props.visible, async (visible) => {
  if (visible) {
    // 重置选择状态（但保持 tab 和 filter 状态）
    selectedId.value = null
    selectedHistoryId.value = null
    
    // 延迟渲染内容，让面板动画先完成
    isContentReady.value = false
    
    // 并行加载数据
    Promise.all([
      loadWorkflows(),
      loadQuotaInfo(),
      loadTemplates()
    ])
    
    // 加载历史工作流
    loadHistoryWorkflows()
    
    // 等待面板动画完成后再渲染内容
    await nextTick()
    setTimeout(() => {
      isContentReady.value = true
    }, 280)
  } else {
    isContentReady.value = false
  }
})

// 键盘事件
function handleKeydown(e) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// 🔧 新增：强制刷新工作流列表（供父组件调用）
function forceRefresh() {
  console.log('[WorkflowPanel] 强制刷新工作流列表')
  loadWorkflows(true) // 传入true强制刷新，忽略缓存
}

// 暴露方法给父组件
defineExpose({
  forceRefresh
})
</script>

<template>
  <Transition name="panel">
    <div
      v-if="visible"
      class="workflow-panel-container"
      :class="{ 'is-dragging': isDragging }"
    >
      <div class="workflow-panel">
        <!-- 头部 -->
        <div class="panel-header">
          <div class="header-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="6" height="6" rx="1"/>
              <rect x="9" y="14" width="6" height="6" rx="1"/>
              <rect x="16" y="4" width="6" height="6" rx="1"/>
              <path d="M5 10 L5 12 L12 12 L12 14"/>
              <path d="M19 10 L19 12 L12 12"/>
            </svg>
            <span>{{ t('canvas.workflow') }}</span>
          </div>
          <button class="close-btn" @click="$emit('close')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        
        <!-- 标签页切换 -->
        <div class="panel-tabs">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'my' }"
            @click="activeTab = 'my'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            {{ t('canvas.myWorkflows') }}
            <span v-if="workflows.length > 0 || historyWorkflows.length > 0" class="tab-count">
              {{ workflows.length + historyWorkflows.length }}
            </span>
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'templates' }"
            @click="activeTab = 'templates'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            {{ t('canvas.workflowTemplates') }}
          </button>
        </div>
        
        <!-- 我的工作流内容 -->
        <template v-if="activeTab === 'my'">
          <!-- 工具栏 -->
          <div class="panel-toolbar">
            <div class="search-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input 
                v-model="searchQuery"
                type="text" 
                :placeholder="t('canvas.searchWorkflow')"
                class="search-input"
              />
            </div>
            <button class="new-btn" @click="handleNew">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {{ t('canvas.new') }}
            </button>
          </div>
          
          <!-- 配额信息 -->
          <div v-if="quota" class="quota-bar">
            <div class="quota-info">
              <span class="quota-used">{{ quota.current_workflows }}</span>
              <span class="quota-total">/ {{ quota.max_workflows }} {{ t('canvas.workflow') }}</span>
            </div>
            <div class="quota-progress">
              <div 
                class="quota-fill"
                :style="{ width: `${(quota.current_workflows / quota.max_workflows) * 100}%` }"
              ></div>
            </div>
          </div>
          
          <!-- 双列工作流列表 -->
          <div class="panel-content two-columns">
            <!-- 左侧：手动保存的工作流 -->
            <div class="column saved-column">
              <div class="column-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                <span>{{ t('canvas.savedWorkflows') }}</span>
                <span class="column-count">{{ workflows.length }}</span>
              </div>
              
              <div class="column-content">
                <div v-if="loading && workflows.length === 0" class="loading-state">
                  <div class="spinner"></div>
                </div>
                
                <div v-else-if="filteredWorkflows.length === 0" class="empty-state small">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  <p>{{ searchQuery ? t('canvas.noMatchingWorkflows') : t('canvas.noSavedWorkflows') }}</p>
                </div>
                
                <div v-else class="workflow-list">
                  <div
                    v-for="workflow in filteredWorkflows"
                    :key="workflow.id"
                    class="workflow-item"
                    :class="{ selected: selectedId === workflow.id }"
                    draggable="true"
                    @click="selectWorkflow(workflow)"
                    @dblclick="handleLoadMyWorkflow(workflow)"
                    @dragstart="handleDragStart($event, workflow)"
                    @dragend="handleDragEnd"
                  >
                    <div class="item-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="6" height="6" rx="1"/>
                        <rect x="15" y="3" width="6" height="6" rx="1"/>
                        <rect x="9" y="15" width="6" height="6" rx="1"/>
                        <path d="M6 9v3h3M18 9v3h-3M12 15v-3"/>
                      </svg>
                    </div>
                    
                    <div class="item-info">
                      <div class="item-name">{{ workflow.name }}</div>
                      <div class="item-meta">
                        <span>{{ workflow.node_count }} {{ t('canvas.nodeLabel') }}</span>
                        <span>·</span>
                        <span>{{ formatDate(workflow.updated_at) }}</span>
                      </div>
                    </div>
                    
                    <div class="item-actions">
                      <button 
                        class="action-btn load-btn" 
                        @click.stop="handleLoadMyWorkflow(workflow)"
                        :title="t('canvas.open')"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </button>
                      <button 
                        class="action-btn delete-btn" 
                        @click.stop="confirmDelete($event, workflow, false)"
                        :title="t('common.delete')"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 右侧：历史记录工作流 -->
            <div class="column history-column">
              <div class="column-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>{{ t('canvas.historyWorkflows') }}</span>
                <span class="column-count">{{ historyWorkflows.length }}</span>
                <button 
                  v-if="historyWorkflows.length > 0"
                  class="clear-history-btn"
                  @click="clearHistoryConfirm = true"
                  :title="t('canvas.clearHistory')"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
              
              <div class="column-content">
                <div v-if="historyLoading && historyWorkflows.length === 0" class="loading-state">
                  <div class="spinner"></div>
                </div>
                
                <div v-else-if="filteredHistoryWorkflows.length === 0" class="empty-state small">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <p>{{ t('canvas.noHistoryWorkflows') }}</p>
                  <p class="empty-hint">{{ t('canvas.historyAutoSaveHint') }}</p>
                </div>
                
                <div v-else class="workflow-list">
                  <div
                    v-for="workflow in filteredHistoryWorkflows"
                    :key="workflow.id"
                    class="workflow-item history-item"
                    :class="{ selected: selectedHistoryId === workflow.id }"
                    draggable="true"
                    @click="selectHistoryWorkflow(workflow)"
                    @dblclick="handleLoadHistoryWorkflow(workflow)"
                    @dragstart="handleHistoryDragStart($event, workflow)"
                    @dragend="handleDragEnd"
                  >
                    <div class="item-icon history-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </div>
                    
                    <div class="item-info">
                      <div class="item-name">{{ workflow.name }}</div>
                      <div class="item-meta">
                        <span>{{ workflow.nodeCount }} {{ t('canvas.nodeLabel') }}</span>
                        <span>·</span>
                        <span>{{ formatSaveTime(workflow.savedAt) }}</span>
                      </div>
                    </div>
                    
                    <div class="item-actions">
                      <button 
                        class="action-btn load-btn" 
                        @click.stop="handleLoadHistoryWorkflow(workflow)"
                        :title="t('canvas.restore')"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                          <path d="M3 3v5h5"/>
                        </svg>
                      </button>
                      <button 
                        class="action-btn delete-btn" 
                        @click.stop="confirmDelete($event, workflow, true)"
                        :title="t('common.delete')"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
        
        <!-- 工作流模板内容 -->
        <template v-else>
          <!-- 分类筛选 -->
          <div class="category-bar">
            <button 
              v-for="cat in categories" 
              :key="cat.key"
              class="category-btn"
              :class="{ active: selectedCategory === cat.key }"
              @click="selectedCategory = cat.key"
            >
              {{ cat.label }}
            </button>
          </div>
          
          <!-- 模板列表 -->
          <div class="panel-content templates-grid">
            <div v-if="templatesLoading" class="loading-state">
              <div class="spinner"></div>
            </div>
            
            <div v-else-if="filteredTemplates.length === 0" class="empty-state">
              <p>{{ t('canvas.noTemplates') }}</p>
            </div>
            
            <div 
              v-else
              v-for="template in filteredTemplates" 
              :key="template.id"
              class="template-card"
              draggable="true"
              @click="applyTemplate(template)"
              @dragstart="handleTemplateDragStart($event, template)"
              @dragend="handleDragEnd"
            >
              <div class="template-icon">{{ template.icon || '◇' }}</div>
              <div class="template-info">
                <div class="template-name">{{ template.name }}</div>
                <div class="template-desc">{{ template.description }}</div>
                <div class="template-meta">
                  <span class="node-count">{{ template.nodes?.length || 0 }} {{ t('canvas.nodeLabel') }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
        
        <!-- 底部提示 -->
        <div class="panel-footer">
          <span class="tip">{{ t('canvas.doubleClickOpenDragMerge') }}</span>
        </div>
        
        <!-- 删除确认 -->
        <Transition name="fade">
          <div v-if="deleteConfirm.visible" class="delete-modal" @click.self="cancelDelete">
            <div class="delete-dialog">
              <p>{{ t('canvas.deleteConfirm', { name: deleteConfirm.workflow?.name }) }}</p>
              <div class="delete-actions">
                <button class="btn-cancel" @click="cancelDelete">{{ t('common.cancel') }}</button>
                <button class="btn-confirm" @click="handleDelete">{{ t('common.delete') }}</button>
              </div>
            </div>
          </div>
        </Transition>
        
        <!-- 清空历史确认 -->
        <Transition name="fade">
          <div v-if="clearHistoryConfirm" class="delete-modal" @click.self="clearHistoryConfirm = false">
            <div class="delete-dialog">
              <p>{{ t('canvas.clearHistoryConfirm') }}</p>
              <div class="delete-actions">
                <button class="btn-cancel" @click="clearHistoryConfirm = false">{{ t('common.cancel') }}</button>
                <button class="btn-confirm" @click="handleClearHistory">{{ t('canvas.clearAll') }}</button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 侧边栏容器 - 不阻挡拖拽，没有遮罩 */
.workflow-panel-container {
  position: fixed;
  top: 60px;
  left: 90px;
  bottom: 60px;
  z-index: 200;
  pointer-events: none; /* 让拖拽可以穿透到画布 */
}

.workflow-panel-container.is-dragging {
  pointer-events: none;
}

.workflow-panel-container.is-dragging .workflow-panel {
  pointer-events: auto;
}

/* 面板 - 更宽以容纳双列 */
.workflow-panel {
  width: 680px;
  max-height: calc(100vh - 120px);
  height: 100%;
  background: rgba(20, 20, 20, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  pointer-events: auto; /* 面板本身可以接收事件 */
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.header-title svg {
  opacity: 0.7;
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
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 标签页 */
.panel-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.tab-btn svg {
  opacity: 0.7;
}

.tab-btn.active svg {
  opacity: 1;
}

.tab-count {
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.tab-btn.active .tab-count {
  background: rgba(255, 255, 255, 0.2);
}

/* 工具栏 */
.panel-toolbar {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.search-box svg {
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

.new-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #fff;
  border: none;
  border-radius: 8px;
  color: #0a0a0a;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.new-btn:hover {
  background: rgba(255, 255, 255, 0.9);
}

/* 配额 */
.quota-bar {
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.quota-info {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 6px;
}

.quota-used {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.quota-total {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.quota-progress {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.quota-fill {
  height: 100%;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 2px;
  transition: width 0.3s;
}

/* 分类筛选 */
.category-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.category-btn {
  padding: 6px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.category-btn:hover {
  border-color: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.category-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

/* 内容区 - 双列布局 */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.panel-content.two-columns {
  display: flex;
  gap: 12px;
  padding: 12px;
}

.column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  overflow: hidden;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

.column-header svg {
  opacity: 0.6;
}

.column-count {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
}

.clear-history-btn {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.15s;
  margin-left: 4px;
}

.clear-history-btn:hover {
  background: rgba(255, 100, 100, 0.15);
  color: #ff6b6b;
}

.column-content {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.column-content::-webkit-scrollbar {
  width: 4px;
}

.column-content::-webkit-scrollbar-track {
  background: transparent;
}

.column-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* 加载状态 */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
}

.empty-state.small {
  padding: 24px 12px;
}

.empty-state.small svg {
  margin-bottom: 12px;
}

.empty-state.small p {
  font-size: 12px;
}

.empty-state svg {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 11px !important;
  color: rgba(255, 255, 255, 0.25);
}

.switch-tab-btn {
  margin-top: 16px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.switch-tab-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* 工作流列表 */
.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workflow-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.workflow-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.workflow-item.selected {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

.workflow-item.history-item {
  border-left: 2px solid rgba(59, 130, 246, 0.3);
}

.workflow-item.history-item.selected {
  border-left-color: #3b82f6;
}

.item-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.item-icon.history-icon {
  background: rgba(59, 130, 246, 0.15);
  color: rgba(59, 130, 246, 0.8);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 2px;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.workflow-item:hover .item-actions,
.workflow-item.selected .item-actions {
  opacity: 1;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
}

.load-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.delete-btn:hover {
  background: rgba(255, 100, 100, 0.15);
  color: #ff6b6b;
}

/* 模板网格 */
.templates-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 12px;
}

.template-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-card:hover {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
}

.template-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.template-info {
  flex: 1;
  min-width: 0;
}

.template-name {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  margin-bottom: 4px;
}

.template-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
  line-height: 1.4;
}

.template-meta {
  display: flex;
  gap: 12px;
}

.node-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
}

/* 底部 */
.panel-footer {
  padding: 10px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}

.tip {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

/* 删除确认弹窗 */
.delete-modal {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
}

.delete-dialog {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  max-width: 280px;
  text-align: center;
}

.delete-dialog p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 16px;
  line-height: 1.5;
}

.delete-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.btn-cancel,
.btn-confirm {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-confirm {
  background: #ef4444;
  border: none;
  color: #fff;
}

.btn-confirm:hover {
  background: #dc2626;
}

/* 动画 */
.panel-enter-active,
.panel-leave-active {
  transition: all 0.25s ease;
}

.panel-enter-active .workflow-panel,
.panel-leave-active .workflow-panel {
  transition: all 0.25s ease;
}

.panel-enter-from .workflow-panel,
.panel-leave-to .workflow-panel {
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
@media (max-width: 800px) {
  .workflow-panel-container {
    left: 20px;
    right: 20px;
    top: 20px;
    bottom: 20px;
  }

  .workflow-panel {
    width: 100%;
    max-width: 680px;
    max-height: calc(100vh - 40px);
  }

  .panel-content.two-columns {
    flex-direction: column;
  }

  .column {
    max-height: 250px;
  }
}

@media (max-width: 640px) {
  .workflow-panel {
    max-width: 100%;
  }
}
</style>
