/**
 * 画布工作流单设备编辑租约（前端状态与协议）
 *
 * 每个浏览器标签页是一个编辑会话（sessionStorage 中的稳定 id）。同一工作流同一时间只有一个
 * 会话持有编辑权：持有者的保存请求携带 X-Canvas-Lease-Token，服务端在事务内比对令牌；
 * 其他会话只读，可直接抢占。协议见 bananaapiserver/server/canvas/edit-lease.js。
 *
 * 状态 mode：
 *   editor   持有编辑权（token 有效）
 *   readonly 他人持有（reason: held 他人正在编辑 / taken 被抢占 / free 持有者已离开）
 *   pending  获取或抢占进行中，期间忽略广播，以接口结果为准
 *   released 本会话已主动释放（例如关闭工作流标签页或页面）
 *   unknown  租约接口不可用，按旧协议保存（服务端仅在无人持有时放行）
 */
import { reactive } from 'vue'

export const LEASE_SESSION_STORAGE_KEY = 'canvas_collab_client_id'

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `canvas-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 当前标签页的编辑会话标识；与增量写入的 X-Canvas-Client-Id、WebSocket clientId 一致 */
export function getCanvasSessionId(storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  try {
    let id = storage?.getItem(LEASE_SESSION_STORAGE_KEY)
    if (!id) {
      id = randomId()
      storage?.setItem(LEASE_SESSION_STORAGE_KEY, id)
    }
    return id
  } catch {
    return randomId()
  }
}

const workflowPath = (workflowId, action) => `/api/canvas/workflows/${encodeURIComponent(workflowId)}/lease/${action}`

/**
 * @param {object} deps
 * @param {(path: string, options: { headers?: object, body?: object, keepalive?: boolean }) => Promise<{ ok: boolean, status: number, data: object }>} deps.request
 * @param {() => string} deps.getSessionId
 * @param {() => object} deps.getBeaconAuth  release 时放入 body._headers 的租户与登录信息
 */
export function createEditLeaseClient({ request, getSessionId, getBeaconAuth = () => ({}) }) {
  const states = reactive({})
  const pendingCalls = new Map()
  const pendingReleases = new Map()

  function getState(workflowId) {
    return workflowId ? states[workflowId] || null : null
  }

  function setState(workflowId, next) {
    states[workflowId] = { workflowId, token: null, holder: null, reason: null, ...next, updatedAt: Date.now() }
    return states[workflowId]
  }

  function sessionHeaders() {
    return { 'X-Canvas-Session-Id': getSessionId() }
  }

  /** 写入请求使用的租约请求头：仅编辑者携带令牌 */
  function getLeaseHeaders(workflowId) {
    const state = getState(workflowId)
    const headers = sessionHeaders()
    if (state?.mode === 'editor' && state.token != null) headers['X-Canvas-Lease-Token'] = String(state.token)
    return headers
  }

  function isReadonly(workflowId) {
    return getState(workflowId)?.mode === 'readonly'
  }

  function applyResult(workflowId, response) {
    const data = response?.data || {}
    if (!response?.ok) {
      return setState(workflowId, { mode: 'unknown', error: data.error || `HTTP ${response?.status}` })
    }
    if (data.mode === 'editor') {
      return setState(workflowId, { mode: 'editor', token: Number(data.token), holder: data.holder || null })
    }
    return setState(workflowId, { mode: 'readonly', holder: data.holder || null, reason: data.holder ? 'held' : 'free' })
  }

  async function call(workflowId, action) {
    const pending = pendingCalls.get(workflowId)
    if (pending) {
      // 同一次获取只发送一个请求；关闭后重开或显式抢占则排在旧请求清理之后。
      if (pending.releaseVersion === 0 && pending.action === action) return pending.promise
      const releaseVersion = pending.releaseVersion
      await pending.promise
      if (pending.releaseVersion !== releaseVersion) return getState(workflowId)
      return call(workflowId, action)
    }
    const previous = getState(workflowId)
    setState(workflowId, { ...(previous || {}), mode: 'pending' })
    const operation = { action, releaseVersion: 0, promise: null }
    pendingCalls.set(workflowId, operation)
    operation.promise = (async () => {
      if (pendingReleases.has(workflowId)) await pendingReleases.get(workflowId)
      if (operation.releaseVersion > 0) return getState(workflowId)
      let response
      try {
        response = await request(workflowPath(workflowId, action), { headers: sessionHeaders(), body: {} })
      } catch (err) {
        response = { ok: false, status: 0, data: { error: err?.message || '网络错误' } }
      }
      if (operation.releaseVersion > 0) {
        if (response?.ok && response.data?.mode === 'editor') await sendRelease(workflowId, response.data.token)
        return getState(workflowId)
      }
      const next = applyResult(workflowId, response)
      return { ...next, becameEditor: next.mode === 'editor' && previous?.mode !== 'editor' }
    })().finally(() => { pendingCalls.delete(workflowId) })
    return operation.promise
  }

  const acquire = workflowId => call(workflowId, 'acquire')
  const takeover = workflowId => call(workflowId, 'takeover')

  /** 收到 handover_request 且已保存完毕后调用，让抢占方立即继续 */
  async function yieldLease(workflowId) {
    const state = getState(workflowId)
    if (state?.mode !== 'editor') return false
    try {
      const response = await request(workflowPath(workflowId, 'yield'), { headers: getLeaseHeaders(workflowId), body: {} })
      return Boolean(response?.ok && response.data?.ok)
    } catch {
      return false
    }
  }

  async function sendRelease(workflowId, token) {
    try {
      await request(workflowPath(workflowId, 'release-beacon'), {
        keepalive: true,
        headers: sessionHeaders(),
        body: { leaseSessionId: getSessionId(), leaseToken: token, _headers: getBeaconAuth() }
      })
    } catch {
      // 释放失败由服务端 TTL 兜底
    }
  }

  /** 关闭工作流标签页 / 页面时释放；切换画布标签不释放 */
  function release(workflowId) {
    const state = getState(workflowId)
    const pending = pendingCalls.get(workflowId)
    if (pending) {
      pending.releaseVersion += 1
      setState(workflowId, { mode: 'released' })
      return pending.promise
    }
    if (state?.mode !== 'editor') return
    setState(workflowId, { mode: 'released' })
    const releasing = sendRelease(workflowId, state.token)
      .finally(() => { pendingReleases.delete(workflowId) })
    pendingReleases.set(workflowId, releasing)
    return releasing
  }

  /** 为所有打开的编辑工作流续期；丢失后只读，等待用户显式拿回 */
  async function heartbeat() {
    const editors = new Map(Object.values(states).filter(s => s.mode === 'editor').map(s => [s.workflowId, s]))
    const workflowIds = [...editors.keys()]
    if (workflowIds.length === 0) return
    let response
    try {
      response = await request('/api/canvas/leases/heartbeat', { headers: sessionHeaders(), body: { workflowIds } })
    } catch {
      return
    }
    for (const id of response?.data?.lost || []) {
      // 心跳发出后可能已抢占成功、关闭或被其他窗口接管，旧结果不能覆盖新状态。
      if (getState(id) !== editors.get(id)) continue
      setState(id, { mode: 'readonly', reason: 'taken' })
    }
  }

  /**
   * 处理 WebSocket lease_changed 广播。
   * @returns {boolean} 本会话是否因此被抢占
   */
  function applyLeaseChanged(workflowId, payload = {}) {
    const state = getState(workflowId)
    if (!state || state.mode === 'pending') return false
    const token = Number(payload.token)
    if (!payload.holder) {
      if (state.mode === 'readonly') setState(workflowId, { mode: 'readonly', holder: null, reason: 'free' })
      return false
    }
    if (state.mode === 'editor') {
      if (Number.isFinite(token) && token > Number(state.token)) {
        setState(workflowId, { mode: 'readonly', holder: payload.holder, reason: 'taken' })
        return true
      }
      return false
    }
    if (state.mode === 'readonly') setState(workflowId, { mode: 'readonly', holder: payload.holder, reason: 'held' })
    return false
  }

  /**
   * 保存被服务端拒绝（edit_lease_lost / edit_lease_held）时切为只读。
   * sentToken 为被拒请求携带的令牌（未带为 null）：获取/抢占进行中，或请求发出后本会话已换到新令牌时，
   * 该拒绝来自过期请求，忽略，避免刚抢占成功又被迟到的 409 打回只读。
   * @returns {boolean} 是否切为只读
   */
  function markLost(workflowId, holder = null, code = 'edit_lease_lost', sentToken) {
    if (!workflowId) return false
    const state = getState(workflowId)
    if (state?.mode === 'pending') return false
    if (sentToken !== undefined && state?.mode === 'editor' && String(state.token) !== String(sentToken ?? '')) return false
    setState(workflowId, { mode: 'readonly', holder, reason: code === 'edit_lease_held' ? 'held' : 'taken' })
    return true
  }

  return {
    states,
    getState,
    getLeaseHeaders,
    isReadonly,
    acquire,
    takeover,
    yieldLease,
    release,
    heartbeat,
    applyLeaseChanged,
    markLost
  }
}
