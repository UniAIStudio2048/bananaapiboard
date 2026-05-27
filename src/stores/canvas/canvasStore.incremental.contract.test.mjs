/**
 * canvasStore + incrementalLoader 集成契约测试
 *
 * 这是端到端契约：
 *   1) loadWorkflowManifest 把 Shell 节点喂进 store
 *   2) loader.ensureLoaded 触发批量请求
 *   3) 拉回来 -> applyIncrementalNode -> store 节点 _shellLoading=false 且 data 合并
 *   4) 节点写入 NodeDataCache
 *
 * 不依赖 Vue/Pinia 运行时——直接 mock 它们的 API 表面，校验业务路径。
 *
 * 运行：node bananaapiboard/src/stores/canvas/canvasStore.incremental.contract.test.mjs
 */
import { strict as assert } from 'node:assert'
import { NodeDataCache } from './nodeDataCache.js'
import { createIncrementalLoader } from '../../composables/useIncrementalLoader.js'

// 极简 reactive 替身：用普通对象，按 store 的契约 setter
function makeStore() {
  const state = {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  }

  function loadWorkflowManifest(manifest) {
    const shells = manifest.nodeIndex.map(item => ({
      id: item.id,
      type: item.type || 'image',
      position: { x: Number(item.x) || 0, y: Number(item.y) || 0 },
      data: { _shellLoading: true, _baseVersion: item.version || 1 },
      ...(item.w != null ? { width: Number(item.w) } : {}),
      ...(item.h != null ? { height: Number(item.h) } : {})
    }))
    state.nodes = shells
    const ids = new Set(shells.map(n => n.id))
    state.edges = (manifest.edgeIndex || [])
      .filter(e => ids.has(e.source) && ids.has(e.target))
      .map(e => ({ id: e.id, source: e.source, target: e.target }))
    if (manifest.viewport) state.viewport = manifest.viewport
  }

  function applyIncrementalNode(node) {
    const idx = state.nodes.findIndex(n => n.id === node.id)
    if (idx < 0) return
    const target = state.nodes[idx]
    state.nodes[idx] = {
      ...target,
      data: {
        ...(target.data || {}),
        ...(node.data || {}),
        _shellLoading: false,
        _baseVersion: node.version || target.data?._baseVersion || 1
      }
    }
  }

  return { state, loadWorkflowManifest, applyIncrementalNode }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Test 1: 完整链路
{
  const manifest = {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodeIndex: [
      { id: 'a', type: 'image', x: 10, y: 20, w: 100, h: 80, version: 1 },
      { id: 'b', type: 'text', x: 200, y: 300, version: 2 },
      { id: 'c', type: 'video', x: 50, y: 50, version: 1 }
    ],
    edgeIndex: [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'missing' } // 应被过滤
    ]
  }

  const store = makeStore()
  const cache = new NodeDataCache()
  const api = {
    calls: 0,
    getWorkflowNodesBatch: async (workflowId, ids) => {
      api.calls++
      return {
        workflowId,
        nodes: ids.map(id => ({
          id,
          type: 'image',
          data: { url: `cdn://${id}.jpg`, label: `node-${id}` },
          version: 5
        })),
        missing: []
      }
    }
  }

  // 1) manifest 加载
  store.loadWorkflowManifest(manifest)
  assert.equal(store.state.nodes.length, 3)
  assert.equal(store.state.nodes[0].data._shellLoading, true)
  assert.equal(store.state.edges.length, 1, 'missing 目标的边应被过滤')

  const loader = createIncrementalLoader({
    api,
    cache,
    applyNode: store.applyIncrementalNode,
    workflowIdRef: () => 'wf-1',
    batchMs: 10
  })

  // 2) 用户视口包含 a, b -> 触发批量请求
  loader.ensureLoaded(['a', 'b'])
  await sleep(50)
  assert.equal(api.calls, 1, '应只发一次 batch 请求')
  assert.equal(cache.has('a'), true)
  assert.equal(cache.has('b'), true)
  assert.equal(cache.has('c'), false, 'c 未在视口，不应被加载')

  // 3) store 节点已合并 data
  const nodeA = store.state.nodes.find(n => n.id === 'a')
  assert.equal(nodeA.data._shellLoading, false)
  assert.equal(nodeA.data.url, 'cdn://a.jpg')
  assert.equal(nodeA.data._baseVersion, 5)

  // 4) 二次访问命中缓存
  loader.ensureLoaded(['a'])
  await sleep(30)
  assert.equal(api.calls, 1, '命中缓存不应再次请求')

  // 5) 视口移到 c
  loader.ensureLoaded(['c'])
  await sleep(50)
  assert.equal(api.calls, 2)
  assert.equal(cache.has('c'), true)
  const nodeC = store.state.nodes.find(n => n.id === 'c')
  assert.equal(nodeC.data._shellLoading, false)
}

console.log('canvasStore.incremental.contract test passed')
