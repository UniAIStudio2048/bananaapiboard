import { getCanvasNodeMedia } from './canvasDirectory.js'

const MEDIA_TYPES = new Set(['image', 'video', 'audio'])

export function isCanvasReferenceSource(node) {
  return MEDIA_TYPES.has(getCanvasNodeMedia(node)?.kind)
}

export function findCanvasReferenceAssetNode(nodes, asset) {
  if (!MEDIA_TYPES.has(asset?.type) || !asset?.url) return null
  const candidates = nodes.filter(node => getCanvasNodeMedia(node)?.kind === asset.type)
  const assetId = asset.id == null ? '' : String(asset.id)
  return candidates.find(node => assetId && String(node.data?.assetId ?? '') === assetId) ||
    candidates.find(node => getCanvasNodeMedia(node)?.url === asset.url) || null
}
