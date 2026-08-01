const normalizeResolution = value => String(value || '').trim().toLowerCase()

export function getSeedanceResolutionOptions({
  displayResolutions,
  resolutions,
  resolutionCosts,
  defaultResolution
} = {}) {
  const configured = Array.isArray(displayResolutions)
    ? displayResolutions
    : Array.isArray(resolutions) && resolutions.length > 0
      ? resolutions
      : Object.keys(resolutionCosts || {})

  const seen = new Set()
  const options = configured
    .map(normalizeResolution)
    .filter(value => value && !seen.has(value) && seen.add(value))

  if (options.length > 0) return options
  const fallback = normalizeResolution(defaultResolution)
  return fallback ? [fallback] : []
}

export function calculateSeedanceResolutionCost({ resolutionCosts, resolution, duration } = {}) {
  const normalizedResolution = normalizeResolution(resolution)
  const matchingKey = Object.keys(resolutionCosts || {}).find(key => normalizeResolution(key) === normalizedResolution)
  if (!matchingKey) return null

  const rate = Number(resolutionCosts[matchingKey])
  const seconds = Number(duration)
  if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(seconds) || seconds <= 0) return null
  return Math.ceil(rate * seconds)
}
