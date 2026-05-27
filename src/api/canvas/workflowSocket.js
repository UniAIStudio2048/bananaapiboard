/**
 * Phase 3.2 — 画布工作流 WebSocket 客户端
 *
 * 连接：`/ws/canvas/workflow/:workflowId?token=<sessionToken>&clientId=<uuid>`
 * 协议见 bananaapiserver/server/canvas/workflow-ws.js
 *
 * 设计要点：
 *   - 心跳：每 25 秒发 ping，60 秒未收到任何消息则强制重连
 *   - 重连：指数退避（1s → 2s → 4s → 8s → 最大 30s），上限不限制总次数
 *   - 自带 clientId（uuid），用于让服务端在广播时跳过自己刚发的 ops（回声抑制）
 *   - 完全 opt-in：connect / disconnect 由调用方控制
 *   - 重连恢复后自动通过 onResync 回调让上层（store）触发 manifest 对比补齐
 *
 * 不在本模块负责：
 *   - 真正应用 ops（应在 store 或 incrementalLoader 中处理）
 *   - manifest 拉取（store/incrementalLoader 负责）
 */

const DEFAULT_HEARTBEAT_MS = 25 * 1000
const DEFAULT_RECEIVE_TIMEOUT_MS = 60 * 1000
const DEFAULT_BACKOFF_INITIAL_MS = 1000
const DEFAULT_BACKOFF_MAX_MS = 30 * 1000

function genClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // fallback
  return 'cli-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36)
}

function getDefaultBaseUrl() {
  if (typeof window === 'undefined' || !window.location) return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
}

/**
 * 创建一个 WebSocket 客户端实例（同一个 workflowId 一份）
 *
 * @param {object} opts
 * @param {string} opts.workflowId         必填
 * @param {() => string|null} opts.getToken 拿 session token 的函数（默认 localStorage('token')）
 * @param {string} [opts.clientId]         覆盖默认 UUID（多 tab 调试用）
 * @param {string} [opts.baseUrl]          ws:// 基址；默认根据当前页面协议
 * @param {(ops, fromClient) => void} [opts.onOps]          收到 type=ops 时回调
 * @param {(nodeId, node, version, fromClient) => void} [opts.onNodePatched]
 * @param {(payload) => void} [opts.onHello]                收到 hello 时回调（带 workflowVersion）
 * @param {() => void} [opts.onResync]    重连成功后回调，提示上层对比 manifest 补齐
 * @param {(state) => void} [opts.onStateChange]            'connecting'|'open'|'closed'|'reconnecting'
 * @param {(err) => void} [opts.onError]
 * @param {number} [opts.heartbeatMs]
 * @param {number} [opts.receiveTimeoutMs]
 * @param {number} [opts.backoffInitialMs]
 * @param {number} [opts.backoffMaxMs]
 * @param {boolean} [opts.autoReconnect=true]
 * @param {object} [opts.WebSocketImpl]  注入 WebSocket 实现（测试用，默认 globalThis.WebSocket）
 */
