const TEXT_FIELD_NAMES = [
  'prompt',
  'positivePrompt',
  'negativePrompt',
  'text',
  'content',
  'description',
  'inputText',
  'systemPrompt',
  'userPrompt',
  'script',
  'lyrics'
]

const MEDIA_FIELD_NAMES = [
  'sourceImages',
  'sourceVideo',
  'audioUrl',
  'imageUrl',
  'videoUrl',
  'thumbnail_url',
  'thumbnail',
  'url',
  'urls',
  'generatedImage',
  'generatedImages',
  'generatedVideo',
  'generatedVideos',
  'generatedAudio',
  'generatedAudios'
]

const SENSITIVE_PARAMETER_KEY = /(?:token|secret|password|authorization|cookie|api[_-]?key|access[_-]?key|private[_-]?key|signature|credential)/i

function parseJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function uniqueStrings(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))]
}

function getNodeType(node) {
  return String(node?.type || node?.data?.type || '').trim()
}

export function normalizeWorkflowSharePayload(payload = {}) {
  const sourceWorkflow = payload.workflow || {}
  const nodes = parseJson(sourceWorkflow.nodes, [])
  const edges = parseJson(sourceWorkflow.edges, [])
  const viewport = parseJson(sourceWorkflow.viewport, { x: 0, y: 0, zoom: 1 })
  const normalizedNodes = Array.isArray(nodes) ? nodes : []
  const warnings = uniqueStrings(Array.isArray(payload.warnings) ? payload.warnings : [])

  return {
    mode: payload.mode || 'view',
    sourceRevision: payload.sourceRevision,
    tenantId: payload.tenantId,
    canClone: payload.mode === 'clone' && payload.canClone !== false,
    warnings,
    workflow: {
      ...sourceWorkflow,
      nodes: normalizedNodes,
      edges: Array.isArray(edges) ? edges : [],
      viewport: viewport && typeof viewport === 'object' ? viewport : { x: 0, y: 0, zoom: 1 }
    }
  }
}

export function normalizeWorkflowShareNodes(nodes = []) {
  return nodes.map(node => ({
    ...node,
    type: 'workflow-share-node',
    draggable: false,
    selectable: false,
    connectable: false,
    data: {
      ...(node.data || {}),
      shareOriginalType: getNodeType(node)
    }
  }))
}

export function normalizeWorkflowShareEdges(edges = []) {
  return edges.map(edge => {
    const normalizedEdge = { ...edge }
    delete normalizedEdge.sourceHandle
    delete normalizedEdge.targetHandle
    return {
      ...normalizedEdge,
      selectable: false,
      updatable: false,
      focusable: false
    }
  })
}

function addMediaValue(media, value, kind = 'image') {
  if (Array.isArray(value)) {
    value.forEach(item => addMediaValue(media, item, kind))
    return
  }
  if (value && typeof value === 'object') {
    addMediaValue(media, value.url, kind)
    addMediaValue(media, value.urls, kind)
    addMediaValue(media, value.image_url, 'image')
    addMediaValue(media, value.video_url, 'video')
    addMediaValue(media, value.audio_url, 'audio')
    addMediaValue(media, value.images, 'image')
    addMediaValue(media, value.videos, 'video')
    addMediaValue(media, value.audios, 'audio')
    return
  }
  if (typeof value !== 'string' || !value.trim()) return
  if (!media.some(item => item.url === value)) media.push({ url: value, kind })
}

function sanitizeParameterValue(value, key = '') {
  if (SENSITIVE_PARAMETER_KEY.test(key)) return '[已隐藏敏感参数]'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return '[媒体仅在原工作区可用]'
    if ((/^https?:\/\//.test(trimmed) || trimmed.startsWith('/')) && !isSharePreviewMediaUrl(trimmed)) {
      return '[私有或签名媒体已隐藏]'
    }
    return value
  }
  if (Array.isArray(value)) return value.map(item => sanitizeParameterValue(item, key))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeParameterValue(entryValue, entryKey)
    ]))
  }
  return value
}

function serializeSafeParameters(data) {
  try {
    return JSON.stringify(sanitizeParameterValue(data), null, 2)
  } catch {
    return ''
  }
}

export function isSharePreviewMediaUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  const url = value.trim()
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/api/')) return false

  let parsed
  try {
    parsed = new URL(url, 'https://share-preview.invalid')
  } catch {
    return false
  }

  const signedKeys = ['signature', 'sig', 'token', 'auth', 'expires', 'exp', 'private', 'x-amz-signature', 'x-amz-credential', 'x-goog-signature']
  for (const key of parsed.searchParams.keys()) {
    if (signedKeys.some(signedKey => key.toLowerCase().includes(signedKey))) return false
  }

  return /^https?:$/.test(parsed.protocol) || url.startsWith('/')
}

export function getWorkflowShareNodePreview(node = {}) {
  const data = node.data || {}
  const textSections = []
  for (const fieldName of TEXT_FIELD_NAMES) {
    const value = data[fieldName]
    if (typeof value === 'string' && value.trim()) {
      textSections.push({ label: fieldName, value })
    }
  }

  const media = []
  for (const fieldName of MEDIA_FIELD_NAMES) {
    const kind = fieldName.toLowerCase().includes('video') ? 'video' : fieldName.toLowerCase().includes('audio') ? 'audio' : 'image'
    addMediaValue(media, data[fieldName], kind)
  }
  addMediaValue(media, data.output, 'image')
  addMediaValue(media, data.result, 'image')

  return {
    title: data.title || data.label || data.name || node.id || '未命名节点',
    type: data.shareOriginalType || node.type || 'unknown',
    textSections,
    media: media.map(item => ({ ...item, safe: isSharePreviewMediaUrl(item.url) })),
    parameterJson: serializeSafeParameters(data)
  }
}
