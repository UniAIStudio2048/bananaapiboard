const TRANSIENT_URL_RE = /^(data:|blob:)/i

const NODE_RUNTIME_KEYS = new Set([
  'dimensions',
  'computedPosition',
  'handleBounds',
  'initialized',
  'isParent',
  'dragging',
  'resizing',
  'selected',
  'events'
])

const EDGE_RUNTIME_KEYS = new Set([
  'sourceNode',
  'targetNode',
  'sourceX',
  'sourceY',
  'targetX',
  'targetY',
  'events',
  'selected'
])

const INLINE_DATA_FIELDS = new Set([
  'imageData',
  'base64',
  'previewData',
  'originalData',
  'audioData',
  'data'
])

const URL_FIELDS = [
  'imageUrl',
  'videoUrl',
  'audioUrl',
  'sourceVideo',
  'sourceImage',
  'image',
  'video'
]

const URL_ARRAY_FIELDS = new Set(['urls'])

export function isTransientWorkflowUrl(value) {
  return typeof value === 'string' && TRANSIENT_URL_RE.test(value)
}

function sanitizeInlineValue(value, key = null, seen = new WeakSet()) {
  if (typeof value === 'string') {
    if (INLINE_DATA_FIELDS.has(key) && (value.length > 1000 || isTransientWorkflowUrl(value))) {
      return undefined
    }
    return isTransientWorkflowUrl(value) ? null : value
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return undefined
  }
  seen.add(value)

  if (Array.isArray(value)) {
    const cleanedArray = value
      .map(item => sanitizeInlineValue(item, null, seen))
      .filter(item => item !== undefined)
    seen.delete(value)
    return cleanedArray
  }

  const cleaned = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    let cleanedValue = sanitizeInlineValue(childValue, childKey, seen)
    if (URL_ARRAY_FIELDS.has(childKey) && Array.isArray(cleanedValue)) {
      cleanedValue = persistentUrlList(cleanedValue)
    }
    if (cleanedValue !== undefined) {
      cleaned[childKey] = cleanedValue
    }
  }

  seen.delete(value)
  return cleaned
}

function copyWithoutKeys(value, keys) {
  const cleaned = {}
  for (const [key, entry] of Object.entries(value || {})) {
    if (!keys.has(key)) {
      cleaned[key] = entry
    }
  }
  return cleaned
}

function removeEmptyRuntimeStyle(value) {
  if (value.style && typeof value.style === 'object' && Object.keys(value.style).length === 0) {
    delete value.style
  }
  if (value.zIndex === undefined || value.zIndex === 0) {
    delete value.zIndex
  }
  return value
}

function persistentUrlList(values) {
  if (!Array.isArray(values)) return values
  return values.filter(url => typeof url === 'string' && !isTransientWorkflowUrl(url))
}

function sanitizeReferenceImages(values) {
  if (!Array.isArray(values)) return values

  return values.filter(item => {
    if (typeof item === 'string') {
      return !isTransientWorkflowUrl(item)
    }
    if (!item || typeof item !== 'object') {
      return false
    }
    if (Object.prototype.hasOwnProperty.call(item, 'url')) {
      return typeof item.url === 'string' && !isTransientWorkflowUrl(item.url)
    }
    return true
  })
}

function sanitizeDirectorStudioProject(project) {
  if (!project || typeof project !== 'object') return null
  const cleaned = sanitizeInlineValue(project) || {}
  if (isTransientWorkflowUrl(cleaned.coverUrl)) cleaned.coverUrl = null
  if (cleaned.snapshot && typeof cleaned.snapshot === 'object') {
    if (Array.isArray(cleaned.snapshot.snapshotHistory)) {
      cleaned.snapshot.snapshotHistory = persistentUrlList(cleaned.snapshot.snapshotHistory)
    }
    if (Array.isArray(cleaned.snapshot.referenceImages)) {
      cleaned.snapshot.referenceImages = sanitizeReferenceImages(cleaned.snapshot.referenceImages)
    }
  }
  return cleaned
}

export function sanitizeWorkflowNodeForSave(node) {
  const cleanedNode = removeEmptyRuntimeStyle(copyWithoutKeys(node, NODE_RUNTIME_KEYS))
  if (!cleanedNode.data) {
    return sanitizeInlineValue(cleanedNode)
  }

  const data = sanitizeInlineValue(cleanedNode.data) || {}

  if (Array.isArray(data.sourceImages)) {
    data.sourceImages = persistentUrlList(data.sourceImages)
  }

  if (Array.isArray(data.referenceImages)) {
    data.referenceImages = sanitizeReferenceImages(data.referenceImages)
  }

  if (data.output) {
    data.output = sanitizeInlineValue(data.output) || {}
    if (Array.isArray(data.output.urls)) {
      data.output.urls = persistentUrlList(data.output.urls)
    }
  }

  for (const field of URL_FIELDS) {
    if (isTransientWorkflowUrl(data[field])) {
      data[field] = null
    }
  }

  if (Array.isArray(data.urls)) {
    data.urls = persistentUrlList(data.urls)
  }

  if (Array.isArray(data.imageOrder)) {
    data.imageOrder = data.imageOrder.filter(url => {
      if (typeof url !== 'string') return url != null
      return !isTransientWorkflowUrl(url)
    })
  }

  if (Array.isArray(data.snapshotHistory)) {
    data.snapshotHistory = persistentUrlList(data.snapshotHistory)
  }

  if (Array.isArray(data.directorStudioProjects)) {
    data.directorStudioProjects = data.directorStudioProjects
      .map(project => sanitizeDirectorStudioProject(project))
      .filter(Boolean)
  }

  delete data.isUploading
  delete data.uploadFailed
  delete data.uploadError
  delete data._dataLost
  delete data._lostReason
  delete data._partialLost

  cleanedNode.data = data
  return sanitizeInlineValue(cleanedNode)
}

export function sanitizeWorkflowEdgeForSave(edge) {
  const cleanedEdge = removeEmptyRuntimeStyle(copyWithoutKeys(edge, EDGE_RUNTIME_KEYS))
  return sanitizeInlineValue(cleanedEdge)
}

export function sanitizeWorkflowForSave(workflow = {}) {
  const cleanedNodes = (workflow.nodes || []).map(sanitizeWorkflowNodeForSave)
  const validNodeIds = new Set(cleanedNodes.map(node => node.id))

  const validEdges = (workflow.edges || [])
    .filter(edge => validNodeIds.has(edge.source) && validNodeIds.has(edge.target))
    .map(sanitizeWorkflowEdgeForSave)

  return {
    nodes: cleanedNodes,
    edges: validEdges,
    viewport: sanitizeInlineValue(workflow.viewport || { x: 0, y: 0, zoom: 1 })
  }
}
