function replaceArray(values, from, to) {
  if (!Array.isArray(values) || !values.includes(from)) return null
  return values.map(value => value === from ? to : value)
}

function replaceNested(value, from, to) {
  if (value === from) return { value: to, changed: true }
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map(item => {
      const replaced = replaceNested(item, from, to)
      changed ||= replaced.changed
      return replaced.value
    })
    return { value: changed ? next : value, changed }
  }
  if (value && typeof value === 'object') {
    let changed = false
    const next = {}
    for (const [key, item] of Object.entries(value)) {
      const replaced = replaceNested(item, from, to)
      changed ||= replaced.changed
      next[key] = replaced.value
    }
    return { value: changed ? next : value, changed }
  }
  return { value, changed: false }
}

function replaceOutput(output, from, to) {
  if (!output || typeof output !== 'object') return null
  let changed = false
  const next = { ...output }
  if (next.url === from) {
    next.url = to
    changed = true
  }
  const urls = replaceArray(next.urls, from, to)
  if (urls) {
    next.urls = urls
    changed = true
  }
  return changed ? next : null
}

function sourceMediaPatch(data, mediaType, from, to) {
  const patch = {}
  let changed = false
  const arrayFields = mediaType === 'image'
    ? ['sourceImages', 'images', 'referenceImages']
    : mediaType === 'video'
      ? ['sourceVideos', 'referenceVideos']
      : ['audioUrls', 'referenceAudios']
  const scalarFields = mediaType === 'image'
    ? ['sourceImage', 'imageUrl']
    : mediaType === 'video'
      ? ['sourceVideo', 'videoUrl']
      : ['audioUrl', 'audioData']

  for (const field of arrayFields) {
    const next = replaceArray(data?.[field], from, to)
    if (next) {
      patch[field] = next
      changed = true
    }
  }
  for (const field of scalarFields) {
    if (data?.[field] === from) {
      patch[field] = to
      changed = true
    }
  }
  const output = replaceOutput(data?.output, from, to)
  if (output) {
    patch.output = output
    changed = true
  }
  return changed ? patch : null
}

function downstreamMediaPatch(node, mediaType, from, to) {
  const data = node?.data || {}
  const patch = {}
  let changed = false
  const orderField = `${mediaType}Order`
  const nextOrder = replaceArray(data[orderField], from, to)
  if (nextOrder) {
    patch[orderField] = nextOrder
    changed = true
  }

  const referenceField = mediaType === 'image'
    ? 'referenceImages'
    : mediaType === 'video'
      ? 'referenceVideos'
      : 'referenceAudios'
  const nextReferences = replaceArray(data[referenceField], from, to)
  if (nextReferences) {
    patch[referenceField] = nextReferences
    changed = true
  }

  const inherited = replaceNested(data.inheritedData, from, to)
  if (inherited.changed) {
    patch.inheritedData = inherited.value
    changed = true
  }

  if (node.type === 'storyboard') {
    const images = replaceArray(data.images, from, to)
    if (images) {
      patch.images = images
      changed = true
    }
  }

  return changed ? patch : null
}

export function buildMediaUploadCommit({ nodes, edges, nodeId, blobUrl, uploaded, mediaType }) {
  const sourceNode = nodes.find(node => node.id === nodeId)
  if (!sourceNode || !blobUrl || !uploaded?.url || uploaded.status !== 'completed') {
    return { sourcePatch: null, downstreamPatches: [] }
  }
  if (
    sourceNode.data?.uploadId && uploaded.uploadId &&
    sourceNode.data.uploadId !== uploaded.uploadId
  ) {
    return { sourcePatch: null, downstreamPatches: [] }
  }

  const mediaPatch = sourceMediaPatch(sourceNode.data, mediaType, blobUrl, uploaded.url)
  if (!mediaPatch) return { sourcePatch: null, downstreamPatches: [] }

  const sourcePatch = {
    ...mediaPatch,
    isUploading: false,
    uploadFailed: false,
    uploadError: null,
    uploadStatus: 'completed',
    uploadId: uploaded.uploadId,
    assetId: uploaded.assetId
  }
  const downstreamPatches = []
  const targetIds = new Set(
    edges.filter(edge => edge.source === nodeId).map(edge => edge.target)
  )
  for (const targetId of targetIds) {
    const targetNode = nodes.find(node => node.id === targetId)
    const patch = downstreamMediaPatch(targetNode, mediaType, blobUrl, uploaded.url)
    if (patch) downstreamPatches.push({ nodeId: targetId, patch })
  }

  return { sourcePatch, downstreamPatches }
}
