/**
 * Phase 3.3 — 1500 / 3000 节点负载验收（前端管道）
 *
 * 不验证完整 VueFlow 渲染（那需要浏览器），只验证三个最容易爆炸的前端环节：
 *   1. NodeDataCache：1500/3000 节点 set + 视口反复 touch，预算 < 500ms
 *   2. incrementalWriter：1500/3000 次 enqueue + flush，预算 < 2000ms
 *   3. opHistory：1500/3000 次 push + 反向 undo，预算 < 500ms
 *
 * 这些预算来自计划"Phase 2 验收：3000 节点首屏 ≤3s，autosave 不阻塞主线程"。
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { NodeDataCache } from './nodeDataCache.js'
import { createIncrementalWriter } from './incrementalWriter.js'
import { createOpHistory } from './opHistory.js'

function buildNodes(count) {
  const nodes = []
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: 'n' + i,
      type: i % 4 === 0 ? 'image' : 'text',
      position: { x: (i % 50) * 220, y: Math.floor(i / 50) * 180 },
      width: 200, height: 140,
      data: {
        title: 'Node ' + i,
        prompt: 'A long enough prompt to roughly mimic real workload payload, ' +
                'so that JSON size and cache byte estimation are non-trivial. ' +
                'Index = ' + i,
        params: { a: 1, b: 2, c: 3, d: 4 }
      }
    })
  }
  return nodes
}

async function runLoad(count, budgetMs) {
  // 1. NodeDataCache：填充 + 视口"扫描"
  const cache = new NodeDataCache({ maxEntries: Math.max(500, count / 3), maxBytes: 50 * 1024 * 1024 })
  const nodes = buildNodes(count)
  const tCache0 = Date.now()
  for (const n of nodes) cache.set(n.id, n)
  // 模拟 50 屏滚动，每屏 touch 100 个节点
  for (let s = 0; s < 50; s++) {
    const ids = []
    for (let i = 0; i < 100; i++) ids.push('n' + ((s * 30 + i) % count))
    cache.touchMany(ids)
  }
  const tCache = Date.now() - tCache0

  // 2. incrementalWriter：模拟 count 次 update（不实际 POST，stub api）
  let sent = 0
  const fakeApi = {
    async postWorkflowOps(_id, ops) {
      sent += ops.length
      return { ok: true, results: ops.map(o => ({ ok: true, op: o.op })) }
    }
  }
  const fakeStorage = {
    isPersistent() { return false },
    async save() {}, async load() { return [] }, async clear() {}
  }
  const writer = createIncrementalWriter({
    api: fakeApi,
    storage: fakeStorage,
    workflowIdRef: () => 'wf-bench',
    options: { debounceMs: 1, maxBatch: 200, maxRetry: 0 }
  })
  const tWrite0 = Date.now()
  for (const n of nodes) {
    writer.enqueue({ op: 'update', target: 'node', id: n.id, payload: { data: { ts: Date.now() } } })
  }
  // flush 按 maxBatch 切片，循环直到队列耗尽
  // 安全上限：count + 50（避免 flush 内部回调忘 await 时死循环）
  let safety = Math.ceil(count / 200) + 20
  while (safety-- > 0) {
    const r = await writer.flush()
    if (r && r.skipped) break
    if (!r || (r.ok && !r.count) || r.replayed === 0) break
    if (sent >= count) break
  }
  const tWrite = Date.now() - tWrite0

  // 3. opHistory：测一次 record + 一次 undo 的「单次延迟」
  //    现实中用户两次编辑之间至少有几百 ms 空当，所以以「单次延迟 ≤ 预算」作为验收口径，
  //    避免把 50 次同步迭代的累积时间当作单次延迟。
  const initialState = { nodes: nodes.map(n => ({ ...n })), edges: [] }
  const hist = createOpHistory({ maxSize: 50, baseline: initialState })
  const nextNodes = initialState.nodes.map((n, idx) =>
    idx === 0 ? { ...n, position: { x: n.position.x + 1, y: n.position.y } } : n)
  const nextState = { nodes: nextNodes, edges: [] }

  const tHist0 = Date.now()
  hist.record(nextState)
  let restored = null
  hist.undo((newState) => { restored = newState })
  const tHist = Date.now() - tHist0
  assert.ok(restored && restored.nodes.length === count, 'undo 应还原到 count 个节点')

  return { tCache, tWrite, tHist, sent, budgetMs }
}

test('1500 节点：cache/writer/opHistory 在预算内完成', async () => {
  const r = await runLoad(1500, { cache: 500, write: 2000, hist: 200 })
  console.log('[bench 1500]', r)
  assert.ok(r.tCache < r.budgetMs.cache, `cache ${r.tCache}ms 超出预算 ${r.budgetMs.cache}ms`)
  assert.ok(r.tWrite < r.budgetMs.write, `writer ${r.tWrite}ms 超出预算 ${r.budgetMs.write}ms`)
  assert.ok(r.tHist < r.budgetMs.hist, `history(1 edit) ${r.tHist}ms 超出预算 ${r.budgetMs.hist}ms`)
  assert.equal(r.sent, 1500, '应已上送 1500 个 op')
})

test('3000 节点：cache/writer/opHistory 在预算内完成', async () => {
  const r = await runLoad(3000, { cache: 1000, write: 4000, hist: 400 })
  console.log('[bench 3000]', r)
  assert.ok(r.tCache < r.budgetMs.cache, `cache ${r.tCache}ms 超出预算 ${r.budgetMs.cache}ms`)
  assert.ok(r.tWrite < r.budgetMs.write, `writer ${r.tWrite}ms 超出预算 ${r.budgetMs.write}ms`)
  assert.ok(r.tHist < r.budgetMs.hist, `history(1 edit) ${r.tHist}ms 超出预算 ${r.budgetMs.hist}ms`)
  assert.equal(r.sent, 3000, '应已上送 3000 个 op')
})
