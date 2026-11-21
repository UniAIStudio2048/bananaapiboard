const MEDIA_TYPE_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频'
}

const LABEL_TYPE_MAP = {
  图片: 'image',
  视频: 'video',
  音频: 'audio'
}

const MENTION_RE = /【?@(视频|图片|音频)(\d+)】?/g

export function normalizeMediaMentionLabel(label) {
  return String(label || '')
    .replace(/^[【\u3010]?@/, '')
    .replace(/[】\u3011]$/, '')
}

export function getMediaMentionKey(item = {}) {
  const url = String(item.url || '')
  return `${item.type || ''}:${url}`
}

export function buildMediaMentionItems(groups = {}) {
  const items = []
  for (const type of ['video', 'image', 'audio']) {
    const urls = groups[`${type}s`] || []
    const labelPrefix = MEDIA_TYPE_LABELS[type]
    urls.forEach((url, index) => {
      items.push({
        type,
        index: index + 1,
        url,
        label: `${labelPrefix}${index + 1}`,
        key: getMediaMentionKey({ type, url })
      })
    })
  }
  return items
}

export function bindMediaMention(bindings = {}, media) {
  if (!media?.type || !media?.url || !media?.label) return bindings || {}
  const key = media.key || getMediaMentionKey(media)
  return {
    ...(bindings || {}),
    [key]: {
      type: media.type,
      label: normalizeMediaMentionLabel(media.label),
      ...(key.includes(':node:') ? { url: media.url } : {})
    }
  }
}

export function resolveMediaMentionItem(media, mediaItems = []) {
  if (!media) return null
  if (media.url && media.key) return media

  const items = Array.isArray(mediaItems) ? mediaItems : []
  const byKey = media.key ? items.find(item => item.key === media.key) : null
  if (byKey) return byKey

  const type = media.type
  const index = Number(media.index)
  if (type && Number.isFinite(index)) {
    const byTypeIndex = items.find(item => item.type === type && item.index === index)
    if (byTypeIndex) return byTypeIndex
  }

  const label = normalizeMediaMentionLabel(media.label)
  if (type && label) {
    const byLabel = items.find(item => item.type === type && normalizeMediaMentionLabel(item.label) === label)
    if (byLabel) return byLabel
  }

  return media.url ? media : null
}

export function isPromptMediaReady(nodeId, nodes = [], edges = []) {
  const requiredIds = new Set([nodeId, ...edges.filter(edge => edge.target === nodeId).map(edge => edge.source)])
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  return [...requiredIds].every(id => {
    const data = nodeById.get(id)?.data
    return data && !data._shellLoading && !data._mediaLoading && !data.isUploading
  })
}

function findBoundMedia(key, binding, mediaItems) {
  const nodeKey = key.match(/^(image|video|audio):node:(.+):\d+$/)
  if (nodeKey) {
    const prefix = `${nodeKey[1]}:node:${nodeKey[2]}:`
    const candidates = mediaItems.filter(item => item.key?.startsWith(prefix))
    const sameUrl = binding.url && candidates.find(item => item.url === binding.url)
    if (sameUrl) return sameUrl
    if (candidates.length === 1) return candidates[0]
    // 旧绑定尚未保存 URL；首次完整加载时迁移，之后按 URL 区分同节点的多张图。
    if (binding.url) return undefined
  }
  return mediaItems.find(item => (item.key || getMediaMentionKey(item)) === key || getMediaMentionKey(item) === key)
}

export function syncPromptMediaMentions(text, bindings = {}, mediaItems = [], { mediaReady = true, previousMediaItems } = {}) {
  if (!mediaReady) return { text, bindings }
  if (!text) {
    return { text: text || '', bindings: {} }
  }

  const mediaByTypeIndex = new Map(mediaItems.map(item => [`${item.type}:${item.index}`, item]))
  const nextBindings = {}
  const originalLabels = new Map()
  let unresolved = false

  const nextText = text.replace(MENTION_RE, (raw, zhType, rawIndex) => {
    const type = LABEL_TYPE_MAP[zhType]
    const oldLabel = `${zhType}${rawIndex}`
    const boundEntry = Object.entries(bindings || {}).find(([, value]) => {
      return value?.type === type && normalizeMediaMentionLabel(value?.label) === oldLabel
    })
    // 只有明确移除素材的入口才提供操作前列表，不能把加载中的空列表当作删除。
    const previous = previousMediaItems && (boundEntry
      ? findBoundMedia(boundEntry[0], boundEntry[1], previousMediaItems)
      : previousMediaItems.find(item => item.type === type && item.index === Number(rawIndex)))
    if (previous && !mediaItems.some(item => item.type === previous.type && item.url === previous.url)) return ''

    const media = previous
      ? findBoundMedia(previous.key || getMediaMentionKey(previous), previous, mediaItems)
      : boundEntry
        ? findBoundMedia(boundEntry[0], boundEntry[1], mediaItems)
        : mediaByTypeIndex.get(`${type}:${Number(rawIndex || 1)}`)

    if (!media) {
      unresolved = true
      return raw
    }

    const key = media.key || getMediaMentionKey(media)
    if (originalLabels.has(key) && originalLabels.get(key) !== oldLabel) {
      unresolved = true
      return raw
    }
    originalLabels.set(key, oldLabel)
    nextBindings[key] = bindMediaMention({}, media)[key]
    return `@${normalizeMediaMentionLabel(media.label)}`
  })

  // 整体提交编号变化，避免部分图片恢复时把两个不同角色合并到同一编号。
  return unresolved ? { text, bindings } : { text: nextText, bindings: nextBindings }
}

export function escapePromptMediaMentions(text) {
  if (!text) return text
  return text.replace(MENTION_RE, (match, type, num) => {
    const label = `@${type}${num}`
    return ` ${label} `
  }).replace(/ {2,}/g, ' ').trim()
}

export function findMissingVideoMention(prompt, videoCount) {
  const mentions = /<<<video_(\d+)>>>|@视频(\d+)|视频([0-9]{1,2})(?![\da-z])|\bVideo\s+(\d+)\b/gi
  for (const match of String(prompt || '').matchAll(mentions)) {
    const index = Number(match[1] ?? match[2] ?? match[3] ?? match[4])
    if (index < 1 || index > videoCount) return index
  }
  return null
}
