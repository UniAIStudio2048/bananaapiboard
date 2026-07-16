<script setup>
/**
 * WorkflowList.vue - 工作流列表页面（项目文件夹模式）
 * 无导航栏的全屏页面，黑白灰色系风格
 * 两级结构：项目列表 → 项目内工作流列表
 */
import { computed, ref, onMounted, onActivated, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getWorkflowList, deleteWorkflow, getStorageQuota, renameWorkflow } from '@/api/canvas/workflow'
import { getProjectList, createProject, updateProject, deleteProject } from '@/api/canvas/project'
import { useCanvasStore } from '@/stores/canvas'
import { useTeamStore } from '@/stores/team'
import SpaceSwitcher from '@/components/canvas/SpaceSwitcher.vue'
import MoveResourceDialog from '@/components/canvas/MoveResourceDialog.vue'
import {
  setCanvasSpaceFilterFromGlobal,
  syncGlobalSpaceFromFilter,
  useCanvasSpaceFilter
} from '@/components/canvas/spaceFilterState'

const router = useRouter()
const canvasStore = useCanvasStore()
const teamStore = useTeamStore()
const spaceFilter = useCanvasSpaceFilter(teamStore)

// 数据状态
const projects = ref([])
const workflows = ref([])
const loading = ref(true)
const quota = ref(null)
const currentProject = ref(null)
const pagination = ref({
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 0
})

const totalWorkflowPages = computed(() => {
  const explicitTotalPages = Number(pagination.value.totalPages || 0)
  if (explicitTotalPages > 0) return explicitTotalPages
  return Math.ceil(pagination.value.total / pagination.value.pageSize) || 0
})

const currentProjectWorkflowTotal = computed(() => {
  if (!currentProject.value) return 0
  return Number(pagination.value.total || currentProject.value.workflow_count || 0)
})

const currentSpaceWorkflowTotal = computed(() => {
  if (currentProject.value) return currentProjectWorkflowTotal.value
  return projects.value.reduce((sum, project) => sum + Number(project.workflow_count || 0), 0)
})

function getSelectedSpaceParams() {
  return teamStore.getSpaceParams(spaceFilter.value)
}

function getWritableSpaceParams() {
  const spaceParams = getSelectedSpaceParams()
  if (spaceParams.spaceType !== 'all') return spaceParams
  return teamStore.getSpaceParams('current')
}

// 删除确认
const deleteConfirm = ref({
  visible: false,
  workflow: null
})

// 项目删除确认
const projectDeleteConfirm = ref({
  visible: false,
  project: null
})

// 创建项目
const showCreateProject = ref(false)
const newProjectName = ref('')
const creatingProject = ref(false)

// 右键菜单
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  item: null,
  type: '' // 'project' | 'workflow'
})

// 移动项目/工作流弹窗
const showMoveDialog = ref(false)
const moveTarget = ref({ type: 'workflow', operation: 'move', id: '', name: '', workflowCount: 0, spaceType: 'personal', teamId: '', projectId: '', sourceRole: '', isDefault: false })

// 重命名
const renameState = ref({
  visible: false,
  id: null,
  name: '',
  type: '' // 'project'
})

const inlineRenameState = ref({
  type: '',
  id: null,
  name: '',
  saving: false
})
let titleClickTimer = null

// 返回画布
function goBack() {
  if (currentProject.value) {
    goBackToProjects()
  } else {
    router.push('/canvas')
  }
}

// 返回项目列表
function goBackToProjects() {
  currentProject.value = null
  workflows.value = []
  pagination.value.page = 1
  loadProjects()
}

// 加载项目列表
async function loadProjects() {
  loading.value = true
  try {
    const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
    const result = await getProjectList({
      spaceType: spaceParams.spaceType,
      teamId: spaceParams.teamId
    })
    projects.value = result.data || []
  } catch (error) {
    console.error('[WorkflowList] 加载项目失败:', error)
    alert('加载项目列表失败：' + error.message)
  } finally {
    loading.value = false
  }
}

// 进入项目
function enterProject(project) {
  currentProject.value = project
  pagination.value.page = 1
  loadWorkflows()
}

// 加载工作流列表
async function loadWorkflows() {
  loading.value = true
  try {
    const spaceParams = teamStore.getSpaceParams(spaceFilter.value)
    const params = {
      page: pagination.value.page,
      pageSize: pagination.value.pageSize,
      ...spaceParams
    }
    if (currentProject.value) {
      params.projectId = currentProject.value.id
    }
    const result = await getWorkflowList(params)
    workflows.value = result.list || []
    const nextPagination = { ...pagination.value, ...(result.pagination || {}) }
    nextPagination.totalPages = nextPagination.totalPages || Math.ceil(nextPagination.total / nextPagination.pageSize) || 0
    pagination.value = nextPagination
  } catch (error) {
    console.error('[WorkflowList] 加载失败:', error)
    alert('加载工作流列表失败：' + error.message)
  } finally {
    loading.value = false
  }
}

