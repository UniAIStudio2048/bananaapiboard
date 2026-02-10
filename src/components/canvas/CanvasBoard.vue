<script setup>
/**
 * CanvasBoard.vue - 无限画布组件
 * 基于 Vue Flow 实现
 * 
 * 交互说明：
 * - 左键拖拽空白区域：平移画布
 * - 右键点击空白区域：打开画布菜单
 * - Ctrl + 左键拖拽：框选节点（部分覆盖即选中）
 * - Delete/Backspace：删除选中的节点
 * - 双击空白区域：打开节点选择器
 * - 鼠标滚轮：以鼠标位置为中心缩放
 * - 空格 + 鼠标拖动：平移画布和视图跟随
 * - Ctrl+Z：撤销
 * - Ctrl+Y：重做
 * - Ctrl+C：复制节点
 * - Ctrl+V：粘贴节点
 * - Ctrl+A：全选节点
 * - Ctrl+G：编组选中的节点
 */
import { ref, computed, watch, onMounted, onUnmounted, inject, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { useCanvasStore } from '@/stores/canvas'
import { uploadCanvasMedia } from '@/api/canvas/workflow'

// 导入自定义节点组件
import { canConnect } from '@/config/canvas/nodeTypes'
import TextNode from './nodes/TextNode.vue'
import ImageNode from './nodes/ImageNode.vue'
import VideoNode from './nodes/VideoNode.vue'
import AudioNode from './nodes/AudioNode.vue'
import ImageGenNode from './nodes/ImageGenNode.vue'
import VideoGenNode from './nodes/VideoGenNode.vue'
import LLMNode from './nodes/LLMNode.vue'
import PreviewNode from './nodes/PreviewNode.vue'
import GroupNode from './nodes/GroupNode.vue'
import CharacterCardNode from './nodes/CharacterCardNode.vue'
import StoryboardNode from './nodes/StoryboardNode.vue'

const emit = defineEmits(['dblclick', 'canvas-contextmenu', 'pane-click'])
const canvasStore = useCanvasStore()

// 注入用户信息
const userInfo = inject('userInfo', null)

// 注入保存对话框函数
const openSaveDialog = inject('openSaveDialog', null)

// 注入快速保存函数（Ctrl+S 使用）
const quickSaveWorkflow = inject('quickSaveWorkflow', null)

// 连线样式设置 - 优先从用户偏好加载，其次从localStorage，最后使用默认值
const edgeStyle = ref(
  userInfo?.value?.preferences?.canvas?.edgeStyle ||
  localStorage.getItem('canvasEdgeStyle') ||
  'smoothstep'
)
const isEdgeHidden = computed(() => edgeStyle.value === 'hidden')

// 监听用户信息变化，更新连线样式
watch(() => userInfo?.value?.preferences?.canvas?.edgeStyle, (newStyle) => {
  if (newStyle && newStyle !== edgeStyle.value) {
    edgeStyle.value = newStyle
    localStorage.setItem('canvasEdgeStyle', newStyle)
    // 更新所有现有连线的样式
    canvasStore.edges.forEach(edge => {
      if (newStyle === 'hidden') {
        edge.type = 'smoothstep'
        edge.style = { opacity: 0 }
      } else {
        edge.type = newStyle
        edge.style = {}
      }
    })
  }
})

// 计算连线配置
const defaultEdgeOptions = computed(() => ({
  type: edgeStyle.value === 'hidden' ? 'smoothstep' : edgeStyle.value,
  animated: false,
  style: isEdgeHidden.value ? { opacity: 0 } : {}
}))

// 监听连线样式变化事件
function handleEdgeStyleChange(event) {
  const newStyle = event.detail?.style || 'smoothstep'
  edgeStyle.value = newStyle
  
  // 更新所有现有连线的样式
  canvasStore.edges.forEach(edge => {
    if (newStyle === 'hidden') {
      edge.type = 'smoothstep'
      edge.style = { opacity: 0 }
    } else {
      edge.type = newStyle
      edge.style = {}
    }
  })
}

// 记录最后的鼠标位置（用于粘贴）
const lastMousePosition = ref({ x: 0, y: 0 })

// 选中的节点ID列表（用于批量删除）
const selectedNodeIds = ref([])

// 画布容器引用
const canvasBoardRef = ref(null)

// 文件拖拽状态
const isFileDragOver = ref(false)
const fileDragCounter = ref(0)

// 空格键平移状态
const isSpacePressed = ref(false)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })

// 对齐辅助线状态
const alignmentGuides = ref({
  vertical: null,   // { x: number, startY: number, endY: number } | null
  horizontal: null  // { y: number, startX: number, endX: number } | null
})
const snapPosition = ref({ x: null, y: null }) // 对齐吸附位置

// 🚀 性能优化：拖拽状态管理
const isDraggingNode = ref(false)  // 是否正在拖拽节点
const alignmentThrottleTimer = ref(null)  // 对齐辅助线计算节流定时器
const lastAlignmentCalcTime = ref(0)  // 上次对齐计算时间
const ALIGNMENT_THROTTLE_MS = 50  // 对齐计算最小间隔（毫秒）

// 🔧 内存优化：追踪所有待执行的定时器，组件卸载时统一清理
const pendingTimeouts = new Set()

// Vue Flow 实例
const { 
  onConnect, 
  onConnectStart,
  onConnectEnd,
  onNodeDragStop,
  onNodeDrag,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onPaneContextMenu,
  onNodeContextMenu,
  removeNodes,
  removeEdges,
  getSelectedNodes,
  getSelectedEdges,
  fitView,
  setViewport,
  getViewport,
  project,
  vueFlowRef,
  addSelectedEdges,
  removeSelectedNodes
} = useVueFlow()

// 缩放配置
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_SPEED = 0.1

/**
 * 自定义滚轮缩放 - 以鼠标位置为中心进行缩放
 */
function handleWheel(event) {
  // 阻止默认滚动行为
  event.preventDefault()
  
  // 获取当前视口
  const viewport = getViewport()
  
  // 计算缩放因子
  const delta = event.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED
  const newZoom = Math.min(Math.max(viewport.zoom * (1 + delta), MIN_ZOOM), MAX_ZOOM)
  
  // 如果缩放没有变化，直接返回
  if (newZoom === viewport.zoom) return
  
  // 获取画布容器的边界
  const container = canvasBoardRef.value
  if (!container) return
  
  const rect = container.getBoundingClientRect()
  
  // 鼠标在画布容器中的位置
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  // 计算鼠标在 flow 坐标系中的位置（缩放前）
  const flowX = (mouseX - viewport.x) / viewport.zoom
  const flowY = (mouseY - viewport.y) / viewport.zoom
  
  // 计算新的视口位置，使得鼠标指向的 flow 坐标点保持不变
  const newX = mouseX - flowX * newZoom
  const newY = mouseY - flowY * newZoom
  
  // 设置新视口
  setViewport({
    x: newX,
    y: newY,
    zoom: newZoom
  })
}

// 自定义节点类型映射
// 统一设计：Image 和 Video 节点同时支持上传和生成
const nodeTypes = {
  'text-input': TextNode,
  'image-input': ImageNode,       // 图片节点（上传+生成一体化）
  'video-input': VideoNode,       // 视频节点（上传+生成一体化）
  'audio-input': AudioNode,       // 音频节点（上传音频）
  'audio': AudioNode,             // 统一音频节点
  'image': ImageNode,             // 统一图片节点
  'video': VideoNode,             // 统一视频节点
  'image-gen': ImageNode,         // 兼容：图片生成映射到 ImageNode
  'video-gen': VideoNode,         // 兼容：视频生成映射到 VideoNode
  'text-to-image': ImageNode,     // 文生图 → 统一的 ImageNode
  'image-to-image': ImageNode,    // 图生图 → 统一的 ImageNode
  'text-to-video': VideoNode,     // 文生视频 → 统一的 VideoNode
  'image-to-video': VideoNode,    // 图生视频 → 统一的 VideoNode
  'llm': LLMNode,                 // 统一 LLM 节点
  'llm-prompt-enhance': LLMNode,
  'llm-image-describe': LLMNode,
  'llm-content-expand': LLMNode,
  'preview-output': PreviewNode,
  'grid-preview': ImageNode,      // 9宫格分镜（使用 ImageNode，可以生成和输出图片）
  'group': GroupNode,             // 编组节点
  'character-card': CharacterCardNode,  // Sora角色卡节点
  'storyboard': StoryboardNode    // 分镜格子节点
}

// 记录连线起始信息
const connectStartInfo = ref(null)
const isVueFlowConnecting = ref(false) // 标记是否正在使用 Vue Flow 原生连线
const connectionSucceeded = ref(false) // 标记连接是否成功
const justOpenedSelectorFromConnection = ref(false) // 标记是否刚刚通过连线打开了选择器（防止 paneClick 立即关闭）

// 处理连线开始
onConnectStart((event) => {
  if (event.nodeId) {
    connectStartInfo.value = {
      nodeId: event.nodeId,
      handleId: event.handleId
    }
    isVueFlowConnecting.value = true
    connectionSucceeded.value = false // 重置连接成功标志
    console.log('[Canvas] 开始连线拖拽', { nodeId: event.nodeId, handleId: event.handleId })
  }
})

