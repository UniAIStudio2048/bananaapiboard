const videoTypes = new Set(['video', 'video-input', 'video-gen', 'text-to-video', 'image-to-video'])
export function getBreakdownSource(nodeId, nodes, edges) {
  const incoming = edges.filter(edge => edge.target === nodeId)
  if (incoming.length !== 1) return null
  const source = nodes.find(node => node.id === incoming[0].source)
  return source && videoTypes.has(source.type) ? source : null
}
export function mergeBreakdownResult(store, result) {
  // These records are already committed by the server. Interactive addNode/addEdge
  // would consume a pending selector connection and enqueue redundant writes.
  for (const node of result.nodes || []) if (!store.nodes.some(existing => existing.id === node.id)) {
    store.nodes.push(node)
    store.applyIncrementalNode(node)
  }
  for (const edge of result.edges || []) if (!store.edges.some(existing => existing.id === edge.id)) store.edges.push(edge)
  if (result.node) store.applyIncrementalNode(result.node)
}
export function formatBreakdownTime(seconds) {
  const value = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${(value % 60).toFixed(2).padStart(5, '0')}`
}
