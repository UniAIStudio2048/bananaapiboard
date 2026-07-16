const DEFAULT_NODE_SIZES = Object.freeze({
  'text-input': { width: 400, height: 280 },
  text: { width: 400, height: 280 },
  image: { width: 380, height: 320 },
  'image-input': { width: 380, height: 320 },
  'image-gen': { width: 380, height: 320 },
  video: { width: 420, height: 280 },
  'video-input': { width: 420, height: 280 },
  'video-gen': { width: 420, height: 280 },
  audio: { width: 360, height: 220 },
  'audio-input': { width: 360, height: 220 },
  group: { width: 400, height: 300 },
  storyboard: { width: 720, height: 360 },
  'seedance-character': { width: 220, height: 220 },
  'bytefor-character': { width: 220, height: 220 },
  'director-studio': { width: 640, height: 420 }
})

function numeric(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function intersects(a, b) {
  return a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom
}

function getNodeSize(node) {
  const defaults = DEFAULT_NODE_SIZES[node?.type] || { width: 380, height: 280 }
  const data = node?.data || {}
  return {
    width: numeric(node?.width ?? node?.dimensions?.width ?? data.width ?? data.nodeWidth, defaults.width),
    height: numeric(node?.height ?? node?.dimensions?.height ?? data.height ?? data.nodeHeight, defaults.height)
  }
}

export function getCanvasNodeBounds(node) {
  const position = node?.position || { x: 0, y: 0 }
  const size = getNodeSize(node)
  const left = Number(position.x) || 0
  const top = Number(position.y) || 0
  return {
    left,
    top,
    right: left + size.width,
    bottom: top + size.height,
    width: size.width,
    height: size.height
  }
}

export function getCanvasViewportBounds({ viewport, containerRect, bufferRatio = 1.25 } = {}) {
  const vp = viewport || { x: 0, y: 0, zoom: 1 }
  const zoom = numeric(vp.zoom, 1)
  const width = numeric(containerRect?.width, 0) / zoom
  const height = numeric(containerRect?.height, 0) / zoom
  const left = (-(Number(vp.x) || 0) / zoom) || 0
  const top = (-(Number(vp.y) || 0) / zoom) || 0
  const extraX = width * Math.max(0, bufferRatio - 1)
  const extraY = height * Math.max(0, bufferRatio - 1)
  return {
    left: left - extraX,
    top: top - extraY,
    right: left + width + extraX,
    bottom: top + height + extraY,
    width: width + extraX * 2,
    height: height + extraY * 2
  }
}

export function projectCanvasRenderState({
  nodes = [],
  edges = [],
  viewport,
  containerRect,
  selectedIds = new Set(),
  activeIds = new Set(),
  performanceMode = 'full',
  threshold = 220,
  bufferRatio = 1.5
} = {}) {
  const sourceNodes = Array.isArray(nodes) ? nodes : []
  const sourceEdges = Array.isArray(edges) ? edges : []
  const minimapItems = sourceNodes.map(item => ({
    id: item.id,
    type: item.type,
    groupId: item.data?.groupId || null,
    ...getCanvasNodeBounds(item)
  }))
  const enabled = sourceNodes.length > threshold && containerRect?.width > 0 && containerRect?.height > 0

  if (!enabled) {
    return {
      enabled: false,
      nodes: sourceNodes,
      edges: sourceEdges,
      nodeIds: sourceNodes.map(item => item.id),
      edgeIds: sourceEdges.map(item => item.id),
      viewportBounds: null,
      minimapItems
    }
  }

  const bounds = getCanvasViewportBounds({ viewport, containerRect, bufferRatio })
  const nodeById = new Map(sourceNodes.map(item => [item.id, item]))
  const include = new Set()

  for (const item of sourceNodes) {
    if (!item?.id) continue
    const pinned =
      selectedIds?.has?.(item.id) ||
      activeIds?.has?.(item.id) ||
      item.dragging === true ||
      item.resizing === true ||
      item.data?.isUploading ||
      item.data?.status === 'processing'
    if (pinned || intersects(getCanvasNodeBounds(item), bounds)) include.add(item.id)
  }

  for (const item of sourceNodes) {
    const groupId = item?.data?.groupId
    if (groupId && include.has(item.id) && nodeById.has(groupId)) include.add(groupId)
  }

  const edgeInclude = new Set()
  const strictEdges = performanceMode === 'minimal' || sourceNodes.length >= 1000
  for (const edge of sourceEdges) {
    if (!edge?.id) continue
    const sourceVisible = include.has(edge.source)
    const targetVisible = include.has(edge.target)
    if (strictEdges ? sourceVisible && targetVisible : sourceVisible || targetVisible) {
      if (sourceVisible && targetVisible) edgeInclude.add(edge.id)
    }
  }

  const renderNodes = sourceNodes.filter(item => include.has(item.id))
  const renderEdges = sourceEdges
    .filter(item => edgeInclude.has(item.id))
    .map(edge => ({ ...edge, animated: false }))

  return {
    enabled: true,
    nodes: renderNodes,
    edges: renderEdges,
    nodeIds: renderNodes.map(item => item.id),
    edgeIds: renderEdges.map(item => item.id),
    viewportBounds: bounds,
    minimapItems
  }
}
