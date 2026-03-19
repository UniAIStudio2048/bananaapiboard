<script setup>
/**
 * SeedanceCharacterSelector.vue - 角色选择弹窗
 * 用于在 SeedanceCharacterNode 中选择/更换角色
 * 从本地 canvas_assets 读取，实现用户级隔离
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { listAssetGroups } from '@/api/canvas/volcengine-assets'
import { getAssets } from '@/api/canvas/assets'
import { useTeamStore } from '@/stores/team'

const teamStore = useTeamStore()

const props = defineProps({
  visible: Boolean,
  currentAssetId: String
})

const emit = defineEmits(['update:visible', 'select'])

const loading = ref(false)
const groups = ref([])
const selectedGroupId = ref(null)
const assets = ref([])
const assetsLoading = ref(false)
const selectedAsset = ref(null)
const allLocalAssets = ref([])

// 只显示 Active 资产
const activeAssets = computed(() =>
  assets.value.filter(a => a.Status === 'Active')
)

async function loadGroups() {
  loading.value = true
  try {
    const result = await listAssetGroups()
    groups.value = (result.groups || []).map(g => ({ ...g, _assetCount: null }))
    if (groups.value.length > 0 && !selectedGroupId.value) {
      selectedGroupId.value = groups.value[0].Id
    }
    await loadAllLocalAssets()
    updateGroupCounts()
  } catch (err) {
    console.error('[CharacterSelector] 加载角色组失败:', err)
  } finally {
    loading.value = false
  }
}

async function loadAllLocalAssets() {
  try {
    const spaceParams = teamStore.getSpaceParams('current')
    const result = await getAssets({
      type: 'seedance-character',
      ...spaceParams,
      pageSize: 500
    })
    allLocalAssets.value = (result.assets || []).map(a => {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata || '{}') : (a.metadata || {})
      return {
        Id: meta.assetId || a.id,
        Name: a.name,
        URL: a.thumbnail_url || a.url,
        Status: meta.status || 'Active',
        GroupId: meta.groupId,
        AssetType: meta.assetType || 'Image',
        _canvasId: a.id,
        _userId: a.user_id
      }
    })
  } catch (err) {
    console.error('[CharacterSelector] 加载本地资产失败:', err)
    allLocalAssets.value = []
  }
}

function updateGroupCounts() {
  for (const group of groups.value) {
    group._assetCount = allLocalAssets.value.filter(a => a.GroupId === group.Id).length
  }
}

async function loadAssets(groupId) {
  if (!groupId) return
  assetsLoading.value = true
  try {
    assets.value = allLocalAssets.value.filter(a => a.GroupId === groupId)
  } catch (err) {
    console.error('[CharacterSelector] 加载资产失败:', err)
    assets.value = []
  } finally {
    assetsLoading.value = false
  }
}

function selectGroup(groupId) {
  selectedGroupId.value = groupId
  selectedAsset.value = null
  loadAssets(groupId)
}

function selectAssetItem(asset) {
  selectedAsset.value = asset
}

function confirm() {
  if (selectedAsset.value) {
    emit('select', selectedAsset.value)
    emit('update:visible', false)
  }
}

function close() {
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    selectedAsset.value = null
    loadGroups()
  }
})

watch(selectedGroupId, (id) => {
  if (id) loadAssets(id)
})

onMounted(() => {
  if (props.visible) loadGroups()
})

// 悬浮预览
const hoverAsset = ref(null)
const hoverStyle = ref({})
let hoverTimer = null

function handleAssetMouseEnter(asset, event) {
  if (!asset.URL) return
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    hoverAsset.value = asset
    nextTick(() => positionPreview(event))
  }, 200)
}

function handleAssetMouseMove(event) {
  if (hoverAsset.value) positionPreview(event)
}

function handleAssetMouseLeave() {
  clearTimeout(hoverTimer)
  hoverAsset.value = null
}

function positionPreview(event) {
  const previewW = 280
  const previewH = 280
  const gap = 12
  const el = event.currentTarget
  if (!el) return
  const rect = el.getBoundingClientRect()

  let x = rect.right + gap
  let y = rect.top + (rect.height - previewH) / 2

  if (x + previewW > window.innerWidth - 10) {
    x = rect.left - previewW - gap
  }
  if (y < 10) y = 10
  if (y + previewH > window.innerHeight - 10) {
    y = window.innerHeight - previewH - 10
  }

  hoverStyle.value = {
    left: `${x}px`,
    top: `${y}px`,
    width: `${previewW}px`,
    height: `${previewH}px`
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="selector-overlay" @click.self="close">
      <div class="selector-modal">
        <div class="selector-header">
          <h3>选择角色素材</h3>
          <button class="close-btn" @click="close">✕</button>
        </div>
        <div class="selector-body">
          <!-- 左侧：角色组列表 -->
          <div class="group-sidebar">
            <div v-if="loading" class="sidebar-loading">
              <div class="spinner-sm"></div>
            </div>
            <div v-else-if="groups.length === 0" class="sidebar-empty">
              暂无角色组
            </div>
            <button
              v-for="group in groups"
              :key="group.Id"
              class="group-btn"
              :class="{ active: selectedGroupId === group.Id }"
              @click="selectGroup(group.Id)"
            >
              <span class="group-btn-name">{{ group.Name }}</span>
              <span class="group-btn-count">{{ group._assetCount ?? '...' }}</span>
            </button>
          </div>

          <!-- 右侧：资产网格 -->
          <div class="asset-area">
            <div v-if="assetsLoading" class="area-loading">
              <div class="spinner-sm"></div>
              <span>加载中...</span>
            </div>
            <div v-else-if="activeAssets.length === 0" class="area-empty">
              <span>该组暂无可用角色</span>
            </div>
            <div v-else class="asset-grid">
              <div
                v-for="asset in activeAssets"
                :key="asset.Id"
                class="asset-item"
                :class="{
                  selected: selectedAsset?.Id === asset.Id,
                  current: currentAssetId === asset.Id
                }"
                @click="selectAssetItem(asset)"
                @mouseenter="handleAssetMouseEnter(asset, $event)"
                @mousemove="handleAssetMouseMove"
                @mouseleave="handleAssetMouseLeave"
              >
                <div class="item-thumb">
                  <img v-if="asset.URL" :src="asset.URL" :alt="asset.Name" loading="lazy" />
                  <div v-else class="item-placeholder">👥</div>
                </div>
                <span class="item-name">{{ asset.Name || '未命名' }}</span>
                <span v-if="currentAssetId === asset.Id" class="current-badge">当前</span>
              </div>
            </div>

            <!-- 悬浮预览 -->
            <Teleport to="body">
              <div
                v-if="hoverAsset"
                class="asset-hover-preview"
                :style="hoverStyle"
              >
                <img :src="hoverAsset.URL" :alt="hoverAsset.Name" />
              </div>
            </Teleport>
          </div>
        </div>

        <div class="selector-footer">
          <button class="btn-cancel" @click="close">取消</button>
          <button
            class="btn-confirm"
            :disabled="!selectedAsset"
            @click="confirm"
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ========== 遮罩层 ========== */
.selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

