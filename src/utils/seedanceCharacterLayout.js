const DEFAULT_GAP = 100
const DEFAULT_POSITION = { x: 100, y: 100 }
const DEFAULT_SIZE = { width: 220, height: null }

function getNodeSize(node) {
  if (!node) return DEFAULT_SIZE

  return {
    width: node.data?.width || node.dimensions?.width || DEFAULT_SIZE.width,
    height: node.data?.height || node.dimensions?.height || DEFAULT_SIZE.height
  }
}

export function getSeedanceCharacterNodeLayout(sourceNode, gap = DEFAULT_GAP) {
  if (!sourceNode?.position) {
    return {
      position: { ...DEFAULT_POSITION },
      size: { ...DEFAULT_SIZE }
    }
  }

  const size = getNodeSize(sourceNode)

  return {
    position: {
      x: sourceNode.position.x + size.width + gap,
      y: sourceNode.position.y
    },
    size
  }
}
