function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizePosition(position) {
  return {
    x: finiteNumber(position?.x),
    y: finiteNumber(position?.y)
  }
}

function normalizeOffset(offset) {
  if (!offset || typeof offset !== 'object') return null
  const x = Number(offset.x)
  const y = Number(offset.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function getGroupChildIds(nodes, groupNode) {
  const dataNodeIds = Array.isArray(groupNode?.data?.nodeIds)
    ? groupNode.data.nodeIds
    : []
  if (dataNodeIds.length > 0) return unique(dataNodeIds)

  return unique(
    nodes
      .filter(node => node?.data?.groupId === groupNode?.id)
      .map(node => node.id)
  )
}

export function getMovedGroupChildPositions(nodes, groupNode, nextPosition, options = {}) {
  const sourceNodes = Array.isArray(nodes) ? nodes : []
  const groupId = groupNode?.id
  const childIds = getGroupChildIds(sourceNodes, groupNode)
  const targetPosition = normalizePosition(nextPosition || groupNode?.position)
  const previousPosition = normalizePosition(options.previousPosition || groupNode?.position)
  const storedOffsets = groupNode?.data?.nodeOffsets && typeof groupNode.data.nodeOffsets === 'object'
    ? groupNode.data.nodeOffsets
    : {}
  const nodeOffsets = {}
  const childPositions = {}
  let offsetsChanged = false

  for (const nodeId of childIds) {
    if (nodeId === groupId) continue
    const childNode = sourceNodes.find(node => node?.id === nodeId)
    if (!childNode) continue

    const storedOffset = normalizeOffset(storedOffsets[nodeId])
    const offset = storedOffset || {
      x: finiteNumber(childNode.position?.x) - previousPosition.x,
      y: finiteNumber(childNode.position?.y) - previousPosition.y
    }

    if (!storedOffset) offsetsChanged = true
    nodeOffsets[nodeId] = offset
    childPositions[nodeId] = {
      x: targetPosition.x + offset.x,
      y: targetPosition.y + offset.y
    }
  }

  return {
    childPositions,
    nodeOffsets,
    offsetsChanged
  }
}
