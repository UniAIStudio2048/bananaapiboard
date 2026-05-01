const TRANSIENT_STATUSES = new Set(['processing', 'pending', 'running', 'submitting'])

function hasUsableMediaOutput(data) {
  const output = data?.output
  if (!output) return false
  if (Array.isArray(output.urls) && output.urls.some(Boolean)) return true
  return !!(output.url || output.videoUrl || output.audioUrl)
}

function getCompletedStatusForNode(node, data) {
  if (node.type === 'video' || data?.output?.type === 'video') return 'completed'
  return 'success'
}

export function sanitizeNodeForHistoryRestore(node) {
  if (!node?.data) return node

  const data = {
    ...node.data,
    executeTriggered: false,
    triggeredByGroup: false,
    progress: null,
    taskId: null,
    taskIds: null,
    soraTaskId: null,
    multiangleTaskId: null,
    _failedTaskId: null
  }

  if (TRANSIENT_STATUSES.has(String(data.status || '').toLowerCase())) {
    data.status = hasUsableMediaOutput(data)
      ? getCompletedStatusForNode(node, data)
      : 'idle'
  }

  return {
    ...node,
    data
  }
}

export function sanitizeNodesForHistoryRestore(nodes) {
  if (!Array.isArray(nodes)) return []
  return nodes.map(sanitizeNodeForHistoryRestore)
}
