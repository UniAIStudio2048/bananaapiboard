export const OVERLAY_TYPE_LABELS = {
  person: '人物',
  object: '物品'
}

export function getNextOverlayLabel(overlays = [], type = 'person') {
  const prefix = OVERLAY_TYPE_LABELS[type] || OVERLAY_TYPE_LABELS.person
  const usedNumbers = new Set(
    overlays
      .map(item => String(item.label || '').match(new RegExp(`^${prefix}(\\d+)$`))?.[1])
      .filter(Boolean)
      .map(Number)
  )
  let next = 1
  while (usedNumbers.has(next)) next += 1
  return `${prefix}${next}`
}

export function clampOverlayPosition(position) {
  return {
    x: Math.max(0, Math.min(1, Number(position?.x) || 0)),
    y: Math.max(0, Math.min(1, Number(position?.y) || 0))
  }
}

export function createDefaultOverlay({
  source,
  type = 'person',
  url,
  originalName = '',
  existingOverlays = [],
  naturalWidth = 512,
  naturalHeight = 512
}) {
  return {
    id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    type,
    label: getNextOverlayLabel(existingOverlays, type),
    url,
    originalName,
    x: 0.5,
    y: 0.5,
    scale: 1,
    flipped: false,
    visible: true,
    zIndex: existingOverlays.length + 1,
    naturalWidth,
    naturalHeight
  }
}

export function sortVisibleOverlays(overlays = []) {
  return overlays
    .filter(item => item.visible !== false && item.url)
    .slice()
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))
}

export function getOverlayExportRect({
  overlay,
  outputWidth,
  outputHeight,
  baseHeightRatio = 0.42
}) {
  const naturalWidth = Math.max(1, Number(overlay.naturalWidth) || 1)
  const naturalHeight = Math.max(1, Number(overlay.naturalHeight) || 1)
  const scale = Math.max(0.05, Number(overlay.scale) || 1)
  const height = Math.round(outputHeight * baseHeightRatio * scale)
  const width = Math.round(height * (naturalWidth / naturalHeight))
  const left = Math.round(outputWidth * overlay.x - width / 2)
  const top = Math.round(outputHeight * overlay.y - height / 2)
  return { width, height, left, top }
}
