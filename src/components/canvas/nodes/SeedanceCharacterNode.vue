<script setup>
/**
 * SeedanceCharacterNode.vue - Seedance 角色节点
 * 无边框设计，匹配 ImageNode 风格
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import SeedanceCharacterSelector from '../SeedanceCharacterSelector.vue'
import { smartDownload } from '@/api/client'
import { getAsset as getVolcengineAsset } from '@/api/canvas/volcengine-assets'

const LONG_PRESS_DURATION = 300

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const { updateNodeInternals, getViewport } = useVueFlow()

// 火山 seedance 资产的 URL 是带签名的临时链接，可能过期；同时从资产库拖入时
// 也可能存在 thumbnail_url 为空导致 assetUrl 为空。任意一种情况下，节点都需要
// 根据 assetId 重新向后端拉取最新的 URL，保证刷新后图片不会"丢失"。
const isResolvingAsset = ref(false)
let assetUrlRetryCount = 0
const MAX_ASSET_URL_RETRY = 1
// 资产图片彻底加载失败时显示"重新选择"入口，避免节点只能删除
const assetLoadFailed = ref(false)

async function resolveAssetUrl({ force = false } = {}) {
  const assetId = props.data?.assetId
  if (!assetId) return
  if (isResolvingAsset.value) return
  if (!force && props.data?.assetUrl) return

  isResolvingAsset.value = true
  try {
    const result = await getVolcengineAsset(assetId)
    const asset = result?.asset || result
    const freshUrl = asset?.URL || asset?.url
    if (!freshUrl) return

    const existingOutput = props.data?.output || {}
    canvasStore.updateNodeData(props.id, {
      assetUrl: freshUrl,
      thumbnailUrl: freshUrl,
      thumbnail_url: freshUrl,
      assetName: asset?.Name || props.data?.assetName,
      status: asset?.Status || props.data?.status,
      assetType: asset?.AssetType || props.data?.assetType,
      output: {
        ...existingOutput,
        thumbnailUrl: freshUrl
      }
    })
  } catch (err) {
    console.warn('[SeedanceCharacterNode] 重新解析角色 URL 失败:', err?.message || err)
  } finally {
    isResolvingAsset.value = false
  }
}

function handleImageError() {
  if (!props.data?.assetId) return
  if (assetUrlRetryCount >= MAX_ASSET_URL_RETRY) {
    // 重试次数耗尽，标记为彻底失败，让用户看到"重新选择角色"入口
    assetLoadFailed.value = true
    return
  }
  assetUrlRetryCount += 1
  resolveAssetUrl({ force: true })
}

onMounted(() => {
  nextTick(() => {
    updateNodeInternals(props.id)
    // 节点挂载时只要有 assetId 但 assetUrl 缺失就立即补齐
    if (props.data?.assetId && !props.data?.assetUrl) {
      resolveAssetUrl()
    }
  })
})

// 资产 ID 变更（如重新选择角色）时，重置重试计数
watch(() => props.data?.assetId, () => {
  assetUrlRetryCount = 0
  assetLoadFailed.value = false
})

// assetUrl 变更时也重置失败标志，给新 URL 一次机会
watch(() => props.data?.assetUrl, () => {
  assetLoadFailed.value = false
})

const showSelector = ref(false)
const showPreviewModal = ref(false)

// 标签编辑
const isEditingLabel = ref(false)
const labelInputRef = ref(null)
const localLabel = ref(props.data?.label || props.data?.assetName || 'Seedance 角色')

watch(() => props.data?.assetName, (newName) => {
  if (!props.data?.label && newName) {
    localLabel.value = newName
  }
})

watch(() => props.data?.label, (newLabel) => {
  if (newLabel) {
    localLabel.value = newLabel
  }
})

function handleLabelDoubleClick(event) {
  event.stopPropagation()
  isEditingLabel.value = true
  nextTick(() => {
    if (labelInputRef.value) {
      labelInputRef.value.focus()
      labelInputRef.value.select()
    }
  })
}

function saveLabelEdit() {
  isEditingLabel.value = false
  const newLabel = localLabel.value.trim() || props.data?.assetName || 'Seedance 角色'
  localLabel.value = newLabel
  canvasStore.updateNodeData(props.id, { label: newLabel })
}

function handleLabelKeyDown(event) {
  if (event.key === 'Enter') {
    saveLabelEdit()
  } else if (event.key === 'Escape') {
    isEditingLabel.value = false
    localLabel.value = props.data?.label || props.data?.assetName || 'Seedance 角色'
  }
}

// 节点尺寸
const nodeWidth = ref(props.data?.width || 220)
const nodeHeight = ref(props.data?.height || null)
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })
let resizeRafId = null

// 右侧 + 按钮交互
const addBtnRef = ref(null)
let pressTimer = null
let isLongPress = false
let pressStartPos = { x: 0, y: 0 }

const hasCharacter = computed(() => !!props.data?.assetId)
const statusClass = computed(() => {
  const s = props.data?.status
  if (s === 'Active') return 'status-active'
  if (s === 'Processing') return 'status-processing'
  if (s === 'Failed') return 'status-failed'
  return ''
})
const statusLabel = computed(() => {
  const s = props.data?.status
  if (s === 'Active') return '可用'
  if (s === 'Processing') return '处理中'
  if (s === 'Failed') return '失败'
  return ''
})

const contentStyle = computed(() => ({
  width: `${nodeWidth.value}px`,
  ...(nodeHeight.value ? { height: `${nodeHeight.value}px` } : {})
}))

const imageStyle = computed(() => ({
  height: nodeHeight.value ? '100%' : 'auto'
}))

function getCharacterDownloadFilename() {
  const rawName = props.data?.assetName || props.id || 'seedance-character'
  const safeName = String(rawName).trim().replace(/[\\/:*?"<>|]+/g, '_') || 'seedance-character'
  return `${safeName}.png`
}

function openSelector() {
  showSelector.value = true
}

function handleSelect(asset) {
  canvasStore.updateNodeData(props.id, {
    assetId: asset.Id,
    assetUri: `asset://${asset.Id}`,
    assetUrl: asset.URL,
    groupId: asset.GroupId,
    assetName: asset.Name,
    status: asset.Status,
    assetType: asset.AssetType,
    thumbnailUrl: asset.URL,
    thumbnail_url: asset.URL,
    projectName: asset.ProjectName,
    createTime: asset.CreateTime,
    updateTime: asset.UpdateTime,
    output: {
      type: 'image',
      url: `asset://${asset.Id}`,
      urls: [`asset://${asset.Id}`],
      thumbnailUrl: asset.URL
    }
  })
}

async function handleDownloadCharacter() {
  if (!props.data?.assetUrl) return
  try {
    await smartDownload(props.data.assetUrl, getCharacterDownloadFilename())
  } catch (error) {
    console.error('[SeedanceCharacterNode] 下载角色图片失败:', error)
  }
}

function handlePreviewCharacter() {
  if (!props.data?.assetUrl) return
  showPreviewModal.value = true
}

// Resize
function handleResizeStart(handle, event) {
  event.stopPropagation()
  event.preventDefault()
  isResizing.value = true
  resizeHandle.value = handle
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: nodeWidth.value,
    height: nodeHeight.value
  }
  document.addEventListener('mousemove', handleResizeMove)
  document.addEventListener('mouseup', handleResizeEnd)
}

function handleResizeMove(event) {
  if (!isResizing.value) return
  if (resizeRafId) cancelAnimationFrame(resizeRafId)

  const clientX = event.clientX
  const clientY = event.clientY
  resizeRafId = requestAnimationFrame(() => {
    if (!isResizing.value) return
    const viewport = canvasStore.viewport
    const zoom = viewport.zoom || 1
    const deltaX = clientX - resizeStart.value.x
    const deltaY = clientY - resizeStart.value.y

    if (resizeHandle.value === 'right' || resizeHandle.value === 'corner') {
      nodeWidth.value = Math.max(140, resizeStart.value.width + deltaX / zoom)
    }

    if (nodeHeight.value && resizeHandle.value === 'corner') {
      nodeHeight.value = Math.max(140, resizeStart.value.height + deltaY / zoom)
    }

    updateNodeInternals(props.id)
    resizeRafId = null
  })
}

function handleResizeEnd() {
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId)
    resizeRafId = null
  }
  isResizing.value = false
  resizeHandle.value = null
  canvasStore.updateNodeData(props.id, {
    width: nodeWidth.value,
    ...(nodeHeight.value ? { height: nodeHeight.value } : {})
  })
  nextTick(() => updateNodeInternals(props.id))
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
}

// 右侧 + 按钮
function handleAddRightMouseDown(event) {
  event.stopPropagation()
  event.preventDefault()
  isLongPress = false
  pressStartPos = { x: event.clientX, y: event.clientY }

  pressTimer = setTimeout(() => {
    isLongPress = true
    startDragConnection(event)
  }, LONG_PRESS_DURATION)

  document.addEventListener('mousemove', handleAddRightMouseMove)
  document.addEventListener('mouseup', handleAddRightMouseUp)
}

function handleAddRightMouseMove(event) {
  const dx = event.clientX - pressStartPos.x
  const dy = event.clientY - pressStartPos.y
  if (Math.sqrt(dx * dx + dy * dy) > 5 && !isLongPress) {
    clearTimeout(pressTimer)
    isLongPress = true
    startDragConnection(event)
  }
}

function handleAddRightMouseUp(event) {
  clearTimeout(pressTimer)
  document.removeEventListener('mousemove', handleAddRightMouseMove)
  document.removeEventListener('mouseup', handleAddRightMouseUp)
  if (!isLongPress) {
    canvasStore.openNodeSelector(
      { x: event.clientX, y: event.clientY },
      'node',
      props.id
    )
  }
}

function startDragConnection() {
  if (addBtnRef.value) {
    const rect = addBtnRef.value.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const vueFlowEl = addBtnRef.value.closest('.vue-flow')
    if (vueFlowEl) {
      const containerRect = vueFlowEl.getBoundingClientRect()
      const viewport = getViewport()

      const outputX = (centerX - containerRect.left - viewport.x) / viewport.zoom
      const outputY = (centerY - containerRect.top - viewport.y) / viewport.zoom

      canvasStore.startDragConnection(props.id, 'output', { x: outputX, y: outputY })
      return
    }
  }

  const currentNode = canvasStore.nodes.find(n => n.id === props.id)
  if (!currentNode) return

  const w = nodeWidth.value
  const labelOffset = 36
  const handleOffset = 34
  const estimatedHeight = hasCharacter.value ? w : 120

  const outputX = currentNode.position.x + w + handleOffset
  const outputY = currentNode.position.y + labelOffset + estimatedHeight / 2

  canvasStore.startDragConnection(props.id, 'output', { x: outputX, y: outputY })
}

onUnmounted(() => {
  if (resizeRafId) cancelAnimationFrame(resizeRafId)
  clearTimeout(pressTimer)
  document.removeEventListener('mousemove', handleAddRightMouseMove)
  document.removeEventListener('mouseup', handleAddRightMouseUp)
})
</script>

<template>
  <div
    class="seedance-character-node"
    :class="{
      selected,
      'has-character': hasCharacter,
      resizing: isResizing
    }"
    @dblclick.stop="openSelector"
  >
    <!-- 节点标签 -->
    <div
      v-if="!isEditingLabel"
      class="node-label"
      @dblclick="handleLabelDoubleClick"
      title="双击重命名"
    >
      {{ localLabel }}
    </div>
    <input
      v-else
      ref="labelInputRef"
      v-model="localLabel"
      type="text"
      class="node-label-input"
      @blur="saveLabelEdit"
      @keydown="handleLabelKeyDown"
      @click.stop
      @mousedown.stop
      @dblclick.stop
    />

    <!-- 节点主体 -->
    <div class="node-wrapper">
      <!-- 左侧输入端口 -->
      <Handle
        type="target"
        :position="Position.Left"
        id="input"
        class="node-handle node-handle-hidden"
        :style="{ position: 'absolute', left: '-34px', top: '50%', transform: 'translateY(-50%)' }"
      />

      <!-- 节点卡片 -->
      <div class="node-card" :style="contentStyle">
        <!-- 有角色时 -->
        <template v-if="hasCharacter">
          <div v-if="data.assetUrl" class="character-toolbar">
            <button
              class="character-toolbar-btn"
              title="下载"
              @mousedown.stop.prevent="handleDownloadCharacter"
              @click.stop.prevent
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button
              class="character-toolbar-btn"
              title="放大预览"
              @mousedown.stop.prevent="handlePreviewCharacter"
              @click.stop.prevent
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0-5 5M4 16v4m0 0h4m-4 0 5-5m11 5v-4m0 4h-4m4 0-5-5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <div class="character-preview">
            <div
              v-if="assetLoadFailed"
              class="character-failed"
              @click.stop="openSelector"
            >
              <div class="failed-icon">⚠️</div>
              <div class="failed-text">角色图片加载失败</div>
              <div class="failed-hint">点击重新选择角色</div>
            </div>
            <img
              v-else-if="data.assetUrl"
              :src="data.assetUrl"
              :alt="data.assetName"
              class="character-img"
              :style="imageStyle"
              @error="handleImageError"
            />
            <div v-else class="character-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 20C5 16.134 8.134 13 12 13C15.866 13 19 16.134 19 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
          <!-- 状态标签 -->
          <div v-if="data.status && data.status !== 'Active'" class="character-status-bar">
            <span class="character-status" :class="statusClass">{{ statusLabel }}</span>
          </div>
        </template>

        <!-- 空状态 -->
        <template v-else>
          <div class="empty-placeholder" @click="openSelector">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 20C5 16.134 8.134 13 12 13C15.866 13 19 16.134 19 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="empty-text">点击选择角色</span>
          </div>
        </template>

        <!-- Resize Handle -->
        <div
          class="resize-handle resize-handle-right"
          @mousedown="handleResizeStart('right', $event)"
        ></div>
        <div
          class="resize-handle resize-handle-corner"
          @mousedown="handleResizeStart('corner', $event)"
        ></div>
      </div>

      <!-- 右侧 + 按钮 -->
      <button
        ref="addBtnRef"
        class="node-add-btn node-add-btn-right"
        title="单击：添加节点 | 长按/拖拽：连线"
        @mousedown="handleAddRightMouseDown"
      >
        +
      </button>

      <!-- 右侧输出端口 -->
      <Handle
        type="source"
        :position="Position.Right"
        id="output"
        class="node-handle node-handle-hidden"
        :style="{ position: 'absolute', right: '-34px', top: '50%', transform: 'translateY(-50%)' }"
      />
    </div>

    <!-- 角色选择弹窗 -->
    <SeedanceCharacterSelector
      v-model:visible="showSelector"
      :current-asset-id="data?.assetId"
      @select="handleSelect"
    />

    <Teleport to="body">
      <Transition name="character-preview-fade">
        <div v-if="showPreviewModal" class="character-preview-modal" @click.self="showPreviewModal = false">
          <button class="character-preview-close" title="关闭" @click.stop="showPreviewModal = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <img
            :src="data.assetUrl"
            :alt="data.assetName || '角色预览'"
            class="character-preview-large"
            @error="handleImageError"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.seedance-character-node {
  position: relative;
  contain: layout style;
}

/* ========== 节点标签 ========== */
.node-label {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: color 0.2s ease, background-color 0.2s ease;
  user-select: none;
}

