function containsTransientUrl(value) {
  if (typeof value === 'string') return value.startsWith('blob:') || value.startsWith('data:')
  if (Array.isArray(value)) return value.some(containsTransientUrl)
  if (value && typeof value === 'object') return Object.values(value).some(containsTransientUrl)
  return false
}

function canonicalMediaValues(data = {}) {
  return [
    data.sourceImage,
    data.imageUrl,
    data.sourceImages,
    data.images,
    data.referenceImages,
    data.sourceVideo,
    data.videoUrl,
    data.sourceVideos,
    data.referenceVideos,
    data.audioUrl,
    data.audioData,
    data.audioUrls,
    data.referenceAudios,
    data.output,
    data.inheritedData,
    data.imageOrder,
    data.videoOrder,
    data.audioOrder
  ]
}

function reachableNodeIds(nodes, edges, targetNodeId) {
  if (!targetNodeId) return new Set(nodes.map(node => node.id))
  const result = new Set([targetNodeId])
  const queue = [targetNodeId]
  while (queue.length > 0) {
    const target = queue.shift()
    for (const edge of edges) {
      if (edge.target !== target || result.has(edge.source)) continue
      result.add(edge.source)
      queue.push(edge.source)
    }
  }
  return result
}

export function findBlockingCanvasUploads(nodes = [], edges = [], targetNodeId = null) {
  const reachable = reachableNodeIds(nodes, edges, targetNodeId)
  const blockers = []
  for (const node of nodes) {
    if (!reachable.has(node.id)) continue
    const data = node.data || {}
    let reason = null
    if (canonicalMediaValues(data).some(containsTransientUrl)) {
      reason = 'transient_media'
    } else if (data.isUploading === true || (data.uploadId && data.uploadStatus !== 'completed')) {
      reason = 'upload_pending'
    }
    if (reason) blockers.push({ nodeId: node.id, reason })
  }
  return blockers
}
