/**
 * incrementalWriter 单元测试
 *
 * 覆盖：
 *   - 500ms 窗口内同节点 update 合并
 *   - 多种 op 混合：add/update/delete 不会跨类型合并
 *   - flush 成功 -> 队列清空
 *   - flush 失败 -> 重试指数退避
 *   - 重试耗尽 -> 落 IndexedDB（内存 fallback）
 *   - 离线 -> 直接落 IndexedDB，不发请求
 *   - replayPersisted 重连后回放
 *   - 同 id update 合并 baseVersion 保留最早
 *
 * 运行：node bananaapiboard/src/stores/canvas/incrementalWriter.test.mjs
 */
import { strict as assert } from 'node:assert'
import { createIncrementalWriter, WriterStorage, __test__ } from './incrementalWriter.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// In-memory storage（避免依赖 IndexedDB）
function makeStorage() {
  return new WriterStorage()
}

function makeApi({ failTimes = 0, captureCalls = true } = {}) {
  const calls = []
  let remainingFails = failTimes
  return {
    calls,
    postWorkflowOps: async (workflowId, ops) => {
      if (captureCalls) calls.push({ workflowId, ops: ops.map(o => ({ ...o })) })
      if (remainingFails > 0) {
        remainingFails--
        throw new Error('mock 5xx')
      }
      return { workflowId, applied: ops.map(o => o._id), results: ops.map(() => ({ ok: true })) }
    }
  }
}

// ---------- coalesceOps 纯函数 ----------
{
  const { coalesceOps } = __test__
  const r = coalesceOps([
    { op: 'update', target: 'node', id: 'a', payload: { x: 1 }, ts: 1, baseVersion: 1 },
    { op: 'update', target: 'node', id: 'a', payload: { y: 2 }, ts: 2, baseVersion: 2 },
    { op: 'update', target: 'node', id: 'b', payload: { x: 5 }, ts: 3 },
    { op: 'add', target: 'node', id: 'c', payload: { name: 'c' }, ts: 4 },
    { op: 'update', target: 'edge', id: 'a', payload: { src: 'x' }, ts: 5 } // edge:a 与 node:a 不冲突
  ])
  assert.equal(r.length, 4, '同 node:a 两条 update 合成一条')
  const aOp = r.find(o => o.op === 'update' && o.target === 'node' && o.id === 'a')
  assert.deepEqual(aOp.payload, { x: 1, y: 2 })
  assert.equal(aOp.ts, 2)
  assert.equal(aOp.baseVersion, 1, '合并应保留最早 baseVersion')
}

// ---------- enqueue + flush 成功 ----------
{
  const storage = makeStorage()
  const api = makeApi()
  const w = createIncrementalWriter({
    api, storage,
    workflowIdRef: () => 'wf-1',
    options: { debounceMs: 30 }
  })
  w.enqueue({ op: 'update', target: 'node', id: 'a', payload: { x: 1 } })
  w.enqueue({ op: 'update', target: 'node', id: 'a', payload: { y: 2 } })
  w.enqueue({ op: 'add', target: 'node', id: 'b', payload: { name: 'b' } })
  await sleep(100)
  assert.equal(api.calls.length, 1)
  assert.equal(api.calls[0].ops.length, 2, '同 a 合并 + 单独 b')
  const aOp = api.calls[0].ops.find(o => o.id === 'a')
  assert.deepEqual(aOp.payload, { x: 1, y: 2 })
  assert.equal(w.pendingCount(), 0)
}

// ---------- 失败 1 次后成功 ----------
{
  const storage = makeStorage()
  const api = makeApi({ failTimes: 1 })
  const flushResults = []
  const errors = []
  const w = createIncrementalWriter({
    api, storage,
    workflowIdRef: () => 'wf-2',
    options: {
      debounceMs: 10,
      maxRetry: 3,
      backoffBaseMs: 30,
      onFlushResult: r => flushResults.push(r),
      onError: e => errors.push(e.message)
    }
  })
  w.enqueue({ op: 'add', target: 'node', id: 'a', payload: { name: 'a' } })
  await sleep(300)
  assert.equal(api.calls.length, 2, '应重试 2 次（首次失败 + 重试成功）')
  assert.equal(flushResults.length, 1)
  assert.equal(flushResults[0].ok, true)
  assert.equal(errors.length, 0)
}