.node-label:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--canvas-text-primary, #ffffff);
}

.node-label-input {
  display: block;
  width: 100%;
  color: var(--canvas-text-primary, #ffffff);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  padding: 4px 8px;
  margin-bottom: 8px;
  border-radius: 4px;
  border: 1px solid var(--canvas-accent-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.1);
  outline: none;
  box-sizing: border-box;
}

/* ========== 节点主体 ========== */
.node-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
}

/* ========== 节点卡片 - 无边框设计 ========== */
.node-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.seedance-character-node.resizing .node-card {
  transition: none !important;
}

/* 有角色时 - 纯图片无边框 */
.seedance-character-node.has-character .node-card {
  background: transparent;
  border: none;
  overflow: visible;
}

/* 无角色时 - 淡边框 */
.seedance-character-node:not(.has-character) .node-card {
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-subtle, #2a2a2a);
}

.seedance-character-node:not(.has-character):hover .node-card {
  border-color: var(--canvas-border-active, #4a4a4a);
}

.seedance-character-node:not(.has-character).selected .node-card {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* ========== 角色图片预览 ========== */
.character-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  overflow: hidden;
}

.character-img {
  width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  pointer-events: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.2s ease, border 0.2s ease;
  border: 2px solid transparent;
}

/* 选中时 - 图片发光边框 */
.seedance-character-node.selected .character-img {
  border-color: var(--canvas-accent-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3), 0 8px 30px rgba(0, 0, 0, 0.4);
}

.character-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  color: var(--canvas-text-tertiary);
  background: var(--canvas-bg-secondary);
  border-radius: 12px;
}

