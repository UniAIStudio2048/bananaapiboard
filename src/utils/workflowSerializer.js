/**
 * workflowSerializer 主线程入口
 *
 * - serializeWorkflow(data): 优先走 Web Worker，失败/不可用时回退主线程
 * - 返回 { json, size, viaWorker, elapsed }
 *
 * 使用单例 Worker，避免每次 autosave 重建 Worker 带来的初始化开销。
 */

let workerInstance = null
let workerInitFailed = false
let messageCounter = 0
const pendingMap = new Map()

function createWorker() {
  if (workerInitFailed) return null
  if (typeof Worker === 'undefined') {
    workerInitFailed = true
    return null
  }
  try {
    const worker = new Worker(
      new URL('../workers/workflowSerializer.worker.js', import.meta.url),
      { type: 'module' }
    )
    worker.addEventListener('message', event => {
      const { id, ok, json, size, elapsed, error } = event.data || {}
      const pending = pendingMap.get(id)
      if (!pending) return
      pendingMap.delete(id)
      if (ok) {
        pending.resolve({ json, size, viaWorker: true, elapsed })
      } else {
        pending.reject(new Error(error || 'workflowSerializer worker error'))
      }
    })
    worker.addEventListener('error', err => {
      console.warn('[workflowSerializer] worker 异常，将回退主线程序列化:', err?.message || err)
      workerInitFailed = true
      for (const { reject } of pendingMap.values()) {
        reject(new Error('workflowSerializer worker terminated'))
      }
      pendingMap.clear()
      workerInstance = null
    })
    return worker
  } catch (err) {
    workerInitFailed = true
    console.warn('[workflowSerializer] 无法创建 worker，回退主线程序列化:', err?.message || err)
    return null
  }
}

function serializeInMainThread(data) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const json = JSON.stringify(data ?? {})
  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
  return { json, size: json.length, viaWorker: false, elapsed }
}

export async function serializeWorkflow(data, { timeoutMs = 8000 } = {}) {
  if (!workerInstance && !workerInitFailed) {
    workerInstance = createWorker()
  }
  if (!workerInstance) {
    return serializeInMainThread(data)
  }

  const id = ++messageCounter
  const job = new Promise((resolve, reject) => {
    pendingMap.set(id, { resolve, reject })
    workerInstance.postMessage({ id, type: 'serialize', payload: data })

    if (timeoutMs > 0) {
      setTimeout(() => {
        if (pendingMap.has(id)) {
          pendingMap.delete(id)
          reject(new Error('workflowSerializer worker timeout'))
        }
      }, timeoutMs)
    }
  })

  try {
    return await job
  } catch (err) {
    console.warn('[workflowSerializer] worker 调用失败，使用主线程兜底:', err?.message || err)
    return serializeInMainThread(data)
  }
}

export function disposeWorkflowSerializer() {
  if (workerInstance) {
    try { workerInstance.terminate() } catch (_) { /* noop */ }
    workerInstance = null
  }
  pendingMap.clear()
}

export const __test__ = {
  isWorkerReady: () => !!workerInstance,
  isWorkerFailed: () => workerInitFailed,
  serializeInMainThread
}
