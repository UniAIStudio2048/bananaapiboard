import { formatPoints } from './format.js'

/**
 * 解析视频输入个数对应的分档倍率，与后端结算保持一致。
 *
 * 取档规则（与后端 resolveVideoInputMultiplier 完全一致）：
 * - videoInputMultipliers：固定长度 10 的数组，下标 = 输入视频个数 - 1；
 * - 输入 0 个视频时不乘（返回 1）；输入超过 10 个时取第 10 档（下标 9）；
 * - 数组未配置、缺失或该项非法时，回退旧字段
 *   （seedanceConfig.videoInputMultiplier / minimaxConfig.videoInputMultiplier / 顶层 videoInputMultiplier）；
 * - 旧字段也缺失/非法时返回 1（不乘）。
 *
 * @param {object} config - 当前模型配置（video_models 中对应项）
 * @param {number} count - 实际输入视频个数（referenceVideos 数组长度）
 * @returns {number} 倍率（恒为正数）
 */
export function resolveVideoInputMultiplier(config = {}, count = 0) {
  const inputCount = Number(count)
  if (!Number.isFinite(inputCount) || inputCount <= 0) return 1

  const multipliers = config?.videoInputMultipliers
  if (Array.isArray(multipliers) && multipliers.length > 0) {
    const index = Math.min(inputCount - 1, 9)
    const value = Number(multipliers[index])
    if (Number.isFinite(value) && value > 0) return value
  }

  const legacy =
    config?.seedanceConfig?.videoInputMultiplier ??
    config?.minimaxConfig?.videoInputMultiplier ??
    config?.videoInputMultiplier
  const legacyNumber = Number(legacy)
  if (Number.isFinite(legacyNumber) && legacyNumber > 0) return legacyNumber

  return 1
}

/**
 * 应用视频输入倍率：与后端 roundPoints(pointsCost * multiplier) 一致，四舍五入到整数积分。
 *
 * @param {number} cost - 基础积分
 * @param {number} multiplier - 倍率（来自 resolveVideoInputMultiplier）
 * @returns {number} 倍率后积分（整数）
 */
export function applyVideoInputMultiplier(cost, multiplier) {
  const baseCost = Number(cost) || 0
  const m = Number(multiplier)
  const normalizedMultiplier = Number.isFinite(m) && m > 0 ? m : 1
  return Math.round(baseCost * normalizedMultiplier)
}

/**
 * 倍率角标显示："1.5x"。
 *
 * @param {number} multiplier - 倍率
 * @returns {string} 格式化后的倍率文本
 */
export function formatVideoInputMultiplier(multiplier) {
  const m = Number(multiplier)
  return `${formatPoints(Number.isFinite(m) && m > 0 ? m : 1)}x`
}
