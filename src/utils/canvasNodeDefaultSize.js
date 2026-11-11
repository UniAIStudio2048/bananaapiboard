// 新建的文本、图片、视频、音频节点统一为 4:3 的默认尺寸
export const DEFAULT_MEDIA_NODE_SIZE = { width: 400, height: 300 }

const MEDIA_NODE_TYPES = new Set([
  'text-input', 'text',
  'image-input', 'image',
  'video-input', 'video',
  'audio-input', 'audio'
])

const isPositiveNumber = value => Number.isFinite(Number(value)) && Number(value) > 0

/**
 * 为新建节点补齐默认宽高；已传入的尺寸保持不变，只传一边时按 4:3 补另一边。
 * 非文本/图片/视频/音频节点原样返回。
 */
export function withDefaultNodeSize(type, data) {
  if (!MEDIA_NODE_TYPES.has(type)) return data
  const source = data || {}
  const hasWidth = isPositiveNumber(source.width)
  const hasHeight = isPositiveNumber(source.height)
  if (hasWidth && hasHeight) return source

  const { width: defaultWidth, height: defaultHeight } = DEFAULT_MEDIA_NODE_SIZE
  if (hasWidth) return { ...source, height: Math.round(Number(source.width) * defaultHeight / defaultWidth) }
  if (hasHeight) return { ...source, width: Math.round(Number(source.height) * defaultWidth / defaultHeight) }
  return { ...source, width: defaultWidth, height: defaultHeight }
}
