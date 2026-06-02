export function sanitizeHistoryDownloadFilename(name) {
  return String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100)
}

export function getHistoryImageDownloadFilename(image) {
  const noteName = sanitizeHistoryDownloadFilename(image?.note)
  if (noteName) return `${noteName}.png`

  const model = sanitizeHistoryDownloadFilename(image?.model) || 'image'
  const id = sanitizeHistoryDownloadFilename(image?.id) || Date.now()
  return `${model}-${id}.png`
}

export function getHistoryImageShortcutAction(event) {
  const key = String(event?.key || '').toLowerCase()
  const hasShortcutModifier = Boolean(event?.ctrlKey || event?.altKey)
  if (!hasShortcutModifier) return null

  if (key === 's') return 'save'
  if (key === 'd') return 'saveAs'
  return null
}
