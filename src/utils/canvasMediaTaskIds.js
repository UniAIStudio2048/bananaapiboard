const MEDIA_TASK_NODE_TYPES = new Set([
  'image',
  'image-input',
  'image-gen',
  'text-to-image',
  'image-to-image',
  'image-repaint',
  'image-erase',
  'image-upscale',
  'image-cutout',
  'image-expand',
  'video',
  'video-input',
  'video-gen',
  'text-to-video',
  'image-to-video',
  'audio-to-video',
  'video-last-frame',
  'audio',
  'audio-input',
  'text-to-audio',
  'tts',
  'audio-to-text',
  'audio-lip-sync'
])

function normalizeTaskId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim()
}

function getOwnTaskIds(node) {
  const data = node?.data || {}
  const values = [data.taskIds, data.taskId, data.task_id, data.soraTaskId, data._failedTaskId]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .map(normalizeTaskId)
    .filter(Boolean)

  return [...new Set(values)]
}

export function getCanvasMediaTaskIds(node, nodes = [], visited = new Set()) {
  if (!node || !MEDIA_TASK_NODE_TYPES.has(node.type) || visited.has(node.id)) return []

  visited.add(node.id)
  const ownIds = getOwnTaskIds(node)
  if (ownIds.length > 0) return ownIds

  const parent = nodes.find(candidate =>
    Array.isArray(candidate?.data?.groupNodeIds) && candidate.data.groupNodeIds.includes(node.id)
  )

  return parent ? getCanvasMediaTaskIds(parent, nodes, visited) : []
}
