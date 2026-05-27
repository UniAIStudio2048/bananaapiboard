/**
 * workflowSerializer.worker
 *
 * 把工作流 JSON.stringify 与 base64 体积估算放到 Worker，
 * 主线程不再因 1000+ 节点序列化卡顿 200-500ms。
 *
 * 协议：
 *   主线程 -> Worker: { id, type: 'serialize', payload: workflowData }
 *   Worker -> 主线程: { id, ok: true, json, size } / { id, ok: false, error }
 */

/* eslint-env worker */
/* global self */

function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch (err) {
    return JSON.stringify({ __serializeError: err && err.message ? err.message : String(err) })
  }
}

self.addEventListener('message', event => {
  const { id, type, payload } = event.data || {}
  if (type !== 'serialize') {
    self.postMessage({ id, ok: false, error: `Unknown message type: ${type}` })
    return
  }

  const t0 = performance.now()
  try {
    const json = safeStringify(payload || {})
    const size = json.length
    const elapsed = performance.now() - t0
    self.postMessage({ id, ok: true, json, size, elapsed })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) })
  }
})
