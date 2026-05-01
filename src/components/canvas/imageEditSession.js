const DEFAULT_HISTORY_LIMIT = 10

function getLowerUrl(imageUrl = '') {
  return String(imageUrl || '').toLowerCase().split('?')[0].split('#')[0]
}

export function chooseEditorExportFormat(imageUrl = '') {
  const normalizedUrl = getLowerUrl(imageUrl)

  if (normalizedUrl.endsWith('.jpg') || normalizedUrl.endsWith('.jpeg')) {
    return {
      mimeType: 'image/jpeg',
      format: 'jpeg',
      quality: 1,
      extension: 'jpg'
    }
  }

  return {
    mimeType: 'image/png',
    format: 'png',
    quality: 1,
    extension: 'png'
  }
}

export function clampSessionHistory(session = {}, maxEntries = DEFAULT_HISTORY_LIMIT) {
  const history = Array.isArray(session.history) ? [...session.history] : []
  const safeMaxEntries = Math.max(1, Number(maxEntries) || DEFAULT_HISTORY_LIMIT)

  if (history.length <= safeMaxEntries) {
    return {
      ...session,
      history,
      historyIndex: Math.min(
        Math.max(0, Number.isInteger(session.historyIndex) ? session.historyIndex : history.length - 1),
        Math.max(0, history.length - 1)
      )
    }
  }

  const trimmedHistory = history.slice(history.length - safeMaxEntries)
  const removedCount = history.length - trimmedHistory.length
  const nextIndex = Number.isInteger(session.historyIndex)
    ? session.historyIndex - removedCount
    : trimmedHistory.length - 1

  return {
    ...session,
    history: trimmedHistory,
    historyIndex: Math.min(
      Math.max(0, nextIndex),
      Math.max(0, trimmedHistory.length - 1)
    )
  }
}

export function isRestorableEditSession(session) {
  if (!session || session.version !== 1) return false
  if (!Array.isArray(session.history) || session.history.length === 0) return false
  if (!Number.isInteger(session.historyIndex)) return false
  return session.historyIndex >= 0 && session.historyIndex < session.history.length
}

export function buildSavedSessionPayload(input = {}) {
  return {
    version: 1,
    baseImageUrl: input.baseImageUrl || '',
    currentImageUrl: input.currentImageUrl || '',
    exportFormat: input.exportFormat || 'png',
    exportQuality: input.exportQuality ?? 1,
    imageMimeType: input.imageMimeType || 'image/png',
    originalWidth: input.originalWidth || 0,
    originalHeight: input.originalHeight || 0,
    displayWidth: input.displayWidth || 0,
    displayHeight: input.displayHeight || 0,
    historyIndex: input.historyIndex ?? 0,
    history: Array.isArray(input.history) ? input.history.map(item => ({ ...item })) : [],
    filters: { ...(input.filters || {}) },
    rotation: input.rotation || 0,
    flipX: !!input.flipX,
    flipY: !!input.flipY,
    brushSize: input.brushSize || 10,
    brushColor: input.brushColor || '#FF0000',
    currentMode: input.currentMode || '',
    updatedAt: Date.now()
  }
}

