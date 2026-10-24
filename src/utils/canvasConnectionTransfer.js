/**
 * 规划把一个节点的全部连线迁移或复制到另一个节点。
 * 该函数只计算变更，不触碰 Pinia/Vue 响应式状态，便于在画布交互之外复用和测试。
 */
export function planNodeConnectionTransfer({
  edges = [],
  sourceNodeId,
  targetNodeId,
  mode = 'move'
} = {}) {
  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    return { removeEdgeIds: [], addEdges: [] }
  }

  const sourceEdges = edges.filter(edge =>
    edge && (edge.source === sourceNodeId || edge.target === sourceNodeId)
  )
  if (sourceEdges.length === 0) return { removeEdgeIds: [], addEdges: [] }

  const removeEdgeIds = mode === 'copy'
    ? []
    : sourceEdges.map(edge => edge.id).filter(Boolean)
  const removedIds = new Set(removeEdgeIds)
  const existingSignatures = new Set(
    edges
      .filter(edge => !removedIds.has(edge.id))
      .map(getEdgeSignature)
  )
  const usedIds = new Set(edges.map(edge => edge?.id).filter(Boolean))
  const addEdges = []

  for (const edge of sourceEdges) {
    const nextEdge = {
      ...edge,
      source: edge.source === sourceNodeId ? targetNodeId : edge.source,
      target: edge.target === sourceNodeId ? targetNodeId : edge.target
    }

    // A connection from the source node to itself would become a target self-loop.
    if (!nextEdge.source || !nextEdge.target || nextEdge.source === nextEdge.target) continue

    const signature = getEdgeSignature(nextEdge)
    if (existingSignatures.has(signature)) continue

    const baseId = `transfer-${edge.id || `${edge.source}-${edge.target}`}-${targetNodeId}`
    let id = baseId
    let suffix = 2
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`

    const plannedEdge = { ...nextEdge, id }
    addEdges.push(plannedEdge)
    existingSignatures.add(signature)
    usedIds.add(id)
  }

  return { removeEdgeIds, addEdges }
}

function getEdgeSignature(edge) {
  return [edge?.source, edge?.target, edge?.sourceHandle || '', edge?.targetHandle || ''].join('|')
}