/* 角色图片加载失败覆盖层 */
.character-failed {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  padding: 12px;
  text-align: center;
  color: var(--canvas-text-primary, #fff);
  background: rgba(20, 20, 20, 0.85);
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.character-failed:hover {
  background: rgba(40, 40, 40, 0.92);
}

.character-failed .failed-icon {
  font-size: 28px;
}

.character-failed .failed-text {
  font-size: 13px;
  font-weight: 500;
}

.character-failed .failed-hint {
  font-size: 11px;
  opacity: 0.75;
}

/* ========== 角色图片工具栏 ========== */
.character-toolbar {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 20px;
  padding: 6px 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.node-wrapper:hover .character-toolbar,
.seedance-character-node.selected .character-toolbar {
  opacity: 1;
  pointer-events: auto;
}

.character-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 6px;
  border: none;
  background: transparent;
  color: #888;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.character-toolbar-btn:hover {
  background: #3a3a3a;
  color: #fff;
}

.character-toolbar-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* 状态标签 */
.character-status-bar {
  display: flex;
  justify-content: center;
  padding: 6px 0 2px;
}

.character-status {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 4px;
  font-weight: 500;
}

.status-active { background: rgba(34, 197, 94, 0.15); color: var(--canvas-accent-success); }
.status-processing { background: rgba(245, 158, 11, 0.15); color: var(--canvas-accent-warning); animation: pulse 1.5s infinite; }
.status-failed { background: rgba(239, 68, 68, 0.15); color: var(--canvas-accent-error); }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

/* ========== 空状态 ========== */
.empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  min-height: 120px;
  gap: 10px;
  color: var(--canvas-text-tertiary);
  cursor: pointer;
  transition: color 0.2s;
}

.empty-placeholder:hover {
  color: var(--canvas-text-secondary);
}

.empty-text {
  font-size: 13px;
}

/* ========== 端口样式 ========== */
.node-handle {
  width: 1px;
  height: 1px;
  background: transparent;
  border: none;
  opacity: 0;
  pointer-events: none;
}

.node-handle-hidden {
  opacity: 0 !important;
  pointer-events: none;
}

:deep(.vue-flow__handle.target) {
  left: -34px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle.source) {
  right: -34px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

/* ========== + 按钮 ========== */
.node-add-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.5);
  font-size: 22px;
  font-weight: 300;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
  z-index: 10;
}

