/**
 * createIncrementalLoader 单元测试
 *
 * 覆盖：
 *   - ensureLoaded：未命中 -> 进入 pending 并触发请求
 *   - ensureLoaded：命中缓存 -> 不发请求
 *   - 250ms 窗口内多次 ensureLoaded 合并成一次 batch
 *   - 超过 maxBatch 时多余 ids 进入下一轮
 *   - 拉回来的节点写入 cache 并调用 applyNode
 *   - 失败重试 + 重试耗尽抛 onError
 *
 * 运行：node bananaapiboard/src/composables/useIncrementalLoader.test.mjs
 */
import { strict as assert } from 'node:assert'
import { NodeDataCache } from '../stores/canvas/nodeDataCache.js'
import { createIncrementalLoader } from './useIncrementalLoader.js'

function makeApi({ failTimes = 0 } = {}) {
  const calls = []
  let remainingFailures = failTimes
  return {
    calls,
    getWorkflowNodesBatch: async (workflowId, ids) => {
      calls.push({ workflowId, ids: [...ids] })
      if (remainingFailures > 0) {
        remainingFailures--
        throw new Error('mock network failure')
      }
      return {
        workflowId,
        nodes: ids.map(id => ({ id, type: 'image', data: { id, url: `u/${id}` }, version: 1 })),
        missing: []
      }
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 1) 未命中 -> 触发 batch，回调写入 cache & applyNode
{
  const cache = new NodeDataCache()
  const api = makeApi()
  const applied = []
  const loader = createIncrementalLoader({
    api,
    cache,
    applyNode: n => applied.push(n.id),
    workflowIdRef: () => 'wf-1',
    batchMs: 10
  })
  loader.ensureLoaded(['a', 'b'])
  await sleep(50)
  assert.equal(api.calls.length, 1, '应发一次 batch 请求')
  assert.deepEqual(api.calls[0].ids.sort(), ['a', 'b'])
  assert.equal(cache.has('a'), true)
  assert.equal(cache.has('b'), true)
  assert.deepEqual(applied.sort(), ['a', 'b'])
}

// 2) 命中缓存 -> 不再发请求
{
  const cache = new NodeDataCache()
  cache.set('a', { id: 'a', data: { x: 1 }, version: 1 })
  const api = makeApi()
  const loader = createIncrementalLoader({
    api,
    cache,
    applyNode: () => {},
    workflowIdRef: () => 'wf-1',
    batchMs: 10
  })
  loader.ensureLoaded(['a'])
  await sleep(30)
  assert.equal(api.calls.length, 0, '命中缓存应不发请求')
}

// 3) 多次 ensureLoaded 在窗口内合并成一次
{
  const cache = new NodeDataCache()
  const api = makeApi()
  const loader = createIncrementalLoader({
    api,
    cache,
    applyNode: () => {},
    workflowIdRef: () => 'wf-1',
    batchMs: 30
  })
  loader.ensureLoaded(['a'])
  loader.ensureLoaded(['b'])
  loader.ensureLoaded(['c', 'a']) // a 已 pending
  await sleep(80)
  assert.equal(api.calls.length, 1, '窗口内多次调用应合并')
  assert.deepEqual(api.calls[0].ids.sort(), ['a', 'b', 'c'])
}

// 4) 超过 maxBatch 的 ids 推到下一轮
{
  const cache = new NodeDataCache()
  const api = makeApi()
  const loader = createIncrementalLoader({
    api,
    cache,
    applyNode: () => {},
    workflowIdRef: () => 'wf-1',
    batchMs: 10,
    maxBatch: 2
  })
  loader.ensureLoaded(['a', 'b', 'c', 'd', 'e'])
  await sleep(150) // 留出至少 2 轮 batch 时间
  assert.ok(api.calls.length >= 2, '超出 maxBatch 应分多次发出')
  const allRequested = api.calls.flatMap(c => c.ids)
  assert.deepEqual(allRequested.sort(), ['a', 'b', 'c', 'd', 'e'])
}

// 5) 失败 + 重试：前 2 次失败，第 3 次成功
{
  const cache = new NodeDataCache()
  const api = makeApi({ failTimes: 2 })
  const errors = []
  const loader = createIncrementalLoader({
    api,
    cache,
    applyNode: () => {},
    workflowIdRef: () => 'wf-1',
    batchMs: 10,
    maxRetry: 3,
    onError: err => errors.push(err.message)
  })
  loader.ensureLoaded(['a'])
  await sleep(2000)
  assert.equal(api.calls.length, 3, '应重试 3 次')
  assert.equal(cache.has('a'), true)
  assert.equal(errors.length, 0, '最终成功不应触发 onError')
}

// 6) 重试耗尽 -> 触发 onError
{
  const cache = new NodeDataCache()
  const api = makeApi({ failTimes: 5 })
  const errors = []
  const loader = createIncrementalLoader({
    api,
    cache,
    applyNode: () => {},
    workflowIdRef: () => 'wf-1',
    batchMs: 10,
    maxRetry: 1,
    onError: err => errors.push(err.message)
  })
  loader.ensureLoaded(['a'])
  await sleep(2000)
  assert.equal(cache.has('a'), false)
  assert.equal(errors.length, 1, '重试耗尽应抛 onError')
  assert.match(errors[0], /mock network failure/)
}

console.log('useIncrementalLoader unit tests passed')
