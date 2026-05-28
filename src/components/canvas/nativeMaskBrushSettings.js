export function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return Math.max(min, Math.min(max, numericValue))
}

export function normalizeMaskBrushSettings(settings = {}) {
  return {
    size: clampNumber(settings.size, 1, 100, 10),
    hardness: clampNumber(settings.hardness, 0, 100, 100),
    opacity: clampNumber(settings.opacity, 1, 100, 100)
  }
}

export function getMaskBrushFeatherRadius(size, hardness) {
  const normalized = normalizeMaskBrushSettings({ size, hardness })
  return (normalized.size / 2) * (1 - normalized.hardness / 100)
}

export function getMaskBrushAlpha(opacity) {
  return normalizeMaskBrushSettings({ opacity }).opacity / 100
}
