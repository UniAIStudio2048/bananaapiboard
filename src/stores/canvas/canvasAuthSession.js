import { getGlobalNodeDataCache } from './nodeDataCache.js'

// 绑定在应用外壳上：离开画布后切换账号，也必须清理仍存活的 Pinia Store。
export function bindCanvasAuthSession(canvasStore, events = window) {
  let sessionToken = localStorage.getItem('token')
  const resetOnSessionChange = () => {
    const nextToken = localStorage.getItem('token')
    if (nextToken === sessionToken) return
    sessionToken = nextToken
    canvasStore.closeAllTabs()
    canvasStore.clipboard = null
    canvasStore.nodeGroups = []
    canvasStore.editingNodeId = null
    canvasStore.editTool = null
    canvasStore.editModeViewport = null
    getGlobalNodeDataCache().clear()
  }
  const eventNames = ['auth-session-cleared', 'auth-session-updated', 'storage']
  for (const name of eventNames) events.addEventListener(name, resetOnSessionChange)
  return () => {
    for (const name of eventNames) events.removeEventListener(name, resetOnSessionChange)
  }
}