.node-wrapper:hover .node-add-btn,
.seedance-character-node.selected .node-add-btn {
  opacity: 1;
}

.node-add-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.9);
  transform: translateY(-50%) scale(1.1);
}

.node-add-btn-right {
  right: -52px;
}

/* ========== Resize Handles ========== */
.resize-handle {
  position: absolute;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 20;
}

.node-card:hover .resize-handle {
  opacity: 1;
}

.resize-handle-right {
  right: -2px;
  top: 0;
  width: 4px;
  height: 100%;
  cursor: ew-resize;
}

.resize-handle-right:hover {
  background: rgba(59, 130, 246, 0.4);
}

.resize-handle-corner {
  right: -4px;
  bottom: -4px;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  border-radius: 2px;
}

.resize-handle-corner:hover {
  background: rgba(59, 130, 246, 0.5);
}

/* ========== 白昼模式 ========== */
:root.canvas-theme-light .node-label {
  color: var(--canvas-text-secondary);
}

:root.canvas-theme-light .node-label:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--canvas-text-primary);
}

:root.canvas-theme-light .node-label-input {
  color: var(--canvas-text-primary);
  background: rgba(59, 130, 246, 0.06);
  border-color: var(--canvas-accent-primary, #3b82f6);
}

:root.canvas-theme-light .character-img {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .character-toolbar {
  background: #fff;
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .character-toolbar-btn {
  color: rgba(0, 0, 0, 0.45);
}

:root.canvas-theme-light .character-toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
}

:root.canvas-theme-light .seedance-character-node.selected .character-img {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3), 0 8px 30px rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .node-add-btn {
  border-color: rgba(0, 0, 0, 0.15);
  color: rgba(0, 0, 0, 0.35);
}

:root.canvas-theme-light .node-add-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.25);
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .resize-handle-right:hover {
  background: rgba(59, 130, 246, 0.3);
}

:root.canvas-theme-light .resize-handle-corner:hover {
  background: rgba(59, 130, 246, 0.4);
}
</style>

<style>
.character-preview-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(10px);
}

.character-preview-large {
  max-width: min(90vw, 1100px);
  max-height: 88vh;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

.character-preview-close {
  position: fixed;
  top: 24px;
  right: 24px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.character-preview-close:hover {
  background: rgba(255, 255, 255, 0.22);
}

.character-preview-close svg {
  width: 20px;
  height: 20px;
}

.character-preview-fade-enter-active,
.character-preview-fade-leave-active {
  transition: opacity 0.18s ease;
}

.character-preview-fade-enter-from,
.character-preview-fade-leave-to {
  opacity: 0;
}
</style>
