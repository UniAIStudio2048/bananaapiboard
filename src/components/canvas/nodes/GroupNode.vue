<script setup>
/**
 * GroupNode.vue - 编组节点（可视化分组容器）
 * 
 * 功能：
 * - 显示一个可视化的分组框，包围编组内的节点
 * - 可以拖动整个编组（带动内部节点一起移动）
 * - 可以拖拽边角和边缘来缩放编组
 * - 显示编组名称，双击可直接编辑
 */
import { ref, computed, onUnmounted, nextTick, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvas'

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

const canvasStore = useCanvasStore()

// 编组信息
const groupName = computed(() => props.data.groupName || '新建组')
const groupColor = computed(() => props.data.groupColor || 'rgba(100, 116, 139, 0.08)')
const borderColor = computed(() => props.data.borderColor || 'rgba(100, 116, 139, 0.25)')
const nodeIds = computed(() => props.data.nodeIds || [])

// 编组框尺寸（使用响应式）
const width = ref(props.data.width || 400)
const height = ref(props.data.height || 300)

// 监听 props.data 中尺寸的变化
watch(() => props.data.width, (newWidth) => {
  if (newWidth && newWidth !== width.value) {
    width.value = newWidth
  }
}, { immediate: true })

watch(() => props.data.height, (newHeight) => {
  if (newHeight && newHeight !== height.value) {
    height.value = newHeight
  }
}, { immediate: true })

// 缩放状态
const isResizing = ref(false)
const resizeHandle = ref(null) // 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 's' | 'n'
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0, nodeX: 0, nodeY: 0 })

// 悬停状态
const isHovered = ref(false)

// 内联编辑状态
const isEditing = ref(false)
const editingName = ref('')
const nameInputRef = ref(null)

// ========== 编组执行状态 ==========
// 注意：canvasStore 中的 executeGroup、groupExecutionState、stopGroupExecution
// 由另一个开发者同步实现，这里用 optional chaining 保护

const isExecuting = computed(() => {
  const state = canvasStore.groupExecutionState?.[props.id]
  return state?.status === 'running'
})

const executionProgress = computed(() => {
  const state = canvasStore.groupExecutionState?.[props.id]
  if (!state) return ''
  return `${state.completed || 0}/${state.total || 0}`
})

const progressPercent = computed(() => {
  const state = canvasStore.groupExecutionState?.[props.id]
  if (!state || !state.total) return 0
  return Math.round(((state.completed || 0) / state.total) * 100)
})

// 整组执行 / 停止
function handleExecuteGroup() {
  if (isExecuting.value) {
    canvasStore.stopGroupExecution?.(props.id)
    return
  }
  canvasStore.executeGroup?.(props.id)
}

// 节点样式类
const nodeClass = computed(() => ({
  'group-node': true,
  'selected': props.selected,
  'resizing': isResizing.value,
  'executing': isExecuting.value
}))

// 删除编组
function deleteGroup() {
  // 解锁组内节点
  nodeIds.value.forEach(nodeId => {
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (node) {
      node.draggable = true
    }
  })
  canvasStore.disbandGroup(props.id)
  canvasStore.removeNode(props.id)
}

// 双击开始编辑组名
function startEditName(event) {
  event.stopPropagation()
  isEditing.value = true
  editingName.value = groupName.value
  nextTick(() => {
    if (nameInputRef.value) {
      nameInputRef.value.focus()
      nameInputRef.value.select()
    }
  })
}

// 确认编辑
function confirmEditName() {
  if (editingName.value && editingName.value.trim()) {
    canvasStore.updateNodeData(props.id, {
      groupName: editingName.value.trim()
    })
  }
  isEditing.value = false
}

// 取消编辑
function cancelEditName() {
  isEditing.value = false
  editingName.value = groupName.value
}

// 处理按键
function handleNameKeydown(event) {
  if (event.key === 'Enter') {
    confirmEditName()
  } else if (event.key === 'Escape') {
    cancelEditName()
  }
}

// 双击重命名（保留，用于整体区域双击）
function handleDoubleClick(event) {
  // 确保不是在缩放手柄上双击
  if (event.target.classList.contains('resize-handle')) return
  if (isEditing.value) return
  
  startEditName(event)
}

