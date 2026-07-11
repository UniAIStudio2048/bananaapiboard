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

export function getVisibleNodeGroups(nodes) {
  if (!Array.isArray(nodes)) return []

  return nodes
    .filter(node => node?.type === 'group' && Array.isArray(node.data?.nodeIds) && node.data.nodeIds.length > 0)
    .map(node => ({
      id: node.id,
      name: node.data.groupName || '新建组',
      nodeIds: [...node.data.nodeIds],
      color: node.data.groupColor || 'rgba(100, 116, 139, 0.08)',
      borderColor: node.data.borderColor || 'rgba(100, 116, 139, 0.25)'
    }))
}
