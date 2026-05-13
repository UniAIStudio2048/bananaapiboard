import { replacePromptEditorMentionText } from './promptMention.js'

const TYPE_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频',
  file: '文件'
}

const LABEL_TYPES = {
  图片: 'image',
  视频: 'video',
  音频: 'audio',
  文件: 'file'
}

const MENTION_RE = /【?@(图片|视频|音频|文件)(\d+)】?/g

function normalizeType(type) {
  return TYPE_LABELS[type] ? type : 'file'
}

export function ensureAssistantAttachmentKey(attachment = {}, fallbackId = '') {
  if (attachment.key) return attachment

  const type = normalizeType(attachment.type)
  if (attachment.url) {
    return { ...attachment, type, key: `url:${type}:${attachment.url}` }
  }

  const id = fallbackId || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { ...attachment, type, key: `local:${id}` }
}

export function buildAssistantMentionItems(attachments = []) {
  const counters = { image: 0, video: 0, audio: 0, file: 0 }

  return attachments
    .map((attachment, orderIndex) => {
      const type = normalizeType(attachment.type)
      counters[type] += 1
      const label = `${TYPE_LABELS[type]}${counters[type]}`

      return {
        ...attachment,
        type,
        orderIndex,
        index: counters[type],
        label,
        key: attachment.key
      }
    })
    .filter(item => item.key)
}

export function bindAssistantAttachmentMention({ text = '', start = 0, queryLength = 0, item, bindings = {} } = {}) {
  if (!item?.key || !item?.label) {
    return { text, bindings: bindings || {}, cursor: start }
  }

  const mention = `@${item.label}`
  const result = replacePromptEditorMentionText({
    text,
    mentionStart: start,
    caret: start + queryLength + 1,
    replacement: mention
  })

  return {
    text: result.text,
    cursor: result.cursor,
    bindings: {
      ...(bindings || {}),
      [item.key]: {
        type: item.type,
        label: item.label
      }
    }
  }
}

function findBoundItem({ bindings, label, type, itemByKey, itemByTypeIndex, index }) {
  const boundEntry = Object.entries(bindings || {}).find(([, value]) => {
    return value?.type === type && value?.label === label
  })

  if (boundEntry) return itemByKey.get(boundEntry[0])
  return itemByTypeIndex.get(`${type}:${index}`)
}

export function syncAssistantAttachmentMentions(text = '', bindings = {}, attachments = []) {
  const items = buildAssistantMentionItems(attachments)
  const itemByKey = new Map(items.map(item => [item.key, item]))
  const itemByTypeIndex = new Map(items.map(item => [`${item.type}:${item.index}`, item]))
  const nextBindings = {}

  const nextText = String(text || '').replace(MENTION_RE, (raw, zhType, rawIndex) => {
    const type = LABEL_TYPES[zhType]
    const index = Number(rawIndex)
    const oldLabel = `${zhType}${rawIndex}`
    const item = findBoundItem({ bindings, label: oldLabel, type, itemByKey, itemByTypeIndex, index })

    if (!item) return ''

    nextBindings[item.key] = {
      type: item.type,
      label: item.label
    }
    return `@${item.label}`
  })

  return { text: nextText, bindings: nextBindings }
}

export function resolveAssistantAttachmentsForSend({ text = '', bindings = {}, attachments = [] } = {}) {
  const items = buildAssistantMentionItems(attachments)
  if (items.length === 0) return []

  const mentionedKeys = []
  String(text || '').replace(MENTION_RE, (raw, zhType, rawIndex) => {
    const type = LABEL_TYPES[zhType]
    const index = Number(rawIndex)
    const label = `${zhType}${rawIndex}`
    const itemByKey = new Map(items.map(item => [item.key, item]))
    const itemByTypeIndex = new Map(items.map(item => [`${item.type}:${item.index}`, item]))
    const item = findBoundItem({ bindings, label, type, itemByKey, itemByTypeIndex, index })

    if (item) mentionedKeys.push(item.key)
    return raw
  })

  if (mentionedKeys.length === 0) return attachments

  const attachmentByKey = new Map(attachments.map(item => [item.key, item]))
  return [...new Set(mentionedKeys)]
    .map(key => attachmentByKey.get(key))
    .filter(Boolean)
}