export function createWorkflowSocket(opts = {}) {
  const workflowId = opts.workflowId
  if (!workflowId) throw new Error('createWorkflowSocket: workflowId required')

  const getToken = typeof opts.getToken === 'function'
    ? opts.getToken
    : () => {
        try { return localStorage.getItem('token') } catch { return null }
      }

  const clientId = opts.clientId || genClientId()
  const baseUrl = opts.baseUrl || getDefaultBaseUrl()
  // 最小 100ms 是为了避免极端误配（如 0/负数）；测试可以设小值
  const heartbeatMs = Math.max(100, opts.heartbeatMs || DEFAULT_HEARTBEAT_MS)
  const receiveTimeoutMs = Math.max(heartbeatMs * 2, opts.receiveTimeoutMs || DEFAULT_RECEIVE_TIMEOUT_MS)
  const backoffInitialMs = opts.backoffInitialMs || DEFAULT_BACKOFF_INITIAL_MS
  const backoffMaxMs = opts.backoffMaxMs || DEFAULT_BACKOFF_MAX_MS
  const autoReconnect = opts.autoReconnect !== false

  const WSImpl = opts.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null)
  if (!WSImpl) {
    throw new Error('createWorkflowSocket: no WebSocket implementation available')
  }

  let ws = null
  let stopped = false
  let backoffMs = backoffInitialMs
  let reconnectAttempt = 0
  let heartbeatTimer = null
  let receiveDeadlineTimer = null
  let reconnectTimer = null
  let hasOpenedOnce = false
  let state = 'closed'

  function emitState(next) {
    state = next
    if (typeof opts.onStateChange === 'function') {
      try { opts.onStateChange(next) } catch {}
    }
  }

  function emitError(err) {
    if (typeof opts.onError === 'function') {
      try { opts.onError(err) } catch {}
    }
  }

  function clearTimers() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    if (receiveDeadlineTimer) { clearTimeout(receiveDeadlineTimer); receiveDeadlineTimer = null }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  }

  function refreshReceiveDeadline() {
    if (receiveDeadlineTimer) clearTimeout(receiveDeadlineTimer)
    receiveDeadlineTimer = setTimeout(() => {
      // 长时间没收到任何消息，主动断线让 onclose 走重连
      try { ws && ws.close(4000, 'receive_timeout') } catch {}
    }, receiveTimeoutMs)
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = setInterval(() => {
      sendRaw({ type: 'ping' })
    }, heartbeatMs)
  }

  function sendRaw(msg) {
    if (!ws || ws.readyState !== 1 /* OPEN */) return false
    try {
      ws.send(JSON.stringify(msg))
      return true
    } catch (err) {
      emitError(err)
      return false
    }
  }

  function scheduleReconnect() {
    if (stopped || !autoReconnect) return
    if (reconnectTimer) return
    emitState('reconnecting')
    const delay = backoffMs
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      backoffMs = Math.min(backoffMaxMs, Math.max(backoffInitialMs, backoffMs * 2))
      reconnectAttempt += 1
      connect()
    }, delay)
  }

  function buildUrl() {
    const token = (() => {
      try { return getToken() } catch { return null }
    })()
    const params = new URLSearchParams()
    if (token) params.set('token', token)
    params.set('clientId', clientId)
    return `${baseUrl}/ws/canvas/workflow/${encodeURIComponent(workflowId)}?${params.toString()}`
  }

  function onMessage(evt) {
    refreshReceiveDeadline()
    let msg
    try { msg = JSON.parse(typeof evt.data === 'string' ? evt.data : '') }
    catch { return }
    if (!msg || typeof msg !== 'object') return

    switch (msg.type) {
      case 'hello':
        if (typeof opts.onHello === 'function') {
          try { opts.onHello(msg.payload || {}) } catch (e) { emitError(e) }
        }
        break
      case 'ops':
        if (typeof opts.onOps === 'function') {
          const payload = msg.payload || {}
          try { opts.onOps(payload.ops || [], payload.fromClient || null) }
          catch (e) { emitError(e) }
        }
        break
      case 'node_patched':
        if (typeof opts.onNodePatched === 'function') {
          const p = msg.payload || {}
          try { opts.onNodePatched(p.nodeId, p.node, p.version, p.fromClient || null) }
          catch (e) { emitError(e) }
        }
        break
      case 'pong':
        // 心跳响应，仅用于刷新接收超时
        break
      default:
        // 未知协议忽略，保证未来扩展兼容
        break
    }
  }

  function onOpen() {
    backoffMs = backoffInitialMs
    emitState('open')
    startHeartbeat()
    refreshReceiveDeadline()
    if (hasOpenedOnce && typeof opts.onResync === 'function') {
      // 重连成功 -> 通知上层用 manifest/对比补齐
      try { opts.onResync({ attempt: reconnectAttempt }) } catch (e) { emitError(e) }
    }
    hasOpenedOnce = true
  }

  function onClose(evt) {
    clearTimers()
    ws = null
    if (stopped) {
      emitState('closed')
      return
    }
    // 4001/4003/4004 等鉴权类错误：不重连，留给上层处理
    if (evt && (evt.code === 4001 || evt.code === 4003 || evt.code === 4004)) {
      emitState('closed')
      emitError(new Error(`auth_failed:${evt.code}`))
      return
    }
    scheduleReconnect()
  }

  function onSocketError(err) {
    emitError(err)
    // 不直接关闭，等待 onClose 触发统一逻辑
  }

  function connect() {
    if (stopped) return
    if (ws) {
      try { ws.close() } catch {}
      ws = null
    }
    emitState('connecting')
    const url = buildUrl()
    try {
      ws = new WSImpl(url)
    } catch (err) {
      emitError(err)
      scheduleReconnect()
      return
    }
    ws.onopen = onOpen
    ws.onmessage = onMessage
    ws.onclose = onClose
    ws.onerror = onSocketError
  }

  return {
    workflowId,
    clientId,
    get state() { return state },
    get readyState() { return ws ? ws.readyState : 3 },
    connect() {
      if (stopped) stopped = false
      connect()
    },
    disconnect() {
      stopped = true
      clearTimers()
      if (ws) {
        try { ws.close(1000, 'client_disconnect') } catch {}
        ws = null
      }
      emitState('closed')
    },
    sendAck(version) { return sendRaw({ type: 'ack', payload: { version } }) },
    /** 测试钩子 */
    __test__: {
      get ws() { return ws },
      get backoffMs() { return backoffMs },
      get reconnectAttempt() { return reconnectAttempt },
      simulateMessage(payload) {
        if (ws && typeof ws.onmessage === 'function') {
          ws.onmessage({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) })
        }
      }
    }
  }
}
