<script setup>
/**
 * WorkflowPanel.vue - 统一的工作流面板
 * 整合"我的工作流"和"工作流模板"，支持标签切换
 * 我的工作流现在分为：左边手动保存的工作流 | 右边历史记录工作流
 */
import { ref, watch, onMounted, computed, nextTick, onUnmounted } from 'vue'
import { getWorkflowList, deleteWorkflow, loadWorkflow, saveWorkflow, renameWorkflow, getStorageQuota, getWorkflowTemplates } from '@/api/canvas/workflow'
import { useCanvasStore } from '@/stores/canvas'
import { useI18n } from '@/i18n'
import {
  getWorkflowHistory,
  deleteWorkflowHistory,
  clearWorkflowHistory,
  formatBeijingSaveTime,
  updateWorkflowHistoryDescription
} from '@/stores/canvas/workflowAutoSave'
import { useTeamStore } from '@/stores/team'
import { getProjectList, updateProject, createProject, moveWorkflowToProject } from '@/api/canvas/project'
import SpaceSwitcher from './SpaceSwitcher.vue'
import MoveResourceDialog from './MoveResourceDialog.vue'
import {
  setCanvasSpaceFilterFromGlobal,
  syncGlobalSpaceFromFilter,
  useCanvasSpaceFilter
} from './spaceFilterState'

const { t } = useI18n()
const teamStore = useTeamStore()

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'load', 'new'])

const canvasStore = useCanvasStore()

// ========== 标签页状态 ==========
const activeTab = ref('my') // 'my' | 'templates'

// ========== 我的工作流数据 ==========
const workflows = ref([])
const workflowsTotal = ref(0)
const projects = ref([])
const loading = ref(false)
const quota = ref(null)
const searchQuery = ref('')
const selectedId = ref(null)
const isDragging = ref(false)
const draggingWorkflow = ref(null)
const dragOverProjectId = ref(null)
const contextMenu = ref({ visible: false, x: 0, y: 0, workflow: null, type: null })
const contextMenuEl = ref(null)
const spaceFilter = useCanvasSpaceFilter(teamStore) // 空间筛选: 'personal' | 'team-xxx' | 'all'

// ========== 历史工作流数据 ==========
const historyWorkflows = ref([])
const historyLoading = ref(false)
const selectedHistoryId = ref(null)
const savedDescriptionSaveTimers = new Map()
const loadedWorkflowCache = new Map()
let workflowSelectionClickTimer = null
let workflowListLoadToken = 0

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
const WORKFLOW_LIST_PAGE_SIZE = 500 // 元数据列表不包含节点详情，可用大页减少面板打开时的请求数
const WORKFLOW_BACKGROUND_PAGE_CONCURRENCY = 2 // 后台补齐分页限流，避免打开面板时打爆接口
const isContentReady = ref(false) // 延迟渲染标记

// 团队空间实时同步
const TEAM_SYNC_INTERVAL = 10000 // 团队空间同步间隔 10 秒
let teamSyncTimer = null
const lastSyncId = ref(null) // 记录最新工作流的ID

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

// ========== 项目目录树 ==========
const expandedProjects = ref(new Set())

// 重命名状态
const renamingProject = ref(null)
const renameInput = ref('')
const renamingWorkflowId = ref(null)
const workflowRenameInput = ref('')
const workflowRenameSaving = ref(false)

// 删除确认状态
const deleteProjectConfirm = ref({ visible: false, group: null, inputName: '' })
const moveResourceDialog = ref(false)
const moveResourceTarget = ref({ type: 'workflow', operation: 'move', id: '', name: '', workflowCount: 0, spaceType: 'personal', teamId: '', projectId: '', sourceRole: '', isDefault: false })

function getProjectKey(group) {
  return group.id || '__uncategorized__'
}

function toggleProject(projectId) {
  if (renamingProject.value) return
  const key = projectId || '__uncategorized__'
  const newSet = new Set(expandedProjects.value)
  if (newSet.has(key)) {
    newSet.delete(key)
  } else {
    newSet.add(key)
  }
  expandedProjects.value = newSet
}

function isProjectExpanded(projectId) {
  return expandedProjects.value.has(projectId || '__uncategorized__')
}

function startRenameProject(group) {
  renamingProject.value = getProjectKey(group)
  renameInput.value = group.id ? group.name : ''
  nextTick(() => {
    const input = document.querySelector('.folder-rename-input')
    if (input) {
      input.focus()
      input.select()
    }
  })
}

async function confirmRenameProject(group) {
  const newName = renameInput.value.trim()
  if (!newName) {
    cancelRenameProject()
    return
  }

  try {
    if (group.id) {
      await updateProject(group.id, { name: newName })
    } else {
      const teamStore2 = useTeamStore()
      const result = await createProject({
        name: newName,
        spaceType: teamStore2.globalSpaceType.value,
        teamId: teamStore2.globalTeamId.value
      })
      const newProjectId = result.data.id
      for (const w of group.workflows) {
        await moveWorkflowToProject(w.id, newProjectId)
      }
    }
    renamingProject.value = null
    renameInput.value = ''
    workflowsCached.value = false
    await loadWorkflows(true)
  } catch (e) {
    console.error('[WorkflowPanel] 重命名项目失败:', e)
    alert('操作失败：' + e.message)
  }
}

function cancelRenameProject() {
  renamingProject.value = null
  renameInput.value = ''
}

// 删除项目
function showDeleteProject(e, group) {
  e.stopPropagation()
  deleteProjectConfirm.value = { visible: true, group, inputName: '' }
}

async function handleDeleteProject() {
  const { group, inputName } = deleteProjectConfirm.value
  if (!group || !group.id) return
  if (inputName.trim() !== group.name.trim()) return

  try {
    const { deleteProject } = await import('@/api/canvas/project')
    await deleteProject(group.id)
    deleteProjectConfirm.value = { visible: false, group: null, inputName: '' }
    workflowsCached.value = false
    await loadWorkflows(true)
  } catch (e) {
    console.error('[WorkflowPanel] 删除项目失败:', e)
    alert('删除失败：' + e.message)
  }
}

function cancelDeleteProject() {
  deleteProjectConfirm.value = { visible: false, group: null, inputName: '' }
}

function getTeamRole(teamId) {
  return teamStore.myTeams.value.find(team => String(team.id) === String(teamId))?.my_role || ''
}

function openMoveResource(resource, type, operation = 'move') {
  moveResourceTarget.value = {
    type,
    operation,
    id: resource.id,
    name: resource.name,
    workflowCount: Number(resource.workflows?.length || resource.workflow_count || 0),
    spaceType: resource.space_type || (teamStore.globalSpaceType.value === 'team' ? 'team' : 'personal'),
    teamId: resource.team_id || teamStore.globalTeamId.value || '',
    projectId: type === 'workflow' ? (resource.project_id || '') : '',
    sourceRole: getTeamRole(resource.team_id || teamStore.globalTeamId.value),
    isDefault: !!(resource.is_default || resource.isDefault)
  }
  moveResourceDialog.value = true
}