// 开始缩放
function startResize(event, handle) {
  event.stopPropagation()
  event.preventDefault()
  
  // 获取当前节点的位置
  const node = canvasStore.nodes.find(n => n.id === props.id)
  const nodePosition = node?.position || { x: 0, y: 0 }
  
  isResizing.value = true
  resizeHandle.value = handle
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: width.value,
    height: height.value,
    nodeX: nodePosition.x,
    nodeY: nodePosition.y
  }
  
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
}

// 处理缩放
function handleResize(event) {
  if (!isResizing.value) return
  
  // 考虑视口缩放比例
  const zoom = canvasStore.viewport?.zoom || 1
  const deltaX = (event.clientX - resizeStart.value.x) / zoom
  const deltaY = (event.clientY - resizeStart.value.y) / zoom
  
  const minWidth = 200
  const minHeight = 150
  
  let newWidth = resizeStart.value.width
  let newHeight = resizeStart.value.height
  let newX = resizeStart.value.nodeX
  let newY = resizeStart.value.nodeY
  
  // 根据拖拽的边角计算新尺寸和位置
  if (resizeHandle.value.includes('e')) {
    newWidth = Math.max(minWidth, resizeStart.value.width + deltaX)
  }
  if (resizeHandle.value.includes('w')) {
    const widthChange = Math.min(deltaX, resizeStart.value.width - minWidth)
    newWidth = resizeStart.value.width - widthChange
    newX = resizeStart.value.nodeX + widthChange
  }
  if (resizeHandle.value.includes('s')) {
    newHeight = Math.max(minHeight, resizeStart.value.height + deltaY)
  }
  if (resizeHandle.value.includes('n')) {
    const heightChange = Math.min(deltaY, resizeStart.value.height - minHeight)
    newHeight = resizeStart.value.height - heightChange
    newY = resizeStart.value.nodeY + heightChange
  }
  
  width.value = newWidth
  height.value = newHeight
  
  // 更新 store 中的尺寸
  canvasStore.updateNodeData(props.id, {
    width: newWidth,
    height: newHeight
  })
  
  // 如果拖拽的是左边或上边，还需要更新位置
  if (resizeHandle.value.includes('w') || resizeHandle.value.includes('n')) {
    const node = canvasStore.nodes.find(n => n.id === props.id)
    if (node) {
      node.position = { x: newX, y: newY }
      canvasStore.updateNodePosition(props.id, { x: newX, y: newY })
    }
  }
}

// 停止缩放
function stopResize() {
  isResizing.value = false
  resizeHandle.value = null
  
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

// 组件卸载时清理
onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<template>
  <div 
    :class="nodeClass"
    :style="{ 
      width: `${width}px`, 
      height: `${height}px`,
      background: groupColor,
      border: `1.5px solid ${borderColor}`,
      borderRadius: '12px',
      position: 'relative',
      padding: '0'
    }"
    @dblclick="handleDoubleClick"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- 编组标题 + 工具栏（顶部） -->
    <div class="group-header">
      <!-- 编辑模式 -->
      <input
        v-if="isEditing"
        ref="nameInputRef"
        v-model="editingName"
        class="group-name-input"
        @blur="confirmEditName"
        @keydown="handleNameKeydown"
        @click.stop
      />
      <!-- 显示模式 - 双击可编辑 -->
      <span
        v-else
        class="group-name"
        @dblclick.stop="startEditName"
        title="双击编辑组名"
      >{{ groupName }}</span>

      <!-- 编组工具栏（选中或悬停时显示） -->
      <div v-if="(selected || isHovered) && !isEditing" class="group-toolbar">
        <button
          class="toolbar-btn execute-btn"
          :class="{ 'is-running': isExecuting }"
          :title="isExecuting ? '停止执行' : '整组执行'"
          :aria-label="isExecuting ? '停止执行' : '整组执行'"
          @click.stop="handleExecuteGroup"
        >
          <span class="toolbar-btn-icon">{{ isExecuting ? '■' : '▶' }}</span>
          <span class="toolbar-btn-text">{{ isExecuting ? executionProgress : '整组执行' }}</span>
        </button>
        <button
          class="toolbar-btn ungroup-btn"
          title="解散编组"
          aria-label="解散编组"
          @click.stop="deleteGroup"
        >
          <span class="toolbar-btn-icon">⊘</span>
          <span class="toolbar-btn-text">解组</span>
        </button>
      </div>
    </div>

    <!-- 执行进度条（执行中时显示） -->
    <div v-if="isExecuting" class="group-progress-bar">
      <div
        class="group-progress-fill"
        :style="{ width: progressPercent + '%' }"
      ></div>
    </div>

    <!-- 操作提示区域（底部） -->
    <div v-if="(selected || isHovered) && !isExecuting" class="group-tips">
      <span class="tips-text">双击编辑组名 · 拖拽边角缩放</span>
    </div>
    
    <!-- 缩放手柄（选中或悬停时显示） -->
    <template v-if="selected || isHovered">
      <!-- 四个角 -->
      <div class="resize-handle resize-nw" @mousedown="startResize($event, 'nw')"></div>
      <div class="resize-handle resize-ne" @mousedown="startResize($event, 'ne')"></div>
      <div class="resize-handle resize-sw" @mousedown="startResize($event, 'sw')"></div>
      <div class="resize-handle resize-se" @mousedown="startResize($event, 'se')"></div>
      
      <!-- 四条边 -->
      <div class="resize-handle resize-n" @mousedown="startResize($event, 'n')"></div>
      <div class="resize-handle resize-s" @mousedown="startResize($event, 's')"></div>
      <div class="resize-handle resize-w" @mousedown="startResize($event, 'w')"></div>
      <div class="resize-handle resize-e" @mousedown="startResize($event, 'e')"></div>
    </template>
  </div>
