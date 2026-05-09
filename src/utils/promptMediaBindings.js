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

const MENTION_RE = /【?@(视频|图片|音频)(\d*)】?/g

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
      label: media.label
    }
  }
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
    const oldLabel = `${zhType}${rawIndex || '1'}`
    const boundEntry = Object.entries(bindings || {}).find(([, value]) => {
      return value?.type === type && value?.label === oldLabel
    })
    const media = boundEntry
      ? mediaByKey.get(boundEntry[0])
      : mediaByTypeIndex.get(`${type}:${Number(rawIndex || 1)}`)

    if (!media) return ''

    const key = media.key || getMediaMentionKey(media)
    nextBindings[key] = {
      type: media.type,
      label: media.label
    }
    return `@${media.label}`
  })

  return { text: nextText, bindings: nextBindings }
}

export function escapePromptMediaMentions(text) {
  if (!text) return text
  let result = text.replace(/【?@视频(\d*)】?/g, (_, num) => {
    return `<<<video_${num ? parseInt(num) : 1}>>>`
  })
  result = result.replace(/【?@图片(\d*)】?/g, (_, num) => {
    return `<<<image_${num ? parseInt(num) : 1}>>>`
  })
  result = result.replace(/【?@音频(\d*)】?/g, (_, num) => {
    return `<<<audio_${num ? parseInt(num) : 1}>>>`
  })
  return result
}
