function formatRatioPart(value) {
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num) || num <= 0) return null
  const rounded = Math.round(num * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

export function normalizeHistoryAspectRatio(value, fallback = '1 / 1') {
  if (value === null || value === undefined || value === '') return fallback

  const raw = String(value).trim()
  if (!raw) return fallback

  const cssLike = raw.match(/^(\d+(?:\.\d+)?)\s*[/:x*]\s*(\d+(?:\.\d+)?)$/i)
  if (cssLike) {
    const left = formatRatioPart(cssLike[1])
    const right = formatRatioPart(cssLike[2])
    return left && right ? `${left} / ${right}` : fallback
  }

  const numeric = Number.parseFloat(raw)
  if (Number.isFinite(numeric) && numeric > 0) {
    const rounded = Math.round(numeric * 1000) / 1000
    return String(rounded)
  }

  return fallback
}

export function getHistoryAspectRatio(item = {}, fallback = '1 / 1') {
  const raw = item.aspect_ratio || item.aspectRatio || item.videoAspectRatio || item.previewAspectRatio
  return normalizeHistoryAspectRatio(raw, fallback)
}

export function getHistoryAspectRatioStyle(item = {}, fallback = '1 / 1') {
  return { aspectRatio: getHistoryAspectRatio(item, fallback) }
}