</template>

<style scoped>
.group-node {
  cursor: move;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  z-index: -1000 !important;
  pointer-events: all;
}

.group-node.resizing {
  transition: none;
}

.group-node.selected {
  border-width: 2px;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

/* 组标题 - 简洁文字样式，无边框无背景 */
.group-header {
  position: absolute;
  top: -24px;
  left: 4px;
  display: flex;
  align-items: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  font-weight: 500;
  z-index: 10;
  pointer-events: all;
}

.group-name {
  user-select: none;
  white-space: nowrap;
  cursor: text;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.group-name:hover {
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.08);
}

/* 编辑输入框 */
.group-name-input {
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  padding: 2px 6px;
  min-width: 80px;
  max-width: 200px;
  outline: none;
}

.group-name-input:focus {
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

/* 缩放手柄 - 蓝色+灰色配色 */
.resize-handle {
  position: absolute;
  background: rgba(59, 130, 246, 0.85);
  border: 2px solid rgba(100, 116, 139, 0.8);
  border-radius: 2px;
  z-index: 100;
  pointer-events: all;
}

/* 角落手柄 */
.resize-nw, .resize-ne, .resize-sw, .resize-se {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.resize-nw {
  top: -5px;
  left: -5px;
  cursor: nw-resize;
}

.resize-ne {
  top: -5px;
  right: -5px;
  cursor: ne-resize;
}

.resize-sw {
  bottom: -5px;
  left: -5px;
  cursor: sw-resize;
}

.resize-se {
  bottom: -5px;
  right: -5px;
  cursor: se-resize;
}

/* 边缘手柄 */
.resize-n, .resize-s {
  height: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  border-radius: 3px;
}

.resize-n {
  top: -3px;
  cursor: n-resize;
}

.resize-s {
  bottom: -3px;
  cursor: s-resize;
}

.resize-w, .resize-e {
  width: 6px;
  top: 50%;
  transform: translateY(-50%);
  height: 40px;
  border-radius: 3px;
}

.resize-w {
  left: -3px;
  cursor: w-resize;
}

.resize-e {
  right: -3px;
  cursor: e-resize;
}

.resize-handle:hover {
  background: rgba(59, 130, 246, 1);
  border-color: rgba(148, 163, 184, 0.9);
}

/* 角落手柄悬停时保持位置 */
.resize-nw:hover, .resize-ne:hover, .resize-sw:hover, .resize-se:hover {
  transform: scale(1.15);
}

.resize-n:hover, .resize-s:hover {
  transform: translateX(-50%) scaleY(1.2);
}

.resize-w:hover, .resize-e:hover {
  transform: translateY(-50%) scaleX(1.2);
}

/* ========== 编组工具栏 ========== */
.group-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 4px;
  background: rgba(30, 30, 30, 0.9);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  line-height: 1.4;
}

.toolbar-btn-icon {
  font-size: 10px;
}

.toolbar-btn-text {
  font-size: 11px;
}

/* 整组执行按钮 - 蓝色主题 */
.execute-btn {
  background: rgba(59, 130, 246, 0.2);
  color: rgba(96, 165, 250, 0.95);
}

.execute-btn:hover {
  background: rgba(59, 130, 246, 0.35);
  color: #fff;
}

.execute-btn.is-running {
  background: rgba(239, 68, 68, 0.2);
  color: rgba(252, 165, 165, 0.95);
}

.execute-btn.is-running:hover {
  background: rgba(239, 68, 68, 0.35);
  color: #fff;
}

/* 解组按钮 - 灰色主题 */
.ungroup-btn {
  background: rgba(100, 116, 139, 0.15);
  color: rgba(148, 163, 184, 0.9);
}

.ungroup-btn:hover {
  background: rgba(100, 116, 139, 0.3);
  color: #fff;
}

/* ========== 执行进度条 ========== */
.group-progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(59, 130, 246, 0.15);
  border-radius: 12px 12px 0 0;
  overflow: hidden;
  z-index: 5;
}

.group-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.7), rgba(96, 165, 250, 0.9));
  border-radius: 12px 0 0 0;
  transition: width 0.4s ease;
}

