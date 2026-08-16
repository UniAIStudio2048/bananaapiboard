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
  maxDuration: 15,
  maxReferenceVideoDuration: 30
})

const SEEDANCE25_MODE_CONSTRAINTS = Object.freeze({
  multimodal_ref: Object.freeze({
    ratio: 'adaptive',
    duration: -1,
    omniReferenceTaskType: 'auto',
    minReferenceVideoDuration: 4,
    maxReferenceVideoDuration: 30
  }),
  video_edit: Object.freeze({
    ratio: 'adaptive',
    duration: -1,
    omniReferenceTaskType: 'edit',
    minReferenceVideoDuration: 4,
    maxReferenceVideoDuration: 30,
    promptKeywords: ['编辑视频', '增加', '加上', '加一些', '删除', '去掉', '修改', '替换', '改成']
  }),
  video_extend: Object.freeze({
    ratio: 'adaptive',
    omniReferenceTaskType: 'extend',
    minReferenceVideoDuration: 4,
    maxReferenceVideoDuration: 30,
    promptKeywords: ['向前延长', '向后延长', '延续', '续写']
  }),
  image2video_first: Object.freeze({ ratio: 'adaptive' }),
  image2video_first_last: Object.freeze({ ratio: 'adaptive' })
})

function toPositiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

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
  return values.some(value => String(value || '').toLowerCase().includes('seedance-2-5'))
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
    maxReferenceVideoDuration: base.maxReferenceVideoDuration
  }
}

export function validateSeedanceReferenceCounts({ imageCount = 0, videoCount = 0, audioCount = 0, limits = SEEDANCE2_DEFAULT_LIMITS } = {}) {
  if (imageCount > limits.maxImages) return `参考图片数量不能超过${limits.maxImages}张，当前${imageCount}张`
  if (videoCount > limits.maxVideos) return `参考视频数量不能超过${limits.maxVideos}个，当前${videoCount}个`
  if (audioCount > limits.maxAudios) return `参考音频数量不能超过${limits.maxAudios}个，当前${audioCount}个`
  return ''
}
