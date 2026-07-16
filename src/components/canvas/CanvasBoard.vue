<script setup>
/**
 * CanvasBoard.vue - 无限画布组件
 * 基于 Vue Flow 实现
 * 
 * 交互说明（支持两种模式，通过 interactionMode 切换）：
 * 
 * [ComfyUI 模式]
 * - 左键拖拽空白区域：平移画布
 * - Shift / Ctrl + 拖动：框选节点
 * - 滚轮：以鼠标位置为中心缩放
 * - Ctrl + 滚轮：垂直平移画布
 * 
 * [无限画布模式]
 * - 左键拖拽：框选节点
 * - 右键拖拽空白区域：平移画布
 * - 滚轮：上下平移画布
 * - Ctrl + 滚轮：以鼠标位置为中心缩放
 * 
 * [通用]
 * - 右键点击空白区域：打开画布菜单
 * - 鼠标中键拖动：始终平移画布
 * - Shift + 滚轮：水平平移画布
 * - 空格 + 鼠标拖动：平移画布
 * - Delete/Backspace：删除选中的节点
 * - 双击空白区域：打开节点选择器
 * - Ctrl+Z：撤销
 * - Ctrl+Y：重做
 * - Ctrl+C：复制节点
 * - Ctrl+V：粘贴节点
 * - Ctrl+A：全选节点
 * - Ctrl+G：编组选中的节点
 */
