<script setup>
/**
 * SeedanceCharacterPanel.vue - Seedance 角色库管理面板
 * 平铺角色卡片模式，参考 Sora 角色卡片设计
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  createAssetGroup, listAssetGroups, updateAssetGroup, deleteAssetGroup,
  createAsset, listAssets as listVolcAssets, pollAssetStatus,
  updateAsset as updateVolcAsset,
  deleteAsset as deleteVolcAsset
} from '@/api/canvas/volcengine-assets'
import { saveAsset, getAssets, updateAsset, deleteAsset as deleteLocalAsset } from '@/api/canvas/assets'
import { uploadImages } from '@/api/canvas/nodes'
import { getApiUrl } from '@/config/tenant'
import { useTeamStore } from '@/stores/team'

const teamStore = useTeamStore()

const props = defineProps({
  selectedGroupId: {
    type: String,
    default: null
  },
  pendingAction: {
    type: String,
    default: null
  },
  spaceFilter: {
    type: String,
    default: 'current'
  }
})

const emit = defineEmits(['groups-updated', 'clear-group', 'action-consumed', 'insert-to-canvas'])

watch(() => props.pendingAction, (action) => {
  if (action === 'create') {
    showCreateGroupModal.value = true
    emit('action-consumed')
  } else if (action === 'upload') {
    nextTick(() => triggerUpload())
    emit('action-consumed')
  }
}, { immediate: true })

// ========== 状态 ==========
const loading = ref(true)
const groups = ref([])
const allAssets = ref([])
const searchQuery = ref('')
const statusFilter = ref('all')
const errorMessage = ref('')
const currentGroupName = ref('')

// 创建角色组弹窗
const showCreateGroupModal = ref(false)
const createGroupForm = ref({ Name: '', Description: '' })
const createGroupLoading = ref(false)

// 上传角色
const uploadLoading = ref(false)
const fileInputRef = ref(null)

// 轮询取消器
const pollers = ref({})

// 复制提示
const copiedAssetId = ref(null)
let copyTimer = null

// 全屏放大模式
const isFullscreen = ref(false)
const fullscreenGroupId = ref(null)

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  if (isFullscreen.value) {
    fullscreenGroupId.value = null
  }
}

function handleFullscreenKeydown(e) {
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
  }
}

function selectFullscreenGroup(groupId) {
  fullscreenGroupId.value = groupId
}

// ========== 计算属性 ==========
const filteredAssets = computed(() => {
  let result = allAssets.value
  if (statusFilter.value !== 'all') {
    result = result.filter(a => a.Status === statusFilter.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(a =>
      a.Name?.toLowerCase().includes(q) ||
      a.Id?.toLowerCase().includes(q)
    )
  }
  return result
})

const fullscreenFilteredAssets = computed(() => {
  if (!fullscreenGroupId.value) return filteredAssets.value
  return filteredAssets.value.filter(a => a.GroupId === fullscreenGroupId.value)
})

// ========== 方法 ==========

function resolveAssetUrl(url) {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('asset://')) return ''
  return getApiUrl(url)
}

async function loadGroups() {
  try {
    // 直接从后端获取当前用户拥有的所有分组（后端已做租户+用户级隔离）
    const result = await listAssetGroups({ pageSize: 100 })
    groups.value = result.groups || []
  } catch (err) {
    console.error('[SeedancePanel] 加载角色组失败:', err)
  }
}

async function loadAssets() {
  loading.value = true
  errorMessage.value = ''
  try {
    const spaceParams = teamStore.getSpaceParams(props.spaceFilter)
    const result = await getAssets({
      type: 'seedance-character',
      ...spaceParams
    })

    const canvasAssets = result.assets || []
    let mapped = canvasAssets.map(a => {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {})
      return {
        Id: meta.assetId || a.id,
        Name: a.name,
        URL: resolveAssetUrl(a.thumbnail_url) || resolveAssetUrl(a.url),
        Status: meta.status || 'Active',
        GroupId: meta.groupId,
        AssetType: meta.assetType || 'Image',
        _canvasId: a.id,
        _userId: a.user_id
      }
    })

    if (props.selectedGroupId) {
      mapped = mapped.filter(a => a.GroupId === props.selectedGroupId)
      const group = groups.value.find(g => g.Id === props.selectedGroupId)
      currentGroupName.value = group?.Name || ''
    } else {
      currentGroupName.value = ''
    }

    allAssets.value = mapped

    const processingAssets = mapped.filter(a => a.Status === 'Processing')
    for (const asset of processingAssets) {
      if (!pollers.value[asset.Id]) {
        startPolling(asset.Id, asset.GroupId, asset.URL, asset.Name, asset._canvasId)
      }
    }
  } catch (err) {
    errorMessage.value = err.message || '加载角色失败'
  } finally {
    loading.value = false
  }
}

async function refreshAll() {
  await loadGroups()
  await syncFromCloud()
  await loadAssets()
  emit('groups-updated')
}

async function syncFromCloud() {
  if (groups.value.length === 0) return
  
  try {
    const groupIds = groups.value.map(g => g.Id)
    const cloudResult = await listVolcAssets({ groupIds, pageSize: 100 })
    const cloudAssets = cloudResult.assets || []
    if (cloudAssets.length === 0) return
    
    // 查询租户级所有 seedance-character 资产（不限用户），用于去重
    // 避免将其他用户的云端资产同步到当前用户名下
    const tenantResult = await getAssets({ type: 'seedance-character', scope: 'tenant', pageSize: 500 })
    const tenantAssets = tenantResult.assets || []
    
    const tenantAssetIds = new Set()
    for (const a of tenantAssets) {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata || '{}') : (a.metadata || {})
      if (meta.assetId) tenantAssetIds.add(meta.assetId)
    }
    
    // 只同步租户内所有用户都不存在的资产（真正的孤儿资产不再自动同步）
    // 以及当前用户自己空间内缺失的资产（通过个人空间检查）
    const spaceParams = teamStore.getSpaceParams(props.spaceFilter)
    const localResult = await getAssets({ type: 'seedance-character', ...spaceParams, pageSize: 500 })
    const localAssets = localResult.assets || []
    
    const localAssetIds = new Set()
    for (const a of localAssets) {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata || '{}') : (a.metadata || {})
      if (meta.assetId) localAssetIds.add(meta.assetId)
    }
    
    // 云端资产如果在租户内任何用户名下已存在但不在当前用户空间内 → 跳过（属于其他用户）
    // 云端资产如果在租户内完全不存在 → 跳过（孤儿资产，无法确定归属）
    // 只有当前用户空间缺失但租户内已存在的情况：说明是当前用户的资产丢失，才需要恢复
    // 实际上：只有 handleFileUpload 创建的资产才应该出现在用户空间内
    const missing = cloudAssets.filter(ca => {
      if (localAssetIds.has(ca.Id)) return false
      if (tenantAssetIds.has(ca.Id)) return false
      return false // 孤儿资产不自动同步，必须通过 UI 创建
    })
    
    if (missing.length > 0) {
      for (const ca of missing) {
        try {
          await saveAsset({
            type: 'seedance-character',
            name: ca.Name || '角色素材',
            url: `asset://${ca.Id}`,
            thumbnail_url: ca.URL,
            metadata: {
              assetId: ca.Id,
              groupId: ca.GroupId,
              status: ca.Status || 'Active',
              assetType: ca.AssetType || 'Image',
              projectName: ca.ProjectName,
              createTime: ca.CreateTime,
              updateTime: ca.UpdateTime
            },
            spaceType: spaceParams.spaceType,
            teamId: spaceParams.teamId
          })
        } catch (e) {
          console.error('[SeedancePanel] 同步云端资产失败:', ca.Id, e)
        }
      }
      console.log(`[SeedancePanel] 已从云端同步 ${missing.length} 个角色`)
    }
    
    // 更新当前用户已有资产的状态（从云端同步最新状态）
    for (const localAsset of localAssets) {
      const meta = typeof localAsset.metadata === 'string' ? JSON.parse(localAsset.metadata || '{}') : (localAsset.metadata || {})
      if (!meta.assetId) continue
      const cloudAsset = cloudAssets.find(ca => ca.Id === meta.assetId)
      if (cloudAsset && cloudAsset.Status !== meta.status) {
        try {
          await updateAsset(localAsset.id, {
            metadata: { ...meta, status: cloudAsset.Status },
            thumbnail_url: cloudAsset.URL || localAsset.thumbnail_url
          })
        } catch (e) {
          console.error('[SeedancePanel] 更新资产状态失败:', meta.assetId, e)
        }
      }
    }
  } catch (err) {
    console.error('[SeedancePanel] 云端同步失败:', err)
  }
}

async function handleCreateGroup() {
  if (!createGroupForm.value.Name.trim()) return
  createGroupLoading.value = true
  try {
    const spaceParams = teamStore.getSpaceParams(props.spaceFilter)
    const result = await createAssetGroup({
      ...createGroupForm.value,
      spaceType: spaceParams.spaceType,
      teamId: spaceParams.teamId
    })
    showCreateGroupModal.value = false
    createGroupForm.value = { Name: '', Description: '' }
    if (result && result.Id) {
      groups.value.push(result)
    }
    await refreshAll()
  } catch (err) {
    errorMessage.value = err.message
  } finally {
    createGroupLoading.value = false
  }
}

// 删除分组
const showDeleteGroupConfirm = ref(false)
const deleteGroupTarget = ref(null)
const deleteGroupLoading = ref(false)

function requestDeleteGroup(group) {
  deleteGroupTarget.value = group
  showDeleteGroupConfirm.value = true
}

function cancelDeleteGroup() {
  showDeleteGroupConfirm.value = false
  deleteGroupTarget.value = null
}

async function confirmDeleteGroup() {
  if (!deleteGroupTarget.value) return
  const group = deleteGroupTarget.value
  deleteGroupLoading.value = true
  
  try {
    await deleteAssetGroup(group.Id)
    showDeleteGroupConfirm.value = false
    deleteGroupTarget.value = null
    await refreshAll()
  } catch (err) {
    errorMessage.value = '删除分组失败：' + (err.message || '未知错误')
  } finally {
    deleteGroupLoading.value = false
  }
}

const currentGroupIsOwner = computed(() => {
  if (!props.selectedGroupId) return false
  const group = groups.value.find(g => g.Id === props.selectedGroupId)
  return group?._isOwner === true
})

function triggerUpload() {
  fileInputRef.value?.click()
}

async function handleFileUpload(event) {
  const files = event.target.files
  if (!files?.length) return

  const targetGroupId = props.selectedGroupId || groups.value[0]?.Id
  if (!targetGroupId) {
    errorMessage.value = '请先创建一个角色组'
    return
  }

  uploadLoading.value = true
  errorMessage.value = ''
  try {
    const uploadResult = await uploadImages(Array.from(files))
    const urls = Array.isArray(uploadResult) ? uploadResult : (uploadResult.urls || uploadResult.images || [])
    if (!urls.length) throw new Error('上传失败：未返回URL')

    const spaceParams = teamStore.getSpaceParams(props.spaceFilter)

    for (const url of urls) {
      const fileName = files[0]?.name?.replace(/\.[^.]+$/, '') || '角色素材'
      const result = await createAsset({
        GroupId: targetGroupId,
        URL: url,
        AssetType: 'Image',
        Name: fileName
      })
      const asset = result.asset || result
      const assetId = asset.Id || asset.id
      if (assetId) {
        let canvasAssetId = null
        try {
          const saved = await saveAsset({
            type: 'seedance-character',
            name: fileName,
            url: `asset://${assetId}`,
            thumbnail_url: url,
            metadata: {
              assetId,
              groupId: targetGroupId,
              status: 'Processing',
              assetType: 'Image'
            },
            spaceType: spaceParams.spaceType,
            teamId: spaceParams.teamId
          })
          canvasAssetId = saved.id || saved.asset?.id
        } catch (e) {
          console.error('[SeedancePanel] 保存到本地资产库失败:', e)
        }
        startPolling(assetId, targetGroupId, url, fileName, canvasAssetId)
      }
    }
    await loadAssets()
  } catch (err) {
    errorMessage.value = err.message || '上传角色失败'
  } finally {
    uploadLoading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

function startPolling(assetId, groupId, imageUrl, name, canvasAssetId) {
  const { promise, cancel } = pollAssetStatus(assetId, {
    interval: 3000,
    timeout: 120000,
    onStatusChange(status) {
      const idx = allAssets.value.findIndex(a => (a.Id || a.id) === assetId)
      if (idx >= 0) allAssets.value[idx].Status = status
    }
  })

  pollers.value[assetId] = cancel

  promise.then(async (asset) => {
    delete pollers.value[assetId]
    const finalMetadata = {
      assetId: asset.Id,
      groupId: asset.GroupId,
      status: asset.Status,
      assetType: asset.AssetType,
      projectName: asset.ProjectName,
      createTime: asset.CreateTime,
      updateTime: asset.UpdateTime
    }
    try {
      if (canvasAssetId) {
        const updates = { metadata: finalMetadata }
        if (asset.URL) updates.thumbnail_url = asset.URL
        await updateAsset(canvasAssetId, updates)
      } else {
        const spaceParams = teamStore.getSpaceParams(props.spaceFilter)
        await saveAsset({
          type: 'seedance-character',
          name: asset.Name || name || '角色素材',
          url: `asset://${asset.Id}`,
          thumbnail_url: asset.URL || imageUrl,
          metadata: finalMetadata,
          spaceType: spaceParams.spaceType,
          teamId: spaceParams.teamId
        })
      }
    } catch (e) {
      console.error('[SeedancePanel] 保存/更新本地资产库失败:', e)
    }
    loadAssets()
    emit('groups-updated')

    if (asset.Status === 'Active') {
      emit('insert-to-canvas', {
        type: 'seedance-character',
        assetId: asset.Id,
        assetUri: `asset://${asset.Id}`,
        assetUrl: asset.URL || imageUrl,
        groupId: asset.GroupId || groupId,
        assetName: asset.Name || name,
        status: 'Active',
        assetType: asset.AssetType || 'Image'
      })
    }
  }).catch((err) => {
    delete pollers.value[assetId]
    console.error('[SeedancePanel] 轮询失败:', err)
    if (canvasAssetId) {
      updateAsset(canvasAssetId, {
        metadata: { assetId, groupId, status: 'Failed', assetType: 'Image' }
      }).catch(() => {})
    }
    loadAssets()
  })
}

function handleAssetDragStart(e, asset) {
  const data = {
    type: 'seedance-character',
    assetId: asset.Id,
    assetUri: `asset://${asset.Id}`,
    assetUrl: asset.URL,
    groupId: asset.GroupId,
    assetName: asset.Name,
    status: asset.Status,
    assetType: asset.AssetType
  }
  e.dataTransfer.setData('application/json', JSON.stringify(data))
  e.dataTransfer.effectAllowed = 'copy'
}

// 右键菜单
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuAsset = ref(null)

function handleContextMenu(e, asset) {
  e.preventDefault()
  e.stopPropagation()
  contextMenuAsset.value = asset
  contextMenuPosition.value = { x: e.clientX, y: e.clientY }
  showContextMenu.value = true
}

function closeContextMenu() {
  showContextMenu.value = false
  contextMenuAsset.value = null
}

function handleAddToCanvas() {
  if (!contextMenuAsset.value) return
  const asset = contextMenuAsset.value
  emit('insert-to-canvas', {
    type: 'seedance-character',
    assetId: asset.Id,
    assetUri: `asset://${asset.Id}`,
    assetUrl: asset.URL,
    groupId: asset.GroupId,
    assetName: asset.Name,
    status: asset.Status,
    assetType: asset.AssetType
  })
  closeContextMenu()
}

function copyAssetUri(asset) {
  if (editingAssetId.value) return
  const uri = `asset://${asset.Id}`
  navigator.clipboard.writeText(uri).then(() => {
    copiedAssetId.value = asset.Id
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copiedAssetId.value = null }, 1500)
  }).catch(() => {})
}

// 重命名
const editingAssetId = ref(null)
const editingName = ref('')
const editingInputRef = ref(null)

function startRename(asset) {
  editingAssetId.value = asset.Id
  editingName.value = asset.Name || ''
  closeContextMenu()
  nextTick(() => {
    editingInputRef.value?.focus()
    editingInputRef.value?.select()
  })
}

async function confirmRename(asset) {
  const newName = editingName.value.trim()
  editingAssetId.value = null
  if (!newName || newName === asset.Name) return
  
  try {
    await updateVolcAsset(asset.Id, { Name: newName })
    if (asset._canvasId) {
      await updateAsset(asset._canvasId, { name: newName })
    }
    asset.Name = newName
  } catch (err) {
    console.error('[SeedancePanel] 重命名失败:', err)
    errorMessage.value = '重命名失败：' + (err.message || '未知错误')
  }
}

function cancelRename() {
  editingAssetId.value = null
  editingName.value = ''
}

// 删除
const showDeleteConfirm = ref(false)
const deleteTarget = ref(null)
const deleteLoading = ref(false)

function getCurrentUserId() {
  return sessionStorage.getItem('canvas_last_user_id') || ''
}

function isAssetCreator(asset) {
  const uid = getCurrentUserId()
  return uid && asset._userId === uid
}

function requestDelete(asset) {
  closeContextMenu()
  deleteTarget.value = asset
  showDeleteConfirm.value = true
}

function cancelDelete() {
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  const asset = deleteTarget.value
  deleteLoading.value = true
  
  try {
    try {
      await deleteVolcAsset(asset.Id)
    } catch (volcErr) {
      console.warn('[SeedancePanel] 云端删除失败（继续删除本地）:', volcErr.message)
    }
    
    if (asset._canvasId) {
      try {
        await deleteLocalAsset(asset._canvasId)
      } catch (e) {
        console.error('[SeedancePanel] 删除本地资产失败:', e)
      }
    }
    
    allAssets.value = allAssets.value.filter(a => a.Id !== asset.Id)
    emit('groups-updated')
  } catch (err) {
    console.error('[SeedancePanel] 删除角色失败:', err)
    errorMessage.value = '删除失败：' + (err.message || '未知错误')
  } finally {
    deleteLoading.value = false
    showDeleteConfirm.value = false
    deleteTarget.value = null
  }
}

function clearGroupFilter() {
  emit('clear-group')
}

watch(() => props.selectedGroupId, () => {
  loadAssets()
})

watch(() => props.spaceFilter, () => {
  loadAssets()
})

watch(() => teamStore.globalTeamId.value, () => {
  if (props.spaceFilter === 'current') {
    loadAssets()
  }
})

function onGlobalClick() {
  if (showContextMenu.value) closeContextMenu()
}

onMounted(async () => {
  await loadGroups()
  await loadAssets()
  document.addEventListener('click', onGlobalClick)
  document.addEventListener('keydown', handleFullscreenKeydown)
})

onUnmounted(() => {
  Object.values(pollers.value).forEach(cancel => cancel())
  if (copyTimer) clearTimeout(copyTimer)
  document.removeEventListener('click', onGlobalClick)
  document.removeEventListener('keydown', handleFullscreenKeydown)
})
</script>

<template>
  <div class="seedance-panel">
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="handleFileUpload"
    />

    <!-- 顶部工具栏 -->
    <div class="panel-toolbar">
      <!-- 角色组名称指示器 -->
      <div v-if="props.selectedGroupId && currentGroupName" class="group-indicator">
        <span class="group-indicator-label">{{ currentGroupName }}</span>
        <button 
          v-if="currentGroupIsOwner"
          class="group-indicator-delete" 
          @click="requestDeleteGroup(groups.find(g => g.Id === props.selectedGroupId))" 
          title="删除此分组"
        >
          <svg viewBox="0 0 16 16" fill="none" width="10" height="10">
            <path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M5 4.5v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="group-indicator-clear" @click="clearGroupFilter" title="查看全部">
          <svg viewBox="0 0 16 16" fill="none" width="10" height="10">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="toolbar-search">
        <svg class="search-icon" viewBox="0 0 16 16" fill="none">
          <path d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM13 13l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="搜索角色..."
        />
      </div>

      <!-- 筛选 + 操作 -->
      <div class="toolbar-actions">
        <div class="filter-pills">
          <button
            v-for="opt in [
              { value: 'all', label: '全部' },
              { value: 'Active', label: '可用' },
              { value: 'Processing', label: '处理中' },
              { value: 'Failed', label: '失败' }
            ]"
            :key="opt.value"
            class="filter-pill"
            :class="{ active: statusFilter === opt.value }"
            @click="statusFilter = opt.value"
          >{{ opt.label }}</button>
        </div>
        <div class="toolbar-buttons">
          <button class="btn-toolbar" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏浏览'" aria-label="全屏浏览">
            <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="none" width="13" height="13">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" width="13" height="13">
              <path d="M4 14h4v4M20 10h-4V6M14 10l7-7M3 21l7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="btn-toolbar" @click="refreshAll" title="刷新" aria-label="刷新列表">
            <svg viewBox="0 0 16 16" fill="none" width="13" height="13">
              <path d="M13.5 2.5v4h-4M2.5 13.5v-4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3.5 6A5.5 5.5 0 0 1 13 5.5M12.5 10a5.5 5.5 0 0 1-9.5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="btn-toolbar" @click="triggerUpload" :disabled="uploadLoading" title="上传角色" aria-label="上传角色">
            <template v-if="uploadLoading">
              <div class="spinner-xs"></div>
            </template>
            <template v-else>
              <svg viewBox="0 0 16 16" fill="none" width="13" height="13">
                <path d="M8 11V3M5 5.5L8 2.5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 11v2h10v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </template>
          </button>
          <button class="btn-toolbar btn-create" @click="showCreateGroupModal = true" aria-label="新建角色组">
            <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMessage" class="error-bar">
      <span class="error-text">{{ errorMessage }}</span>
      <button @click="errorMessage = ''" class="error-close" aria-label="关闭">
        <svg viewBox="0 0 16 16" fill="none" width="10" height="10">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>加载角色...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="filteredAssets.length === 0" class="empty-state">
      <div class="empty-icon-wrap">
        <svg viewBox="0 0 48 48" fill="none" width="40" height="40">
          <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="18" cy="22" r="4" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="30" cy="22" r="4" stroke="currentColor" stroke-width="1.5"/>
          <path d="M16 32c1.5-2 4-3 8-3s6.5 1 8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="empty-title" v-if="allAssets.length === 0">还没有角色素材</p>
      <p class="empty-title" v-else>未找到匹配结果</p>
      <p class="empty-hint">
        <template v-if="allAssets.length === 0">上传图片创建 Seedance 角色素材</template>
        <template v-else>试试调整搜索或筛选条件</template>
      </p>
      <button v-if="allAssets.length === 0" class="btn-empty-upload" @click="triggerUpload">
        <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
          <path d="M8 11V3M5 5.5L8 2.5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 11v2h10v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        上传角色
      </button>
    </div>

    <!-- 角色卡片网格 -->
    <div v-else class="asset-grid">
      <div
        v-for="asset in filteredAssets"
        :key="asset.Id"
        class="asset-card"
        :class="{
          'is-active': asset.Status === 'Active',
          'is-processing': asset.Status === 'Processing',
          'is-failed': asset.Status === 'Failed'
        }"
        :draggable="asset.Status === 'Active'"
        @dragstart="asset.Status === 'Active' && handleAssetDragStart($event, asset)"
        @click="copyAssetUri(asset)"
        @contextmenu="handleContextMenu($event, asset)"
      >
        <!-- 图片预览区 -->
        <div class="card-thumb">
          <img v-if="asset.URL" :src="asset.URL" :alt="asset.Name" loading="lazy" />
          <div v-else class="thumb-placeholder">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.2"/>
              <circle cx="8.5" cy="10.5" r="2" stroke="currentColor" stroke-width="1.2"/>
              <path d="M21 15l-5-5-8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <!-- Processing 覆盖层 -->
          <div v-if="asset.Status === 'Processing'" class="status-overlay processing-overlay">
            <div class="processing-spinner"></div>
            <span>处理中</span>
          </div>

          <!-- Failed 覆盖层 -->
          <div v-if="asset.Status === 'Failed'" class="status-overlay failed-overlay">
            <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span>失败</span>
          </div>

          <!-- hover 复制提示 -->
          <div v-if="asset.Status === 'Active'" class="copy-hint">
            <template v-if="copiedAssetId === asset.Id">
              <svg viewBox="0 0 16 16" fill="none" width="11" height="11">
                <path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              已复制
            </template>
            <template v-else>
              <svg viewBox="0 0 16 16" fill="none" width="11" height="11">
                <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                <path d="M11 3H4.5A1.5 1.5 0 0 0 3 4.5V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              复制 URI
            </template>
          </div>
        </div>

        <!-- 信息区 -->
        <div class="card-info">
          <div class="card-name-row">
            <input
              v-if="editingAssetId === asset.Id"
              ref="editingInputRef"
              v-model="editingName"
              class="card-name-input"
              @keyup.enter="confirmRename(asset)"
              @keyup.escape="cancelRename"
              @blur="confirmRename(asset)"
              @click.stop
            />
            <span v-else class="card-name" :title="asset.Name" @dblclick.stop="startRename(asset)">{{ asset.Name || '未命名' }}</span>
            <span class="card-uri-tag" :title="`asset://${asset.Id}`">
              @{{ asset.Id?.slice(-8) || '—' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建角色组弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showCreateGroupModal" class="modal-overlay" @click.self="showCreateGroupModal = false">
          <div class="modal-content" @click.stop>
            <div class="modal-header">
              <h3 class="modal-title">创建角色组</h3>
              <button class="modal-close" @click="showCreateGroupModal = false" aria-label="关闭弹窗">
                <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <label class="form-label">名称 <span class="required">*</span></label>
              <input
                v-model="createGroupForm.Name"
                class="form-input"
                placeholder="为角色组起个名字"
                @keyup.enter="handleCreateGroup"
              />
              <label class="form-label form-label-gap">描述</label>
              <textarea
                v-model="createGroupForm.Description"
                class="form-textarea"
                placeholder="简要描述这个角色组的用途（可选）"
                rows="3"
              ></textarea>
            </div>
            <div class="modal-footer">
              <button class="btn-modal-cancel" @click="showCreateGroupModal = false">取消</button>
              <button
                class="btn-modal-confirm"
                @click="handleCreateGroup"
                :disabled="createGroupLoading || !createGroupForm.Name.trim()"
              >
                {{ createGroupLoading ? '创建中...' : '创建' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <Transition name="context-menu">
        <div
          v-if="showContextMenu && contextMenuAsset"
          class="seedance-context-menu"
          :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
          @click.stop
        >
          <button v-if="contextMenuAsset?.Status === 'Active'" class="context-menu-item" @click="handleAddToCanvas">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            添加到画布
          </button>
          <button v-if="contextMenuAsset?.Status === 'Active'" class="context-menu-item" @click="copyAssetUri(contextMenuAsset); closeContextMenu()">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M11 3H4.5A1.5 1.5 0 0 0 3 4.5V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            复制 URI
          </button>
          <button 
            v-if="contextMenuAsset && isAssetCreator(contextMenuAsset)"
            class="context-menu-item context-menu-delete"
            @click="requestDelete(contextMenuAsset)"
          >
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M5 4.5v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            删除角色
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="cancelDelete">
          <div class="modal-content delete-confirm-modal" @click.stop>
            <div class="modal-header">
              <h3 class="modal-title delete-modal-title">确认删除</h3>
              <button class="modal-close" @click="cancelDelete" aria-label="关闭">
                <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <p class="delete-confirm-text">
                确定要删除角色 <strong>{{ deleteTarget?.Name || '未命名' }}</strong> 吗？
              </p>
              <p class="delete-confirm-hint">此操作将同时从火山引擎云端删除，不可恢复。</p>
            </div>
            <div class="modal-footer">
              <button class="btn-modal-cancel" @click="cancelDelete">取消</button>
              <button 
                class="btn-modal-confirm btn-modal-delete"
                @click="confirmDelete"
                :disabled="deleteLoading"
              >
                {{ deleteLoading ? '删除中...' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除分组确认弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showDeleteGroupConfirm" class="modal-overlay" @click.self="cancelDeleteGroup">
          <div class="modal-content delete-confirm-modal" @click.stop>
            <div class="modal-header">
              <h3 class="modal-title delete-modal-title">删除分组</h3>
              <button class="modal-close" @click="cancelDeleteGroup" aria-label="关闭">
                <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <p class="delete-confirm-text">
                确定要删除分组 <strong>{{ deleteGroupTarget?.Name || '未命名' }}</strong> 吗？
              </p>
              <p class="delete-confirm-hint">此操作将删除该分组及其中所有角色素材，不可恢复。</p>
            </div>
            <div class="modal-footer">
              <button class="btn-modal-cancel" @click="cancelDeleteGroup">取消</button>
              <button 
                class="btn-modal-confirm btn-modal-delete"
                @click="confirmDeleteGroup"
                :disabled="deleteGroupLoading"
              >
                {{ deleteGroupLoading ? '删除中...' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 全屏放大浏览 -->
    <Teleport to="body">
      <Transition name="seedance-fullscreen">
        <div v-if="isFullscreen" class="seedance-fullscreen-overlay" @click.self="isFullscreen = false">
          <div class="seedance-fullscreen-panel" @click.stop>
            <!-- 全屏头部 -->
            <div class="fullscreen-header">
              <h3 class="fullscreen-title">
                <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                  <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/>
                  <circle cx="10" cy="11" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  <circle cx="16" cy="11" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M8 16c1-1.5 3-2.5 5-2.5s4 1 5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                Seedance 角色库
                <span class="fullscreen-count">{{ fullscreenFilteredAssets.length }} 个角色</span>
              </h3>
              <div class="fullscreen-toolbar">
                <div class="fullscreen-search">
                  <svg class="search-icon" viewBox="0 0 16 16" fill="none" width="14" height="14">
                    <path d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM13 13l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <input
                    v-model="searchQuery"
                    class="search-input"
                    placeholder="搜索角色..."
                  />
                </div>
                <div class="fullscreen-filters">
                  <button
                    v-for="opt in [
                      { value: 'all', label: '全部' },
                      { value: 'Active', label: '可用' },
                      { value: 'Processing', label: '处理中' },
                      { value: 'Failed', label: '失败' }
                    ]"
                    :key="opt.value"
                    class="filter-pill"
                    :class="{ active: statusFilter === opt.value }"
                    @click="statusFilter = opt.value"
                  >{{ opt.label }}</button>
                </div>
                <button class="btn-toolbar" @click="refreshAll" title="刷新">
                  <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                    <path d="M13.5 2.5v4h-4M2.5 13.5v-4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M3.5 6A5.5 5.5 0 0 1 13 5.5M12.5 10a5.5 5.5 0 0 1-9.5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="btn-toolbar" @click="triggerUpload" :disabled="uploadLoading" title="上传角色">
                  <template v-if="uploadLoading"><div class="spinner-xs"></div></template>
                  <template v-else>
                    <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                      <path d="M8 11V3M5 5.5L8 2.5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M3 11v2h10v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </template>
                </button>
              </div>
              <button class="fullscreen-close" @click="isFullscreen = false" title="退出全屏 (ESC)">
                <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </button>
            </div>

            <!-- 分组筛选栏 -->
            <div v-if="groups.length > 0" class="fullscreen-group-bar">
              <button
                class="fullscreen-group-pill"
                :class="{ active: fullscreenGroupId === null }"
                @click="selectFullscreenGroup(null)"
              >
                <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
                  <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                全部
                <span class="group-pill-count">{{ filteredAssets.length }}</span>
              </button>
              <button
                v-for="group in groups"
                :key="group.Id"
                class="fullscreen-group-pill"
                :class="{ active: fullscreenGroupId === group.Id }"
                @click="selectFullscreenGroup(group.Id)"
              >
                {{ group.Name }}
                <span class="group-pill-count">{{ filteredAssets.filter(a => a.GroupId === group.Id).length }}</span>
              </button>
            </div>

            <!-- 全屏内容 -->
            <div v-if="loading" class="fullscreen-loading">
              <div class="spinner"></div>
              <span>加载角色...</span>
            </div>
            <div v-else-if="fullscreenFilteredAssets.length === 0" class="fullscreen-empty">
              <p>暂无匹配的角色素材</p>
            </div>
            <div v-else class="fullscreen-grid">
              <div
                v-for="asset in fullscreenFilteredAssets"
                :key="asset.Id"
                class="fullscreen-card"
                :class="{
                  'is-active': asset.Status === 'Active',
                  'is-processing': asset.Status === 'Processing',
                  'is-failed': asset.Status === 'Failed'
                }"
                :draggable="asset.Status === 'Active'"
                @dragstart="asset.Status === 'Active' && handleAssetDragStart($event, asset)"
                @click="copyAssetUri(asset)"
                @contextmenu="handleContextMenu($event, asset)"
                @dblclick.stop="startRename(asset)"
              >
                <div class="fullscreen-card-thumb">
                  <img v-if="asset.URL" :src="asset.URL" :alt="asset.Name" loading="lazy" />
                  <div v-else class="thumb-placeholder">
                    <svg viewBox="0 0 48 48" fill="none" width="32" height="32">
                      <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                      <circle cx="24" cy="24" r="6" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
                    </svg>
                  </div>
                  <div v-if="asset.Status === 'Processing'" class="status-overlay processing-overlay">
                    <div class="spinner-sm"></div>
                    <span>处理中</span>
                  </div>
                  <div v-if="asset.Status === 'Failed'" class="status-overlay failed-overlay">
                    <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
                      <path d="M8 5v3M8 10h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                    <span>失败</span>
                  </div>
                  <div v-if="asset.Status === 'Active' && copiedAssetId === asset.Id" class="copy-hint show">已复制 URI</div>
                  <div v-else-if="asset.Status === 'Active'" class="copy-hint">点击复制 URI</div>
                </div>
                <div class="fullscreen-card-info">
                  <input
                    v-if="editingAssetId === asset.Id"
                    ref="editingInputRef"
                    v-model="editingName"
                    class="card-name-input fullscreen-name-input"
                    @keyup.enter="confirmRename(asset)"
                    @keyup.escape="cancelRename"
                    @blur="confirmRename(asset)"
                    @click.stop
                  />
                  <span v-else class="fullscreen-card-name" @dblclick.stop="startRename(asset)">{{ asset.Name || '未命名' }}</span>
                  <span class="card-uri-tag">@{{ asset.Id?.slice(-8) || '—' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.seedance-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow-y: auto;
  padding: 4px 0;
}

.hidden { display: none; }

/* ==================== 工具栏 ==================== */
.panel-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 4px;
}