// 处理连线结束（拖拽到空白处）
onConnectEnd((event) => {
  console.log('[Canvas] onConnectEnd 触发', {
    target: event.target,
    targetClass: event.target?.className,
    connectStartInfo: connectStartInfo.value,
    connectionSucceeded: connectionSucceeded.value
  })
  
  // 保存起始节点信息（在重置之前）
  const startInfo = connectStartInfo.value
  
  // 如果连接已经成功（onConnect 已被调用），则不打开选择器
  if (connectionSucceeded.value) {
    console.log('[Canvas] 连接已成功，不打开选择器')
    // 重置状态
    isVueFlowConnecting.value = false
    connectStartInfo.value = null
    connectionSucceeded.value = false
    return
  }
  
  // 简化判断：只要有起始节点信息，并且连接没有成功，就打开选择器
  // 不再检查 event.target 是否在 handle 上，因为这个判断可能不准确
  const shouldShowSelector = !!startInfo
  
  console.log('[Canvas] 连线结束判断', { shouldShowSelector, hasStartInfo: !!startInfo })
  
  if (shouldShowSelector && startInfo) {
    // 获取鼠标位置
    const point =
      event instanceof MouseEvent
        ? event
        : (event?.changedTouches?.[0] || event?.targetTouches?.[0] || {})
    const { clientX, clientY } = point
    
    // 注意：clientX/clientY 可能为 0，不能用 truthy 判断
    if (clientX != null && clientY != null) {
      // 计算画布坐标
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY })
      
      // 标记刚刚通过连线打开了选择器（防止 paneClick 立即关闭）
      justOpenedSelectorFromConnection.value = true
      
      // 创建待连接信息（用于渲染虚拟连线）
      const pendingConn = {
        sourceNodeId: startInfo.nodeId,
        sourceHandleId: startInfo.handleId || 'output',
        targetPosition: flowPos
      }
      
      // 打开节点选择器，并传入 sourceNodeId、flowPosition 和待连接信息
      canvasStore.openNodeSelector(
        { x: clientX, y: clientY },
        'node', // 触发类型为 node
        startInfo.nodeId,
        flowPos,
        pendingConn // 传入待连接信息
      )
      console.log('[Canvas] 连线拖拽到空白处，打开节点选择器（保持虚拟连线）', {
        position: { x: clientX, y: clientY },
        sourceNodeId: startInfo.nodeId,
        pendingConn
      })
      
      // 延迟后重置标志（允许后续的点击关闭选择器）
      const timeoutId = setTimeout(() => {
        pendingTimeouts.delete(timeoutId)
        justOpenedSelectorFromConnection.value = false
      }, 200)
      pendingTimeouts.add(timeoutId)
    } else {
      console.log('[Canvas] 无法获取鼠标位置，不打开选择器')
    }
  }
  
  // 重置起始信息
  isVueFlowConnecting.value = false
  connectStartInfo.value = null
  connectionSucceeded.value = false
})

// 处理节点连接
onConnect((connection) => {
  // 标记连接成功（在 onConnectEnd 之前设置）
  connectionSucceeded.value = true
  console.log('[Canvas] onConnect 触发，连接成功', connection)
  
  // 校验连接规则
  const sourceNode = canvasStore.nodes.find(n => n.id === connection.source)
  const targetNode = canvasStore.nodes.find(n => n.id === connection.target)
  
  if (sourceNode && targetNode) {
    // 检查是否允许连接
    if (!canConnect(sourceNode.type, targetNode.type)) {
      console.warn(`[Canvas] 不允许连接: ${sourceNode.type} -> ${targetNode.type}`)
      // 这里可以添加 Toast 提示
      return
    }
    
    canvasStore.addEdge({
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle
    })
  }
})

// 处理节点拖拽结束
onNodeDragStop((event) => {
  const node = event.node
  
  // 🚀 性能优化：标记拖拽结束
  isDraggingNode.value = false
  
  // 保存对齐位置的值（在清除之前）
  const snapX = snapPosition.value.x
  const snapY = snapPosition.value.y
  const currentX = node.position.x
  const currentY = node.position.y
  
  // 清除对齐辅助线
  alignmentGuides.value = { vertical: null, horizontal: null }
  snapPosition.value = { x: null, y: null }
  
  // 清除节流定时器
  if (alignmentThrottleTimer.value) {
    cancelAnimationFrame(alignmentThrottleTimer.value)
    alignmentThrottleTimer.value = null
  }
  
  // 计算最终位置
  const finalPosition = {
    x: snapX !== null ? snapX : currentX,
    y: snapY !== null ? snapY : currentY
  }
  
  // 只使用 store 的更新方法，不直接修改 node.position
  canvasStore.updateNodePosition(node.id, finalPosition)
  
  // 如果拖拽的是编组节点，同步更新组内节点位置
  if (node.type === 'group' && node.data?.nodeIds) {
    syncGroupChildrenPositions(node)
  }
  
  // 如果拖拽的是组内节点，最终调整组大小和偏移量
  if (node.type !== 'group' && node.data?.groupId) {
    adjustGroupSizeForNode(node)
  }
  
  // 🚀 性能优化：通知节点恢复正常渲染质量
  window.dispatchEvent(new CustomEvent('canvas-drag-end'))
})


// 处理节点拖拽中（实时同步）
onNodeDrag((event) => {
  const node = event.node
  
  // 🚀 性能优化：标记拖拽开始，首次拖拽时触发
  if (!isDraggingNode.value) {
    isDraggingNode.value = true
    // 通知节点降低渲染质量
    window.dispatchEvent(new CustomEvent('canvas-drag-start'))
  }
  
  // 如果拖拽的是编组节点，实时同步组内节点位置
  if (node.type === 'group' && node.data?.nodeIds && node.data?.nodeOffsets) {
    syncGroupChildrenPositions(node)
  }
  
  // 如果拖拽的是组内节点，自动调整组的大小
  if (node.type !== 'group' && node.data?.groupId) {
    adjustGroupSizeForNode(node)
  }
  
  // 🚀 性能优化：对齐辅助线计算节流
  // 当节点数量较多时（>10），使用 requestAnimationFrame 节流
  const nodeCount = canvasStore.nodes.length
  const now = performance.now()
  
  if (nodeCount > 10) {
    // 节点多时，使用节流避免每帧都计算
    if (now - lastAlignmentCalcTime.value < ALIGNMENT_THROTTLE_MS) {
      return // 跳过这次计算
    }
    lastAlignmentCalcTime.value = now
  }
  
  // 使用 requestAnimationFrame 确保不阻塞渲染
  if (alignmentThrottleTimer.value) {
    cancelAnimationFrame(alignmentThrottleTimer.value)
  }
  alignmentThrottleTimer.value = requestAnimationFrame(() => {
    calculateAlignmentGuides(node)
  })
})

// 计算对齐辅助线
function calculateAlignmentGuides(draggedNode) {
  const SNAP_THRESHOLD = 10 // 对齐阈值（像素）
  
  // 🚀 性能优化：节点数量过多时禁用对齐辅助线（大画布优化）
  const totalNodes = canvasStore.nodes.length
  if (totalNodes > 30) {
    // 超过30个节点时，完全禁用对齐辅助线以提升性能
    // 这对于70-100+节点的大画布至关重要
    alignmentGuides.value = { vertical: null, horizontal: null }
    snapPosition.value = { x: null, y: null }
    return
  }
  
  // 获取当前节点的位置和尺寸
  const nodeX = draggedNode.position.x
  const nodeY = draggedNode.position.y
  const nodeWidth = draggedNode.dimensions?.width || draggedNode.data?.width || 380
  const nodeHeight = draggedNode.dimensions?.height || draggedNode.data?.height || 320
  
  // 计算节点的关键位置（左、右、中心、顶部、底部、中间）
  const nodeLeft = nodeX
  const nodeRight = nodeX + nodeWidth
  const nodeCenterX = nodeX + nodeWidth / 2
  const nodeTop = nodeY
  const nodeBottom = nodeY + nodeHeight
  const nodeCenterY = nodeY + nodeHeight / 2
  
  // 初始化对齐辅助线
  alignmentGuides.value = { vertical: null, horizontal: null }
  snapPosition.value = { x: null, y: null }
  
  // 🚀 性能优化：使用空间索引思路 - 只检查视口内的节点
  const viewport = canvasStore.viewport
  const viewportLeft = -viewport.x / viewport.zoom - 500
  const viewportTop = -viewport.y / viewport.zoom - 500
  const viewportRight = viewportLeft + window.innerWidth / viewport.zoom + 1000
  const viewportBottom = viewportTop + window.innerHeight / viewport.zoom + 1000
  
  // 查找附近的其他节点（排除当前节点和组内节点，因为组内节点会跟随组移动）
  const nearbyNodes = canvasStore.nodes.filter(n => {
    if (n.id === draggedNode.id) return false
    if (n.type === 'group') return false // 排除编组节点
    if (n.data?.groupId && n.data.groupId !== draggedNode.data?.groupId) return false // 排除其他组的节点
    
    // 🚀 性能优化：排除视口外的节点
    const nX = n.position.x
    const nY = n.position.y
    if (nX > viewportRight || nX < viewportLeft - 500 ||
        nY > viewportBottom || nY < viewportTop - 500) {
      return false
    }
    
    // 粗略检查是否在附近（扩大范围以优化性能）
    const nWidth = n.dimensions?.width || n.data?.width || 380
    const nHeight = n.dimensions?.height || n.data?.height || 320
    const nLeft = n.position.x
    const nRight = n.position.x + nWidth
    const nTop = n.position.y
    const nBottom = n.position.y + nHeight
    
    // 检查是否有重叠或接近（扩展检查范围）
    const margin = Math.max(nodeWidth, nodeHeight, nWidth, nHeight) + SNAP_THRESHOLD * 2
    return !(
      nodeRight < nLeft - margin ||
      nodeLeft > nRight + margin ||
      nodeBottom < nTop - margin ||
      nodeTop > nBottom + margin
    )
  })
  
  let minVerticalDistance = SNAP_THRESHOLD
  let minHorizontalDistance = SNAP_THRESHOLD
  
  // 检查每个附近节点
  nearbyNodes.forEach(otherNode => {
    const otherX = otherNode.position.x
    const otherY = otherNode.position.y
    const otherWidth = otherNode.dimensions?.width || otherNode.data?.width || 380
    const otherHeight = otherNode.dimensions?.height || otherNode.data?.height || 320
    
    const otherLeft = otherX
    const otherRight = otherX + otherWidth
    const otherCenterX = otherX + otherWidth / 2
    const otherTop = otherY
    const otherBottom = otherY + otherHeight
    const otherCenterY = otherY + otherHeight / 2
    
    // 检查垂直对齐（左、右、中心）
    const distances = [
      { type: 'left', distance: Math.abs(nodeLeft - otherLeft), target: otherLeft, nodePos: nodeLeft },
      { type: 'right', distance: Math.abs(nodeRight - otherRight), target: otherRight, nodePos: nodeRight },
      { type: 'center', distance: Math.abs(nodeCenterX - otherCenterX), target: otherCenterX, nodePos: nodeCenterX }
    ]
    
    distances.forEach(({ type, distance, target }) => {
      if (distance < minVerticalDistance) {
        minVerticalDistance = distance
        
        // 计算辅助线的范围
        const minY = Math.min(nodeTop, nodeBottom, otherTop, otherBottom)
        const maxY = Math.max(nodeTop, nodeBottom, otherTop, otherBottom)
        
        alignmentGuides.value.vertical = {
          x: target,
          startY: minY - 50,
          endY: maxY + 50
        }
        
        // 计算吸附位置
        if (type === 'left') {
          snapPosition.value.x = otherLeft
        } else if (type === 'right') {
          snapPosition.value.x = otherRight - nodeWidth
        } else if (type === 'center') {
          snapPosition.value.x = otherCenterX - nodeWidth / 2
        }
      }
    })
    
    // 检查水平对齐（顶部、底部、中间）
    const vDistances = [
      { type: 'top', distance: Math.abs(nodeTop - otherTop), target: otherTop, nodePos: nodeTop },
      { type: 'bottom', distance: Math.abs(nodeBottom - otherBottom), target: otherBottom, nodePos: nodeBottom },
      { type: 'center', distance: Math.abs(nodeCenterY - otherCenterY), target: otherCenterY, nodePos: nodeCenterY }
    ]
    
    vDistances.forEach(({ type, distance, target }) => {
      if (distance < minHorizontalDistance) {
        minHorizontalDistance = distance
        
        // 计算辅助线的范围
        const minX = Math.min(nodeLeft, nodeRight, otherLeft, otherRight)
        const maxX = Math.max(nodeLeft, nodeRight, otherLeft, otherRight)
        
        alignmentGuides.value.horizontal = {
          y: target,
          startX: minX - 50,
          endX: maxX + 50
        }
        
        // 计算吸附位置
        if (type === 'top') {
          snapPosition.value.y = otherTop
        } else if (type === 'bottom') {
          snapPosition.value.y = otherBottom - nodeHeight
        } else if (type === 'center') {
          snapPosition.value.y = otherCenterY - nodeHeight / 2
        }
      }
    })
  })
  
  // 注意：不在这里修改节点位置，只在 onNodeDragStop 中应用对齐位置
  // 这样可以避免干扰 Vue Flow 的拖拽机制
}

