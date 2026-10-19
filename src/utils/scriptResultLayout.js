// Reserve the whole output grid, including the visible group's padding.
// Subsequent asset/shot/video batches must not reuse the same canvas space.
export function getScriptResultPositions(parent, nodes, count) {
  if (!count) return []
  const columns = Math.min(count, 4), width = 400, height = 600, gap = 80, padding = 90
  const gridWidth = columns * (width + gap) - gap
  const gridHeight = Math.ceil(count / columns) * (height + gap) - gap
  const y = parent.position.y
  let x = parent.position.x + 600
  const bounds = nodes.map(node => ({
    x: node.position.x, y: node.position.y,
    width: Number(node.dimensions?.width || node.data?.width || node.data?.nodeWidth || width),
    height: Number(node.dimensions?.height || node.data?.height || node.data?.nodeHeight || height)
  }))
  let collision
  do {
    collision = bounds.find(rect => x - padding < rect.x + rect.width && x + gridWidth + padding > rect.x && y - padding < rect.y + rect.height && y + gridHeight + padding > rect.y)
    if (collision) x = collision.x + collision.width + padding + gap
  } while (collision)
  return Array.from({ length: count }, (_, index) => ({ x: x + index % columns * (width + gap), y: y + Math.floor(index / columns) * (height + gap) }))
}
