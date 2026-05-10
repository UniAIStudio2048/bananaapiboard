export function calculateSubtitleEraseBilling({ totalSeconds, pricePerMinute }) {
  const seconds = Math.max(0, Number(totalSeconds) || 0)
  const price = Math.max(0, Number(pricePerMinute) || 0)
  const billedMinutes = Math.max(1, Math.ceil(seconds / 60))

  return {
    totalSeconds: seconds,
    billedMinutes,
    pointsCost: billedMinutes * price
  }
}

export function getSubtitleErasePrice(config, mode = 'standard') {
  if (mode === 'fine') return Math.max(0, Number(config?.finePricePerMinute) || 0)
  return Math.max(0, Number(config?.standardPricePerMinute) || 0)
}

export function estimateSubtitleEraseBilling({ totalSeconds, config, mode = 'standard' }) {
  return {
    ...calculateSubtitleEraseBilling({
      totalSeconds,
      pricePerMinute: getSubtitleErasePrice(config, mode)
    }),
    mode: mode === 'fine' ? 'fine' : 'standard'
  }
}