// 调整组大小以包含被拖拽的节点（只扩展不缩小）
function adjustGroupSizeForNode(node) {
  const groupId = node.data.groupId
  const groupNode = canvasStore.nodes.find(n => n.id === groupId)
  
  if (!groupNode || groupNode.type !== 'group') return
  
  const nodeIds = groupNode.data.nodeIds || []
  const padding = 20 // 边距
  
  // 获取当前组的位置和尺寸
  const currentGroupX = groupNode.position.x
  const currentGroupY = groupNode.position.y
  const currentGroupWidth = groupNode.data.width || 400
  const currentGroupHeight = groupNode.data.height || 300
  const currentGroupRight = currentGroupX + currentGroupWidth
  const currentGroupBottom = currentGroupY + currentGroupHeight
  
  // 计算组内所有节点需要的边界
  let requiredMinX = Infinity, requiredMinY = Infinity
  let requiredMaxX = -Infinity, requiredMaxY = -Infinity
  
  nodeIds.forEach(nodeId => {
    const childNode = canvasStore.nodes.find(n => n.id === nodeId)
    if (childNode) {
      const x = childNode.position.x
      const y = childNode.position.y
      const w = childNode.dimensions?.width || childNode.data?.width || 380
      const h = childNode.dimensions?.height || childNode.data?.height || 320
      
      requiredMinX = Math.min(requiredMinX, x - padding)
      requiredMinY = Math.min(requiredMinY, y - padding)
      requiredMaxX = Math.max(requiredMaxX, x + w + padding)
      requiredMaxY = Math.max(requiredMaxY, y + h + padding)
    }
  })
  
  // 只在节点超出当前组边界时才扩展（不缩小）
  let needsUpdate = false
  let newX = currentGroupX
  let newY = currentGroupY
  let newWidth = currentGroupWidth
  let newHeight = currentGroupHeight
  
  // 检查左边界
  if (requiredMinX < currentGroupX) {
    newX = requiredMinX
    newWidth = currentGroupRight - requiredMinX
    needsUpdate = true
  }
  
  // 检查上边界
  if (requiredMinY < currentGroupY) {
    newY = requiredMinY
    newHeight = currentGroupBottom - requiredMinY
    needsUpdate = true
  }
  
  // 检查右边界
  if (requiredMaxX > currentGroupRight) {
    newWidth = requiredMaxX - newX
    needsUpdate = true
  }
  
  // 检查下边界
  if (requiredMaxY > currentGroupBottom) {
    newHeight = requiredMaxY - newY
    needsUpdate = true
  }
  
  // 只有需要扩展时才更新
  if (needsUpdate) {
    const newPosition = { x: newX, y: newY }
    
    // 更新组的位置和尺寸
    groupNode.position = newPosition
    canvasStore.updateNodeData(groupId, {
      width: newWidth,
      height: newHeight
    })
    
    // 更新所有节点相对于组的偏移量
    const newOffsets = {}
    nodeIds.forEach(nodeId => {
      const childNode = canvasStore.nodes.find(n => n.id === nodeId)
      if (childNode) {
        newOffsets[nodeId] = {
          x: childNode.position.x - newPosition.x,
          y: childNode.position.y - newPosition.y
        }
      }
    })
    
    canvasStore.updateNodeData(groupId, {
      nodeOffsets: newOffsets
    })
  } else {
    // 即使组大小不变，也需要更新节点的偏移量
    const newOffsets = {}
    nodeIds.forEach(nodeId => {
      const childNode = canvasStore.nodes.find(n => n.id === nodeId)
      if (childNode) {
        newOffsets[nodeId] = {
          x: childNode.position.x - groupNode.position.x,
          y: childNode.position.y - groupNode.position.y
        }
      }
    })
    
    canvasStore.updateNodeData(groupId, {
      nodeOffsets: newOffsets
    })
  }
}

// 同步编组内节点位置
function syncGroupChildrenPositions(groupNode) {
  const nodeIds = groupNode.data.nodeIds || []
  const nodeOffsets = groupNode.data.nodeOffsets || {}
  
  nodeIds.forEach(nodeId => {
    const childNode = canvasStore.nodes.find(n => n.id === nodeId)
    if (childNode && nodeOffsets[nodeId]) {
      const newPosition = {
        x: groupNode.position.x + nodeOffsets[nodeId].x,
        y: groupNode.position.y + nodeOffsets[nodeId].y
      }
      childNode.position = newPosition
    }
  })
}

// 处理选择变化 (通过组件事件)
function handleSelectionChange({ nodes }) {
  // 更新选中的节点ID列表
  const nodeIds = nodes.map(n => n.id)
  selectedNodeIds.value = nodeIds
  canvasStore.setSelectedNodeIds(nodeIds)
  
  if (nodes.length === 1) {
    canvasStore.selectNode(nodes[0].id)
    console.log('[Canvas] 选中节点:', nodes[0].id, nodes[0].type)
  } else if (nodes.length > 1) {
    // 多选时也更新 store（选中第一个作为主选中）
    canvasStore.selectNode(nodes[0].id)
  }
  // 注意：不在 nodes.length === 0 时调用 clearSelection()
  // 因为 VueFlow 可能在切换选择时先触发空选择事件
  // 取消选择的逻辑由 onPaneClick 处理（点击空白区域）
}

// 处理节点点击 - 确保节点选中状态被正确更新
onNodeClick((event) => {
  const node = event.node
  console.log('[Canvas] 节点被点击:', node.id, node.type, 'data:', node.data)
  
  // 立即更新选中状态（确保工具栏能正确显示）
  canvasStore.selectNode(node.id)
  
  // 同时更新多选列表（单选情况）
  selectedNodeIds.value = [node.id]
  canvasStore.setSelectedNodeIds([node.id])
  
  // 关闭右键菜单
  canvasStore.closeAllContextMenus()
})

// 处理连线点击 - 选中连线时取消节点选中
onEdgeClick((event) => {
  const edge = event.edge
  console.log('[Canvas] 连线被点击:', edge.id)
  
  // 清除节点选中状态
  removeSelectedNodes(getSelectedNodes.value)
  selectedNodeIds.value = []
  canvasStore.setSelectedNodeIds([])
  canvasStore.clearSelection()
  
  // 确保连线被选中（VueFlow 会自动处理，但我们显式调用以确保）
  addSelectedEdges([edge])
  
  // 关闭右键菜单
  canvasStore.closeAllContextMenus()
})

// 处理画布点击 - 左键单击空白区域
onPaneClick((event) => {
  // 如果刚刚通过连线打开了选择器，忽略这次点击（防止选择器刚打开就被关闭）
  if (justOpenedSelectorFromConnection.value) {
    console.log('[Canvas] 忽略点击事件，因为刚刚通过连线打开了选择器')
    return
  }
  
  // 如果节点选择器打开，点击空白处关闭并取消连线
  if (canvasStore.isNodeSelectorOpen) {
    canvasStore.closeNodeSelector()
    // 重置连线触发节点ID（防止后续误连接）
    canvasStore.triggerNodeId = null
    console.log('[Canvas] 用户点击空白画布，取消连线选择')
  }
  
  canvasStore.clearSelection()
  canvasStore.closeAllContextMenus()
  
  // 隐藏底部面板
  canvasStore.isBottomPanelVisible = false
  
  // 更新鼠标位置
  lastMousePosition.value = { x: event.clientX, y: event.clientY }
  
  // 通知父组件画布空白区域被点击（用于关闭侧边面板）
  emit('pane-click', event)
})