.group-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
}

.group-indicator-label {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-indicator-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  color: var(--canvas-text-tertiary);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: all 0.2s;
}

.group-indicator-clear:hover {
  color: var(--canvas-text-primary);
  background: rgba(255, 255, 255, 0.1);
}

.group-indicator-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  color: var(--canvas-accent-error, #ef4444);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: all 0.2s;
  opacity: 0.7;
}

.group-indicator-delete:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.1);
}

.toolbar-search {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: var(--canvas-text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 6px 8px 6px 28px;
  font-size: 12px;
  border: 1px solid var(--canvas-border-default);
  border-radius: 6px;
  background: var(--canvas-bg-elevated);
  color: var(--canvas-text-primary);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.search-input::placeholder { color: var(--canvas-text-placeholder); }
.search-input:focus {
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.06);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.filter-pills {
  display: flex;
  gap: 4px;
}

.filter-pill {
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid var(--canvas-border-default);
  border-radius: 12px;
  background: transparent;
  color: var(--canvas-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  line-height: 1.4;
}

.filter-pill:hover {
  border-color: var(--canvas-border-active);
  color: var(--canvas-text-primary);
}

.filter-pill.active {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.toolbar-buttons {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  color: var(--canvas-text-secondary);
  border: 1px solid var(--canvas-border-default);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-toolbar:hover {
  color: var(--canvas-text-primary);
  border-color: var(--canvas-border-active);
  background: var(--canvas-bg-tertiary);
}

.btn-toolbar:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-toolbar.btn-create {
  background: rgba(0, 0, 0, 0.7);
  border-color: rgba(0, 0, 0, 0.3);
  color: #fff;
}

.btn-toolbar.btn-create:hover {
  background: rgba(0, 0, 0, 0.85);
}

/* ==================== 错误提示 ==================== */
.error-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: 0 4px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 8px;
  font-size: 12px;
  color: var(--canvas-accent-error);
}

.error-text { flex: 1; line-height: 1.4; }

.error-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  color: var(--canvas-accent-error);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: background 0.2s;
}

.error-close:hover { background: rgba(239, 68, 68, 0.1); }

/* ==================== 加载/空状态 ==================== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: var(--canvas-text-tertiary);
  font-size: 12px;
  gap: 12px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--canvas-border-default);
  border-top-color: rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-xs {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--canvas-border-default);
  border-top-color: rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 8px;
}

.empty-icon-wrap { color: var(--canvas-text-tertiary); opacity: 0.4; }

.empty-title {
  font-size: 13px;
  color: var(--canvas-text-secondary);
  margin: 4px 0 0;
}

.empty-hint {
  font-size: 11px;
  color: var(--canvas-text-tertiary);
  margin: 0;
  text-align: center;
  line-height: 1.5;
}

.btn-empty-upload {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 6px 14px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-empty-upload:hover { opacity: 0.85; }

/* ==================== 角色卡片网格 ==================== */
.asset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 0 4px;
}

.asset-card {
  position: relative;
  border: 1px solid var(--canvas-border-default);
  border-radius: 10px;
  overflow: hidden;
  background: var(--canvas-bg-elevated);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.asset-card.is-active {
  cursor: pointer;
}

.asset-card.is-active:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
}

.asset-card.is-processing {
  border-color: rgba(255, 255, 255, 0.2);
}

.asset-card.is-failed {
  border-color: rgba(239, 68, 68, 0.3);
}

/* 图片预览区 */
.card-thumb {
  position: relative;
  aspect-ratio: 1;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%);
  overflow: hidden;
}

.card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.asset-card.is-active:hover .card-thumb img {
  transform: scale(1.05);
}

.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--canvas-text-tertiary);
  opacity: 0.3;
}

