const lastDraftValues = new WeakMap()

function getStoreCache(store) {
  let cache = lastDraftValues.get(store)
  if (!cache) {
    cache = new Map()
    lastDraftValues.set(store, cache)
  }
  return cache
}

export function persistNodePromptDraft(store, nodeId, field, value) {
  if (!store || !nodeId || !field) return false

  const cache = getStoreCache(store)
  const key = `${nodeId}:${field}`
  const normalizedValue = value ?? ''

  if (cache.get(key) === normalizedValue) {
    return false
  }

  cache.set(key, normalizedValue)
  store.updateNodeData(nodeId, { [field]: normalizedValue })
  store.markCurrentTabChanged?.()
  return true
}
