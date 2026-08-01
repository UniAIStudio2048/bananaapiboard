function normalizeResolution(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '')
  if (/^\d+$/.test(normalized)) return `${normalized}p`
  return normalized
}

function getEnabledEntry(pricing, resolution) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return null
  const normalizedResolution = normalizeResolution(resolution)
  if (!normalizedResolution) return null
  return Object.entries(pricing).find(([key, entry]) => {
    return normalizeResolution(key) === normalizedResolution && entry && typeof entry === 'object' && entry.enabled !== false
  }) || null
}

export function getEnabledVideoResolutionOptions(pricing) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return []
  return Object.entries(pricing)
    .filter(([, entry]) => entry && typeof entry === 'object' && entry.enabled !== false)
    .map(([resolution]) => resolution)
}

export function resolveVideoResolutionPricing(pricing, resolution) {
  const entry = getEnabledEntry(pricing, resolution)
  if (!entry) return null
  const [configuredResolution, config] = entry
  const costPerSecond = Number(config.costPerSecond)
  if (!Number.isFinite(costPerSecond) || costPerSecond < 0) return null
  return { resolution: configuredResolution, costPerSecond }
}

export function calculateVideoResolutionPrice(pricing, resolution, duration) {
  const pricingEntry = resolveVideoResolutionPricing(pricing, resolution)
  const seconds = Number(duration)
  if (!pricingEntry || !Number.isFinite(seconds) || seconds <= 0) return null
  return Math.round(pricingEntry.costPerSecond * seconds)
}
