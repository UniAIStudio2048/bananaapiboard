/**
 * Canvas Store - 画布状态管理
 * 管理节点、连线、视口状态等
 */
import { defineStore } from 'pinia'
import { ref, computed, watch, toRaw, nextTick } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { t } from '@/i18n'
import { useTeamStore } from '@/stores/team'

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
  const dragConnectionStartPosition = ref({ x: 0, y: 0 }) // 拖拽连线的起始位置（画布坐标，+号按钮位置）
  const dragConnectionPosition = ref({ x: 0, y: 0 }) // 拖拽连线的当前位置（画布坐标，鼠标位置）
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

  // 边索引：按 target 节点 ID 分组的边映射，O(1) 查找上游连接
  const edgesByTarget = computed(() => {
    const map = new Map()
    for (const edge of edges.value) {
      if (!map.has(edge.target)) {
        map.set(edge.target, [])
      }
      map.get(edge.target).push(edge)
    }
    return map
  })

  // 边索引：按 source 节点 ID 分组的边映射
  const edgesBySource = computed(() => {
    const map = new Map()
    for (const edge of edges.value) {
      if (!map.has(edge.source)) {
        map.set(edge.source, [])
      }
      map.get(edge.source).push(edge)
    }
    return map
  })

  // 节点索引：按 ID 快速查找
  const nodesById = computed(() => {
    const map = new Map()
    for (const node of nodes.value) {
      map.set(node.id, node)
    }
    return map
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
      console.warn('[Store] addNode 消费了 triggerNodeId:', triggerNodeId.value, '新节点:', newNode.id, '调用栈:', new Error().stack?.split('\n').slice(1, 4).join(' <- '))
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
    
    // 删除相关连线（通过 removeEdge 逐条删除，确保 Storyboard 格子图片同步清理）
    const edgesToRemove = edges.value.filter(
      e => e.source === nodeId || e.target === nodeId
    )
    edgesToRemove.forEach(e => removeEdge(e.id))
    
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
      id: edge.id || (
        (edge.targetHandle && edge.targetHandle.startsWith('input-'))
          ? `e-${edge.source}-${edge.target}-${edge.targetHandle}`
          : `e-${edge.source}-${edge.target}`
      ),
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || 'output',
      targetHandle: edge.targetHandle || 'input',
      animated: false
    }

    // 🔧 Storyboard 格子级输入：同一个 targetHandle 只允许一条入边（新的覆盖旧的）
    // 这样从外部拖入新图片到某个格子时，会替换该格子的“上游来源”
    if (
      typeof newEdge.targetHandle === 'string' &&
      newEdge.targetHandle.startsWith('input-')
    ) {
      // 通过 removeEdge 逐条删除旧边，确保对应格子图片同步清理后再写入新图片
      const oldCellEdges = edges.value.filter(e =>
        e.target === newEdge.target && e.targetHandle === newEdge.targetHandle
      )
      oldCellEdges.forEach(e => removeEdge(e.id))
    }
    
    // 检查是否已存在（同 source/target/handle 的重复边）
    const exists = edges.value.some(
      e => e.source === newEdge.source &&
           e.target === newEdge.target &&
           e.sourceHandle === newEdge.sourceHandle &&
           e.targetHandle === newEdge.targetHandle
    )
    
    if (!exists) {
      edges.value.push(newEdge)
      
      // 自动传递数据（包含 Storyboard 格子级替换）
      propagateData(edge.source, edge.target, newEdge.targetHandle)
    }
    
    return newEdge
  }
  
  /**
   * 删除连线
   */
  function removeEdge(edgeId) {
    // 在删除前查找边的信息，用于清理 Storyboard 格子图片
    const edge = edges.value.find(e => e.id === edgeId)

    // 先从数组中移除该边
    edges.value = edges.value.filter(e => e.id !== edgeId)

    // Storyboard 连线删除后：清除所有"没有对应连线"的格子图片
    // 解决批量写入场景（如"创建分镜格子"9张图只有1条连线）导致旧图片残留的问题
    if (edge && edge.target) {
      const targetNode = nodes.value.find(n => n.id === edge.target)
      if (targetNode?.type === 'storyboard' && Array.isArray(targetNode.data.images)) {
        // 收集该 storyboard 节点当前仍存活的所有入边的 targetHandle
        const aliveHandles = new Set(
          edges.value
            .filter(e => e.target === edge.target && typeof e.targetHandle === 'string' && e.targetHandle.startsWith('input-'))
            .map(e => e.targetHandle)
        )
        // 遍历所有格子，没有对应连线的格子清空图片
        const nextImages = [...targetNode.data.images]
        let changed = false
        for (let i = 0; i < nextImages.length; i++) {
          if (nextImages[i] && !aliveHandles.has(`input-${i}`)) {
            nextImages[i] = null
            changed = true
          }
        }
        if (changed) {
          updateNodeData(edge.target, { images: nextImages })
        }
      }
    }
  }

  /**
   * 断开节点的所有输入连线
   * @param {string} nodeId 节点ID
   */
  function disconnectNodeInputs(nodeId) {
    const edgesToRemove = edges.value.filter(e => e.target === nodeId)
    if (edgesToRemove.length > 0) {
      edgesToRemove.forEach(e => removeEdge(e.id))
      markCurrentTabChanged()
      saveHistory()
    }
  }

  /**
   * 断开节点指定 targetHandle 的输入连线
   * @param {string} nodeId 节点ID
   * @param {string} targetHandle 目标端口ID，如 'input-4'
   */
  function disconnectNodeHandle(nodeId, targetHandle) {
    const edgesToRemove = edges.value.filter(e => e.target === nodeId && e.targetHandle === targetHandle)
    if (edgesToRemove.length > 0) {
      edgesToRemove.forEach(e => removeEdge(e.id))
      markCurrentTabChanged()
      saveHistory()
    }
  }

  /**
   * 交换 Storyboard 两个格子对应的连线 targetHandle
   * 当用户在编辑模式下拖拽交换格子图片时，连线也必须跟着交换，
   * 否则 clearCell 按当前格子索引断线时会找不到对应连线。
   * @param {string} nodeId  Storyboard 节点 ID
   * @param {number} idxA    格子索引 A
   * @param {number} idxB    格子索引 B
   */
  function swapCellEdges(nodeId, idxA, idxB) {
    const handleA = `input-${idxA}`
    const handleB = `input-${idxB}`

    // 找到两个格子各自的入边
    const edgeA = edges.value.find(e => e.target === nodeId && e.targetHandle === handleA)
    const edgeB = edges.value.find(e => e.target === nodeId && e.targetHandle === handleB)

    // 交换 targetHandle 和 id
    if (edgeA) {
      edgeA.targetHandle = handleB
      edgeA.id = `e-${edgeA.source}-${nodeId}-${handleB}`
    }
    if (edgeB) {
      edgeB.targetHandle = handleA
      edgeB.id = `e-${edgeB.source}-${nodeId}-${handleA}`
    }
  }

  /**
   * 数据传递：从源节点传递输出到目标节点
   */
  function propagateData(sourceId, targetId, targetHandle = null) {
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
    
    // ========== Storyboard 图片填充 ==========
    // 从源节点提取第一张图片 URL 的通用逻辑
    if (targetNode.type === 'storyboard') {
      let pickedUrl = null

      if (inheritedData?.type === 'image') {
        pickedUrl = inheritedData.urls?.[0] || inheritedData.url || null
      } else if (typeof inheritedData?.url === 'string') {
        pickedUrl = inheritedData.url
      } else if (Array.isArray(inheritedData?.urls) && inheritedData.urls.length > 0) {
        pickedUrl = inheritedData.urls[0]
      }

      if (!pickedUrl) {
        if (sourceNode.data.output?.urls?.length > 0) pickedUrl = sourceNode.data.output.urls[0]
        else if (sourceNode.data.output?.url) pickedUrl = sourceNode.data.output.url
        else if (sourceNode.data.sourceImages?.length > 0) pickedUrl = sourceNode.data.sourceImages[0]
        else if (sourceNode.data.images?.length > 0) pickedUrl = sourceNode.data.images[0]
      }

      if (pickedUrl) {
        const nextImages = Array.isArray(targetNode.data.images)
          ? [...targetNode.data.images]
          : []

        // 确定目标格子索引
        let idx = -1
        if (typeof targetHandle === 'string' && targetHandle.startsWith('input-')) {
          // 格子级连线：填入指定格子
          idx = Number(targetHandle.slice('input-'.length))
        }
        if (!Number.isFinite(idx) || idx < 0) {
          // 节点级连线（input）或无效索引：填入第一个空格子
          idx = nextImages.findIndex(cell => cell === null || cell === undefined)
          if (idx === -1) {
            // 所有格子都满了，追加到末尾
            idx = nextImages.length
          }
        }

        while (nextImages.length <= idx) nextImages.push(null)
        nextImages[idx] = pickedUrl

        // 如果原始连线使用的是通用 'input' handle，将其升级为格子级 'input-{idx}'
        // 这样 clearCell 删除图片时能正确找到并断开对应连线
        const cellHandle = `input-${idx}`
        if (targetHandle !== cellHandle) {
          const edgeToUpdate = edges.value.find(
            e => e.source === sourceId && e.target === targetId && e.targetHandle === (targetHandle || 'input')
          )
          if (edgeToUpdate) {
            edgeToUpdate.targetHandle = cellHandle
            // 同步更新 edge ID 以包含格子信息
            edgeToUpdate.id = `e-${sourceId}-${targetId}-${cellHandle}`
          }
        }

        updateNodeData(targetId, {
          images: nextImages,
          inheritedFrom: sourceId,
          inheritedData,
          hasUpstream: true
        })
        return
      }
    }

    // ========== 图像→文本节点：自动切换为图片反推预设 ==========
    const isImageSource = ['image-input', 'image', 'image-gen', 'text-to-image', 'image-to-image'].includes(sourceNode.type)
    const isTextTarget = targetNode.type === 'text-input' || targetNode.type === 'text'
    const autoPresetData = (isImageSource && isTextTarget) ? { autoPreset: 'image-describe' } : {}

    // ========== 默认连接数据传递 ==========
    if (inheritedData) {
      updateNodeData(targetId, {
        inheritedFrom: sourceId,
        inheritedData: inheritedData,
        hasUpstream: true,
        ...autoPresetData
      })
    } else {
      updateNodeData(targetId, {
        inheritedFrom: sourceId,
        hasUpstream: true,
        ...autoPresetData
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
    const cleanedNodes = nodes.value.map(n => cleanNodeForHistory(toRaw(n)))

    // 🚀 使用 JSON 深拷贝（Vue Proxy 对象与 structuredClone 不兼容）
    const state = {
      nodes: JSON.parse(JSON.stringify(cleanedNodes)),
      edges: JSON.parse(JSON.stringify(toRaw(edges.value)))
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
   * 🔧 裁剪历史记录（释放内存，保留最近N个操作）
   * @param {number} keepCount - 保留的历史记录数量，默认5个
   */
  function trimHistory(keepCount = 5) {
    const currentLength = historyStack.value.length
    if (currentLength <= keepCount) {
      console.log(`[Canvas Store] 历史记录数量 (${currentLength}) 未超过保留数量 (${keepCount})，无需裁剪`)
      return
    }
    
    // 计算需要删除的数量
    const removeCount = currentLength - keepCount
    
    // 从前面删除旧的历史记录
    historyStack.value = historyStack.value.slice(removeCount)
    
    // 调整当前索引
    historyIndex.value = Math.max(0, historyIndex.value - removeCount)
    
    console.log(`[Canvas Store] 历史记录已裁剪: 删除 ${removeCount} 条，保留最近 ${keepCount} 条`)
  }

  /**
   * 🔧 清空历史记录（完全清空，释放所有内存）
   */
  function clearHistory() {
    historyStack.value = []
    historyIndex.value = -1
    console.log('[Canvas Store] 历史记录已完全清空，释放内存')
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
    const upstreamEdges = []
    
    if (selectedNodeIds.value.length > 0) {
      nodesToCopy.push(...nodes.value.filter(n => selectedNodeIds.value.includes(n.id)))
    } else if (selectedNodeId.value) {
      const node = nodes.value.find(n => n.id === selectedNodeId.value)
      if (node) nodesToCopy.push(node)
    }
    
    if (nodesToCopy.length === 0) return
    
    const nodeIds = nodesToCopy.map(n => n.id)

    for (const e of edges.value) {
      if (nodeIds.includes(e.source) && nodeIds.includes(e.target)) {
        edgesToCopy.push(e)
      } else if (nodeIds.includes(e.target) && !nodeIds.includes(e.source)) {
        upstreamEdges.push(e)
      }
    }
    
    clipboard.value = {
      nodes: JSON.parse(JSON.stringify(nodesToCopy)),
      edges: JSON.parse(JSON.stringify(edgesToCopy)),
      upstreamEdges: JSON.parse(JSON.stringify(upstreamEdges))
    }
    
    console.log(`[Canvas] 已复制 ${nodesToCopy.length} 个节点，${upstreamEdges.length} 条上游连线`)
  }
  
  /**
   * 重置节点 data 中的生成状态，保留所有内容、参数和已有图片
   * 粘贴的节点始终为 idle 状态，但完整保留复制时刻的所有数据
   */
  function cleanNodeDataForPaste(data, nodeType) {
    const commonResets = {
      status: 'idle',
      error: null,
      progress: null,
      executeTriggered: false,
      triggeredByGroup: false,
    }

    const imageTypes = ['image', 'image-input', 'text-to-image', 'image-to-image', 'image-batch']
    const videoTypes = ['video', 'video-input', 'text-to-video', 'image-to-video', 'video-to-video']
    const audioTypes = ['audio', 'audio-input']

    let extraResets = {}

    if (imageTypes.includes(nodeType)) {
      extraResets = {
        isUploading: false,
        uploadFailed: false,
        _dataLost: false,
        _lostReason: null,
        stackedNodeIds: null,
        isStackParent: false,
        isStackedNode: false,
        stackIndex: null,
        parentNodeId: null,
        multiangleTaskId: null,
        needsFrameExtraction: false,
      }
    } else if (videoTypes.includes(nodeType)) {
      extraResets = {
        taskId: null,
        soraTaskId: null,
        _failedTaskId: null,
        pointsCost: null,
        localFile: null,
      }
    } else if (audioTypes.includes(nodeType)) {
      extraResets = {
        isUploading: false,
        uploadFailed: false,
        _dataLost: false,
        _lostReason: null,
        taskIds: null,
      }
    }

    Object.assign(data, commonResets, extraResets)
    return data
  }

  /**
   * 粘贴节点
   * @param {Object} position - 粘贴位置（画布坐标）
   */
  function pasteNodes(position = null) {
    if (!clipboard.value) return
    
    saveHistory()
    
    const { nodes: copiedNodes, edges: copiedEdges, upstreamEdges: copiedUpstream = [] } = clipboard.value
    const idMap = {}
    
    let offsetX = 50
    let offsetY = 50
    
    if (position && copiedNodes.length > 0) {
      const centerX = copiedNodes.reduce((sum, n) => sum + n.position.x, 0) / copiedNodes.length
      const centerY = copiedNodes.reduce((sum, n) => sum + n.position.y, 0) / copiedNodes.length
      offsetX = position.x - centerX
      offsetY = position.y - centerY
    }
    
    const newNodes = copiedNodes.map(node => {
      const newId = generateId()
      idMap[node.id] = newId
      
      const newNode = {
        ...JSON.parse(JSON.stringify(node)),
        id: newId,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY
        }
      }

      if (newNode.data) {
        cleanNodeDataForPaste(newNode.data, node.type)
      }

      return newNode
    })
    
    const newEdges = copiedEdges.map(edge => ({
      ...JSON.parse(JSON.stringify(edge)),
      id: `e-${idMap[edge.source]}-${idMap[edge.target]}`,
      source: idMap[edge.source],
      target: idMap[edge.target]
    }))

    // 上游连线：源节点仍存在于画布上时，自动连接到新粘贴的节点
    const existingNodeIds = new Set(nodes.value.map(n => n.id))
    for (const edge of copiedUpstream) {
      if (existingNodeIds.has(edge.source) && idMap[edge.target]) {
        newEdges.push({
          ...JSON.parse(JSON.stringify(edge)),
          id: `e-${edge.source}-${idMap[edge.target]}`,
          target: idMap[edge.target]
        })
      }
    }
    
    nodes.value.push(...newNodes)
    edges.value.push(...newEdges)
    
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
    nodes.value.forEach(n => {
      n.selected = true
    })
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
    console.log('[Store] openNodeSelector', { position, trigger, nodeId, flowPosition, hasPendingConn: !!pendingConn })
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
    console.log('[Store] closeNodeSelector', { wasOpen: isNodeSelectorOpen.value, triggerNodeId: triggerNodeId.value, stack: new Error().stack?.split('\n').slice(1, 4).join(' <- ') })
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
    // 因为 CanvasBoard 的 watch 会在 isDraggingConnection 变化时读取 dragConnectionStartPosition
    dragConnectionSource.value = { nodeId, handleId }
    dragConnectionStartPosition.value = startPosition  // 保存起始位置（+号按钮位置）
    dragConnectionPosition.value = startPosition  // 初始位置也设置为起始位置
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
   * @param {string|null} targetHandleId - 目标端口ID（如 'input-3'，用于 Storyboard 格子级连线）
   * @returns {Boolean} - 是否成功连接到节点
   */
  function endDragConnection(targetNode, endPosition, screenPosition, targetHandleId = null) {
    if (!isDraggingConnection.value || !dragConnectionSource.value) {
      isDraggingConnection.value = false
      dragConnectionSource.value = null
      return false
    }
    
    const sourceNodeId = dragConnectionSource.value.nodeId
    const sourceHandleId = dragConnectionSource.value.handleId
    
    if (targetNode && targetNode.id !== sourceNodeId) {
      // 成功连接到另一个节点
      // Storyboard 格子级连线：使用传入的 targetHandleId（如 'input-3'）
      const finalTargetHandle = targetHandleId || 'input'
      addEdge({
        source: sourceNodeId,
        target: targetNode.id,
        sourceHandle: sourceHandleId,
        targetHandle: finalTargetHandle
      })
      console.log('[Store] 拖拽连线成功', sourceNodeId, '->', targetNode.id, 'handle:', finalTargetHandle)
      
      // 清理状态
      isDraggingConnection.value = false
      dragConnectionSource.value = null
      dragConnectionStartPosition.value = { x: 0, y: 0 }
      dragConnectionPosition.value = { x: 0, y: 0 }
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
      dragConnectionStartPosition.value = { x: 0, y: 0 }
      dragConnectionPosition.value = { x: 0, y: 0 }
      return false
    }
  }
  
  /**
   * 取消拖拽连线
   */
  function cancelDragConnection() {
    isDraggingConnection.value = false
    dragConnectionSource.value = null
    dragConnectionStartPosition.value = { x: 0, y: 0 }
    dragConnectionPosition.value = { x: 0, y: 0 }
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
   * 创建骨架节点（剥离媒体数据，加快首次渲染）
   * 复用于 loadWorkflow 和 createTab
   */
  function safeDeepClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj))
    } catch (e) {
      console.error('[Canvas] 深拷贝失败:', e)
      return {}
    }
  }

  /**
   * 清理节点中 Vue Flow 运行时注入的内部属性，避免加载时状态冲突
   */
  function cleanVueFlowNodeProps(node) {
    const internalKeys = [
      'dimensions', 'computedPosition', 'handleBounds', 'initialized',
      'isParent', 'dragging', 'resizing', 'selected', 'events'
    ]
    for (const key of internalKeys) {
      delete node[key]
    }
    if (node.style && typeof node.style === 'object' && Object.keys(node.style).length === 0) {
      delete node.style
    }
    if (node.zIndex === undefined || node.zIndex === 0) {
      delete node.zIndex
    }
    return node
  }

  function createSkeletonNodes(rawNodes) {
    return rawNodes
      .filter(node => {
        // 过滤掉已标记为数据丢失的节点
        if (node.data?._dataLost) {
          console.log(`[Canvas] 移除数据丢失节点: ${node.id} (${node.data._lostReason || '上传未完成'})`)
          return false
        }
        // 过滤掉仍在上传中但没有有效媒体的节点
        if (node.data?.isUploading) {
          const hasValidMedia = (node.data.sourceImages?.some(u => u && !u.startsWith('blob:') && !u.startsWith('data:'))) ||
            (node.data.output?.url && !node.data.output.url.startsWith('blob:')) ||
            (node.data.output?.urls?.some(u => u && !u.startsWith('blob:'))) ||
            (node.data.audioUrl && !node.data.audioUrl.startsWith('blob:')) ||
            (node.data.sourceVideo && !node.data.sourceVideo.startsWith('blob:'))
          if (!hasValidMedia) {
            console.log(`[Canvas] 移除上传未完成节点: ${node.id}`)
            return false
          }
        }
        return true
      })
      .map(node => {
        const skeletonNode = cleanVueFlowNodeProps(safeDeepClone(node))
      
        if (skeletonNode.data) {
          delete skeletonNode.data.isUploading
          delete skeletonNode.data.uploadFailed
          delete skeletonNode.data.uploadError
          delete skeletonNode.data._dataLost
          delete skeletonNode.data._lostReason
        }
      
        const hasMediaData = skeletonNode.data && (
          skeletonNode.data.sourceImages?.length > 0 ||
          skeletonNode.data.output?.url ||
          skeletonNode.data.output?.urls?.length > 0
        )
      
        if (hasMediaData) {
          skeletonNode.data._mediaLoading = true
          skeletonNode.data._originalMedia = {
            sourceImages: skeletonNode.data.sourceImages,
            output: skeletonNode.data.output
          }
          skeletonNode.data.sourceImages = []
          if (skeletonNode.data.output) {
            skeletonNode.data.output = { ...skeletonNode.data.output, url: null, urls: [] }
          }
        }
      
        return skeletonNode
      })
  }

  /**
   * 清理 edges 中 Vue Flow 运行时注入的内部属性，避免加载时状态冲突
   */
  function cleanEdges(rawEdges) {
    return rawEdges.map(edge => {
      const cleaned = safeDeepClone(edge)
      const internalKeys = [
        'sourceNode', 'targetNode', 'sourceX', 'sourceY',
        'targetX', 'targetY', 'events', 'selected'
      ]
      for (const key of internalKeys) {
        delete cleaned[key]
      }
      if (cleaned.style && typeof cleaned.style === 'object' && Object.keys(cleaned.style).length === 0) {
        delete cleaned.style
      }
      return cleaned
    })
  }

  /**
   * 异步分批恢复节点的媒体数据
   * 在骨架渲染后调用，避免大量媒体数据一次性加载导致卡顿
   */
  function asyncRestoreMedia() {
    const nodesWithMedia = nodes.value.filter(n => n.data?._mediaLoading)
    if (nodesWithMedia.length === 0) return
    
    const loadMediaBatch = (startIndex) => {
      const batchSize = 5
      const endIndex = Math.min(startIndex + batchSize, nodesWithMedia.length)
      
      for (let i = startIndex; i < endIndex; i++) {
        const node = nodesWithMedia[i]
        const targetNode = nodes.value.find(n => n.id === node.id)
        if (targetNode && node.data._originalMedia) {
          Object.assign(targetNode.data, {
            sourceImages: node.data._originalMedia.sourceImages || [],
            output: node.data._originalMedia.output || targetNode.data.output,
            _mediaLoading: false
          })
          delete targetNode.data._originalMedia
        }
      }
      
      if (endIndex < nodesWithMedia.length) {
        requestAnimationFrame(() => {
          setTimeout(() => loadMediaBatch(endIndex), 150)
        })
      }
    }
    
    requestAnimationFrame(() => {
      setTimeout(() => loadMediaBatch(0), 200)
    })
  }

  /**
   * 加载工作流（优化版：骨架先行，媒体异步加载）
   * 策略：先显示节点结构，然后异步加载图片/视频，提升流畅度
   */
  function loadWorkflow(workflow) {
    const workflowNodes = workflow.nodes || []
    const workflowEdges = workflow.edges || []
    
    const skeletonNodes = createSkeletonNodes(workflowNodes)
    const skeletonNodeIds = new Set(skeletonNodes.map(n => n.id))
    
    nodes.value = skeletonNodes
    edges.value = cleanEdges(workflowEdges).filter(e =>
      skeletonNodeIds.has(e.source) && skeletonNodeIds.has(e.target)
    )
    if (workflow.viewport) {
      viewport.value = workflow.viewport
    }

    const restoredGroups = skeletonNodes
      .filter(n => n.type === 'group' && n.data?.nodeIds?.length)
      .map(n => ({
        id: n.id,
        name: n.data.groupName || '新建组',
        nodeIds: [...n.data.nodeIds],
        color: n.data.groupColor || 'rgba(100, 116, 139, 0.08)',
        borderColor: n.data.borderColor || 'rgba(100, 116, 139, 0.25)'
      }))
    if (restoredGroups.length) {
      nodeGroups.value = restoredGroups
      console.log(`[Canvas Store] 已从工作流恢复 ${restoredGroups.length} 个编组`)
    }
    
    asyncRestoreMedia()
  }
  
  /**
   * 导出工作流数据
   * 普通导出，不做清理（用于自动保存等场景）
   */
  function exportWorkflow() {
    return {
      nodes: nodes.value,
      edges: edges.value,
      viewport: viewport.value
    }
  }
  
  /**
   * 🔧 导出工作流数据（保存前清理版）
   * 清理所有 base64/blob 内联数据，只保留云端 URL
   * 用于手动保存/自动保存到服务器前的数据清理
   */
  function exportWorkflowForSave() {
    const cleanedNodes = nodes.value.map(node => {
      if (!node.data) return { ...node }
      const data = { ...node.data }
      
      // 清理 sourceImages 中的 base64/blob
      if (Array.isArray(data.sourceImages)) {
        const originalCount = data.sourceImages.length
        data.sourceImages = data.sourceImages.filter(url => {
          if (typeof url !== 'string') return false
          return !url.startsWith('data:') && !url.startsWith('blob:')
        })
        // 如果所有图片都是 blob（全部被清除），标记需要移除
        if (data.sourceImages.length === 0 && originalCount > 0 && data.uploadFailed) {
          data._partialLost = true
        }
      }
      
      // 清理 referenceImages 中的 base64/blob
      if (Array.isArray(data.referenceImages)) {
        data.referenceImages = data.referenceImages.filter(url => {
          if (typeof url === 'string') {
            return !url.startsWith('data:') && !url.startsWith('blob:')
          }
          if (typeof url === 'object' && url?.url) {
            return !url.url.startsWith('data:') && !url.url.startsWith('blob:')
          }
          return true
        })
      }
      
      // 清理 output 中的 base64/blob
      if (data.output) {
        data.output = { ...data.output }
        if (data.output.url && typeof data.output.url === 'string') {
          if (data.output.url.startsWith('data:') || data.output.url.startsWith('blob:')) {
            data.output.url = null
          }
        }
        if (Array.isArray(data.output.urls)) {
          data.output.urls = data.output.urls.filter(url =>
            typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')
          )
        }
        if (Array.isArray(data.output.images)) {
          data.output.images = data.output.images.map(img => {
            if (img && typeof img === 'object') {
              const cleaned = { ...img }
              if (cleaned.url && (cleaned.url.startsWith('data:') || cleaned.url.startsWith('blob:'))) {
                cleaned.url = null
              }
              delete cleaned.base64
              delete cleaned.data
              return cleaned
            }
            return img
          })
        }
        if (Array.isArray(data.output.videos)) {
          data.output.videos = data.output.videos.map(v => {
            if (v && typeof v === 'object') {
              const cleaned = { ...v }
              if (cleaned.url && (cleaned.url.startsWith('data:') || cleaned.url.startsWith('blob:'))) {
                cleaned.url = null
              }
              return cleaned
            }
            return v
          })
        }
      }
      
      // 清理单独的 URL 字段
      const urlFields = ['imageUrl', 'videoUrl', 'audioUrl', 'sourceVideo', 'sourceImage', 'image', 'video']
      for (const field of urlFields) {
        if (data[field] && typeof data[field] === 'string') {
          if (data[field].startsWith('data:') || data[field].startsWith('blob:')) {
            data[field] = null
          }
        }
      }
      
      // 清理 urls 数组
      if (Array.isArray(data.urls)) {
        data.urls = data.urls.filter(url =>
          typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')
        )
      }
      
      // 删除大型内联数据字段
      const inlineDataFields = ['imageData', 'base64', 'previewData', 'originalData', 'audioData']
      for (const field of inlineDataFields) {
        if (data[field] && typeof data[field] === 'string' && data[field].length > 1000) {
          delete data[field]
        }
      }
      
      // 清理 imageOrder
      if (Array.isArray(data.imageOrder)) {
        data.imageOrder = data.imageOrder.filter(url => {
          if (typeof url !== 'string') return true
          return !url.startsWith('data:') && !url.startsWith('blob:')
        })
      }
      
      // 清理瞬态上传状态标记
      if (data.isUploading) {
        const hasValidMedia = (data.sourceImages?.length > 0) ||
          (data.output?.url) ||
          (data.output?.urls?.length > 0) ||
          (data.audioUrl && !data.audioUrl.startsWith('blob:')) ||
          (data.sourceVideo && !data.sourceVideo.startsWith('blob:'))
        if (!hasValidMedia) {
          data._shouldRemove = true
        }
      }
      delete data.isUploading
      delete data.uploadFailed
      delete data.uploadError
      
      // 已标记为数据丢失的节点也移除
      if (data._dataLost || data._partialLost) {
        const hasAnyMedia = (data.sourceImages?.length > 0) ||
          (data.output?.url) ||
          (data.output?.urls?.length > 0) ||
          (data.audioUrl) ||
          (data.sourceVideo)
        if (!hasAnyMedia) {
          data._shouldRemove = true
        }
      }
      delete data._dataLost
      delete data._lostReason
      delete data._partialLost
      
      return { ...node, data }
    })
    
    // 过滤掉上传未完成且无有效数据的节点，避免残留
    const validNodes = cleanedNodes.filter(n => !n.data?._shouldRemove)
    const validNodeIds = new Set(validNodes.map(n => n.id))
    
    // 清理指向已移除节点的边
    const validEdges = edges.value.filter(e =>
      validNodeIds.has(e.source) && validNodeIds.has(e.target)
    )
    
    // 清理临时标记
    validNodes.forEach(n => {
      if (n.data) delete n.data._shouldRemove
    })
    
    return {
      nodes: validNodes,
      edges: validEdges,
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
   * 将全局个人/团队空间切换到当前已保存工作流所属空间，避免生成记录写入错误 space_type
   * （例如：复刻到团队空间的工作流在全局仍为个人空间时，历史面板按团队筛选会看不到新图）
   */
  async function syncTeamSpaceFromWorkflowTab(tab) {
    if (!tab) return
    const st = tab.workflowSpaceType
    if (st !== 'personal' && st !== 'team') return
    const teamStore = useTeamStore()
    try {
      if (st === 'team' && tab.workflowTeamId) {
        if (!teamStore.myTeams.length) await teamStore.loadMyTeams()
        await teamStore.switchToTeam(tab.workflowTeamId)
      } else {
        teamStore.switchToPersonalSpace()
      }
    } catch (e) {
      console.warn('[CanvasStore] 同步工作流所属空间失败:', e?.message)
    }
  }
  
  /**
   * 创建新标签
   */
  function createTab(workflow = null) {
    if (workflowTabs.value.length >= maxTabs) {
      console.warn(`[Canvas] 已达到最大标签数量 ${maxTabs}`)
      return null
    }
    
    const tabId = generateTabId()
    
    // 有工作流数据时使用骨架加载策略，剥离媒体数据加快首次渲染
    const rawNodes = workflow?.nodes || []
    let tabNodes = rawNodes
    let needsMediaRestore = false
    if (rawNodes.length > 0) {
      tabNodes = createSkeletonNodes(rawNodes)
      needsMediaRestore = tabNodes.some(n => n.data?._mediaLoading)
    }
    
    // 清理指向被移除节点的边
    const tabNodeIds = new Set(tabNodes.map(n => n.id))
    const tabEdges = workflow?.edges
      ? cleanEdges(workflow.edges).filter(e => tabNodeIds.has(e.source) && tabNodeIds.has(e.target))
      : []
    
    const tab = {
      id: tabId,
      name: workflow?.name || t('canvas.newWorkflow'),
      workflowId: workflow?.id || null,
      workflowUid: workflow?.workflow_uid || null,
      // 已保存工作流：记录其所属空间，切换标签时同步全局空间，保证生成任务写入对应 image/video 历史
      workflowSpaceType: workflow?.id ? (workflow.space_type === 'team' ? 'team' : 'personal') : null,
      workflowTeamId: workflow?.id && workflow.space_type === 'team' ? workflow.team_id : null,
      nodes: tabNodes,
      edges: tabEdges,
      viewport: workflow?.viewport || { x: 0, y: 0, zoom: 1 },
      hasChanges: false
    }
    
    workflowTabs.value.push(tab)
    switchToTab(tabId)
    
    // 骨架渲染后异步恢复媒体数据
    if (needsMediaRestore) {
      nextTick(() => asyncRestoreMedia())
    }
    
    return tab
  }
  
  /**
   * 切换标签
   */
  function switchToTab(tabId) {
    const currentTab = workflowTabs.value.find(t => t.id === activeTabId.value)
    const targetTab = workflowTabs.value.find(t => t.id === tabId)
    
    if (!targetTab) return
    
    // 保存当前标签状态
    if (currentTab) {
      try {
        currentTab.nodes = JSON.parse(JSON.stringify(toRaw(nodes.value)))
        currentTab.edges = JSON.parse(JSON.stringify(toRaw(edges.value)))
        currentTab.viewport = { ...viewport.value }
      } catch (e) {
        console.error('[Canvas] 保存标签状态失败:', e)
      }
    }
    
    activeTabId.value = tabId
    
    // 更新工作流元信息
    workflowMeta.value = targetTab.workflowId ? {
      id: targetTab.workflowId,
      workflow_uid: targetTab.workflowUid,
      name: targetTab.name,
      description: ''
    } : null
    
    selectedNodeId.value = null
    selectedEdgeId.value = null
    selectedNodeIds.value = []
    
    // 同步设置新数据 - 深拷贝避免共享引用
    try {
      nodes.value = JSON.parse(JSON.stringify(targetTab.nodes))
      edges.value = JSON.parse(JSON.stringify(targetTab.edges))
    } catch (e) {
      console.error('[Canvas] 恢复标签数据失败:', e)
      nodes.value = []
      edges.value = []
    }
    viewport.value = { ...targetTab.viewport }

    void syncTeamSpaceFromWorkflowTab(targetTab)
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
  function markCurrentTabSaved(workflowId = null, workflowUid = null, spaceMeta = null) {
    const currentTab = workflowTabs.value.find(t => t.id === activeTabId.value)
    if (currentTab) {
      currentTab.hasChanges = false
      if (workflowId) {
        currentTab.workflowId = workflowId
      }
      if (workflowUid) {
        currentTab.workflowUid = workflowUid
      }
      if (spaceMeta && typeof spaceMeta.space_type === 'string') {
        currentTab.workflowSpaceType = spaceMeta.space_type === 'team' ? 'team' : 'personal'
        currentTab.workflowTeamId = spaceMeta.space_type === 'team' ? spaceMeta.team_id : null
      }
    }
  }
  
  /**
   * 在新标签中打开工作流
   */
  function openWorkflowInNewTab(workflow) {
    if (workflow.id) {
      const existingTab = workflowTabs.value.find(t => t.workflowId === workflow.id)
      if (existingTab) {
        // 用服务器最新数据更新已有标签，避免加载旧/损坏的缓存数据
        if (workflow.nodes && workflow.nodes.length > 0) {
          const freshNodes = createSkeletonNodes(workflow.nodes)
          const freshNodeIds = new Set(freshNodes.map(n => n.id))
          const freshEdges = workflow.edges
            ? cleanEdges(workflow.edges).filter(e => freshNodeIds.has(e.source) && freshNodeIds.has(e.target))
            : []
          existingTab.nodes = freshNodes
          existingTab.edges = freshEdges
          if (workflow.viewport) {
            existingTab.viewport = workflow.viewport
          }
          existingTab.name = workflow.name || existingTab.name
        }
        if (workflow.id) {
          existingTab.workflowSpaceType = workflow.space_type === 'team' ? 'team' : 'personal'
          existingTab.workflowTeamId = workflow.space_type === 'team' ? workflow.team_id : null
        }
        switchToTab(existingTab.id)
        // 恢复媒体
        const needsMedia = existingTab.nodes.some(n => n.data?._mediaLoading)
        if (needsMedia) {
          nextTick(() => asyncRestoreMedia())
        }
        return existingTab
      }
    }
    
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

  // ========== 编组执行 ==========

  // 编组执行状态: { [groupId]: { status, progress, total, completed, failed, currentNodes } }
  const groupExecutionState = ref({})
  // 停止信号: { [groupId]: true } 用于中断执行
  const groupExecutionAbort = ref({})

  // 不可执行的节点类型（没有 executeTriggered watch，或纯输入节点无需执行）
  const NON_EXECUTABLE_TYPES = new Set([
    'text-input', 'text',
    'image-input',
    'video-input',
    'audio-input',
    'group',
    'storyboard',
    'character-card',
    'preview-output'
  ])

  /**
   * 获取编组内部的边（source 和 target 都在编组内）
   */
  function getGroupInternalEdges(groupId) {
    // 优先从 nodeGroups 获取，fallback 到 group 节点的 data.nodeIds
    const group = nodeGroups.value.find(g => g.id === groupId)
    const groupNode = nodes.value.find(n => n.id === groupId && n.type === 'group')
    const nodeIdList = group?.nodeIds || groupNode?.data?.nodeIds || []
    if (!nodeIdList.length) return []
    const idSet = new Set(nodeIdList)
    return edges.value.filter(e => idSet.has(e.source) && idSet.has(e.target))
  }

  /**
   * 拓扑排序（Kahn 算法）
   * 返回分层结果，同层节点可并行执行
   * 例如: [[n1, n2], [n3], [n4]]
   */
  function topologicalSort(nodeIds, internalEdges) {
    const idSet = new Set(nodeIds)
    // 构建入度表和邻接表
    const inDegree = {}
    const adjacency = {}
    for (const id of nodeIds) {
      inDegree[id] = 0
      adjacency[id] = []
    }
    for (const edge of internalEdges) {
      if (idSet.has(edge.source) && idSet.has(edge.target)) {
        inDegree[edge.target]++
        adjacency[edge.source].push(edge.target)
      }
    }
    // Kahn 算法，按层收集
    const layers = []
    let queue = nodeIds.filter(id => inDegree[id] === 0)
    const visited = new Set()

    while (queue.length > 0) {
      layers.push([...queue])
      const nextQueue = []
      for (const id of queue) {
        visited.add(id)
        for (const neighbor of adjacency[id]) {
          inDegree[neighbor]--
          if (inDegree[neighbor] === 0 && !visited.has(neighbor)) {
            nextQueue.push(neighbor)
          }
        }
      }
      queue = nextQueue
    }

    // 检测环：如果有节点未被访问，说明存在环
    const unvisited = nodeIds.filter(id => !visited.has(id))
    if (unvisited.length > 0) {
      console.warn('[Canvas Store] 编组内存在循环依赖，以下节点无法排序:', unvisited)
      // 将环中的节点作为最后一层追加
      layers.push(unvisited)
    }

    return layers
  }

  /**
   * 触发单个节点执行
   * 通过更新节点 data 中的 executeTriggered 标记通知节点组件
   */
  function triggerNodeExecution(nodeId) {
    updateNodeData(nodeId, {
      executeTriggered: Date.now(),
      triggeredByGroup: true
    })
  }

  /**
   * 等待节点执行完成
   * 通过 watch 节点 data.status 变化来判断
   * 返回 Promise，resolve 时携带最终状态
   */
  function waitForNodeCompletion(nodeId, groupId, timeoutMs = 900000) {
    return new Promise((resolve) => {
      const node = nodes.value.find(n => n.id === nodeId)
      if (!node) {
        resolve('error')
        return
      }

      // 如果节点已经处于终态，直接返回
      const currentStatus = node.data?.status
      if (currentStatus === 'completed' || currentStatus === 'success') {
        resolve('completed')
        return
      }
      if (currentStatus === 'error' || currentStatus === 'failed' || currentStatus === 'skipped') {
        resolve('error')
        return
      }

      let timer = null
      let resolved = false
      let stopWatcher = null
      let stopAbortWatcher = null

      const finish = (status) => {
        if (resolved) return
        resolved = true
        if (timer) clearTimeout(timer)
        if (stopWatcher) stopWatcher()
        if (stopAbortWatcher) stopAbortWatcher()
        resolve(status)
      }

      // 超时处理
      timer = setTimeout(() => {
        console.warn(`[Canvas Store] 节点 ${nodeId} 执行超时`)
        finish('timeout')
      }, timeoutMs)

      // 监听停止信号
      stopAbortWatcher = watch(
        () => groupExecutionAbort.value[groupId],
        (aborted) => {
          if (aborted) {
            finish('aborted')
          }
        }
      )

      // 监听节点状态变化
      stopWatcher = watch(
        () => {
          const n = nodes.value.find(n => n.id === nodeId)
          return n?.data?.status
        },
        (newStatus) => {
          if (newStatus === 'completed' || newStatus === 'success') {
            finish('completed')
          } else if (newStatus === 'error' || newStatus === 'failed' || newStatus === 'skipped') {
            finish('error')
          }
        },
        { immediate: false }
      )
    })
  }

  /**
   * 执行编组内所有节点（按拓扑顺序）
   * 同层节点并行执行，层间串行等待
   */
  async function executeGroup(groupId) {
    // 优先从 nodeGroups 获取，fallback 到 group 节点的 data.nodeIds
    const group = nodeGroups.value.find(g => g.id === groupId)
    const groupNode = nodes.value.find(n => n.id === groupId && n.type === 'group')
    const nodeIdList = group?.nodeIds || groupNode?.data?.nodeIds || []
    const groupName = group?.name || groupNode?.data?.groupName || groupId

    if (!nodeIdList.length) {
      console.warn('[Canvas Store] 编组内无节点:', groupId)
      return
    }

    // 获取编组内部边并做拓扑排序
    const internalEdges = getGroupInternalEdges(groupId)
    const layers = topologicalSort([...nodeIdList], internalEdges)
    const totalNodes = nodeIdList.length

    // 初始化执行状态
    groupExecutionState.value[groupId] = {
      status: 'running',
      progress: 0,
      total: totalNodes,
      completed: 0,
      failed: 0,
      currentNodes: []
    }
    // 清除停止信号
    groupExecutionAbort.value[groupId] = false

    console.log(`[Canvas Store] 开始执行编组 "${groupName}"，共 ${totalNodes} 个节点，${layers.length} 层`)

    let completedCount = 0
    let failedCount = 0

    try {
      for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
        // 检查是否已停止
        if (groupExecutionAbort.value[groupId]) {
          console.log(`[Canvas Store] 编组 "${groupName}" 执行已停止`)
          break
        }

        const layer = layers[layerIdx]
        // 检查本层节点是否有上游失败的，如果有则标记为 skipped
        const executableNodes = []
        for (const nodeId of layer) {
          const upstreamInGroup = internalEdges
            .filter(e => e.target === nodeId)
            .map(e => e.source)
          const node = nodes.value.find(n => n.id === nodeId)
          const hasFailedUpstream = upstreamInGroup.some(upId => {
            const upNode = nodes.value.find(n => n.id === upId)
            return upNode?.data?.status === 'error' ||
                   upNode?.data?.status === 'failed' ||
                   upNode?.data?.status === 'skipped'
          })

          if (hasFailedUpstream) {
            // 上游失败，跳过此节点
            updateNodeData(nodeId, { status: 'skipped', triggeredByGroup: true })
            failedCount++
            completedCount++
            console.log(`[Canvas Store] 节点 ${nodeId} 因上游失败被跳过`)
          } else {
            executableNodes.push(nodeId)
          }
        }

        if (executableNodes.length === 0) continue

        // 更新当前执行层
        const state = groupExecutionState.value[groupId]
        state.currentNodes = [...executableNodes]

        // 并行触发本层所有可执行节点
        const promises = executableNodes.map(nodeId => {
          const node = nodes.value.find(n => n.id === nodeId)
          const nodeType = node?.type

          // 跳过不可执行的节点类型（如 text-input、text 等输入节点）
          if (NON_EXECUTABLE_TYPES.has(nodeType)) {
            console.log(`[Canvas Store] 节点 ${nodeId} (${nodeType}) 为输入节点，跳过执行`)
            return Promise.resolve('completed')
          }

          triggerNodeExecution(nodeId)
          return waitForNodeCompletion(nodeId, groupId)
        })

        // 等待本层所有节点完成
        const results = await Promise.all(promises)

        // 统计本层结果
        for (let i = 0; i < results.length; i++) {
          completedCount++
          if (results[i] === 'error' || results[i] === 'timeout') {
            failedCount++
          } else if (results[i] === 'aborted') {
            // 被中断，不再继续
            break
          }
        }

        // 更新进度
        const stateAfter = groupExecutionState.value[groupId]
        if (stateAfter) {
          stateAfter.completed = completedCount
          stateAfter.failed = failedCount
          stateAfter.progress = Math.round((completedCount / totalNodes) * 100)
        }
      }
    } catch (err) {
      console.error('[Canvas Store] 编组执行异常:', err)
    }

    // 最终状态更新
    const finalState = groupExecutionState.value[groupId]
    if (finalState) {
      finalState.currentNodes = []
      if (groupExecutionAbort.value[groupId]) {
        finalState.status = 'stopped'
      } else if (failedCount > 0) {
        finalState.status = 'partial'
      } else {
        finalState.status = 'completed'
      }
      finalState.completed = completedCount
      finalState.failed = failedCount
      finalState.progress = 100
    }

    console.log(`[Canvas Store] 编组 "${groupName}" 执行完毕，成功: ${completedCount - failedCount}，失败: ${failedCount}`)
  }

  /**
   * 停止编组执行
   */
  function stopGroupExecution(groupId) {
    groupExecutionAbort.value[groupId] = true
    const state = groupExecutionState.value[groupId]
    if (state) {
      state.status = 'stopping'
    }
    console.log(`[Canvas Store] 正在停止编组 ${groupId} 的执行`)
  }

  /**
   * 获取编组执行状态
   */
  function getGroupExecutionState(groupId) {
    return groupExecutionState.value[groupId] || null
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
    edgesByTarget,
    edgesBySource,
    nodesById,
    
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
    disconnectNodeInputs,
    disconnectNodeHandle,
    swapCellEdges,
    propagateData,
    
    // 历史记录操作
    saveHistory,
    undo,
    redo,
    trimHistory,
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

    // 编组执行
    groupExecutionState,
    executeGroup,
    stopGroupExecution,
    getGroupExecutionState,
    getGroupInternalEdges,
    topologicalSort,

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
    exportWorkflowForSave,
    
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