async function handleResourceMoved() {
  moveResourceDialog.value = false
  workflowsCached.value = false
  await loadWorkflows(true)
}

// ========== 计算属性 ==========

function matchesWorkflowSearch(workflow, rawQuery) {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return true

  return [
    workflow.name,
    workflow.description,
    workflow.id,
    workflow.workflow_uid,
    workflow.workflowId,
    workflow.workflowUid
  ].some(value => String(value ?? '').toLowerCase().includes(query))
}

// 筛选后的工作流
const filteredWorkflows = computed(() => {
  return workflows.value.filter(workflow => matchesWorkflowSearch(workflow, searchQuery.value))
})

// 找到默认项目
const defaultProject = computed(() => {
  return projects.value.find(p => p.is_default) || null
})

// 按项目分组的工作流目录树
const projectTree = computed(() => {
  const groups = new Map()
  const defProj = defaultProject.value

  // 先基于项目列表创建所有项目组（即使暂时没有工作流）
  for (const p of projects.value) {
    groups.set(p.id, {
      id: p.id,
      name: p.name,
      isDefault: !!p.is_default,
      is_default: !!p.is_default,
      space_type: p.space_type,
      team_id: p.team_id,
      workflow_count: p.workflow_count,
      workflows: []
    })
  }

  // 将工作流分配到对应项目组
  for (const w of filteredWorkflows.value) {
    let key = w.project_id
    // project_id 为 null 的归入默认项目
    if (!key && defProj) {
      key = defProj.id
    }

    if (key && groups.has(key)) {
      groups.get(key).workflows.push(w)
    } else {
      // 无项目且无默认项目，归入未分类
      if (!groups.has('__uncategorized__')) {
        groups.set('__uncategorized__', {
          id: null,
          name: '未分类',
          isDefault: false,
          workflows: []
        })
      }
      groups.get('__uncategorized__').workflows.push(w)
    }
  }

  const result = []
  const sorted = [...groups.entries()].sort((a, b) => {
    // 默认项目排第一
    if (a[1].isDefault) return -1
    if (b[1].isDefault) return 1
    // 未分类排最后
    if (a[0] === '__uncategorized__') return 1
    if (b[0] === '__uncategorized__') return -1
    return a[1].name.localeCompare(b[1].name)
  })

  for (const [, group] of sorted) {
    result.push(group)
  }

  return result
})

// 首次加载或项目变化时自动展开所有文件夹
let hasInitialExpanded = false
watch(projectTree, (newTree) => {
  if (!hasInitialExpanded && newTree.length > 0) {
    hasInitialExpanded = true
    const newSet = new Set()
    for (const g of newTree) {
      newSet.add(g.id || '__uncategorized__')
    }
    expandedProjects.value = newSet
  }
}, { immediate: true })

// 筛选后的历史工作流
const filteredHistoryWorkflows = computed(() => {
  return historyWorkflows.value.filter(workflow => matchesWorkflowSearch(workflow, searchQuery.value))
})

// 筛选后的模板
const filteredTemplates = computed(() => {
  if (selectedCategory.value === 'all') {
    return templates.value
  }
  return templates.value.filter(t => t.category === selectedCategory.value)
})

// ========== 加载函数 ==========

async function loadRemainingWorkflowPages({ token, firstPageList, totalPages, pageSize, spaceParams }) {
  if (totalPages <= 1) return
  try {
    const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2)
    const mergedWorkflows = [...firstPageList]
    for (let index = 0; index < pageNumbers.length; index += WORKFLOW_BACKGROUND_PAGE_CONCURRENCY) {
      const pageBatch = pageNumbers.slice(index, index + WORKFLOW_BACKGROUND_PAGE_CONCURRENCY)
      const pageResults = await Promise.all(
        pageBatch.map(page => getWorkflowList({ page, pageSize, ...spaceParams }))
      )
      if (token !== workflowListLoadToken) return
      mergedWorkflows.push(...pageResults.flatMap(result => result.list || []))
      workflows.value = mergedWorkflows
    }
    workflowsCached.value = true
    console.log('[WorkflowPanel] 后台补齐工作流:', workflows.value.length, '个')
  } catch (error) {
    console.error('[WorkflowPanel] 后台补齐工作流失败:', error)
  }
}

async function loadWorkflowProjects({ token, spaceParams }) {
  try {
    const projResult = await getProjectList({
      spaceType: spaceParams.spaceType,
      teamId: spaceParams.teamId
    }).catch(() => ({ data: [] }))
    if (token !== workflowListLoadToken) return
    projects.value = projResult.data || []
    console.log('[WorkflowPanel] 加载项目:', projects.value.length, '个')
  } catch (error) {
    console.error('[WorkflowPanel] 加载项目失败:', error)
  }
}

