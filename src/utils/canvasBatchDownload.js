import { getCanvasNodeMedia } from './canvasDirectory.js'

export function getSelectedMediaNodeIds(nodes, selectedNodeIds, selectedNodeId) {
  const ids = selectedNodeIds?.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : []
  const nodesById = new Map(nodes.map(node => [node.id, node]))
  return [...new Set(ids)].filter(id => {
    const kind = getCanvasNodeMedia(nodesById.get(id))?.kind
    return kind === 'image' || kind === 'video' || kind === 'audio'
  })
}
