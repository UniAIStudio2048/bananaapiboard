const MODE_TO_SD2_MODE = {
  t2v: 'text2video',
  i2v: 'image2video_first',
  a2v: 'multimodal_ref'
}

const SD2_MODE_TO_GENERATION_MODE = {
  text2video: 'text',
  image2video_first: 'image',
  image2video_first_last: 'image',
  multimodal_ref: 'image',
  video_edit: 'image',
  video_extend: 'image'
}

class FormEntryList {
  constructor() {
    this.entries = []
  }

  append(name, value) {
    this.entries.push([name, value])
  }

  get(name) {
    return this.entries.find(([key]) => key === name)?.[1] ?? null
  }

  getAll(name) {
    return this.entries.filter(([key]) => key === name).map(([, value]) => value)
  }

  has(name) {
    return this.entries.some(([key]) => key === name)
  }

  toArray() {
    return [...this.entries]
  }
}

function hasByteforMarker(modelConfig) {
  const fields = [
    modelConfig?.apiType,
    modelConfig?.apiBase,
    modelConfig?.provider,
    modelConfig?.name,
    modelConfig?.displayName,
    modelConfig?.actualModel
  ]

  return fields.some(value => {
    if (value === undefined || value === null) return false
    const normalized = String(value).toLowerCase()
    return normalized.includes('bytefor') || normalized.includes('byteforapi')
  })
}

export function isSeedanceSd2VideoModel(modelConfig) {
  const apiType = modelConfig?.apiType || ''
  if (hasByteforMarker(modelConfig)) return false
  return apiType === 'seedance-2.0' || apiType === 'ant' || apiType === 'happyhorse'
}

export function getDefaultSeedance2ModeForVideoModel(modelConfig) {
  const defaultMode = modelConfig?.defaultSeedance2Mode || modelConfig?.seedanceConfig?.defaultMode
  if (defaultMode) return defaultMode
  const defaultVideoMode = modelConfig?.defaultVideoMode || modelConfig?.happyHorseConfig?.defaultVideoMode
  return MODE_TO_SD2_MODE[defaultVideoMode] || 'text2video'
}

export function getDefaultGenerationModeForVideoModel(modelConfig) {
  if (!modelConfig) return 'text'
  if (isSeedanceSd2VideoModel(modelConfig)) {
    const seedanceMode = getDefaultSeedance2ModeForVideoModel(modelConfig)
    return SD2_MODE_TO_GENERATION_MODE[seedanceMode] || 'text'
  }
  if (modelConfig.defaultVideoMode === 'i2v' || modelConfig.defaultVideoMode === 'a2v') return 'image'
  return 'text'
}

export function resolveVideoRequestModel(modelConfig, modelValue) {
  const apiType = modelConfig?.apiType || ''
  if (apiType === 'bytefor' || apiType === 'seedance-openapi-pro' || apiType === 'seedance-openai') {
    return modelConfig?.seedanceOpenConfig?.model || modelConfig?.seedanceConfig?.model || modelConfig?.actualModel || modelValue
  }
  return modelConfig?.actualModel || modelConfig?.seedanceOpenConfig?.model || modelValue
}

export function buildVideoGenerationFormEntries({
  modelConfig,
  prompt,
  model,
  aspectRatio,
  duration,
  mode,
  imageFiles = [],
  hd = false,
  watermark = false,
  isPrivate = true,
  seedance = {}
}) {
  const entries = new FormEntryList()
  const isSeedance = isSeedanceSd2VideoModel(modelConfig)

  entries.append('prompt', prompt)
  entries.append('model', resolveVideoRequestModel(modelConfig, model))
  entries.append('aspect_ratio', aspectRatio)
  entries.append('duration', isSeedance ? String(seedance.duration) : duration)
  entries.append('hd', hd ? 'true' : 'false')
  entries.append('watermark', watermark ? 'true' : 'false')
  entries.append('private', isPrivate ? 'true' : 'false')

  if (mode === 'image') {
    for (const file of imageFiles) {
      entries.append('images', file)
    }
  }

  if (isSeedance) {
    entries.append('seedance_mode', seedance.mode)
    entries.append('seedance_resolution', seedance.resolution)
    entries.append('seedance_ratio', seedance.ratio)
    entries.append('seedance_generate_audio', seedance.generateAudio ? 'true' : 'false')
    entries.append('web_search', seedance.webSearch ? 'true' : 'false')
    entries.append('seedance_watermark', seedance.watermark ? 'true' : 'false')
  }

  return entries
}
