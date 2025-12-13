<script setup>
/**
 * CanvasEmptyState.vue - 空白画布引导
 */
import { inject } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { NODE_TYPES } from '@/config/canvas/nodeTypes'

const canvasStore = useCanvasStore()
const openTemplates = inject('openTemplates')

// 快速操作按钮
const quickActions = [
  { icon: '🎬', label: '文字生视频', action: () => createTextToVideo() },
  { icon: '🖼', label: '图片转视频', action: () => createImageToVideo() },
  { icon: '✨', label: '风格生成', action: () => createStyleTransfer() }
]

// 创建文生视频工作流
function createTextToVideo() {
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

// 创建风格转换工作流
function createStyleTransfer() {
  canvasStore.addNode({
    type: NODE_TYPES.TEXT_INPUT,
    position: { x: 100, y: 200 },
    data: { text: '' }
  })
}

// 打开模板面板
function handleOpenTemplates() {
  if (openTemplates) {
    openTemplates()
  }
}

// 双击创建提示
function handleDoubleClickHint() {
  canvasStore.openNodeSelector(
    { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    'canvas'
  )
}
</script>

<template>
  <div class="canvas-empty-state">
    <!-- 双击提示 -->
    <div class="canvas-empty-icon">▶️</div>
    <div class="canvas-empty-title">
      <strong>双击</strong> 画布自由生成，或查看工作流模板
    </div>
    
    <!-- 快捷操作按钮 -->
    <div class="canvas-quick-actions">
      <button 
        v-for="action in quickActions" 
        :key="action.label"
        class="canvas-quick-btn"
        @click="action.action"
      >
        <span class="icon">{{ action.icon }}</span>
        {{ action.label }}
      </button>
    </div>
    
    <!-- 工作流模板按钮 -->
    <button class="canvas-quick-btn" @click="handleOpenTemplates">
      <span class="icon">📋</span>
      工作流
    </button>
  </div>
</template>

<style scoped>
/* 空白状态样式已在 canvas.css 中定义 */
</style>

