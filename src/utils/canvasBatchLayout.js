const SUPPORTED_BATCH_COUNTS = new Set([1, 2, 4])

export function getBatchGridPositions({
  origin,
  count,
  nodeWidth,
  nodeHeight,
  horizontalGap = 40,
  verticalGap = 40
}) {
  if (!SUPPORTED_BATCH_COUNTS.has(count)) {
    throw new RangeError(`Unsupported canvas batch count: ${count}`)
  }

  const columns = count === 1 ? 1 : 2
  return Array.from({ length: count }, (_, index) => ({
    x: origin.x + (index % columns) * (nodeWidth + horizontalGap),
    y: origin.y + Math.floor(index / columns) * (nodeHeight + verticalGap)
  }))
}

export function resolveVisibleGroupGeometryNodes(memberNodes, geometryNodes) {
  if (!Array.isArray(memberNodes)) return []
  if (!Array.isArray(geometryNodes) || geometryNodes.length !== memberNodes.length) return memberNodes

  const geometryById = new Map()
  for (const node of geometryNodes) {
    if (!node?.id || geometryById.has(node.id)) return memberNodes
    geometryById.set(node.id, node)
  }

  if (!memberNodes.every(node => geometryById.has(node.id))) return memberNodes
  return memberNodes.map(node => geometryById.get(node.id))
}

export function getVisibleGroupGeometry(nodes, {
  padding = 60,
  titleHeight = 30,
  defaultWidth = 380,
  defaultHeight = 320
} = {}) {
  if (!Array.isArray(nodes) || nodes.length < 2) return null

  const bounds = nodes.map(node => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: Number(node.dimensions?.width || node.data?.width || node.data?.nodeWidth || defaultWidth),
    height: Number(node.dimensions?.height || node.data?.height || node.data?.nodeHeight || defaultHeight)
  }))
  const minX = Math.min(...bounds.map(item => item.x)) - padding
  const minY = Math.min(...bounds.map(item => item.y)) - padding - titleHeight
  const maxX = Math.max(...bounds.map(item => item.x + item.width)) + padding
  const maxY = Math.max(...bounds.map(item => item.y + item.height)) + padding

  return {
    position: { x: minX, y: minY },
    width: maxX - minX,
    height: maxY - minY,
    nodeOffsets: Object.fromEntries(
      bounds.map(item => [item.id, { x: item.x - minX, y: item.y - minY }])
    )
  }
}

export function getVisibleNodeGroups(nodes, existingGroups = []) {
  if (!Array.isArray(nodes)) return []

  const visibleGroups = nodes
    .filter(node => node?.type === 'group' && Array.isArray(node.data?.nodeIds) && node.data.nodeIds.length > 0)
    .map(node => ({
      id: node.id,
      name: node.data.groupName || '新建组',
      nodeIds: [...node.data.nodeIds],
      color: node.data.groupColor || 'rgba(100, 116, 139, 0.08)',
      borderColor: node.data.borderColor || 'rgba(100, 116, 139, 0.25)'
    }))
  const visibleGroupIds = new Set(visibleGroups.map(group => group.id))
  const logicalGroups = (Array.isArray(existingGroups) ? existingGroups : [])
    .filter(group => (
      group?.id &&
      !visibleGroupIds.has(group.id) &&
      nodes.some(node => node?.data?.groupId === group.id)
    ))

  return [...visibleGroups, ...logicalGroups]
}