// 处理画布右键（空白区域右键菜单）
onPaneContextMenu((event) => {
  event.preventDefault()
  
  // 关闭其他菜单
  canvasStore.closeNodeSelector()
  
  // 🔧 确保选中状态是最新的（从 VueFlow 同步）
  const currentSelectedNodes = getSelectedNodes.value
  if (currentSelectedNodes.length > 0) {
    const nodeIds = currentSelectedNodes.map(n => n.id)
    selectedNodeIds.value = nodeIds
    canvasStore.setSelectedNodeIds(nodeIds)
    console.log('[Canvas] 右键菜单 - 同步选中节点:', nodeIds.length, '个')
  }
  
  // 记录鼠标位置
  lastMousePosition.value = { x: event.clientX, y: event.clientY }
  
  // 计算画布坐标（用于粘贴时定位）
  const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
  
  // 打开画布右键菜单
  canvasStore.openCanvasContextMenu({ 
    x: event.clientX, 
    y: event.clientY,
    flowX: flowPosition.x,
    flowY: flowPosition.y
  })
  
  emit('canvas-contextmenu', {
    screenPosition: { x: event.clientX, y: event.clientY },
    flowPosition
  })
})

// 处理节点右键（保留节点右键菜单功能）
onNodeContextMenu((event) => {
  event.event.preventDefault()
  canvasStore.closeCanvasContextMenu()
  canvasStore.openContextMenu(
    { x: event.event.clientX, y: event.event.clientY },
    event.node
  )
})

/**
 * 屏幕坐标转画布坐标
 */
function screenToFlowPosition(screenPos) {
  const container = canvasBoardRef.value
  if (!container) return { x: 0, y: 0 }
  
  const rect = container.getBoundingClientRect()
  const viewport = getViewport()
  
  return {
    x: (screenPos.x - rect.left - viewport.x) / viewport.zoom,
    y: (screenPos.y - rect.top - viewport.y) / viewport.zoom
  }
}

// 键盘事件处理
function handleKeyDown(event) {
  // 确保不是在输入框中
  const target = event.target
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }
  
  const isCtrlOrCmd = event.ctrlKey || event.metaKey
  
  // Escape 键：取消连线拖拽或关闭弹窗
  if (event.key === 'Escape') {
    event.preventDefault()
    
    // 优先级0：如果正在拖拽文件，取消文件拖拽覆盖层
    if (isFileDragOver.value) {
      isFileDragOver.value = false
      fileDragCounter.value = 0
      console.log('[Canvas] 用户按ESC取消文件拖拽')
      return
    }
    
    // 优先级1：如果正在拖拽连线（从+按钮），取消连线拖拽
    if (isDraggingConnection.value) {
      cancelDragConnection()
      console.log('[Canvas] 用户按ESC取消连线拖拽（+按钮）')
      return
    }
    
    // 优先级2：如果正在使用 Vue Flow 原生连线，取消连线
    if (isVueFlowConnecting.value) {
      cancelVueFlowConnection()
      console.log('[Canvas] 用户按ESC取消连线拖拽（原生端口）')
      return
    }
    
    // 优先级3：关闭节点选择器（可能是连线后弹出的选择器）
    if (canvasStore.isNodeSelectorOpen) {
      canvasStore.closeNodeSelector()
      console.log('[Canvas] 用户按ESC关闭节点选择器')
      return
    }
    
    // 优先级4：关闭右键菜单
    if (canvasStore.isContextMenuOpen || canvasStore.isCanvasContextMenuOpen) {
      canvasStore.closeAllContextMenus()
      return
    }
    
    // 优先级5：取消选择
    canvasStore.clearSelection()
    return
  }
  
  // Ctrl+Z 撤销
  if (isCtrlOrCmd && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    canvasStore.undo()
    return
  }
  
  // Ctrl+Y 或 Ctrl+Shift+Z 重做
  if (isCtrlOrCmd && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
    event.preventDefault()
    canvasStore.redo()
    return
  }
  
  // Ctrl+X 重做（恢复上一步）
  if (isCtrlOrCmd && event.key === 'x') {
    event.preventDefault()
    canvasStore.redo()
    return
  }
  
  // Ctrl+S 保存工作流（已有则直接更新，新建则弹出对话框）
  if (isCtrlOrCmd && event.key === 's') {
    event.preventDefault()
    if (quickSaveWorkflow) {
      quickSaveWorkflow()
    } else if (openSaveDialog) {
      openSaveDialog()
    }
    return
  }
  
  // Ctrl+C 复制
  if (isCtrlOrCmd && event.key === 'c') {
    // 检查是否有文本被选中（用户可能在复制文本）
    const selection = window.getSelection()
    const selectedText = selection?.toString() || ''

    // 如果有文本被选中，检查焦点是否在特定区域
    if (selectedText) {
      const activeElement = document.activeElement
      const selectionAnchor = selection?.anchorNode

      // 检查是否在需要保留文本复制功能的区域内
      const isInTextCopyArea =
        // AI 灵感助手面板
        activeElement?.closest?.('.ai-assistant-container') ||
        selectionAnchor?.parentElement?.closest?.('.ai-assistant-container') ||
        activeElement?.closest?.('.ai-message__text') ||
        selectionAnchor?.parentElement?.closest?.('.ai-message__text') ||
        // 节点标签编辑
        activeElement?.closest?.('[contenteditable="true"]') ||
        selectionAnchor?.parentElement?.closest?.('[contenteditable="true"]') ||
        // 其他可能的文本编辑区域
        activeElement?.classList?.contains('editable-text') ||
        selectionAnchor?.parentElement?.classList?.contains('editable-text')

      // 如果在文本复制区域中选中了文本，允许浏览器默认的复制行为
      if (isInTextCopyArea) {
        console.log('[Canvas] 检测到在文本区域复制，允许浏览器默认行为')
        return
      }
    }

    // 否则执行画布节点复制
    event.preventDefault()
    canvasStore.copySelectedNodes()
    return
  }
  
  // Ctrl+V 粘贴
  if (isCtrlOrCmd && event.key === 'v') {
    event.preventDefault()
    // 在画布中心或最后鼠标位置粘贴
    const pastePosition = screenToFlowPosition(lastMousePosition.value)
    canvasStore.pasteNodes(pastePosition)
    return
  }
  
  // Ctrl+A 全选
  if (isCtrlOrCmd && event.key === 'a') {
    event.preventDefault()
    canvasStore.selectAllNodes()
    return
  }
  
  // Ctrl+G 编组
  if (isCtrlOrCmd && event.key === 'g') {
    event.preventDefault()
    groupSelectedNodes()
    return
  }
  
  // 空格键：启用平移模式
  if (event.key === ' ' && !isSpacePressed.value) {
    event.preventDefault()
    isSpacePressed.value = true
    document.body.style.cursor = 'grab'
    console.log('[Canvas] 空格键按下，启用平移模式')
    return
  }
  
  // Delete 或 Backspace 删除选中的节点
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelectedElements()
    return
  }
}

// 键盘释放事件处理
function handleKeyUp(event) {
  // 空格键释放：禁用平移模式
  if (event.key === ' ') {
    event.preventDefault()
    isSpacePressed.value = false
    isPanning.value = false
    document.body.style.cursor = 'default'
    console.log('[Canvas] 空格键释放，禁用平移模式')
  }
}

// 鼠标按下事件（用于空格+拖动平移）
function handleMouseDown(event) {
  // 如果按住空格键，开始平移
  if (isSpacePressed.value && event.button === 0) {
    event.preventDefault()
    isPanning.value = true
    panStart.value = { x: event.clientX, y: event.clientY }
    document.body.style.cursor = 'grabbing'
    console.log('[Canvas] 开始空格键平移')
  }
}

// 鼠标移动事件（用于空格+拖动平移）
function handleMouseMove(event) {
  // 如果正在平移
  if (isPanning.value && isSpacePressed.value) {
    event.preventDefault()
    
    const deltaX = event.clientX - panStart.value.x
    const deltaY = event.clientY - panStart.value.y
    
    const viewport = getViewport()
    setViewport({
      x: viewport.x + deltaX,
      y: viewport.y + deltaY,
      zoom: viewport.zoom
    })
    
    panStart.value = { x: event.clientX, y: event.clientY }
  }
}

// 鼠标释放事件（用于空格+拖动平移）
function handleMouseUp(event) {
  if (isPanning.value) {
    event.preventDefault()
    isPanning.value = false
    document.body.style.cursor = isSpacePressed.value ? 'grab' : 'default'
    console.log('[Canvas] 结束空格键平移')
  }
}

// 删除选中的元素（节点和连线）
// 原则：选中什么删什么，不多删
function deleteSelectedElements() {
  const selectedNodes = getSelectedNodes.value
  const selectedEdges = getSelectedEdges.value
  
  console.log('[Canvas] 删除操作 - 当前选中状态:', {
    selectedNodes: selectedNodes.map(n => n.id),
    selectedEdges: selectedEdges.map(e => e.id)
  })
  
  // 如果只选中了连线（没有选中节点），只删除连线
  if (selectedEdges.length > 0 && selectedNodes.length === 0) {
    const edgeIds = selectedEdges.map(e => e.id)
    removeEdges(edgeIds)
    
    // 同步到 store
    edgeIds.forEach(id => {
      canvasStore.removeEdge(id)
    })
    
    console.log(`[Canvas] 只删除了 ${edgeIds.length} 条连线`)
    return
  }
  
  // 如果只选中了节点（没有选中连线），只删除节点
  if (selectedNodes.length > 0 && selectedEdges.length === 0) {
    const nodeIds = selectedNodes.map(n => n.id)
    removeNodes(nodeIds)
    
    // 同步到 store
    nodeIds.forEach(id => {
      canvasStore.removeNode(id)
    })
    
    console.log(`[Canvas] 只删除了 ${nodeIds.length} 个节点`)
    return
  }
  
  // 如果同时选中了节点和连线，都删除
  if (selectedNodes.length > 0 && selectedEdges.length > 0) {
    // 先删除连线
    const edgeIds = selectedEdges.map(e => e.id)
    removeEdges(edgeIds)
    edgeIds.forEach(id => {
      canvasStore.removeEdge(id)
    })
    
    // 再删除节点
    const nodeIds = selectedNodes.map(n => n.id)
    removeNodes(nodeIds)
    nodeIds.forEach(id => {
      canvasStore.removeNode(id)
    })
    
    console.log(`[Canvas] 删除了 ${nodeIds.length} 个节点和 ${edgeIds.length} 条连线`)
  }
}

