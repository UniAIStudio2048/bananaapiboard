<script setup>
/**
 * WorkflowTabs.vue - 工作流标签栏
 * 支持多工作流标签切换、拖拽排序、双击重命名
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { renameWorkflow } from '@/api/canvas/workflow'

const props = defineProps({
  tabs: {
    type: Array,
    default: () => []
  },
  activeTabId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['switch', 'close', 'new', 'save', 'rename'])

const canvasStore = useCanvasStore()

// 更多按钮的引用
const moreTabsBtn = ref(null)

// 关闭确认
const closeConfirm = ref({
  visible: false,
  tab: null
})

// 监听 tabs 变化，当 tabs 变为空时关闭弹窗
watch(() => props.tabs.length, (newLen) => {
  if (newLen === 0) {
    closeConfirm.value = { visible: false, tab: null }
  }
})

// 是否显示更多菜单
const showMoreMenu = ref(false)

// 最大可见标签数
const maxVisibleTabs = 5

// 可见的标签
const visibleTabs = computed(() => {
  return props.tabs.slice(0, maxVisibleTabs)
})

// 隐藏的标签（更多菜单中）
const hiddenTabs = computed(() => {
  return props.tabs.slice(maxVisibleTabs)
})

// ========== 拖拽排序相关 ==========
const dragState = ref({
  dragging: false,
  dragTabId: null,
  dragOverTabId: null,
  dragStartX: 0
})

// 开始拖拽
function handleDragStart(e, tab) {
  dragState.value.dragging = true
  dragState.value.dragTabId = tab.id
  dragState.value.dragStartX = e.clientX
  
  // 设置拖拽数据
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', tab.id)
  
  // 设置拖拽时的视觉效果
  const target = e.target.closest('.tab-item')
  if (target) {
    e.dataTransfer.setDragImage(target, target.offsetWidth / 2, target.offsetHeight / 2)
  }
}

// 拖拽经过
function handleDragOver(e, tab) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  
  if (dragState.value.dragTabId !== tab.id) {
    dragState.value.dragOverTabId = tab.id
  }
}

// 拖拽离开
function handleDragLeave(e, tab) {
  if (dragState.value.dragOverTabId === tab.id) {
    dragState.value.dragOverTabId = null
  }
}

// 放置
function handleDrop(e, tab) {
  e.preventDefault()
  
  const fromTabId = dragState.value.dragTabId
  const toTabId = tab.id
  
  if (fromTabId && toTabId && fromTabId !== toTabId) {
    // 找到两个标签的索引
    const fromIndex = props.tabs.findIndex(t => t.id === fromTabId)
    const toIndex = props.tabs.findIndex(t => t.id === toTabId)
    
    if (fromIndex !== -1 && toIndex !== -1) {
      canvasStore.reorderTabs(fromIndex, toIndex)
    }
  }
  
  // 重置拖拽状态
  resetDragState()
}

// 拖拽结束
function handleDragEnd() {
  resetDragState()
}

// 重置拖拽状态
function resetDragState() {
  dragState.value = {
    dragging: false,
    dragTabId: null,
    dragOverTabId: null,
    dragStartX: 0
  }
}

// ========== 双击重命名相关 ==========
const editState = ref({
  editing: false,
  tabId: null,
  originalName: '',
  newName: '',
  saving: false
})

const editInputRef = ref(null)

// 双击标签名开始编辑
function handleDoubleClick(e, tab) {
  e.stopPropagation()
  
  // 开始编辑
  editState.value = {
    editing: true,
    tabId: tab.id,
    originalName: tab.name || '未命名',
    newName: tab.name || '未命名',
    saving: false
  }
  
  // 等待 DOM 更新后聚焦
  nextTick(() => {
    if (editInputRef.value) {
      editInputRef.value.focus()
      editInputRef.value.select()
    }
  })
}

// 输入变化
function handleEditInput(e) {
  editState.value.newName = e.target.value
}

// 确认重命名
async function confirmRename() {
  const { tabId, originalName, newName, saving } = editState.value
  
  if (saving) return
  
  const trimmedName = newName.trim()
  
  // 如果名称没变或为空，取消编辑
  if (!trimmedName || trimmedName === originalName) {
    cancelEdit()
    return
  }
  
  // 找到标签
  const tab = props.tabs.find(t => t.id === tabId)
  if (!tab) {
    cancelEdit()
    return
  }
  
  // 如果是已保存的工作流，调用API重命名
  if (tab.workflowId) {
    editState.value.saving = true
    try {
      await renameWorkflow(tab.workflowId, trimmedName)
      // API成功后更新本地状态
      canvasStore.updateTabName(tabId, trimmedName)
      console.log('[WorkflowTabs] 工作流重命名成功:', trimmedName)
    } catch (error) {
      console.error('[WorkflowTabs] 重命名失败:', error)
      alert('重命名失败：' + error.message)
      editState.value.saving = false
      return
    }
  } else {
    // 未保存的工作流，只更新本地标签名
    canvasStore.updateTabName(tabId, trimmedName)
    console.log('[WorkflowTabs] 标签名更新:', trimmedName)
  }
  
  // 完成编辑
  cancelEdit()
}

// 取消编辑
function cancelEdit() {
  editState.value = {
    editing: false,
    tabId: null,
    originalName: '',
    newName: '',
    saving: false
  }
}

// 键盘事件处理
function handleEditKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmRename()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
  }
}

// 失焦时确认重命名
function handleEditBlur() {
  // 延迟处理，避免与点击事件冲突
  setTimeout(() => {
    if (editState.value.editing && !editState.value.saving) {
      confirmRename()
    }
  }, 100)
}

// ========== 原有功能 ==========

// 切换标签
function switchTab(tab) {
  // 正在编辑时不切换
  if (editState.value.editing) return
  
  if (tab.id !== props.activeTabId) {
    emit('switch', tab)
  }
}

// 请求关闭标签
function requestCloseTab(e, tab) {
  e.stopPropagation()
  
  // 如果标签有未保存的更改，显示确认对话框
  if (tab.hasChanges) {
    closeConfirm.value = { visible: true, tab }
  } else {
    emit('close', tab.id)
  }
}

// 确认关闭（不保存）
function confirmClose() {
  if (closeConfirm.value.tab) {
    const tabId = closeConfirm.value.tab.id
    console.log('[WorkflowTabs] 确认关闭标签:', tabId)
    closeConfirm.value = { visible: false, tab: null }
    emit('close', tabId)
  }
}

// 保存后关闭
function saveAndClose() {
  if (closeConfirm.value.tab) {
    const tabId = closeConfirm.value.tab.id
    console.log('[WorkflowTabs] 保存后关闭标签:', tabId)
    closeConfirm.value = { visible: false, tab: null }
    emit('save', tabId)
    emit('close', tabId)
  }
}

// 取消关闭
function cancelClose() {
  closeConfirm.value = { visible: false, tab: null }
}

// 新建工作流
function createNew() {
  emit('new')
}

// 切换更多菜单
function toggleMoreMenu(e) {
  e.stopPropagation()
  showMoreMenu.value = !showMoreMenu.value
}

// 点击外部关闭菜单
function handleClickOutside(e) {
  if (showMoreMenu.value && moreTabsBtn.value && !moreTabsBtn.value.contains(e.target)) {
    showMoreMenu.value = false
  }
}

// 从更多菜单选择标签
function selectFromMore(tab) {
  switchTab(tab)
  showMoreMenu.value = false
}

// 挂载时添加全局点击监听
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

// 卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="workflow-tabs">
    <!-- 标签列表 -->
    <div class="tabs-list">
      <div
        v-for="(tab, index) in visibleTabs"
        :key="tab.id"
        class="tab-item"
        :class="{ 
          active: tab.id === activeTabId,
          dragging: dragState.dragTabId === tab.id,
          'drag-over': dragState.dragOverTabId === tab.id
        }"
        draggable="true"
        @click="switchTab(tab)"
        @dragstart="handleDragStart($event, tab)"
        @dragover="handleDragOver($event, tab)"
        @dragleave="handleDragLeave($event, tab)"
        @drop="handleDrop($event, tab)"
        @dragend="handleDragEnd"
      >
        <!-- 工作流图标 -->
        <div class="tab-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="6" height="6" rx="1"/>
            <rect x="15" y="3" width="6" height="6" rx="1"/>
            <rect x="9" y="15" width="6" height="6" rx="1"/>
            <path d="M6 9v3h3M18 9v3h-3M12 15v-3"/>
          </svg>
        </div>
        
        <!-- 标签名称 - 可编辑 -->
        <input
          v-if="editState.editing && editState.tabId === tab.id"
          ref="editInputRef"
          type="text"
          class="tab-name-input"
          :value="editState.newName"
          :disabled="editState.saving"
          @input="handleEditInput"
          @keydown="handleEditKeydown"
          @blur="handleEditBlur"
          @click.stop
        />
        <span 
          v-else 
          class="tab-name"
          @dblclick="handleDoubleClick($event, tab)"
          :title="'双击重命名 - ' + (tab.name || '未命名')"
        >
          {{ tab.name || '未命名' }}
        </span>
        
        <!-- 未保存标记 -->
        <span v-if="tab.hasChanges && !(editState.editing && editState.tabId === tab.id)" class="unsaved-dot" title="有未保存的更改"></span>
        
        <!-- 保存中指示器 -->
        <span v-if="editState.saving && editState.tabId === tab.id" class="saving-indicator">
          <svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        </span>
        
        <!-- 关闭按钮 -->
        <button 
          v-if="!(editState.editing && editState.tabId === tab.id)"
          class="tab-close" 
          @click="requestCloseTab($event, tab)"
          :title="tabs.length === 1 ? '关闭并返回首页' : '关闭'"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      
      <!-- 更多标签按钮 -->
      <div v-if="hiddenTabs.length > 0" ref="moreTabsBtn" class="more-tabs-container">
        <button class="more-tabs-btn" @click="toggleMoreMenu">
          <span class="more-count">+{{ hiddenTabs.length }}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'rotate-180': showMoreMenu }">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        
        <!-- 更多菜单 -->
        <Transition name="menu-fade">
          <div v-if="showMoreMenu" class="more-menu" @click.stop>
            <div
              v-for="tab in hiddenTabs"
              :key="tab.id"
              class="more-menu-item"
              :class="{ active: tab.id === activeTabId }"
              @click="selectFromMore(tab)"
            >
              <span class="menu-item-name">{{ tab.name || '未命名' }}</span>
              <span v-if="tab.hasChanges" class="unsaved-dot"></span>
            </div>
          </div>
        </Transition>
      </div>
    </div>
    
    <!-- 新建按钮 -->
    <button class="new-tab-btn" @click="createNew" title="新建工作流">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
    
    <!-- 关闭确认弹窗 -->
    <Transition name="fade">
      <div v-if="closeConfirm.visible" class="close-confirm-overlay" @click.self="cancelClose">
        <div class="close-confirm-dialog">
          <p>工作流 "{{ closeConfirm.tab?.name }}" 有未保存的更改</p>
          <div class="confirm-actions">
            <button class="btn-discard" @click="confirmClose">不保存</button>
            <button class="btn-cancel" @click="cancelClose">取消</button>
            <button class="btn-save" @click="saveAndClose">保存</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.workflow-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(20, 20, 20, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  max-width: calc(100vw - 200px);
}

.tabs-list {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: visible;
}

/* 标签项 */
.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  max-width: 160px;
  min-width: 80px;
  user-select: none;
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.tab-item.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
}