// 加载配额信息
async function loadQuota() {
  try {
    const result = await getStorageQuota()
    quota.value = result.quota
  } catch (error) {
    console.error('[WorkflowList] 加载配额失败:', error)
  }
}

// 打开工作流
function openWorkflow(workflow) {
  canvasStore.workflowMeta = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description
  }
  router.push(`/canvas?load=${workflow.id}`)
}

// 新建工作流
async function createNewWorkflow() {
  if (currentProject.value?.space_type === 'team' && currentProject.value?.team_id) {
    await teamStore.switchToTeam(currentProject.value.team_id)
  } else if (currentProject.value?.space_type === 'personal') {
    teamStore.switchToPersonalSpace()
  } else {
    await syncGlobalSpaceFromFilter(teamStore, spaceFilter.value)
  }
  canvasStore.workflowMeta = null
  router.push('/canvas')
}

// === 项目操作 ===

function openCreateProject() {
  newProjectName.value = ''
  showCreateProject.value = true
  nextTick(() => {
    document.querySelector('.create-project-input')?.focus()
  })
}

async function handleCreateProject() {
  const name = newProjectName.value.trim()
  if (!name) return
  creatingProject.value = true
  try {
    const spaceParams = getWritableSpaceParams()
    await createProject({
      name,
      spaceType: spaceParams.spaceType,
      teamId: spaceParams.teamId
    })
    showCreateProject.value = false
    newProjectName.value = ''
    await loadProjects()
  } catch (error) {
    alert('创建项目失败：' + error.message)
  } finally {
    creatingProject.value = false
  }
}

function confirmDeleteProject(project) {
  if (project.is_default) {
    alert('默认项目不可删除')
    return
  }
  projectDeleteConfirm.value = { visible: true, project }
}

async function handleDeleteProject() {
  const project = projectDeleteConfirm.value.project
  if (!project) return
  try {
    await deleteProject(project.id)
    projectDeleteConfirm.value = { visible: false, project: null }
    await loadProjects()
  } catch (error) {
    alert('删除项目失败：' + error.message)
  }
}

function cancelDeleteProject() {
  projectDeleteConfirm.value = { visible: false, project: null }
}

function openRenameProject(project) {
  renameState.value = {
    visible: true,
    id: project.id,
    name: project.name,
    type: 'project'
  }
  nextTick(() => {
    document.querySelector('.rename-input')?.focus()
  })
}

async function handleRename() {
  const { id, name, type } = renameState.value
  const trimmed = name.trim()
  if (!trimmed) return
  try {
    if (type === 'project') {
      await updateProject(id, { name: trimmed })
      await loadProjects()
    }
    renameState.value = { visible: false, id: null, name: '', type: '' }
  } catch (error) {
    alert('重命名失败：' + error.message)
  }
}

function cancelRename() {
  renameState.value = { visible: false, id: null, name: '', type: '' }
}

function getProjectCoverUrl(project) {
  return project?.cover_url || ''
}

function getWorkflowCoverUrl(workflow) {
  return workflow?.thumbnail_url || workflow?.thumbnail || ''
}

function isVideoCover(url) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(url || ''))
}

function isInlineRenaming(type, item) {
  return inlineRenameState.value.type === type && String(inlineRenameState.value.id) === String(item?.id)
}

function startInlineRename(type, item) {
  if (!item?.id) return
  if (titleClickTimer) {
    clearTimeout(titleClickTimer)
    titleClickTimer = null
  }
  inlineRenameState.value = {
    type,
    id: item.id,
    name: item.name || '',
    saving: false
  }
  nextTick(() => {
    document.querySelector('.inline-rename-input')?.focus()
    document.querySelector('.inline-rename-input')?.select()
  })
}

function handleTitleClick(type, item) {
  if (titleClickTimer) clearTimeout(titleClickTimer)
  titleClickTimer = setTimeout(() => {
    titleClickTimer = null
    if (type === 'project') {
      enterProject(item)
    } else if (type === 'workflow') {
      openWorkflow(item)
    }
  }, 220)
}

function cancelInlineRename() {
  inlineRenameState.value = { type: '', id: null, name: '', saving: false }
}