// 编组选中的节点
function groupSelectedNodes() {
  const selectedNodes = getSelectedNodes.value
  
  if (selectedNodes.length < 2) {
    console.log('[Canvas] 需要至少选择 2 个节点才能编组')
    return
  }
  
  const nodeIds = selectedNodes.map(n => n.id)
  
  // 计算选中节点的边界（最小外接矩形）
  // 使用更大的默认尺寸来确保包含节点
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity
  
  selectedNodes.forEach(node => {
    const x = node.position.x
    const y = node.position.y
    // 使用更准确的节点尺寸（根据实际节点类型）
    const width = node.dimensions?.width || node.data?.width || 380
    const height = node.dimensions?.height || node.data?.height || 320
    
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  })
  
  // 添加更大的边距确保完全包围
  const padding = 60
  minX -= padding
  minY -= padding + 30 // 标题栏额外空间
  maxX += padding
  maxY += padding
  
  const groupWidth = maxX - minX
  const groupHeight = maxY - minY
  
  // 在 store 中创建编组
  const group = canvasStore.createGroup(nodeIds)
  
  if (group) {
    // 计算并保存组内节点相对于组的位置偏移
    const nodeOffsets = {}
    nodeIds.forEach(nodeId => {
      const node = canvasStore.nodes.find(n => n.id === nodeId)
      if (node) {
        nodeOffsets[nodeId] = {
          x: node.position.x - minX,
          y: node.position.y - minY
        }
        // 保持节点可拖拽（在组内自由移动）
        node.draggable = true
        // 设置节点的 zIndex 为正数，确保在编组框之上
        node.zIndex = 1
        node.style = { ...node.style, zIndex: 1 }
      }
    })
    
    // 创建可视化的编组节点（背景框）
    const groupNode = {
      id: group.id,
      type: 'group',
      position: { x: minX, y: minY },
      zIndex: -1000, // 放在最底层，作为背景
      style: { zIndex: -1000 }, // 通过 style 也设置 zIndex
      draggable: true, // 组可以拖动
      selectable: true, // 组可以选中
      data: {
        groupName: group.name,
        groupColor: group.color,
        borderColor: group.borderColor,
        nodeIds: nodeIds,
        width: groupWidth,
        height: groupHeight,
        nodeOffsets: nodeOffsets
      }
    }
    
    // 添加编组节点（跳过历史保存，因为 createGroup 已经保存了）
    canvasStore.addNode(groupNode, true)
    
    // 选中新创建的编组节点
    canvasStore.selectNode(group.id)
    
    console.log(`[Canvas] 已创建编组 "${group.name}"，包含 ${nodeIds.length} 个节点，尺寸: ${groupWidth}x${groupHeight}`)
  }
}

// 同步视口变化到 store
// 标记是否正在从外部更新视口（用于避免循环更新）
let isExternalViewportUpdate = false

function handleViewportChange(viewport) {
  // 如果是外部更新触发的，跳过同步到 store（避免循环）
  if (isExternalViewportUpdate) return
  canvasStore.updateViewport(viewport)
}

// 监听 store 的 viewport 变化，同步到 VueFlow（支持滑块拖动等外部控制）
watch(
  () => canvasStore.viewport,
  (newViewport) => {
    if (!setViewport || !getViewport) return
    
    // 获取当前 VueFlow 的视口
    const currentViewport = getViewport()
    
    // 检查是否需要更新（避免不必要的更新和循环）
    const needsUpdate = 
      Math.abs(currentViewport.x - newViewport.x) > 0.01 ||
      Math.abs(currentViewport.y - newViewport.y) > 0.01 ||
      Math.abs(currentViewport.zoom - newViewport.zoom) > 0.001
    
    if (needsUpdate) {
      // 标记正在从外部更新，防止 handleViewportChange 触发循环
      isExternalViewportUpdate = true
      setViewport({
        x: newViewport.x,
        y: newViewport.y,
        zoom: newViewport.zoom
      })
      // 延迟重置标志，确保 viewport-change 事件已被处理
      const viewportTimeoutId = setTimeout(() => {
        pendingTimeouts.delete(viewportTimeoutId)
        isExternalViewportUpdate = false
      }, 50)
      pendingTimeouts.add(viewportTimeoutId)
    }
  },
  { deep: true }
)

// 处理边的变化（包括删除）
function handleEdgesChange(changes) {
  changes.forEach(change => {
    if (change.type === 'remove') {
      const { id, target, targetHandle } = change
      const targetNode = canvasStore.nodes.find(n => n.id === target)

      // 非 storyboard 格子级连线：清除目标节点的继承数据
      // （Storyboard 格子级图片清理已统一在 canvasStore.removeEdge 中处理）
      if (targetNode && !(
        targetNode.type === 'storyboard' &&
        typeof targetHandle === 'string' &&
        targetHandle.startsWith('input-')
      )) {
        canvasStore.updateNodeData(target, {
          inheritedFrom: null,
          inheritedData: null,
          hasUpstream: false
        })
      }

      // 从 store 中移除边（内部会处理 storyboard 格子图片清理）
      canvasStore.removeEdge(id)
    }
  })
}

// 处理双击
function handleDoubleClick(event) {
  emit('dblclick', event)
}

// 处理原生右键事件（作为备用）
function handleNativeContextMenu(event) {
  // 检查是否点击在节点上（节点有自己的右键菜单）
  const target = event.target
  const isOnNode = target.closest('.vue-flow__node')
  
  if (isOnNode) {
    // 节点上的右键由 onNodeContextMenu 处理
    return
  }
  
  // 阻止默认右键菜单
  event.preventDefault()
  
  // 关闭其他菜单
  canvasStore.closeNodeSelector()
  
  // 🔧 确保选中状态是最新的（从 VueFlow 同步）
  const currentSelectedNodes = getSelectedNodes.value
  if (currentSelectedNodes.length > 0) {
    const nodeIds = currentSelectedNodes.map(n => n.id)
    selectedNodeIds.value = nodeIds
    canvasStore.setSelectedNodeIds(nodeIds)
  }
  
  // 记录鼠标位置
  lastMousePosition.value = { x: event.clientX, y: event.clientY }
  
  // 计算画布坐标
  const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY })
  
  // 打开画布右键菜单
  canvasStore.openCanvasContextMenu({ 
    x: event.clientX, 
    y: event.clientY,
    flowX: flowPosition.x,
    flowY: flowPosition.y
  })
}

// ========== 从 + 按钮拖拽连线（使用 store 状态） ==========
// 拖拽连线的起始位置（画布坐标）
const dragLineStartPosition = ref({ x: 0, y: 0 })

// 监听 store 中的拖拽状态变化
watch(
  () => canvasStore.isDraggingConnection,
  (isDragging) => {
    // 统一管理全局监听器：开始拖拽时挂载，结束/取消时卸载
    // 使用 capture 兜底：避免 mouseup 被其他组件 stopPropagation 后漏掉
    const listenerOptions = { capture: true }
    
    if (isDragging) {
      // 优先使用节点组件传入的位置（更准确，因为节点知道自己的真实尺寸）
      // 只有当位置无效时才使用 getHandlePosition 重新计算
      const storePos = canvasStore.dragConnectionPosition
      if (storePos && storePos.x !== 0 && storePos.y !== 0) {
        dragLineStartPosition.value = { ...storePos }
        console.log('[CanvasBoard] 使用节点传入的起始位置:', storePos)
      } else {
        // 回退：使用 getHandlePosition 计算
        const sourceInfo = canvasStore.dragConnectionSource
        if (sourceInfo?.nodeId) {
          const handlePos = getHandlePosition(sourceInfo.nodeId, 'output')
          dragLineStartPosition.value = handlePos
          console.log('[CanvasBoard] 使用计算的起始位置:', handlePos)
        }
      }
      window.addEventListener('mousemove', handleGlobalDragConnectionMove, listenerOptions)
      window.addEventListener('mouseup', handleGlobalDragConnectionEnd, listenerOptions)
      return
    }
    
    // 拖拽结束（包括成功连接/取消）时，确保清理监听器
    window.removeEventListener('mousemove', handleGlobalDragConnectionMove, listenerOptions)
    window.removeEventListener('mouseup', handleGlobalDragConnectionEnd, listenerOptions)
  },
  // 关键：同步 flush，避免"开始拖拽后立刻松手"时 listener 尚未挂载导致 onMouseUp 漏触发
  { flush: 'sync' }
)

// 全局鼠标移动事件处理
function handleGlobalDragConnectionMove(event) {
  if (!canvasStore.isDraggingConnection) return
  
  const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
  canvasStore.updateDragConnectionPosition(flowPos)
}

