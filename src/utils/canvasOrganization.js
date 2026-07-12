export const DEFAULT_ORGANIZATION_GAP = 40
export const DEFAULT_CANVAS_GRID = 20

const DEFAULT_NODE_SIZE = { width: 380, height: 280 }
const NODE_SIZE_FALLBACKS = {
  'text-input': { width: 400, height: 280 },
  text: { width: 400, height: 280 },
  'image-input': { width: 380, height: 320 },
  image: { width: 380, height: 320 },
  'image-gen': { width: 380, height: 320 },
  'video-input': { width: 420, height: 280 },
  video: { width: 420, height: 280 },
  'video-gen': { width: 420, height: 280 },
  'audio-input': { width: 380, height: 280 },
  audio: { width: 380, height: 280 },
  'seedance-character': { width: 220, height: 220 },
  'bytefor-character': { width: 220, height: 220 },
  storyboard: { width: 720, height: 360 },
  group: { width: 420, height: 320 }
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return null
}

function finiteCoordinate(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function getOrganizationNodeSize(node) {
  const fallback = NODE_SIZE_FALLBACKS[node?.type] || DEFAULT_NODE_SIZE
  return {
    width: positiveNumber(
      node?.dimensions?.width,
      node?.data?.width,
      node?.data?.nodeWidth,
      node?.style?.width
    ) || fallback.width,
    height: positiveNumber(
      node?.dimensions?.height,
      node?.data?.height,
      node?.data?.nodeHeight,
      node?.style?.height
    ) || fallback.height
  }
}

export function rectanglesConflict(a, b, gap = DEFAULT_ORGANIZATION_GAP) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  )
}

function compareItems(a, b) {
  return (
    a.position.y - b.position.y ||
    a.position.x - b.position.x ||
    String(a.id).localeCompare(String(b.id))
  )
}

function compareCandidates(origin) {
  return (a, b) => {
    const aDistance = (a.x - origin.x) ** 2 + (a.y - origin.y) ** 2
    const bDistance = (b.x - origin.x) ** 2 + (b.y - origin.y) ** 2
    return aDistance - bDistance || a.y - b.y || a.x - b.x
  }
}

function dedupeCandidates(candidates) {
  const unique = new Map()
  for (const candidate of candidates) {
    unique.set(`${candidate.x}:${candidate.y}`, candidate)
  }
  return [...unique.values()]
}

export function organizeCanvasNodes(nodes = [], options = {}) {
  const gap = positiveNumber(options.gap) ?? DEFAULT_ORGANIZATION_GAP
  const grid = positiveNumber(options.grid) ?? DEFAULT_CANVAS_GRID
  const snapToGrid = options.snapToGrid === true
  const snapNearest = value => snapToGrid ? Math.round(value / grid) * grid : value
  const snapDown = value => snapToGrid ? Math.floor(value / grid) * grid : value
  const snapUp = value => snapToGrid ? Math.ceil(value / grid) * grid : value

  const visibleGroupIds = new Set(
    nodes.filter(node => node?.type === 'group').map(node => node.id)
  )
  const items = nodes
    .filter(node => node && (node.type === 'group' || !visibleGroupIds.has(node.data?.groupId)))
    .map(node => ({
      id: node.id,
      position: {
        x: finiteCoordinate(node.position?.x),
        y: finiteCoordinate(node.position?.y)
      },
      ...getOrganizationNodeSize(node)
    }))
    .sort(compareItems)

  const placed = []
  const positions = {}
  const rectangles = {}

  for (const item of items) {
    const origin = {
      x: snapNearest(item.position.x),
      y: snapNearest(item.position.y)
    }
    const candidates = [origin]

    for (const other of placed) {
      candidates.push(
        { x: snapUp(other.x + other.width + gap), y: origin.y },
        { x: snapDown(other.x - item.width - gap), y: origin.y },
        { x: origin.x, y: snapUp(other.y + other.height + gap) },
        { x: origin.x, y: snapDown(other.y - item.height - gap) }
      )
    }

    const position = dedupeCandidates(candidates)
      .sort(compareCandidates(origin))
      .find(candidate => {
        const rectangle = { ...candidate, width: item.width, height: item.height }
        return !placed.some(other => rectanglesConflict(rectangle, other, gap))
      })

    if (!position) {
      return {
        changed: false,
        failed: true,
        itemIds: items.map(value => value.id),
        positions: {},
        rectangles: {}
      }
    }

    const rectangle = {
      ...position,
      width: item.width,
      height: item.height
    }
    positions[item.id] = position
    rectangles[item.id] = rectangle
    placed.push(rectangle)
  }

  return {
    changed: items.some(item => (
      positions[item.id].x !== item.position.x ||
      positions[item.id].y !== item.position.y
    )),
    failed: false,
    itemIds: items.map(item => item.id),
    positions,
    rectangles
  }
}

export function buildOrganizationSignature(nodes = [], edges = []) {
  const nodeSignature = nodes
    .map(node => [
      node.id,
      node.type,
      finiteCoordinate(node.position?.x),
      finiteCoordinate(node.position?.y),
      node.data?.groupId || null,
      [...(node.data?.nodeIds || [])].map(String).sort()
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const edgeSignature = edges
    .map(edge => [
      edge.id,
      edge.source,
      edge.target,
      edge.sourceHandle || null,
      edge.targetHandle || null
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))

  return JSON.stringify({ nodes: nodeSignature, edges: edgeSignature })
}
