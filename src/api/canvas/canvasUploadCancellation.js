function uploadKey(nodeId, tabId) {
  return nodeId ? `${tabId || 'active'}:${nodeId}` : null
}

export function createCanvasUploadCancellationRegistry() {
  const controllers = new Map()

  return {
    begin(nodeId, tabId) {
      const key = uploadKey(nodeId, tabId)
      const controller = new AbortController()
      if (key) {
        controllers.get(key)?.abort()
        controllers.set(key, controller)
      }
      return controller
    },
    finish(nodeId, tabId, controller) {
      const key = uploadKey(nodeId, tabId)
      if (key && controllers.get(key) === controller) controllers.delete(key)
    },
    cancel(nodeId, tabId) {
      const key = uploadKey(nodeId, tabId)
      if (!key) return false
      const controller = controllers.get(key)
      if (!controller) return false
      controllers.delete(key)
      controller.abort()
      return true
    },
    cancelAll() {
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
    }
  }
}