// 全局鼠标释放事件处理
function handleGlobalDragConnectionEnd(event) {
  // 移除事件监听（与 addEventListener 的 options 必须一致）
  const listenerOptions = { capture: true }
  window.removeEventListener('mousemove', handleGlobalDragConnectionMove, listenerOptions)
  window.removeEventListener('mouseup', handleGlobalDragConnectionEnd, listenerOptions)
  
  if (!canvasStore.isDraggingConnection) return
  
  // 检测是否释放在某个节点上
  const targetElement = document.elementFromPoint(event.clientX, event.clientY)
  const targetNode = findTargetNode(targetElement)
  
  // 检测是否释放在 Storyboard 的某个格子级 cell-handle 上
  // cell-handle 的 data-handleid 格式为 "input-{index}"
  let targetHandleId = null
  if (targetNode?.type === 'storyboard' && targetElement) {
    const handleEl = targetElement.closest('.vue-flow__handle[data-handleid^="input-"]')
      || targetElement.closest('.cell-handle')
    if (handleEl) {
      const hid = handleEl.getAttribute('data-handleid') || handleEl.id
      if (typeof hid === 'string' && hid.startsWith('input-')) {
        targetHandleId = hid
      }
    }
    // 回退：通过鼠标位置检测悬停的格子索引
    if (!targetHandleId) {
      const nodeEl = targetElement.closest('.vue-flow__node')
      if (nodeEl) {
        const gridItems = nodeEl.querySelectorAll('.grid-item')
        gridItems.forEach((el, idx) => {
          const rect = el.getBoundingClientRect()
          if (
            event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom
          ) {
            targetHandleId = `input-${idx}`
          }
        })
      }
    }
  }
  
  // 计算结束位置
  const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
  const screenPos = { x: event.clientX, y: event.clientY }
  
  // 调用 store 的 endDragConnection（传入格子级 targetHandle）
  const connected = canvasStore.endDragConnection(targetNode, flowPos, screenPos, targetHandleId)
  
  if (!connected) {
    // 如果没有连接到节点，标记刚刚打开了选择器
    justOpenedSelectorFromConnection.value = true
    const dragEndTimeoutId = setTimeout(() => {
      pendingTimeouts.delete(dragEndTimeoutId)
      justOpenedSelectorFromConnection.value = false
    }, 200)
    pendingTimeouts.add(dragEndTimeoutId)
  }
}

// 获取节点端口的画布坐标
// 注意：+号按钮位于节点卡片边缘外 52px，按钮宽度 36px，中心在边缘外 34px (52 - 18)
function getHandlePosition(nodeId, handleType) {
  const node = canvasStore.nodes.find(n => n.id === nodeId)
  if (!node) return { x: 0, y: 0 }
  
  // 根据节点类型获取默认尺寸
  const defaultSizes = {
    'text-input': { width: 400, height: 280 },
    'text': { width: 400, height: 280 },
    'image-input': { width: 380, height: 320 },
    'image': { width: 380, height: 320 },
    'image-gen': { width: 380, height: 320 },
    'video-input': { width: 420, height: 280 },
    'video': { width: 420, height: 280 },
    'video-gen': { width: 420, height: 280 }
  }
  
  const defaults = defaultSizes[node.type] || { width: 380, height: 280 }
  const nodeWidth = node.data?.width || defaults.width
  const nodeHeight = node.data?.height || defaults.height
  const labelOffset = 28 // 节点标签高度
  const handleOffset = 34 // +号按钮中心相对于节点卡片边缘的偏移量
  
  if (handleType === 'output') {
    // 输出端口在节点右侧+号按钮中心位置
    return {
      x: node.position.x + nodeWidth + handleOffset,
      y: node.position.y + labelOffset + nodeHeight / 2
    }
  } else {
    // 输入端口在节点左侧+号按钮中心位置
    return {
      x: node.position.x - handleOffset,
      y: node.position.y + labelOffset + nodeHeight / 2
    }
  }
}

/**
 * 取消 Vue Flow 原生连线拖拽
 */
function cancelVueFlowConnection() {
  // 重置连线状态
  isVueFlowConnecting.value = false
  connectStartInfo.value = null
  
  // 关闭可能已打开的节点选择器
  canvasStore.closeNodeSelector()
  
  console.log('[Canvas] 已取消 Vue Flow 连线')
}

// 获取拖拽连线的路径（贝塞尔曲线）- 使用 store 状态
const getDragLinePath = computed(() => {
  if (!canvasStore.isDraggingConnection) return ''
  
  const startPos = dragLineStartPosition.value
  const endPos = canvasStore.dragConnectionPosition
  const viewport = canvasStore.viewport
  
  // 将画布坐标转换为屏幕坐标用于显示
  const screenX1 = startPos.x * viewport.zoom + viewport.x
  const screenY1 = startPos.y * viewport.zoom + viewport.y
  const screenX2 = endPos.x * viewport.zoom + viewport.x
  const screenY2 = endPos.y * viewport.zoom + viewport.y
  
  // 计算控制点（水平方向的贝塞尔曲线）
  const dx = Math.abs(screenX2 - screenX1)
  const controlOffset = Math.max(50, dx * 0.5)
  
  return `M ${screenX1} ${screenY1} C ${screenX1 + controlOffset} ${screenY1}, ${screenX2 - controlOffset} ${screenY2}, ${screenX2} ${screenY2}`
})

// 对齐辅助线的屏幕坐标（转换为屏幕坐标用于SVG渲染）
const alignmentGuidesScreen = computed(() => {
  if (!alignmentGuides.value.vertical && !alignmentGuides.value.horizontal) {
    return { vertical: null, horizontal: null }
  }
  
  const viewport = canvasStore.viewport
  
  const result = {
    vertical: null,
    horizontal: null
  }
  
  // 转换垂直辅助线
  if (alignmentGuides.value.vertical) {
    result.vertical = {
      x: alignmentGuides.value.vertical.x * viewport.zoom + viewport.x,
      startY: alignmentGuides.value.vertical.startY * viewport.zoom + viewport.y,
      endY: alignmentGuides.value.vertical.endY * viewport.zoom + viewport.y
    }
  }
  
  // 转换水平辅助线
  if (alignmentGuides.value.horizontal) {
    result.horizontal = {
      y: alignmentGuides.value.horizontal.y * viewport.zoom + viewport.y,
      startX: alignmentGuides.value.horizontal.startX * viewport.zoom + viewport.x,
      endX: alignmentGuides.value.horizontal.endX * viewport.zoom + viewport.x
    }
  }
  
  return result
})

// 查找目标节点
function findTargetNode(element) {
  if (!element) return null
  
  // 向上查找节点元素
  let current = element
  while (current && current !== document.body) {
    // 检查是否是 Vue Flow 节点
    if (current.classList?.contains('vue-flow__node')) {
      const nodeId = current.dataset?.id
      if (nodeId) {
        return canvasStore.nodes.find(n => n.id === nodeId)
      }
    }
    // 检查是否是自定义节点
    if (current.classList?.contains('canvas-node') || 
        current.classList?.contains('text-node') ||
        current.classList?.contains('image-node') ||
        current.classList?.contains('video-node') ||
        current.classList?.contains('storyboard-node')) {
      // 从父元素找到 vue-flow__node
      const vueFlowNode = current.closest('.vue-flow__node')
      if (vueFlowNode) {
        const nodeId = vueFlowNode.dataset?.id
        if (nodeId) {
          return canvasStore.nodes.find(n => n.id === nodeId)
        }
      }
    }
    current = current.parentElement
  }
  return null
}

// ========== 待连接虚拟连线渲染 ==========

/**
 * 获取待连接虚拟连线的路径（贝塞尔曲线）
 */
function getPendingConnectionPath() {
  const pending = canvasStore.pendingConnection
  if (!pending) return ''
  
  // 使用 getHandlePosition 获取源节点输出端口的精确位置
  const sourcePos = getHandlePosition(pending.sourceNodeId, 'output')
  if (sourcePos.x === 0 && sourcePos.y === 0) return ''
  
  const sourceX = sourcePos.x
  const sourceY = sourcePos.y
  
  // 目标位置
  const targetX = pending.targetPosition.x
  const targetY = pending.targetPosition.y
  
  // 获取视口信息
  const viewport = canvasStore.viewport
  
  // 将画布坐标转换为屏幕坐标
  const screenX1 = sourceX * viewport.zoom + viewport.x
  const screenY1 = sourceY * viewport.zoom + viewport.y
  const screenX2 = targetX * viewport.zoom + viewport.x
  const screenY2 = targetY * viewport.zoom + viewport.y
  
  // 计算控制点（水平方向的贝塞尔曲线）
  const dx = Math.abs(screenX2 - screenX1)
  const controlOffset = Math.max(50, dx * 0.5)
  
  return `M ${screenX1} ${screenY1} C ${screenX1 + controlOffset} ${screenY1}, ${screenX2 - controlOffset} ${screenY2}, ${screenX2} ${screenY2}`
}

// 是否显示待连接的虚拟连线
const showPendingConnection = computed(() => {
  return canvasStore.pendingConnection !== null && canvasStore.isNodeSelectorOpen
})

// ========== 文件拖拽到画布 ==========

/**
 * 读取文件为 Base64
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 获取文件类型分类
 */
function getFileCategory(file) {
  const type = file.type
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return null
}

/**
 * 处理文件拖入画布 - dragenter
 */
function handleFileDragEnter(event) {
  event.preventDefault()
  event.stopPropagation()
  
  // 检查是否拖拽的是文件
  if (event.dataTransfer?.types?.includes('Files')) {
    fileDragCounter.value++
    isFileDragOver.value = true
  }
}

/**
 * 处理文件拖拽悬停 - dragover
 */