/* ========== 弹窗主体 ========== */
.selector-modal {
  background: var(--canvas-bg-elevated);
  border: 1px solid var(--canvas-border-default);
  border-radius: var(--canvas-radius-md);
  width: 640px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--canvas-shadow-lg);
}

/* ========== 头部 ========== */
.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--canvas-border-default);
}
.selector-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--canvas-text-primary);
}
.close-btn {
  background: none;
  border: none;
  color: var(--canvas-text-secondary);
  font-size: 16px;
  cursor: pointer;
  transition: color 0.15s;
}
.close-btn:hover {
  color: var(--canvas-text-primary);
}

/* ========== 主体 ========== */
.selector-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ========== 左侧角色组 ========== */
.group-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--canvas-border-default);
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-loading,
.sidebar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 8px;
  color: var(--canvas-text-tertiary);
  font-size: 12px;
}
.group-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--canvas-radius-sm);
  color: var(--canvas-text-secondary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.group-btn:hover {
  background: var(--canvas-bg-tertiary);
}
.group-btn.active {
  background: rgba(59, 130, 246, 0.12);
  border-color: var(--canvas-accent-primary);
  color: var(--canvas-accent-primary);
}
.group-btn-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.group-btn-count {
  font-size: 10px;
  color: var(--canvas-text-tertiary);
  flex-shrink: 0;
  margin-left: 4px;
}

/* ========== 右侧资产区 ========== */
.asset-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.area-loading,
.area-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: var(--canvas-text-tertiary);
  font-size: 13px;
  gap: 8px;
}
.asset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.asset-item {
  position: relative;
  border: 2px solid var(--canvas-border-default);
  border-radius: var(--canvas-radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--canvas-bg-secondary);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.asset-item:hover {
  border-color: var(--canvas-border-active);
}
.asset-item.selected {
  border-color: var(--canvas-accent-primary);
  box-shadow: 0 0 0 1px var(--canvas-accent-primary);
}
.asset-item.current {
  border-color: var(--canvas-accent-success);
}

.item-thumb {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--canvas-bg-primary);
}
.item-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 28px;
  color: var(--canvas-text-tertiary);
}
.item-name {
  display: block;
  padding: 4px 6px;
  font-size: 11px;
  color: var(--canvas-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 6px;
  font-size: 10px;
  background: rgba(34, 197, 94, 0.2);
  color: var(--canvas-accent-success);
  border-radius: 3px;
  font-weight: 500;
}

/* ========== 底部操作栏 ========== */
.selector-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--canvas-border-default);
}
.btn-cancel {
  padding: 6px 16px;
  font-size: 13px;
  background: transparent;
  color: var(--canvas-text-secondary);
  border: 1px solid var(--canvas-border-default);
  border-radius: var(--canvas-radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-cancel:hover {
  color: var(--canvas-text-primary);
  border-color: var(--canvas-border-active);
}
.btn-confirm {
  padding: 6px 16px;
  font-size: 13px;
  background: var(--canvas-accent-primary);
  color: #fff;
  border: none;
  border-radius: var(--canvas-radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-confirm:hover {
  filter: brightness(1.1);
}
.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: none;
}

/* ========== 加载动画 ========== */
.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid var(--canvas-border-default);
  border-top-color: var(--canvas-accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 悬浮预览 ========== */
.asset-hover-preview {
  position: fixed;
  z-index: 10001;
  border-radius: 6px;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
  animation: preview-fade-in 0.15s ease;
}
.asset-hover-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: var(--canvas-bg-primary, #1a1a1a);
}
@keyframes preview-fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* ========== 白昼模式适配 ========== */
:root.canvas-theme-light .selector-overlay {
  background: rgba(0, 0, 0, 0.35);
}
:root.canvas-theme-light .selector-modal {
  background: var(--canvas-bg-elevated);
  border-color: var(--canvas-border-subtle);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}
:root.canvas-theme-light .group-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}
:root.canvas-theme-light .group-btn.active {
  background: rgba(59, 130, 246, 0.08);
}
:root.canvas-theme-light .asset-item {
  border-color: var(--canvas-border-subtle);
}
:root.canvas-theme-light .asset-item:hover {
  border-color: var(--canvas-border-default);
  box-shadow: var(--canvas-shadow-sm);
}
:root.canvas-theme-light .current-badge {
  background: rgba(34, 197, 94, 0.12);
}
:root.canvas-theme-light .btn-cancel:hover {
  background: rgba(0, 0, 0, 0.04);
}
</style>
