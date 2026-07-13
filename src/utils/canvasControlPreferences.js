export const CANVAS_GRID_SNAP_STORAGE_KEY = 'canvasGridSnapEnabled'
export const CANVAS_LAST_EDGE_STYLE_STORAGE_KEY = 'canvasLastVisibleEdgeStyle'

const VISIBLE_EDGE_STYLES = new Set(['smoothstep', 'bezier', 'straight'])

export function resolveCanvasGridSnap(preferences, storedValue) {
  const preference = preferences?.canvas?.gridSnap
  if (typeof preference === 'boolean') return preference
  if (storedValue === 'false') return false
  if (storedValue === 'true') return true
  return true
}

export function resolveEdgeRestoreStyle(style) {
  return VISIBLE_EDGE_STYLES.has(style) ? style : 'bezier'
}

function safeStorageWrite(storage, key, value) {
  try {
    storage?.setItem(key, value)
    return Boolean(storage)
  } catch {
    return false
  }
}

export function writeCanvasGridSnap(storage, enabled) {
  return safeStorageWrite(
    storage,
    CANVAS_GRID_SNAP_STORAGE_KEY,
    enabled ? 'true' : 'false'
  )
}

export function writeEdgeRestoreStyle(storage, style) {
  return safeStorageWrite(
    storage,
    CANVAS_LAST_EDGE_STYLE_STORAGE_KEY,
    resolveEdgeRestoreStyle(style)
  )
}
