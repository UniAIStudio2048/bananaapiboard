function normalizeDimension(value, name) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return n
}

function normalizeCoordinate(value, name) {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a finite number`)
  }
  return n
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function roundNormalized(value) {
  return Number(value.toFixed(6))
}

export function normalizePreviewRectToVideo({ selection, videoBox }) {
  const videoX = normalizeCoordinate(videoBox?.x, 'videoBox.x')
  const videoY = normalizeCoordinate(videoBox?.y, 'videoBox.y')
  const videoWidth = normalizeDimension(videoBox?.width, 'videoBox.width')
  const videoHeight = normalizeDimension(videoBox?.height, 'videoBox.height')

  const selectionX = normalizeCoordinate(selection?.x, 'selection.x')
  const selectionY = normalizeCoordinate(selection?.y, 'selection.y')
  const selectionWidth = normalizeCoordinate(selection?.width, 'selection.width')
  const selectionHeight = normalizeCoordinate(selection?.height, 'selection.height')

  const left = Math.min(selectionX, selectionX + selectionWidth)
  const right = Math.max(selectionX, selectionX + selectionWidth)
  const top = Math.min(selectionY, selectionY + selectionHeight)
  const bottom = Math.max(selectionY, selectionY + selectionHeight)

  const clampedLeft = clamp((left - videoX) / videoWidth)
  const clampedRight = clamp((right - videoX) / videoWidth)
  const clampedTop = clamp((top - videoY) / videoHeight)
  const clampedBottom = clamp((bottom - videoY) / videoHeight)

  return {
    x: roundNormalized(clampedLeft),
    y: roundNormalized(clampedTop),
    width: roundNormalized(Math.max(0, clampedRight - clampedLeft)),
    height: roundNormalized(Math.max(0, clampedBottom - clampedTop))
  }
}
