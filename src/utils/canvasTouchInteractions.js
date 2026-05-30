export function getTouchPoint(touch) {
  if (!touch || typeof touch.clientX !== 'number' || typeof touch.clientY !== 'number') {
    return null
  }

  return { x: touch.clientX, y: touch.clientY }
}

export function getTouchMidpoint(firstTouch, secondTouch) {
  const first = getTouchPoint(firstTouch)
  const second = getTouchPoint(secondTouch)
  if (!first || !second) return null

  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  }
}

export function getTouchDistance(firstTouch, secondTouch) {
  const first = getTouchPoint(firstTouch)
  const second = getTouchPoint(secondTouch)
  if (!first || !second) return 0

  const dx = second.x - first.x
  const dy = second.y - first.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function applyPanToViewport(viewport, delta) {
  return {
    x: viewport.x + delta.dx,
    y: viewport.y + delta.dy,
    zoom: viewport.zoom
  }
}

export function applyZoomAtScreenPoint(viewport, nextZoom, screenPoint, options = {}) {
  const minZoom = typeof options.minZoom === 'number' ? options.minZoom : 0.1
  const maxZoom = typeof options.maxZoom === 'number' ? options.maxZoom : 5
  const zoom = Math.min(Math.max(nextZoom, minZoom), maxZoom)

  if (zoom === viewport.zoom) {
    return { ...viewport }
  }

  const flowX = (screenPoint.x - viewport.x) / viewport.zoom
  const flowY = (screenPoint.y - viewport.y) / viewport.zoom

  return {
    x: screenPoint.x - flowX * zoom,
    y: screenPoint.y - flowY * zoom,
    zoom
  }
}