import { ref, computed, watch, onMounted, onUnmounted, inject, nextTick, provide } from 'vue'
import { SelectionMode, VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { useCanvasStore, useUploadManager } from '@/stores/canvas'
import { uploadCanvasMedia } from '@/api/canvas/workflow'
import {
  flowPositionToScreenPosition,
  resolveConnectionSourcePosition,
  shouldTreatTargetAsGroupCanvas
} from '@/utils/canvasConnectionPosition'
import {
  getClipboardFiles,
  isScreenPointInsideRect,
  resolveCanvasPasteScreenPosition,
  resolveCanvasPasteSource
} from '@/utils/canvasClipboardPaste'
import {
  applyPanToViewport,
  applyZoomAtScreenPoint,
  getTouchDistance,
  getTouchMidpoint,
  getTouchPoint
} from '@/utils/canvasTouchInteractions'
import { buildPromptInputScaleStyle } from '@/utils/canvasPromptInputScale'
import {
  getOrganizationNodeSize,
  getOrganizationGroupChildIds,
  organizeCanvasNodes,
  runCanvasFit
} from '@/utils/canvasOrganization'
import { getMovedGroupChildPositions, getNodeDropGroupId } from '@/utils/canvasGroupMovement'
import { getDraggedNodeFinalPositions } from '@/utils/canvasDragPositions'
import { projectCanvasRenderState } from '@/utils/canvasRenderProjection.js'

// 导入自定义节点组件
import { canConnect } from '@/config/canvas/nodeTypes'
import TextNode from './nodes/TextNode.vue'
import ImageNode from './nodes/ImageNode.vue'
import VideoNode from './nodes/VideoNode.vue'
import AudioNode from './nodes/AudioNode.vue'
import LLMNode from './nodes/LLMNode.vue'
import PreviewNode from './nodes/PreviewNode.vue'
import GroupNode from './nodes/GroupNode.vue'
import CharacterCardNode from './nodes/CharacterCardNode.vue'
import StoryboardNode from './nodes/StoryboardNode.vue'
import SeedanceCharacterNode from './nodes/SeedanceCharacterNode.vue'
import DirectorStudioNode from './nodes/DirectorStudioNode.vue'
import CanvasMiniMapOverview from './CanvasMiniMapOverview.vue'

// 🚀 节点虚拟化：HOC + 控制器
// 当节点总数超过阈值时，视口外的节点由 NodeShell 替换，避免挂载重量级组件
import { createVirtualizedNodeType } from './VirtualizedNode.js'
import { createCanvasVirtualization } from '@/composables/useCanvasVirtualization.js'

const props = defineProps({
  pickMode: {
    type: Boolean,
    default: false
  },
  gridSnapEnabled: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits([
  'dblclick',
  'canvas-contextmenu',
  'pane-click',
  'pick-node',
  'organization-mutation-start',
  'organization-mutation-end'
])
const canvasStore = useCanvasStore()
const uploadManager = useUploadManager()

// 注入用户信息
const userInfo = inject('userInfo', null)

// 注入保存对话框函数
const openSaveDialog = inject('openSaveDialog', null)

// 注入快速保存函数（Ctrl+S 使用）
const quickSaveWorkflow = inject('quickSaveWorkflow', null)

// 注入交互模式
const interactionMode = inject('interactionMode', ref('comfyui'))
const showCanvasMiniMap = inject('showCanvasMiniMap', ref(false))

// VueFlow 交互配置（根据交互模式动态切换）
const panOnDragConfig = computed(() => {
  // 无限画布模式：禁用 Vue Flow 内置平移（全部由自定义代码处理），
  // 让 selectionOnDrag 独占左键拖拽行为实现框选
  // ComfyUI 模式：左键和右键可平移画布
  return interactionMode.value === 'infinite-canvas' ? false : [0, 2]
})
const selectionKeyCodeConfig = computed(() => {
  // 无限画布模式：不需要修饰键，左键拖拽直接框选
  // ComfyUI 模式：需要 Shift/Ctrl 修饰键才框选
  return interactionMode.value === 'infinite-canvas' ? true : ['Shift', 'Control']
})

// 连线样式设置 - 优先从用户偏好加载，其次从localStorage，最后使用默认值
const edgeStyle = ref(
  userInfo?.value?.preferences?.canvas?.edgeStyle ||
  localStorage.getItem('canvasEdgeStyle') ||
  'bezier'
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
  const newStyle = event.detail?.style || 'bezier'
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
const lastMousePosition = ref(null)

// 选中的节点ID列表（用于批量删除）
const selectedNodeIds = ref([])

function getInitialCanvasBoardSize() {
  if (typeof window === 'undefined') return { width: 1, height: 1 }
  return {
    width: Math.max(1, Math.round(window.innerWidth || 0)),
    height: Math.max(1, Math.round(window.innerHeight || 0))
  }
}

// 画布容器引用
const canvasBoardRef = ref(null)
const canvasBoardSize = ref(getInitialCanvasBoardSize())
let canvasBoardResizeObserver = null

// 文件拖拽状态
const isFileDragOver = ref(false)
const fileDragCounter = ref(0)

// 平移状态（空格+拖动 / 鼠标中键 / 右键拖动）
const isSelectionModifierPressed = ref(false)
const isSpacePressed = ref(false)
const isPanning = ref(false)
const isMiddleButtonPanning = ref(false)
const isRightButtonDown = ref(false)
const isRightButtonPanning = ref(false)
const rightDragSuppressContextMenu = ref(false)
const RIGHT_DRAG_THRESHOLD = 4
const panStart = ref({ x: 0, y: 0 })

// 触屏手势只服务 iPad/平板等 touch 输入，不改变鼠标/键盘路径
const TOUCH_PAN_THRESHOLD = 4
const TOUCH_CONNECTION_DRAG_THRESHOLD = 5
const TOUCH_LONG_PRESS_DURATION = 600
const TOUCH_LONG_PRESS_MOVE_THRESHOLD = 8

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
const isViewportMoving = ref(false)
let viewportMovingTimer = null
let touchState = null
let touchConnectionLongPressTimer = null
let touchLongPressTimer = null
let globalTouchListenersAttached = false

provide('isCanvasViewportMoving', isViewportMoving)

/**
 * 当前 zoom 档位（用于 CSS 极简模式切换，不参与响应式追踪每个节点）
 * - tiny: zoom < 0.4 → 节点显示宽度 < 160px，应屏蔽冗余 UI（图标文本/状态徽章等）
 * - small: 0.4 <= zoom < 0.75 → 中等密度
 * - normal: zoom >= 0.75 → 完整 UI
 * 通过画布根 data-zoom-level 属性下发，配合 canvas.css 规则生效。
 * 不需要每个节点单独 inject，避免 100 节点级联触发响应。
 */
const canvasZoomLevel = computed(() => {
  const z = canvasStore.viewport?.zoom || 1
  if (z < 0.4) return 'tiny'
  if (z < 0.75) return 'small'
  return 'normal'
})

const canvasPromptPanelScaleStyle = computed(() => buildPromptInputScaleStyle({
  enabled: true,
  zoom: canvasStore.viewport?.zoom
}))

/**
 * 稳定 zoom：viewport.zoom 停止变化 220ms 后才更新。
 *
 * 作用：节点的 LOD URL 计算用 stableZoom 而非实时 zoom，避免用户连续滚轮
 *      缩放时 src 在多个档位之间反复切换，触发不必要的 decode/paint。
 *
 * 与 isViewportMoving (180ms) 错时：移动期间 preferLowQuality=true 用 384 占位，
 *      移动停止后再等 ~40ms stableZoom 更新到最终值，才加载真正档位的高清图。
 *      用户感受：拖动时图变模糊（占位），停下后清晰版"渐入"，不闪烁。
 */
const stableZoom = ref(canvasStore.viewport?.zoom || 1)
let stableZoomTimer = null
provide('canvasStableZoom', stableZoom)

watch(() => canvasStore.viewport?.zoom, (z) => {
  if (typeof z !== 'number') return
  if (stableZoomTimer) {
    clearTimeout(stableZoomTimer)
    pendingTimeouts.delete(stableZoomTimer)
  }
  stableZoomTimer = setTimeout(() => {
    pendingTimeouts.delete(stableZoomTimer)
    stableZoomTimer = null
    stableZoom.value = z
  }, 220)
  pendingTimeouts.add(stableZoomTimer)
})

function markViewportMoving() {
  isViewportMoving.value = true
  if (viewportMovingTimer) {
    clearTimeout(viewportMovingTimer)
    pendingTimeouts.delete(viewportMovingTimer)
  }
  viewportMovingTimer = setTimeout(() => {
    pendingTimeouts.delete(viewportMovingTimer)
    viewportMovingTimer = null
    isViewportMoving.value = false
  }, 180)
  pendingTimeouts.add(viewportMovingTimer)
}

function updateCanvasBoardSize() {
  const rect = canvasBoardRef.value?.getBoundingClientRect?.()
  const width = Math.round(rect?.width || 0)
  const height = Math.round(rect?.height || 0)
  if (!width || !height) return
  if (canvasBoardSize.value.width === width && canvasBoardSize.value.height === height) return
  canvasBoardSize.value = { width, height }
  canvasVirtualization?.recalculate?.()
}

// 性能优化：组内节点位置同步的 rAF 节流句柄
// 拖拽组节点时 onNodeDrag 每帧都触发，用 rAF 确保每帧最多同步一次位置
let _syncGroupRafId = null
const groupDragStartPositions = new Map()

function rebaseGroupNodeOffsets(groupNode, position) {
  if (!groupNode?.id || groupNode.type !== 'group') return

  const startPosition = { ...(position || groupNode.position || { x: 0, y: 0 }) }
  const rebased = getMovedGroupChildPositions(
    canvasStore.nodes,
    groupNode,
    startPosition,
    { previousPosition: startPosition, rebaseOffsets: true }
  )
  const previousOffsets = groupNode.data?.nodeOffsets || {}
  const offsetsChanged = Object.keys(rebased.nodeOffsets).some(nodeId => {
    const previous = previousOffsets[nodeId]
    const next = rebased.nodeOffsets[nodeId]
    return !previous || Number(previous.x) !== next.x || Number(previous.y) !== next.y
  }) || Object.keys(previousOffsets).length !== Object.keys(rebased.nodeOffsets).length

  if (offsetsChanged && Object.keys(rebased.nodeOffsets).length > 0) {
    canvasStore.updateNodeData(groupNode.id, { nodeOffsets: rebased.nodeOffsets })
  }
}

// Vue Flow 实例
const { 
  onConnect, 
  onConnectStart,
  onConnectEnd,
  onNodeDragStart,
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
  setCenter,
  viewport: vfViewport,
  project,
  vueFlowRef,
  addSelectedEdges,
  removeSelectedNodes,
  findNode
} = useVueFlow()

// 缩放配置
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_SPEED = 0.1

function clampCanvasZoom(zoom) {
  const numericZoom = Number(zoom)
  if (!Number.isFinite(numericZoom)) return 1
  return Math.min(Math.max(numericZoom, MIN_ZOOM), MAX_ZOOM)
}

const PAN_SPEED = 50

/**
 * 自定义滚轮处理（根据 interactionMode 切换行为）
 * ComfyUI: 默认=缩放, Shift=水平平移, Ctrl=垂直平移
 * 无限画布: 默认=按触控板/滚轮 delta 平移, Shift=水平平移, Ctrl=缩放
 */
let wheelRAF = null
function handleWheel(event) {
  event.preventDefault()

  // 🚀 RAF 节流：避免高频滚轮事件导致卡顿
  if (wheelRAF) return
  wheelRAF = requestAnimationFrame(() => {
    wheelRAF = null
    handleWheelInner(event)
  })
}
function handleWheelInner(event) {
  const viewport = getViewport()
  const isInfiniteCanvas = interactionMode.value === 'infinite-canvas'
  const isCtrl = event.ctrlKey || event.metaKey
  const TRACKPAD_PAN_SPEED_SCALE = 1 / 3

  // Shift+滚轮：水平平移（两种模式相同）
  if (event.shiftKey) {
    const dx = event.deltaY > 0 ? -PAN_SPEED : PAN_SPEED
    setViewport({ x: viewport.x + dx, y: viewport.y, zoom: viewport.zoom })
    return
  }

  // ComfyUI: 无修饰键=缩放, Ctrl=垂直平移
  // 无限画布: 无修饰键=垂直平移, Ctrl=缩放
  const shouldZoom = isInfiniteCanvas ? isCtrl : !isCtrl

  if (shouldZoom) {
    const delta = event.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED
    const newZoom = Math.min(Math.max(viewport.zoom * (1 + delta), MIN_ZOOM), MAX_ZOOM)
    if (newZoom === viewport.zoom) return
    const container = canvasBoardRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    const flowX = (mouseX - viewport.x) / viewport.zoom
    const flowY = (mouseY - viewport.y) / viewport.zoom
    const newX = mouseX - flowX * newZoom
    const newY = mouseY - flowY * newZoom
    setViewport({ x: newX, y: newY, zoom: newZoom })
  } else {
    if (Math.abs(event.deltaX || 0) > 0) {
      setViewport({
        x: viewport.x - event.deltaX * TRACKPAD_PAN_SPEED_SCALE,
        y: viewport.y - event.deltaY * TRACKPAD_PAN_SPEED_SCALE,
        zoom: viewport.zoom
      })
      return
    }
    const dy = event.deltaY > 0 ? -PAN_SPEED : PAN_SPEED
    setViewport({ x: viewport.x, y: viewport.y + dy, zoom: viewport.zoom })
  }
}

function handleMiniMapClick({ position }) {
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') return
  const viewport = getViewport()
  setCenter(position.x, position.y, { zoom: viewport.zoom })
  markViewportMoving()
}

function getMiniMapNodeClass(node) {
  if (node?.type === 'group') return 'is-group'
  if (node?.data?.groupId) return 'is-grouped'
  return ''
}

// 🚀 自定义节点类型映射（已经过虚拟化 HOC 包装）
// 统一设计：Image 和 Video 节点同时支持上传和生成
//
// 虚拟化策略：
//   - 普通节点用 createVirtualizedNodeType 包装：节点总数超过 200 时，
//     视口外的节点自动替换为 NodeShell（保留位置和大小，避免挂载重组件）
//   - group / preview-output 永远走真组件（alwaysReal:true）：
//     group 是其他节点的视觉容器，preview-output 通常很小且数量少
//   - 选中、拖拽中的节点永远走真组件（在 HOC 内部判定）
const V = (RealComp, opts) => createVirtualizedNodeType(RealComp, opts)
const nodeTypes = {
  'text-input': V(TextNode),
  'image-input': V(ImageNode),       // 图片节点（上传+生成一体化）
  'video-input': V(VideoNode),       // 视频节点（上传+生成一体化）
  'audio-input': V(AudioNode),       // 音频节点（上传音频）
  'audio': V(AudioNode),             // 统一音频节点
  'image': V(ImageNode),             // 统一图片节点
  'video': V(VideoNode),             // 统一视频节点
  'image-gen': V(ImageNode),         // 兼容：图片生成映射到 ImageNode
  'video-gen': V(VideoNode),         // 兼容：视频生成映射到 VideoNode
  'text-to-image': V(ImageNode),     // 文生图 → 统一的 ImageNode
  'image-to-image': V(ImageNode),    // 图生图 → 统一的 ImageNode
  'text-to-video': V(VideoNode),     // 文生视频 → 统一的 VideoNode
  'image-to-video': V(VideoNode),    // 图生视频 → 统一的 VideoNode
  'llm': V(LLMNode),                 // 统一 LLM 节点
  'llm-prompt-enhance': V(LLMNode),
  'llm-image-describe': V(LLMNode),
  'llm-content-expand': V(LLMNode),
  'preview-output': V(PreviewNode, { alwaysReal: true }),
  'grid-preview': V(ImageNode),      // 9宫格分镜（使用 ImageNode，可以生成和输出图片）
  'group': V(GroupNode, { alwaysReal: true }),  // 编组节点（视觉容器，永远渲染真组件）
  'character-card': V(CharacterCardNode),  // Sora角色卡节点
  'seedance-character': V(SeedanceCharacterNode),  // Seedance角色节点
  'bytefor-character': V(SeedanceCharacterNode),  // Bytefor角色节点
  'director-studio': V(DirectorStudioNode),
  'storyboard': V(StoryboardNode)    // 分镜格子节点
}

// 🚀 当前选中节点 ID 集合（响应式），传给虚拟化控制器确保选中节点不被卸载
const virtualizationSelectedIds = computed(() => {
  const set = new Set()
  const single = canvasStore.selectedNodeId
  if (single) set.add(single)
  const multi = canvasStore.selectedNodeIds
  if (Array.isArray(multi)) {
    for (const id of multi) if (id) set.add(id)
  }
  return set
})

// 🚀 创建虚拟化控制器并通过 provide 注入给每个 VirtualizedNode HOC
// 阈值 200：低于此数节点全量渲染，避免开销；超过则启用真虚拟化
const canvasVirtualization = createCanvasVirtualization({
  nodes: computed(() => canvasStore.nodes),
  viewport: computed(() => canvasStore.viewport),
  containerRef: canvasBoardRef,
  selectedIds: virtualizationSelectedIds,
  threshold: 200,
  bufferRatio: 1.5
})
provide('canvasVirtualization', canvasVirtualization)

// 🚀 性能模式注入：让节点组件按性能档位自适应渲染
//   - full     (<50):    所有特效开启
//   - optimized (50-200): 关闭非必要动画
//   - reduced  (200-500): 强制 LOD、禁用对齐辅助线、禁用边动画
//   - minimal  (>500):    全量降级 + HOC 真虚拟化 + history=3
const canvasPerformanceMode = computed(() => canvasStore.performanceMode)
provide('canvasPerformanceMode', canvasPerformanceMode)

// 是否禁用对齐辅助线（reduced 以上档位）
const shouldDisableAlignmentGuides = computed(() => {
  const mode = canvasPerformanceMode.value
  return mode === 'reduced' || mode === 'minimal'
})

// 是否禁用边动画（minimal 档位）
const shouldDisableEdgeAnimation = computed(() => canvasPerformanceMode.value === 'minimal')

// 记录连线起始信息
const connectStartInfo = ref(null)
const isVueFlowConnecting = ref(false) // 标记是否正在使用 Vue Flow 原生连线
const connectionSucceeded = ref(false) // 标记连接是否成功
const justOpenedSelectorFromConnection = ref(false) // 标记是否刚刚通过连线打开了选择器（防止 paneClick 立即关闭）

const renderProjectionActiveIds = computed(() => {
  const ids = new Set()
  const dragSourceId = canvasStore.dragConnectionSource?.nodeId
  if (dragSourceId) ids.add(dragSourceId)
  if (connectStartInfo.value?.nodeId) ids.add(connectStartInfo.value.nodeId)
  return ids
})

const RENDER_PROJECTION_THRESHOLD = 220
const EMPTY_RENDER_PROJECTION_IDS = new Set()
const renderProjection = computed(() => {
  const projectionEnabled =
    canvasStore.nodes.length > RENDER_PROJECTION_THRESHOLD &&
    canvasBoardSize.value.width > 0 &&
    canvasBoardSize.value.height > 0

  const projection = projectCanvasRenderState({
    nodes: canvasStore.nodes,
    edges: canvasStore.edges,
    viewport: canvasStore.viewport,
    containerRect: canvasBoardSize.value,
    // 小画布不读取选择状态，避免点选节点时仅因 selectedIds 改变而重建 Vue Flow 节点。
    selectedIds: projectionEnabled ? virtualizationSelectedIds.value : EMPTY_RENDER_PROJECTION_IDS,
    activeIds: projectionEnabled ? renderProjectionActiveIds.value : EMPTY_RENDER_PROJECTION_IDS,
    performanceMode: canvasPerformanceMode.value,
    threshold: RENDER_PROJECTION_THRESHOLD,
    bufferRatio: 1.75
  })

  if (projection.enabled) return projection

  // Vue Flow 通过 nodes/edges 数组引用同步外部 data。节点状态变化时提供新数组，
  // 让“生成中”和最终媒体结果立即进入内部节点；纯选择变化不会触发本 computed。
  return {
    ...projection,
    nodes: [...projection.nodes],
    edges: [...projection.edges]
  }
})
const renderedFlowNodes = computed(() => renderProjection.value.nodes)
const renderedFlowEdges = computed(() => renderProjection.value.edges)

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
        sourcePosition: canvasStore.dragConnectionStartPosition,
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

onNodeDragStart((event) => {
  const node = event.node
  if (node?.type !== 'group') return

  const storeGroupNode = canvasStore.nodes.find(n => n.id === node.id && n.type === 'group')
  const startPosition = {
    ...(storeGroupNode?.position || node.position || { x: 0, y: 0 })
  }
  groupDragStartPositions.set(node.id, startPosition)

  // 刷新后以当前已渲染的子节点坐标为准，校准可能过期的持久化偏移快照。
  // 后续拖拽帧继续使用这份稳定快照，避免子节点坐标随每帧移动而重复累加。
  rebaseGroupNodeOffsets(storeGroupNode, startPosition)
})

// 处理节点拖拽结束
onNodeDragStop((event) => {
  const node = event.node
  const previousGroupPosition = node.type === 'group'
    ? (groupDragStartPositions.get(node.id) || { ...(canvasStore.nodes.find(n => n.id === node.id)?.position || node.position || { x: 0, y: 0 }) })
    : null
  
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
  
  // Vue Flow 会同时移动所有选中节点，结束时必须一次性写回整组选区。
  // 对齐吸附产生的偏移也统一应用，避免节点间相对位置发生变化。
  const draggedNodes = event.nodes?.length ? event.nodes : [node]
  canvasStore.updateNodePositionsBatch(
    getDraggedNodeFinalPositions(draggedNodes, node, finalPosition)
  )
  
  // 如果拖拽的是编组节点，同步更新组内节点位置
  if (node.type === 'group') {
    syncGroupChildrenPositions({ ...node, position: finalPosition }, {
      previousPosition: previousGroupPosition
    })
    groupDragStartPositions.delete(node.id)
  }
  
  // 普通节点根据落点自动加入、切换或移出编组
  if (node.type !== 'group') {
    commitNodeGroupDrop({ ...node, position: finalPosition })
  }
  
  // 🚀 性能优化：通知节点恢复正常渲染质量
  window.dispatchEvent(new CustomEvent('canvas-drag-end'))
  emit('organization-mutation-end')
})


// 处理节点拖拽中（实时同步）
onNodeDrag((event) => {
  const node = event.node

  // 🚀 性能优化：标记拖拽开始，首次拖拽时触发
  if (!isDraggingNode.value) {
    emit('organization-mutation-start')
    isDraggingNode.value = true
    // 通知节点降低渲染质量
    window.dispatchEvent(new CustomEvent('canvas-drag-start'))
  }

  // 如果拖拽的是编组节点，实时同步组内节点位置
  // 性能优化: 用 rAF 节流，每帧最多同步一次，拖大组时不再每帧都做 O(n) 位置遍历
  if (node.type === 'group') {
    if (_syncGroupRafId) cancelAnimationFrame(_syncGroupRafId)
    _syncGroupRafId = requestAnimationFrame(() => {
      syncGroupChildrenPositions(node, {
        previousPosition: groupDragStartPositions.get(node.id)
      })
      _syncGroupRafId = null
    })
  }

  scheduleActiveEdgePathsRead()

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
  
  // 🚀 性能优化：按性能档位禁用对齐辅助线
  //   reduced / minimal：完全禁用（>200 节点）
  //   30+ 节点：兜底禁用，对齐计算 O(n) 太贵
  if (shouldDisableAlignmentGuides.value || canvasStore.nodes.length > 30) {
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

function getNodeSize(node) {
  const defaultSizes = {
    'text-input': { width: 400, height: 280 },
    'text': { width: 400, height: 280 },
    'image-input': { width: 380, height: 320 },
    'image': { width: 380, height: 320 },
    'image-gen': { width: 380, height: 320 },
    'video-input': { width: 420, height: 280 },
    'video': { width: 420, height: 280 },
    'video-gen': { width: 420, height: 280 },
    'seedance-character': { width: 220, height: 220 },
    'bytefor-character': { width: 220, height: 220 },
    'storyboard': { width: 720, height: 360 }
  }
  const defaults = defaultSizes[node.type] || { width: 380, height: 280 }
  return {
    width: node.dimensions?.width || node.data?.width || node.data?.nodeWidth || defaults.width,
    height: node.dimensions?.height || node.data?.height || defaults.height
  }
}

function updateGroupOffsetForNode(node) {
  const groupId = node.data?.groupId
  const groupNode = canvasStore.nodes.find(n => n.id === groupId && n.type === 'group')
  if (!groupNode) return

  const nodeOffsets = {
    ...(groupNode.data?.nodeOffsets || {}),
    [node.id]: {
      x: node.position.x - groupNode.position.x,
      y: node.position.y - groupNode.position.y
    }
  }

  canvasStore.updateNodeData(groupId, { nodeOffsets })
}

function commitNodeGroupDrop(node) {
  const storeNode = canvasStore.nodes.find(candidate => candidate.id === node?.id)
  if (!storeNode || storeNode.type === 'group') return null

  const sourceGroupId = storeNode.data?.groupId || null
  const targetGroupId = getNodeDropGroupId(
    canvasStore.nodes,
    storeNode,
    node.position,
    getNodeSize(storeNode)
  )

  if (targetGroupId !== sourceGroupId) {
    canvasStore.moveNodeToGroup(storeNode.id, targetGroupId)

    // moveNodeToGroup 在加入目标组时可能为节点补齐边距，同步 Vue Flow 内部坐标。
    const movedNode = canvasStore.nodes.find(candidate => candidate.id === storeNode.id)
    const internalNode = typeof findNode === 'function' ? findNode(storeNode.id) : null
    if (movedNode && internalNode) {
      internalNode.position = { ...movedNode.position }
    }
  } else if (sourceGroupId) {
    updateGroupOffsetForNode({ ...storeNode, position: node.position })
  }

  return targetGroupId
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
function syncGroupChildrenPositions(groupNode, options = {}) {
  if (!groupNode?.id || groupNode.type !== 'group') return

  const storeGroupNode = canvasStore.nodes.find(n => n.id === groupNode.id && n.type === 'group')
  const mergedData = {
    ...(storeGroupNode?.data || {}),
    ...(groupNode.data || {})
  }
  if (storeGroupNode?.data?.nodeOffsets) {
    mergedData.nodeOffsets = storeGroupNode.data.nodeOffsets
  }

  const groupForMove = {
    ...(storeGroupNode || {}),
    ...groupNode,
    data: mergedData
  }
  const result = getMovedGroupChildPositions(
    canvasStore.nodes,
    groupForMove,
    groupNode.position,
    {
      previousPosition: options.previousPosition || storeGroupNode?.position
    }
  )

  const positionsById = {
    [groupNode.id]: { ...groupNode.position },
    ...result.childPositions
  }
  canvasStore.updateNodePositionsBatch(positionsById)

  // 关键修复：同步 Vue Flow 内部 node.position，确保拖拽编组时子节点 DOM 实时跟随。
  // 单向 :nodes 绑定下，外部 mutate node.position（改属性不改数组引用）不触发 Vue Flow 内部 store 同步，
  // updateNodePositionsBatch 虽改了 Pinia store 子节点坐标，但 Vue Flow 不重绘子节点 DOM，
  // 子节点留在原地、编组移走 → 视觉上"跑出编组"。用 findNode 直接改内部 node.position 强制重绘。
  if (typeof findNode === 'function') {
    for (const childId in result.childPositions) {
      const internalNode = findNode(childId)
      if (internalNode) {
        internalNode.position = { ...result.childPositions[childId] }
      }
    }
  }

  if (result.offsetsChanged && Object.keys(result.nodeOffsets).length > 0) {
    canvasStore.updateNodeData(groupNode.id, { nodeOffsets: result.nodeOffsets })
  }
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
  
  // 画布选择模式：拦截点击，发送给父组件
  if (props.pickMode) {
    const pickableTypes = [
      'image', 'image-input', 'image-gen', 'imageGen', 'text-to-image', 'image-to-image', 'grid-preview',
      'video', 'video-input', 'video-gen', 'videoGen', 'text-to-video', 'image-to-video',
      'audio', 'audio-input'
    ]
    if (pickableTypes.includes(node.type)) {
      emit('pick-node', node.id)
    }
    return // 不执行正常的选中逻辑
  }
  
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
  
  // 取消所有节点的选中状态（Vue Flow 内部 + store）
  removeSelectedNodes(getSelectedNodes.value)
  selectedNodeIds.value = []
  canvasStore.setSelectedNodeIds([])
  canvasStore.clearSelection()
  canvasStore.closeAllContextMenus()
  
  // 隐藏底部面板
  canvasStore.isBottomPanelVisible = false
  
  // 更新鼠标位置
  rememberCanvasMousePosition(event)
  
  // 通知父组件画布空白区域被点击（用于关闭侧边面板）
  emit('pane-click', event)
})

// 处理画布右键（空白区域右键菜单）
onPaneContextMenu((event) => {
  event.preventDefault()
  
  // 右键拖动平移后，抑制菜单弹出
  if (rightDragSuppressContextMenu.value) {
    rightDragSuppressContextMenu.value = false
    return
  }
  
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
  rememberCanvasMousePosition(event)
  
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

function getCanvasBoardRect() {
  return canvasBoardRef.value?.getBoundingClientRect?.() || null
}

function rememberCanvasMousePosition(event) {
  const screenPosition = { x: event.clientX, y: event.clientY }
  if (isScreenPointInsideRect(screenPosition, getCanvasBoardRect())) {
    lastMousePosition.value = screenPosition
  }
}

function getCanvasPasteScreenPosition() {
  return resolveCanvasPasteScreenPosition({
    lastMousePosition: lastMousePosition.value,
    canvasRect: getCanvasBoardRect()
  })
}

// 键盘事件处理
function isTextInputEventTarget(target) {
  return !!(
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable ||
    target?.closest?.('input, textarea, select, [contenteditable="true"]')
  )
}

function handleKeyDown(event) {
  if (event.key === 'Shift' || event.key === 'Control') {
    isSelectionModifierPressed.value = true
  }

  const target = event.target
  const isInInput = isTextInputEventTarget(target)
  const isCtrlOrCmd = event.ctrlKey || event.metaKey

  // 焦点在输入框内时，Ctrl+C 且无选中文本 → 复制选中节点
  if (isInInput && isCtrlOrCmd && event.key === 'c') {
    let hasSelectedText = false
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      hasSelectedText = target.selectionStart !== target.selectionEnd
    } else {
      const selection = window.getSelection()
      hasSelectedText = !!(selection?.toString())
    }
    if (!hasSelectedText) {
      event.preventDefault()
      canvasStore.copySelectedNodes()
      return
    }
    return
  }

  if (isInInput) {
    return
  }
  
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
    if (canvasStore.isDraggingConnection) {
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
  
  // Ctrl+V 粘贴 — 不在此处处理，交由 paste 事件统一处理（支持系统剪贴板图片/文件）
  if (isCtrlOrCmd && event.key === 'v') {
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
  if (event.key === 'Shift' || event.key === 'Control') {
    isSelectionModifierPressed.value = event.shiftKey || event.ctrlKey
  }

  // 空格键释放：禁用平移模式
  if (event.key === ' ') {
    event.preventDefault()
    isSpacePressed.value = false
    isPanning.value = false
    document.body.style.cursor = 'default'
    console.log('[Canvas] 空格键释放，禁用平移模式')
  }
}

// 鼠标按下事件（用于空格+拖动平移 / 鼠标中键平移 / 右键拖动平移）
function handleMouseDown(event) {
  // 空格键 + 左键：平移画布
  if (isSpacePressed.value && event.button === 0) {
    event.preventDefault()
    isPanning.value = true
    panStart.value = { x: event.clientX, y: event.clientY }
    document.body.style.cursor = 'grabbing'
    console.log('[Canvas] 开始空格键平移')
    return
  }
  // 鼠标中键：始终平移画布（无论在空白处还是节点上）
  if (event.button === 1) {
    event.preventDefault()
    isPanning.value = true
    isMiddleButtonPanning.value = true
    panStart.value = { x: event.clientX, y: event.clientY }
    document.body.style.cursor = 'grabbing'
    return
  }
  // 无限画布模式：右键在空白处按下，准备拖动平移
  if (event.button === 2 && interactionMode.value === 'infinite-canvas') {
    const target = event.target
    const isOnNode = target.closest('.vue-flow__node')
    if (!isOnNode) {
      isRightButtonDown.value = true
      rightDragSuppressContextMenu.value = false
      panStart.value = { x: event.clientX, y: event.clientY }
    }
  }
}

// 鼠标移动事件（用于空格+拖动平移 / 鼠标中键平移 / 右键拖动平移）
function handleMouseMove(event) {
  rememberCanvasMousePosition(event)

  // 右键按下但还未开始平移：检测是否超过阈值
  if (isRightButtonDown.value && !isRightButtonPanning.value) {
    const dx = event.clientX - panStart.value.x
    const dy = event.clientY - panStart.value.y
    if (Math.abs(dx) > RIGHT_DRAG_THRESHOLD || Math.abs(dy) > RIGHT_DRAG_THRESHOLD) {
      isRightButtonPanning.value = true
      rightDragSuppressContextMenu.value = true
      isPanning.value = true
      document.body.style.cursor = 'grabbing'
    }
    return
  }

  if (!isPanning.value) return
  if (!isSpacePressed.value && !isMiddleButtonPanning.value && !isRightButtonPanning.value) return

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

// 鼠标释放事件（用于空格+拖动平移 / 鼠标中键平移 / 右键拖动平移）
function handleMouseUp(event) {
  // 右键释放
  if (event.button === 2) {
    const wasPanning = isRightButtonPanning.value
    isRightButtonDown.value = false
    isRightButtonPanning.value = false
    if (wasPanning) {
      isPanning.value = false
      document.body.style.cursor = isSpacePressed.value ? 'grab' : 'default'
    }
    return
  }
  if (isPanning.value) {
    event.preventDefault()
    isPanning.value = false
    isMiddleButtonPanning.value = false
    document.body.style.cursor = isSpacePressed.value ? 'grab' : 'default'
  }
}

function getTouchByIdentifier(touches, identifier) {
  for (const touch of touches || []) {
    if (touch.identifier === identifier) return touch
  }
  return null
}

function getElementCenterScreenPosition(element) {
  const rect = element?.getBoundingClientRect?.()
  if (!rect) return null
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

function isEditableTouchTarget(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable="true"]')
}

function isInteractiveTouchTarget(target) {
  return !!target?.closest?.([
    'button',
    'a',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[contenteditable="true"]',
    '.config-panel',
    '.quick-action',
    '.left-quick-menu',
    '.left-quick-menu-item',
    '.panel-frame-item',
    '.panel-frame-add',
    '.panel-frame-remove',
    '.toolbar-btn',
    '.toolbar-btn-wrapper',
    '.image-edit-dropdown',
    '.image-edit-dropdown-item',
    '.grid-crop-dropdown',
    '.grid-crop-dropdown-item',
    '.model-selector-trigger',
    '.model-selector-custom',
    '.preset-selector-trigger',
    '.preset-selector-custom',
    '.model-trigger',
    '.collapse-trigger',
    '.sora2-collapse-trigger',
    '.toggle-switch',
    '.sora2-toggle-switch',
    '.number-btn',
    '.upload-overlay-btn',
    '.retry-btn',
    '.overlay-action-btn',
    '.preview-output-image-btn',
    '.replace-output-image-btn',
    '.param-chip',
    '.count-display.clickable'
  ].join(', '))
}

function getTouchConnectionButton(target) {
  const rightButton = target?.closest?.('.node-add-btn-right')
  if (rightButton) return rightButton

  const genericButton = target?.closest?.('.node-add-btn')
  if (genericButton && !genericButton.classList.contains('node-add-btn-left')) {
    return genericButton
  }

  return null
}

function getTouchTargetNodeId(target) {
  const nodeEl = target?.closest?.('.vue-flow__node')
  return nodeEl?.getAttribute?.('data-id') || null
}

function isNodeSelectedForTouchDelete(nodeId) {
  if (!nodeId) return false
  if (canvasStore.selectedNodeId === nodeId) return true
  if (Array.isArray(canvasStore.selectedNodeIds) && canvasStore.selectedNodeIds.includes(nodeId)) return true

  const selectedNodes = getSelectedNodes.value || []
  return selectedNodes.some(node => node.id === nodeId)
}

function selectSingleNodeFromTouch(nodeId) {
  if (!nodeId) return
  const nodeExists = canvasStore.nodes.some(node => node.id === nodeId)
  if (!nodeExists) return

  canvasStore.nodes.forEach(node => {
    node.selected = node.id === nodeId
  })
  selectedNodeIds.value = [nodeId]
  canvasStore.setSelectedNodeIds([nodeId])
  canvasStore.selectNode(nodeId)
  canvasStore.closeAllContextMenus()
}

function shouldStartTouchPan(target) {
  if (!target?.closest) return false
  if (isEditableTouchTarget(target)) return false
  if (target.closest('.vue-flow__node')) return false
  if (target.closest('.vue-flow__controls, .vue-flow__minimap')) return false
  if (isInteractiveTouchTarget(target)) return false
  return !!target.closest('.canvas-board')
}

function ensureGlobalTouchListeners() {
  if (globalTouchListenersAttached) return
  window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
  window.addEventListener('touchend', handleTouchEnd, { capture: true })
  window.addEventListener('touchcancel', handleTouchCancel, { capture: true })
  globalTouchListenersAttached = true
}

function removeGlobalTouchListeners() {
  if (!globalTouchListenersAttached) return
  window.removeEventListener('touchmove', handleTouchMove, { capture: true })
  window.removeEventListener('touchend', handleTouchEnd, { capture: true })
  window.removeEventListener('touchcancel', handleTouchCancel, { capture: true })
  globalTouchListenersAttached = false
}

function clearTouchConnectionTimer() {
  if (!touchConnectionLongPressTimer) return
  clearTimeout(touchConnectionLongPressTimer)
  pendingTimeouts.delete(touchConnectionLongPressTimer)
  touchConnectionLongPressTimer = null
}

function clearTouchLongPressTimer() {
  if (!touchLongPressTimer) return
  clearTimeout(touchLongPressTimer)
  pendingTimeouts.delete(touchLongPressTimer)
  touchLongPressTimer = null
}

function handleTouchStart(event) {
  if (!event.touches?.length || !canvasBoardRef.value?.contains(event.target)) return
  if (touchState?.mode === 'connection-pending' || touchState?.mode === 'connection-drag') {
    event.preventDefault()
    return
  }

  if (event.touches.length === 1) {
    const connectionButton = getTouchConnectionButton(event.target)
    if (connectionButton) {
      handleTouchConnectionStart(event, connectionButton)
      return
    }

    const nodeId = getTouchTargetNodeId(event.target)
    if (nodeId && !isInteractiveTouchTarget(event.target)) {
      startSelectedNodeTouchDelete(event, nodeId)
      return
    }

    if (!shouldStartTouchPan(event.target)) return

    startBlankTouchLongPress(event)
    return
  }

  if (event.touches.length === 2 && !isEditableTouchTarget(event.target)) {
    const midpoint = getTouchMidpoint(event.touches[0], event.touches[1])
    const rect = getCanvasBoardRect()
    if (!midpoint || !rect) return

    event.preventDefault()
    touchState = {
      mode: 'pinch',
      lastDistance: getTouchDistance(event.touches[0], event.touches[1]),
      lastCenter: { x: midpoint.x - rect.left, y: midpoint.y - rect.top }
    }
    ensureGlobalTouchListeners()
  }
}

function startBlankTouchLongPress(event) {
  const touch = event.touches?.[0]
  const point = getTouchPoint(touch)
  if (!touch || !point) return

  event.preventDefault()
  touchState = {
    mode: 'blank-long-press',
    identifier: touch.identifier,
    startPoint: point,
    lastPoint: point,
    hasMoved: false
  }

  clearTouchLongPressTimer()
  touchLongPressTimer = setTimeout(() => {
    pendingTimeouts.delete(touchLongPressTimer)
    touchLongPressTimer = null
    if (!touchState || touchState.mode !== 'blank-long-press' || touchState.hasMoved) return

    const flowPosition = screenToFlowPosition(touchState.lastPoint)
    canvasStore.openNodeSelector(
      touchState.lastPoint,
      'canvas',
      null,
      flowPosition
    )
    resetTouchState()
  }, TOUCH_LONG_PRESS_DURATION)
  pendingTimeouts.add(touchLongPressTimer)
  ensureGlobalTouchListeners()
}

function startSelectedNodeTouchDelete(event, nodeId) {
  const touch = event.touches?.[0]
  const point = getTouchPoint(touch)
  if (!touch || !point) return

  event.preventDefault()
  event.stopPropagation()

  touchState = {
    mode: 'node-delete-pending',
    identifier: touch.identifier,
    nodeId,
    startPoint: point,
    lastPoint: point,
    hasMoved: false
  }

  clearTouchLongPressTimer()
  touchLongPressTimer = setTimeout(() => {
    pendingTimeouts.delete(touchLongPressTimer)
    touchLongPressTimer = null
    if (!touchState || touchState.mode !== 'node-delete-pending' || touchState.hasMoved) return

    const node = canvasStore.nodes.find(n => n.id === touchState.nodeId)
    if (node) {
      canvasStore.closeCanvasContextMenu()
      canvasStore.openContextMenu(
        touchState.lastPoint,
        node
      )
    }
    resetTouchState()
  }, TOUCH_LONG_PRESS_DURATION)
  pendingTimeouts.add(touchLongPressTimer)
  ensureGlobalTouchListeners()
}

function handleTouchConnectionStart(event, button) {
  const touch = event.touches?.[0]
  const point = getTouchPoint(touch)
  const nodeId = getTouchTargetNodeId(button)
  if (!touch || !point || !nodeId) return

  event.preventDefault()
  event.stopPropagation()

  touchState = {
    mode: 'connection-pending',
    identifier: touch.identifier,
    nodeId,
    button,
    startPoint: point,
    lastPoint: point
  }

  startTouchConnectionDrag()
  ensureGlobalTouchListeners()
}

function startTouchConnectionDrag() {
  if (!touchState || touchState.mode !== 'connection-pending') return

  const buttonCenter = getElementCenterScreenPosition(touchState.button)
  if (!buttonCenter) return

  const startPosition = screenToFlowPosition(buttonCenter)
  canvasStore.startDragConnection(touchState.nodeId, 'output', startPosition)
  touchState = {
    ...touchState,
    mode: 'connection-drag'
  }

  const flowPos = screenToFlowPosition(touchState.lastPoint)
  canvasStore.updateDragConnectionPosition(flowPos)
}

function handleTouchMove(event) {
  if (!touchState) return

  if (touchState.mode === 'connection-pending' || touchState.mode === 'connection-drag') {
    handleTouchConnectionMove(event)
    return
  }

  if (touchState.mode === 'pan') {
    handleTouchPanMove(event)
    return
  }

  if (touchState.mode === 'blank-long-press') {
    handleBlankTouchLongPressMove(event)
    return
  }

  if (touchState.mode === 'node-delete-pending') {
    handleSelectedNodeTouchDeleteMove(event)
    return
  }

  if (touchState.mode === 'node-drag') {
    handleTouchNodeDragMove(event)
    return
  }

  if (touchState.mode === 'pinch') {
    handleTouchPinchMove(event)
  }
}

function handleTouchConnectionMove(event) {
  const touch = getTouchByIdentifier(event.touches, touchState.identifier)
  const point = getTouchPoint(touch)
  if (!point) return

  event.preventDefault()
  event.stopPropagation()
  touchState.lastPoint = point

  if (touchState.mode === 'connection-pending') {
    const dx = point.x - touchState.startPoint.x
    const dy = point.y - touchState.startPoint.y
    if (Math.sqrt(dx * dx + dy * dy) > TOUCH_CONNECTION_DRAG_THRESHOLD) {
      clearTouchConnectionTimer()
      startTouchConnectionDrag()
    }
  }

  if (touchState.mode === 'connection-drag') {
    const flowPos = screenToFlowPosition(point)
    canvasStore.updateDragConnectionPosition(flowPos)
  }
}

function handleTouchPanMove(event) {
  const touch = getTouchByIdentifier(event.touches, touchState.identifier)
  const point = getTouchPoint(touch)
  if (!point) return

  const totalDx = point.x - touchState.startPoint.x
  const totalDy = point.y - touchState.startPoint.y
  const movedEnough = Math.sqrt(totalDx * totalDx + totalDy * totalDy) > TOUCH_PAN_THRESHOLD
  if (!touchState.hasMoved && !movedEnough) return

  event.preventDefault()
  touchState.hasMoved = true

  const delta = {
    dx: point.x - touchState.lastPoint.x,
    dy: point.y - touchState.lastPoint.y
  }
  const viewport = getViewport()
  setViewport(applyPanToViewport(viewport, delta))
  markViewportMoving()
  touchState.lastPoint = point
}

function didTouchMovePastLongPressThreshold(point) {
  const dx = point.x - touchState.startPoint.x
  const dy = point.y - touchState.startPoint.y
  return Math.sqrt(dx * dx + dy * dy) > TOUCH_LONG_PRESS_MOVE_THRESHOLD
}

function handleBlankTouchLongPressMove(event) {
  const touch = getTouchByIdentifier(event.touches, touchState.identifier)
  const point = getTouchPoint(touch)
  if (!point) return

  if (!didTouchMovePastLongPressThreshold(point)) {
    touchState.lastPoint = point
    return
  }

  event.preventDefault()
  clearTouchLongPressTimer()
  touchState.hasMoved = true

  const delta = {
    dx: point.x - touchState.lastPoint.x,
    dy: point.y - touchState.lastPoint.y
  }
  const viewport = getViewport()
  setViewport(applyPanToViewport(viewport, delta))
  markViewportMoving()

  touchState = {
    ...touchState,
    mode: 'pan',
    lastPoint: point,
    hasMoved: true
  }
}

function handleSelectedNodeTouchDeleteMove(event) {
  const touch = getTouchByIdentifier(event.touches, touchState.identifier)
  const point = getTouchPoint(touch)
  if (!point) return

  if (!didTouchMovePastLongPressThreshold(point)) return

  event.preventDefault()
  event.stopPropagation()
  clearTouchLongPressTimer()
  startTouchNodeDrag(point)
}

function handleTouchNodeDragMove(event) {
  const touch = getTouchByIdentifier(event.touches, touchState.identifier)
  const point = getTouchPoint(touch)
  if (!point) return

  event.preventDefault()
  event.stopPropagation()
  moveTouchDraggedNode(point)
}

function moveTouchDraggedNode(point) {
  if (!touchState?.nodeId || !touchState.lastPoint) return
  const node = canvasStore.nodes.find(n => n.id === touchState.nodeId)
  if (!node) return
  const previousGroupPosition = node.type === 'group'
    ? { ...(node.position || { x: 0, y: 0 }) }
    : null

  const viewport = getViewport()
  const zoom = viewport?.zoom || 1
  const delta = {
    x: (point.x - touchState.lastPoint.x) / zoom,
    y: (point.y - touchState.lastPoint.y) / zoom
  }
  const nextPosition = {
    x: node.position.x + delta.x,
    y: node.position.y + delta.y
  }

  canvasStore.updateNodePosition(node.id, nextPosition)

  if (node.type === 'group') {
    syncGroupChildrenPositions({ ...node, position: nextPosition }, {
      previousPosition: previousGroupPosition
    })
  }

  scheduleActiveEdgePathsRead()
  touchState.lastPoint = point
}

function startTouchNodeDrag(point) {
  selectSingleNodeFromTouch(touchState.nodeId)
  const node = canvasStore.nodes.find(n => n.id === touchState.nodeId)
  if (node?.type === 'group') {
    rebaseGroupNodeOffsets(node, node.position)
  }
  touchState = {
    ...touchState,
    mode: 'node-drag',
    hasMoved: true
  }

  if (!isDraggingNode.value) {
    emit('organization-mutation-start')
    isDraggingNode.value = true
    window.dispatchEvent(new CustomEvent('canvas-drag-start'))
  }

  moveTouchDraggedNode(point)
}

function finishTouchNodeDrag() {
  const node = canvasStore.nodes.find(candidate => candidate.id === touchState?.nodeId)
  if (node?.type !== 'group') {
    commitNodeGroupDrop(node)
  }

  alignmentGuides.value = { vertical: null, horizontal: null }
  snapPosition.value = { x: null, y: null }
  if (alignmentThrottleTimer.value) {
    cancelAnimationFrame(alignmentThrottleTimer.value)
    alignmentThrottleTimer.value = null
  }

  isDraggingNode.value = false
  window.dispatchEvent(new CustomEvent('canvas-drag-end'))
  emit('organization-mutation-end')
}

function handleTouchPinchMove(event) {
  if (event.touches.length < 2) return

  const midpoint = getTouchMidpoint(event.touches[0], event.touches[1])
  const rect = getCanvasBoardRect()
  if (!midpoint || !rect) return

  const distance = getTouchDistance(event.touches[0], event.touches[1])
  if (!distance || !touchState.lastDistance) return

  event.preventDefault()

  const center = { x: midpoint.x - rect.left, y: midpoint.y - rect.top }
  const centerDelta = {
    dx: center.x - touchState.lastCenter.x,
    dy: center.y - touchState.lastCenter.y
  }
  const viewport = applyPanToViewport(getViewport(), centerDelta)
  const nextZoom = viewport.zoom * (distance / touchState.lastDistance)
  setViewport(applyZoomAtScreenPoint(viewport, nextZoom, center, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }))
  markViewportMoving()

  touchState.lastDistance = distance
  touchState.lastCenter = center
}

function handleTouchEnd(event) {
  if (!touchState) return

  if (touchState.mode === 'blank-long-press') {
    if (canvasStore.isNodeSelectorOpen) {
      canvasStore.closeNodeSelector()
    }
    canvasStore.closeAllContextMenus()
    clearTouchLongPressTimer()
    resetTouchState()
    return
  }

  if (touchState.mode === 'node-delete-pending') {
    if (!touchState.hasMoved) {
      selectSingleNodeFromTouch(touchState.nodeId)
    }
    clearTouchLongPressTimer()
    resetTouchState()
    return
  }

  if (touchState.mode === 'node-drag') {
    event.preventDefault()
    event.stopPropagation()
    finishTouchNodeDrag()
    resetTouchState()
    return
  }

  if (touchState.mode === 'connection-pending') {
    event.preventDefault()
    event.stopPropagation()
    clearTouchConnectionTimer()
    canvasStore.openNodeSelector(touchState.lastPoint, 'node', touchState.nodeId)
    resetTouchState()
    return
  }

  if (touchState.mode === 'connection-drag') {
    event.preventDefault()
    event.stopPropagation()
    clearTouchConnectionTimer()
    finishDragConnectionAtScreenPosition(touchState.lastPoint)
    resetTouchState()
    return
  }

  if (touchState.mode === 'pinch' && event.touches.length === 1) {
    const touch = event.touches[0]
    const point = getTouchPoint(touch)
    if (!point) {
      resetTouchState()
      return
    }
    touchState = {
      mode: 'pan',
      identifier: touch.identifier,
      startPoint: point,
      lastPoint: point,
      hasMoved: true
    }
    return
  }

  if (event.touches.length === 0) {
    resetTouchState()
  }
}

function handleTouchCancel() {
  if (touchState?.mode === 'connection-drag') {
    canvasStore.cancelDragConnection()
  }
  clearTouchConnectionTimer()
  clearTouchLongPressTimer()
  resetTouchState()
}

function resetTouchState() {
  touchState = null
  clearTouchConnectionTimer()
  clearTouchLongPressTimer()
  removeGlobalTouchListeners()
}

// 删除选中的元素（节点和连线）
// 只通过 store 修改数据（v-model 会自动同步到 VueFlow），不再同时调用 VueFlow API，
// 避免双写导致 VueFlow 内部状态损坏、画布冻结
function deleteSelectedElements() {
  const selectedNodes = getSelectedNodes.value
  const selectedEdges = getSelectedEdges.value
  
  if (selectedNodes.length === 0 && selectedEdges.length === 0) return
  
  // 编组节点：解散编组而不是删除内部节点
  const groupNodes = selectedNodes.filter(n => n.type === 'group')
  const normalNodes = selectedNodes.filter(n => n.type !== 'group')
  
  if (groupNodes.length > 0) {
    groupNodes.forEach(groupNode => {
      const nodeIds = groupNode.data?.nodeIds || []
      nodeIds.forEach(nodeId => {
        const node = canvasStore.nodes.find(n => n.id === nodeId)
        if (node) node.draggable = true
      })
      canvasStore.disbandGroup(groupNode.id)
      canvasStore.removeNode(groupNode.id)
    })
  }
  
  // 批量删除普通节点（只保存一次历史）
  if (normalNodes.length > 0) {
    canvasStore.removeNodesBatch(normalNodes.map(n => n.id))
  }
  
  // 删除额外选中的连线（不属于已删节点的独立连线）
  if (selectedEdges.length > 0) {
    canvasStore.saveHistory({ force: true })
    selectedEdges.forEach(e => canvasStore.removeEdge(e.id))
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
  canvasStore.createVisibleGroup(nodeIds, null, { geometryNodes: selectedNodes })
}

// 同步视口变化到 store
// 标记是否正在从外部更新视口（用于避免循环更新）
let isExternalViewportUpdate = false

// 🚀 视口变化节流：拖拽/缩放时高频触发，节流减少 store 更新
let viewportRAF = null
let _isPanning = false
let _panEndTimer = null
function handleViewportChange(viewport) {
  if (isExternalViewportUpdate) return
  markViewportMoving()
  
  if (!_isPanning) {
    _isPanning = true
    window.dispatchEvent(new CustomEvent('canvas-drag-start'))
  }
  if (_panEndTimer) clearTimeout(_panEndTimer)
  _panEndTimer = setTimeout(() => {
    _isPanning = false
    window.dispatchEvent(new CustomEvent('canvas-drag-end'))
  }, 150)
  
  if (viewportRAF) return
  viewportRAF = requestAnimationFrame(() => {
    viewportRAF = null
    canvasStore.updateViewport(viewport)
  })
}

// 监听 store 的 viewport 变化，同步到 VueFlow（支持滑块拖动等外部控制）
// 性能优化: 改用浅监听 + 手动比对字段，避免 deep:true 对整个 viewport 对象做深度递归代理
watch(
  () => [canvasStore.viewport.x, canvasStore.viewport.y, canvasStore.viewport.zoom],
  ([newX, newY, newZoom]) => {
    if (!setViewport || !getViewport) return

    const clampedZoom = clampCanvasZoom(newZoom)
    if (clampedZoom !== newZoom) {
      canvasStore.updateViewport({ x: newX, y: newY, zoom: clampedZoom })
      return
    }

    // 获取当前 VueFlow 的视口
    const currentViewport = getViewport()

    // 检查是否需要更新（避免不必要的更新和循环）
    const needsUpdate =
      Math.abs(currentViewport.x - newX) > 0.01 ||
      Math.abs(currentViewport.y - newY) > 0.01 ||
      Math.abs(currentViewport.zoom - newZoom) > 0.001

    if (needsUpdate) {
      // 标记正在从外部更新，防止 handleViewportChange 触发循环
      isExternalViewportUpdate = true
      setViewport({ x: newX, y: newY, zoom: newZoom })
      // 延迟重置标志，确保 viewport-change 事件已被处理
      const viewportTimeoutId = setTimeout(() => {
        pendingTimeouts.delete(viewportTimeoutId)
        isExternalViewportUpdate = false
      }, 50)
      pendingTimeouts.add(viewportTimeoutId)
    }
  }
)

// 处理边的变化（包括删除）
function handleEdgesChange(changes) {
  changes.forEach(change => {
    if (change.type === 'remove') {
      const { id, target, targetHandle } = change
      
      // 防御：边可能已被 store 的 removeNode/removeNodesBatch 删除
      const edgeStillExists = canvasStore.edges.find(e => e.id === id)
      
      const targetNode = canvasStore.nodes.find(n => n.id === target)

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

      if (edgeStillExists) {
        canvasStore.removeEdge(id)
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
  // 右键拖动平移后，抑制菜单弹出
  if (rightDragSuppressContextMenu.value) {
    event.preventDefault()
    rightDragSuppressContextMenu.value = false
    return
  }
  
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
  rememberCanvasMousePosition(event)
  
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
      // 优先使用节点组件传入的起始位置（更准确，因为节点知道自己的真实尺寸）
      // 只有当位置无效时才使用 getHandlePosition 重新计算
      const storeStartPos = canvasStore.dragConnectionStartPosition
      if (storeStartPos && typeof storeStartPos.x === 'number' && typeof storeStartPos.y === 'number') {
        dragLineStartPosition.value = { ...storeStartPos }
        console.log('[CanvasBoard] 使用节点传入的起始位置:', storeStartPos)
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

  console.log('[CanvasBoard] handleGlobalDragConnectionEnd', { isDragging: canvasStore.isDraggingConnection, source: canvasStore.dragConnectionSource })

  if (!canvasStore.isDraggingConnection) return

  finishDragConnectionAtScreenPosition({ x: event.clientX, y: event.clientY })
}

function finishDragConnectionAtScreenPosition(screenPos) {
  if (!canvasStore.isDraggingConnection) return

  try {
    // 检测是否释放在某个节点上
    const targetElement = document.elementFromPoint(screenPos.x, screenPos.y)
    let targetNode = findTargetNode(targetElement)
    const sourceNode = canvasStore.nodes.find(n => n.id === canvasStore.dragConnectionSource?.nodeId)

    if (shouldTreatTargetAsGroupCanvas({ sourceNode, targetNode })) {
      targetNode = null
    }

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
              screenPos.x >= rect.left && screenPos.x <= rect.right &&
              screenPos.y >= rect.top && screenPos.y <= rect.bottom
            ) {
              targetHandleId = `input-${idx}`
            }
          })
        }
      }
    }

    // 计算结束位置
    const flowPos = screenToFlowPosition(screenPos)

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
  } catch (err) {
    console.error('[CanvasBoard] 拖拽连线结束异常:', err)
    // 确保清理拖拽状态，防止画布冻结
    canvasStore.cancelDragConnection()
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
    'video-gen': { width: 420, height: 280 },
    'seedance-character': { width: 220, height: 220 },
    'bytefor-character': { width: 220, height: 220 }
  }
  
  const defaults = defaultSizes[node.type] || { width: 380, height: 280 }
  const nodeWidth = node.data?.width || defaults.width
  const nodeHeight = node.data?.height || defaults.height
  const labelHeight = 28 // 节点标签高度
  const labelMarginBottom = 8 // 标签与卡片之间的间距
  const labelOffset = labelHeight + labelMarginBottom // 标签总偏移（高度 + 间距）
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
  const viewport = getViewport()

  const startScreen = flowPositionToScreenPosition(startPos, viewport)
  const endScreen = flowPositionToScreenPosition(endPos, viewport)
  const screenX1 = startScreen.x
  const screenY1 = startScreen.y
  const screenX2 = endScreen.x
  const screenY2 = endScreen.y
  
  // 计算控制点（水平方向的贝塞尔曲线）
  const dx = Math.abs(screenX2 - screenX1)
  const controlOffset = Math.max(50, dx * 0.5)
  
  return `M ${screenX1} ${screenY1} C ${screenX1 + controlOffset} ${screenY1}, ${screenX2 - controlOffset} ${screenY2}, ${screenX2} ${screenY2}`
})

const connectionFlowLayers = computed(() => {
  const N = 20
  const period = 350
  const maxDash = 150
  const minDash = 8
  const duration = 9
  const opacityPerLayer = 0.045
  return Array.from({ length: N }, (_, i) => {
    const dash = maxDash - i * (maxDash - minDash) / (N - 1)
    const gap = period - dash
    const shift = maxDash - dash
    const delay = -(shift / period) * duration
    return {
      dasharray: `${dash.toFixed(1)} ${gap.toFixed(1)}`,
      opacity: opacityPerLayer,
      delay: `${delay.toFixed(3)}s`
    }
  })
})

const activeFlowPaths = ref([])
let activeFlowPathsRafId = null
let activeFlowPathsFollowupRafId = null

function transformSvgPath(d, vp) {
  if (!d) return ''
  const { x: px, y: py, zoom: z } = vp
  return d.replace(/([MLCSQTA])\s*((?:-?[\d.]+[\s,]*)+)/gi, (_, cmd, args) => {
    const upper = cmd.toUpperCase()
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number)
    if (upper === 'H') return cmd + ' ' + nums.map(n => n * z + px).join(' ')
    if (upper === 'V') return cmd + ' ' + nums.map(n => n * z + py).join(' ')
    const out = []
    for (let i = 0; i < nums.length; i += 2) {
      out.push(nums[i] * z + px)
      if (i + 1 < nums.length) out.push(nums[i + 1] * z + py)
    }
    return cmd + ' ' + out.join(' ')
  })
}

function readActiveEdgePaths() {
  const ids = selectedNodeIds.value
  // 🚀 minimal 模式（>500 节点）禁用选中节点的流动边动画
  if (ids.length === 0 || isEdgeHidden.value || shouldDisableEdgeAnimation.value) {
    activeFlowPaths.value = []
    return
  }
  const selectedSet = new Set(ids)
  const vp = getViewport()
  const el = vueFlowRef.value?.$el || vueFlowRef.value
  if (!el) { activeFlowPaths.value = []; return }

  const paths = []
  for (const edge of canvasStore.edges) {
    if (!selectedSet.has(edge.source) && !selectedSet.has(edge.target)) continue
    const edgeEl = el.querySelector(`g[data-id="${edge.id}"] .vue-flow__edge-path`)
    if (!edgeEl) continue
    const d = edgeEl.getAttribute('d')
    if (d) paths.push(transformSvgPath(d, vp))
  }
  activeFlowPaths.value = paths
}

function scheduleActiveEdgePathsRead() {
  if (activeFlowPathsRafId) return

  activeFlowPathsRafId = requestAnimationFrame(() => {
    activeFlowPathsRafId = null
    readActiveEdgePaths()

    if (!activeFlowPathsFollowupRafId) {
      activeFlowPathsFollowupRafId = requestAnimationFrame(() => {
        activeFlowPathsFollowupRafId = null
        readActiveEdgePaths()
      })
    }
  })
}

const activeEdgeGeometrySignature = computed(() => {
  const ids = selectedNodeIds.value
  if (ids.length === 0 || isEdgeHidden.value) return ''

  const selectedSet = new Set(ids)
  const connectedNodeIds = new Set()
  const connectedEdges = []

  for (const edge of canvasStore.edges) {
    if (!selectedSet.has(edge.source) && !selectedSet.has(edge.target)) continue
    connectedEdges.push(`${edge.id}:${edge.source}:${edge.target}:${edge.sourceHandle || ''}:${edge.targetHandle || ''}`)
    connectedNodeIds.add(edge.source)
    connectedNodeIds.add(edge.target)
  }

  const nodeGeometry = Array.from(connectedNodeIds).sort().map((nodeId) => {
    const node = canvasStore.nodes.find(n => n.id === nodeId)
    if (!node) return `${nodeId}:missing`
    const dimensions = node.dimensions || {}
    const data = node.data || {}
    const outputUrls = data.output?.urls || []
    const sourceImages = data.sourceImages || []
    return [
      node.id,
      node.position?.x,
      node.position?.y,
      dimensions.width,
      dimensions.height,
      data.width,
      data.height,
      data.nodeWidth,
      data.nodeHeight,
      data.status,
      data.output?.url,
      outputUrls.length,
      outputUrls[0],
      sourceImages.length,
      sourceImages[0]
    ].join(':')
  })

  return `${connectedEdges.sort().join('|')}#${nodeGeometry.join('|')}`
})

watch(
  [selectedNodeIds, vfViewport, () => canvasStore.edges.length, activeEdgeGeometrySignature],
  () => { nextTick(scheduleActiveEdgePathsRead) },
  { immediate: true }
)

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
  
  const sourcePos = resolveConnectionSourcePosition(
    pending,
    () => getHandlePosition(pending.sourceNodeId, 'output')
  )
  if (sourcePos.x === 0 && sourcePos.y === 0) return ''
  
  const sourceX = sourcePos.x
  const sourceY = sourcePos.y
  
  // 目标位置
  const targetX = pending.targetPosition.x
  const targetY = pending.targetPosition.y
  
  const viewport = getViewport()
  const startScreen = flowPositionToScreenPosition({ x: sourceX, y: sourceY }, viewport)
  const endScreen = flowPositionToScreenPosition({ x: targetX, y: targetY }, viewport)
  const screenX1 = startScreen.x
  const screenY1 = startScreen.y
  const screenX2 = endScreen.x
  const screenY2 = endScreen.y
  
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
 * 处理 paste 事件 —— 系统剪贴板含图片/文件时优先粘贴系统内容；
 * 否则粘贴最后复制的画布节点。
 */
function handlePaste(event) {
  const target = event.target
  if (isTextInputEventTarget(target)) {
    return
  }

  const clipboardData = event.clipboardData
  const pasteSource = resolveCanvasPasteSource({
    hasNodeClipboard: canvasStore.hasClipboard,
    clipboardData
  })

  if (pasteSource === 'system-files') {
    event.preventDefault()
    handleClipboardFiles(getClipboardFiles(clipboardData))
    return
  }

  if (pasteSource === 'nodes') {
    event.preventDefault()
    const pastePosition = screenToFlowPosition(getCanvasPasteScreenPosition())
    canvasStore.pasteNodes(pastePosition)
    return
  }

  event.preventDefault()
}

/**
 * 从剪贴板文件列表创建画布节点（供 paste 事件 & 右键菜单共用）
 */
function handleClipboardFiles(files, positionOverride) {
  const pos = positionOverride || screenToFlowPosition(getCanvasPasteScreenPosition())
  let offsetX = 0
  let offsetY = 0
  const uploadTasks = []

  for (const file of files) {
    const category = getFileCategory(file)
    if (!category) continue

    const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const blobUrl = URL.createObjectURL(file)
    const fileName = file.name || `clipboard_${Date.now()}`

    if (category === 'image') {
      canvasStore.addNode({
        id: nodeId,
        type: 'image-input',
        position: { x: pos.x + offsetX, y: pos.y + offsetY },
        data: {
          title: fileName,
          nodeRole: 'source',
          sourceImages: [blobUrl],
          isUploading: true
        }
      })
      uploadTasks.push({ file, type: 'image', nodeId, blobUrl, field: 'sourceImages' })
    } else if (category === 'video') {
      canvasStore.addNode({
        id: nodeId,
        type: 'video',
        position: { x: pos.x + offsetX, y: pos.y + offsetY },
        data: {
          title: fileName,
          status: 'success',
          output: { type: 'video', url: blobUrl },
          isUploading: true
        }
      })
      uploadTasks.push({ file, type: 'video', nodeId, blobUrl, field: 'output.url' })
    } else if (category === 'audio') {
      const displayName = fileName.replace(/\.[^/.]+$/, '')
      canvasStore.addNode({
        id: nodeId,
        type: 'audio-input',
        position: { x: pos.x + offsetX, y: pos.y + offsetY },
        data: {
          title: displayName,
          label: displayName,
          audioUrl: blobUrl,
          status: 'success',
          output: { type: 'audio', url: blobUrl },
          isUploading: true
        }
      })
      uploadTasks.push({ file, type: 'audio', nodeId, blobUrl, field: 'audioUrl' })
    }

    offsetX += 50
    offsetY += 50
  }

  if (uploadTasks.length > 0) {
    console.log(`[CanvasBoard] 从剪贴板粘贴 ${uploadTasks.length} 个文件`)
    uploadFilesToCloud(uploadTasks)
  }
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
      
      // 处理 AI 灵感助手对话附件拖拽
      if (data.type === 'ai-chat-attachment' && data.attachment) {
        console.log('[CanvasBoard] 接收到AI对话附件拖放:', data.attachment.name, data.attachment.type)
        const att = data.attachment
        const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        if (att.type === 'image') {
          canvasStore.addNode({
            id: nodeId,
            type: 'image-input',
            position: { x: canvasX, y: canvasY },
            data: {
              title: att.name || '图片',
              label: att.name || '图片',
              sourceImages: [att.url],
              nodeRole: 'source',
              fromAIChat: true
            }
          })
        }else if (att.type === 'video') {
          canvasStore.addNode({
            id: nodeId,
            type: 'video',
            position: { x: canvasX, y: canvasY },
            data: {
              title: att.name || '视频',
              label: att.name || '视频',
              status: 'success',
              output: {
                type: 'video',
                url: att.url
              },
              fromAIChat: true
            }
          })
        }else {
          // 其他文件类型作为文本节点
          canvasStore.addNode({
            id: nodeId,
            type: 'text-input',
            position: { x: canvasX, y: canvasY },
            data: {
              title: att.name || '文件',
              text: att.url,
              fromAIChat: true
            }
          })
        }
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
                thumbnailUrl: asset.thumbnail_url || asset.url,
                thumbnail_url: asset.thumbnail_url || asset.url,
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
                  url: asset.url,
                  thumbnailUrl: asset.thumbnail_url || ''
                },
                thumbnailUrl: asset.thumbnail_url || '',
                thumbnail_url: asset.thumbnail_url || '',
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
          case 'seedance-character':
          case 'bytefor-character':
            {
              const meta = asset.metadata || {}
              const seedanceAssetId = meta.assetId || asset.id
              // assetUrl 用于 <img> 直接展示，按优先级回退到任意可用 URL；
              // 若全部缺失，SeedanceCharacterNode 挂载时会按 assetId 自动解析。
              const seedanceDisplayUrl =
                asset.thumbnail_url ||
                meta.assetUrl ||
                meta.thumbnailUrl ||
                (asset.url && !asset.url.startsWith('asset://') ? asset.url : '') ||
                ''
              canvasStore.addNode({
                id: nodeId,
                type: asset.type === 'bytefor-character' ? 'bytefor-character' : 'seedance-character',
                position: { x: canvasX, y: canvasY },
                data: {
                  title: asset.name || (asset.type === 'bytefor-character' ? 'Bytefor角色' : 'Seedance角色'),
                  assetId: seedanceAssetId,
                  assetUri: meta.assetUri || asset.url || `asset://${seedanceAssetId}`,
                  assetUrl: seedanceDisplayUrl,
                  groupId: meta.groupId,
                  assetName: asset.name,
                  status: meta.status || 'Active',
                  assetType: meta.assetType || 'Image',
                  width: 220,
                  thumbnailUrl: seedanceDisplayUrl,
                  thumbnail_url: seedanceDisplayUrl,
                  output: {
                    type: 'image',
                    url: meta.assetUri || asset.url || `asset://${seedanceAssetId}`,
                    urls: [meta.assetUri || asset.url || `asset://${seedanceAssetId}`],
                    thumbnailUrl: seedanceDisplayUrl
                  },
                  fromAsset: true,
                  canvasAssetId: asset.id
                }
              })
            }
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

      // 处理 Seedance 角色拖拽（来自 SeedanceCharacterPanel）
      if ((data.type === 'seedance-character' || data.type === 'bytefor-character') && data.assetId) {
        const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        canvasStore.addNode({
          id: nodeId,
          type: data.type === 'bytefor-character' || data.libraryType === 'bytefor' ? 'bytefor-character' : 'seedance-character',
          position: { x: canvasX, y: canvasY },
          data: {
            title: data.assetName || (data.libraryType === 'bytefor' ? 'Bytefor角色' : 'Seedance角色'),
            assetId: data.assetId,
            assetUri: data.assetUri || `asset://${data.assetId}`,
            assetUrl: data.assetUrl,
            groupId: data.groupId,
            assetName: data.assetName,
            status: data.status || 'Active',
            assetType: data.assetType,
            width: 220,
            thumbnailUrl: data.thumbnailUrl || data.assetUrl,
            thumbnail_url: data.thumbnailUrl || data.assetUrl,
            output: {
              type: 'image',
              url: data.assetUri || `asset://${data.assetId}`,
              urls: [data.assetUri || `asset://${data.assetId}`],
              thumbnailUrl: data.thumbnailUrl || data.assetUrl
            }
          }
        })
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
  const tabId = canvasStore.activeTabId
  for (const task of tasks) {
    const { file, type, nodeId, blobUrl, field } = task
    
    try {
      console.log(`[CanvasBoard] 开始上传${type}到云存储:`, file.name, '大小:', Math.round(file.size / 1024), 'KB')

      const result = await uploadCanvasMedia(file, type, { nodeId, tabId })
      console.log(`[CanvasBoard] ${type}上传成功，云URL:`, result.url)

      if (canvasStore.commitMediaUpload({ nodeId, blobUrl, mediaType: type, uploaded: result, tabId })) {
        console.log(`[CanvasBoard] 节点 ${nodeId} 已更新为云存储URL`)
      }
      
    } catch (error) {
      if (error?.name === 'AbortError') continue
      console.error(`[CanvasBoard] ${type}上传失败:`, error.message)
      canvasStore.markMediaUploadFailed({ nodeId, tabId, error })
      uploadManager.registerFailedUpload(`cb_${nodeId}_${Date.now()}`, {
        nodeId, tabId, file, type, blobUrl,
        field,
        error: error.message
      })
    }
  }
}

async function fitCanvasToScreen() {
  await nextTick()
  return runCanvasFit(fitView, {
    padding: 0.2,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM
  })
}

async function focusCanvasNode(nodeId, options = {}) {
  const node = canvasStore.nodes.find(candidate => candidate.id === nodeId)
  if (!node) return false

  if (options.select) {
    selectSingleNodeFromTouch(nodeId)
  }

  const size = getOrganizationNodeSize(node)
  const zoom = clampCanvasZoom(options.zoom || getViewport()?.zoom || 1)
  await setCenter(
    node.position.x + size.width / 2,
    node.position.y + size.height / 2,
    { zoom, duration: options.duration ?? 260 }
  )
  markViewportMoving()

  if (options.playVideo) {
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    const nodeElement = [...(canvasBoardRef.value?.querySelectorAll('.vue-flow__node') || [])]
      .find(element => element.getAttribute('data-id') === String(nodeId))
    const videoWrapper = nodeElement?.querySelector('.video-output-wrapper')
    videoWrapper?.dispatchEvent(new CustomEvent('canvas-directory-play', { bubbles: false }))
  }

  return true
}

async function organizeCanvas() {
  if (canvasStore.nodes.length === 0) return { changed: false, failed: false, empty: true }

  const snapshot = {
    positions: Object.fromEntries(
      canvasStore.nodes.map(node => [node.id, { ...node.position }])
    ),
    viewport: { ...getViewport(), zoom: clampCanvasZoom(getViewport()?.zoom) }
  }
  const result = organizeCanvasNodes(canvasStore.nodes, {
    snapToGrid: props.gridSnapEnabled,
    grid: 20
  })

  if (result.failed) return { ...result, snapshot }
  if (result.changed) {
    for (const [nodeId, nextPosition] of Object.entries(result.positions)) {
      const node = canvasStore.nodes.find(candidate => candidate.id === nodeId)
      if (!node) continue

      const deltaX = nextPosition.x - node.position.x
      const deltaY = nextPosition.y - node.position.y
      if (node.type === 'group') {
        const childIds = new Set(getOrganizationGroupChildIds(canvasStore.nodes, node))
        for (const child of canvasStore.nodes) {
          if (!childIds.has(child.id)) continue
          const childPosition = child.position || { x: 0, y: 0 }
          canvasStore.updateNodePosition(child.id, {
            x: childPosition.x + deltaX,
            y: childPosition.y + deltaY
          })
        }
      }
      canvasStore.updateNodePosition(nodeId, { ...nextPosition })
    }
    canvasStore.markCurrentTabChanged()
  }

  const fitted = await fitCanvasToScreen()
  return { ...result, snapshot, fitFailed: !fitted }
}

function restoreOrganizedCanvas(snapshot) {
  if (!snapshot) return false

  let restored = false
  for (const [nodeId, position] of Object.entries(snapshot.positions || {})) {
    if (!canvasStore.nodes.some(node => node.id === nodeId)) continue
    canvasStore.updateNodePosition(nodeId, { ...position })
    restored = true
  }

  if (snapshot.viewport) {
    setViewport({
      ...snapshot.viewport,
      zoom: clampCanvasZoom(snapshot.viewport.zoom)
    }, { duration: 0 })
  }
  if (restored) canvasStore.markCurrentTabChanged()
  return restored
}

// 暴露给父组件的方法
defineExpose({
  // 设置缩放级别（不触发store更新，避免循环）
  setZoom: (zoom, options = {}) => {
    if (setViewport) {
      const currentViewport = getViewport()
      setViewport({
        ...currentViewport,
        zoom: clampCanvasZoom(zoom)
      }, { duration: options.duration || 200 })
    }
  },
  // 获取当前视口
  getViewport: () => {
    return getViewport ? getViewport() : canvasStore.viewport
  },
  // 编组选中的节点
  groupSelectedNodes,
  // 从剪贴板文件创建节点（供右键菜单调用）
  handleClipboardFiles,
  focusCanvasNode,
  organizeCanvas,
  restoreOrganizedCanvas,
  fitCanvasToScreen
})

onMounted(() => {
  console.log('[CanvasBoard] 组件已挂载，开始初始化...')

  // 初始化视口 - 增加延迟确保 VueFlow 完全就绪
  const initViewport = () => {
    try {
      fitView({ padding: 0.2, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM })
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
  
  // 添加粘贴事件监听（支持 Ctrl+V 粘贴系统剪贴板中的图片/文件）
  document.addEventListener('paste', handlePaste)
  
  // 添加连线样式变化事件监听
  window.addEventListener('canvas-edge-style-change', handleEdgeStyleChange)
  
  // 添加鼠标事件监听（用于空格+拖动平移）
  document.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  
  // 添加滚轮事件监听（以鼠标位置为中心缩放）
  if (canvasBoardRef.value) {
    updateCanvasBoardSize()
    if (typeof ResizeObserver !== 'undefined') {
      canvasBoardResizeObserver = new ResizeObserver(updateCanvasBoardSize)
      canvasBoardResizeObserver.observe(canvasBoardRef.value)
    }
    canvasBoardRef.value.addEventListener('wheel', handleWheel, { passive: false })
    canvasBoardRef.value.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true })
    // 添加原生右键菜单事件监听
    canvasBoardRef.value.addEventListener('contextmenu', handleNativeContextMenu)
  }
})

onUnmounted(() => {
  // 移除键盘事件监听
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keyup', handleKeyUp)
  
  // 移除粘贴事件监听
  document.removeEventListener('paste', handlePaste)
  
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
    canvasBoardRef.value.removeEventListener('touchstart', handleTouchStart, { capture: true })
    canvasBoardRef.value.removeEventListener('contextmenu', handleNativeContextMenu)
  }
  if (canvasBoardResizeObserver) {
    canvasBoardResizeObserver.disconnect()
    canvasBoardResizeObserver = null
  }
  groupDragStartPositions.clear()
  resetTouchState()
  
  // 移除全局拖拽事件监听
  const listenerOptions = { capture: true }
  window.removeEventListener('mousemove', handleGlobalDragConnectionMove, listenerOptions)
  window.removeEventListener('mouseup', handleGlobalDragConnectionEnd, listenerOptions)
  
  // 🔧 清理对齐辅助线节流定时器，防止内存泄漏
  if (alignmentThrottleTimer.value) {
    cancelAnimationFrame(alignmentThrottleTimer.value)
    alignmentThrottleTimer.value = null
  }

  // 🔧 清理组内节点同步的 rAF 句柄
  if (_syncGroupRafId) {
    cancelAnimationFrame(_syncGroupRafId)
    _syncGroupRafId = null
  }

  if (activeFlowPathsRafId) {
    cancelAnimationFrame(activeFlowPathsRafId)
    activeFlowPathsRafId = null
  }
  if (activeFlowPathsFollowupRafId) {
    cancelAnimationFrame(activeFlowPathsFollowupRafId)
    activeFlowPathsFollowupRafId = null
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
    :class="{
      'file-drag-over': isFileDragOver,
      'pick-mode': pickMode,
      'edges-hidden': isEdgeHidden,
      'selection-cursor': interactionMode === 'infinite-canvas' || isSelectionModifierPressed,
      'pan-ready': isSpacePressed,
      'is-panning': isPanning
    }"
    :data-zoom-level="canvasZoomLevel"
    :style="canvasPromptPanelScaleStyle"
    @dblclick="handleDoubleClick"
    @mousedown.middle.prevent
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
      :nodes="renderedFlowNodes"
      :edges="renderedFlowEdges"
      :node-types="nodeTypes"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :default-edge-options="defaultEdgeOptions"
      :min-zoom="0.1"
      :max-zoom="5"
      :snap-to-grid="gridSnapEnabled"
      :snap-grid="[20, 20]"
      :connection-mode="'loose'"
      :only-render-visible-elements="false"
      :pan-on-drag="panOnDragConfig"
      :selection-on-drag="true"
      :select-nodes-on-drag="true"
      :selection-key-code="isSpacePressed ? false : selectionKeyCodeConfig"
      :selection-mode="SelectionMode.Full"
      :pan-on-scroll="false"
      :zoom-on-scroll="false"
      :zoom-on-pinch="false"
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
        <svg class="drag-connection-line connection-guide-line">
          <path :d="getDragLinePath" class="connection-flow-base" />
          <path
            v-for="(layer, i) in connectionFlowLayers"
            :key="i"
            :d="getDragLinePath"
            class="connection-flow"
            :style="{ strokeDasharray: layer.dasharray, opacity: layer.opacity, animationDelay: layer.delay }"
          />
        </svg>
      </template>
      
      <!-- 待连接虚拟连线（选择器打开时显示） -->
      <template v-if="showPendingConnection">
        <svg class="pending-connection-line connection-guide-line">
          <path :d="getPendingConnectionPath()" class="connection-flow-base" />
          <path
            v-for="(layer, i) in connectionFlowLayers"
            :key="i"
            :d="getPendingConnectionPath()"
            class="connection-flow"
            :style="{ strokeDasharray: layer.dasharray, opacity: layer.opacity, animationDelay: layer.delay }"
          />
        </svg>
      </template>

      <!-- 选中节点关联连线的流动动画 -->
      <template v-if="activeFlowPaths.length > 0">
        <svg class="active-edge-flow connection-guide-line">
          <template v-for="(edgePath, ei) in activeFlowPaths" :key="ei">
            <path
              v-for="(layer, li) in connectionFlowLayers"
              :key="li"
              :d="edgePath"
              class="connection-flow"
              :style="{ strokeDasharray: layer.dasharray, opacity: layer.opacity, animationDelay: layer.delay }"
            />
          </template>
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
      
      <MiniMap
        v-if="showCanvasMiniMap && !renderProjection.enabled"
        class="canvas-workflow-minimap"
        position="bottom-left"
        node-color="#888888"
        node-stroke-color="#242424"
        :node-class-name="getMiniMapNodeClass"
        :node-stroke-width="1"
        :node-border-radius="2"
        mask-color="rgba(9, 9, 9, 0.52)"
        mask-stroke-color="rgba(190, 190, 190, 0.68)"
        :mask-stroke-width="2"
        :mask-border-radius="2"
        :pannable="true"
        :zoomable="false"
        :width="220"
        :height="150"
        aria-label="画布地图"
        @click="handleMiniMapClick"
      />
      <CanvasMiniMapOverview
        v-else-if="showCanvasMiniMap && renderProjection.enabled"
        :items="renderProjection.minimapItems"
        :viewport-bounds="renderProjection.viewportBounds"
        :width="220"
        :height="150"
        @click="handleMiniMapClick"
      />
    </VueFlow>
  </div>
</template>

<style scoped>
.canvas-board {
  width: 100%;
  height: 100%;
  overscroll-behavior: contain;
}

.canvas-board :deep(.vue-flow__pane),
.canvas-board :deep(.vue-flow__background),
.canvas-board :deep(.vue-flow__node),
.canvas-board :deep(.node-add-btn) {
  touch-action: none;
}

.canvas-board.edges-hidden :deep(.vue-flow__edge),
.canvas-board.edges-hidden :deep(.vue-flow__connection-line),
.canvas-board.edges-hidden .connection-guide-line {
  display: none;
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

/* 框选状态：细长三角形光标；无限画布默认框选，ComfyUI 按 Shift/Ctrl 时框选 */
.canvas-board.selection-cursor :deep(.vue-flow__pane),
.canvas-board.selection-cursor :deep(.vue-flow__pane.dragging) {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M2.5 2.5L21 10.5L12 13L8 21.5Z' fill='%23fff' stroke='%23171717' stroke-width='1.25' stroke-linejoin='round'/%3E%3C/svg%3E") 3 3, default;
}

/* 空格按住期间整张画布持续显示小手，实际平移时显示抓取中的小手 */
.canvas-board.pan-ready :deep(.vue-flow__pane),
.canvas-board.pan-ready :deep(.vue-flow__pane *) {
  cursor: grab !important;
}

.canvas-board.is-panning :deep(.vue-flow__pane),
.canvas-board.is-panning :deep(.vue-flow__pane *) {
  cursor: grabbing !important;
}

:deep(.vue-flow__node) {
  cursor: pointer;
}

:deep(.vue-flow__node.selected) {
  outline: none;
}

.canvas-board :deep(.canvas-workflow-minimap) {
  bottom: 72px;
  left: 24px;
  width: 220px;
  height: 150px;
  background: rgba(36, 36, 36, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.34);
  overflow: hidden;
  cursor: crosshair;
}

.canvas-board :deep(.canvas-workflow-minimap svg) {
  display: block;
}

.canvas-board :deep(.canvas-workflow-minimap .vue-flow__minimap-mask) {
  fill: rgba(9, 9, 9, 0.52);
  stroke: rgba(190, 190, 190, 0.68);
  stroke-width: 2;
}

.canvas-board :deep(.canvas-workflow-minimap .vue-flow__minimap-node) {
  fill: #888888;
  stroke: #242424;
}

.canvas-board :deep(.canvas-workflow-minimap .vue-flow__minimap-node.is-grouped) {
  fill: #b8b8b8;
  stroke: #525252;
}

.canvas-board :deep(.canvas-workflow-minimap .vue-flow__minimap-node.is-group) {
  fill: transparent;
  stroke: rgba(212, 212, 212, 0.72);
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}

:root.canvas-theme-light .canvas-board :deep(.canvas-workflow-minimap) {
  background: rgba(250, 250, 250, 0.96);
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
}

:root.canvas-theme-light .canvas-board :deep(.canvas-workflow-minimap .vue-flow__minimap-mask) {
  fill: rgba(115, 115, 115, 0.24);
  stroke: #737373;
}

:root.canvas-theme-light .canvas-board :deep(.canvas-workflow-minimap .vue-flow__minimap-node) {
  fill: #525252;
  stroke: #fafafa;
}

:root.canvas-theme-light .canvas-board :deep(.canvas-workflow-minimap .vue-flow__minimap-node.is-grouped) {
  fill: #858585;
  stroke: #404040;
}

:root.canvas-theme-light .canvas-board :deep(.canvas-workflow-minimap .vue-flow__minimap-node.is-group) {
  fill: transparent;
  stroke: rgba(82, 82, 82, 0.72);
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
  stroke: #60a5fa;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 84 266;
  fill: none;
  opacity: 0.3;
  animation: connectionGlowFlow 9s linear infinite;
}

/* 多选时的节点样式（排除图片和视频节点，它们有自己的选中样式） */
:deep(.vue-flow__node.selectable.selected:not([data-type="image-input"]):not([data-type="image"]):not([data-type="video"]):not([data-type="video-input"]):not([data-type="storyboard"])) {
  outline: 2px solid var(--canvas-accent-primary);
  outline-offset: 2px;
}

.connection-guide-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
  overflow: visible;
}

.active-edge-flow {
  z-index: 0;
}

.connection-flow-base {
  stroke: var(--canvas-edge-default);
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
  opacity: 0.86;
}

.connection-flow {
  stroke: #60a5fa;
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
  animation: connectionGlowFlow 9s linear infinite;
}

/* 待连接虚拟连线（选择器打开时显示） */
.pending-connection-line {
  z-index: 999;
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

@keyframes connectionGlowFlow {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -350; }
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
  background: rgba(59, 130, 246, 0.2);
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
