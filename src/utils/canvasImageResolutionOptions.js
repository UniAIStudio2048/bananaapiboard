const RESOLUTION_ORDER = ['1k', '2k', '3k', '4k']
const LEGACY_FIXED_RESOLUTIONS = ['1k', '2k', '4k']

function normalizeResolutionKey(size) {
  return String(size || '').trim().toLowerCase()
}

function formatResolutionLabel(key) {
  return key.toUpperCase()
}

function getResolutionValue(config, key) {
  if (!config || typeof config !== 'object') return undefined
  return config[key] ?? config[key.toUpperCase()]
}

export function getAvailableImageResolutionOptions(model = {}) {
  const pointsCost = model.pointsCost

  if (!pointsCost || typeof pointsCost !== 'object') {
    const fixedCost = Number(pointsCost) || 1
    return LEGACY_FIXED_RESOLUTIONS.map(key => ({
      value: formatResolutionLabel(key),
      label: formatResolutionLabel(key),
      pointsCost: fixedCost
    }))
  }

  const resolutionEnabled = model.resolutionEnabled || model.resolution_enabled || {}

  return RESOLUTION_ORDER
    .map(key => {
      const cost = Number(getResolutionValue(pointsCost, key)) || 0
      const enabled = getResolutionValue(resolutionEnabled, key)
      return {
        value: formatResolutionLabel(key),
        label: formatResolutionLabel(key),
        pointsCost: cost,
        enabled
      }
    })
    .filter(option => {
      // 显式开关优先：9000 端口的「启用/隐藏」开关（true/false）始终说了算
      if (typeof option.enabled === 'boolean') {
        return option.enabled
      }
      // 兼容旧数据：未配置 resolutionEnabled 时按积分判断（>0 才显示）
      return option.pointsCost > 0
    })
    .map(({ enabled, ...option }) => option)
}

export function normalizeImageSelectedSize(model, selectedSize) {
  const options = getAvailableImageResolutionOptions(model)
  const normalizedSize = normalizeResolutionKey(selectedSize)
  const current = options.find(option => normalizeResolutionKey(option.value) === normalizedSize)
  return current?.value || options[0]?.value || '1K'
}

export function getImageResolutionCost(model = {}, selectedSize) {
  const pointsCost = model.pointsCost
  if (!pointsCost || typeof pointsCost !== 'object') {
    return Number(pointsCost) || 1
  }

  const normalizedSize = normalizeResolutionKey(normalizeImageSelectedSize(model, selectedSize))
  const cost = Number(getResolutionValue(pointsCost, normalizedSize)) || 0
  if (cost > 0) return cost

  return getAvailableImageResolutionOptions(model)[0]?.pointsCost || 1
}
