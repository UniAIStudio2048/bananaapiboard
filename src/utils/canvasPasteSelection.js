export function syncPastedNodeSelection({ existingNodes = [], pastedNodes = [] } = {}) {
  const pastedNodeIds = pastedNodes
    .map(node => node?.id)
    .filter(Boolean)

  existingNodes.forEach(node => {
    if (node) node.selected = false
  })

  const pastedNodeIdSet = new Set(pastedNodeIds)
  pastedNodes.forEach(node => {
    if (node) node.selected = pastedNodeIdSet.has(node.id)
  })

  return pastedNodeIds
}
