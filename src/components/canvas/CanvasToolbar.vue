<script setup>
/**
 * CanvasToolbar.vue - 左侧工具栏
 */
import { inject } from 'vue'
import { useRouter } from 'vue-router'
import { useCanvasStore } from '@/stores/canvas'
import { saveWorkflowLocal } from '@/api/canvas/workflow'

const router = useRouter()
const canvasStore = useCanvasStore()
const userInfo = inject('userInfo')
const openTemplates = inject('openTemplates')

// 打开节点选择器
function openNodeSelector() {
  // 在工具栏按钮附近打开
  canvasStore.openNodeSelector(
    { x: 80, y: window.innerHeight / 2 - 100 },
    'toolbar'
  )
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

// 打开历史记录（待实现）
function openHistory() {
  alert('历史记录功能开发中...')
}

// 保存工作流
function saveWorkflow() {
  const data = canvasStore.exportWorkflow()
  if (data.nodes.length === 0) {
    alert('画布为空，无需保存')
    return
  }
  
  const name = prompt('请输入工作流名称', '我的工作流')
  if (!name) return
  
  saveWorkflowLocal({
    id: `local-${Date.now()}`,
    name,
    ...data
  })
  
  alert('工作流已保存到本地')
}

// 计算总积分
function getTotalPoints() {
  if (!userInfo.value) return 0
  return (userInfo.value.package_points || 0) + (userInfo.value.points || 0)
}
</script>

<template>
  <div class="canvas-toolbar">
    <!-- 添加节点按钮（主按钮） -->
    <button 
      class="canvas-toolbar-btn primary" 
      title="添加节点"
      @click="openNodeSelector"
    >
      +
    </button>
    
    <div class="canvas-toolbar-divider"></div>
    
    <!-- 返回首页 -->
    <button 
      class="canvas-toolbar-btn" 
      title="返回首页"
      @click="goHome"
    >
      🏠
    </button>
    
    <!-- 工作流模板 -->
    <button 
      class="canvas-toolbar-btn" 
      title="工作流模板"
      @click="handleOpenTemplates"
    >
      📋
    </button>
    
    <!-- 历史记录 -->
    <button 
      class="canvas-toolbar-btn" 
      title="历史记录"
      @click="openHistory"
    >
      🕐
    </button>
    
    <!-- 保存工作流 -->
    <button 
      class="canvas-toolbar-btn" 
      title="保存工作流"
      @click="saveWorkflow"
    >
      💾
    </button>
    
    <div class="canvas-toolbar-divider"></div>
    
    <!-- 积分显示 -->
    <button 
      class="canvas-toolbar-btn" 
      :title="`积分: ${getTotalPoints()}`"
    >
      <span style="font-size: 12px; font-weight: bold;">P</span>
    </button>
  </div>
</template>

<style scoped>
/* 工具栏样式已在 canvas.css 中定义 */
</style>