/* 状态覆盖层 */
.status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 500;
}

.processing-overlay {
  background: rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(2px);
}

.processing-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.failed-overlay {
  background: rgba(0, 0, 0, 0.5);
  color: rgba(239, 68, 68, 0.9);
  backdrop-filter: blur(2px);
}

/* hover 复制提示 */
.copy-hint {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 6px;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
  white-space: nowrap;
  backdrop-filter: blur(4px);
}

.asset-card.is-active:hover .copy-hint {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* 信息区 */
.card-info {
  padding: 6px 8px;
}

.card-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.card-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--canvas-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  line-height: 1.4;
  cursor: text;
}

.card-name-input {
  flex: 1;
  min-width: 0;
  padding: 1px 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--canvas-text-primary);
  background: var(--canvas-bg-secondary, rgba(255,255,255,0.06));
  border: 1px solid #f59e0b;
  border-radius: 4px;
  outline: none;
  box-sizing: border-box;
  line-height: 1.4;
}

.card-uri-tag {
  display: inline-block;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==================== 弹窗 ==================== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--canvas-bg-elevated);
  border: 1px solid var(--canvas-border-default);
  border-radius: 12px;
  width: 360px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--canvas-text-primary);
  margin: 0;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--canvas-text-tertiary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.modal-close:hover {
  color: var(--canvas-text-primary);
  background: var(--canvas-bg-tertiary);
}

