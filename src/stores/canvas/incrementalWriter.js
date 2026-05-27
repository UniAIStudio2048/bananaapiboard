/**
 * Phase 2.5 — 前端增量写流水线
 *
 * 职责：
 *   - 接收 `node.add` / `node.update` / `node.delete` / `edge.add` / `edge.update` / `edge.delete` 操作
 *   - 同节点 update 在 500ms 窗口内合并（只保留最新 payload + 累计 patch）
 *   - 批量打包 POST /ops；失败指数退避重试
 *   - 多次重试仍失败 / 离线时落 IndexedDB 缓冲
 *   - 重连或下次启动时回放缓冲
 *
 * 设计约束：
 *   - 纯 JS，依赖通过参数注入：{ api, storage }，方便单测
 *   - 不直接耦合 Vue/Pinia，调用方在 store 的 mutation 里 enqueue
 */

const DEFAULT_DEBOUNCE_MS = 500
const DEFAULT_MAX_BATCH = 200
const DEFAULT_MAX_RETRY = 3
const DEFAULT_BACKOFF_BASE_MS = 500

function genId() {
  // 不需要密码学安全
  return `op_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffff).toString(36)}`
}

function nowMs() { return Date.now() }

/**
 * 把同一 (target, id) 的 update 操作合并：保留最新 payload，
 * 并把所有 patch 字段浅合并；add/delete 不合并。
 */
function coalesceOps(ops) {
  /** @type {Map<string, any>} */
  const updateIndex = new Map() // key: target:id -> op
  const result = []

  for (const op of ops) {
    if (op.op === 'update' && op.id) {
      const key = `${op.target}:${op.id}`
      const existing = updateIndex.get(key)
      if (existing) {
        existing.payload = { ...(existing.payload || {}), ...(op.payload || {}) }
        existing.ts = op.ts // 取最新时间戳
        // baseVersion 保留最早的（用于乐观锁）
        continue
      }
      updateIndex.set(key, op)
      result.push(op)
      continue
    }
    result.push(op)
  }
  return result
}

/**
 * 简易 IndexedDB 包装；如果 indexedDB 不可用，自动退化为 in-memory 缓存。
 *
 * 表结构（按 workflowId 分键）：
 *   key: workflowId
 *   value: { ops: Op[] }
 */
export class WriterStorage {
  constructor({ dbName = 'banana-canvas-writer', storeName = 'pending_ops' } = {}) {
    this.dbName = dbName
    this.storeName = storeName
    this._memory = new Map()
    this._db = null
    this._ready = null
  }

  isPersistent() {
    return typeof indexedDB !== 'undefined'
  }

