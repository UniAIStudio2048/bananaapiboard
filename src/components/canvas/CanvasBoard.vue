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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { useCanvasStore } from '@/stores/canvas'

// 导入自定义节点组件
import { canConnect } from '@/config/canvas/nodeTypes'
import TextNode from './nodes/TextNode.vue'
import ImageNode from './nodes/ImageNode.vue'
import VideoNode from './nodes/VideoNode.vue'
import ImageGenNode from './nodes/ImageGenNode.vue'
import VideoGenNode from './nodes/VideoGenNode.vue'
import LLMNode from './nodes/LLMNode.vue'
import PreviewNode from './nodes/PreviewNode.vue'
import GroupNode from './nodes/GroupNode.vue'

const emit = defineEmits(['dblclick', 'canvas-contextmenu'])
const canvasStore = useCanvasStore()

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

// Vue Flow 实例
const { 
  onConnect, 
  onConnectStart,
  onConnectEnd,
  onNodeDragStop,
  onNodeDrag,
  onNodeClick,
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
  vueFlowRef
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
  'group': GroupNode              // 编组节点
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
      setTimeout(() => {
        justOpenedSelectorFromConnection.value = false
      }, 200)
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
  canvasStore.updateNodePosition(node.id, node.position)
  
  // 如果拖拽的是编组节点，同步更新组内节点位置
  if (node.type === 'group' && node.data?.nodeIds) {
    syncGroupChildrenPositions(node)
  }
})

// 处理节点拖拽中（实时同步）
onNodeDrag((event) => {
  const node = event.node
  
  // 如果拖拽的是编组节点，实时同步组内节点位置
  if (node.type === 'group' && node.data?.nodeIds && node.data?.nodeOffsets) {
    syncGroupChildrenPositions(node)
  }
})

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
  } else if (nodes.length === 0) {
    canvasStore.clearSelection()
  } else {
    // 多选时也更新 store（选中第一个作为主选中）
    canvasStore.selectNode(nodes[0].id)
  }
}

// 处理节点点击 - 确保编组节点被正确选中
onNodeClick((event) => {
  const node = event.node
  console.log('[Canvas] 节点被点击:', node.id, node.type)
  
  // 确保选中状态被正确更新
  canvasStore.selectNode(node.id)
  
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
})

