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

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return null
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
  const rebaseOffsets = options.rebaseOffsets === true

  for (const nodeId of childIds) {
    if (nodeId === groupId) continue
    const childNode = sourceNodes.find(node => node?.id === nodeId)
    if (!childNode) continue

    const storedOffset = rebaseOffsets ? null : normalizeOffset(storedOffsets[nodeId])
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

export function getNodeDropGroupId(nodes, node, position, nodeSize = {}) {
  if (!node?.id || node.type === 'group') return null

  const sourceNodes = Array.isArray(nodes) ? nodes : []
  const nodeWidth = positiveNumber(
    nodeSize.width,
    node.dimensions?.width,
    node.data?.width,
    node.style?.width
  ) || 0
  const nodeHeight = positiveNumber(
    nodeSize.height,
    node.dimensions?.height,
    node.data?.height,
    node.style?.height
  ) || 0
  const nodePosition = normalizePosition(position || node.position)
  const center = {
    x: nodePosition.x + nodeWidth / 2,
    y: nodePosition.y + nodeHeight / 2
  }

  const containingGroups = sourceNodes
    .filter(candidate => candidate?.type === 'group' && candidate.id !== node.id)
    .map(groupNode => {
      const groupPosition = normalizePosition(groupNode.position)
      const width = positiveNumber(
        groupNode.data?.width,
        groupNode.dimensions?.width,
        groupNode.style?.width
      ) || 400
      const height = positiveNumber(
        groupNode.data?.height,
        groupNode.dimensions?.height,
        groupNode.style?.height
      ) || 300
      return { groupNode, groupPosition, width, height }
    })
    .filter(({ groupPosition, width, height }) => (
      center.x >= groupPosition.x &&
      center.x <= groupPosition.x + width &&
      center.y >= groupPosition.y &&
      center.y <= groupPosition.y + height
    ))
    .sort((a, b) => a.width * a.height - b.width * b.height)

  return containingGroups[0]?.groupNode.id || null
}