// 加载我的工作流列表（带缓存）
async function loadWorkflows(forceRefresh = false) {
  const now = Date.now()
  const loadToken = ++workflowListLoadToken

  // 如果有缓存且未过期，使用缓存（但空间切换时需要强制刷新）
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
    const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
    const pageSize = WORKFLOW_LIST_PAGE_SIZE
    const wfResult = await getWorkflowList({ page: 1, pageSize, ...spaceParams })
    if (loadToken !== workflowListLoadToken) return
    const firstPageList = wfResult.list || []
    const total = Number(wfResult.pagination?.total ?? firstPageList.length)
    const totalPages = Math.ceil(total / pageSize)
    workflows.value = firstPageList
    workflowsTotal.value = total
    workflowsCached.value = true
    lastWorkflowsLoad.value = now
    console.log('[WorkflowPanel] 加载工作流:', workflows.value.length, '个')

    loadWorkflowProjects({
      token: loadToken,
      spaceParams
    })
    loadRemainingWorkflowPages({
      token: loadToken,
      firstPageList,
      totalPages,
      pageSize,
      spaceParams
    })

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

/**
 * 团队空间实时同步 - 检查是否有新数据
 */
async function checkTeamSync() {
  // 仅在团队空间且面板可见时同步
  if (!teamStore.isInTeamSpace.value || !props.visible) return

  // 仅在筛选团队空间时同步
  if (!spaceFilter.value.startsWith('team-')) return

  // 仅在"我的工作流"标签页时同步
  if (activeTab.value !== 'my') return

  try {
    const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
    const result = await getWorkflowList({ page: 1, pageSize: 1, ...spaceParams })
    const latestWorkflow = result.list?.[0]

    if (latestWorkflow) {
      // 如果有新数据（ID不同或首次同步）
      if (lastSyncId.value !== null && lastSyncId.value !== latestWorkflow.id) {
        console.log('[WorkflowPanel] 检测到新数据，自动刷新')
        workflowsCached.value = false
        await loadWorkflows(true)
      }
      lastSyncId.value = latestWorkflow.id
    }
  } catch (error) {
    console.error('[WorkflowPanel] 团队同步检查失败:', error)
  }
}

/**
 * 启动团队空间实时同步
 */
function startTeamSync() {
  stopTeamSync()
  if (teamStore.isInTeamSpace.value && props.visible) {
    // 记录当前最新ID
    if (workflows.value.length > 0) {
      lastSyncId.value = workflows.value[0].id
    }
    teamSyncTimer = setInterval(checkTeamSync, TEAM_SYNC_INTERVAL)
    console.log('[WorkflowPanel] 启动团队空间实时同步')
  }
}

/**
 * 停止团队空间实时同步
 */
function stopTeamSync() {
  if (teamSyncTimer) {
    clearInterval(teamSyncTimer)
    teamSyncTimer = null
    console.log('[WorkflowPanel] 停止团队空间实时同步')
  }
}

function clearSavedDescriptionTimers() {
  for (const timer of savedDescriptionSaveTimers.values()) {
    clearTimeout(timer)
  }
  savedDescriptionSaveTimers.clear()
}

async function handleSpaceChange(newSpace) {
  await syncGlobalSpaceFromFilter(teamStore, newSpace)
}

function refreshForSpaceChange(newSpace) {
  workflowsCached.value = false
  hasInitialExpanded = false
  if (props.visible) {
    loadWorkflows(true)
  }

  // 重新评估是否需要同步
  if (newSpace.startsWith('team-')) {
    startTeamSync()
  } else {
    stopTeamSync()
  }
}

// 监听团队空间状态变化，控制同步
watch(() => teamStore.isInTeamSpace.value, (isTeam) => {
  if (isTeam && props.visible && spaceFilter.value.startsWith('team-')) {
    startTeamSync()
  } else {
    stopTeamSync()
  }
})

watch(spaceFilter, (newFilter) => {
  refreshForSpaceChange(newFilter)
})

// 全局空间切换时，自动同步面板的 spaceFilter 并刷新数据
watch([() => teamStore.globalSpaceType.value, () => teamStore.globalTeamId.value], () => {
  setCanvasSpaceFilterFromGlobal(teamStore)
})

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

function toggleWorkflow(workflow) {
  selectedHistoryId.value = null
  selectedId.value = selectedId.value === workflow.id ? null : workflow.id
}

function clearWorkflowSelectionClickTimer() {
  if (workflowSelectionClickTimer) {
    clearTimeout(workflowSelectionClickTimer)
    workflowSelectionClickTimer = null
  }
}

function handleWorkflowClick(workflow) {
  clearWorkflowSelectionClickTimer()
  workflowSelectionClickTimer = setTimeout(() => {
    workflowSelectionClickTimer = null
    toggleWorkflow(workflow)
  }, 200)
}

function clearSelectedWorkflowDetails() {
  clearWorkflowSelectionClickTimer()
  selectedId.value = null
  selectedHistoryId.value = null
  closeWorkflowContextMenu()
}

function closeWorkflowContextMenu() {
  contextMenu.value = { visible: false, x: 0, y: 0, workflow: null, type: null }
}

function handleWorkflowContextMenu(event, workflow, type) {
  clearWorkflowSelectionClickTimer()
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    workflow,
    type
  }

  nextTick(() => {
    if (!contextMenuEl.value) return
    const margin = 8
    const menuWidth = contextMenuEl.value.offsetWidth
    const menuHeight = contextMenuEl.value.offsetHeight
    contextMenu.value.x = Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin))
    contextMenu.value.y = Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin))
  })
}

function handleWorkflowContextAction(action) {
  const { workflow, type } = contextMenu.value
  closeWorkflowContextMenu()
  if (!workflow) return

  if (action === 'load') {
    if (type === 'history') {
      handleLoadHistoryWorkflow(workflow)
    } else {
      handleLoadMyWorkflow(workflow)
    }
    return
  }

  if (action === 'rename' && type === 'saved') {
    handleRenameWorkflow(workflow)
    return
  }

  if (type !== 'saved') return
  if (action === 'move') {
    openMoveResource(workflow, 'workflow')
  } else if (action === 'copy') {
    openMoveResource(workflow, 'workflow', 'copy')
  } else if (action === 'copy-uid' && workflow.workflow_uid) {
    copyWorkflowUid(workflow.workflow_uid)
  }
}

function handleRenameWorkflow(workflow) {
  if (!workflow?.id || workflowRenameSaving.value) return
  renamingWorkflowId.value = workflow.id
  workflowRenameInput.value = workflow.name || ''
  nextTick(() => {
    const input = document.querySelector('.workflow-rename-input')
    if (input) {
      input.focus()
      input.select()
    }
  })
}

function cancelRenameWorkflow() {
  renamingWorkflowId.value = null
  workflowRenameInput.value = ''
  workflowRenameSaving.value = false
}

function handleWorkflowRenameKeydown(event, workflow) {
  if (event.key === 'Enter') {
    event.preventDefault()
    confirmRenameWorkflow(workflow)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRenameWorkflow()
  }
}

function handleWorkflowRenameBlur(workflow) {
  setTimeout(() => {
    if (renamingWorkflowId.value === workflow.id && !workflowRenameSaving.value) {
      confirmRenameWorkflow(workflow)
    }
  }, 100)
}

async function confirmRenameWorkflow(workflow) {
  if (workflowRenameSaving.value) return
  const nextName = workflowRenameInput.value.trim()
  if (!nextName || nextName === workflow.name) {
    cancelRenameWorkflow()
    return
  }

  workflowRenameSaving.value = true
  try {
    await renameWorkflow(workflow.id, nextName)
    workflow.name = nextName
    const listedWorkflow = workflows.value.find(item => String(item.id) === String(workflow.id))
    if (listedWorkflow) listedWorkflow.name = nextName
    const cachedWorkflow = loadedWorkflowCache.get(workflow.id)
    if (cachedWorkflow) {
      loadedWorkflowCache.set(workflow.id, { ...cachedWorkflow, name: nextName })
    }
    cancelRenameWorkflow()
  } catch (error) {
    console.error('[WorkflowPanel] 重命名工作流失败:', error)
    alert('重命名失败：' + error.message)
    workflowRenameSaving.value = false
  }
}

