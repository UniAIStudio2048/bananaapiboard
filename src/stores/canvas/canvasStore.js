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
  const maxHistoryLength = 20      // 🔧 进一步减小历史记录数，大画布性能优化
  const isHistoryAction = ref(false) // 是否正在执行历史操作（防止重复记录）
  let lastHistorySaveTime = 0      // 🔧 上次保存历史的时间（节流用）
  const HISTORY_THROTTLE_MS = 500  // 🔧 历史保存最小间隔（毫秒）- 增加到500ms减少内存压力
  
  // ========== 剪贴板 ==========
  const clipboard = ref(null)      // 复制的节点数据
  
  // ========== 图片编辑模式状态 ==========
  const editingNodeId = ref(null)        // 当前正在编辑的节点ID
  const editTool = ref(null)             // 当前编辑工具: 'repaint' | 'erase' | 'crop' | 'annotate' | null
  const editModeViewport = ref(null)     // 进入编辑模式前的视口状态（用于退出时恢复）
  
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
  
  // ========== 工作流元信息 ==========
  const workflowMeta = ref(null) // { id, name, description }
  
  // ========== 多标签状态 ==========
  const workflowTabs = ref([]) // 工作流标签列表 [{ id, name, workflowId, nodes, edges, viewport, hasChanges }]
  const activeTabId = ref(null) // 当前活动标签ID
  const maxTabs = 10 // 最大标签数量
  
  // ========== 计算属性 ==========
  const selectedNode = computed(() => {
    if (!selectedNodeId.value) return null
    return nodes.value.find(n => n.id === selectedNodeId.value)
  })
  
  const isEmpty = computed(() => nodes.value.length === 0)
  
  const nodeCount = computed(() => nodes.value.length)
  
  // 🔧 大画布性能模式计算属性
  // 用于自动启用简化渲染，提升70-100+节点时的流畅性
  const isLargeCanvas = computed(() => nodes.value.length > 30)  // 30+节点算大画布
  const isVeryLargeCanvas = computed(() => nodes.value.length > 60) // 60+节点算超大画布
  const performanceMode = computed(() => {
    const count = nodes.value.length
    if (count > 80) return 'minimal'  // 最小化渲染模式
    if (count > 50) return 'reduced'  // 简化渲染模式
    if (count > 30) return 'optimized' // 优化渲染模式
    return 'full' // 完整渲染模式
  })
  
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
    // 如果没有工作流标签，先自动创建一个
    if (workflowTabs.value.length === 0) {
      createTab()
    }
    
    if (!skipHistory) {
      saveHistory() // 保存历史
    }
    
    // 标记当前标签有变更
    markCurrentTabChanged()
    
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
    markCurrentTabChanged() // 标记变更
    
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
   * 🔧 清理节点数据用于历史记录（移除大型 base64 数据减少内存）
   */
  function cleanNodeForHistory(node) {
    const cleaned = { ...node }
    if (cleaned.data) {
      cleaned.data = { ...cleaned.data }
      // 移除可能很大的 base64 图片数据，只保留 URL 引用
      if (cleaned.data.sourceImages) {
        cleaned.data.sourceImages = cleaned.data.sourceImages.filter(url => 
          typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')
        )
      }
      // 清理 output 中的大数据
      if (cleaned.data.output) {
        cleaned.data.output = { ...cleaned.data.output }
        if (cleaned.data.output.urls) {
          cleaned.data.output.urls = cleaned.data.output.urls.filter(url =>
            typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')
          )
        }
      }
      // 移除临时大数据字段
      delete cleaned.data.imageData
      delete cleaned.data.base64
      delete cleaned.data.previewData
    }
    return cleaned
  }

  /**
   * 保存当前状态到历史记录
   * 🔧 优化：添加节流和数据清理，减少内存占用
   * 🔧 大画布优化：节点越多，历史越少，节流越长
   */
  function saveHistory() {
    // 如果正在执行历史操作，不保存
    if (isHistoryAction.value) return
    
    const nodeCount = nodes.value.length
    
    // 🔧 大画布性能优化：节点越多，节流时间越长
    let dynamicThrottle = HISTORY_THROTTLE_MS
    if (nodeCount > 80) {
      dynamicThrottle = 2000  // 80+节点：2秒节流
    } else if (nodeCount > 50) {
      dynamicThrottle = 1000  // 50-80节点：1秒节流
    } else if (nodeCount > 30) {
      dynamicThrottle = 800   // 30-50节点：800ms节流
    }
    
    // 🔧 节流：避免频繁保存历史
    const now = Date.now()
    if (now - lastHistorySaveTime < dynamicThrottle) {
      return
    }
    lastHistorySaveTime = now
    
    // 🔧 节点过多时大幅减少历史记录数量
    let effectiveMaxHistory = maxHistoryLength
    if (nodeCount > 80) {
      effectiveMaxHistory = 5   // 80+节点：只保留5条历史
    } else if (nodeCount > 50) {
      effectiveMaxHistory = 8   // 50-80节点：保留8条历史
    } else if (nodeCount > 30) {
      effectiveMaxHistory = 12  // 30-50节点：保留12条历史
    }
    
    // 🔧 清理节点数据，移除大型 base64 减少内存
    const cleanedNodes = nodes.value.map(cleanNodeForHistory)
    
    const state = {
      nodes: JSON.parse(JSON.stringify(cleanedNodes)),
      edges: JSON.parse(JSON.stringify(edges.value))
    }
    
    // 如果当前不在历史末尾，删除后面的记录
    if (historyIndex.value < historyStack.value.length - 1) {
      historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
    }
    
    // 添加新记录
    historyStack.value.push(state)
    
    // 限制历史记录长度
    while (historyStack.value.length > effectiveMaxHistory) {
      historyStack.value.shift()
      // 调整索引
      if (historyIndex.value > 0) {
        historyIndex.value--
      }
    }
    
    historyIndex.value = historyStack.value.length - 1
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

  /**
   * 🔧 清空历史记录（释放内存）
   */
  function clearHistory() {
    historyStack.value = []
    historyIndex.value = -1
    console.log('[Canvas Store] 历史记录已清空，释放内存')
  }

  /**
   * 🔧 获取内存使用估算（用于调试和监控）
   */
  function getMemoryStats() {
    const nodesSize = JSON.stringify(nodes.value).length
    const edgesSize = JSON.stringify(edges.value).length
    const historySize = JSON.stringify(historyStack.value).length
    const clipboardSize = clipboard.value ? JSON.stringify(clipboard.value).length : 0
    
    return {
      nodeCount: nodes.value.length,
      edgeCount: edges.value.length,
      historyCount: historyStack.value.length,
      estimatedMemoryKB: Math.round((nodesSize + edgesSize + historySize + clipboardSize) / 1024),
      breakdown: {
        nodesKB: Math.round(nodesSize / 1024),
        edgesKB: Math.round(edgesSize / 1024),
        historyKB: Math.round(historySize / 1024),
        clipboardKB: Math.round(clipboardSize / 1024)
      }
    }
  }

  // 🔧 节点数量阈值警告（降低阈值以提前警告用户，保证70-100节点时的流畅性）
  const NODE_WARNING_THRESHOLD = 50   // 50节点时开始警告
  const NODE_CRITICAL_THRESHOLD = 100 // 100节点时进入危险区域
  
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
  
  // ========== 图片编辑模式操作 ==========
  
  /**
   * 进入图片编辑模式
   * @param {String} nodeId - 要编辑的节点ID
   * @param {String} tool - 编辑工具类型: 'repaint' | 'erase' | 'crop' | 'annotate' | 'enhance' | 'cutout' | 'expand'
   */
  function enterEditMode(nodeId, tool) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) {
      console.warn('[Canvas] 无法进入编辑模式：节点不存在', nodeId)
      return false
    }
    
    // 保存当前视口状态（用于退出时恢复）
    editModeViewport.value = { ...viewport.value }
    
    // 设置编辑状态
    editingNodeId.value = nodeId
    editTool.value = tool
    
    // 选中该节点
    selectNode(nodeId)
    
    console.log('[Canvas] 进入编辑模式', { nodeId, tool })
    return true
  }
  
  /**
   * 退出图片编辑模式
   * @param {Boolean} restoreViewport - 是否恢复之前的视口状态
   */
  function exitEditMode(restoreViewport = true) {
    if (!editingNodeId.value) return
    
    console.log('[Canvas] 退出编辑模式', editingNodeId.value)
    
    // 恢复视口状态
    if (restoreViewport && editModeViewport.value) {
      viewport.value = { ...editModeViewport.value }
    }
    
    // 清除编辑状态
    editingNodeId.value = null
    editTool.value = null
    editModeViewport.value = null
  }
  
  /**
   * 切换编辑工具
   * @param {String} tool - 新的编辑工具
   */
  function switchEditTool(tool) {
    if (!editingNodeId.value) return
    editTool.value = tool
    console.log('[Canvas] 切换编辑工具', tool)
  }
  
  /**
   * 检查是否处于编辑模式
   */
  const isInEditMode = computed(() => editingNodeId.value !== null)
  
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
   * 加载工作流（优化版：骨架先行，媒体异步加载）
   * 策略：先显示节点结构，然后异步加载图片/视频，提升流畅度
   */
  function loadWorkflow(workflow) {
    const workflowNodes = workflow.nodes || []
    const workflowEdges = workflow.edges || []
    
    // 1. 先创建骨架节点（移除大型媒体数据，加快首次渲染）
    const skeletonNodes = workflowNodes.map(node => {
      // 深拷贝节点，但标记媒体数据为"加载中"
      const skeletonNode = JSON.parse(JSON.stringify(node))
      
      // 保存原始媒体数据的引用（用于异步加载）
      const hasMediaData = skeletonNode.data && (
        skeletonNode.data.sourceImages?.length > 0 ||
        skeletonNode.data.output?.url ||
        skeletonNode.data.output?.urls?.length > 0
      )
      
      if (hasMediaData) {
        // 标记为加载中状态
        skeletonNode.data._mediaLoading = true
        skeletonNode.data._originalMedia = {
          sourceImages: skeletonNode.data.sourceImages,
          output: skeletonNode.data.output
        }
        // 临时清空媒体数据（骨架模式）
        skeletonNode.data.sourceImages = []
        if (skeletonNode.data.output) {
          skeletonNode.data.output = { ...skeletonNode.data.output, url: null, urls: [] }
        }
      }
      
      return skeletonNode
    })
    
    // 2. 立即显示骨架结构
    nodes.value = skeletonNodes
    edges.value = workflowEdges
    if (workflow.viewport) {
      viewport.value = workflow.viewport
    }
    
    // 3. 异步填充媒体数据（分批处理，避免卡顿）
    const nodesWithMedia = skeletonNodes.filter(n => n.data?._mediaLoading)
    if (nodesWithMedia.length > 0) {
      // 使用 requestIdleCallback 或 setTimeout 异步加载
      const loadMediaBatch = (startIndex) => {
        const batchSize = 3 // 每批加载3个节点
        const endIndex = Math.min(startIndex + batchSize, nodesWithMedia.length)
        
        for (let i = startIndex; i < endIndex; i++) {
          const node = nodesWithMedia[i]
          const nodeIndex = nodes.value.findIndex(n => n.id === node.id)
          if (nodeIndex !== -1 && node.data._originalMedia) {
            // 恢复媒体数据
            const updatedNode = { ...nodes.value[nodeIndex] }
            updatedNode.data = {
              ...updatedNode.data,
              sourceImages: node.data._originalMedia.sourceImages || [],
              output: node.data._originalMedia.output || updatedNode.data.output,
              _mediaLoading: false
            }
            delete updatedNode.data._originalMedia
            nodes.value[nodeIndex] = updatedNode
          }
        }
        
        // 继续加载下一批
        if (endIndex < nodesWithMedia.length) {
          requestAnimationFrame(() => {
            setTimeout(() => loadMediaBatch(endIndex), 50)
          })
        }
      }
      
      // 延迟启动媒体加载，让骨架先渲染
      requestAnimationFrame(() => {
        setTimeout(() => loadMediaBatch(0), 100)
      })
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
  
  // ========== 多标签操作 ==========
  
  /**
   * 生成标签ID
   */
  function generateTabId() {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
  }
  
  /**
   * 创建新标签
   */
  function createTab(workflow = null) {
    // 检查标签数量限制
    if (workflowTabs.value.length >= maxTabs) {
      console.warn(`[Canvas] 已达到最大标签数量 ${maxTabs}`)
      return null
    }
    
    const tabId = generateTabId()
    const tab = {
      id: tabId,
      name: workflow?.name || '新工作流',
      workflowId: workflow?.id || null,
      nodes: workflow?.nodes || [],
      edges: workflow?.edges || [],
      viewport: workflow?.viewport || { x: 0, y: 0, zoom: 1 },
      hasChanges: false
    }
    
    workflowTabs.value.push(tab)
    
    // 切换到新标签
    switchToTab(tabId)
    
    return tab
  }
  
  /**
   * 切换标签
   */
  function switchToTab(tabId) {
    const currentTab = workflowTabs.value.find(t => t.id === activeTabId.value)
    const targetTab = workflowTabs.value.find(t => t.id === tabId)
    
    if (!targetTab) return
    
    // 保存当前标签的状态
    if (currentTab) {
      currentTab.nodes = JSON.parse(JSON.stringify(nodes.value))
      currentTab.edges = JSON.parse(JSON.stringify(edges.value))
      currentTab.viewport = { ...viewport.value }
    }
    
    // 切换到目标标签
    activeTabId.value = tabId
    nodes.value = JSON.parse(JSON.stringify(targetTab.nodes))
    edges.value = JSON.parse(JSON.stringify(targetTab.edges))
    viewport.value = { ...targetTab.viewport }
    
    // 更新工作流元信息
    workflowMeta.value = targetTab.workflowId ? {
      id: targetTab.workflowId,
      name: targetTab.name,
      description: ''
    } : null
    
    // 清空选择
    selectedNodeId.value = null
    selectedEdgeId.value = null
    selectedNodeIds.value = []
  }
  
  /**
   * 关闭标签
   */
  function closeTab(tabId) {
    const index = workflowTabs.value.findIndex(t => t.id === tabId)
    if (index === -1) return
    
    // 如果是最后一个标签，清空画布并关闭所有标签（显示首页）
    if (workflowTabs.value.length === 1) {
      // 清空画布
      nodes.value = []
      edges.value = []
      viewport.value = { x: 0, y: 0, zoom: 1 }
      selectedNodeId.value = null
      selectedEdgeId.value = null
      selectedNodeIds.value = []
      workflowMeta.value = null
      
      // 清空标签列表
      workflowTabs.value = []
      activeTabId.value = null
      
      console.log('[Canvas] 已关闭最后一个标签，返回首页')
      return
    }
    
    // 如果关闭的是当前标签，切换到相邻标签
    if (tabId === activeTabId.value) {
      const nextIndex = index === workflowTabs.value.length - 1 ? index - 1 : index + 1
      switchToTab(workflowTabs.value[nextIndex].id)
    }
    
    // 移除标签
    workflowTabs.value.splice(index, 1)
  }
  
  /**
   * 更新当前标签名称
   */
  function updateCurrentTabName(name) {
    const currentTab = workflowTabs.value.find(t => t.id === activeTabId.value)
    if (currentTab) {
      currentTab.name = name
    }
  }
  
  /**
   * 更新指定标签名称
   */
  function updateTabName(tabId, name) {
    const tab = workflowTabs.value.find(t => t.id === tabId)
    if (tab) {
      tab.name = name
      // 如果是当前标签，也更新 workflowMeta
      if (tabId === activeTabId.value && workflowMeta.value) {
        workflowMeta.value.name = name
      }
    }
  }
  
  /**
   * 重排序标签
   */
  function reorderTabs(fromIndex, toIndex) {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= workflowTabs.value.length) return
    if (toIndex < 0 || toIndex >= workflowTabs.value.length) return
    
    const tabs = [...workflowTabs.value]
    const [removed] = tabs.splice(fromIndex, 1)
    tabs.splice(toIndex, 0, removed)
    workflowTabs.value = tabs
  }
  
  /**
   * 标记当前标签有变更
   */
  function markCurrentTabChanged() {
    const currentTab = workflowTabs.value.find(t => t.id === activeTabId.value)
    if (currentTab) {
      currentTab.hasChanges = true
    }
  }
  
  /**
   * 标记当前标签已保存
   */
  function markCurrentTabSaved(workflowId = null) {
    const currentTab = workflowTabs.value.find(t => t.id === activeTabId.value)
    if (currentTab) {
      currentTab.hasChanges = false
      if (workflowId) {
        currentTab.workflowId = workflowId
      }
    }
  }
  
  /**
   * 在新标签中打开工作流
   */
  function openWorkflowInNewTab(workflow) {
    // 只有当 workflow.id 存在时才检查是否已经打开
    // 历史工作流的 id 是 null，不应该匹配到其他 null id 的标签
    if (workflow.id) {
      const existingTab = workflowTabs.value.find(t => t.workflowId === workflow.id)
      if (existingTab) {
        switchToTab(existingTab.id)
        return existingTab
      }
    }
    
    // 创建新标签
    return createTab(workflow)
  }
  
  /**
   * 初始化默认标签（如果没有标签时调用）
   */
  function initDefaultTab() {
    if (workflowTabs.value.length === 0) {
      createTab()
    }
  }
  
  /**
   * 获取当前标签
   */
  function getCurrentTab() {
    return workflowTabs.value.find(t => t.id === activeTabId.value)
  }
  
  /**
   * 合并工作流到当前画布（拖拽合并）
   * @param {Object} workflow - 要合并的工作流数据
   * @param {Object} dropPosition - 放置位置（画布坐标）
   */
  function mergeWorkflowToCanvas(workflow, dropPosition = { x: 100, y: 100 }) {
    if (!workflow) return
    
    console.log('[Canvas] 合并工作流到画布:', workflow.name, '位置:', dropPosition)
    
    // 如果没有标签，先创建一个
    if (workflowTabs.value.length === 0) {
      createTab()
    }
    
    saveHistory() // 保存历史用于撤销
    
    const workflowNodes = workflow.nodes || []
    const workflowEdges = workflow.edges || []
    
    if (workflowNodes.length === 0) {
      console.log('[Canvas] 工作流没有节点，跳过合并')
      return
    }
    
    // 计算工作流节点的边界框
    let minX = Infinity, minY = Infinity
    workflowNodes.forEach(node => {
      if (node.position) {
        minX = Math.min(minX, node.position.x)
        minY = Math.min(minY, node.position.y)
      }
    })
    
    // 计算偏移量，使工作流放置到 dropPosition
    const offsetX = dropPosition.x - minX
    const offsetY = dropPosition.y - minY
    
    // ID 映射表（旧ID -> 新ID）
    const idMap = {}
    
    // 添加节点（使用新的ID并应用偏移）
    workflowNodes.forEach(node => {
      const oldId = node.id
      const newId = generateId()
      idMap[oldId] = newId
      
      const newNode = {
        ...node,
        id: newId,
        position: {
          x: (node.position?.x || 0) + offsetX,
          y: (node.position?.y || 0) + offsetY
        }
      }
      
      // 深拷贝 data
      if (node.data) {
        newNode.data = JSON.parse(JSON.stringify(node.data))
      }
      
      nodes.value.push(newNode)
    })
    
    // 添加连线（更新 source 和 target 为新ID）
    workflowEdges.forEach(edge => {
      const newSourceId = idMap[edge.source]
      const newTargetId = idMap[edge.target]
      
      if (newSourceId && newTargetId) {
        const newEdge = {
          ...edge,
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          source: newSourceId,
          target: newTargetId
        }
        edges.value.push(newEdge)
      }
    })
    
    // 标记当前标签有变更
    markCurrentTabChanged()
    
    console.log('[Canvas] 合并完成，新增节点:', workflowNodes.length, '新增连线:', workflowEdges.length)
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
    
    // 🔧 大画布性能模式状态
    isLargeCanvas,
    isVeryLargeCanvas,
    performanceMode,
    
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
    clearHistory,
    getMemoryStats,
    NODE_WARNING_THRESHOLD,
    NODE_CRITICAL_THRESHOLD,
    
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
    
    // 图片编辑模式
    editingNodeId,
    editTool,
    editModeViewport,
    isInEditMode,
    enterEditMode,
    exitEditMode,
    switchEditTool,
    
    // 工作流操作
    workflowMeta,
    clearCanvas,
    loadWorkflow,
    exportWorkflow,
    
    // 多标签操作
    workflowTabs,
    activeTabId,
    maxTabs,
    createTab,
    switchToTab,
    closeTab,
    updateCurrentTabName,
    updateTabName,
    reorderTabs,
    markCurrentTabChanged,
    markCurrentTabSaved,
    openWorkflowInNewTab,
    initDefaultTab,
    getCurrentTab,
    mergeWorkflowToCanvas,
    
    // 工具函数
    getUpstreamNodes,
    getDownstreamNodes
  }
})

