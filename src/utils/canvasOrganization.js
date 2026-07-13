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

function createRectangleSpatialIndex(gap, cellSize = 256) {
  const cells = new Map()

  function cellRange(rectangle, expansion = 0) {
    return {
      minX: Math.floor((rectangle.x - expansion) / cellSize),
      maxX: Math.floor((rectangle.x + rectangle.width + expansion) / cellSize),
      minY: Math.floor((rectangle.y - expansion) / cellSize),
      maxY: Math.floor((rectangle.y + rectangle.height + expansion) / cellSize)
    }
  }

  function add(rectangle) {
    const range = cellRange(rectangle)
    for (let x = range.minX; x <= range.maxX; x += 1) {
      for (let y = range.minY; y <= range.maxY; y += 1) {
        const key = `${x}:${y}`
        const bucket = cells.get(key)
        if (bucket) bucket.push(rectangle)
        else cells.set(key, [rectangle])
      }
    }
  }

  function conflicts(rectangle) {
    const range = cellRange(rectangle, gap)
    const visited = new Set()
    for (let x = range.minX; x <= range.maxX; x += 1) {
      for (let y = range.minY; y <= range.maxY; y += 1) {
        for (const other of cells.get(`${x}:${y}`) || []) {
          if (visited.has(other)) continue
          visited.add(other)
          if (rectanglesConflict(rectangle, other, gap)) return true
        }
      }
    }
    return false
  }

  return { add, conflicts }
}

export function getOrganizationGroupChildIds(nodes = [], groupNode) {
  if (!groupNode?.id) return []
  const declaredIds = new Set(groupNode.data?.nodeIds || [])

  return nodes
    .filter(node => (
      node &&
      node.id !== groupNode.id &&
      (declaredIds.has(node.id) || node.data?.groupId === groupNode.id)
    ))
    .map(node => node.id)
}

export async function runCanvasFit(fitView, options) {
  try {
    await fitView(options)
    return true
  } catch {
    return false
  }
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
  const visibleGroupChildIds = new Set(
    nodes
      .filter(node => node?.type === 'group')
      .flatMap(node => node.data?.nodeIds || [])
  )
  const items = nodes
    .filter(node => node && (
      node.type === 'group' ||
      (!visibleGroupIds.has(node.data?.groupId) && !visibleGroupChildIds.has(node.id))
    ))
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
  const spatialIndex = createRectangleSpatialIndex(gap)
  const positions = {}
  const rectangles = {}

  for (const item of items) {
    const origin = {
      x: snapNearest(item.position.x),
      y: snapNearest(item.position.y)
    }
    const xCandidates = new Set([origin.x])
    const yCandidates = new Set([origin.y])
    let position = null
    let positionDistance = Infinity

    function considerCandidate(x, y) {
      const distance = (x - origin.x) ** 2 + (y - origin.y) ** 2
      if (
        position &&
        (distance > positionDistance ||
          (distance === positionDistance && (y > position.y || (y === position.y && x >= position.x))))
      ) return

      const rectangle = { x, y, width: item.width, height: item.height }
      if (spatialIndex.conflicts(rectangle)) return

      position = { x, y }
      positionDistance = distance
    }

    for (const other of placed) {
      xCandidates.add(snapUp(other.x + other.width + gap))
      xCandidates.add(snapDown(other.x - item.width - gap))
      yCandidates.add(snapUp(other.y + other.height + gap))
      yCandidates.add(snapDown(other.y - item.height - gap))
    }
    considerCandidate(origin.x, origin.y)
    for (const x of xCandidates) {
      if (x !== origin.x) considerCandidate(x, origin.y)
    }
    for (const y of yCandidates) {
      if (y !== origin.y) considerCandidate(origin.x, y)
    }

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
    spatialIndex.add(rectangle)
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
