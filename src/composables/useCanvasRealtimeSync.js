/**
 * Phase 3.2 — Canvas 实时同步 composable
 *
 * 把 createWorkflowSocket 与 canvasStore / api/canvas/workflow 串起来：
 *  - 连接：拿到 workflowId 后 connect()，workflowId 切换或卸载时 disconnect()
 *  - 接收：把 ops / node_patched 转化为 store.applyIncrementalNode（远端来的不再回传服务端）
 *  - 重连：onResync 时拉 manifest 对比，把缺失/版本变高的节点重新加载
 *
 * 完全 opt-in：调用方在合适的位置 useCanvasRealtimeSync(...) 启用即可。
 */

import { ref, watch, onBeforeUnmount } from 'vue'
import { createWorkflowSocket } from '../api/canvas/workflowSocket.js'

// 注：默认 api 走真实 workflow.js，但只有在缺省时才动态 import，
// 避免在测试环境拉入 @/config 之类的 Vite-only 依赖
async function defaultGetManifest(workflowId) {
  const mod = await import('../api/canvas/workflow.js')
  return mod.getWorkflowManifest(workflowId)
}
async function defaultGetBatch(workflowId, ids) {
  const mod = await import('../api/canvas/workflow.js')
  return mod.getWorkflowNodesBatch(workflowId, ids)
}

/**
 * @param {object} options
 * @param {() => string|null} options.getWorkflowId  返回当前工作流 id（响应式 ref/computed 也可）
 * @param {object} options.store    canvasStore 实例（需要 applyIncrementalNode / nodes / loadWorkflowManifest）
 * @param {object} [options.api]    覆盖 api 客户端（测试用），需提供 getWorkflowManifest / getWorkflowNodesBatch
 * @param {object} [options.socketFactory] 覆盖 socket 工厂（测试用），需返回 { connect, disconnect, clientId }
 * @param {boolean} [options.autoConnect=true]
 * @param {string} [options.baseUrl]
 * @param {(state) => void} [options.onStateChange]
 * @param {(err) => void} [options.onError]
 */
export function useCanvasRealtimeSync(options = {}) {
  const getWorkflowId = typeof options.getWorkflowId === 'function'
    ? options.getWorkflowId
    : () => null
  const store = options.store
  if (!store || typeof store.applyIncrementalNode !== 'function') {
    throw new Error('useCanvasRealtimeSync: store with applyIncrementalNode required')
  }

  const api = options.api || {
    getWorkflowManifest: defaultGetManifest,
    getWorkflowNodesBatch: defaultGetBatch
  }
  const socketFactory = options.socketFactory || createWorkflowSocket
  const autoConnect = options.autoConnect !== false

  const connectionState = ref('closed')
  const lastError = ref(null)
  let socket = null
  let currentWorkflowId = null

  function applyRemoteNode(node) {
    if (!node || !node.id) return
    try { store.applyIncrementalNode(node) } catch (err) { lastError.value = err }
  }

  async function resyncFromManifest() {
    const wfId = currentWorkflowId
    if (!wfId) return
    try {
      const manifest = await api.getWorkflowManifest(wfId)
      const nodeIndex = (manifest && manifest.nodeIndex) || []
      const localNodes = store.nodes || []
      const localById = new Map()
      for (const n of localNodes) localById.set(n.id, n)

      const stale = []
      for (const entry of nodeIndex) {
        const local = localById.get(entry.id)
        if (!local) { stale.push(entry.id); continue }
        const localVersion = (local.data && local.data.__version) || 0
        if (entry.version && entry.version > localVersion) stale.push(entry.id)
      }
      // 分批拉，避免一次 500 个
      const BATCH = 30
      for (let i = 0; i < stale.length; i += BATCH) {
        const ids = stale.slice(i, i + BATCH)
        try {
          const { nodes } = await api.getWorkflowNodesBatch(wfId, ids)
          for (const n of nodes || []) applyRemoteNode(n)
        } catch (err) {
          lastError.value = err
          if (typeof options.onError === 'function') options.onError(err)
        }
      }
    } catch (err) {
      lastError.value = err
      if (typeof options.onError === 'function') options.onError(err)
    }
  }

  function buildSocket(workflowId) {
    return socketFactory({
      workflowId,
      baseUrl: options.baseUrl,
      onStateChange: (st) => {
        connectionState.value = st
        if (typeof options.onStateChange === 'function') options.onStateChange(st)
      },
      onError: (err) => {
        lastError.value = err
        if (typeof options.onError === 'function') options.onError(err)
      },
      onHello: () => { /* 首次问候不做事，节点初始内容由 incrementalLoader 拉 */ },
      onOps: (ops /* , fromClient */) => {
        // ops 服务端已抑制回声；这里仅消费远端事件
        if (!Array.isArray(ops)) return
        for (const op of ops) {
          if (!op || !op.target) continue
          if (op.target === 'node') {
            const payload = op.payload || {}
            if (op.op === 'delete') {
              try { store.removeNode && store.removeNode(payload.nodeId || payload.id) } catch {}
            } else if (payload && (payload.id || payload.nodeId)) {
              applyRemoteNode({ id: payload.id || payload.nodeId, ...payload })
            }
          }
          // edge ops 在后续 Phase 接入
        }
      },
      onNodePatched: (nodeId, node /* , version, fromClient */) => {
        if (!nodeId || !node) return
        applyRemoteNode({ ...node, id: nodeId })
      },
      onResync: () => { resyncFromManifest() }
    })
  }

  function connect() {
    const wfId = getWorkflowId()
    if (!wfId) return
    if (socket && currentWorkflowId === wfId) return
    if (socket) socket.disconnect()
    currentWorkflowId = wfId
    socket = buildSocket(wfId)
    socket.connect()
  }

  function disconnect() {
    if (socket) {
      try { socket.disconnect() } catch {}
      socket = null
    }
    currentWorkflowId = null
    connectionState.value = 'closed'
  }

  // 监听 workflowId 变化（如果是 ref/computed）
  try {
    watch(
      () => getWorkflowId(),
      (newId, oldId) => {
        if (newId === oldId) return
        if (!newId) { disconnect(); return }
        connect()
      }
    )
  } catch {
    // 非组件上下文（如纯 JS 测试）忽略 watch
  }

  if (autoConnect && getWorkflowId()) connect()

  try {
    onBeforeUnmount(() => disconnect())
  } catch {
    // 非组件上下文
  }

  return {
    connectionState,
    lastError,
    connect,
    disconnect,
    /** 测试钩子 */
    __test__: {
      get socket() { return socket },
      resyncFromManifest
    }
  }
}
