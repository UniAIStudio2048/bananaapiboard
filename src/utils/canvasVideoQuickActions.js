export const VIDEO_QUICK_ACTION_TYPES = {
  LAST_FRAME: 'video-last-frame',
  DESCRIBE: 'llm-video-describe',
  EDIT: 'video-edit',
  EXTEND: 'video-extend'
}

export function getVideoQuickActionSourceUrl(sourceNode) {
  const data = sourceNode?.data || {}
  return data.output?.url ||
    (Array.isArray(data.output?.urls) ? data.output.urls.find(Boolean) : '') ||
    data.videoUrl ||
    data.sourceVideo ||
    ''
}

function modelSupportsSeedanceMode(model, mode) {
  const supportedModes = model?.seedanceConfig?.supportedModes || model?.happyHorseConfig?.supportedModes
  if (!supportedModes) return true
  return supportedModes[mode] !== false
}

function isSeedance2CapableModel(model) {
  const apiType = model?.apiType || ''
  const name = `${model?.value || ''} ${model?.label || ''}`.toLowerCase()
  return apiType === 'seedance-2.0' ||
    apiType === 'seedance-openapi-pro' ||
    apiType === 'ant' ||
    apiType === 'happyhorse' ||
    (name.includes('seedance') && name.includes('2.0'))
}

export function selectVideoQuickActionModel(models = [], actionType) {
  const seedanceMode = actionType === 'video-edit'
    ? 'video_edit'
    : actionType === 'video-extend'
      ? 'video_extend'
      : ''

  if (!seedanceMode) return models[0] || null

  const seedance2 = models.find(model => (
    isSeedance2CapableModel(model) &&
    modelSupportsSeedanceMode(model, seedanceMode)
  ))
  if (seedance2) return seedance2

  const klingO1 = models.find(model => model.isKlingO1Model)
  return klingO1 || models[0] || null
}

function buildVideoEditNode(sourceVideoUrl, model) {
  const nodeData = {
    title: '视频编辑',
    label: '视频编辑',
    nodeRole: 'edit',
    editMode: true,
    sourceVideoUrl,
    seedance2Mode: 'video_edit'
  }

  if (model?.value) {
    nodeData.model = model.value
  }

  if (model?.isKlingO1Model) {
    nodeData.klingO1Mode = 'video_edit'
  }

  return nodeData
}

function buildVideoExtendNode(sourceVideoUrl, model) {
  const nodeData = {
    title: '视频延长',
    label: '视频延长',
    nodeRole: 'extend',
    extendMode: true,
    sourceVideoUrl,
    seedance2Mode: 'video_extend'
  }

  if (model?.value) {
    nodeData.model = model.value
  }

  if (model?.isKlingO1Model) {
    const hasExtend = model.klingO1Modes?.some(mode => mode.value === 'video_extend')
    nodeData.klingO1Mode = hasExtend ? 'video_extend' : 'video_edit'
  }

  return nodeData
}

export function buildVideoQuickActionNode(actionType, sourceNode, options = {}) {
  const sourceVideoUrl = getVideoQuickActionSourceUrl(sourceNode)
  const selectedModel = selectVideoQuickActionModel(options.models || [], actionType)

  if (actionType === 'video-last-frame') {
    return {
      nodeType: 'image-input',
      nodeData: {
        title: '尾帧图片',
        nodeRole: 'source',
        extractedFromVideo: true,
        videoUrl: sourceVideoUrl,
        needsFrameExtraction: false,
        status: 'processing',
        progress: '截取中'
      },
      shouldExtractLastFrame: Boolean(sourceVideoUrl)
    }
  }

  if (actionType === 'llm-video-describe') {
    return {
      nodeType: 'text-input',
      nodeData: {
        title: '视频反推',
        selectedPreset: 'video-describe',
        inheritedData: sourceVideoUrl ? { type: 'video', url: sourceVideoUrl } : undefined
      }
    }
  }

  if (actionType === 'video-edit') {
    return {
      nodeType: 'video',
      nodeData: buildVideoEditNode(sourceVideoUrl, selectedModel)
    }
  }

  if (actionType === 'video-extend') {
    return {
      nodeType: 'video',
      nodeData: buildVideoExtendNode(sourceVideoUrl, selectedModel)
    }
  }

  return {
    nodeType: actionType,
    nodeData: {}
  }
}