.modal-body {
  padding: 4px 20px 16px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-secondary);
  margin-bottom: 6px;
}

.form-label-gap { margin-top: 12px; }

.required { color: var(--canvas-accent-error); }

.form-input, .form-textarea {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--canvas-border-default);
  border-radius: 8px;
  background: var(--canvas-bg-secondary);
  color: var(--canvas-text-primary);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input::placeholder, .form-textarea::placeholder {
  color: var(--canvas-text-placeholder);
}

.form-input:focus, .form-textarea:focus {
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.06);
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
  min-height: 60px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
}

.btn-modal-cancel {
  padding: 6px 14px;
  font-size: 12px;
  background: transparent;
  color: var(--canvas-text-secondary);
  border: 1px solid var(--canvas-border-default);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-modal-cancel:hover {
  color: var(--canvas-text-primary);
  border-color: var(--canvas-border-active);
}

.btn-modal-confirm {
  padding: 6px 16px;
  font-size: 12px;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-modal-confirm:hover { background: #222; }
.btn-modal-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

/* ==================== 过渡动画 ==================== */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .modal-content,
.modal-fade-leave-active .modal-content {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .modal-content {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}

.modal-fade-leave-to .modal-content {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}

/* ==================== 全屏放大模式 ==================== */
.seedance-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.seedance-fullscreen-panel {
  width: 92vw;
  max-width: 1400px;
  height: calc(100vh - 60px);
  background: linear-gradient(180deg, rgba(30, 30, 32, 0.98) 0%, rgba(24, 24, 26, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  overflow: hidden;
}

.fullscreen-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  gap: 12px;
}

.fullscreen-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--canvas-text-primary, #fff);
  margin: 0;
  white-space: nowrap;
  flex-shrink: 0;
}

.fullscreen-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--canvas-text-tertiary, rgba(255, 255, 255, 0.4));
  margin-left: 4px;
}

.fullscreen-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.fullscreen-search {
  position: relative;
  width: 220px;
  flex-shrink: 0;
}

.fullscreen-search .search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--canvas-text-placeholder, rgba(255, 255, 255, 0.3));
  pointer-events: none;
}

