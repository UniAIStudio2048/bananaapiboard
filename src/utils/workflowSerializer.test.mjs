/**
 * workflowSerializer 主线程兜底测试
 * node bananaapiboard/src/utils/workflowSerializer.test.mjs
 *
 * Node 环境下没有 DOM Worker 构造器，因此 serializeWorkflow 会自动走
 * 主线程兜底路径。我们依然要保证：
 *   - 返回 { json, size, viaWorker, elapsed }
 *   - viaWorker = false
 *   - json 反序列化后等于原 payload
 */
import { strict as assert } from 'node:assert'

// Node 默认无 import.meta.url worker 解析，模块加载时不会主动 new Worker，
// 只有 serializeWorkflow 首次调用时才尝试创建，所以可以安全 import。
const { serializeWorkflow, __test__ } = await import('./workflowSerializer.js')

const payload = {
  nodes: Array.from({ length: 100 }, (_, i) => ({ id: `n-${i}`, x: i, y: i, data: { label: `node ${i}` } })),
  edges: Array.from({ length: 50 }, (_, i) => ({ id: `e-${i}`, source: `n-${i}`, target: `n-${i + 1}` })),
  viewport: { x: 0, y: 0, zoom: 1 }
}

const result = await serializeWorkflow(payload)
assert.equal(typeof result.json, 'string')
assert.equal(result.size, result.json.length)
assert.equal(result.viaWorker, false, 'Node 环境无 Worker，必须走主线程兜底')
assert.ok(typeof result.elapsed === 'number' && result.elapsed >= 0)

const parsed = JSON.parse(result.json)
assert.equal(parsed.nodes.length, payload.nodes.length)
assert.equal(parsed.edges.length, payload.edges.length)
assert.equal(parsed.viewport.zoom, 1)

// Worker 不应被创建（因为 Node 没有 Worker 构造器）
assert.equal(__test__.isWorkerReady(), false)

// 直接调用兜底，确保签名一致
const inline = __test__.serializeInMainThread(payload)
assert.equal(inline.viaWorker, false)
assert.equal(inline.size, inline.json.length)

console.log('workflowSerializer (main-thread fallback) tests passed')
