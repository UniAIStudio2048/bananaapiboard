const normalizeResolution = value => String(value || '').trim().toLowerCase()

// 标准分辨率顺序，对齐 bananatenantmanager OutputResolutionDisplayConfig.vue 的 STANDARD_RESOLUTIONS
const STANDARD_RESOLUTION_ORDER = ['480p', '512p', '720p', '768p', '1080p', '2k', '4k']

function sortByStandardOrder(options) {
  const known = []
  const unknown = []
  for (const opt of options) {
    const idx = STANDARD_RESOLUTION_ORDER.indexOf(opt)
    if (idx >= 0) {
      known.push({ opt, idx })
    } else {
      unknown.push(opt)
    }
  }
  known.sort((a, b) => a.idx - b.idx)
  return [...known.map(item => item.opt), ...unknown]
}

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

  if (options.length > 0) return sortByStandardOrder(options)
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