/* ========== 执行中脉冲动画 ========== */
.group-node.executing {
  animation: group-executing-pulse 2s ease-in-out infinite;
}

@keyframes group-executing-pulse {
  0%, 100% { border-color: rgba(59, 130, 246, 0.4); }
  50% { border-color: rgba(59, 130, 246, 0.8); }
}

/* ========== 操作提示区域 ========== */
.group-tips {
  position: absolute;
  bottom: 6px;
  left: 0;
  right: 0;
  text-align: center;
  pointer-events: none;
  z-index: 5;
}

.tips-text {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.5);
  letter-spacing: 0.3px;
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   GroupNode 白昼模式样式适配
   ======================================== */

/* 组标题文字 */
:root.canvas-theme-light .group-node .group-header {
  color: rgba(0, 0, 0, 0.7) !important;
}

:root.canvas-theme-light .group-node .group-name {
  color: rgba(0, 0, 0, 0.65) !important;
}

:root.canvas-theme-light .group-node .group-name:hover {
  color: rgba(0, 0, 0, 0.9) !important;
  background: rgba(0, 0, 0, 0.06) !important;
}

/* 编辑输入框 */
:root.canvas-theme-light .group-node .group-name-input {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(59, 130, 246, 0.5) !important;
  color: #1c1917 !important;
}

:root.canvas-theme-light .group-node .group-name-input:focus {
  border-color: rgba(59, 130, 246, 0.7) !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15) !important;
}

/* 选中状态 */
:root.canvas-theme-light .group-node.selected {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25) !important;
}

/* 缩放手柄 */
:root.canvas-theme-light .group-node .resize-handle {
  background: rgba(59, 130, 246, 0.8) !important;
  border-color: rgba(100, 116, 139, 0.6) !important;
}

:root.canvas-theme-light .group-node .resize-handle:hover {
  background: rgba(59, 130, 246, 0.95) !important;
  border-color: rgba(100, 116, 139, 0.8) !important;
}

/* 工具栏 - 白昼模式 */
:root.canvas-theme-light .group-node .group-toolbar {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
}

:root.canvas-theme-light .group-node .execute-btn {
  background: rgba(59, 130, 246, 0.1) !important;
  color: rgba(37, 99, 235, 0.9) !important;
}

:root.canvas-theme-light .group-node .execute-btn:hover {
  background: rgba(59, 130, 246, 0.2) !important;
  color: #1d4ed8 !important;
}

:root.canvas-theme-light .group-node .execute-btn.is-running {
  background: rgba(239, 68, 68, 0.1) !important;
  color: rgba(220, 38, 38, 0.9) !important;
}

:root.canvas-theme-light .group-node .execute-btn.is-running:hover {
  background: rgba(239, 68, 68, 0.2) !important;
  color: #b91c1c !important;
}

:root.canvas-theme-light .group-node .ungroup-btn {
  background: rgba(100, 116, 139, 0.08) !important;
  color: rgba(71, 85, 105, 0.85) !important;
}

:root.canvas-theme-light .group-node .ungroup-btn:hover {
  background: rgba(100, 116, 139, 0.18) !important;
  color: #334155 !important;
}

/* 进度条 - 白昼模式 */
:root.canvas-theme-light .group-node .group-progress-bar {
  background: rgba(59, 130, 246, 0.08) !important;
}

:root.canvas-theme-light .group-node .group-progress-fill {
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.6), rgba(59, 130, 246, 0.85)) !important;
}

/* 操作提示 - 白昼模式 */
:root.canvas-theme-light .group-node .tips-text {
  color: rgba(100, 116, 139, 0.5) !important;
}
</style>
