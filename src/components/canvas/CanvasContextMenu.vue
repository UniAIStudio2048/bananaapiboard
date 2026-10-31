<script setup>
/**
 * CanvasContextMenu.vue - 画布右键菜单（空白区域）
 * 
 * 功能：
 * - 上传图片/视频/音频
 * - 添加节点
 * - 撤销/重做
 * - 复制/粘贴节点
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { AudioLines, ClipboardPaste, Copy, Download, Film, Group, History, Image, Plus, Redo2, Scan, Trash2, Undo2 } from '@lucide/vue'
import { useCanvasStore } from '@/stores/canvas'
import { resolveCanvasMenuPastePosition } from '@/utils/canvasClipboardPaste'
import { getSelectedMediaNodeIds } from '@/utils/canvasBatchDownload'

const props = defineProps({
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  }
})

const emit = defineEmits(['close', 'upload', 'add-node', 'group', 'paste-clipboard', 'download-selected-media', 'select-history'])
const canvasStore = useCanvasStore()

const menuRef = ref(null)
const adjustedPos = ref({ x: 0, y: 0 })

function adjustPosition() {
  let x = props.position.x
  let y = props.position.y
  const padding = 10

  if (menuRef.value) {
    const rect = menuRef.value.getBoundingClientRect()
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - padding
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - padding
    }
  }

  if (x < padding) x = padding
  if (y < padding) y = padding
  adjustedPos.value = { x, y }
}

onMounted(() => {
  adjustedPos.value = { x: props.position.x, y: props.position.y }
  nextTick(adjustPosition)
})

const menuStyle = computed(() => ({
  left: `${adjustedPos.value.x}px`,
  top: `${adjustedPos.value.y}px`
}))

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

const hasDownloadableMedia = computed(() => getSelectedMediaNodeIds(
  canvasStore.nodes,
  canvasStore.selectedNodeIds,
  canvasStore.selectedNodeId
).length > 0)

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

// 上传音频
function handleUploadAudio() {
  emit('upload', 'audio')
  emit('close')
}

// 添加节点（打开节点选择器）
function handleAddNode() {
  emit('add-node', props.position)
  emit('close')
}

function handleSelectHistory() {
  emit('select-history', resolveCanvasMenuPastePosition(props.position))
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

function handleDownloadSelectedMedia() {
  emit('download-selected-media')
  emit('close')
}

// 粘贴节点
function handlePaste() {
  // 需要有剪贴板内容才能粘贴
  if (!canvasStore.hasClipboard) {
    return
  }
  // 在鼠标位置粘贴
  canvasStore.pasteNodes(resolveCanvasMenuPastePosition(props.position))
  emit('close')
}

// 从系统剪贴板粘贴图片/文件
async function handlePasteFromClipboard() {
  try {
    const items = await navigator.clipboard.read()
    const files = []
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) {
          const blob = await item.getType(type)
          const ext = type.split('/')[1] || 'png'
          const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type })
          files.push(file)
        }
      }
    }
    if (files.length > 0) {
      emit('paste-clipboard', files)
    }
  } catch (err) {
    console.warn('[CanvasContextMenu] 读取剪贴板失败:', err.message)
  }
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
    ref="menuRef"
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
        <Group class="icon" aria-hidden="true" />
        编组
        <span class="shortcut">Ctrl+G</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <div class="canvas-context-menu-item" @click="handleCopy">
        <Copy class="icon" aria-hidden="true" />
        复制选中
        <span class="shortcut">Ctrl+C</span>
      </div>
      <div
        class="canvas-context-menu-item"
        :class="{ disabled: !hasDownloadableMedia }"
        @click="hasDownloadableMedia && handleDownloadSelectedMedia()"
      >
        <Download class="icon" aria-hidden="true" />
        下载选中媒体
      </div>
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: !hasClipboard }"
        @click="handlePaste"
      >
        <ClipboardPaste class="icon" aria-hidden="true" />
        粘贴
        <span class="shortcut">Ctrl+V</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <div class="canvas-context-menu-item delete-item" @click="handleDeleteSelected">
        <Trash2 class="icon" aria-hidden="true" />
        删除选中
        <span class="shortcut">Delete</span>
      </div>
    </template>
    
    <!-- 默认菜单（没有多选节点时） -->
    <template v-else>
      <!-- 上传 -->
      <div class="canvas-context-menu-title">上传资源</div>
      <div class="canvas-context-menu-item" @click="handleUploadImage">
        <Image class="icon" aria-hidden="true" />
        上传图片
        <span class="shortcut"></span>
      </div>
      <div class="canvas-context-menu-item" @click="handleUploadVideo">
        <Film class="icon" aria-hidden="true" />
        上传视频
        <span class="shortcut"></span>
      </div>
      <div class="canvas-context-menu-item" @click="handleUploadAudio">
        <AudioLines class="icon" aria-hidden="true" />
        上传音频
        <span class="shortcut"></span>
      </div>
      <button type="button" class="canvas-context-menu-item history-menu-item" @click="handleSelectHistory">
        <History class="icon" aria-hidden="true" />
        从生成历史选择
      </button>
      <div class="canvas-context-menu-item" @click="handlePasteFromClipboard">
        <ClipboardPaste class="icon" aria-hidden="true" />
        从剪贴板粘贴
        <span class="shortcut">{{ hasClipboard ? '' : 'Ctrl+V' }}</span>
      </div>

      <div class="canvas-context-menu-divider"></div>

      <!-- 添加节点 -->
      <div class="canvas-context-menu-item" @click="handleAddNode">
        <Plus class="icon" aria-hidden="true" />
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
        <Undo2 class="icon" aria-hidden="true" />
        撤销
        <span class="shortcut">Ctrl+Z</span>
      </div>
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: !canRedo }"
        @click="canRedo && handleRedo()"
      >
        <Redo2 class="icon" aria-hidden="true" />
        重做
        <span class="shortcut">Ctrl+Y</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: !hasSelectedNodes }"
        @click="hasSelectedNodes && handleCopy()"
      >
        <Copy class="icon" aria-hidden="true" />
        复制节点
        <span class="shortcut">Ctrl+C</span>
      </div>
      <div 
        class="canvas-context-menu-item"
        :class="{ disabled: !hasClipboard }"
        @click="hasClipboard && handlePaste()"
      >
        <ClipboardPaste class="icon" aria-hidden="true" />
        粘贴节点
        <span class="shortcut">Ctrl+V</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <div class="canvas-context-menu-item" @click="handleSelectAll">
        <Scan class="icon" aria-hidden="true" />
        全选
        <span class="shortcut">Ctrl+A</span>
      </div>
      
      <div class="canvas-context-menu-divider"></div>
      
      <!-- 快捷键提示 -->
      <div class="canvas-context-menu-title">交互提示</div>
      <div class="canvas-context-menu-hint">
        <div class="hint-item">
          <span class="hint-key">Shift + 拖动</span>
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
        <div class="hint-item">
          <span class="hint-key">Shift + 滚轮</span>
          <span class="hint-desc">左右平移</span>
        </div>
        <div class="hint-item">
          <span class="hint-key">Ctrl + 滚轮</span>
          <span class="hint-desc">上下平移</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.canvas-context-menu {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  width: 224px;
  max-width: calc(100vw - 20px);
  max-height: calc(100vh - 20px);
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #1b1b1b;
  border: 1px solid #303030;
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.canvas-context-menu-title {
  padding: 8px 10px 5px;
  font-size: 11px;
  font-weight: 500;
  color: #818181;
}

.canvas-context-menu-item {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  color: #dedede;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}

.history-menu-item {
  width: 100%;
  text-align: left;
}

.history-menu-item:focus-visible {
  outline: 2px solid var(--canvas-text-primary);
  outline-offset: -2px;
}

.canvas-context-menu-item:hover:not(.disabled) {
  background: #303030;
  color: #fff;
}

.canvas-context-menu-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.canvas-context-menu-item.delete-item {
  color: #dedede;
}

.canvas-context-menu-item.delete-item:hover {
  background: #303030;
  color: #fff;
}

.canvas-context-menu-item .icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  margin-right: 12px;
  stroke-width: 1.75;
}

.canvas-context-menu-item .shortcut {
  margin-left: auto;
  font-size: 11px;
  color: #858585;
  padding-left: 12px;
  white-space: nowrap;
}

.canvas-context-menu-divider {
  height: 1px;
  background: #303030;
  margin: 5px 8px;
}

.canvas-context-menu-hint {
  padding: 3px 10px 6px;
  font-size: 11px;
  color: var(--canvas-text-tertiary, #888);
}

.hint-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
}

.hint-key {
  font-weight: 500;
  color: #a5a5a5;
  background: #242424;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 10px;
}

.hint-desc {
  color: #8d8d8d;
  font-size: 10px;
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   CanvasContextMenu 白昼模式样式适配
   ======================================== */
:root.canvas-theme-light .canvas-context-menu {
  background: #fff;
  border-color: #dedede;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .canvas-context-menu-title {
  color: #777;
}

:root.canvas-theme-light .canvas-context-menu-item {
  color: #303030;
}

:root.canvas-theme-light .canvas-context-menu-item:hover:not(.disabled) {
  background: #f0f0f0;
  color: #171717;
}

:root.canvas-theme-light .canvas-context-menu-item .shortcut {
  color: #858585;
}

:root.canvas-theme-light .canvas-context-menu-divider {
  background: #ededed;
}

:root.canvas-theme-light .canvas-context-menu-hint {
  color: #777;
}

:root.canvas-theme-light .hint-key {
  color: #656565;
  background: #f2f2f2;
}

:root.canvas-theme-light .hint-desc {
  color: #858585;
}

:root.canvas-theme-light .canvas-context-menu-item.delete-item {
  color: #303030;
}

:root.canvas-theme-light .canvas-context-menu-item.delete-item:hover {
  background: #f0f0f0;
  color: #171717;
}
</style>
