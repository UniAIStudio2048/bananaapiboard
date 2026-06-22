const REMEMBERABLE_NODE_DATA_KEYS = {
  'image-input': [
    'model',
    'aspectRatio',
    'resolution',
    'imageSize',
    'count',
    'botType',
    'cameraControlEnabled',
    'cameraSettings',
    'cameraPrompt'
  ],
  video: [
    'model',
    'aspectRatio',
    'duration',
    'count',
    'generationMode',
    'viduMode',
    'viduOffPeak',
    'viduResolution',
    'veoMode',
    'veoResolution',
    'klingCameraEnabled',
    'klingCameraType',
    'klingCameraConfig',
    'klingCameraValue',
    'klingVoiceList',
    'klingSoundEnabled',
    'klingMotionVideoUrl',
    'klingMotionMode',
    'seedanceSoundEnabled',
    'seedance2Mode',
    'klingO1Mode',
    'omniKeepSound',
    'klingV3OmniMode',
    'v3OmniKeepSound',
    'wanMode'
  ],
  'text-input': [
    'model',
    'language',
    'preset'
  ],
  'audio-input': [
    'model',
    'musicModel',
    'customMode',
    'makeInstrumental',
    'voice',
    'duration'
  ]
}

function getMemoryType(type) {
  if (type === 'image-input') return 'image-input'
  if (type === 'video' || type === 'video-input') return 'video'
  if (type === 'text-input') return 'text-input'
  if (type === 'audio-input') return 'audio-input'
  return null
}

export function getRememberableNodeParameters(node) {
  const memoryType = getMemoryType(node?.type)
  const keys = REMEMBERABLE_NODE_DATA_KEYS[memoryType]
  if (!keys) return {}

  const data = node?.data || {}
  const remembered = {}
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      remembered[key] = data[key]
    }
  }
  return remembered
}

export function findRememberedNodeParameters(type, nodes = []) {
  const memoryType = getMemoryType(type)
  if (!memoryType) return {}

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const candidate = nodes[index]
    if (getMemoryType(candidate?.type) !== memoryType) continue

    const remembered = getRememberableNodeParameters(candidate)
    if (Object.keys(remembered).length > 0) {
      return remembered
    }
  }

  return {}
}

export function buildNodeDataWithRememberedParameters({ type, baseData = {}, nodes = [] } = {}) {
  return {
    ...findRememberedNodeParameters(type, nodes),
    ...baseData
  }
}
