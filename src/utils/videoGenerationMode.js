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

export const WAN_MODES = [
  { value: 't2v', label: '文生视频', desc: '纯文本生成视频', needsImage: false, needsVideo: false },
  { value: 'i2v', label: '图生视频', desc: '首帧图(+可选驱动音频)', needsImage: true, needsVideo: false, needsAudio: true, maxImages: 1 },
  { value: 'r2v', label: '多参考', desc: '图片/视频参考(≤5)，可带音色', needsImage: true, needsVideo: true, needsAudio: true, maxImages: 5 },
  { value: 'videoedit', label: '视频编辑', desc: '需连接上游视频节点', needsImage: false, needsVideo: true },
  { value: 'animate_mix', label: '换人混合', desc: '1张人物图 + 1段参考视频', needsImage: true, needsVideo: true, maxImages: 1, maxVideos: 1 }
]

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
  return apiType === 'seedance-2.0' || apiType === 'ant' || apiType === 'happyhorse' || apiType === 'ctyun-seedance'
}

export function isWanVideoModel(modelConfig) {
  return modelConfig?.apiType === 'wan'
}

export function getWanDurationOptions({ modelDurations = [], mode = 't2v', hasVideoReference = false } = {}) {
  if (mode === 'videoedit' || mode === 'animate_mix') return []
  const maxDuration = mode === 'r2v' && hasVideoReference ? 10 : 15
  const sourceDurations = Array.isArray(modelDurations) && modelDurations.length > 0
    ? modelDurations
    : Array.from({ length: 14 }, (_, index) => index + 2)
  return sourceDurations
    .map(duration => Number(duration))
    .filter(duration => Number.isFinite(duration) && duration >= 2 && duration <= maxDuration)
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
  if (!apiType || apiType === 'openai') return modelValue
  if (apiType === 'bytefor') return modelValue
  if (isSeedanceSd2VideoModel(modelConfig)) return modelValue
  if (apiType === 'seedance-openapi-pro' || apiType === 'seedance-openai') {
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