// 加载我的工作流到画布（在新标签中打开）
let isLoadingWorkflow = false
async function handleLoadMyWorkflow(workflow) {
  if (isLoadingWorkflow) return
  isLoadingWorkflow = true
  try {
    loading.value = true
    console.log('[WorkflowPanel] 开始加载工作流:', workflow.id, workflow.name)
    const result = await loadWorkflow(workflow.id)
    console.log('[WorkflowPanel] API 返回:', result ? Object.keys(result) : 'null')

    if (result && result.workflow) {
      loadedWorkflowCache.set(workflow.id, result.workflow)
      emit('load', result.workflow)
      emit('close')
    } else {
      console.error('[WorkflowPanel] API 返回格式异常:', JSON.stringify(result)?.substring(0, 200))
      alert('加载失败：工作流数据为空，请刷新页面重试')
    }
  } catch (error) {
    console.error('[WorkflowPanel] 加载工作流失败:', error)
    alert('加载失败：' + error.message)
  } finally {
    loading.value = false
    isLoadingWorkflow = false
  }
}

function handleLoadMyWorkflowFromDoubleClick(workflow) {
  clearWorkflowSelectionClickTimer()
  handleLoadMyWorkflow(workflow)
}

async function persistSavedWorkflowDescription(workflow) {
  try {
    let fullWorkflow = loadedWorkflowCache.get(workflow.id)
    if (!fullWorkflow) {
      const result = await loadWorkflow(workflow.id)
      fullWorkflow = result?.workflow
      if (!fullWorkflow) throw new Error('工作流数据为空')
      loadedWorkflowCache.set(workflow.id, fullWorkflow)
    }

    const description = workflow.description || ''
    fullWorkflow.description = description
    await saveWorkflow({
      id: workflow.id,
      name: fullWorkflow.name || workflow.name,
      description,
      uploadToCloud: false,
      spaceType: workflow.space_type || fullWorkflow.space_type,
      teamId: workflow.team_id || fullWorkflow.team_id,
      project_id: workflow.project_id || fullWorkflow.project_id,
      nodes: fullWorkflow.nodes || [],
      edges: fullWorkflow.edges || [],
      viewport: fullWorkflow.viewport || { x: 0, y: 0, zoom: 1 },
      thumbnail: fullWorkflow.thumbnail || null
    })
    loadedWorkflowCache.set(workflow.id, { ...fullWorkflow, description })
  } catch (error) {
    console.error('[WorkflowPanel] 保存工作流描述失败:', error)
  }
}

function handleSavedDescriptionInput(workflow, value) {
  workflow.description = value
  if (savedDescriptionSaveTimers.has(workflow.id)) {
    clearTimeout(savedDescriptionSaveTimers.get(workflow.id))
  }
  savedDescriptionSaveTimers.set(workflow.id, setTimeout(() => {
    savedDescriptionSaveTimers.delete(workflow.id)
    persistSavedWorkflowDescription(workflow)
  }, 500))
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
      await loadWorkflows(true)  // 强制刷新，忽略缓存
      await loadQuotaInfo()
    }
    cancelDelete()
  } catch (error) {
    console.error('[WorkflowPanel] 删除失败:', error)
    alert('删除失败：' + error.message)
  }
}

// ========== 历史工作流操作 ==========

function toggleHistoryWorkflow(workflow) {
  selectedId.value = null
  selectedHistoryId.value = selectedHistoryId.value === workflow.id ? null : workflow.id
}

function handleHistoryWorkflowClick(workflow) {
  clearWorkflowSelectionClickTimer()
  workflowSelectionClickTimer = setTimeout(() => {
    workflowSelectionClickTimer = null
    toggleHistoryWorkflow(workflow)
  }, 200)
}

