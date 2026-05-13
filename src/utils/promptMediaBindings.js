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
      label: normalizeMediaMentionLabel(media.label)
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

export function syncPromptMediaMentions(text, bindings = {}, mediaItems = []) {
  if (!text) {
    return { text: text || '', bindings: {} }
  }

  const mediaByKey = new Map(mediaItems.map(item => [item.key || getMediaMentionKey(item), item]))
  const mediaByTypeIndex = new Map(mediaItems.map(item => [`${item.type}:${item.index}`, item]))
  const nextBindings = {}

  const nextText = text.replace(MENTION_RE, (raw, zhType, rawIndex) => {
    const type = LABEL_TYPE_MAP[zhType]
    const oldLabel = `${zhType}${rawIndex}`
    const boundEntry = Object.entries(bindings || {}).find(([, value]) => {
      return value?.type === type && normalizeMediaMentionLabel(value?.label) === oldLabel
    })
    const media = boundEntry
      ? mediaByKey.get(boundEntry[0])
      : mediaByTypeIndex.get(`${type}:${Number(rawIndex || 1)}`)

    if (!media) return ''

    const key = media.key || getMediaMentionKey(media)
    nextBindings[key] = {
      type: media.type,
      label: normalizeMediaMentionLabel(media.label)
    }
    return `@${normalizeMediaMentionLabel(media.label)}`
  })

  return { text: nextText, bindings: nextBindings }
}

export function escapePromptMediaMentions(text) {
  if (!text) return text
  return text.replace(MENTION_RE, (match, type, num) => {
    const label = `@${type}${num}`
    return ` ${label} `
  }).replace(/ {2,}/g, ' ').trim()
}
