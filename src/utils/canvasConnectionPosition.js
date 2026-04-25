export function elementCenterToFlowPosition({ elementRect, containerRect, viewport }) {
  if (!elementRect || !containerRect || !viewport) return null

  const zoom = viewport.zoom || 1
  const centerX = elementRect.left + elementRect.width / 2
  const centerY = elementRect.top + elementRect.height / 2

  return {
    x: (centerX - containerRect.left - (viewport.x || 0)) / zoom,
    y: (centerY - containerRect.top - (viewport.y || 0)) / zoom
  }
}

export function getElementCenterFlowPosition(element, viewport) {
  if (!element) return null

  const vueFlowEl = element.closest('.vue-flow')
  if (!vueFlowEl) return null

  return elementCenterToFlowPosition({
    elementRect: element.getBoundingClientRect(),
    containerRect: vueFlowEl.getBoundingClientRect(),
    viewport
  })
}

export function elementSideCenterToFlowPosition({ elementRect, containerRect, viewport, side = 'right', offset = 0 }) {
  if (!elementRect || !containerRect || !viewport) return null

  const zoom = viewport.zoom || 1
  const edgeX = side === 'left' ? elementRect.left - offset : elementRect.left + elementRect.width + offset
  const centerY = elementRect.top + elementRect.height / 2

  return {
    x: (edgeX - containerRect.left - (viewport.x || 0)) / zoom,
    y: (centerY - containerRect.top - (viewport.y || 0)) / zoom
  }
}

export function getElementSideCenterFlowPosition(element, viewport, side = 'right', offset = 0) {
  if (!element) return null

  const vueFlowEl = element.closest('.vue-flow')
  if (!vueFlowEl) return null

  return elementSideCenterToFlowPosition({
    elementRect: element.getBoundingClientRect(),
    containerRect: vueFlowEl.getBoundingClientRect(),
    viewport,
    side,
    offset
  })
}

export function resolveConnectionSourcePosition(pendingConnection, getFallbackPosition) {
  const sourcePosition = pendingConnection?.sourcePosition
  if (isFinitePosition(sourcePosition)) return sourcePosition

  return typeof getFallbackPosition === 'function' ? getFallbackPosition() : null
}

export function shouldTreatTargetAsGroupCanvas({ sourceNode, targetNode }) {
  return Boolean(
    sourceNode?.data?.groupId &&
    targetNode?.type === 'group' &&
    targetNode.id === sourceNode.data.groupId
  )
}

export function clampNodePositionToGroup({ position, nodeSize, groupNode, padding = 20 }) {
  if (!isFinitePosition(position) || !groupNode) return position

  const groupWidth = groupNode.data?.width || 400
  const groupHeight = groupNode.data?.height || 300
  const nodeWidth = nodeSize?.width || 0
  const nodeHeight = nodeSize?.height || 0

  const minX = groupNode.position.x + padding
  const minY = groupNode.position.y + padding
  const maxX = groupNode.position.x + groupWidth - nodeWidth - padding
  const maxY = groupNode.position.y + groupHeight - nodeHeight - padding

  return {
    x: clamp(position.x, minX, Math.max(minX, maxX)),
    y: clamp(position.y, minY, Math.max(minY, maxY))
  }
}

export function flowPositionToScreenPosition(position, viewport) {
  return {
    x: position.x * (viewport?.zoom || 1) + (viewport?.x || 0),
    y: position.y * (viewport?.zoom || 1) + (viewport?.y || 0)
  }
}

function isFinitePosition(position) {
  return position &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