async function confirmInlineRename() {
  const { type, id, name, saving } = inlineRenameState.value
  if (saving || !id) return
  const trimmed = name.trim()
  if (!trimmed) {
    cancelInlineRename()
    return
  }

  inlineRenameState.value.saving = true
  try {
    if (type === 'project') {
      await updateProject(id, { name: trimmed })
      if (currentProject.value && String(currentProject.value.id) === String(id)) {
        currentProject.value = { ...currentProject.value, name: trimmed }
      }
      projects.value = projects.value.map(project => (
        String(project.id) === String(id) ? { ...project, name: trimmed } : project
      ))
    } else if (type === 'workflow') {
      await renameWorkflow(id, trimmed)
      workflows.value = workflows.value.map(workflow => (
        String(workflow.id) === String(id) ? { ...workflow, name: trimmed } : workflow
      ))
    }
    cancelInlineRename()
  } catch (error) {
    alert('重命名失败：' + error.message)
    inlineRenameState.value.saving = false
  }
}

// === 右键菜单 ===

function showContextMenuHandler(event, item, type) {
  event.preventDefault()
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    item,
    type
  }
}

function hideContextMenu() {
  contextMenu.value = { ...contextMenu.value, visible: false }
}

function handleContextAction(action) {
  const { item, type } = contextMenu.value
  hideContextMenu()
  if (type === 'project') {
    if (action === 'rename') openRenameProject(item)
    else if (action === 'delete') confirmDeleteProject(item)
    else if (action === 'move') openMoveDialog(item, 'project', 'move')
    else if (action === 'copy') openMoveDialog(item, 'project', 'copy')
  } else if (type === 'workflow') {
    if (action === 'delete') confirmDelete(item)
    else if (action === 'move') openMoveDialog(item, 'workflow', 'move')
    else if (action === 'copy') openMoveDialog(item, 'workflow', 'copy')
  }
}

// === 移动项目/工作流 ===

function getTeamRole(teamId) {
  return teamStore.myTeams.value.find(team => String(team.id) === String(teamId))?.my_role || ''
}

function openMoveDialog(item, type, operation = 'move') {
  moveTarget.value = {
    type,
    operation,
    id: item.id,
    name: item.name,
    workflowCount: Number(item.workflow_count || 0),
    spaceType: item.space_type || currentProject.value?.space_type || 'personal',
    teamId: item.team_id || currentProject.value?.team_id || '',
    projectId: type === 'workflow' ? (item.project_id || currentProject.value?.id || '') : '',
    sourceRole: getTeamRole(item.team_id || currentProject.value?.team_id),
    isDefault: !!item.is_default
  }
  showMoveDialog.value = true
}

async function onResourceMoved() {
  if (currentProject.value || moveTarget.value.type === 'project') goBackToProjects()
  else await loadProjects()
}

// === 工作流删除 ===

function confirmDelete(workflow) {
  deleteConfirm.value = { visible: true, workflow }
}

function cancelDelete() {
  deleteConfirm.value = { visible: false, workflow: null }
}

async function handleDelete() {
  if (!deleteConfirm.value.workflow) return
  try {
    await deleteWorkflow(deleteConfirm.value.workflow.id)
    await loadWorkflows()
    await loadQuota()
    cancelDelete()
  } catch (error) {
    console.error('[WorkflowList] 删除失败:', error)
    alert('删除失败：' + error.message)
  }
}

// 格式化时间
function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  return d.toLocaleDateString('zh-CN')
}

