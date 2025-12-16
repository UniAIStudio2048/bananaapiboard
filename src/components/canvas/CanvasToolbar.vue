<script setup>
/**
 * CanvasToolbar.vue - 左侧工具栏
 */
import { ref, inject, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCanvasStore } from '@/stores/canvas'
import { saveWorkflowLocal } from '@/api/canvas/workflow'
import UserProfilePanel from './UserProfilePanel.vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const router = useRouter()
const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')
const openTemplates = inject('openTemplates')
const openWorkflowPanel = inject('openWorkflowPanel')
const openAssetPanel = inject('openAssetPanel')
const openHistoryPanel = inject('openHistoryPanel')

// 个人中心面板
const showProfilePanel = ref(false)
const profilePanelPosition = ref({ x: 80, y: 100 })

// 节点面板显示状态
const showNodePanel = ref(false)
const nodeMenuHoverTimer = ref(null)

// 节点类型列表 - 黑白灰简洁风格
const nodeTypes = computed(() => [
  {
    type: 'text-input',
    icon: 'Aa',
    label: t('canvas.nodes.text'),
    tag: 'Gemini3',
    description: t('canvas.nodes.textDesc')
  },
  {
    type: 'image-input',
    icon: '◫',
    label: t('canvas.nodes.image'),
    tag: 'Banana Pro',
    description: null
  },
  {
    type: 'video-input',
    icon: '▷',
    label: t('canvas.nodes.video'),
    tag: null,
    description: null
  },
  {
    type: 'audio-input',
    icon: '♪',
    label: t('canvas.nodes.audio'),
    tag: 'Beta',
    description: null
  }
])

// 鼠标进入+号按钮
function handleAddBtnMouseEnter() {
  if (nodeMenuHoverTimer.value) {
    clearTimeout(nodeMenuHoverTimer.value)
  }
  showNodePanel.value = true
}

// 鼠标离开+号按钮区域
function handleAddMenuMouseLeave() {
  nodeMenuHoverTimer.value = setTimeout(() => {
    showNodePanel.value = false
  }, 200)
}

// 鼠标进入节点面板
function handleNodePanelMouseEnter() {
  if (nodeMenuHoverTimer.value) {
    clearTimeout(nodeMenuHoverTimer.value)
  }
  showNodePanel.value = true
}

// 创建节点
function createNode(nodeType) {
  const position = {
    x: 300,
    y: window.innerHeight / 2 - 100
  }
  
  canvasStore.addNode({
    type: nodeType,
    position,
    data: {}
  })
  
  showNodePanel.value = false
}

// 打开文件上传
function handleUpload() {
  // 触发文件上传逻辑
  canvasStore.openNodeSelector(
    { x: 80, y: window.innerHeight / 2 - 100 },
    'toolbar'
  )
  showNodePanel.value = false
}

// 返回首页
function goHome() {
  router.push('/')
}

// 打开模板面板
function handleOpenTemplates() {
  if (openTemplates) {
    openTemplates()
  }
}

// 打开我的工作流面板
function openWorkflows() {
  if (openWorkflowPanel) {
    openWorkflowPanel()
  }
}

// 打开我的资产面板
function openAssets() {
  if (openAssetPanel) {
    openAssetPanel()
  }
}

// 打开历史记录面板
function openHistory() {
  if (openHistoryPanel) {
    openHistoryPanel()
  }
}

// 打开保存对话框
const emit = defineEmits(['openSaveDialog'])

function saveWorkflow() {
  const data = canvasStore.exportWorkflow()
  if (data.nodes.length === 0) {
    // 画布为空时静默返回，不做任何提示
    return
  }
  
  // 触发打开保存对话框
  emit('openSaveDialog')
}

