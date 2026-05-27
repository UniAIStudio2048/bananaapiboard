/**
 * Phase 2.4 — 视口驱动的节点 data 按需加载器
 *
 * 工作流程：
 *   1) 调用 prime(manifest) 把 Shell 节点喂进 store（位置/类型/尺寸/version）
 *   2) ensureLoaded(visibleNodeIds) 在视口变化时调用，需要的节点 data 通过批量
 *      GET /nodes?ids=... 拉回来，回填到 store 同时进入 LRU 缓存
 *   3) 已在 LRU 命中的节点直接 touch；未命中的节点在 250ms 内合并成一次 batch
 *      请求（避免快速平移时打雪片）
 *
 * 设计注意：
 *   - 纯函数式 + 显式注入依赖（api、cache、setNodeData），不直接读 store/Vue 全局
 *   - 不挂载 Vue 生命周期；调用方自己负责 watch viewport 并触发 ensureLoaded
 *   - 失败重试控制在 fetchBatch 内部，避免抖动
 */

const DEFAULT_BATCH_MS = 250
const DEFAULT_MAX_BATCH = 40 // 服务端最大 50，留一点 buffer
const DEFAULT_RETRY = 2

export function createIncrementalLoader({
  api,        // { getWorkflowNodesBatch }
  cache,      // NodeDataCache 实例
  applyNode,  // (node) => void：把刚拉回来的 node 写入 store（合并 data）
  workflowIdRef, // 函数或对象 { value }，避免捕获过期 id
  batchMs = DEFAULT_BATCH_MS,
  maxBatch = DEFAULT_MAX_BATCH,
  maxRetry = DEFAULT_RETRY,
  onError
}) {
  if (!api || typeof api.getWorkflowNodesBatch !== 'function') {
    throw new Error('createIncrementalLoader: api.getWorkflowNodesBatch is required')
  }
  if (!cache) throw new Error('createIncrementalLoader: cache is required')
  if (typeof applyNode !== 'function') {
    throw new Error('createIncrementalLoader: applyNode must be a function')
  }

  let pendingIds = new Set()
  let timer = null
  let flying = new Map() // id -> Promise<void>，正在进行中的请求

  function getWorkflowId() {
    if (typeof workflowIdRef === 'function') return workflowIdRef()
    if (workflowIdRef && 'value' in workflowIdRef) return workflowIdRef.value
    return workflowIdRef
  }

  function scheduleFlush() {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      // flushNow 内部已经把错误交给 onError，不再二次包装
      flushNow().catch(err => {
        console.warn('[IncrementalLoader] flushNow 未预期错误:', err.message)
      })
    }, batchMs)
    if (typeof timer.unref === 'function') timer.unref()
  }

  async function flushNow() {
    const workflowId = getWorkflowId()
    if (!workflowId) return
    if (pendingIds.size === 0) return

    const ids = Array.from(pendingIds).slice(0, maxBatch)
    pendingIds = new Set(Array.from(pendingIds).slice(maxBatch))

    const promise = fetchWithRetry(workflowId, ids, maxRetry)
      .then(({ nodes, missing }) => {
        for (const node of nodes || []) {
          if (!node || !node.id) continue
          cache.set(node.id, node)
          try { applyNode(node) } catch (err) {
            console.warn('[IncrementalLoader] applyNode 抛错:', err.message)
          }
          flying.delete(node.id)
        }
        if (Array.isArray(missing)) {
          for (const id of missing) flying.delete(id)
        }
      })
      .catch(err => {
        for (const id of ids) flying.delete(id)
        if (onError) onError(err)
        // 不再 rethrow：onError 已经处理；rethrow 会让上层重复触发
      })

    for (const id of ids) flying.set(id, promise)
    if (pendingIds.size > 0) scheduleFlush() // 把超过 maxBatch 的尾部排到下一轮
    await promise
  }

  async function fetchWithRetry(workflowId, ids, retries) {
    let lastErr
    for (let i = 0; i <= retries; i++) {
      try {
        return await api.getWorkflowNodesBatch(workflowId, ids)
      } catch (err) {
        lastErr = err
        if (i < retries) {
          const backoff = 300 * Math.pow(2, i) + Math.random() * 200
          await new Promise(r => setTimeout(r, backoff))
        }
      }
    }
    throw lastErr
  }

  /**
   * 视口/选中变化时调用：保证 ids 列表对应的节点 data 在内存里。
   * - 命中缓存：touch（最近使用），不发请求
   * - 未命中且未在飞：加入 pending，scheduleFlush
   */
  function ensureLoaded(ids) {
    if (!ids || ids.length === 0) return
    const need = []
    for (const id of ids) {
      if (cache.has(id)) {
        cache.get(id) // touch
        continue
      }
      if (flying.has(id)) continue
      if (pendingIds.has(id)) continue
      need.push(id)
    }
    if (need.length === 0) return
    for (const id of need) pendingIds.add(id)
    scheduleFlush()
  }

  /**
   * 主动预热：把 manifest 中的 ids 按视口优先级排序后调用，
   * 等价于反复 ensureLoaded 但语义更清晰。
   */
  function prefetch(ids) { ensureLoaded(ids) }

  /** 当前是否还有挂起请求 */
  function hasPending() { return pendingIds.size > 0 || flying.size > 0 }

  function reset() {
    if (timer) { clearTimeout(timer); timer = null }
    pendingIds.clear()
    flying.clear()
  }

  return {
    ensureLoaded,
    prefetch,
    flushNow,
    hasPending,
    reset,
    // 调试
    _state: () => ({ pending: pendingIds.size, flying: flying.size })
  }
}
