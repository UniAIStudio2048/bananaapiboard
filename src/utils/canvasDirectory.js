const TYPE_LABELS = {
  'text-input': '文本',
  text: '文本',
  image: '图片',
  'image-input': '图片',
  'image-gen': '图片',
  'text-to-image': '图片',
  'image-to-image': '图片',
  video: '视频',
  'video-input': '视频',
  'video-gen': '视频',
  'text-to-video': '视频',
  'image-to-video': '视频',
  audio: '音频',
  'audio-input': '音频',
  llm: '文本',
  storyboard: '分镜',
  'character-card': '角色',
  'seedance-character': '角色',
  'bytefor-character': '角色',
  'director-studio': '导演台',
  'preview-output': '预览'
}

const IMAGE_TYPES = new Set([
  'image', 'image-input', 'image-gen', 'imageGen', 'text-to-image',
  'image-to-image', 'image-batch', 'grid-preview'
])
const VIDEO_TYPES = new Set([
  'video', 'video-input', 'video-gen', 'videoGen', 'text-to-video',
  'image-to-video', 'video-to-video'
])
const AUDIO_TYPES = new Set(['audio', 'audio-input'])

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function getUrlExtension(url, fallback) {
  if (typeof url !== 'string' || url.startsWith('data:') || url.startsWith('blob:')) return fallback
  const match = url.split(/[?#]/, 1)[0].match(/\.([a-z0-9]{2,5})$/i)
  return match?.[1]?.toLowerCase() || fallback
}

function compareCanvasPosition(a, b) {
  return Number(a?.position?.y || 0) - Number(b?.position?.y || 0) ||
    Number(a?.position?.x || 0) - Number(b?.position?.x || 0) ||
    String(a?.id || '').localeCompare(String(b?.id || ''))
}

export function getCanvasNodeTypeLabel(node) {
  return TYPE_LABELS[node?.type] || '节点'
}

export function getCanvasNodeDisplayName(node) {
  const data = node?.data || {}
  return cleanString(data.groupName) || cleanString(data.title) || cleanString(data.label) ||
    getCanvasNodeTypeLabel(node)
}

export function getCanvasNodeMedia(node) {
  const data = node?.data || {}
  const type = node?.type || ''
  const imageUrl = data.sourceImages?.[0] || data.output?.urls?.[0] || data.images?.[0] ||
    data.imageUrl || data.generatedImage
  const videoUrl = data.output?.url || data.videoUrl || data.video
  const audioUrl = data.audioData || data.audioUrl

  if (VIDEO_TYPES.has(type) && cleanString(videoUrl)) {
    return {
      kind: 'video',
      url: videoUrl,
      previewUrl: data.thumbnailUrl || data.thumbnail_url || data.output?.thumbnailUrl || videoUrl,
      extension: getUrlExtension(videoUrl, 'mp4')
    }
  }
  if (AUDIO_TYPES.has(type) && cleanString(audioUrl)) {
    return {
      kind: 'audio',
      url: audioUrl,
      previewUrl: null,
      extension: getUrlExtension(audioUrl, 'mp3')
    }
  }
  if ((IMAGE_TYPES.has(type) || imageUrl) && cleanString(imageUrl)) {
    return {
      kind: 'image',
      url: imageUrl,
      previewUrl: data.thumbnailUrl || data.thumbnail_url || imageUrl,
      extension: getUrlExtension(imageUrl, 'png')
    }
  }
  if (cleanString(data.text)) {
    return {
      kind: 'text',
      text: data.text,
      previewUrl: null,
      extension: 'txt'
    }
  }
  return null
}

function toDirectoryRow(node) {
  const media = getCanvasNodeMedia(node)
  return {
    id: node.id,
    type: node.type,
    name: getCanvasNodeDisplayName(node),
    typeLabel: getCanvasNodeTypeLabel(node),
    groupId: node.data?.groupId || null,
    mediaUrl: media?.url || null,
    previewUrl: media?.previewUrl || null,
    mediaKind: media?.kind || null,
    downloadable: Boolean(media)
  }
}

export function buildCanvasDirectory(nodes, { search = '' } = {}) {
  const source = Array.isArray(nodes) ? nodes : []
  const groupNodes = source.filter(node => node?.type === 'group').sort(compareCanvasPosition)
  const groupIds = new Set(groupNodes.map(node => node.id))
  const normalNodes = source.filter(node => node?.id && node.type !== 'group').sort(compareCanvasPosition)
  const normalizedSearch = cleanString(search).toLocaleLowerCase()
  const matches = name => !normalizedSearch || name.toLocaleLowerCase().includes(normalizedSearch)

  const root = normalNodes
    .filter(node => !groupIds.has(node.data?.groupId))
    .map(toDirectoryRow)
    .filter(row => matches(row.name) || matches(row.typeLabel))

  const folders = groupNodes.map(groupNode => {
    const name = getCanvasNodeDisplayName(groupNode)
    const allChildren = normalNodes
      .filter(node => node.data?.groupId === groupNode.id)
      .map(toDirectoryRow)
    const folderMatches = matches(name)
    return {
      id: groupNode.id,
      name,
      children: folderMatches ? allChildren : allChildren.filter(row => matches(row.name) || matches(row.typeLabel))
    }
  }).filter(folder => !normalizedSearch || matches(folder.name) || folder.children.length > 0)

  return { root, folders, total: normalNodes.length }
}

export function isCanvasDirectoryMoveAllowed(node, targetGroupId, visibleGroupIds) {
  if (!node?.id || node.type === 'group') return false
  const target = targetGroupId || null
  if (target && !visibleGroupIds?.has(target)) return false
  return (node.data?.groupId || null) !== target
}
