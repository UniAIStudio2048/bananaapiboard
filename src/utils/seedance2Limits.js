export const SEEDANCE2_DEFAULT_LIMITS = Object.freeze({
  maxImages: 9,
  maxVideos: 3,
  maxAudios: 3,
  minDuration: 4,
  maxDuration: 15,
  maxReferenceVideoDuration: 15
})

export const SEEDANCE25_LIMITS = Object.freeze({
  maxImages: 30,
  maxVideos: 10,
  maxAudios: 10,
  minDuration: 3,
  maxDuration: 30,
  maxReferenceVideoDuration: 30,
  minReferenceMediaDuration: 2,
  maxReferenceMediaDuration: 30,
  maxTotalReferenceMediaDuration: 30
})

const SEEDANCE25_MODE_CONSTRAINTS = Object.freeze({
  multimodal_ref: Object.freeze({
    // reference 模式官方不限制 ratio（可选任意宽高比），这里不设 ratio，由调用方传入的比例优先、
    // 缺省回落 adaptive。对比 edit/extend/首帧/首尾帧官方强制 adaptive。
    duration: -1,
    // 官方推荐显式指定 reference，避免 auto 自动判定与实际任务类型不一致触发异步报错
    // （InvalidParameter.TaskTypeMismatch）。reference 即参考生视频，ratio/duration 无特殊限制。
    omniReferenceTaskType: 'reference',
    minReferenceVideoDuration: 2,
    maxReferenceVideoDuration: 30
  }),
  video_edit: Object.freeze({
    ratio: 'adaptive',
    duration: -1,
    omniReferenceTaskType: 'edit',
    // 编辑链路建议 mov（H.264 + yuv444p + PCM，高色彩精度），便于后续调色/抠像/合成
    outputFormat: 'mov',
    minReferenceVideoDuration: 2,
    maxReferenceVideoDuration: 30,
    promptKeywords: ['编辑视频', '增加', '加上', '加一些', '删除', '去掉', '修改', '替换', '改成']
  }),
  video_extend: Object.freeze({
    ratio: 'adaptive',
    omniReferenceTaskType: 'extend',
    // 延长链路同样建议 mov，保持与编辑链路一致的色彩精度
    outputFormat: 'mov',
    promptKeywords: ['向前延长', '向后延长', '延续', '续写']
  }),
  image2video_first: Object.freeze({ ratio: 'adaptive' }),
  image2video_first_last: Object.freeze({ ratio: 'adaptive' })
})

function toPositiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

// 与后端 isSeedance25Model 对齐：兼容第三方渠道自定义模型名（dreamina-seedance-2-5-*、seedance_2_5_pro、seedance2.5 等）
const SEEDANCE25_MODEL_PATTERN = /seedance[-_\s]?2[-._\s]?5(?!\d)/i

export function isSeedance25Model(modelConfig = {}) {
  const values = typeof modelConfig === 'object'
    ? [
        modelConfig.actualModel,
        modelConfig.name,
        modelConfig.value,
        modelConfig.seedanceConfig?.model,
        modelConfig.seedance2Model
      ]
    : [modelConfig]
  return values.some(value => SEEDANCE25_MODEL_PATTERN.test(String(value || '')))
}

export function getSeedance25ModeConstraints(modelConfig = {}, mode = '') {
  if (!isSeedance25Model(modelConfig)) return null
  const constraints = SEEDANCE25_MODE_CONSTRAINTS[String(mode || '').trim()]
  if (!constraints) return null
  const { promptKeywords, ...requestConstraints } = constraints
  return requestConstraints
}

export function validateSeedance25ModePrompt({ modelConfig, mode, prompt } = {}) {
  if (!isSeedance25Model(modelConfig)) return ''
  const constraints = SEEDANCE25_MODE_CONSTRAINTS[String(mode || '').trim()]
  if (!constraints?.promptKeywords) return ''

  const text = String(prompt || '')
  if (constraints.promptKeywords.some(keyword => text.includes(keyword))) return ''

  return constraints.omniReferenceTaskType === 'edit'
    ? 'Seedance 2.5 视频编辑提示词需包含“编辑视频、增加/加上、删除/去掉、修改/替换/改成”等关键词'
    : 'Seedance 2.5 视频延长提示词需包含“向前/向后延长、延续、续写”等关键词'
}

export function resolveSeedance2Limits(modelConfig = {}) {
  const config = modelConfig?.seedanceConfig || {}
  const base = isSeedance25Model(modelConfig) ? SEEDANCE25_LIMITS : SEEDANCE2_DEFAULT_LIMITS
  const maxDuration = Math.min(toPositiveNumber(config.maxDuration) || base.maxDuration, base.maxDuration)
  return {
    maxImages: toPositiveNumber(config.maxImages) || base.maxImages,
    maxVideos: toPositiveNumber(config.maxVideos) || base.maxVideos,
    maxAudios: toPositiveNumber(config.maxAudios) || base.maxAudios,
    minDuration: Math.min(toPositiveNumber(config.minDuration) || base.minDuration, maxDuration),
    maxDuration,
    maxReferenceVideoDuration: base.maxReferenceVideoDuration,
    ...(isSeedance25Model(modelConfig)
      ? {
          minReferenceMediaDuration: base.minReferenceMediaDuration,
          maxReferenceMediaDuration: base.maxReferenceMediaDuration,
          maxTotalReferenceMediaDuration: base.maxTotalReferenceMediaDuration
        }
      : {})
  }
}

export function validateSeedanceReferenceCounts({ imageCount = 0, videoCount = 0, audioCount = 0, limits = SEEDANCE2_DEFAULT_LIMITS } = {}) {
  if (imageCount > limits.maxImages) return `参考图片数量不能超过${limits.maxImages}张，当前${imageCount}张`
  if (videoCount > limits.maxVideos) return `参考视频数量不能超过${limits.maxVideos}个，当前${videoCount}个`
  if (audioCount > limits.maxAudios) return `参考音频数量不能超过${limits.maxAudios}个，当前${audioCount}个`
  return ''
}
