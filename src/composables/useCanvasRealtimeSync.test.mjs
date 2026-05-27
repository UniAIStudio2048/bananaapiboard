/**
 * useCanvasRealtimeSync 契约测试：
 *  - WebSocket 收到 ops/node_patched 时调用 store.applyIncrementalNode
 *  - 重连成功（onResync）时拉 manifest 并补齐缺失/落后版本的节点
 *  - workflowId 切换会断旧连接、建新连接
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { useCanvasRealtimeSync } from './useCanvasRealtimeSync.js'

function makeFakeStore(initialNodes = []) {
  const nodes = [...initialNodes]
  return {
    nodes,
    applied: [],
    removed: [],
    applyIncrementalNode(node) {
      this.applied.push(node)
      const idx = nodes.findIndex(n => n.id === node.id)
      if (idx >= 0) nodes[idx] = { ...nodes[idx], ...node }
      else nodes.push(node)
    },
    removeNode(id) { this.removed.push(id) }
  }
}

function makeFakeApi(manifest, nodesById = {}) {
  return {
    async getWorkflowManifest() { return manifest },
    async getWorkflowNodesBatch(_id, ids) {
      return { nodes: ids.map(id => nodesById[id]).filter(Boolean) }
    }
  }
}

function makeFakeSocketFactory() {
  const handlers = {}
  const instance = {
    connect: () => {},
    disconnect: () => {},
    clientId: 'CID',
    __trigger(name, ...args) {
      if (typeof handlers[name] === 'function') handlers[name](...args)
    }
  }
  const factory = (opts) => {
    handlers.onOps = opts.onOps
    handlers.onNodePatched = opts.onNodePatched
    handlers.onResync = opts.onResync
    handlers.onHello = opts.onHello
    handlers.onStateChange = opts.onStateChange
    handlers.onError = opts.onError
    return instance
  }
  factory.instance = instance
  factory.handlers = handlers
  return factory
}

test('node_patched -> applyIncrementalNode', () => {
  const store = makeFakeStore()
  const factory = makeFakeSocketFactory()
  const api = makeFakeApi({ nodeIndex: [] })
  useCanvasRealtimeSync({
    getWorkflowId: () => 'wf-1',
    store,
    api,
    socketFactory: factory
  })

  factory.instance.__trigger('onNodePatched', 'n9', { id: 'n9', data: { foo: 1 } }, 5, 'X')
  assert.equal(store.applied.length, 1)
  assert.equal(store.applied[0].id, 'n9')
  assert.equal(store.applied[0].data.foo, 1)
})

test('ops update 转换为 applyIncrementalNode, delete 调用 removeNode', () => {
  const store = makeFakeStore()
  const factory = makeFakeSocketFactory()
  const api = makeFakeApi({ nodeIndex: [] })
  useCanvasRealtimeSync({
    getWorkflowId: () => 'wf-1',
    store,
    api,
    socketFactory: factory
  })

  factory.instance.__trigger('onOps', [
    { op: 'update', target: 'node', payload: { id: 'a', data: { x: 1 } } },
    { op: 'add',    target: 'node', payload: { id: 'b', data: { y: 2 } } },
    { op: 'delete', target: 'node', payload: { nodeId: 'c' } }
  ], 'PEER')

  const ids = store.applied.map(n => n.id)
  assert.deepEqual(ids, ['a', 'b'])
  assert.deepEqual(store.removed, ['c'])
})

test('onResync 拉 manifest 并补齐缺失节点', async () => {
  const store = makeFakeStore([
    { id: 'a', data: { __version: 1 } },
    { id: 'b', data: { __version: 3 } }
  ])
  const manifest = {
    nodeIndex: [
      { id: 'a', version: 1 },        // 本地已最新
      { id: 'b', version: 5 },        // 落后
      { id: 'c', version: 2 }         // 缺失
    ]
  }
  const remoteNodes = {
    b: { id: 'b', data: { __version: 5, foo: 'updated' } },
    c: { id: 'c', data: { __version: 2, bar: 'new' } }
  }
  const api = makeFakeApi(manifest, remoteNodes)
  const factory = makeFakeSocketFactory()
  useCanvasRealtimeSync({
    getWorkflowId: () => 'wf-1',
    store,
    api,
    socketFactory: factory
  })

  factory.instance.__trigger('onResync')
  await new Promise(r => setTimeout(r, 5)) // microtask flush

  // 'a' 没拉，'b' 'c' 应被 apply
  const appliedIds = store.applied.map(n => n.id).sort()
  assert.deepEqual(appliedIds, ['b', 'c'])
})

test('onResync 对超过 BATCH 的节点分批 fetch', async () => {
  // 构造 70 个落后节点（BATCH=30 -> 应该调用 3 次）
  const indexEntries = []
  const remoteNodes = {}
  const initialLocal = []
  for (let i = 0; i < 70; i++) {
    const id = 'n' + i
    indexEntries.push({ id, version: 2 })
    remoteNodes[id] = { id, data: { __version: 2 } }
    initialLocal.push({ id, data: { __version: 1 } })
  }
  const store = makeFakeStore(initialLocal)
  let batchCalls = 0
  const api = {
    async getWorkflowManifest() { return { nodeIndex: indexEntries } },
    async getWorkflowNodesBatch(_id, ids) {
      batchCalls += 1
      return { nodes: ids.map(id => remoteNodes[id]) }
    }
  }
  const factory = makeFakeSocketFactory()
  useCanvasRealtimeSync({
    getWorkflowId: () => 'wf-1',
    store,
    api,
    socketFactory: factory
  })

  factory.instance.__trigger('onResync')
  await new Promise(r => setTimeout(r, 10))

  assert.equal(batchCalls, 3, '70/30 -> 3 个 batch')
  assert.equal(store.applied.length, 70, '所有 70 个节点应被 apply')
})

test('store 必须实现 applyIncrementalNode 否则抛错', () => {
  assert.throws(() => useCanvasRealtimeSync({ getWorkflowId: () => 'x', store: {} }),
    /applyIncrementalNode required/)
})

test('connect 在缺失 workflowId 时是 no-op', () => {
  const store = makeFakeStore()
  const factory = makeFakeSocketFactory()
  let connected = false
  factory.instance.connect = () => { connected = true }
  const sync = useCanvasRealtimeSync({
    getWorkflowId: () => null,
    store,
    api: makeFakeApi({ nodeIndex: [] }),
    socketFactory: factory,
    autoConnect: true
  })
  assert.equal(connected, false)
  sync.connect() // 仍是 no-op
  assert.equal(connected, false)
})

test('disconnect 后再 connect 重建 socket', () => {
  const store = makeFakeStore()
  let count = 0
  const factory = (opts) => {
    count += 1
    return { connect: () => {}, disconnect: () => {}, clientId: 'X' + count }
  }
  const sync = useCanvasRealtimeSync({
    getWorkflowId: () => 'wf-1',
    store,
    api: makeFakeApi({ nodeIndex: [] }),
    socketFactory: factory,
    autoConnect: true
  })
  assert.equal(count, 1)
  sync.disconnect()
  sync.connect()
  assert.equal(count, 2)
})
