<script setup>
/**
 * GroupToolbar.vue - 编组工具栏
 * 
 * 功能：
 * - 布局切换（宫格/水平/垂直）
 * - 整组执行
 * - 保存工作流
 * - 解组
 * - 背景颜色选择
 */
import { ref, computed, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvas'

const props = defineProps({
  groupNode: Object,
  position: Object
})

const emit = defineEmits(['close', 'layout-change', 'disband', 'execute', 'save-workflow'])

const canvasStore = useCanvasStore()

// 颜色选择器状态
const showColorPicker = ref(false)

// 可选颜色（暗色调）
const colorOptions = [
  { bg: 'rgba(100, 116, 139, 0.12)', border: 'rgba(100, 116, 139, 0.35)', name: '灰色' },
  { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.35)', name: '红色' },
  { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.35)', name: '橙色' },
  { bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.35)', name: '黄色' },
  { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.35)', name: '绿色' },
  { bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.35)', name: '青色' },
  { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)', name: '蓝色' },
  { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.35)', name: '紫色' },
]

// 当前颜色
const currentColor = computed(() => props.groupNode?.data?.groupColor || colorOptions[0].bg)

// 切换颜色选择器
function toggleColorPicker() {
  showColorPicker.value = !showColorPicker.value
}

// 选择颜色
function selectColor(color) {
  if (props.groupNode) {
    canvasStore.updateNodeData(props.groupNode.id, {
      groupColor: color.bg,
      borderColor: color.border
    })
  }
  showColorPicker.value = false
}

// 布局配置常量
const LAYOUT_CONFIG = {
  gap: 30,
  paddingX: 50,
  paddingTop: 50, // 顶部留空给标题
  paddingBottom: 50
}

// 获取节点的实际尺寸
function getNodeDimensions(node) {
  // 尝试从节点数据中获取尺寸，如果没有则使用默认值
  const defaultSizes = {
    'text-input': { width: 400, height: 350 },
    'text': { width: 400, height: 350 },
    'image-input': { width: 380, height: 400 },
    'image': { width: 380, height: 400 },
    'image-gen': { width: 380, height: 400 },
    'video-input': { width: 420, height: 380 },
    'video': { width: 420, height: 380 },
    'video-gen': { width: 420, height: 380 },
    'llm': { width: 380, height: 300 },
    'preview-output': { width: 350, height: 300 }
  }
  
  const defaults = defaultSizes[node.type] || { width: 380, height: 350 }
  
  return {
    width: node.data?.width || node.dimensions?.width || defaults.width,
    height: node.data?.height || node.dimensions?.height || defaults.height
  }
}

// 获取组内所有节点的尺寸信息
function getNodesInfo(nodeIds) {
  const nodesInfo = []
  let maxWidth = 0
  let maxHeight = 0
  
  nodeIds.forEach(nodeId => {
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (node) {
      const dims = getNodeDimensions(node)
      nodesInfo.push({ id: nodeId, node, ...dims })
      maxWidth = Math.max(maxWidth, dims.width)
      maxHeight = Math.max(maxHeight, dims.height)
    }
  })
  
  return { nodesInfo, maxWidth, maxHeight }
}

// 宫格布局
function applyGridLayout() {
  if (!props.groupNode?.data?.nodeIds) return
  
  const nodeIds = props.groupNode.data.nodeIds
  const nodeOffsets = {}
  
  // 从 store 中重新获取编组节点以获取最新位置
  const groupNode = canvasStore.nodes.find(n => n.id === props.groupNode.id)
  if (!groupNode) return
  
  const groupX = groupNode.position.x
  const groupY = groupNode.position.y
  
  const { gap, paddingX, paddingTop, paddingBottom } = LAYOUT_CONFIG
  
  // 获取所有节点的尺寸信息
  const { nodesInfo, maxWidth, maxHeight } = getNodesInfo(nodeIds)
  if (nodesInfo.length === 0) return
  
  // 使用最大节点尺寸作为单元格尺寸
  const cellWidth = maxWidth
  const cellHeight = maxHeight
  
  // 计算宫格布局
  const cols = Math.ceil(Math.sqrt(nodesInfo.length))
  
  console.log('[GroupToolbar] 应用宫格布局', { nodeIds, cols, cellWidth, cellHeight })
  
  nodesInfo.forEach((info, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    
    const newX = groupX + paddingX + col * (cellWidth + gap)
    const newY = groupY + paddingTop + row * (cellHeight + gap)
    
    // 使用 store 方法更新节点位置
    canvasStore.updateNodePosition(info.id, { x: newX, y: newY })
    
    // 更新偏移量
    nodeOffsets[info.id] = {
      x: newX - groupX,
      y: newY - groupY
    }
  })
  
  // 调整组大小以包含所有节点
  const rows = Math.ceil(nodesInfo.length / cols)
  const newWidth = paddingX * 2 + cols * cellWidth + (cols - 1) * gap
  const newHeight = paddingTop + paddingBottom + rows * cellHeight + (rows - 1) * gap
  
  canvasStore.updateNodeData(props.groupNode.id, {
    width: newWidth,
    height: newHeight,
    nodeOffsets: nodeOffsets,
    layoutMode: 'grid'
  })
  
  console.log('[GroupToolbar] 宫格布局完成', { newWidth, newHeight })
  emit('layout-change', 'grid')
}

// 水平布局
function applyHorizontalLayout() {
  if (!props.groupNode?.data?.nodeIds) return
  
  const nodeIds = props.groupNode.data.nodeIds
  const nodeOffsets = {}
  
  // 从 store 中重新获取编组节点以获取最新位置
  const groupNode = canvasStore.nodes.find(n => n.id === props.groupNode.id)
  if (!groupNode) return
  
  const groupX = groupNode.position.x
  const groupY = groupNode.position.y
  
  const { gap, paddingX, paddingTop, paddingBottom } = LAYOUT_CONFIG
  
  // 获取所有节点的尺寸信息
  const { nodesInfo, maxHeight } = getNodesInfo(nodeIds)
  if (nodesInfo.length === 0) return
  
  console.log('[GroupToolbar] 应用水平布局', { nodeIds, maxHeight })
  
  let currentX = groupX + paddingX
  
  nodesInfo.forEach((info) => {
    const newX = currentX
    const newY = groupY + paddingTop
    
    // 使用 store 方法更新节点位置
    canvasStore.updateNodePosition(info.id, { x: newX, y: newY })
    
    nodeOffsets[info.id] = {
      x: newX - groupX,
      y: newY - groupY
    }
    
    // 下一个节点的 X 位置
    currentX += info.width + gap
  })
  
  // 计算总宽度
  const totalNodesWidth = nodesInfo.reduce((sum, info) => sum + info.width, 0)
  const newWidth = paddingX * 2 + totalNodesWidth + (nodesInfo.length - 1) * gap
  const newHeight = paddingTop + paddingBottom + maxHeight
  
  canvasStore.updateNodeData(props.groupNode.id, {
    width: newWidth,
    height: newHeight,
    nodeOffsets: nodeOffsets,
    layoutMode: 'horizontal'
  })
  
  console.log('[GroupToolbar] 水平布局完成', { newWidth, newHeight })
  emit('layout-change', 'horizontal')
}

// 垂直布局
function applyVerticalLayout() {
  if (!props.groupNode?.data?.nodeIds) return
  
  const nodeIds = props.groupNode.data.nodeIds
  const nodeOffsets = {}
  
  // 从 store 中重新获取编组节点以获取最新位置
  const groupNode = canvasStore.nodes.find(n => n.id === props.groupNode.id)
  if (!groupNode) return
  
  const groupX = groupNode.position.x
  const groupY = groupNode.position.y
  
  const { gap, paddingX, paddingTop, paddingBottom } = LAYOUT_CONFIG
  
  // 获取所有节点的尺寸信息
  const { nodesInfo, maxWidth } = getNodesInfo(nodeIds)
  if (nodesInfo.length === 0) return
  
  console.log('[GroupToolbar] 应用垂直布局', { nodeIds, maxWidth })
  
  let currentY = groupY + paddingTop
  
  nodesInfo.forEach((info) => {
    const newX = groupX + paddingX
    const newY = currentY
    
    // 使用 store 方法更新节点位置
    canvasStore.updateNodePosition(info.id, { x: newX, y: newY })
    
    nodeOffsets[info.id] = {
      x: newX - groupX,
      y: newY - groupY
    }
    
    // 下一个节点的 Y 位置
    currentY += info.height + gap
  })
  
  // 计算总高度
  const totalNodesHeight = nodesInfo.reduce((sum, info) => sum + info.height, 0)
  const newWidth = paddingX * 2 + maxWidth
  const newHeight = paddingTop + paddingBottom + totalNodesHeight + (nodesInfo.length - 1) * gap
  
  canvasStore.updateNodeData(props.groupNode.id, {
    width: newWidth,
    height: newHeight,
    nodeOffsets: nodeOffsets,
    layoutMode: 'vertical'
  })
  
  console.log('[GroupToolbar] 垂直布局完成', { newWidth, newHeight })
  emit('layout-change', 'vertical')
}

// 整组执行
function executeGroup() {
  emit('execute')
}

// 保存工作流
function saveWorkflow() {
  emit('save-workflow')
}

// 解组
function disbandGroup() {
  emit('disband')
}

// 点击外部关闭颜色选择器
function handleClickOutside(event) {
  if (!event.target.closest('.color-picker-container')) {
    showColorPicker.value = false
  }
}
</script>

<template>
  <div class="group-toolbar" @click.stop>
    <!-- 背景颜色 -->
    <div class="toolbar-item color-picker-container">
      <button class="toolbar-btn" @click="toggleColorPicker" title="背景颜色">
        <div class="color-preview" :style="{ background: currentColor }"></div>
      </button>
      
      <!-- 颜色选择器下拉 -->
      <div v-if="showColorPicker" class="color-picker-dropdown">
        <div 
          v-for="color in colorOptions" 
          :key="color.name"
          class="color-option"
          :style="{ background: color.bg, border: `2px solid ${color.border}` }"
          :title="color.name"
          @click="selectColor(color)"
        ></div>
      </div>
    </div>
    
    <div class="toolbar-divider"></div>
    
    <!-- 布局按钮组 -->
    <div class="layout-btn-group">
      <!-- 宫格布局 -->
      <button class="toolbar-btn layout-btn" @click="applyGridLayout" title="宫格布局">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      </button>
      
      <!-- 水平布局 -->
      <button class="toolbar-btn layout-btn" @click="applyHorizontalLayout" title="水平布局">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="8" width="6" height="8" rx="1"/>
          <rect x="9" y="8" width="6" height="8" rx="1"/>
          <rect x="16" y="8" width="6" height="8" rx="1"/>
        </svg>
      </button>
      
      <!-- 垂直布局 -->
      <button class="toolbar-btn layout-btn" @click="applyVerticalLayout" title="垂直布局">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="8" y="2" width="8" height="6" rx="1"/>
          <rect x="8" y="9" width="8" height="6" rx="1"/>
          <rect x="8" y="16" width="8" height="6" rx="1"/>
        </svg>
      </button>
    </div>
    
    <div class="toolbar-divider"></div>
    
    <!-- 整组执行 -->
    <button class="toolbar-btn execute-btn" @click="executeGroup" title="整组执行">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
      <span class="btn-text">整组执行</span>
    </button>
    
    <div class="toolbar-divider"></div>
    
    <!-- 保存工作流 -->
    <button class="toolbar-btn" @click="saveWorkflow" title="保存工作流">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      <span class="btn-text">保存工作流</span>
    </button>
    
    <div class="toolbar-divider"></div>
    
    <!-- 解组 -->
    <button class="toolbar-btn" @click="disbandGroup" title="解组">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
        <line x1="2" y1="2" x2="22" y2="22" stroke-width="2"/>
      </svg>
      <span class="btn-text">解组</span>
    </button>
  </div>
</template>

<style scoped>
.group-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  background: rgba(40, 40, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.toolbar-btn {
  height: 28px;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: #999;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s;
  font-size: 12px;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.toolbar-btn.execute-btn {
  color: #4ade80;
}

.toolbar-btn.execute-btn:hover {
  background: rgba(74, 222, 128, 0.15);
}

.btn-text {
  font-size: 12px;
  font-weight: 500;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 4px;
}

.color-preview {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.color-picker-container {
  position: relative;
}

.color-picker-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  padding: 8px;
  background: rgba(40, 40, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 1001;
}

.color-option {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}

.color-option:hover {
  transform: scale(1.15);
}

/* 布局按钮组 */
.layout-btn-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
}

.layout-btn {
  padding: 0 8px !important;
}

.layout-btn:hover {
  background: rgba(59, 130, 246, 0.2) !important;
  color: #60a5fa !important;
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   GroupToolbar 白昼模式样式适配
   ======================================== */

/* 工具栏主容器 */
:root.canvas-theme-light .group-toolbar {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(0, 0, 0, 0.12) !important;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(0, 0, 0, 0.04) !important;
}

/* 工具栏按钮 */
:root.canvas-theme-light .group-toolbar .toolbar-btn {
  color: rgba(0, 0, 0, 0.55) !important;
}

:root.canvas-theme-light .group-toolbar .toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #1c1917 !important;
}

/* 整组执行按钮 */
:root.canvas-theme-light .group-toolbar .toolbar-btn.execute-btn {
  color: #059669 !important;
}

:root.canvas-theme-light .group-toolbar .toolbar-btn.execute-btn:hover {
  background: rgba(16, 185, 129, 0.1) !important;
  color: #047857 !important;
}

/* 分隔线 */
:root.canvas-theme-light .group-toolbar .toolbar-divider {
  background: rgba(0, 0, 0, 0.1) !important;
}

/* 颜色预览 */
:root.canvas-theme-light .group-toolbar .color-preview {
  border-color: rgba(0, 0, 0, 0.2) !important;
}

/* 颜色选择器下拉菜单 */
:root.canvas-theme-light .group-toolbar .color-picker-dropdown {
  background: rgba(255, 255, 255, 0.98) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.04) !important;
}

/* 布局按钮组 */
:root.canvas-theme-light .group-toolbar .layout-btn-group {
  background: rgba(0, 0, 0, 0.04) !important;
}

:root.canvas-theme-light .group-toolbar .layout-btn:hover {
  background: rgba(59, 130, 246, 0.1) !important;
  color: #3b82f6 !important;
}

/* 按钮文字 */
:root.canvas-theme-light .group-toolbar .btn-text {
  color: inherit !important;
}
</style>