/* 拖拽状态 */
.tab-item.dragging {
  opacity: 0.5;
  transform: scale(0.98);
}

.tab-item.drag-over {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.15);
}

.tab-icon {
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.tab-item.active .tab-icon {
  color: rgba(255, 255, 255, 0.8);
}

.tab-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  cursor: text;
}

.tab-item.active .tab-name {
  color: #fff;
  font-weight: 500;
}

/* 标签名输入框 */
.tab-name-input {
  font-size: 12px;
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 2px 6px;
  width: 80px;
  outline: none;
  flex: 1;
  min-width: 60px;
}

.tab-name-input:focus {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.2);
}

.tab-name-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 未保存标记 */
.unsaved-dot {
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 保存中指示器 */
.saving-indicator {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.6);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 关闭按钮 */
.tab-close {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}

.tab-item:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

/* 更多标签 */
.more-tabs-container {
  position: relative;
}

.more-tabs-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.more-tabs-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.more-tabs-btn svg {
  transition: transform 0.2s ease;
}

.more-count {
  font-weight: 500;
}

.more-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  background: rgba(30, 30, 30, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

/* 箭头旋转 */
.rotate-180 {
  transform: rotate(180deg);
  transition: transform 0.2s ease;
}

/* 菜单动画 */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: all 0.15s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.more-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.more-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.more-menu-item.active {
  background: rgba(255, 255, 255, 0.12);
}

.menu-item-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

/* 新建按钮 */
.new-tab-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.new-tab-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

/* 关闭确认弹窗 */
.close-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.close-confirm-dialog {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px 24px;
  max-width: 320px;
  text-align: center;
}

.close-confirm-dialog p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 20px;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.confirm-actions button {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-discard {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.6);
}

.btn-discard:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
}

.btn-save {
  background: #fff;
  border: none;
  color: #0a0a0a;
}

.btn-save:hover {
  background: rgba(255, 255, 255, 0.9);
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

</style>

<!-- 白昼模式样式（非 scoped，确保 :root 选择器生效） -->
<style>
/* ========================================
   WorkflowTabs 白昼模式样式适配
   ======================================== */
:root.canvas-theme-light .workflow-tabs {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
}

:root.canvas-theme-light .workflow-tabs .tab-item {
  background: rgba(0, 0, 0, 0.03);
  border-color: transparent;
}

:root.canvas-theme-light .workflow-tabs .tab-item:hover {
  background: rgba(0, 0, 0, 0.06);
}

:root.canvas-theme-light .workflow-tabs .tab-item.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

:root.canvas-theme-light .workflow-tabs .tab-item.drag-over {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.12);
}

:root.canvas-theme-light .workflow-tabs .tab-icon {
  color: rgba(0, 0, 0, 0.4);
}

:root.canvas-theme-light .workflow-tabs .tab-item.active .tab-icon {
  color: rgba(59, 130, 246, 0.8);
}

:root.canvas-theme-light .workflow-tabs .tab-name {
  color: rgba(0, 0, 0, 0.65);
}

:root.canvas-theme-light .workflow-tabs .tab-item.active .tab-name {
  color: #1c1917;
}

:root.canvas-theme-light .workflow-tabs .tab-name-input {
  color: #1c1917;
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .workflow-tabs .tab-name-input:focus {
  border-color: rgba(59, 130, 246, 0.5);
  background: #ffffff;
}

:root.canvas-theme-light .workflow-tabs .tab-close {
  color: rgba(0, 0, 0, 0.35);
}

:root.canvas-theme-light .workflow-tabs .tab-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .workflow-tabs .new-tab-btn {
  background: rgba(0, 0, 0, 0.04) !important;
  border-color: rgba(0, 0, 0, 0.1) !important;
  color: rgba(0, 0, 0, 0.5) !important;
}

:root.canvas-theme-light .workflow-tabs .new-tab-btn:hover {
  background: rgba(0, 0, 0, 0.08) !important;
  color: rgba(0, 0, 0, 0.8) !important;
}

:root.canvas-theme-light .workflow-tabs .more-tabs-btn {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .workflow-tabs .more-tabs-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .workflow-tabs .more-tabs-menu {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .workflow-tabs .more-tabs-item {
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .workflow-tabs .more-tabs-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .workflow-tabs .more-tabs-item.active {
  color: #1c1917;
  background: rgba(59, 130, 246, 0.1);
}

:root.canvas-theme-light .workflow-tabs .close-confirm-overlay {
  background: rgba(255, 255, 255, 0.6);
}

:root.canvas-theme-light .workflow-tabs .close-confirm-dialog {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .workflow-tabs .close-confirm-dialog p {
  color: #1c1917;
}

:root.canvas-theme-light .workflow-tabs .btn-discard {
  border-color: rgba(0, 0, 0, 0.15);
  color: rgba(0, 0, 0, 0.6);
}

:root.canvas-theme-light .workflow-tabs .btn-discard:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.8);
}

:root.canvas-theme-light .workflow-tabs .btn-cancel {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.7);
}

:root.canvas-theme-light .workflow-tabs .btn-cancel:hover {
  background: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .workflow-tabs .btn-save {
  background: #1c1917;
  color: #ffffff;
}

:root.canvas-theme-light .workflow-tabs .btn-save:hover {
  background: #292524;
}
</style>
