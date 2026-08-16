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
