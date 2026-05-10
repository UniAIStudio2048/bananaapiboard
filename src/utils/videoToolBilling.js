export function calculateSubtitleEraseBilling({ totalSeconds, pricePerMinute, pointsPerSecond }) {
  const seconds = Math.max(0, Number(totalSeconds) || 0)
  const secRate = Math.max(0, Number(pointsPerSecond) || 0)
  if (secRate > 0) {
    const billedSeconds = Math.max(1, Math.ceil(seconds))
    return {
      totalSeconds: seconds,
      billedSeconds,
      billedMinutes: Math.ceil(billedSeconds / 60),
      billingUnit: 'second',
      pointsPerSecond: secRate,
      pointsCost: billedSeconds * secRate
    }
  }

  const price = Math.max(0, Number(pricePerMinute) || 0)
  const billedMinutes = Math.max(1, Math.ceil(seconds / 60))
  return {
    totalSeconds: seconds,
    billedMinutes,
    billingUnit: 'minute',
    pointsPerSecond: 0,
    pointsCost: billedMinutes * price
  }
}

export function getSubtitleErasePrice(channelCfg, mode = 'standard') {
  if (!channelCfg) return 0
  if (mode === 'fine' || String(mode).startsWith('watermark')) return Math.max(0, Number(channelCfg.finePricePerMinute) || 0)
  return Math.max(0, Number(channelCfg.standardPricePerMinute) || 0)
}

export function getSubtitleErasePointsPerSecond(channelCfg, mode = 'standard') {
  if (!channelCfg) return 0
  const normalizedMode = normalizeSubtitleEraseMode(mode)
  if (normalizedMode === 'subtitle_sel_area') return Math.max(0, Number(channelCfg.subtitleSelAreaPointsPerSecond ?? channelCfg.standardPointsPerSecond) || 0)
  if (normalizedMode === 'watermark_all_area') return Math.max(0, Number(channelCfg.watermarkAllAreaPointsPerSecond ?? channelCfg.finePointsPerSecond) || 0)
  if (normalizedMode === 'watermark_sel_area') return Math.max(0, Number(channelCfg.watermarkSelAreaPointsPerSecond ?? channelCfg.finePointsPerSecond) || 0)
  return Math.max(0, Number(channelCfg.subtitleAllAreaPointsPerSecond ?? channelCfg.standardPointsPerSecond) || 0)
}

export function normalizeSubtitleEraseMode(mode = 'subtitle_all_area') {
  const value = String(mode || 'subtitle_all_area').trim().toLowerCase()
  if (value === 'standard') return 'subtitle_all_area'
  if (value === 'fine') return 'watermark_sel_area'
  if ([
    'subtitle_all_area',
    'subtitle_sel_area',
    'watermark_all_area',
    'watermark_sel_area'
  ].includes(value)) return value
  return 'subtitle_all_area'
}

/** 与后端一致：按 masks 里的 configured 判断（不向浏览器下发明文密钥） */
export function pickSubtitleEraseChannelFromMasked(config) {
  if (!config?.enabled) return null
  const order = config.priorityFirst === 'volcengine' ? ['volcengine', 'wuhenai'] : ['wuhenai', 'volcengine']
  for (const id of order) {
    const ch = config[id]
    if (ch?.enabled && ch?.configured) return { id, channel: ch }
  }
  return null
}

/** 兼容旧版扁平配置（仅有顶层 apiKey / 计费） */
export function pickSubtitleEraseChannelLegacyFlat(config) {
  if (!config?.enabled) return null
  if ((config.wuhenai == null && config.volcengine == null) && config.configured) {
    return {
      id: 'wuhenai',
      channel: {
        standardPricePerMinute: config.standardPricePerMinute,
        finePricePerMinute: config.finePricePerMinute,
        standardPointsPerSecond: config.standardPointsPerSecond,
        finePointsPerSecond: config.finePointsPerSecond
      }
    }
  }
  return null
}

export function estimateSubtitleEraseBilling({ totalSeconds, config, mode = 'standard' }) {
  const normalizedMode = normalizeSubtitleEraseMode(mode)
  let picked = pickSubtitleEraseChannelFromMasked(config)
  if (!picked) picked = pickSubtitleEraseChannelLegacyFlat(config)

  if (!picked) {
    const seconds = Math.max(0, Number(totalSeconds) || 0)
    return {
      totalSeconds: seconds,
      billedMinutes: Math.max(1, Math.ceil(seconds / 60)),
      billingUnit: 'minute',
      pointsPerSecond: 0,
      pointsCost: 0,
      mode: normalizedMode,
      channel: null
    }
  }

  return {
    ...calculateSubtitleEraseBilling({
      totalSeconds,
      pricePerMinute: getSubtitleErasePrice(picked.channel, normalizedMode),
      pointsPerSecond: getSubtitleErasePointsPerSecond(picked.channel, normalizedMode)
    }),
    mode: normalizedMode,
    channel: picked.id
  }
}