// 加载历史工作流到画布
function handleLoadHistoryWorkflow(historyWorkflow) {
  try {
    // 构造工作流对象
    const workflow = {
      id: null, // 历史记录不是已保存的工作流
      name: historyWorkflow.name + ' (恢复)',
      description: historyWorkflow.description || '',
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

function handleLoadHistoryWorkflowFromDoubleClick(workflow) {
  clearWorkflowSelectionClickTimer()
  handleLoadHistoryWorkflow(workflow)
}

// 清空所有历史
function handleClearHistory() {
  clearWorkflowHistory()
  loadHistoryWorkflows()
  clearHistoryConfirm.value = false
}

function handleHistoryDescriptionInput(workflow, value) {
  workflow.description = value
  updateWorkflowHistoryDescription(workflow.id, value)
}

// 开始拖拽工作流
function handleDragStart(e, workflow) {
  console.log('[WorkflowPanel] 开始拖拽工作流:', workflow.name, workflow.id)

  draggingWorkflow.value = workflow

  e.dataTransfer.setData('application/json', JSON.stringify({
    type: 'workflow-merge',
    workflowId: workflow.id,
    workflowName: workflow.name
  }))
  e.dataTransfer.effectAllowed = 'copyMove'

  setTimeout(() => {
    isDragging.value = true
  }, 50)
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
  if (draggingWorkflow.value) {
    emit('close')
  }
  isDragging.value = false
  draggingWorkflow.value = null
  dragOverProjectId.value = null
}

// ========== 文件夹拖拽移动 ==========

function getWorkflowSourceProjectId(workflow) {
  if (workflow.project_id) return workflow.project_id
  const defProj = defaultProject.value
  return defProj ? defProj.id : null
}

function handleFolderDragOver(e, group) {
  if (!draggingWorkflow.value) return
  const targetId = group.id || null
  const sourceId = getWorkflowSourceProjectId(draggingWorkflow.value)
  if (targetId === sourceId) return
  if (!group.id) return

  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragOverProjectId.value = group.id || '__uncategorized__'
}

function handleFolderDragEnter(e, group) {
  if (!draggingWorkflow.value) return
  const targetId = group.id || null
  const sourceId = getWorkflowSourceProjectId(draggingWorkflow.value)
  if (targetId === sourceId) return
  if (!group.id) return

  e.preventDefault()
  dragOverProjectId.value = group.id || '__uncategorized__'
}

function handleFolderDragLeave(e, group) {
  const related = e.relatedTarget
  if (related && e.currentTarget.contains(related)) return
  const key = group.id || '__uncategorized__'
  if (dragOverProjectId.value === key) {
    dragOverProjectId.value = null
  }
}

async function handleFolderDrop(e, group) {
  e.preventDefault()
  e.stopPropagation()
  dragOverProjectId.value = null

  if (!draggingWorkflow.value || !group.id) return

  const workflow = draggingWorkflow.value
  const targetProjectId = group.id
  const sourceProjectId = getWorkflowSourceProjectId(workflow)

  if (targetProjectId === sourceProjectId) {
    draggingWorkflow.value = null
    isDragging.value = false
    return
  }

  draggingWorkflow.value = null
  isDragging.value = false

  try {
    await moveWorkflowToProject(workflow.id, targetProjectId)
    expandedProjects.value.add(targetProjectId)
    await loadWorkflows(true)
  } catch (err) {
    console.error('[WorkflowPanel] 移动工作流失败:', err)
  }
}

function handlePanelDragLeave(e) {
  if (!draggingWorkflow.value) return
  const related = e.relatedTarget
  if (!related || !e.currentTarget.contains(related)) {
    dragOverProjectId.value = null
    emit('close')
    draggingWorkflow.value = null
  }
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

async function copyWorkflowUid(uid) {
  try {
    await navigator.clipboard.writeText(uid)
    console.log('[WorkflowPanel] 已复制工作流ID:', uid)
  } catch {
    const input = document.createElement('input')
    input.value = uid
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }
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
    await Promise.all([
      loadWorkflows(),
      loadQuotaInfo(),
      loadTemplates()
    ])

    // 启动团队空间实时同步
    startTeamSync()

    // 加载历史工作流
    loadHistoryWorkflows()

    // 等待面板动画完成后再渲染内容
    await nextTick()
    setTimeout(() => {
      isContentReady.value = true
    }, 280)
  } else {
    isContentReady.value = false
    clearWorkflowSelectionClickTimer()
    closeWorkflowContextMenu()

    // 停止团队空间实时同步
    stopTeamSync()
  }
})

// 键盘事件
function handleKeydown(e) {
  if (!props.visible) return
  if (e.key === 'Escape') {
    closeWorkflowContextMenu()
    emit('close')
  }
}

function handleDocumentMouseDown(event) {
  if (contextMenuEl.value && !contextMenuEl.value.contains(event.target)) {
    closeWorkflowContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('mousedown', handleDocumentMouseDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  clearWorkflowSelectionClickTimer()
  clearSavedDescriptionTimers()

  // 停止团队空间实时同步
  stopTeamSync()
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
      @dragleave="handlePanelDragLeave"
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

        <!-- 空间切换器（仅在我的工作流标签时显示） -->
        <SpaceSwitcher
          v-if="activeTab === 'my'"
          v-model="spaceFilter"
          @change="handleSpaceChange"
          :compact="true"
        />

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
              {{ workflowsTotal + historyWorkflows.length }}
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
              <span class="quota-used">{{ workflowsTotal }}</span>
              <span class="quota-total">/ ∞ {{ t('canvas.workflow') }}</span>
            </div>
          </div>

          <!-- 双列工作流列表 -->
          <div class="panel-content two-columns">
            <!-- 左侧：手动保存的工作流（按项目分组目录树） -->
            <div class="column saved-column">
              <div class="column-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                <span>{{ t('canvas.savedWorkflows') }}</span>
                <span class="column-count">{{ workflowsTotal }}</span>
              </div>

              <div class="column-content" @click="clearSelectedWorkflowDetails">
                <div v-if="loading && workflows.length === 0 && projects.length === 0" class="loading-state">
                  <div class="spinner"></div>
                </div>

                <div v-else-if="projectTree.length === 0 && filteredWorkflows.length === 0" class="empty-state small">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  <p>{{ searchQuery ? t('canvas.noMatchingWorkflows') : t('canvas.noSavedWorkflows') }}</p>
                </div>

                <div v-else class="project-tree">
                  <div v-for="group in projectTree" :key="group.id || '__uncategorized__'" class="project-group">
                    <!-- 项目文件夹头 -->
                    <div
                      class="project-folder"
                      :class="{
                        expanded: isProjectExpanded(group.id),
                        'drag-over': dragOverProjectId === (group.id || '__uncategorized__') && draggingWorkflow
                      }"
                      @click="toggleProject(group.id)"
                      @dblclick.stop="startRenameProject(group)"
                      @dragover="handleFolderDragOver($event, group)"
                      @dragenter="handleFolderDragEnter($event, group)"
                      @dragleave="handleFolderDragLeave($event, group)"
                      @drop="handleFolderDrop($event, group)"
                    >
                      <svg class="folder-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      <svg v-if="group.id" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="2" y="4" width="20" height="16" rx="2"/>
                        <line x1="2" y1="10" x2="22" y2="10"/>
                      </svg>
                      <template v-if="renamingProject === (group.id || '__uncategorized__')">
                        <input
                          class="folder-rename-input"
                          v-model="renameInput"
                          :placeholder="group.id ? '' : '输入项目名称'"
                          @click.stop
                          @keyup.enter="confirmRenameProject(group)"
                          @keyup.escape="cancelRenameProject"
                          @blur="confirmRenameProject(group)"
                        />
                      </template>
                      <template v-else>
                        <span class="folder-name">{{ group.name }}<span v-if="group.isDefault" class="folder-default-tag">默认</span></span>
                      </template>
                      <span class="folder-count">{{ group.workflows.length }}</span>
                      <button
                        v-if="group.id && !group.isDefault"
                        class="folder-delete-btn"
                        @click.stop="showDeleteProject($event, group)"
                        title="删除项目"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                      <button
                        v-if="group.id && !group.isDefault"
                        class="folder-move-btn"
                        @click.stop="openMoveResource(group, 'project')"
                        title="移动项目到其他空间"
                      >↗</button>
                      <button
                        v-if="group.id && !group.isDefault"
                        class="folder-move-btn"
                        @click.stop="openMoveResource(group, 'project', 'copy')"
                        title="创建项目副本"
                      >⧉</button>
                    </div>

                    <!-- 项目内工作流列表 -->
                    <div v-if="isProjectExpanded(group.id)" class="project-workflows">
                      <div
                        v-for="workflow in group.workflows"
                        :key="workflow.id"
                        class="workflow-item tree-item"
                        :class="{ selected: selectedId === workflow.id }"
                        draggable="true"
                        @click.stop="handleWorkflowClick(workflow)"
                        @dblclick.stop.prevent="handleLoadMyWorkflowFromDoubleClick(workflow)"
                        @contextmenu.prevent.stop="handleWorkflowContextMenu($event, { ...workflow, project_id: group.id }, 'saved')"
                        @dragstart="handleDragStart($event, workflow)"
                        @dragend="handleDragEnd"
                      >
                        <div class="workflow-item-content">
                          <div class="item-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                              <rect x="3" y="3" width="6" height="6" rx="1"/>
                              <rect x="15" y="3" width="6" height="6" rx="1"/>
                              <rect x="9" y="15" width="6" height="6" rx="1"/>
                              <path d="M6 9v3h3M18 9v3h-3M12 15v-3"/>
                            </svg>
                          </div>

                          <div class="item-info">
                            <input
                              v-if="renamingWorkflowId === workflow.id"
                              v-model="workflowRenameInput"
                              class="workflow-rename-input"
                              :disabled="workflowRenameSaving"
                              @click.stop
                              @dblclick.stop
                              @mousedown.stop
                              @keydown="handleWorkflowRenameKeydown($event, workflow)"
                              @blur="handleWorkflowRenameBlur(workflow)"
                            />
                            <div v-else class="item-name">{{ workflow.name }}</div>
                            <div class="item-meta workflow-meta">
                              <span v-if="workflow.workflow_uid" class="workflow-uid" :title="t('canvas.copyWorkflowUid')" @click.stop="copyWorkflowUid(workflow.workflow_uid)">{{ workflow.workflow_uid }}</span>
                              <span v-if="workflow.workflow_uid">·</span>
                              <span>{{ workflow.node_count }} {{ t('canvas.nodeLabel') }}</span>
                              <span>·</span>
                              <span class="workflow-time">保存 {{ formatBeijingSaveTime(workflow.updated_at) }}</span>
                              <template v-if="teamStore.isInTeamSpace.value && workflow.last_updated_by_username">
                                <span>·</span>
                                <span class="item-author">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                    <circle cx="12" cy="7" r="4"/>
                                  </svg>
                                  {{ workflow.last_updated_by_username }}
                                </span>
                              </template>
                            </div>
                          </div>

                          <div class="item-actions">
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

                        <div
                          v-if="selectedId === workflow.id"
                          class="workflow-description-editor"
                          @click.stop
                          @dblclick.stop
                        >
                          <textarea
                            :value="workflow.description || ''"
                            class="workflow-description-input"
                            rows="3"
                            placeholder="描述内容"
                            @input="handleSavedDescriptionInput(workflow, $event.target.value)"
                            @keydown.stop
                            @mousedown.stop
                            @dragstart.stop
                          ></textarea>
                        </div>
                      </div>
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

              <div class="column-content" @click="clearSelectedWorkflowDetails">
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
                    @click.stop="handleHistoryWorkflowClick(workflow)"
                    @dblclick.stop.prevent="handleLoadHistoryWorkflowFromDoubleClick(workflow)"
                    @contextmenu.prevent.stop="handleWorkflowContextMenu($event, workflow, 'history')"
                    @dragstart="handleHistoryDragStart($event, workflow)"
                    @dragend="handleDragEnd"
                  >
                    <div class="history-item-content">
                      <div class="item-icon history-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                      </div>

                      <div class="item-info">
                        <div class="item-name">{{ workflow.name }}</div>
                        <div class="item-meta workflow-meta">
                          <span>{{ workflow.nodeCount }} {{ t('canvas.nodeLabel') }}</span>
                          <span>·</span>
                          <span class="workflow-time">自动保存 {{ formatBeijingSaveTime(workflow.savedAt) }}</span>
                        </div>
                      </div>

                      <div class="item-actions">
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

                    <div
                      v-if="selectedHistoryId === workflow.id"
                      class="history-description-editor"
                      @click.stop
                      @dblclick.stop
                    >
                      <textarea
                        :value="workflow.description || ''"
                        class="history-description-input"
                        rows="3"
                        placeholder="描述内容"
                        @input="handleHistoryDescriptionInput(workflow, $event.target.value)"
                        @keydown.stop
                        @mousedown.stop
                        @dragstart.stop
                      ></textarea>
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
          <span class="tip">{{ t('canvas.doubleClickOpenDragMerge') }} · 右键更多操作</span>
        </div>

        <!-- 工作流右键菜单 -->
        <div
          v-if="contextMenu.visible"
          ref="contextMenuEl"
          class="workflow-context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @mousedown.stop
          @click.stop
        >
          <template v-if="contextMenu.type === 'saved'">
            <button class="context-menu-item" @click="handleWorkflowContextAction('rename')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
              <span>重命名工作流</span>
            </button>
            <button class="context-menu-item" @click="handleWorkflowContextAction('load')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <span>加载工作流</span>
            </button>
            <button class="context-menu-item" @click="handleWorkflowContextAction('move')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6"/>
                <path d="M19 12H9"/>
              </svg>
              <span>移动工作流</span>
            </button>
            <button class="context-menu-item" @click="handleWorkflowContextAction('copy')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span>创建工作流副本</span>
            </button>
            <button v-if="contextMenu.workflow?.workflow_uid" class="context-menu-item" @click="handleWorkflowContextAction('copy-uid')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
                <path d="M8 8h8M8 12h5M8 16h8"/>
              </svg>
              <span>复制工作流 ID</span>
            </button>
          </template>
          <button v-else class="context-menu-item" @click="handleWorkflowContextAction('load')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span>恢复工作流</span>
          </button>
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

        <!-- 删除项目确认（需输入项目名） -->
        <Transition name="fade">
          <div v-if="deleteProjectConfirm.visible" class="delete-modal" @click.self="cancelDeleteProject">
            <div class="delete-dialog project-delete-dialog">
              <p class="delete-title">删除项目「{{ deleteProjectConfirm.group?.name }}」</p>
              <p class="delete-hint">项目下的工作流将移入默认项目，此操作不可撤销。</p>
              <p class="delete-hint">请输入项目名称 <strong>{{ deleteProjectConfirm.group?.name }}</strong> 确认删除：</p>
              <input
                v-model="deleteProjectConfirm.inputName"
                class="delete-confirm-input"
                :placeholder="deleteProjectConfirm.group?.name"
                @keyup.enter="handleDeleteProject"
              />
              <div class="delete-actions">
                <button class="btn-cancel" @click="cancelDeleteProject">取消</button>
                <button
                  class="btn-confirm"
                  :disabled="deleteProjectConfirm.inputName.trim() !== deleteProjectConfirm.group?.name?.trim()"
                  @click="handleDeleteProject"
                >确认删除</button>
              </div>
            </div>
          </div>
        </Transition>
        <MoveResourceDialog
          v-model="moveResourceDialog"
          :resource-type="moveResourceTarget.type"
          :resource-id="String(moveResourceTarget.id)"
          :resource-name="moveResourceTarget.name"
          :workflow-count="moveResourceTarget.workflowCount"
          :current-space-type="moveResourceTarget.spaceType"
          :current-team-id="String(moveResourceTarget.teamId || '')"
          :current-project-id="String(moveResourceTarget.projectId || '')"
          :source-role="moveResourceTarget.sourceRole"
          :is-default-project="moveResourceTarget.isDefault"
          :operation="moveResourceTarget.operation"
          @moved="handleResourceMoved"
        />
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
  width: 820px;
  max-width: calc(100vw - 120px);
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
  padding: 10px 16px;
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
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 7px 12px;
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
  padding: 8px 12px;
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
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.quota-info {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 3px;
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
  gap: 8px;
  padding: 8px;
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
  padding: 7px 10px;
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
  padding: 4px;
  padding-bottom: 8px;
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

/* 项目目录树 */
.project-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.project-group {
  display: flex;
  flex-direction: column;
}

.project-folder {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  color: rgba(255, 255, 255, 0.7);
  user-select: none;
}

.project-folder:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.project-folder.drag-over {
  background: rgba(59, 130, 246, 0.15);
  color: #fff;
  outline: 1.5px dashed rgba(59, 130, 246, 0.6);
  outline-offset: -1.5px;
}

.project-folder .folder-arrow {
  transition: transform 0.2s;
  flex-shrink: 0;
  opacity: 0.5;
}

.project-folder.expanded .folder-arrow {
  transform: rotate(90deg);
}

.folder-name {
  font-size: 12px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-default-tag {
  font-size: 9px;
  font-weight: 500;
  color: rgba(59, 130, 246, 0.8);
  background: rgba(59, 130, 246, 0.12);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 6px;
  vertical-align: middle;
}

.folder-delete-btn {
  padding: 3px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0;
  flex-shrink: 0;
}

.project-folder:hover .folder-delete-btn {
  opacity: 1;
}

.folder-delete-btn:hover {
  background: rgba(255, 100, 100, 0.15);
  color: #ff6b6b;
}

.folder-move-btn {
  margin-left: 4px;
  padding: 1px 4px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  opacity: 0;
}

.project-folder:hover .folder-move-btn {
  opacity: 1;
}

.folder-move-btn:hover {
  color: #60a5fa;
}

.project-delete-dialog {
  max-width: 340px;
  user-select: text;
}

.delete-title {
  font-size: 15px !important;
  font-weight: 600;
  margin-bottom: 8px !important;
}

.delete-hint {
  font-size: 12px !important;
  color: rgba(255, 255, 255, 0.5) !important;
  margin-bottom: 8px !important;
  line-height: 1.5;
}

.delete-hint strong {
  color: #ff6b6b;
  user-select: text;
  cursor: text;
}

.delete-confirm-input {
  width: 100%;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  outline: none;
  margin-bottom: 16px;
  box-sizing: border-box;
}

.delete-confirm-input:focus {
  border-color: rgba(255, 100, 100, 0.5);
}

.btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.folder-rename-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
}

.folder-rename-input:focus {
  border-color: #3b82f6;
  background: rgba(255, 255, 255, 0.12);
}

.folder-count {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 6px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.project-workflows {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-left: 6px;
  margin-left: 5px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

.workflow-item.tree-item {
  padding: 6px 8px;
}

.workflow-item.tree-item .item-icon {
  width: 28px;
  height: 28px;
}

/* 工作流列表 */
.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.workflow-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
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

.workflow-item.tree-item,
.workflow-item.history-item {
  align-items: stretch;
  flex-direction: column;
  gap: 4px;
}

.workflow-item.history-item {
  border-left: 2px solid rgba(59, 130, 246, 0.3);
}

.workflow-item.history-item.selected {
  border-left-color: #3b82f6;
}

.workflow-item-content,
.history-item-content {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.workflow-description-editor,
.history-description-editor {
  padding-left: 36px;
}

.workflow-description-input,
.history-description-input {
  width: 100%;
  min-height: 68px;
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.22);
  color: rgba(255, 255, 255, 0.86);
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  outline: none;
  cursor: text;
}

.workflow-description-input:focus,
.history-description-input:focus {
  border-color: rgba(59, 130, 246, 0.55);
  background: rgba(0, 0, 0, 0.32);
}

.workflow-description-input::placeholder,
.history-description-input::placeholder {
  color: rgba(255, 255, 255, 0.32);
}

.item-icon {
  width: 28px;
  height: 28px;
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
  margin-bottom: 0;
}

.workflow-rename-input {
  width: 100%;
  box-sizing: border-box;
  padding: 2px 5px;
  border: 1px solid rgba(59, 130, 246, 0.6);
  border-radius: 4px;
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font: inherit;
  line-height: 1.3;
}

.workflow-rename-input:focus {
  border-color: #3b82f6;
  background: rgba(255, 255, 255, 0.12);
}

.item-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  flex-wrap: nowrap;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workflow-uid {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
  user-select: all;
  transition: all 0.15s;
  letter-spacing: 0.3px;
}

.workflow-uid:hover {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.item-author {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: rgba(255, 255, 255, 0.5);
}

.item-author svg {
  opacity: 0.7;
}

.item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.workflow-item:hover .item-actions,
.workflow-item:focus-within .item-actions {
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

.move-btn:hover {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
}

/* 工作流右键菜单 */
.workflow-context-menu {
  position: fixed;
  z-index: 500;
  min-width: 196px;
  padding: 5px;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(16px);
}

.context-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.context-menu-item svg {
  flex-shrink: 0;
  opacity: 0.72;
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
  padding: 7px 12px;
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

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   WorkflowPanel 白昼模式样式适配
   ======================================== */

/* 面板背景 */
:root.canvas-theme-light .workflow-panel {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.08) !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1) !important;
}

/* 头部 */
:root.canvas-theme-light .workflow-panel .panel-header {
  border-bottom-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .workflow-panel .header-title {
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .header-title svg {
  opacity: 0.7 !important;
}

:root.canvas-theme-light .workflow-panel .close-btn {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .workflow-panel .close-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #1c1917 !important;
}

/* 标签页 */
:root.canvas-theme-light .workflow-panel .panel-tabs {
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .workflow-panel .tab-btn {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .workflow-panel .tab-btn:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  color: rgba(0, 0, 0, 0.8) !important;
}

:root.canvas-theme-light .workflow-panel .tab-btn.active {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .tab-count {
  background: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .workflow-panel .tab-btn.active .tab-count {
  background: rgba(0, 0, 0, 0.12) !important;
}

/* 工具栏 */
:root.canvas-theme-light .workflow-panel .panel-toolbar {
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .workflow-panel .search-box {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .workflow-panel .search-box svg {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .workflow-panel .search-input {
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .search-input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .workflow-panel .new-btn {
  background: #1c1917 !important;
  color: #fff !important;
}

:root.canvas-theme-light .workflow-panel .new-btn:hover {
  background: #292524 !important;
}

/* 配额 */
:root.canvas-theme-light .workflow-panel .quota-bar {
  background: rgba(0, 0, 0, 0.02) !important;
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .workflow-panel .quota-used {
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .quota-total {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .workflow-panel .quota-progress {
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .workflow-panel .quota-fill {
  background: rgba(0, 0, 0, 0.4) !important;
}

/* 分类筛选 */
:root.canvas-theme-light .workflow-panel .category-bar {
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .workflow-panel .category-btn {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
  color: rgba(0, 0, 0, 0.6) !important;
}

:root.canvas-theme-light .workflow-panel .category-btn:hover {
  border-color: rgba(0, 0, 0, 0.12) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .category-btn.active {
  background: #3b82f6 !important;
  border-color: #3b82f6 !important;
  color: white !important;
}

/* 双列布局 */
:root.canvas-theme-light .workflow-panel .column {
  background: rgba(0, 0, 0, 0.015) !important;
  border-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .workflow-panel .column-header {
  background: rgba(0, 0, 0, 0.025) !important;
  border-bottom-color: rgba(0, 0, 0, 0.04) !important;
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .workflow-panel .column-count {
  background: rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .workflow-panel .clear-history-btn {
  color: rgba(0, 0, 0, 0.4) !important;
}

:root.canvas-theme-light .workflow-panel .clear-history-btn:hover {
  background: rgba(255, 100, 100, 0.1) !important;
  color: #ef4444 !important;
}

:root.canvas-theme-light .workflow-panel .column-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .workflow-panel .panel-content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12) !important;
}

:root.canvas-theme-light .workflow-panel .panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2) !important;
}

/* 加载状态 */
:root.canvas-theme-light .workflow-panel .loading-state .spinner {
  border-color: rgba(0, 0, 0, 0.1) !important;
  border-top-color: rgba(0, 0, 0, 0.5) !important;
}

/* 空状态 */
:root.canvas-theme-light .workflow-panel .empty-state {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .workflow-panel .empty-state p {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .workflow-panel .empty-hint {
  color: rgba(0, 0, 0, 0.3) !important;
}

:root.canvas-theme-light .workflow-panel .switch-tab-btn {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .switch-tab-btn:hover {
  background: rgba(0, 0, 0, 0.1) !important;
}

/* 项目目录树 */
:root.canvas-theme-light .workflow-panel .project-folder {
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .workflow-panel .project-folder:hover {
  background: rgba(0, 0, 0, 0.04) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .project-folder.drag-over {
  background: rgba(59, 130, 246, 0.1) !important;
  color: #1c1917 !important;
  outline: 1.5px dashed rgba(59, 130, 246, 0.5) !important;
  outline-offset: -1.5px !important;
}

:root.canvas-theme-light .workflow-panel .folder-count {
  background: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .workflow-panel .folder-default-tag {
  color: rgba(59, 130, 246, 0.9) !important;
  background: rgba(59, 130, 246, 0.08) !important;
}

:root.canvas-theme-light .workflow-panel .folder-delete-btn {
  color: rgba(0, 0, 0, 0.3) !important;
}

:root.canvas-theme-light .workflow-panel .folder-delete-btn:hover {
  background: rgba(255, 100, 100, 0.1) !important;
  color: #ef4444 !important;
}

:root.canvas-theme-light .workflow-panel .delete-hint {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .workflow-panel .delete-confirm-input {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .delete-confirm-input:focus {
  border-color: rgba(239, 68, 68, 0.5) !important;
}

:root.canvas-theme-light .workflow-panel .project-workflows {
  border-left-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .workflow-panel .folder-rename-input {
  color: #1c1917 !important;
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(59, 130, 246, 0.5) !important;
}

:root.canvas-theme-light .workflow-panel .folder-rename-input:focus {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: #3b82f6 !important;
}

/* 工作流列表项 */
:root.canvas-theme-light .workflow-panel .workflow-item {
  border-color: transparent !important;
}

:root.canvas-theme-light .workflow-panel .workflow-item:hover {
  background: rgba(0, 0, 0, 0.03) !important;
}

:root.canvas-theme-light .workflow-panel .workflow-item.selected {
  background: rgba(0, 0, 0, 0.05) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .workflow-panel .workflow-item.history-item {
  border-left-color: rgba(59, 130, 246, 0.25) !important;
}

:root.canvas-theme-light .workflow-panel .workflow-item.history-item.selected {
  border-left-color: #3b82f6 !important;
}

:root.canvas-theme-light .workflow-panel .workflow-description-input,
:root.canvas-theme-light .workflow-panel .history-description-input {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.12) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .workflow-description-input:focus,
:root.canvas-theme-light .workflow-panel .history-description-input:focus {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(59, 130, 246, 0.55) !important;
}

:root.canvas-theme-light .workflow-panel .workflow-description-input::placeholder,
:root.canvas-theme-light .workflow-panel .history-description-input::placeholder {
  color: rgba(0, 0, 0, 0.35) !important;
}

:root.canvas-theme-light .workflow-panel .item-icon {
  background: rgba(0, 0, 0, 0.04) !important;
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .workflow-panel .item-icon.history-icon {
  background: rgba(59, 130, 246, 0.1) !important;
  color: rgba(59, 130, 246, 0.8) !important;
}

:root.canvas-theme-light .workflow-panel .item-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .workflow-rename-input {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(59, 130, 246, 0.55) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .item-meta {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .workflow-panel .workflow-uid {
  color: rgba(0, 0, 0, 0.5) !important;
  background: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .workflow-panel .workflow-uid:hover {
  background: rgba(0, 0, 0, 0.12) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .workflow-panel .item-author {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .workflow-panel .action-btn {
  color: rgba(0, 0, 0, 0.45) !important;
}

:root.canvas-theme-light .workflow-panel .load-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .delete-btn:hover {
  background: rgba(255, 100, 100, 0.1) !important;
  color: #ef4444 !important;
}

:root.canvas-theme-light .workflow-panel .workflow-context-menu {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16) !important;
}

:root.canvas-theme-light .workflow-panel .context-menu-item {
  color: rgba(0, 0, 0, 0.72) !important;
}

:root.canvas-theme-light .workflow-panel .context-menu-item:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #1c1917 !important;
}

/* 模板卡片 */
:root.canvas-theme-light .workflow-panel .template-card {
  background: rgba(0, 0, 0, 0.02) !important;
  border-color: rgba(0, 0, 0, 0.06) !important;
}

:root.canvas-theme-light .workflow-panel .template-card:hover {
  border-color: #3b82f6 !important;
  background: rgba(59, 130, 246, 0.04) !important;
}

:root.canvas-theme-light .workflow-panel .template-icon {
  background: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .workflow-panel .template-name {
  color: #1c1917 !important;
}

:root.canvas-theme-light .workflow-panel .template-desc {
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .workflow-panel .node-count {
  color: rgba(0, 0, 0, 0.45) !important;
  background: rgba(0, 0, 0, 0.05) !important;
}

/* 底部 */
:root.canvas-theme-light .workflow-panel .panel-footer {
  border-top-color: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .workflow-panel .tip {
  color: rgba(0, 0, 0, 0.35) !important;
}

/* 删除确认弹窗 */
:root.canvas-theme-light .workflow-panel .delete-modal {
  background: rgba(0, 0, 0, 0.3) !important;
}

:root.canvas-theme-light .workflow-panel .delete-dialog {
  background: #fff !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .workflow-panel .delete-dialog p {
  color: rgba(0, 0, 0, 0.85) !important;
}

:root.canvas-theme-light .workflow-panel .btn-cancel {
  background: rgba(0, 0, 0, 0.06) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .workflow-panel .btn-cancel:hover {
  background: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .workflow-panel .btn-confirm {
  background: #ef4444 !important;
  color: #fff !important;
}

:root.canvas-theme-light .workflow-panel .btn-confirm:hover {
  background: #dc2626 !important;
}
</style>
