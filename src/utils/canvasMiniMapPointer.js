export function getMiniMapPointerPosition(svg, clientX, clientY) {
  if (!svg || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  const transform = svg.getScreenCTM?.()
  if (!transform) return null

  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const position = point.matrixTransform(transform.inverse())
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null
  return { x: position.x, y: position.y }
}
