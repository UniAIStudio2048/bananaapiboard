<script setup>
/**
 * CanvasContextMenu.vue - 画布右键菜单（空白区域）
 * 
 * 功能：
 * - 上传图片/视频
 * - 添加节点
 * - 撤销/重做
 * - 复制/粘贴节点
 */
import { computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'

const props = defineProps({
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  }
})

const emit = defineEmits(['close', 'upload', 'add-node', 'group'])
const canvasStore = useCanvasStore()

// 菜单位置样式
const menuStyle = computed(() => {
  let x = props.position.x
  let y = props.position.y
  
  // 确保不超出屏幕
  const menuWidth = 200
  const menuHeight = 350
  
  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 20
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 20
  }
  
  return {
    left: `${x}px`,
    top: `${y}px`
  }
})

// 是否可以撤销
const canUndo = computed(() => canvasStore.canUndo)

// 是否可以重做
const canRedo = computed(() => canvasStore.canRedo)

// 是否有剪贴板内容
const hasClipboard = computed(() => canvasStore.hasClipboard)

// 是否有选中的节点（1个或多个）
const hasSelectedNodes = computed(() => {
  return canvasStore.selectedNodeIds.length > 0 || canvasStore.selectedNodeId !== null
})

// 选中的节点数量
const selectedCount = computed(() => {
  // 优先使用 selectedNodeIds（框选多节点）
  if (canvasStore.selectedNodeIds.length > 0) {
    return canvasStore.selectedNodeIds.length
  }
  // 其次检查单选
  return canvasStore.selectedNodeId ? 1 : 0
})

// 是否有多选节点（至少2个，可以编组）
const hasMultipleSelectedNodes = computed(() => selectedCount.value >= 2)

// 上传图片
function handleUploadImage() {
  emit('upload', 'image')
  emit('close')
}

// 上传视频
function handleUploadVideo() {
  emit('upload', 'video')
  emit('close')
}

// 添加节点（打开节点选择器）
function handleAddNode() {
  emit('add-node', props.position)
  emit('close')
}

// 撤销
function handleUndo() {
  canvasStore.undo()
  emit('close')
}

// 重做
function handleRedo() {
  canvasStore.redo()
  emit('close')
}

// 复制选中的节点
function handleCopy() {
  // 确保有选中的节点才复制
  if (canvasStore.selectedNodeIds.length > 0 || canvasStore.selectedNodeId) {
    canvasStore.copySelectedNodes()
  }
  emit('close')
}

// 粘贴节点
function handlePaste() {
  // 需要有剪贴板内容才能粘贴
  if (!canvasStore.hasClipboard) {
    return
  }
  // 在鼠标位置粘贴
  canvasStore.pasteNodes(props.position)
  emit('close')
}

// 全选节点
function handleSelectAll() {
  canvasStore.selectAllNodes()
  emit('close')
}

// 编组选中的节点
function handleGroup() {
  // 需要至少选中2个节点才能编组
  if (selectedCount.value < 2) {
    return
  }
  
  console.log('[ContextMenu] 触发编组事件')
  // 发出编组事件，由 CanvasBoard 处理实际的编组逻辑
  emit('group')
  emit('close')
}

// 删除选中的节点
function handleDeleteSelected() {
  // 先获取要删除的节点ID列表
  let nodeIdsToDelete = []
  
  if (canvasStore.selectedNodeIds.length > 0) {
    nodeIdsToDelete = [...canvasStore.selectedNodeIds]
  } else if (canvasStore.selectedNodeId) {
    nodeIdsToDelete = [canvasStore.selectedNodeId]
  }
  
  // 删除节点
  nodeIdsToDelete.forEach(nodeId => {
    canvasStore.removeNode(nodeId)
  })
  
  // 清除选择状态
  canvasStore.clearSelection()
  emit('close')
}

// 阻止点击冒泡
function handleMenuClick(event) {
  event.stopPropagation()
}
</script>

