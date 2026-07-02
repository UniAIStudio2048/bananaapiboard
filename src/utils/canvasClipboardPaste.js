export function getClipboardFiles(clipboardData) {
  if (!clipboardData) return []

  const files = Array.from(clipboardData.files || [])

  if (files.length === 0 && clipboardData.items) {
    for (const item of clipboardData.items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }

  return files
}

export function resolveCanvasPasteSource({ hasNodeClipboard, clipboardData }) {
  if (hasNodeClipboard) {
    return 'nodes'
  }

  if (getClipboardFiles(clipboardData).length > 0) {
    return 'system-files'
  }

  return 'none'
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function isScreenPointInsideRect(point, rect) {
  if (!point || !rect) return false

  const left = toFiniteNumber(rect.left)
  const top = toFiniteNumber(rect.top)
  const right = toFiniteNumber(rect.right) ?? (
    left !== null && toFiniteNumber(rect.width) !== null
      ? left + toFiniteNumber(rect.width)
      : null
  )
  const bottom = toFiniteNumber(rect.bottom) ?? (
    top !== null && toFiniteNumber(rect.height) !== null
      ? top + toFiniteNumber(rect.height)
      : null
  )
  const x = toFiniteNumber(point.x)
  const y = toFiniteNumber(point.y)

  if (left === null || top === null || right === null || bottom === null || x === null || y === null) {
    return false
  }

  return x >= left && x <= right && y >= top && y <= bottom
}

export function resolveCanvasPasteScreenPosition({ lastMousePosition, canvasRect } = {}) {
  if (isScreenPointInsideRect(lastMousePosition, canvasRect)) {
    return { x: lastMousePosition.x, y: lastMousePosition.y }
  }

  if (canvasRect) {
    const left = toFiniteNumber(canvasRect.left)
    const top = toFiniteNumber(canvasRect.top)
    const width = toFiniteNumber(canvasRect.width)
    const height = toFiniteNumber(canvasRect.height)

    if (left !== null && top !== null && width !== null && height !== null && width > 0 && height > 0) {
      return {
        x: left + width / 2,
        y: top + height / 2
      }
    }
  }

  if (lastMousePosition) {
    const x = toFiniteNumber(lastMousePosition.x)
    const y = toFiniteNumber(lastMousePosition.y)
    if (x !== null && y !== null) return { x, y }
  }

  return { x: 0, y: 0 }
}

export function resolveCanvasMenuPastePosition(position) {
  const flowX = toFiniteNumber(position?.flowX)
  const flowY = toFiniteNumber(position?.flowY)

  if (flowX !== null && flowY !== null) {
    return { x: flowX, y: flowY }
  }

  return {
    x: toFiniteNumber(position?.x) ?? 0,
    y: toFiniteNumber(position?.y) ?? 0
  }
}
