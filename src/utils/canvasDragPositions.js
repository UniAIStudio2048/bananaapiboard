export function getDraggedNodeFinalPositions(nodes, draggedNode, finalPosition) {
  const offsetX = finalPosition.x - draggedNode.position.x
  const offsetY = finalPosition.y - draggedNode.position.y

  return Object.fromEntries(nodes.map(node => [node.id, {
    x: node.position.x + offsetX,
    y: node.position.y + offsetY
  }]))
}

export function getDraggedNodeDropPosition(position, alignmentSnap, gridSnapEnabled) {
  return {
    x: alignmentSnap.x ?? (gridSnapEnabled ? Math.round(position.x / 20) * 20 : position.x),
    y: alignmentSnap.y ?? (gridSnapEnabled ? Math.round(position.y / 20) * 20 : position.y)
  }
}