function handleFileDragOver(event) {
  event.preventDefault()
  event.stopPropagation()
  
  // 支持文件拖拽和工作流拖拽
  if (event.dataTransfer?.types?.includes('Files') || 
      event.dataTransfer?.types?.includes('application/json')) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

/**
 * 处理文件拖出画布 - dragleave
 */
function handleFileDragLeave(event) {
  event.preventDefault()
  event.stopPropagation()
  
  fileDragCounter.value--
  if (fileDragCounter.value === 0) {
    isFileDragOver.value = false
  }
}

/**
 * 处理文件放置 - drop
 */
async function handleFileDrop(event) {
  event.preventDefault()
  event.stopPropagation()
  
  isFileDragOver.value = false
  fileDragCounter.value = 0
  
  // 获取放置位置的画布坐标
  const container = canvasBoardRef.value
  if (!container) return
  
  const rect = container.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  // 获取视口信息并转换为画布坐标
  const viewport = getViewport()
  const canvasX = (mouseX - viewport.x) / viewport.zoom
  const canvasY = (mouseY - viewport.y) / viewport.zoom
  
  // 检查是否是工作流/模板/资产拖拽
  const jsonData = event.dataTransfer?.getData('application/json')
  if (jsonData) {
    try {
      const data = JSON.parse(jsonData)
      
      // 处理我的工作流拖拽
      if (data.type === 'workflow-merge' && data.workflowId) {
        console.log('[CanvasBoard] 接收到工作流拖放，加载并合并:', data.workflowName)
        
        // 异步加载工作流数据
        import('@/api/canvas/workflow').then(async ({ loadWorkflow }) => {
          try {
            const result = await loadWorkflow(data.workflowId)
            if (result.workflow) {
              canvasStore.mergeWorkflowToCanvas(result.workflow, { x: canvasX, y: canvasY })
            }
          } catch (error) {
            console.error('[CanvasBoard] 加载工作流失败:', error)
            alert('加载工作流失败：' + error.message)
          }
        })
        return
      }
      
      // 处理模板拖拽（模板数据已经包含在 dataTransfer 中）
      if (data.type === 'template-merge' && data.template) {
        console.log('[CanvasBoard] 接收到模板拖放，合并:', data.template.name)
        canvasStore.mergeWorkflowToCanvas(data.template, { x: canvasX, y: canvasY })
        return
      }
      
      // 处理资产拖拽（来自 AssetPanel）
      if (data.type === 'asset-insert' && data.asset) {
        console.log('[CanvasBoard] 接收到资产拖放:', data.asset.name, data.asset.type)
        
        const asset = data.asset
        const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        // 根据资产类型创建相应的节点
        switch (asset.type) {
          case 'text':
            canvasStore.addNode({
              id: nodeId,
              type: 'text-input',
              position: { x: canvasX, y: canvasY },
              data: {
                title: asset.name || '文本资产',
                text: asset.content || '',
                fromAsset: true,
                assetId: asset.id
              }
            })
            break
          case 'image':
            canvasStore.addNode({
              id: nodeId,
              type: 'image-input',
              position: { x: canvasX, y: canvasY },
              data: {
                title: asset.name || '图片资产',
                label: asset.name || '图片',
                sourceImages: [asset.url],
                nodeRole: 'source',
                fromAsset: true,
                assetId: asset.id
              }
            })
            break
          case 'video':
            canvasStore.addNode({
              id: nodeId,
              type: 'video',
              position: { x: canvasX, y: canvasY },
              data: {
                title: asset.name || '视频资产',
                label: asset.name || '视频',
                status: 'success',
                output: {
                  type: 'video',
                  url: asset.url
                },
                fromAsset: true,
                assetId: asset.id
              }
            })
            break
          case 'audio':
            canvasStore.addNode({
              id: nodeId,
              type: 'audio-input',
              position: { x: canvasX, y: canvasY },
              data: {
                title: asset.name || '音频资产',
                label: asset.name || '音频',
                audioUrl: asset.url,
                status: 'success',
                output: {
                  type: 'audio',
                  url: asset.url
                },
                fromAsset: true,
                assetId: asset.id
              }
            })
            break
          case 'sora-character':
            // Sora 角色卡节点 - 显示角色名称和 ID
            const characterName = asset.name || '角色'
            const characterUsername = asset.metadata?.username || ''
            canvasStore.addNode({
              id: nodeId,
              type: 'video',
              position: { x: canvasX, y: canvasY },
              data: {
                title: characterName,
                label: `${characterName}\n@${characterUsername}`,
                status: 'success',
                output: {
                  type: 'video',
                  url: asset.url
                },
                fromAsset: true,
                assetId: asset.id,
                isSoraCharacter: true,
                characterName: characterName,
                characterUsername: characterUsername
              }
            })
            break
        }
        return
      }
    } catch (e) {
      console.error('[CanvasBoard] 解析拖放数据失败:', e)
    }
  }
  
  // 处理文件拖放
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  // 处理每个文件
  let offsetX = 0
  let offsetY = 0
  
  // 收集需要上传的文件信息
  const uploadTasks = []
  
  for (const file of files) {
    const category = getFileCategory(file)
    if (!category) continue
    
    try {
      const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      // 🚀 使用 blob URL 实现秒加载预览
      const blobUrl = URL.createObjectURL(file)
      
      // 根据文件类型创建不同的节点（使用 blob URL 立即显示）
      if (category === 'image') {
        canvasStore.addNode({
          id: nodeId,
          type: 'image-input',
          position: { x: canvasX + offsetX, y: canvasY + offsetY },
          data: {
            title: file.name || '图片',
            nodeRole: 'source',
            sourceImages: [blobUrl],
            isUploading: true // 标记正在上传
          }
        })
        // 添加到上传队列
        uploadTasks.push({ file, type: 'image', nodeId, blobUrl, field: 'sourceImages' })
      } else if (category === 'video') {
        canvasStore.addNode({
          id: nodeId,
          type: 'video',
          position: { x: canvasX + offsetX, y: canvasY + offsetY },
          data: {
            title: file.name || '视频',
            status: 'success',
            output: {
              type: 'video',
              url: blobUrl
            },
            isUploading: true
          }
        })
        uploadTasks.push({ file, type: 'video', nodeId, blobUrl, field: 'output.url' })
      } else if (category === 'audio') {
        const fileName = file.name || '音频'
        const displayName = fileName.replace(/\.[^/.]+$/, '')
        
        canvasStore.addNode({
          id: nodeId,
          type: 'audio-input',
          position: { x: canvasX + offsetX, y: canvasY + offsetY },
          data: {
            title: displayName,
            label: displayName,
            audioUrl: blobUrl,
            status: 'success',
            output: {
              type: 'audio',
              url: blobUrl
            },
            isUploading: true
          }
        })
        uploadTasks.push({ file, type: 'audio', nodeId, blobUrl, field: 'audioUrl' })
        console.log('[CanvasBoard] 音频文件已添加到画布:', displayName)
      }
      
      // 多文件时错开位置
      offsetX += 50
      offsetY += 50
      
    } catch (error) {
      console.error('[CanvasBoard] 文件创建节点失败:', error)
    }
  }
  
  // 🔄 后台异步上传所有文件到云存储
  if (uploadTasks.length > 0) {
    uploadFilesToCloud(uploadTasks)
  }
}

/**
 * 后台异步上传文件到云存储，上传完成后更新节点 URL
 */
async function uploadFilesToCloud(tasks) {
  for (const task of tasks) {
    const { file, type, nodeId, blobUrl, field } = task
    
    try {
      console.log(`[CanvasBoard] 开始上传${type}到云存储:`, file.name, '大小:', Math.round(file.size / 1024), 'KB')
      
      const result = await uploadCanvasMedia(file, type)
      const cloudUrl = result.url
      
      console.log(`[CanvasBoard] ${type}上传成功，云URL:`, cloudUrl)
      
      // 更新节点数据，将 blob URL 替换为云存储 URL
      const node = canvasStore.nodes.find(n => n.id === nodeId)
      if (node) {
        if (type === 'image') {
          // 图片节点：更新 sourceImages
          const newSourceImages = node.data.sourceImages.map(url => url === blobUrl ? cloudUrl : url)
          canvasStore.updateNodeData(nodeId, { 
            sourceImages: newSourceImages,
            isUploading: false
          })
        } else if (type === 'video') {
          // 视频节点：更新 output.url
          canvasStore.updateNodeData(nodeId, { 
            output: { ...node.data.output, url: cloudUrl },
            isUploading: false
          })
        } else if (type === 'audio') {
          // 音频节点：更新 audioUrl 和 output.url
          canvasStore.updateNodeData(nodeId, { 
            audioUrl: cloudUrl,
            output: { ...node.data.output, url: cloudUrl },
            isUploading: false
          })
        }
        
        console.log(`[CanvasBoard] 节点 ${nodeId} 已更新为云存储URL`)
      }
      
      // 释放 blob URL 内存
      try {
        URL.revokeObjectURL(blobUrl)
      } catch (e) {
        // 忽略
      }
      
    } catch (error) {
      console.error(`[CanvasBoard] ${type}上传失败:`, error.message)
      // 上传失败时保留 blob URL，让用户可以继续使用
      // 但标记上传失败，保存工作流时会提示用户
      const node = canvasStore.nodes.find(n => n.id === nodeId)
      if (node) {
        canvasStore.updateNodeData(nodeId, { 
          isUploading: false,
          uploadFailed: true,
          uploadError: error.message
        })
      }
    }
  }
}

// 暴露给父组件的方法
defineExpose({
  // 设置缩放级别（不触发store更新，避免循环）
  setZoom: (zoom, options = {}) => {
    if (setViewport) {
      const currentViewport = getViewport()
      setViewport({
        ...currentViewport,
        zoom
      }, { duration: options.duration || 200 })
    }
  },
  // 获取当前视口
  getViewport: () => {
    return getViewport ? getViewport() : canvasStore.viewport
  },
  // 编组选中的节点
  groupSelectedNodes
})

onMounted(() => {
  console.log('[CanvasBoard] 组件已挂载，开始初始化...')

  // 初始化视口 - 增加延迟确保 VueFlow 完全就绪
  const initViewport = () => {
    try {
      fitView({ padding: 0.2 })
      console.log('[CanvasBoard] 视口初始化完成')
    } catch (e) {
      console.warn('[CanvasBoard] fitView 失败，重试中...', e)
      const retryId = setTimeout(() => {
        pendingTimeouts.delete(retryId)
        initViewport()
      }, 100)
      pendingTimeouts.add(retryId)
    }
  }

  // 等待足够长的时间确保 VueFlow 完全初始化
  const initTimeoutId = setTimeout(() => {
    pendingTimeouts.delete(initTimeoutId)
    initViewport()
  }, 200)
  pendingTimeouts.add(initTimeoutId)
  
  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)
  
  // 添加连线样式变化事件监听
  window.addEventListener('canvas-edge-style-change', handleEdgeStyleChange)
  
  // 添加鼠标事件监听（用于空格+拖动平移）
  document.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  
  // 添加滚轮事件监听（以鼠标位置为中心缩放）
  if (canvasBoardRef.value) {
    canvasBoardRef.value.addEventListener('wheel', handleWheel, { passive: false })
    // 添加原生右键菜单事件监听
    canvasBoardRef.value.addEventListener('contextmenu', handleNativeContextMenu)
  }
})