// 处理画布右键（空白区域右键菜单）
onPaneContextMenu((event) => {
  event.preventDefault()
  
  // 关闭其他菜单
  canvasStore.closeNodeSelector()
  
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
  
  // Ctrl+C 复制
  if (isCtrlOrCmd && event.key === 'c') {
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
function deleteSelectedElements() {
  const selectedNodes = getSelectedNodes.value
  const selectedEdges = getSelectedEdges.value
  
  if (selectedNodes.length > 0) {
    // 删除选中的节点
    const nodeIds = selectedNodes.map(n => n.id)
    removeNodes(nodeIds)
    
    // 同步到 store
    nodeIds.forEach(id => {
      canvasStore.removeNode(id)
    })
    
    console.log(`[Canvas] 删除了 ${nodeIds.length} 个节点`)
  }
  
  if (selectedEdges.length > 0) {
    // 删除选中的连线
    const edgeIds = selectedEdges.map(e => e.id)
    removeEdges(edgeIds)
    
    // 同步到 store
    edgeIds.forEach(id => {
      canvasStore.removeEdge(id)
    })
    
    console.log(`[Canvas] 删除了 ${edgeIds.length} 条连线`)
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
        // 锁定节点，不能单独拖动
        node.draggable = false
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
function handleViewportChange(viewport) {
  canvasStore.updateViewport(viewport)
}

// 处理边的变化（包括删除）
function handleEdgesChange(changes) {
  changes.forEach(change => {
    if (change.type === 'remove') {
      // 边被删除时，重置目标节点的状态
      const edge = canvasStore.edges.find(e => e.id === change.id)
      if (edge) {
        // 清除目标节点的继承数据
        canvasStore.updateNodeData(edge.target, {
          inheritedFrom: null,
          inheritedData: null,
          hasUpstream: false
        })
        // 从 store 中移除边
        canvasStore.removeEdge(change.id)
        console.log(`[Canvas] 边 ${change.id} 已删除，目标节点 ${edge.target} 已重置`)
      }
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
      // 开始拖拽时，使用 getHandlePosition 获取源节点输出端口的精确位置
      const sourceInfo = canvasStore.dragConnectionSource
      if (sourceInfo?.nodeId) {
        const handlePos = getHandlePosition(sourceInfo.nodeId, 'output')
        dragLineStartPosition.value = handlePos
        console.log('[CanvasBoard] 拖拽连线起始位置:', handlePos)
      } else {
        // 回退：使用 store 中的位置
        dragLineStartPosition.value = { ...canvasStore.dragConnectionPosition }
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
  
  // 计算结束位置
  const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
  const screenPos = { x: event.clientX, y: event.clientY }
  
  // 调用 store 的 endDragConnection
  const connected = canvasStore.endDragConnection(targetNode, flowPos, screenPos)
  
  if (!connected) {
    // 如果没有连接到节点，标记刚刚打开了选择器
    justOpenedSelectorFromConnection.value = true
    setTimeout(() => {
      justOpenedSelectorFromConnection.value = false
    }, 200)
  }
}

// 获取节点端口的画布坐标
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
  
  if (handleType === 'output') {
    // 输出端口在节点右侧中心
    return {
      x: node.position.x + nodeWidth,
      y: node.position.y + labelOffset + nodeHeight / 2
    }
  } else {
    // 输入端口在节点左侧中心
    return {
      x: node.position.x,
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
        current.classList?.contains('video-node')) {
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
  
  if (event.dataTransfer?.types?.includes('Files')) {
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
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
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
  
  // 处理每个文件
  let offsetX = 0
  let offsetY = 0
  
  for (const file of files) {
    const category = getFileCategory(file)
    if (!category) continue
    
    try {
      const dataUrl = await readFileAsBase64(file)
      const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // 根据文件类型创建不同的节点
      if (category === 'image') {
        canvasStore.addNode({
          id: nodeId,
          type: 'image-input',
          position: { x: canvasX + offsetX, y: canvasY + offsetY },
          data: {
            title: file.name || '图片',
            nodeRole: 'source',
            sourceImages: [dataUrl]
          }
        })
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
              url: dataUrl
            }
          }
        })
      } else if (category === 'audio') {
        // 音频节点 - 使用文本节点暂存音频信息（可扩展为专用音频节点）
        canvasStore.addNode({
          id: nodeId,
          type: 'text-input',
          position: { x: canvasX + offsetX, y: canvasY + offsetY },
          data: {
            title: `🎵 ${file.name || '音频'}`,
            text: `音频文件: ${file.name}`,
            audioData: dataUrl
          }
        })
      }
      
      // 多文件时错开位置
      offsetX += 50
      offsetY += 50
      
    } catch (error) {
      console.error('[CanvasBoard] 文件读取失败:', error)
    }
  }
}

onMounted(() => {
  // 初始化视口
  setTimeout(() => {
    fitView({ padding: 0.2 })
  }, 100)
  
  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)
  
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
      :default-edge-options="{ type: 'smoothstep', animated: false }"
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
      fit-view-on-init
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

/* 被选中节点的高亮效果 */
:deep(.vue-flow__node.selected) {
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

:deep(.vue-flow__handle:hover) {
  background: var(--canvas-accent-primary);
  border-color: var(--canvas-accent-primary);
}

:deep(.vue-flow__connection-line) {
  stroke: var(--canvas-accent-primary);
  stroke-width: 2;
}

/* 多选时的节点样式 */
:deep(.vue-flow__node.selectable.selected) {
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