.fullscreen-search .search-input {
  width: 100%;
  padding: 7px 10px 7px 32px;
  font-size: 13px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--canvas-text-primary, #fff);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.fullscreen-search .search-input:focus {
  border-color: rgba(255, 255, 255, 0.25);
}

.fullscreen-search .search-input::placeholder {
  color: var(--canvas-text-placeholder, rgba(255, 255, 255, 0.3));
}

.fullscreen-filters {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* 分组筛选栏 */
.fullscreen-group-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.fullscreen-group-bar::-webkit-scrollbar {
  display: none;
}

.fullscreen-group-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.55));
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex-shrink: 0;
}

.fullscreen-group-pill:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--canvas-text-primary, #fff);
  border-color: rgba(255, 255, 255, 0.15);
}

.fullscreen-group-pill.active {
  background: rgba(255, 255, 255, 0.12);
  color: var(--canvas-text-primary, #fff);
  border-color: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

.fullscreen-group-pill svg {
  flex-shrink: 0;
}

.group-pill-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--canvas-text-tertiary, rgba(255, 255, 255, 0.35));
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 8px;
  min-width: 18px;
  text-align: center;
}

.fullscreen-group-pill.active .group-pill-count {
  background: rgba(255, 255, 255, 0.1);
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.6));
}

