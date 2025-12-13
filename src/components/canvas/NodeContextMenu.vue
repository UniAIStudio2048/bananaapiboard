<script setup>
/**
 * NodeContextMenu.vue - 节点右键菜单
 */
import { computed } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { getDownstreamOptions } from '@/config/canvas/nodeTypes'

const props = defineProps({
  position: {
    type: Object,
    default: () => ({ x: 0, y: 0 })
  },
  node: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])
const canvasStore = useCanvasStore()

// 可连接的下游节点类型
const downstreamOptions = computed(() => {
  if (!props.node) return []
  return getDownstreamOptions(props.node.type)
})

// 菜单位置样式
const menuStyle = computed(() => {
  let x = props.position.x
  let y = props.position.y
  
  // 确保不超出屏幕
  const menuWidth = 200
  const menuHeight = 300
  
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

// 从当前节点创建下游节点
function createDownstreamNode(type) {
  if (!props.node) return
  
  // 计算新节点位置（在当前节点右侧）
  const position = {
    x: props.node.position.x + 300,
    y: props.node.position.y
  }
  
  // 创建新节点
  const newNode = canvasStore.addNode({
    type,
    position,
    data: {}
  })
  
  // 添加连线
  canvasStore.addEdge({
    source: props.node.id,
    target: newNode.id
  })
  
  emit('close')
}

// 编辑节点
function editNode() {
  canvasStore.selectNode(props.node.id)
  emit('close')
}

// 复制节点
function copyNode() {
  // TODO: 实现复制功能
  alert('复制功能开发中...')
  emit('close')
}

// 删除节点
function deleteNode() {
  if (props.node) {
    canvasStore.removeNode(props.node.id)
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
  >
    <!-- 引用该节点生成 -->
    <template v-if="downstreamOptions.length > 0">
      <div class="canvas-context-menu-title">引用该节点生成</div>
      <div 
        v-for="option in downstreamOptions.slice(0, 4)" 
        :key="option.type"
        class="canvas-context-menu-item"
        @click="createDownstreamNode(option.type)"
      >
        <span class="icon">{{ option.icon }}</span>
        {{ option.label }}
      </div>
      <div class="canvas-context-menu-divider"></div>
    </template>
    
    <!-- 节点操作 -->
    <div class="canvas-context-menu-item" @click="editNode">
      <span class="icon">✏️</span>
      编辑节点
    </div>
    <div class="canvas-context-menu-item" @click="copyNode">
      <span class="icon">📋</span>
      复制节点
    </div>
    <div class="canvas-context-menu-item" @click="deleteNode">
      <span class="icon">🗑</span>
      删除节点
    </div>
  </div>
</template>

<style scoped>
/* 右键菜单样式已在 canvas.css 中定义 */
</style>

