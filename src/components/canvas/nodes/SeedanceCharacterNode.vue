<script setup>
/**
 * SeedanceCharacterNode.vue - Seedance 角色节点
 * 无边框设计，匹配 ImageNode 风格
 */
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import SeedanceCharacterSelector from '../SeedanceCharacterSelector.vue'

const LONG_PRESS_DURATION = 300

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()
const { updateNodeInternals, getViewport } = useVueFlow()

const showSelector = ref(false)

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
const isResizing = ref(false)
const resizeHandle = ref(null)
const resizeStart = ref({ x: 0, y: 0, width: 0 })
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
  width: `${nodeWidth.value}px`
}))

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
    projectName: asset.ProjectName,
    createTime: asset.CreateTime,
    updateTime: asset.UpdateTime,
    output: {
      type: 'image',
      url: asset.URL,
      urls: [asset.URL]
    }
  })
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
    width: nodeWidth.value
  }
  document.addEventListener('mousemove', handleResizeMove)
  document.addEventListener('mouseup', handleResizeEnd)
}

function handleResizeMove(event) {
  if (!isResizing.value) return
  if (resizeRafId) cancelAnimationFrame(resizeRafId)

  const clientX = event.clientX
  resizeRafId = requestAnimationFrame(() => {
    if (!isResizing.value) return
    const viewport = canvasStore.viewport
    const zoom = viewport.zoom || 1
    const deltaX = clientX - resizeStart.value.x
    nodeWidth.value = Math.max(140, resizeStart.value.width + deltaX / zoom)
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
  canvasStore.updateNodeData(props.id, { width: nodeWidth.value })
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

function startDragConnection(event) {
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
      />

      <!-- 节点卡片 -->
      <div class="node-card" :style="contentStyle">
        <!-- 有角色时 -->
        <template v-if="hasCharacter">
          <div class="character-preview">
            <img
              v-if="data.assetUrl"
              :src="data.assetUrl"
              :alt="data.assetName"
              class="character-img"
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
      />
    </div>

    <!-- 角色选择弹窗 -->
    <SeedanceCharacterSelector
      v-model:visible="showSelector"
      :current-asset-id="data?.assetId"
      @select="handleSelect"
    />
  </div>
</template>

<style scoped>
.seedance-character-node {
  position: relative;
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
  transition: all 0.2s ease;
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
  transition: all 0.2s ease;
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
  aspect-ratio: 1;
  color: var(--canvas-text-tertiary);
  background: var(--canvas-bg-secondary);
  border-radius: 12px;
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
  visibility: hidden;
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
  transition: all 0.2s ease;
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