.fullscreen-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.6));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
  margin-left: auto;
}

.fullscreen-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--canvas-text-primary, #fff);
}

.fullscreen-loading,
.fullscreen-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 14px;
}

.fullscreen-grid {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  align-content: start;
}

.fullscreen-card {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.fullscreen-card.is-active {
  cursor: pointer;
}

.fullscreen-card.is-active:hover {
  transform: translateY(-3px);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.fullscreen-card.is-active:hover .fullscreen-card-thumb img {
  transform: scale(1.05);
}

.fullscreen-card.is-failed {
  border-color: rgba(239, 68, 68, 0.3);
}

.fullscreen-card-thumb {
  position: relative;
  aspect-ratio: 3/4;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
  overflow: hidden;
}

.fullscreen-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.fullscreen-card-info {
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.fullscreen-card-name {
  font-size: 13px;
  color: var(--canvas-text-primary, #fff);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  cursor: text;
}

.fullscreen-name-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  padding: 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--canvas-text-primary, #fff);
  outline: none;
  box-sizing: border-box;
}

/* 全屏模式过渡动画 */
.seedance-fullscreen-enter-active {
  transition: opacity 0.25s ease;
}
.seedance-fullscreen-enter-active .seedance-fullscreen-panel {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.seedance-fullscreen-leave-active {
  transition: opacity 0.2s ease;
}
.seedance-fullscreen-leave-active .seedance-fullscreen-panel {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.seedance-fullscreen-enter-from {
  opacity: 0;
}
.seedance-fullscreen-enter-from .seedance-fullscreen-panel {
  transform: scale(0.95);
  opacity: 0;
}
.seedance-fullscreen-leave-to {
  opacity: 0;
}
.seedance-fullscreen-leave-to .seedance-fullscreen-panel {
  transform: scale(0.95);
  opacity: 0;
}

/* 全屏模式响应式 */
@media (max-width: 1200px) {
  .fullscreen-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 900px) {
  .fullscreen-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ==================== 亮色主题适配 ==================== */
:root.canvas-theme-light .seedance-panel .search-input {
  background: var(--canvas-bg-tertiary);
}

:root.canvas-theme-light .seedance-panel .filter-pill {
  background: var(--canvas-bg-tertiary);
  border-color: transparent;
}

:root.canvas-theme-light .seedance-panel .filter-pill.active {
  background: rgba(0, 0, 0, 0.7);
  border-color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .seedance-panel .group-indicator {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .seedance-panel .asset-card {
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .seedance-panel .asset-card.is-active:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .seedance-panel .card-thumb {
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.03) 0%, rgba(0, 0, 0, 0.02) 100%);
}

:root.canvas-theme-light .seedance-panel .card-uri-tag {
  color: rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .seedance-panel .error-bar {
  background: rgba(239, 68, 68, 0.06);
  border-color: rgba(239, 68, 68, 0.12);
}

:root.canvas-theme-light .modal-overlay {
  background: rgba(0, 0, 0, 0.25);
}

:root.canvas-theme-light .modal-content {
  background: #fff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
}

:root.canvas-theme-light .form-input,
:root.canvas-theme-light .form-textarea {
  background: var(--canvas-bg-tertiary);
}

/* ==================== 右键菜单 ==================== */
.seedance-context-menu {
  position: fixed;
  z-index: 99999;
  min-width: 160px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(16px);
}

.seedance-context-menu .context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}

.seedance-context-menu .context-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.context-menu-delete {
  color: rgba(239, 68, 68, 0.9) !important;
}

.context-menu-delete:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  color: #ef4444 !important;
}

.context-menu-enter-active { transition: all 0.15s ease-out; }
.context-menu-leave-active { transition: all 0.1s ease-in; }
.context-menu-enter-from { opacity: 0; transform: scale(0.95); }
.context-menu-leave-to { opacity: 0; transform: scale(0.95); }

/* 删除确认弹窗 */
.delete-confirm-modal {
  width: 340px;
}

.delete-modal-title {
  color: var(--canvas-accent-error, #ef4444) !important;
}

.delete-confirm-text {
  font-size: 14px;
  color: var(--canvas-text-primary);
  margin: 0 0 8px;
  line-height: 1.5;
}

.delete-confirm-text strong {
  color: var(--canvas-text-primary);
}

.delete-confirm-hint {
  font-size: 12px;
  color: var(--canvas-text-tertiary);
  margin: 0;
  line-height: 1.4;
}

.btn-modal-delete {
  background: #ef4444 !important;
  color: #fff !important;
}

.btn-modal-delete:hover:not(:disabled) {
  background: #dc2626 !important;
}

.btn-modal-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:root.canvas-theme-light .seedance-context-menu {
  background: #fff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .seedance-context-menu .context-menu-item {
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .seedance-context-menu .context-menu-item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #000;
}

:root.canvas-theme-light .seedance-context-menu .context-menu-delete:hover {
  background: rgba(239, 68, 68, 0.08) !important;
  color: #dc2626 !important;
}

:root.canvas-theme-light .delete-confirm-modal {
  background: #fff;
}

:root.canvas-theme-light .btn-modal-delete {
  background: #ef4444 !important;
}

/* ==================== 全屏模式 - 亮色主题 ==================== */
:root.canvas-theme-light .seedance-fullscreen-overlay {
  background: rgba(255, 255, 255, 0.75);
}

:root.canvas-theme-light .seedance-fullscreen-panel {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(250, 250, 252, 0.99) 100%);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.03) inset;
}

:root.canvas-theme-light .fullscreen-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .fullscreen-group-bar {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .fullscreen-group-pill {
  color: rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .fullscreen-group-pill:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.8);
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .fullscreen-group-pill.active {
  background: rgba(0, 0, 0, 0.08);
  color: #1a1a1a;
  border-color: rgba(0, 0, 0, 0.18);
}

:root.canvas-theme-light .group-pill-count {
  color: rgba(0, 0, 0, 0.4);
  background: rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .fullscreen-group-pill.active .group-pill-count {
  color: rgba(0, 0, 0, 0.55);
  background: rgba(0, 0, 0, 0.07);
}

:root.canvas-theme-light .fullscreen-search .search-input {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
  color: #1a1a1a;
}

:root.canvas-theme-light .fullscreen-search .search-input:focus {
  border-color: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .fullscreen-close {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .fullscreen-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .fullscreen-card {
  background: #fff;
  border-color: rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .fullscreen-card.is-active:hover {
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .fullscreen-card-thumb {
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.03) 0%, rgba(0, 0, 0, 0.01) 100%);
}

:root.canvas-theme-light .fullscreen-card-name {
  color: #1a1a1a;
}

:root.canvas-theme-light .fullscreen-name-input {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.15);
  color: #1a1a1a;
}
</style>