// ---------- 重试耗尽 -> 落 storage ----------
{
  const storage = makeStorage()
  const api = makeApi({ failTimes: 100 })
  const errors = []
  const w = createIncrementalWriter({
    api, storage,
    workflowIdRef: () => 'wf-3',
    options: {
      debounceMs: 10,
      maxRetry: 1,
      backoffBaseMs: 30,
      onError: e => errors.push(e.message)
    }
  })
  w.enqueue({ op: 'add', target: 'node', id: 'x', payload: { name: 'x' } })
  await sleep(300)
  assert.equal(api.calls.length, 2)
  assert.equal(errors.length, 1, '应触发 onError')
  const persisted = await storage.load('wf-3')
  assert.equal(persisted.length, 1, '失败 ops 应落 storage')
  assert.equal(persisted[0].id, 'x')
}

// ---------- 离线 -> 直接落 storage，不打 API ----------
{
  const storage = makeStorage()
  const api = makeApi()
  const w = createIncrementalWriter({
    api, storage,
    workflowIdRef: () => 'wf-4',
    options: {
      debounceMs: 10,
      isOnline: () => false
    }
  })
  w.enqueue({ op: 'update', target: 'node', id: 'a', payload: { x: 1 } })
  await sleep(50)
  assert.equal(api.calls.length, 0, '离线不应打 API')
  const persisted = await storage.load('wf-4')
  assert.equal(persisted.length, 1)
}

// ---------- 重连后 replayPersisted ----------
{
  const storage = makeStorage()
  await storage.save('wf-5', [
    { _id: '1', op: 'add', target: 'node', id: 'a', payload: { name: 'a' }, ts: 1 },
    { _id: '2', op: 'update', target: 'node', id: 'a', payload: { x: 9 }, ts: 2 }
  ])
  const api = makeApi()
  const w = createIncrementalWriter({
    api, storage,
    workflowIdRef: () => 'wf-5',
    options: { debounceMs: 10 }
  })
  const r = await w.replayPersisted()
  assert.equal(r.ok, true)
  assert.equal(r.replayed, 2)
  assert.equal(api.calls.length, 1)
  const left = await storage.load('wf-5')
  assert.equal(left.length, 0, '回放成功后 storage 应清空')
}

// ---------- maxBatch：超出部分排到下一轮 ----------
{
  const storage = makeStorage()
  const api = makeApi()
  const w = createIncrementalWriter({
    api, storage,
    workflowIdRef: () => 'wf-6',
    options: { debounceMs: 10, maxBatch: 2 }
  })
  for (let i = 0; i < 5; i++) {
    w.enqueue({ op: 'add', target: 'node', id: `n${i}`, payload: { name: `n${i}` } })
  }
  await sleep(200)
  // 5 个 ops，每轮最多 2 个 -> 应至少 3 次调用
  assert.ok(api.calls.length >= 3, `至少 3 次调用, got ${api.calls.length}`)
  const all = api.calls.flatMap(c => c.ops.map(o => o.id))
  assert.deepEqual(all.sort(), ['n0', 'n1', 'n2', 'n3', 'n4'])
}

// ---------- enqueue 期间另一次 flush 进行中 ----------
{
  const storage = makeStorage()
  let resolveFirst
  const api = {
    calls: 0,
    postWorkflowOps: (wfId, ops) => {
      api.calls++
      return new Promise(resolve => {
        if (api.calls === 1) {
          resolveFirst = () => resolve({ applied: ops.map(o => o._id), results: [] })
        } else {
          resolve({ applied: ops.map(o => o._id), results: [] })
        }
      })
    }
  }
  const w = createIncrementalWriter({
    api, storage,
    workflowIdRef: () => 'wf-7',
    options: { debounceMs: 10 }
  })
  w.enqueue({ op: 'add', target: 'node', id: 'a', payload: {} })
  await sleep(20)
  // 第一次 flush 进行中，再次 enqueue
  w.enqueue({ op: 'add', target: 'node', id: 'b', payload: {} })
  resolveFirst() // 完成第一次
  await sleep(50)
  // 第二次应该自动 schedule 后发出
  assert.equal(api.calls, 2)
}

console.log('incrementalWriter unit tests passed')
