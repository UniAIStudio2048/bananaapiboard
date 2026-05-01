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
  if (getClipboardFiles(clipboardData).length > 0) {
    return 'system-files'
  }

  if (hasNodeClipboard) {
    return 'nodes'
  }

  return 'none'
}
