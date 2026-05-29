function cloneValue(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch (error) {
      // Fall back to JSON cloning for non-cloneable values.
    }
  }
  return JSON.parse(JSON.stringify(value))
}

export function mergePlainNodeData(currentData = {}, patchData = {}) {
  const merged = { ...cloneValue(currentData) }
  for (const [key, value] of Object.entries(patchData || {})) {
    merged[key] = cloneValue(value)
  }
  return merged
}

export function applyNodeDataPatchToTabs(tabs, activeTabId, nodeId, patchData, options = {}) {
  if (!Array.isArray(tabs) || !nodeId) return null

  const excludeActive = options.excludeActive !== false

  for (const tab of tabs) {
    if (!tab || (excludeActive && tab.id === activeTabId)) continue
    const node = Array.isArray(tab.nodes)
      ? tab.nodes.find(item => item?.id === nodeId)
      : null
    if (!node) continue

    const nextData = mergePlainNodeData(node.data, patchData)
    if (patchData && Object.prototype.hasOwnProperty.call(patchData, 'output')) {
      nextData._mediaLoading = false
      nextData._originalMedia = null
    }
    node.data = nextData
    tab.hasChanges = true
    return { tabId: tab.id, nodeId }
  }

  return null
}