onUnmounted(() => {
  // 移除键盘事件监听
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keyup', handleKeyUp)
  
  // 移除连线样式变化事件监听
  window.removeEventListener('canvas-edge-style-change', handleEdgeStyleChange)
  
  // 移除鼠标事件监听
  document.removeEventListener('mousedown', handleMouseDown)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  
  // 恢复光标样式
  document.body.style.cursor = 'default'
  
  // 移除滚轮和右键事件监听
  if (canvasBoardRef.value) {
    canvasBoardRef.value.removeEventListener('wheel', handleWheel)
    canvasBoardRef.value.removeEventListener('contextmenu', handleNativeContextMenu)
  }
  
  // 移除全局拖拽事件监听
  const listenerOptions = { capture: true }
  window.removeEventListener('mousemove', handleGlobalDragConnectionMove, listenerOptions)
  window.removeEventListener('mouseup', handleGlobalDragConnectionEnd, listenerOptions)
  
  // 🔧 清理对齐辅助线节流定时器，防止内存泄漏
  if (alignmentThrottleTimer.value) {
    cancelAnimationFrame(alignmentThrottleTimer.value)
    alignmentThrottleTimer.value = null
  }
  
  // 🔧 清理所有待执行的定时器
  pendingTimeouts.forEach(id => clearTimeout(id))
  pendingTimeouts.clear()
})
</script>

<template>
  <div 
    ref="canvasBoardRef" 
    class="canvas-board" 
    :class="{ 'file-drag-over': isFileDragOver }"
    @dblclick="handleDoubleClick"
    @dragenter="handleFileDragEnter"
    @dragover="handleFileDragOver"
    @dragleave="handleFileDragLeave"
    @drop="handleFileDrop"
  >
    <!-- 文件拖拽覆盖层 -->
    <div v-if="isFileDragOver" class="file-drop-overlay">
      <div class="file-drop-hint">
        <span class="file-drop-icon">📁</span>
        <span class="file-drop-text">释放以添加文件</span>
        <span class="file-drop-subtext">支持图片、视频、音频</span>
      </div>
    </div>
    
    <VueFlow
      v-model:nodes="canvasStore.nodes"
      v-model:edges="canvasStore.edges"
      :node-types="nodeTypes"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :default-edge-options="defaultEdgeOptions"
      :min-zoom="0.1"
      :max-zoom="5"
      :snap-to-grid="true"
      :snap-grid="[20, 20]"
      :connection-mode="'loose'"
      :pan-on-drag="[0, 2]"
      :selection-on-drag="true"
      :selection-key-code="'Control'"
      :select-nodes-on-drag="true"
      :pan-on-scroll="false"
      :zoom-on-scroll="false"
      :zoom-on-pinch="true"
      :zoom-on-double-click="false"
      :delete-key-code="null"
      :prevent-scrolling="true"
      :elevate-nodes-on-select="false"
      :nodes-draggable="true"
      :edges-selectable="true"
      :multi-selection-key-code="'Control'"
      @viewport-change="handleViewportChange"
      @selection-change="handleSelectionChange"
      @edges-change="handleEdgesChange"
    >
      <!-- 网格背景 -->
      <Background 
        :variant="'dots'" 
        :gap="20" 
        :size="1"
        pattern-color="#2a2a2a"
      />
      
      <!-- 拖拽连线可视化 -->
      <template v-if="canvasStore.isDraggingConnection">
        <svg class="drag-connection-line">
          <defs>
            <marker
              id="drag-arrow"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
            </marker>
          </defs>
          <path
            :d="getDragLinePath"
            stroke="#3b82f6"
            stroke-width="2"
            fill="none"
            stroke-dasharray="5,5"
            marker-end="url(#drag-arrow)"
          />
        </svg>
      </template>
      
      <!-- 待连接虚拟连线（选择器打开时显示） -->
      <template v-if="showPendingConnection">
        <svg class="pending-connection-line">
          <defs>
            <marker
              id="pending-arrow"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
            </marker>
          </defs>
          <path
            :d="getPendingConnectionPath()"
            stroke="#22c55e"
            stroke-width="2"
            fill="none"
            stroke-dasharray="8,4"
            marker-end="url(#pending-arrow)"
          />
        </svg>
      </template>
      
      <!-- 对齐辅助线 -->
      <template v-if="alignmentGuidesScreen.vertical || alignmentGuidesScreen.horizontal">
        <svg class="alignment-guides">
          <!-- 垂直辅助线 -->
          <line
            v-if="alignmentGuidesScreen.vertical"
            :x1="alignmentGuidesScreen.vertical.x"
            :y1="alignmentGuidesScreen.vertical.startY"
            :x2="alignmentGuidesScreen.vertical.x"
            :y2="alignmentGuidesScreen.vertical.endY"
            stroke="#3b82f6"
            stroke-width="1.5"
            stroke-dasharray="4,4"
            opacity="0.8"
          />
          <!-- 水平辅助线 -->
          <line
            v-if="alignmentGuidesScreen.horizontal"
            :x1="alignmentGuidesScreen.horizontal.startX"
            :y1="alignmentGuidesScreen.horizontal.y"
            :x2="alignmentGuidesScreen.horizontal.endX"
            :y2="alignmentGuidesScreen.horizontal.y"
            stroke="#3b82f6"
            stroke-width="1.5"
            stroke-dasharray="4,4"
            opacity="0.8"
          />
        </svg>
      </template>
      
      <!-- 小地图 (可选) -->
      <!-- <MiniMap /> -->
    </VueFlow>
  </div>
</template>

<style scoped>
.canvas-board {
  width: 100%;
  height: 100%;
}

/* Vue Flow 样式覆盖 */
:deep(.vue-flow) {
  background: var(--canvas-bg-primary);
}

/* 默认鼠标样式 - 抓取手型（表示可拖拽画布） */
:deep(.vue-flow__pane) {
  cursor: grab;
}

/* 拖拽画布时变为抓取中光标 */
:deep(.vue-flow__pane.dragging) {
  cursor: grabbing;
}

:deep(.vue-flow__node) {
  cursor: pointer;
}

:deep(.vue-flow__node.selected) {
  outline: none;
}

/* 框选区域样式 */
:deep(.vue-flow__selection) {
  background: rgba(59, 130, 246, 0.1);
  border: 1px dashed var(--canvas-accent-primary);
  border-radius: 4px;
}

/* 被选中节点的高亮效果（排除图片和视频节点，它们有自己的选中样式） */
:deep(.vue-flow__node.selected:not([data-type="image-input"]):not([data-type="image"]):not([data-type="video"]):not([data-type="video-input"]):not([data-type="storyboard"])) {
  box-shadow: 0 0 0 2px var(--canvas-accent-primary);
}

:deep(.vue-flow__edge-path) {
  stroke: var(--canvas-edge-default);
  stroke-width: 2;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: var(--canvas-edge-active);
  stroke-width: 3;
}

:deep(.vue-flow__handle) {
  width: 12px;
  height: 12px;
  background: var(--canvas-bg-secondary);
  border: 2px solid var(--canvas-border-default);
}

/* cell-handle 铺满格子，不受全局 12px 限制 */
:deep(.vue-flow__handle.cell-handle) {
  width: 100% !important;
  height: 100% !important;
  background: transparent !important;
  border: none !important;
}

:deep(.vue-flow__handle:hover) {
  background: var(--canvas-accent-primary);
  border-color: var(--canvas-accent-primary);
}

:deep(.vue-flow__connection-line) {
  stroke: var(--canvas-accent-primary);
  stroke-width: 2;
}

/* 多选时的节点样式（排除图片和视频节点，它们有自己的选中样式） */
:deep(.vue-flow__node.selectable.selected:not([data-type="image-input"]):not([data-type="image"]):not([data-type="video"]):not([data-type="video-input"]):not([data-type="storyboard"])) {
  outline: 2px solid var(--canvas-accent-primary);
  outline-offset: 2px;
}

/* 拖拽连线可视化 */
.drag-connection-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
  overflow: visible;
}

.drag-connection-line path {
  filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.5));
  animation: dashAnimation 0.5s linear infinite;
}

/* 待连接虚拟连线（选择器打开时显示） */
.pending-connection-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 999;
  overflow: visible;
}

.pending-connection-line path {
  filter: drop-shadow(0 0 6px rgba(34, 197, 94, 0.6));
  animation: pendingDashAnimation 0.8s linear infinite;
}

/* 对齐辅助线 */
.alignment-guides {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1001;
  overflow: visible;
}

.alignment-guides line {
  filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.6));
}

@keyframes pendingDashAnimation {
  to {
    stroke-dashoffset: -12;
  }
}

@keyframes dashAnimation {
  to {
    stroke-dashoffset: -10;
  }
}

/* 文件拖拽到画布 */
.canvas-board.file-drag-over {
  position: relative;
}

.file-drop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(59, 130, 246, 0.15);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  pointer-events: none;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.file-drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 60px;
  background: var(--canvas-bg-elevated, #1e1e1e);
  border: 2px dashed var(--canvas-accent-primary, #3b82f6);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.file-drop-icon {
  font-size: 48px;
  animation: bounce 1s ease infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.file-drop-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--canvas-text-primary, #fff);
}

.file-drop-subtext {
  font-size: 13px;
  color: var(--canvas-text-secondary, #a0a0a0);
}
</style>


