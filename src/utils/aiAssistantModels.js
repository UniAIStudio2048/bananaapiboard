import { getCanvasThumbnailUrl } from './canvasThumbnail.js'
import { parseModelIcon } from './modelIcon.js'

export function getAssistantModelIcon(model) {
  const icon = model?.icon || ''
  const parsedIcon = parseModelIcon(icon)
  if (parsedIcon.type !== 'image') return icon
  return getCanvasThumbnailUrl(parsedIcon.src, 64)
}
