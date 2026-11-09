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
 * 应用视频输入倍率：与后端 roundPoints(pointsCost * multiplier) 一致，四舍五入保留两位小数。
 *
 * @param {number} cost - 基础积分
 * @param {number} multiplier - 倍率（来自 resolveVideoInputMultiplier）
 * @returns {number} 倍率后积分（两位小数）
 */
export function applyVideoInputMultiplier(cost, multiplier) {
  const baseCost = Number(cost) || 0
  const m = Number(multiplier)
  const normalizedMultiplier = Number.isFinite(m) && m > 0 ? m : 1
  return Math.round((baseCost * normalizedMultiplier + Number.EPSILON) * 100) / 100
}

const WAN3_VIDEO_REFERENCE_MODES = ['multimodal_ref', 'video_edit', 'video_extend']
const WAN3_API_TYPES = ['wan3', 'atlascloud-wan3', 'wavespeed-wan3', 'siray-wan3', 'grsai-wan3']

function clampMaxVideos(value) {
  return Math.min(5, Math.max(0, Number(value) || 5))
}

/**
 * 计费用的参考视频个数：与 VideoNode 提交时实际写入 reference_videos 的个数一致，
 * 后端按该个数（countReferenceVideos）判断是否应用视频输入倍率及取档。
 *
 * @param {object} params
 * @param {object} params.config - 当前模型配置
 * @param {string} params.mode - 当前模型的生成模式（wan3Mode / routerbeeWan3Mode / wanMode）
 * @param {number} params.referenceVideoCount - 上游连接的视频个数
 * @returns {number}
 */
export function resolveBilledReferenceVideoCount({ config, mode, referenceVideoCount } = {}) {
  const count = Math.max(0, Math.floor(Number(referenceVideoCount) || 0))
  const apiType = config?.apiType
  if (WAN3_API_TYPES.includes(apiType)) {
    if (!WAN3_VIDEO_REFERENCE_MODES.includes(mode)) return 0
    const maxVideos = apiType === 'grsai-wan3' ? 0 : clampMaxVideos(config?.wan3Config?.maxVideos)
    return Math.min(count, maxVideos)
  }
  if (apiType === 'routerbee-wan3') {
    return mode === 'multimodal_ref' ? Math.min(count, clampMaxVideos(config?.routerbeeConfig?.maxVideos)) : 0
  }
  if (apiType === 'wan') {
    if (mode === 'r2v') return Math.min(count, 5)
    if (mode === 'videoedit' || mode === 'animate_mix') return Math.min(count, 1)
    return 0
  }
  return count
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
