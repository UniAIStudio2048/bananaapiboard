/**
 * Canvas Store - 画布状态管理
 * 管理节点、连线、视口状态等
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useVueFlow } from '@vue-flow/core'

export const useCanvasStore = defineStore('canvas', () => {
  // ========== 节点和连线 ==========
  const nodes = ref([])
  const edges = ref([])
  
  // ========== 视口状态 ==========
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  
  // ========== 选中状态 ==========
  const selectedNodeId = ref(null)
  const selectedEdgeId = ref(null)
  const selectedNodeIds = ref([]) // 多选节点ID列表
  
  // ========== 编组相关 ==========
  const nodeGroups = ref([]) // 编组列表 [{ id, name, nodeIds: [], color }]
  
  // ========== 历史记录（撤销/重做） ==========
  const historyStack = ref([])     // 历史记录栈
  const historyIndex = ref(-1)     // 当前历史位置
  const maxHistoryLength = 50      // 最大历史记录数
  const isHistoryAction = ref(false) // 是否正在执行历史操作（防止重复记录）
  
  // ========== 剪贴板 ==========
  const clipboard = ref(null)      // 复制的节点数据
  
  // ========== UI 状态 ==========
  const isNodeSelectorOpen = ref(false)
  const nodeSelectorPosition = ref({ x: 0, y: 0 }) // 屏幕坐标（用于显示面板）
  const nodeSelectorFlowPosition = ref(null)       // 画布坐标（用于创建节点）
  const nodeSelectorTrigger = ref(null) // 'toolbar' | 'canvas' | 'node'
  const triggerNodeId = ref(null) // 触发节点ID（用于从节点创建下一个节点）
  
  // 待连接的连线状态（用于拖拽连线后显示虚拟连线）
  const pendingConnection = ref(null) // { sourceNodeId, sourceHandleId, targetPosition: {x, y} }
  
  // ========== 拖拽连线状态 ==========
  const isDraggingConnection = ref(false)  // 是否正在拖拽连线
  const dragConnectionSource = ref(null)   // 拖拽连线的源节点 { nodeId, handleId }
  const dragConnectionPosition = ref({ x: 0, y: 0 }) // 拖拽连线的当前位置（画布坐标）
  const preventSelectorClose = ref(false)  // 防止选择器被立即关闭（用于连线拖拽后打开选择器的场景）
  
  const isContextMenuOpen = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const contextMenuTargetNode = ref(null)
  
  // 画布右键菜单状态
  const isCanvasContextMenuOpen = ref(false)
  const canvasContextMenuPosition = ref({ x: 0, y: 0 })
  
  const isBottomPanelVisible = ref(true)
  
  // ========== 计算属性 ==========
  const selectedNode = computed(() => {
    if (!selectedNodeId.value) return null
    return nodes.value.find(n => n.id === selectedNodeId.value)
  })
  
  const isEmpty = computed(() => nodes.value.length === 0)
  
  const nodeCount = computed(() => nodes.value.length)
  
  // 是否可以撤销
  const canUndo = computed(() => historyIndex.value > 0)
  
  // 是否可以重做
  const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1)
  
  // 是否有剪贴板内容
  const hasClipboard = computed(() => clipboard.value !== null)
  
  // ========== 节点操作 ==========
  
  /**
   * 添加节点
   */
  function addNode(node, skipHistory = false) {
    if (!skipHistory) {
      saveHistory() // 保存历史
    }
    
    const newNode = {
      id: node.id || generateId(),
      type: node.type,
      position: node.position || { x: 0, y: 0 },
      zIndex: node.zIndex !== undefined ? node.zIndex : 0,
      style: node.style || {},
      draggable: node.draggable !== undefined ? node.draggable : true,
      selectable: node.selectable !== undefined ? node.selectable : true,
      data: {
        title: node.title || getDefaultTitle(node.type),
        ...node.data,
        status: node.data?.status || 'idle',
        estimatedCost: node.data?.estimatedCost || 0
      }
    }
    
    nodes.value.push(newNode)
    
    // 如果是从另一个节点创建的，自动添加连线
    if (triggerNodeId.value) {
      addEdge({
        source: triggerNodeId.value,
        target: newNode.id
      })
      triggerNodeId.value = null
    }
    
    // 只有非编组节点才自动选中（编组节点由外部手动选中）
    if (node.type !== 'group') {
      selectNode(newNode.id)
    }
    
    return newNode
  }
  
  /**
   * 更新节点数据
   */
  function updateNodeData(nodeId, data) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (node) {
      node.data = { ...node.data, ...data }
    }
  }
  
  /**
   * 更新节点位置
   */
  function updateNodePosition(nodeId, position) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (node) {
      node.position = position
    }
  }
  
  /**
   * 删除节点
   */
  function removeNode(nodeId) {
    saveHistory() // 保存历史
    
    // 删除相关连线
    edges.value = edges.value.filter(
      e => e.source !== nodeId && e.target !== nodeId
    )
    // 删除节点
    nodes.value = nodes.value.filter(n => n.id !== nodeId)
    
    // 清除选中状态
    if (selectedNodeId.value === nodeId) {
      selectedNodeId.value = null
    }
    // 从多选列表中移除
    selectedNodeIds.value = selectedNodeIds.value.filter(id => id !== nodeId)
  }
  
  /**
   * 选中节点
   */
  function selectNode(nodeId) {
    selectedNodeId.value = nodeId
    selectedEdgeId.value = null
  }
  
  /**
   * 取消选中
   */
  function clearSelection() {
    selectedNodeId.value = null
    selectedEdgeId.value = null
  }
  
  // ========== 连线操作 ==========
  
  /**
   * 添加连线
   */
  function addEdge(edge) {
    const newEdge = {
      id: edge.id || `e-${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || 'output',
      targetHandle: edge.targetHandle || 'input',
      animated: false
    }
    
    // 检查是否已存在
    const exists = edges.value.some(
      e => e.source === newEdge.source && e.target === newEdge.target
    )
    
    if (!exists) {
      edges.value.push(newEdge)
      
      // 自动传递数据
      propagateData(edge.source, edge.target)
    }
    
    return newEdge
  }
  
  /**
   * 删除连线
   */
  function removeEdge(edgeId) {
    edges.value = edges.value.filter(e => e.id !== edgeId)
  }
  
  /**
   * 数据传递：从源节点传递输出到目标节点
   */
  function propagateData(sourceId, targetId) {
    const sourceNode = nodes.value.find(n => n.id === sourceId)
    const targetNode = nodes.value.find(n => n.id === targetId)
    
    if (!sourceNode || !targetNode) return
    
    let inheritedData = null
    
    // 1. 如果源节点有输出结果，直接传递
    if (sourceNode.data.output) {
      inheritedData = sourceNode.data.output
    }
    // 2. 文本节点传递文本内容
    else if ((sourceNode.type === 'text-input' || sourceNode.type === 'text') && sourceNode.data.text) {
      inheritedData = {
        type: 'text',
        content: sourceNode.data.text
      }
    }
    // 3. 图片节点（源节点角色）传递上传的图片
    else if ((sourceNode.type === 'image-input' || sourceNode.type === 'image') && 
             (sourceNode.data.sourceImages?.length || sourceNode.data.images?.length)) {
      inheritedData = {
        type: 'image',
        urls: sourceNode.data.sourceImages || sourceNode.data.images
      }
    }
    // 4. 视频节点传递视频
    else if ((sourceNode.type === 'video-input' || sourceNode.type === 'video') && sourceNode.data.sourceVideo) {
      inheritedData = {
        type: 'video',
        url: sourceNode.data.sourceVideo
      }
    }
    
    // 更新目标节点
    if (inheritedData) {
      updateNodeData(targetId, {
        inheritedFrom: sourceId,
        inheritedData: inheritedData,
        hasUpstream: true
      })
    } else {
      // 即使没有数据，也标记连接关系，让目标节点知道有上游
      updateNodeData(targetId, {
        inheritedFrom: sourceId,
        hasUpstream: true
      })
    }
  }
  
  // ========== 历史记录操作（撤销/重做） ==========
  
  /**
   * 保存当前状态到历史记录
   */
  function saveHistory() {
    // 如果正在执行历史操作，不保存
    if (isHistoryAction.value) return
    
    const state = {
      nodes: JSON.parse(JSON.stringify(nodes.value)),
      edges: JSON.parse(JSON.stringify(edges.value))
    }
    
    // 如果当前不在历史末尾，删除后面的记录
    if (historyIndex.value < historyStack.value.length - 1) {
      historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
    }
    
    // 添加新记录
    historyStack.value.push(state)
    
    // 限制历史记录长度
    if (historyStack.value.length > maxHistoryLength) {
      historyStack.value.shift()
    } else {
      historyIndex.value++
    }
  }
  
  /**
   * 撤销
   */
  function undo() {
    if (!canUndo.value) return
    
    isHistoryAction.value = true
    historyIndex.value--
    
    const state = historyStack.value[historyIndex.value]
    nodes.value = JSON.parse(JSON.stringify(state.nodes))
    edges.value = JSON.parse(JSON.stringify(state.edges))
    
    isHistoryAction.value = false
  }
  
  /**
   * 重做
   */
  function redo() {
    if (!canRedo.value) return
    
    isHistoryAction.value = true
    historyIndex.value++
    
    const state = historyStack.value[historyIndex.value]
    nodes.value = JSON.parse(JSON.stringify(state.nodes))
    edges.value = JSON.parse(JSON.stringify(state.edges))
    
    isHistoryAction.value = false
  }
  
  // ========== 剪贴板操作 ==========
  
  /**
   * 复制选中的节点
   */
  function copySelectedNodes() {
    const nodesToCopy = []
    const edgesToCopy = []
    
    // 获取要复制的节点
    if (selectedNodeIds.value.length > 0) {
      // 多选情况
      nodesToCopy.push(...nodes.value.filter(n => selectedNodeIds.value.includes(n.id)))
    } else if (selectedNodeId.value) {
      // 单选情况
      const node = nodes.value.find(n => n.id === selectedNodeId.value)
      if (node) nodesToCopy.push(node)
    }
    
    if (nodesToCopy.length === 0) return
    
    // 获取这些节点之间的连线
    const nodeIds = nodesToCopy.map(n => n.id)
    edgesToCopy.push(...edges.value.filter(
      e => nodeIds.includes(e.source) && nodeIds.includes(e.target)
    ))
    
    // 保存到剪贴板
    clipboard.value = {
      nodes: JSON.parse(JSON.stringify(nodesToCopy)),
      edges: JSON.parse(JSON.stringify(edgesToCopy))
    }
    
    console.log(`[Canvas] 已复制 ${nodesToCopy.length} 个节点`)
  }
  
  /**
   * 粘贴节点
   * @param {Object} position - 粘贴位置（画布坐标）
   */
  function pasteNodes(position = null) {
    if (!clipboard.value) return
    
    saveHistory()
    
    const { nodes: copiedNodes, edges: copiedEdges } = clipboard.value
    const idMap = {} // 旧ID -> 新ID 映射
    
    // 计算偏移量
    let offsetX = 50
    let offsetY = 50
    
    if (position && copiedNodes.length > 0) {
      // 计算复制节点的中心点
      const centerX = copiedNodes.reduce((sum, n) => sum + n.position.x, 0) / copiedNodes.length
      const centerY = copiedNodes.reduce((sum, n) => sum + n.position.y, 0) / copiedNodes.length
      
      // 将节点中心移动到鼠标位置
      offsetX = position.x - centerX
      offsetY = position.y - centerY
    }
    
    // 创建新节点
    const newNodes = copiedNodes.map(node => {
      const newId = generateId()
      idMap[node.id] = newId
      
      return {
        ...JSON.parse(JSON.stringify(node)),
        id: newId,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY
        }
      }
    })
    
    // 创建新连线
    const newEdges = copiedEdges.map(edge => ({
      ...JSON.parse(JSON.stringify(edge)),
      id: `e-${idMap[edge.source]}-${idMap[edge.target]}`,
      source: idMap[edge.source],
      target: idMap[edge.target]
    }))
    
    // 添加到画布
    nodes.value.push(...newNodes)
    edges.value.push(...newEdges)
    
    // 选中新粘贴的节点
    selectedNodeIds.value = newNodes.map(n => n.id)
    if (newNodes.length === 1) {
      selectedNodeId.value = newNodes[0].id
    }
    
    console.log(`[Canvas] 已粘贴 ${newNodes.length} 个节点`)
  }
  
  /**
   * 全选节点
   */
  function selectAllNodes() {
    selectedNodeIds.value = nodes.value.map(n => n.id)
    if (nodes.value.length > 0) {
      selectedNodeId.value = nodes.value[0].id
    }
  }
  
  /**
   * 更新多选节点列表
   */
  function setSelectedNodeIds(ids) {
    selectedNodeIds.value = ids
  }
  
  // ========== UI 操作 ==========
  
  /**
   * 打开节点选择器
   * @param {Object} position - 屏幕坐标 {x, y}
   * @param {String} trigger - 触发来源 'toolbar' | 'canvas' | 'node'
   * @param {String} nodeId - 触发节点ID
   * @param {Object} flowPosition - 画布坐标 {x, y} (可选，用于在特定位置创建节点)
   * @param {Object} pendingConn - 待连接信息 (可选，用于显示虚拟连线)
   */
  function openNodeSelector(position, trigger = 'canvas', nodeId = null, flowPosition = null, pendingConn = null) {
    nodeSelectorPosition.value = position
    nodeSelectorTrigger.value = trigger
    triggerNodeId.value = nodeId
    nodeSelectorFlowPosition.value = flowPosition
    isNodeSelectorOpen.value = true
    
    // 设置待连接信息（用于渲染虚拟连线）
    if (pendingConn) {
      pendingConnection.value = pendingConn
    }
  }

  /**
   * 关闭节点选择器
   */
  function closeNodeSelector() {
    isNodeSelectorOpen.value = false
    triggerNodeId.value = null
    nodeSelectorFlowPosition.value = null
    pendingConnection.value = null // 清除待连接连线
  }
  
  /**
   * 设置待连接的连线（用于显示虚拟连线）
   */
  function setPendingConnection(conn) {
    pendingConnection.value = conn
  }
  
  /**
   * 清除待连接的连线
   */
  function clearPendingConnection() {
    pendingConnection.value = null
  }
  
  // ========== 拖拽连线操作 ==========
  
  /**
   * 开始拖拽连线
   * @param {String} nodeId - 源节点ID
   * @param {String} handleId - 源端口ID（默认 'output'）
   * @param {Object} startPosition - 起始位置（画布坐标）
   */
  function startDragConnection(nodeId, handleId = 'output', startPosition) {
    // 重要：先设置位置和源节点信息，再设置 isDraggingConnection
    // 因为 CanvasBoard 的 watch 会在 isDraggingConnection 变化时读取 dragConnectionPosition
    dragConnectionSource.value = { nodeId, handleId }
    dragConnectionPosition.value = startPosition
    isDraggingConnection.value = true  // 最后设置，触发 watch
    console.log('[Store] 开始拖拽连线', { nodeId, handleId, startPosition })
  }
  
  /**
   * 更新拖拽连线位置
   * @param {Object} position - 当前位置（画布坐标）
   */
  function updateDragConnectionPosition(position) {
    if (isDraggingConnection.value) {
      dragConnectionPosition.value = position
    }
  }
  
  /**
   * 结束拖拽连线
   * @param {Object|null} targetNode - 目标节点（如果连接到节点）
   * @param {Object} endPosition - 结束位置（画布坐标）
   * @param {Object} screenPosition - 屏幕坐标（用于显示选择器）
   * @returns {Boolean} - 是否成功连接到节点
   */
  function endDragConnection(targetNode, endPosition, screenPosition) {
    if (!isDraggingConnection.value || !dragConnectionSource.value) {
      isDraggingConnection.value = false
      dragConnectionSource.value = null
      return false
    }
    
    const sourceNodeId = dragConnectionSource.value.nodeId
    const sourceHandleId = dragConnectionSource.value.handleId
    
    if (targetNode && targetNode.id !== sourceNodeId) {
      // 成功连接到另一个节点
      addEdge({
        source: sourceNodeId,
        target: targetNode.id,
        sourceHandle: sourceHandleId,
        targetHandle: 'input'
      })
      console.log('[Store] 拖拽连线成功', sourceNodeId, '->', targetNode.id)
      
      // 清理状态
      isDraggingConnection.value = false
      dragConnectionSource.value = null
      return true
    } else {
      // 没有连接到节点，打开节点选择器
      console.log('[Store] 拖拽连线到空白处，打开节点选择器', { sourceNodeId, endPosition, screenPosition })
      
      // 设置待连接信息
      const pendingConn = {
        sourceNodeId,
        sourceHandleId,
        targetPosition: endPosition
      }
      
      // 设置防止选择器被立即关闭的标志
      preventSelectorClose.value = true
      
      // 打开节点选择器
      openNodeSelector(
        screenPosition,
        'node',
        sourceNodeId,
        endPosition,
        pendingConn
      )
      
      // 延迟后重置标志
      setTimeout(() => {
        preventSelectorClose.value = false
      }, 300)
      
      // 清理拖拽状态（但保留 pendingConnection）
      isDraggingConnection.value = false
      dragConnectionSource.value = null
      return false
    }
  }
  
  /**
   * 取消拖拽连线
   */
  function cancelDragConnection() {
    isDraggingConnection.value = false
    dragConnectionSource.value = null
    console.log('[Store] 取消拖拽连线')
  }
  
  /**
   * 打开节点右键菜单
   */
  function openContextMenu(position, node) {
    contextMenuPosition.value = position
    contextMenuTargetNode.value = node
    isContextMenuOpen.value = true
    // 关闭画布右键菜单
    isCanvasContextMenuOpen.value = false
  }
  
  /**
   * 关闭节点右键菜单
   */
  function closeContextMenu() {
    isContextMenuOpen.value = false
    contextMenuTargetNode.value = null
  }
  
  /**
   * 打开画布右键菜单（空白区域）
   */
  function openCanvasContextMenu(position) {
    canvasContextMenuPosition.value = position
    isCanvasContextMenuOpen.value = true
    // 关闭节点右键菜单
    isContextMenuOpen.value = false
  }
  
  /**
   * 关闭画布右键菜单
   */
  function closeCanvasContextMenu() {
    isCanvasContextMenuOpen.value = false
  }
  
  /**
   * 关闭所有右键菜单
   */
  function closeAllContextMenus() {
    closeContextMenu()
    closeCanvasContextMenu()
  }
  
  /**
   * 更新视口
   */
  function updateViewport(newViewport) {
    viewport.value = newViewport
  }
  
  // ========== 工作流操作 ==========
  
  /**
   * 清空画布
   */
  function clearCanvas() {
    nodes.value = []
    edges.value = []
    selectedNodeId.value = null
    selectedEdgeId.value = null
  }
  
  /**
   * 加载工作流
   */
  function loadWorkflow(workflow) {
    nodes.value = workflow.nodes || []
    edges.value = workflow.edges || []
    if (workflow.viewport) {
      viewport.value = workflow.viewport
    }
  }
  
  /**
   * 导出工作流数据
   */
  function exportWorkflow() {
    return {
      nodes: nodes.value,
      edges: edges.value,
      viewport: viewport.value
    }
  }
  
  // ========== 工具函数 ==========
  
  function generateId() {
    return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
  
  function getDefaultTitle(type) {
    const titles = {
      'text-input': '文本输入',
      'image-input': '图片上传',
      'video-input': '视频上传',
      'text-to-image': '图片生成',
      'image-to-image': '图片转换',
      'text-to-video': '视频生成',
      'image-to-video': '图生视频',
      'llm-prompt-enhance': '提示词优化',
      'llm-image-describe': '图片描述',
      'preview-output': '预览输出'
    }
    return titles[type] || '节点'
  }
  
  /**
   * 获取节点的上游节点
   */
  function getUpstreamNodes(nodeId) {
    const upstreamEdges = edges.value.filter(e => e.target === nodeId)
    return upstreamEdges.map(e => nodes.value.find(n => n.id === e.source)).filter(Boolean)
  }
  
  /**
   * 获取节点的下游节点
   */
  function getDownstreamNodes(nodeId) {
    const downstreamEdges = edges.value.filter(e => e.source === nodeId)
    return downstreamEdges.map(e => nodes.value.find(n => n.id === e.target)).filter(Boolean)
  }
  
  // ========== 编组操作 ==========
  
  /**
   * 创建节点编组
   */
  function createGroup(nodeIds, groupName = null) {
    if (nodeIds.length < 2) {
      console.warn('[Canvas Store] 需要至少 2 个节点才能创建编组')
      return null
    }
    
    saveHistory()
    
    const groupId = `group-${Date.now()}`
    const name = groupName || `新建组`
    
    // 半透明无色配色方案（清爽风格）
    const lightColors = [
      { bg: 'rgba(100, 116, 139, 0.08)', border: 'rgba(100, 116, 139, 0.25)' },      // 灰蓝
      { bg: 'rgba(107, 114, 128, 0.08)', border: 'rgba(107, 114, 128, 0.25)' },      // 灰色
      { bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)' },        // 靛蓝
      { bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.25)' },        // 紫色
      { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.25)' },        // 蓝色
      { bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)' },        // 青色
    ]
    
    const colorScheme = lightColors[nodeGroups.value.length % lightColors.length]
    
    const group = {
      id: groupId,
      name: name,
      nodeIds: [...nodeIds],
      color: colorScheme.bg,
      borderColor: colorScheme.border
    }
    
    nodeGroups.value.push(group)
    
    // 为节点添加编组标记
    nodeIds.forEach(nodeId => {
      updateNodeData(nodeId, {
        groupId: groupId,
        groupColor: colorScheme.bg
      })
    })
    
    console.log(`[Canvas Store] 已创建编组 "${name}"，包含 ${nodeIds.length} 个节点`)
    return group
  }
  
  /**
   * 解散编组
   */
  function disbandGroup(groupId) {
    const group = nodeGroups.value.find(g => g.id === groupId)
    if (!group) return
    
    saveHistory()
    
    // 移除节点的编组标记，恢复可拖拽
    group.nodeIds.forEach(nodeId => {
      const node = nodes.value.find(n => n.id === nodeId)
      if (node) {
        // 恢复节点的可拖拽状态
        node.draggable = true
        // 移除编组标记
        updateNodeData(nodeId, {
          groupId: null,
          groupColor: null
        })
      }
    })
    
    // 移除编组
    nodeGroups.value = nodeGroups.value.filter(g => g.id !== groupId)
    
    console.log(`[Canvas Store] 已解散编组 "${group.name}"`)
  }
  
  return {
    // 状态
    nodes,
    edges,
    viewport,
    selectedNodeId,
    selectedEdgeId,
    selectedNodeIds,
    selectedNode,
    isEmpty,
    nodeCount,
    
    // 历史记录状态
    canUndo,
    canRedo,
    hasClipboard,
    
    // 编组状态
    nodeGroups,
    
    // UI 状态
    isNodeSelectorOpen,
    nodeSelectorPosition,
    nodeSelectorFlowPosition,
    nodeSelectorTrigger,
    triggerNodeId,
    isContextMenuOpen,
    contextMenuPosition,
    contextMenuTargetNode,
    isCanvasContextMenuOpen,
    canvasContextMenuPosition,
    isBottomPanelVisible,
    
    // 节点操作
    addNode,
    updateNodeData,
    updateNodePosition,
    removeNode,
    selectNode,
    clearSelection,
    
    // 连线操作
    addEdge,
    removeEdge,
    propagateData,
    
    // 历史记录操作
    saveHistory,
    undo,
    redo,
    
    // 剪贴板操作
    copySelectedNodes,
    pasteNodes,
    selectAllNodes,
    setSelectedNodeIds,
    
    // 编组操作
    createGroup,
    disbandGroup,
    
    // UI 操作
    openNodeSelector,
    closeNodeSelector,
    openContextMenu,
    closeContextMenu,
    openCanvasContextMenu,
    closeCanvasContextMenu,
    closeAllContextMenus,
    updateViewport,
    
    // 待连接连线
    pendingConnection,
    setPendingConnection,
    clearPendingConnection,
    
    // 拖拽连线
    isDraggingConnection,
    dragConnectionSource,
    dragConnectionPosition,
    preventSelectorClose,
    startDragConnection,
    updateDragConnectionPosition,
    endDragConnection,
    cancelDragConnection,
    
    // 工作流操作
    clearCanvas,
    loadWorkflow,
    exportWorkflow,
    
    // 工具函数
    getUpstreamNodes,
    getDownstreamNodes
  }
})

