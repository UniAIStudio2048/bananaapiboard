import { formatPoints } from './format.js'

export function normalizeSeedanceVideoInputMultiplier(value, fallback = 1) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return number
}

export function applySeedanceVideoInputMultiplier(cost, multiplier, hasVideoInput) {
  const baseCost = Number(cost) || 0
  if (!hasVideoInput) return baseCost
  const normalizedMultiplier = normalizeSeedanceVideoInputMultiplier(multiplier)
  return Math.round((baseCost * normalizedMultiplier + Number.EPSILON) * 100) / 100
}

export function formatSeedanceVideoInputMultiplier(multiplier) {
  return `${formatPoints(normalizeSeedanceVideoInputMultiplier(multiplier))}x`
}
