<script setup>
/**
 * CanvasEmptyState.vue - 空白画布引导
 */
import { inject, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCanvasStore } from '@/stores/canvas'
import { NODE_TYPES } from '@/config/canvas/nodeTypes'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const router = useRouter()
const canvasStore = useCanvasStore()
const openTemplates = inject('openTemplates')

// 快速操作按钮 - 黑白灰风格SVG图标
const quickActions = computed(() => [
  { 
    icon: 'text-to-video', 
    label: t('canvas.emptyState.textToVideo'), 
    action: () => createTextToVideo() 
  },
  { 
    icon: 'image-to-video', 
    label: t('canvas.emptyState.imageToVideo'), 
    action: () => createImageToVideo() 
  },
  { 
    icon: 'ref-to-image', 
    label: t('canvas.emptyState.refToImage'), 
    action: () => createRefToImage() 
  }
])

// 创建文生视频工作流
function createTextToVideo() {
  // 如果没有标签，先创建一个
  if (canvasStore.workflowTabs.length === 0) {
    canvasStore.createTab()
  }
  
  const textNode = canvasStore.addNode({
    type: NODE_TYPES.TEXT_INPUT,
    position: { x: 100, y: 200 },
    data: { text: '' }
  })
  
  canvasStore.addNode({
    type: NODE_TYPES.TEXT_TO_VIDEO,
    position: { x: 400, y: 200 },
    data: {}
  })
  
  canvasStore.addEdge({
    source: textNode.id,
    target: canvasStore.nodes[1].id
  })
}

// 创建图生视频工作流
function createImageToVideo() {
  // 如果没有标签，先创建一个
  if (canvasStore.workflowTabs.length === 0) {
    canvasStore.createTab()
  }
  
  const imageNode = canvasStore.addNode({
    type: NODE_TYPES.IMAGE_INPUT,
    position: { x: 100, y: 200 },
    data: { images: [] }
  })
  
  canvasStore.addNode({
    type: NODE_TYPES.IMAGE_TO_VIDEO,
    position: { x: 400, y: 200 },
    data: {}
  })
  
  canvasStore.addEdge({
    source: imageNode.id,
    target: canvasStore.nodes[1].id
  })
}

// 创建参考图生图工作流
function createRefToImage() {
  // 如果没有标签，先创建一个
  if (canvasStore.workflowTabs.length === 0) {
    canvasStore.createTab()
  }
  
  const imageNode = canvasStore.addNode({
    type: NODE_TYPES.IMAGE_INPUT,
    position: { x: 100, y: 200 },
    data: { images: [] }
  })
  
  canvasStore.addNode({
    type: NODE_TYPES.IMAGE_TO_IMAGE,
    position: { x: 400, y: 200 },
    data: {}
  })
  
  canvasStore.addEdge({
    source: imageNode.id,
    target: canvasStore.nodes[1].id
  })
}

// 打开模板面板
function handleOpenTemplates() {
  if (openTemplates) {
    openTemplates()
  }
}

// 跳转到我的工作流页面
function goToMyWorkflows() {
  router.push('/workflows')
}

// 双击创建提示
function handleDoubleClickHint() {
  // 如果没有标签，先创建一个
  if (canvasStore.workflowTabs.length === 0) {
    canvasStore.createTab()
  }
  
  canvasStore.openNodeSelector(
    { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    'canvas'
  )
}
</script>

<template>
  <div class="canvas-empty-state">
    <!-- 双击提示 -->
    <div class="canvas-empty-icon">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2"/>
        <path d="M19 16L32 24L19 32V16Z" fill="currentColor"/>
      </svg>
    </div>
    <div class="canvas-empty-title">
      <strong>{{ t('canvas.emptyState.doubleClick') }}</strong> {{ t('canvas.emptyState.hint') }}
    </div>
    
    <!-- 快捷操作按钮 -->
    <div class="canvas-quick-actions">
      <button 
        v-for="action in quickActions" 
        :key="action.label"
        class="canvas-quick-btn"
        @click="action.action"
      >
        <span class="icon-svg">
          <!-- 文字生视频图标 -->
          <svg v-if="action.icon === 'text-to-video'" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M6 8H12M6 11H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M18 7L22 9.5V14.5L18 17V7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
          <!-- 图片转视频图标 -->
          <svg v-else-if="action.icon === 'image-to-video'" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="6" cy="8" r="1.5" stroke="currentColor" stroke-width="1"/>
            <path d="M2 12L5 9L8 11L11 8L14 11" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
            <path d="M16 8L20 10.5V15.5L16 18V8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
          <!-- 参考图生图图标 -->
          <svg v-else-if="action.icon === 'ref-to-image'" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="3" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="5" cy="6" r="1" fill="currentColor"/>
            <path d="M2 10L4 8L6 9.5L9 7L11 9" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
            <path d="M12 9H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M13.5 7.5L15 9L13.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="16" y="5" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <path d="M17 17H7C4.79086 17 3 18.7909 3 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="19" cy="9" r="1" fill="currentColor"/>
          </svg>
        </span>
        {{ action.label }}
      </button>
    </div>
    
    <!-- 底部按钮组 -->
    <div class="canvas-bottom-actions">
      <!-- 工作流模板按钮 -->
      <button class="canvas-quick-btn" @click="handleOpenTemplates">
        <span class="icon-svg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </span>
        {{ t('canvas.workflow') }}
      </button>
      
      <!-- 我的工作流按钮 -->
      <button class="canvas-quick-btn" @click="goToMyWorkflows">
        <span class="icon-svg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6H21M3 6V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V6M3 6L5 4H19L21 6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M8 10H16M8 14H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </span>
        {{ t('canvas.myWorkflows') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 空白状态容器 */
.canvas-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

/* 顶部图标 - 黑白灰风格 */
.canvas-empty-icon {
  color: rgba(255, 255, 255, 0.8);
  opacity: 0.9;
}

.canvas-empty-icon svg {
  display: block;
}

/* 标题样式 */
.canvas-empty-title {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.canvas-empty-title strong {
  color: #fff;
  font-weight: 600;
}

/* 快捷操作按钮组 */
.canvas-quick-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

/* 底部按钮组 */
.canvas-bottom-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

/* 按钮样式 - 黑白灰风格 */
.canvas-quick-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.canvas-quick-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.canvas-quick-btn:active {
  transform: scale(0.98);
}

/* SVG图标容器 */
.icon-svg {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
}

.canvas-quick-btn:hover .icon-svg {
  color: rgba(255, 255, 255, 0.95);
}

.icon-svg svg {
  display: block;
}

</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   CanvasEmptyState 白昼模式样式适配
   ======================================== */
:root.canvas-theme-light .canvas-empty-state .canvas-empty-icon {
  color: rgba(0, 0, 0, 0.6);
}

:root.canvas-theme-light .canvas-empty-state .canvas-empty-title {
  color: #57534e;
}

:root.canvas-theme-light .canvas-empty-state .canvas-empty-title strong {
  color: #1c1917;
}

:root.canvas-theme-light .canvas-empty-state .canvas-quick-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: #57534e;
}

:root.canvas-theme-light .canvas-empty-state .canvas-quick-btn:hover {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #3b82f6;
}

:root.canvas-theme-light .canvas-empty-state .icon-svg {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .canvas-empty-state .canvas-quick-btn:hover .icon-svg {
  color: #3b82f6;
}
</style>

