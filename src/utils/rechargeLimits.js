export const DEFAULT_RECHARGE_LIMITS = Object.freeze({ minAmount: 1, maxAmount: 10000 })
export const MAX_CONFIGURABLE_RECHARGE_AMOUNT = 100000

export function normalizeRechargeLimits(limits = {}) {
  const rawMin = Number(limits.minAmount)
  const rawMax = Number(limits.maxAmount)
  const minAmount = Math.min(
    MAX_CONFIGURABLE_RECHARGE_AMOUNT,
    Math.max(1, Number.isFinite(rawMin) ? rawMin : DEFAULT_RECHARGE_LIMITS.minAmount)
  )
  const configuredMax = Math.min(
    MAX_CONFIGURABLE_RECHARGE_AMOUNT,
    Math.max(1, Number.isFinite(rawMax) ? rawMax : DEFAULT_RECHARGE_LIMITS.maxAmount)
  )

  return {
    minAmount,
    maxAmount: Math.max(minAmount, configuredMax)
  }
}
