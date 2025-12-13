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

const emit = defineEmits(['close', 'upload', 'add-node'])
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

// 是否有选中的节点
const hasSelectedNodes = computed(() => canvasStore.selectedNodeId !== null)

// 是否有多选节点（至少2个）
const hasMultipleSelectedNodes = computed(() => canvasStore.selectedNodeIds.length >= 2)

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
  canvasStore.copySelectedNodes()
  emit('close')
}

// 粘贴节点
function handlePaste() {
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
  if (canvasStore.selectedNodeIds.length >= 2) {
    canvasStore.createGroup(canvasStore.selectedNodeIds)
  }
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
    
    <div 
      class="canvas-context-menu-item"
      :class="{ disabled: !hasMultipleSelectedNodes }"
      @click="hasMultipleSelectedNodes && handleGroup()"
    >
      <span class="icon">📦</span>
      编组
      <span class="shortcut">Ctrl+G</span>
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