  async _open() {
    if (!this.isPersistent()) return null
    if (this._db) return this._db
    if (!this._ready) {
      this._ready = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName)
          }
        }
        req.onsuccess = () => { this._db = req.result; resolve(this._db) }
        req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
      })
    }
    return this._ready
  }

  async save(workflowId, ops) {
    if (!workflowId) return
    if (!this.isPersistent()) {
      this._memory.set(workflowId, { ops: [...ops] })
      return
    }
    const db = await this._open()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).put({ ops }, workflowId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async load(workflowId) {
    if (!workflowId) return []
    if (!this.isPersistent()) return this._memory.get(workflowId)?.ops ?? []
    const db = await this._open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).get(workflowId)
      req.onsuccess = () => resolve(req.result?.ops ?? [])
      req.onerror = () => reject(req.error)
    })
  }

  async clear(workflowId) {
    if (!workflowId) return
    if (!this.isPersistent()) { this._memory.delete(workflowId); return }
    const db = await this._open()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).delete(workflowId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

/**
 * 创建一个写流水线实例。每个工作流一个；切工作流时调用 dispose() 释放。
 *
 * @param {object} deps
 * @param {{ postWorkflowOps: (id, ops) => Promise<any> }} deps.api
 * @param {WriterStorage} deps.storage
 * @param {() => string} deps.workflowIdRef
 * @param {object} [deps.options]
 */
export function createIncrementalWriter({
  api,
  storage,
  workflowIdRef,
  options = {}
}) {
  if (!api || typeof api.postWorkflowOps !== 'function') {
    throw new Error('createIncrementalWriter: api.postWorkflowOps required')
  }
  if (!storage) throw new Error('createIncrementalWriter: storage required')

  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxBatch = options.maxBatch ?? DEFAULT_MAX_BATCH
  const maxRetry = options.maxRetry ?? DEFAULT_MAX_RETRY
  const backoffBase = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS
  const onFlushResult = typeof options.onFlushResult === 'function' ? options.onFlushResult : null
  const onError = typeof options.onError === 'function' ? options.onError : null
  const isOnline = typeof options.isOnline === 'function'
    ? options.isOnline
    : () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

  /** @type {any[]} */
  let queue = []
  let timer = null
  let flushing = false

  function getWorkflowId() {
    if (typeof workflowIdRef === 'function') return workflowIdRef()
    if (workflowIdRef && 'value' in workflowIdRef) return workflowIdRef.value
    return workflowIdRef
  }

  function scheduleFlush() {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      flush().catch(err => {
        if (onError) onError(err)
      })
    }, debounceMs)
    if (typeof timer.unref === 'function') timer.unref()
  }

  /**
   * 入队一个增量操作。
   *
   * @param {object} op
   *   { op: 'add'|'update'|'delete', target: 'node'|'edge', id?: string, payload?: any, baseVersion?: number }
   */
  function enqueue(op) {
    if (!op || !op.op || !op.target) return
    queue.push({
      _id: genId(),
      op: op.op,
      target: op.target,
      id: op.id,
      payload: op.payload,
      baseVersion: op.baseVersion,
      ts: nowMs()
    })
    scheduleFlush()
  }

  /** 立即 flush（如：用户主动保存 / 切 tab） */
  async function flush() {
    if (flushing) return { skipped: true, reason: 'in_flight' }
    if (queue.length === 0) {
      // 看看 IndexedDB 里有没有上次失败的，趁机回放
      return await replayPersisted()
    }

    flushing = true
    try {
      const wfId = getWorkflowId()
      if (!wfId) return { skipped: true, reason: 'no_workflow' }

      // 先 coalesce 当前队列
      const coalesced = coalesceOps(queue)
      const batch = coalesced.slice(0, maxBatch)
      const leftover = coalesced.slice(maxBatch)
      queue = leftover

      if (!isOnline()) {
        // 离线 -> 全部落 IndexedDB
        const persisted = await storage.load(wfId)
        await storage.save(wfId, persisted.concat(batch, leftover))
        queue = []
        return { offline: true, persisted: batch.length + leftover.length }
      }

      const result = await sendWithRetry(wfId, batch)
      if (result.success) {
        if (onFlushResult) onFlushResult({ ok: true, count: batch.length, response: result.response })
        // 若 leftover 还有，触发下一轮
        if (leftover.length > 0) scheduleFlush()
        return { ok: true, count: batch.length }
      } else {
        // 重试耗尽 -> 落 IndexedDB
        try {
          const persisted = await storage.load(wfId)
          await storage.save(wfId, persisted.concat(batch))
        } catch (storeErr) {
          if (onError) onError(storeErr)
        }
        if (onError) onError(result.error)
        return { ok: false, persistedToStorage: true, count: batch.length }
      }
    } finally {
      flushing = false
    }
  }

  async function sendWithRetry(workflowId, ops) {
    let lastErr
    for (let i = 0; i <= maxRetry; i++) {
      try {
        const response = await api.postWorkflowOps(workflowId, ops)
        return { success: true, response }
      } catch (err) {
        lastErr = err
        if (i >= maxRetry) break
        const wait = backoffBase * Math.pow(2, i) + Math.random() * 200
        await new Promise(r => setTimeout(r, wait))
      }
    }
    return { success: false, error: lastErr }
  }

  /**
   * 回放 IndexedDB 中尚未发送成功的 ops。
   */
  async function replayPersisted() {
    const wfId = getWorkflowId()
    if (!wfId) return { replayed: 0 }
    let persisted = []
    try { persisted = await storage.load(wfId) } catch { return { replayed: 0 } }
    if (!persisted || persisted.length === 0) return { replayed: 0 }
    if (!isOnline()) return { replayed: 0, offline: true }

    const batch = persisted.slice(0, maxBatch)
    const leftover = persisted.slice(maxBatch)
    const result = await sendWithRetry(wfId, batch)
    if (result.success) {
      // 成功 -> 清掉本次 batch；如果还有 leftover，写回 storage
      if (leftover.length > 0) {
        try { await storage.save(wfId, leftover) } catch {}
        scheduleFlush()
      } else {
        try { await storage.clear(wfId) } catch {}
      }
      if (onFlushResult) onFlushResult({ ok: true, replayed: batch.length, response: result.response })
      return { ok: true, replayed: batch.length }
    } else {
      if (onError) onError(result.error)
      return { ok: false, replayed: 0 }
    }
  }

  /** 队列长度（调试用） */
  function pendingCount() { return queue.length }

  /** 释放资源 */
  function dispose() {
    if (timer) { clearTimeout(timer); timer = null }
    queue = []
  }

  return {
    enqueue,
    flush,
    replayPersisted,
    pendingCount,
    dispose,
    // 调试
    _state: () => ({ queue: queue.length, flushing })
  }
}

export const __test__ = { coalesceOps }
