export function getDraggedNodeFinalPositions(nodes, draggedNode, finalPosition) {
  const offsetX = finalPosition.x - draggedNode.position.x
  const offsetY = finalPosition.y - draggedNode.position.y

  return Object.fromEntries(nodes.map(node => [node.id, {
    x: node.position.x + offsetX,
    y: node.position.y + offsetY
  }]))
}