// 计算总积分
function getTotalPoints() {
  if (!userInfo.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
}

// 打开个人中心面板
function openProfilePanel(event) {
  // 计算面板位置（在按钮右侧，靠近顶部）
  const btn = event.currentTarget
  const rect = btn.getBoundingClientRect()
  profilePanelPosition.value = {
    x: rect.right + 16,
    y: 80  // 固定在顶部附近
  }
  showProfilePanel.value = true
}

// 关闭个人中心面板
function closeProfilePanel() {
  showProfilePanel.value = false
}

// 刷新用户信息
function handleUserUpdate() {
  // 触发父组件刷新用户信息
  window.location.reload()
}
</script>

<template>
  <div class="canvas-toolbar" @click.stop>
    <!-- 添加节点按钮（主按钮） -->
    <div 
      class="add-node-container"
      @mouseenter="handleAddBtnMouseEnter"
      @mouseleave="handleAddMenuMouseLeave"
    >
      <button 
        class="canvas-toolbar-btn add-btn" 
        :title="t('canvas.addNode')"
      >
        +
      </button>
      
      <!-- 节点选择面板 -->
      <div 
        v-if="showNodePanel"
        class="node-panel"
        @mouseenter="handleNodePanelMouseEnter"
        @mouseleave="handleAddMenuMouseLeave"
      >
        <div class="node-panel-title">{{ t('canvas.addNode') }}</div>
        
        <!-- 节点类型列表 -->
        <div class="node-list">
          <div 
            v-for="node in nodeTypes" 
            :key="node.type"
            class="node-item"
            @click="createNode(node.type)"
          >
            <div class="node-icon">{{ node.icon }}</div>
            <div class="node-info">
              <div class="node-header">
                <span class="node-label">{{ node.label }}</span>
                <span v-if="node.tag" class="node-tag">{{ node.tag }}</span>
              </div>
              <div v-if="node.description" class="node-desc">{{ node.description }}</div>
            </div>
          </div>
        </div>
        
        <div class="node-panel-divider"></div>
        <div class="node-panel-title">{{ t('canvas.addResource') }}</div>
        
        <!-- 上传选项 -->
        <div class="node-item" @click="handleUpload">
          <div class="node-icon">↑</div>
          <div class="node-info">
            <div class="node-label">{{ t('common.upload') }}</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="canvas-toolbar-divider"></div>
    
    <!-- 我的资产 -->
    <button 
      class="canvas-toolbar-btn icon-btn asset-btn" 
      :title="t('canvas.assets')"
      @click="openAssets"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <!-- 资产图标 -->
        <path d="M20 7h-9"/>
        <path d="M14 17H5"/>
        <circle cx="17" cy="17" r="3"/>
        <circle cx="7" cy="7" r="3"/>
      </svg>
    </button>
    
    <!-- 我的工作流 -->
    <button 
      class="canvas-toolbar-btn icon-btn" 
      :title="t('canvas.myWorkflows')"
      @click="openWorkflows"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <!-- 工作流图标：三个节点 + 连接线 -->
        <rect x="2" y="4" width="6" height="6" rx="1"></rect>
        <rect x="9" y="14" width="6" height="6" rx="1"></rect>
        <rect x="16" y="4" width="6" height="6" rx="1"></rect>
        <path d="M5 10 L5 12 L12 12 L12 14"></path>
        <path d="M19 10 L19 12 L12 12"></path>
      </svg>
    </button>
    
    <!-- 历史记录 -->
    <button 
      class="canvas-toolbar-btn icon-btn history-btn" 
      :title="t('canvas.history')"
      @click="openHistory"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
    </button>
    
    <!-- 保存工作流 -->
    <button 
      class="canvas-toolbar-btn icon-btn" 
      :title="t('canvas.saveWorkflow')"
      @click="saveWorkflow"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
    </button>
    
    <div class="canvas-toolbar-divider"></div>
    
    <!-- 个人中心按钮 -->
    <button 
      class="canvas-toolbar-btn user-btn" 
      :title="`${t('nav.user')} | ${t('user.points')}: ${getTotalPoints()}`"
      @click="openProfilePanel"
    >
      {{ userInfo?.username?.charAt(0)?.toUpperCase() || 'P' }}
    </button>
    
    <!-- 个人中心面板 -->
    <UserProfilePanel
      :visible="showProfilePanel"
      :user-info="userInfo"
      :position="profilePanelPosition"
      @close="closeProfilePanel"
      @update="handleUserUpdate"
    />
  </div>
</template>

<style scoped>
.canvas-toolbar {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 50;
  background: rgba(20, 20, 20, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 12px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.canvas-toolbar-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 18px;
  position: relative;
}

.canvas-toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

/* 添加节点容器 */
.add-node-container {
  position: relative;
}

.add-btn {
  width: 44px;
  height: 44px;
  background: white;
  color: #0a0a0a;
  border-radius: 12px;
  font-size: 28px;
  font-weight: 300;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.add-btn:hover {
  background: white;
  color: #0a0a0a;
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

/* 图标按钮 */
.icon-btn {
  font-size: 20px;
}

.icon-btn svg {
  stroke: rgba(255, 255, 255, 0.6);
}

.icon-btn:hover svg {
  stroke: rgba(255, 255, 255, 0.9);
}


/* 用户按钮 */
.user-btn {
  font-size: 16px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
}

.user-btn:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.1);
}

.canvas-toolbar-divider {
  width: 28px;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px auto;
}

/* ========== 节点面板 ========== */
.node-panel {
  position: absolute;
  left: calc(100% + 12px);
  top: 0;
  width: 340px;
  background: rgba(30, 30, 30, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  animation: slideInFromLeft 0.2s ease;
  z-index: 100;
}

@keyframes slideInFromLeft {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.node-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
  padding: 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.node-panel-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 12px 0;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.node-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.node-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  font-family: system-ui, -apple-system, sans-serif;
  letter-spacing: -0.5px;
}

.node-info {
  flex: 1;
  min-width: 0;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.node-label {
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.node-tag {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.node-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.4;
}
</style>