<template>
  <div 
    class="canvas-context-menu" 
    :style="menuStyle"
    @click="handleMenuClick"
    @contextmenu.prevent
  >
    <!-- 当有节点被选中时，显示选中操作菜单 -->
    <template v-if="selectedCount > 0">
      <div class="canvas-context-menu-title">选中 {{ selectedCount }} 个节点</div>
      
      <!-- 编组选项（需要至少2个节点） -->
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: selectedCount < 2 }"
        @click="handleGroup"
      >
        <span class="icon">📦</span>
        编组
        <span class="shortcut">Ctrl+G</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <div class="canvas-context-menu-item" @click="handleCopy">
        <span class="icon">📋</span>
        复制选中
        <span class="shortcut">Ctrl+C</span>
      </div>
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: !hasClipboard }"
        @click="handlePaste"
      >
        <span class="icon">📄</span>
        粘贴
        <span class="shortcut">Ctrl+V</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <div class="canvas-context-menu-item delete-item" @click="handleDeleteSelected">
        <span class="icon">🗑️</span>
        删除选中
        <span class="shortcut">Delete</span>
      </div>
    </template>
    
    <!-- 默认菜单（没有多选节点时） -->
    <template v-else>
      <!-- 上传 -->
      <div class="canvas-context-menu-title">上传资源</div>
      <div class="canvas-context-menu-item" @click="handleUploadImage">
        <span class="icon">🖼️</span>
        上传图片
        <span class="shortcut"></span>
      </div>
      <div class="canvas-context-menu-item" @click="handleUploadVideo">
        <span class="icon">🎬</span>
        上传视频
        <span class="shortcut"></span>
      </div>

      <div class="canvas-context-menu-divider"></div>

      <!-- 添加节点 -->
      <div class="canvas-context-menu-item" @click="handleAddNode">
        <span class="icon">➕</span>
        添加节点
        <span class="shortcut">双击</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <!-- 编辑操作 -->
      <div class="canvas-context-menu-title">编辑</div>
      <div 
        class="canvas-context-menu-item" 
        :class="{ disabled: !canUndo }"
        @click="canUndo && handleUndo()"
      >
        <span class="icon">↩️</span>
        撤销
        <span class="shortcut">Ctrl+Z</span>
      </div>
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: !canRedo }"
        @click="canRedo && handleRedo()"
      >
        <span class="icon">↪️</span>
        重做
        <span class="shortcut">Ctrl+Y</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: !hasSelectedNodes }"
        @click="hasSelectedNodes && handleCopy()"
      >
        <span class="icon">📋</span>
        复制节点
        <span class="shortcut">Ctrl+C</span>
      </div>
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: !hasClipboard }"
        @click="hasClipboard && handlePaste()"
      >
        <span class="icon">📄</span>
        粘贴节点
        <span class="shortcut">Ctrl+V</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <div class="canvas-context-menu-item" @click="handleSelectAll">
        <span class="icon">⬜</span>
        全选
        <span class="shortcut">Ctrl+A</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <!-- 快捷键提示 -->
      <div class="canvas-context-menu-title">交互提示</div>
      <div class="canvas-context-menu-hint">
        <div class="hint-item">
          <span class="hint-key">Ctrl + 拖动</span>
          <span class="hint-desc">框选节点</span>
        </div>
        <div class="hint-item">
          <span class="hint-key">空格 + 拖动</span>
          <span class="hint-desc">平移画布</span>
        </div>
        <div class="hint-item">
          <span class="hint-key">滚轮</span>
          <span class="hint-desc">缩放画布</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.canvas-context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  background: var(--canvas-bg-tertiary, #1a1a1a);
  border: 1px solid var(--canvas-border-default, #3a3a3a);
  border-radius: 12px;
  padding: 8px 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.canvas-context-menu-title {
  padding: 6px 16px;
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.canvas-context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}

.canvas-context-menu-item:hover:not(.disabled) {
  background: var(--canvas-bg-elevated, #242424);
  color: var(--canvas-text-primary, #fff);
}

.canvas-context-menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.canvas-context-menu-item.delete-item {
  color: #ef4444;
}

.canvas-context-menu-item.delete-item:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.canvas-context-menu-item .icon {
  width: 20px;
  margin-right: 10px;
  text-align: center;
  font-size: 14px;
}

.canvas-context-menu-item .shortcut {
  margin-left: auto;
  font-size: 11px;
  color: var(--canvas-text-tertiary, #666);
  padding-left: 16px;
}

.canvas-context-menu-divider {
  height: 1px;
  background: var(--canvas-border-subtle, #2a2a2a);
  margin: 6px 12px;
}

.canvas-context-menu-hint {
  padding: 8px 16px;
  font-size: 11px;
  color: var(--canvas-text-tertiary, #888);
}

.hint-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.hint-key {
  font-weight: 500;
  color: var(--canvas-text-secondary, #aaa);
  background: var(--canvas-bg-quaternary, #0a0a0a);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
}

.hint-desc {
  color: var(--canvas-text-tertiary, #888);
  font-size: 10px;
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   CanvasContextMenu 白昼模式样式适配
   ======================================== */
:root.canvas-theme-light .canvas-context-menu {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .canvas-context-menu-title {
  color: #78716c;
}

:root.canvas-theme-light .canvas-context-menu-item {
  color: #57534e;
}

:root.canvas-theme-light .canvas-context-menu-item:hover:not(.disabled) {
  background: rgba(0, 0, 0, 0.04);
  color: #1c1917;
}

:root.canvas-theme-light .canvas-context-menu-item .shortcut {
  color: #a8a29e;
}

:root.canvas-theme-light .canvas-context-menu-divider {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .canvas-context-menu-hint {
  color: #78716c;
}

:root.canvas-theme-light .hint-key {
  color: #57534e;
  background: rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .hint-desc {
  color: #a8a29e;
}

:root.canvas-theme-light .canvas-context-menu-item.delete-item {
  color: #dc2626;
}

:root.canvas-theme-light .canvas-context-menu-item.delete-item:hover {
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
}
</style>

