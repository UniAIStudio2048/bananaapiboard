const POSTER_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect width="320" height="180" fill="#18181b"/>
  <path d="M140 58v64l56-32z" fill="#fafafa" opacity=".82"/>
</svg>`)

const IMAGE_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
  <rect width="320" height="240" fill="#0f766e"/>
  <circle cx="96" cy="92" r="34" fill="#f8fafc" opacity=".8"/>
  <path d="M0 214 92 126l54 50 48-36 126 106z" fill="#f8fafc" opacity=".58"/>
</svg>`)

const VIDEO_POSTER_URL = `data:image/svg+xml,${POSTER_SVG}`
const IMAGE_URL = `data:image/svg+xml,${IMAGE_SVG}`

const NODE_TYPES = ['text-input', 'image', 'video', 'llm']

function positiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function createNode(index, columns) {
  const type = NODE_TYPES[index % NODE_TYPES.length]
  const col = index % columns
  const row = Math.floor(index / columns)
  const id = `stress-node-${index + 1}`
  const position = { x: col * 460, y: row * 360 }

  const data = {
    title: `Stress ${index + 1}`,
    label: `Stress ${index + 1}`,
    width: type === 'video' ? 420 : 380,
    height: type === 'text-input' || type === 'llm' ? 240 : 280
  }

  if (type === 'text-input' || type === 'llm') {
    data.content = `Canvas stress node ${index + 1}`
    data.prompt = `Canvas stress prompt ${index + 1}`
  }

  if (type === 'image') {
    data.imageUrl = IMAGE_URL
    data.url = IMAGE_URL
    data.thumbnail_url = IMAGE_URL
  }

  if (type === 'video') {
    data.thumbnail_url = VIDEO_POSTER_URL
    data.videoUrl = ''
    data.url = ''
  }

  return {
    id,
    type,
    position,
    data,
    draggable: true
  }
}

function createEdges(nodes) {
  const edges = []
  for (let i = 1; i < nodes.length; i += 1) {
    edges.push({
      id: `stress-edge-${i}`,
      source: nodes[i - 1].id,
      target: nodes[i].id,
      sourceHandle: 'output',
      targetHandle: 'input',
      type: 'bezier',
      animated: false
    })
  }
  return edges
}

export function createCanvasStressSession(options = {}) {
  const nodeCount = positiveInteger(options.nodeCount, 1000)
  const columns = positiveInteger(options.columns, Math.ceil(Math.sqrt(nodeCount)))
  const nodes = Array.from({ length: nodeCount }, (_, index) => createNode(index, columns))

  return {
    activeTabId: 'canvas-stress-tab',
    tabs: [{
      id: 'canvas-stress-tab',
      name: `Stress ${nodeCount} nodes`,
      workflowId: null,
      workflowUid: null,
      description: 'Large local canvas fixture for render performance verification.',
      workflowSpaceType: null,
      workflowTeamId: null,
      nodes,
      edges: createEdges(nodes),
      viewport: { x: 0, y: 0, zoom: 1 },
      hasChanges: true
    }]
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nodeCount = positiveInteger(process.argv[2], 1000)
  process.stdout.write(JSON.stringify(createCanvasStressSession({ nodeCount })))
}
