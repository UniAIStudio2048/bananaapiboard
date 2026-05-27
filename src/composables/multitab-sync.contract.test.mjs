/**
 * Phase 3.3 — 多 tab / 多端同步契约测试
 *
 * 用一个内存版 "WebSocket bus" 模拟后端 broadcastOps / broadcastNodePatch：
 *   - 两个 tab 各创建自己的 useCanvasRealtimeSync
 *   - tab A 触发 op，bus 转发到 tab B（按 clientId 抑制回声，跟后端实现一致）
 *   - 断言 tab B 的 store 内出现 tab A 的修改
 *
 * 这是为"两 tab 1s 内同步"验收准备的本地等价契约：
 *   bus 转发是同步的，所以延迟只取决于事件循环
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { useCanvasRealtimeSync } from './useCanvasRealtimeSync.js'

class FakeSocketBus {
  constructor() {
    this.handlers = new Map() // clientId -> { onOps, onNodePatched, onResync }
  }
  register(clientId, h) { this.handlers.set(clientId, h) }
  unregister(clientId) { this.handlers.delete(clientId) }
  broadcastOps(ops, fromClient) {
    for (const [cid, h] of this.handlers) {
      if (cid === fromClient) continue
      if (typeof h.onOps === 'function') h.onOps(ops, fromClient)
    }
  }
  broadcastNodePatch(nodeId, node, version, fromClient) {
    for (const [cid, h] of this.handlers) {
      if (cid === fromClient) continue
      if (typeof h.onNodePatched === 'function') h.onNodePatched(nodeId, node, version, fromClient)
    }
  }
  triggerResyncAll() {
    for (const h of this.handlers.values()) {
      if (typeof h.onResync === 'function') h.onResync()
    }
  }
}

function makeStore(initial = []) {
  return {
    nodes: [...initial],
    removed: [],
    applyIncrementalNode(node) {
      const idx = this.nodes.findIndex(n => n.id === node.id)
      if (idx >= 0) this.nodes[idx] = { ...this.nodes[idx], ...node, data: { ...(this.nodes[idx].data || {}), ...(node.data || {}) } }
      else this.nodes.push(node)
    },
    removeNode(id) { this.removed.push(id); this.nodes = this.nodes.filter(n => n.id !== id) }
  }
}

function makeSocketFactory(clientId, bus) {
  return (opts) => {
    bus.register(clientId, {
      onOps: opts.onOps,
      onNodePatched: opts.onNodePatched,
      onResync: opts.onResync
    })
    return {
      connect() {},
      disconnect() { bus.unregister(clientId) },
      clientId
    }
  }
}

test('tab A 的 ops 同步到 tab B 的 store，A 自己不接回声', () => {
  const bus = new FakeSocketBus()
  const storeA = makeStore()
  const storeB = makeStore()
  const fakeApi = { async getWorkflowManifest() { return { nodeIndex: [] } }, async getWorkflowNodesBatch() { return { nodes: [] } } }
  useCanvasRealtimeSync({ getWorkflowId: () => 'wf-x', store: storeA, api: fakeApi, socketFactory: makeSocketFactory('A', bus) })
  useCanvasRealtimeSync({ getWorkflowId: () => 'wf-x', store: storeB, api: fakeApi, socketFactory: makeSocketFactory('B', bus) })

  bus.broadcastOps([
    { op: 'update', target: 'node', payload: { id: 'n1', data: { foo: 1 } } }
  ], 'A')

  // A 不应收到自己的
  assert.equal(storeA.nodes.length, 0)
  // B 应收到
  assert.equal(storeB.nodes.length, 1)
  assert.equal(storeB.nodes[0].id, 'n1')
  assert.equal(storeB.nodes[0].data.foo, 1)
})

test('node_patched 在两侧除发起方外都生效', () => {
  const bus = new FakeSocketBus()
  const storeA = makeStore()
  const storeB = makeStore()
  const storeC = makeStore()
  const fakeApi = { async getWorkflowManifest() { return { nodeIndex: [] } }, async getWorkflowNodesBatch() { return { nodes: [] } } }
  useCanvasRealtimeSync({ getWorkflowId: () => 'wf-x', store: storeA, api: fakeApi, socketFactory: makeSocketFactory('A', bus) })
  useCanvasRealtimeSync({ getWorkflowId: () => 'wf-x', store: storeB, api: fakeApi, socketFactory: makeSocketFactory('B', bus) })
  useCanvasRealtimeSync({ getWorkflowId: () => 'wf-x', store: storeC, api: fakeApi, socketFactory: makeSocketFactory('C', bus) })

  bus.broadcastNodePatch('node-9', { id: 'node-9', data: { value: 42 } }, 5, 'A')
  assert.equal(storeA.nodes.length, 0, '发起方 A 应被抑制')
  assert.equal(storeB.nodes.length, 1)
  assert.equal(storeC.nodes.length, 1)
  assert.equal(storeB.nodes[0].data.value, 42)
  assert.equal(storeC.nodes[0].data.value, 42)
})

test('远端 delete op 触发 store.removeNode', () => {
  const bus = new FakeSocketBus()
  const storeA = makeStore([{ id: 'x' }])
  const storeB = makeStore([{ id: 'x' }])
  const fakeApi = { async getWorkflowManifest() { return { nodeIndex: [] } }, async getWorkflowNodesBatch() { return { nodes: [] } } }
  useCanvasRealtimeSync({ getWorkflowId: () => 'wf-x', store: storeA, api: fakeApi, socketFactory: makeSocketFactory('A', bus) })
  useCanvasRealtimeSync({ getWorkflowId: () => 'wf-x', store: storeB, api: fakeApi, socketFactory: makeSocketFactory('B', bus) })

  bus.broadcastOps([{ op: 'delete', target: 'node', payload: { nodeId: 'x' } }], 'A')
  assert.deepEqual(storeB.removed, ['x'])
})

test('resync 时拉 manifest 并补齐落后/缺失节点', async () => {
  const bus = new FakeSocketBus()
  const storeB = makeStore([
    { id: 'a', data: { __version: 1 } },
    { id: 'b', data: { __version: 1 } }
  ])
  const apiB = {
    async getWorkflowManifest() {
      return {
        nodeIndex: [
          { id: 'a', version: 1 },          // local 已最新
          { id: 'b', version: 4 },          // 落后
          { id: 'c', version: 2 }           // 缺失
        ]
      }
    },
    async getWorkflowNodesBatch(_wf, ids) {
      const map = {
        b: { id: 'b', data: { __version: 4, hi: 'b' } },
        c: { id: 'c', data: { __version: 2, hi: 'c' } }
      }
      return { nodes: ids.map(id => map[id]).filter(Boolean) }
    }
  }
  useCanvasRealtimeSync({
    getWorkflowId: () => 'wf-x', store: storeB, api: apiB,
    socketFactory: makeSocketFactory('B', bus)
  })

  bus.triggerResyncAll()
  await new Promise(r => setTimeout(r, 10))

  const ids = storeB.nodes.map(n => n.id).sort()
  assert.deepEqual(ids, ['a', 'b', 'c'])
  const b = storeB.nodes.find(n => n.id === 'b')
  const c = storeB.nodes.find(n => n.id === 'c')
  assert.equal(b.data.hi, 'b')
  assert.equal(c.data.hi, 'c')
})