// 格式化存储大小
function formatSize(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// 页面切换
function changePage(page) {
  pagination.value.page = page
  loadWorkflows()
}

// 全局点击关闭右键菜单
function onDocumentClick() {
  if (contextMenu.value.visible) hideContextMenu()
}

// 初始化
onMounted(() => {
  teamStore.loadMyTeams()
  loadProjects()
  loadQuota()
  document.addEventListener('click', onDocumentClick)
})

onActivated(() => {
  teamStore.loadMyTeams()
  if (currentProject.value) {
    loadWorkflows()
  } else {
    loadProjects()
  }
  loadQuota()
})

async function handleSpaceChange(newSpace) {
  await syncGlobalSpaceFromFilter(teamStore, newSpace)
}

watch(spaceFilter, () => {
  currentProject.value = null
  workflows.value = []
  pagination.value.page = 1
  loadProjects()
})

watch([() => teamStore.globalSpaceType.value, () => teamStore.globalTeamId.value], () => {
  setCanvasSpaceFilterFromGlobal(teamStore)
})

</script>

<template>
  <div class="workflow-page">
    <!-- 顶部工具栏 -->
    <div class="top-bar">
      <div class="top-bar-left">
        <button class="back-btn" @click="goBack" :title="currentProject ? '返回项目列表' : '返回画布'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>返回</span>
        </button>

        <!-- 面包屑 -->
        <div v-if="currentProject" class="breadcrumb">
          <button class="breadcrumb-link" @click="goBackToProjects">全部项目</button>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="breadcrumb-sep">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span class="breadcrumb-current">{{ currentProject.name }}</span>
        </div>

        <SpaceSwitcher
          v-model="spaceFilter"
          :compact="true"
          @change="handleSpaceChange"
        />
      </div>

      <div class="page-heading">
        <h1
          v-if="!currentProject || !isInlineRenaming('project', currentProject)"
          class="page-title"
          @dblclick="currentProject ? startInlineRename('project', currentProject) : null"
        >
          {{ currentProject ? currentProject.name : '我的项目' }}
        </h1>
        <input
          v-else
          v-model="inlineRenameState.name"
          class="page-title page-title-input inline-rename-input"
          maxlength="50"
          @click.stop
          @keyup.enter="confirmInlineRename"
          @keyup.escape="cancelInlineRename"
          @blur="confirmInlineRename"
        />
        <div v-if="!isInlineRenaming('project', currentProject)" class="page-count">
          <span v-if="currentProject">共 {{ currentProjectWorkflowTotal }} 个工作流</span>
          <span v-else>项目数量：{{ projects.length }} · 工作流：{{ currentSpaceWorkflowTotal }}</span>
        </div>
      </div>

      <button class="new-btn" @click="currentProject ? createNewWorkflow() : openCreateProject()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>{{ currentProject ? '新建工作流' : '新建项目' }}</span>
      </button>
    </div>

    <!-- 配额信息 -->
    <div v-if="quota" class="quota-section">
      <div class="quota-row">
        <div class="quota-info">
          <span class="quota-label">存储空间</span>
          <span class="quota-value">{{ formatSize(quota.used_storage) }} / {{ formatSize(quota.total_quota) }}</span>
        </div>
        <div class="quota-bar">
          <div class="quota-fill" :style="{ width: `${Math.min(quota.used_percentage, 100)}%` }"></div>
        </div>
      </div>
      <div class="quota-stats">
        <div class="stat-box">
          <span class="stat-num">{{ currentSpaceWorkflowTotal }}</span>
          <span class="stat-max">/ {{ quota.max_workflows }}</span>
          <span class="stat-text">工作流</span>
        </div>
        <div class="stat-box">
          <span class="stat-num">{{ formatSize(quota.max_workflow_size) }}</span>
          <span class="stat-text">单个限制</span>
        </div>
        <div class="stat-box">
          <span class="stat-num">{{ quota.total_generations }}</span>
          <span class="stat-text">生成次数</span>
        </div>
        <div v-if="quota.is_vip" class="stat-box vip-box">
          <span class="vip-tag">PRO</span>
        </div>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="workflow-content">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>

      <!-- ========== 项目列表层级 ========== -->
      <template v-else-if="!currentProject">
        <div v-if="projects.length === 0" class="empty-state">
          <div class="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>还没有项目</h3>
          <p>创建您的第一个项目来组织工作流</p>
          <button class="create-btn" @click="openCreateProject">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            创建项目
          </button>
        </div>

        <div v-else class="project-grid">
          <div
            v-for="project in projects"
            :key="project.id"
            class="project-card"
            @click="enterProject(project)"
            @contextmenu="showContextMenuHandler($event, project, 'project')"
          >
            <!-- 文件夹封面区 -->
            <div class="project-thumb">
              <video
                v-if="getProjectCoverUrl(project) && isVideoCover(getProjectCoverUrl(project))"
                :src="getProjectCoverUrl(project)"
                class="cover-media"
                muted
                playsinline
                preload="metadata"
              ></video>
              <img
                v-else-if="getProjectCoverUrl(project)"
                :src="getProjectCoverUrl(project)"
                :alt="project.name"
                class="cover-media"
                loading="lazy"
              />
              <svg v-else width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span v-if="project.is_default" class="default-badge">默认</span>
            </div>
            <!-- 信息 -->
            <div class="project-body">
              <input
                v-if="isInlineRenaming('project', project)"
                v-model="inlineRenameState.name"
                class="project-title inline-rename-input"
                maxlength="50"
                @click.stop
                @keyup.enter="confirmInlineRename"
                @keyup.escape="cancelInlineRename"
                @blur="confirmInlineRename"
              />
              <h3
                v-else
                class="project-title"
                @click.stop="handleTitleClick('project', project)"
                @dblclick.stop="startInlineRename('project', project)"
              >{{ project.name }}</h3>
              <div class="project-meta">
                <span class="meta-item">{{ project.workflow_count || 0 }} 个工作流</span>
                <span class="meta-item">{{ formatDate(project.updated_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ========== 项目内工作流层级 ========== -->
      <template v-else>
        <div v-if="workflows.length === 0 && !loading" class="empty-state">
          <div class="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </div>
          <h3>项目中还没有工作流</h3>
          <p>创建一个新的工作流开始创作</p>
          <button class="create-btn" @click="createNewWorkflow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            创建工作流
          </button>
        </div>

        <!-- 工作流网格 -->
        <div v-else class="workflow-grid">
          <div
            v-for="workflow in workflows"
            :key="workflow.id"
            class="workflow-card"
            @click="openWorkflow(workflow)"
            @contextmenu="showContextMenuHandler($event, workflow, 'workflow')"
          >
            <div class="card-thumb">
              <video
                v-if="getWorkflowCoverUrl(workflow) && isVideoCover(getWorkflowCoverUrl(workflow))"
                :src="getWorkflowCoverUrl(workflow)"
                class="cover-media"
                muted
                playsinline
                preload="metadata"
              ></video>
              <img
                v-else-if="getWorkflowCoverUrl(workflow)"
                :src="getWorkflowCoverUrl(workflow)"
                :alt="workflow.name"
                class="cover-media"
                loading="lazy"
              />
              <svg v-else width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="6" height="6" rx="1"/>
                <rect x="15" y="3" width="6" height="6" rx="1"/>
                <rect x="9" y="15" width="6" height="6" rx="1"/>
                <path d="M6 9v3h3M18 9v3h-3M12 15v-3"/>
              </svg>
            </div>
            <div class="card-body">
              <input
                v-if="isInlineRenaming('workflow', workflow)"
                v-model="inlineRenameState.name"
                class="card-title inline-rename-input"
                maxlength="50"
                @click.stop
                @keyup.enter="confirmInlineRename"
                @keyup.escape="cancelInlineRename"
                @blur="confirmInlineRename"
              />
              <h3
                v-else
                class="card-title"
                @click.stop="handleTitleClick('workflow', workflow)"
                @dblclick.stop="startInlineRename('workflow', workflow)"
              >{{ workflow.name }}</h3>
              <p v-if="workflow.description" class="card-desc">{{ workflow.description }}</p>
              <div class="card-meta">
                <span class="meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><path d="M21 3v4h-4M3 21v-4h4"/>
                  </svg>
                  {{ workflow.node_count }} 节点
                </span>
                <span class="meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {{ formatSize(workflow.storage_size) }}
                </span>
              </div>
              <div class="card-footer">
                <span class="card-time">{{ formatDate(workflow.updated_at) }}</span>
                <button class="delete-btn" @click.stop="confirmDelete(workflow)" title="删除">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 分页 -->
      <div v-if="currentProject && totalWorkflowPages > 1" class="pagination">
        <button class="page-btn" :disabled="pagination.page === 1" @click="changePage(pagination.page - 1)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="page-text">{{ pagination.page }} / {{ totalWorkflowPages }}</span>
        <button class="page-btn" :disabled="pagination.page === totalWorkflowPages" @click="changePage(pagination.page + 1)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Transition name="fade">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
      <template v-if="contextMenu.type === 'project'">
          <button
            class="context-item"
            :class="{ 'context-disabled': contextMenu.item?.is_default }"
            @click="contextMenu.item?.is_default ? null : handleContextAction('move')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            {{ contextMenu.item?.is_default ? '默认项目不可移动' : '移动到其他空间' }}
          </button>
          <button class="context-item" @click="handleContextAction('copy')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            创建项目副本
          </button>
          <button class="context-item" @click="handleContextAction('rename')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            重命名
          </button>
          <button
            class="context-item context-danger"
            :class="{ 'context-disabled': contextMenu.item?.is_default }"
            @click="contextMenu.item?.is_default ? null : handleContextAction('delete')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            {{ contextMenu.item?.is_default ? '默认项目不可删除' : '删除' }}
          </button>
        </template>
        <template v-else-if="contextMenu.type === 'workflow'">
          <button class="context-item" @click="handleContextAction('move')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            移动到项目
          </button>
          <button class="context-item" @click="handleContextAction('copy')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            创建工作流副本
          </button>
          <button class="context-item context-danger" @click="handleContextAction('delete')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            删除
          </button>
        </template>
      </div>
    </Transition>

    <!-- 创建项目弹窗 -->
    <Transition name="fade">
      <div v-if="showCreateProject" class="modal-overlay" @click.self="showCreateProject = false">
        <div class="modal-box">
          <div class="modal-header">
            <h2>新建项目</h2>
            <button class="modal-close" @click="showCreateProject = false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <label class="input-label">项目名称</label>
            <input
              v-model="newProjectName"
              class="modal-input create-project-input"
              placeholder="输入项目名称"
              maxlength="50"
              @keyup.enter="handleCreateProject"
            />
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="showCreateProject = false" :disabled="creatingProject">取消</button>
            <button class="btn-confirm" @click="handleCreateProject" :disabled="creatingProject || !newProjectName.trim()">
              {{ creatingProject ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 重命名弹窗 -->
    <Transition name="fade">
      <div v-if="renameState.visible" class="modal-overlay" @click.self="cancelRename">
        <div class="modal-box">
          <div class="modal-header">
            <h2>重命名</h2>
            <button class="modal-close" @click="cancelRename">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <label class="input-label">名称</label>
            <input
              v-model="renameState.name"
              class="modal-input rename-input"
              placeholder="输入新名称"
              maxlength="50"
              @keyup.enter="handleRename"
            />
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="cancelRename">取消</button>
            <button class="btn-confirm" @click="handleRename" :disabled="!renameState.name.trim()">确认</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 删除工作流确认 -->
    <Transition name="fade">
      <div v-if="deleteConfirm.visible" class="modal-overlay" @click.self="cancelDelete">
        <div class="modal-box">
          <div class="modal-header">
            <h2>确认删除</h2>
            <button class="modal-close" @click="cancelDelete">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p>确定要删除工作流 "<strong>{{ deleteConfirm.workflow?.name }}</strong>" 吗？</p>
            <p class="warning">此操作无法撤销</p>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="cancelDelete">取消</button>
            <button class="btn-delete" @click="handleDelete">删除</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 删除项目确认 -->
    <Transition name="fade">
      <div v-if="projectDeleteConfirm.visible" class="modal-overlay" @click.self="cancelDeleteProject">
        <div class="modal-box">
          <div class="modal-header">
            <h2>确认删除项目</h2>
            <button class="modal-close" @click="cancelDeleteProject">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <p>确定要删除项目 "<strong>{{ projectDeleteConfirm.project?.name }}</strong>" 吗？</p>
            <p class="warning">项目内的工作流将移至默认项目，此操作无法撤销</p>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="cancelDeleteProject">取消</button>
            <button class="btn-delete" @click="handleDeleteProject">删除</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 移动项目/工作流弹窗 -->
    <MoveResourceDialog
      v-model="showMoveDialog"
      :resource-type="moveTarget.type"
      :resource-id="String(moveTarget.id)"
      :resource-name="moveTarget.name"
      :workflow-count="moveTarget.workflowCount"
      :current-space-type="moveTarget.spaceType"
      :current-team-id="String(moveTarget.teamId || '')"
      :current-project-id="String(moveTarget.projectId || '')"
      :space-filter="spaceFilter"
      :source-role="moveTarget.sourceRole"
      :is-default-project="moveTarget.isDefault"
      :operation="moveTarget.operation"
      @moved="onResourceMoved"
    />
  </div>
</template>

<style scoped>
/* 全屏页面，无导航栏 */
.workflow-page {
  min-height: 100vh;
  background: #0a0a0a;
  color: #ffffff;
  display: flex;
  flex-direction: column;
}

/* 顶部工具栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(18, 18, 18, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 100;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* 面包屑 */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
}

.breadcrumb-link {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.2s;
}

.breadcrumb-link:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.06);
}

.breadcrumb-sep {
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.breadcrumb-current {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.page-heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  max-width: min(420px, 42vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-title-input {
  width: min(420px, 42vw);
  min-width: 180px;
  text-align: center;
}

.page-count {
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.new-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #fff;
  border: none;
  border-radius: 8px;
  color: #0a0a0a;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.new-btn:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

/* 配额信息 */
.quota-section {
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.quota-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.quota-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
}

.quota-label { font-size: 12px; color: rgba(255, 255, 255, 0.5); }
.quota-value { font-size: 14px; font-weight: 500; color: #fff; }

.quota-bar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.quota-fill {
  height: 100%;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 3px;
  transition: width 0.3s;
}

.quota-stats { display: flex; gap: 24px; flex-wrap: wrap; }
.stat-box { display: flex; align-items: baseline; gap: 4px; }
.stat-num { font-size: 20px; font-weight: 600; color: #fff; }
.stat-max { font-size: 14px; color: rgba(255, 255, 255, 0.4); }
.stat-text { font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-left: 4px; }
.vip-box { margin-left: auto; }
.vip-tag {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1px;
}

/* 内容区 */
.workflow-content {
  flex: 1;
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: rgba(255, 255, 255, 0.5);
  gap: 16px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon { color: rgba(255, 255, 255, 0.2); margin-bottom: 24px; }
.empty-state h3 { font-size: 20px; font-weight: 600; color: rgba(255, 255, 255, 0.8); margin: 0 0 8px; }
.empty-state p { font-size: 14px; color: rgba(255, 255, 255, 0.4); margin: 0 0 24px; }

.create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #fff;
  border: none;
  border-radius: 8px;
  color: #0a0a0a;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.create-btn:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
}

/* 项目网格 */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.project-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.project-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.project-thumb {
  height: 100px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.25);
  position: relative;
  overflow: hidden;
}

.cover-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.default-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.5px;
}

.project-body { padding: 14px 16px; }

.project-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inline-rename-input {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  padding: 3px 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 6px;
  color: #fff;
  font: inherit;
  line-height: 1.3;
  letter-spacing: 0;
  outline: none;
}

.inline-rename-input:focus {
  border-color: rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.11);
}

.project-title.inline-rename-input,
.card-title.inline-rename-input {
  display: block;
  width: 100%;
  margin: -3px 0 5px;
  white-space: nowrap;
}

.project-meta {
  display: flex;
  gap: 16px;
}

.project-meta .meta-item {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

/* 工作流网格 */
.workflow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.workflow-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.workflow-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.card-thumb {
  height: 120px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  overflow: hidden;
}

.card-body { padding: 16px; }

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  min-height: 36px;
}

.card-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.card-meta .meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.card-meta .meta-item svg { opacity: 0.6; }

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-time { font-size: 12px; color: rgba(255, 255, 255, 0.4); }

.delete-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px 0;
}

.page-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.page-text { font-size: 14px; color: rgba(255, 255, 255, 0.6); }

/* 右键菜单 */
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 160px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.context-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.context-item:hover { background: rgba(255, 255, 255, 0.08); }
.context-danger:hover { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.context-disabled { opacity: 0.4; cursor: not-allowed; }
.context-disabled:hover { background: none; color: rgba(255, 255, 255, 0.8); }

/* 模态框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  width: 90%;
  max-width: 400px;
  background: #141414;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h2 { font-size: 16px; font-weight: 600; color: #fff; margin: 0; }

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
}

.modal-close:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.modal-body { padding: 20px; }
.modal-body p { margin: 0 0 12px; font-size: 14px; color: rgba(255, 255, 255, 0.8); line-height: 1.5; }
.modal-body .warning { font-size: 13px; color: rgba(255, 255, 255, 0.4); }

.input-label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
}

.modal-input {
  width: 100%;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.modal-input:focus { border-color: rgba(255, 255, 255, 0.3); }
.modal-input::placeholder { color: rgba(255, 255, 255, 0.3); }

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-cancel {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover { background: rgba(255, 255, 255, 0.12); }

.btn-confirm {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 6px;
  color: #0a0a0a;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-confirm:hover { background: #fff; }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-delete {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 6px;
  color: #0a0a0a;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-delete:hover { background: #fff; }

/* 白昼模式 */
:root.canvas-theme-light .workflow-page {
  background: #f5f5f4;
  color: #1c1917;
}

:root.canvas-theme-light .top-bar {
  background: rgba(255, 255, 255, 0.95);
  border-bottom-color: rgba(28, 25, 23, 0.1);
}

:root.canvas-theme-light .back-btn,
:root.canvas-theme-light .page-btn {
  background: rgba(28, 25, 23, 0.05);
  border-color: rgba(28, 25, 23, 0.12);
  color: #44403c;
}

:root.canvas-theme-light .back-btn:hover,
:root.canvas-theme-light .page-btn:hover:not(:disabled) {
  background: rgba(28, 25, 23, 0.09);
  color: #1c1917;
}

:root.canvas-theme-light .breadcrumb-link,
:root.canvas-theme-light .page-count,
:root.canvas-theme-light .quota-label,
:root.canvas-theme-light .stat-text,
:root.canvas-theme-light .loading-state,
:root.canvas-theme-light .page-text {
  color: #78716c;
}

:root.canvas-theme-light .breadcrumb-link:hover {
  color: #292524;
  background: rgba(28, 25, 23, 0.06);
}

:root.canvas-theme-light .breadcrumb-sep,
:root.canvas-theme-light .stat-max {
  color: #a8a29e;
}

:root.canvas-theme-light .breadcrumb-current,
:root.canvas-theme-light .page-title,
:root.canvas-theme-light .quota-value,
:root.canvas-theme-light .stat-num {
  color: #1c1917;
}

:root.canvas-theme-light .new-btn,
:root.canvas-theme-light .create-btn,
:root.canvas-theme-light .btn-confirm,
:root.canvas-theme-light .btn-delete {
  background: #1c1917;
  color: #ffffff;
}

:root.canvas-theme-light .new-btn:hover,
:root.canvas-theme-light .create-btn:hover,
:root.canvas-theme-light .btn-confirm:hover,
:root.canvas-theme-light .btn-delete:hover {
  background: #292524;
}

:root.canvas-theme-light .quota-section {
  background: rgba(255, 255, 255, 0.55);
  border-bottom-color: rgba(28, 25, 23, 0.08);
}

:root.canvas-theme-light .quota-bar {
  background: rgba(28, 25, 23, 0.1);
}

:root.canvas-theme-light .quota-fill {
  background: #57534e;
}

:root.canvas-theme-light .vip-tag {
  background: rgba(28, 25, 23, 0.08);
  border-color: rgba(28, 25, 23, 0.18);
  color: #292524;
}

:root.canvas-theme-light .spinner {
  border-color: rgba(28, 25, 23, 0.12);
  border-top-color: #57534e;
}

:root.canvas-theme-light .empty-icon {
  color: #a8a29e;
}

:root.canvas-theme-light .empty-state h3 {
  color: #292524;
}

:root.canvas-theme-light .empty-state p,
:root.canvas-theme-light .project-meta .meta-item,
:root.canvas-theme-light .card-desc,
:root.canvas-theme-light .card-meta .meta-item,
:root.canvas-theme-light .card-time {
  color: #78716c;
}

:root.canvas-theme-light .project-card,
:root.canvas-theme-light .workflow-card {
  background: #ffffff;
  border-color: rgba(28, 25, 23, 0.1);
  box-shadow: 0 1px 3px rgba(28, 25, 23, 0.05);
}

:root.canvas-theme-light .project-card:hover,
:root.canvas-theme-light .workflow-card:hover {
  background: #ffffff;
  border-color: rgba(28, 25, 23, 0.2);
  box-shadow: 0 8px 20px rgba(28, 25, 23, 0.08);
}

:root.canvas-theme-light .project-thumb,
:root.canvas-theme-light .card-thumb {
  background: linear-gradient(135deg, #fafaf9, #e7e5e4);
  color: #a8a29e;
}

:root.canvas-theme-light .project-title,
:root.canvas-theme-light .card-title {
  color: #1c1917;
}

:root.canvas-theme-light .default-badge {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(28, 25, 23, 0.15);
  color: #57534e;
}

:root.canvas-theme-light .inline-rename-input,
:root.canvas-theme-light .modal-input {
  background: #ffffff;
  border-color: rgba(28, 25, 23, 0.18);
  color: #1c1917;
}

:root.canvas-theme-light .inline-rename-input:focus,
:root.canvas-theme-light .modal-input:focus {
  background: #ffffff;
  border-color: #78716c;
}

:root.canvas-theme-light .modal-input::placeholder {
  color: #a8a29e;
}

:root.canvas-theme-light .card-meta,
:root.canvas-theme-light .modal-header,
:root.canvas-theme-light .modal-footer {
  border-color: rgba(28, 25, 23, 0.09);
}

:root.canvas-theme-light .delete-btn {
  color: #78716c;
}

:root.canvas-theme-light .delete-btn:hover,
:root.canvas-theme-light .modal-close:hover,
:root.canvas-theme-light .context-item:hover {
  background: rgba(28, 25, 23, 0.07);
  color: #292524;
}

:root.canvas-theme-light .context-menu,
:root.canvas-theme-light .modal-box {
  background: #ffffff;
  border-color: rgba(28, 25, 23, 0.12);
  box-shadow: 0 12px 32px rgba(28, 25, 23, 0.14);
}

:root.canvas-theme-light .context-item,
:root.canvas-theme-light .context-disabled:hover,
:root.canvas-theme-light .modal-header h2,
:root.canvas-theme-light .modal-body p {
  color: #292524;
}

:root.canvas-theme-light .modal-overlay {
  background: rgba(28, 25, 23, 0.38);
}

:root.canvas-theme-light .modal-close,
:root.canvas-theme-light .modal-body .warning,
:root.canvas-theme-light .input-label {
  color: #78716c;
}

:root.canvas-theme-light .btn-cancel {
  background: rgba(28, 25, 23, 0.06);
  border-color: rgba(28, 25, 23, 0.12);
  color: #44403c;
}

:root.canvas-theme-light .btn-cancel:hover {
  background: rgba(28, 25, 23, 0.1);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

/* 响应式 */
@media (max-width: 640px) {
  .top-bar { padding: 12px 16px; }
  .back-btn span, .new-btn span { display: none; }
  .back-btn, .new-btn { padding: 10px; }
  .page-title { font-size: 16px; }
  .page-title-input { width: min(220px, 48vw); min-width: 120px; }
  .page-count { font-size: 11px; }
  .breadcrumb { display: none; }
  .quota-section { padding: 16px; }
  .quota-row { flex-direction: column; align-items: stretch; }
  .quota-info { flex-direction: row; justify-content: space-between; margin-bottom: 8px; }
  .workflow-content { padding: 16px; }
  .project-grid { grid-template-columns: 1fr; }
  .workflow-grid { grid-template-columns: 1fr; }
}
</style>
