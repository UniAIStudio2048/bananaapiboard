/**
 * opHistory 单元测试
 * node bananaapiboard/src/stores/canvas/opHistory.test.mjs
 */
import { strict as assert } from 'node:assert'
import { computeDiff, applyDiff, createOpHistory } from './opHistory.js'

function snap(nodes, edges = []) {
  return {
    nodes: nodes.map(n => ({ ...n })),
    edges: edges.map(e => ({ ...e }))
  }
}

// --- computeDiff 基本能力 ---
{
  const prev = snap([{ id: 'a', x: 0 }, { id: 'b', x: 10 }])
  const next = snap([{ id: 'a', x: 5 }, { id: 'c', x: 20 }])
  const diff = computeDiff(prev, next)
  assert.equal(diff.nodes.added.length, 1, 'c 被添加')
  assert.equal(diff.nodes.added[0].id, 'c')
  assert.equal(diff.nodes.removed.length, 1, 'b 被删除')
  assert.equal(diff.nodes.removed[0].id, 'b')
  assert.equal(diff.nodes.changed.length, 1, 'a 被修改')
  assert.equal(diff.nodes.changed[0].id, 'a')
  assert.equal(diff.nodes.changed[0].before.x, 0)
  assert.equal(diff.nodes.changed[0].after.x, 5)
}

// --- applyDiff 正向应用 ---
{
  const prev = snap([{ id: 'a', x: 0 }, { id: 'b', x: 10 }])
  const next = snap([{ id: 'a', x: 5 }, { id: 'c', x: 20 }])
  const diff = computeDiff(prev, next)
  const applied = applyDiff(prev, diff, 'forward')
  const ids = applied.nodes.map(n => n.id).sort()
  assert.deepEqual(ids, ['a', 'c'])
  const a = applied.nodes.find(n => n.id === 'a')
  assert.equal(a.x, 5)
}

// --- applyDiff 反向应用 ---
{
  const prev = snap([{ id: 'a', x: 0 }, { id: 'b', x: 10 }])
  const next = snap([{ id: 'a', x: 5 }, { id: 'c', x: 20 }])
  const diff = computeDiff(prev, next)
  const reverted = applyDiff(next, diff, 'backward')
  const ids = reverted.nodes.map(n => n.id).sort()
  assert.deepEqual(ids, ['a', 'b'])
  const a = reverted.nodes.find(n => n.id === 'a')
  assert.equal(a.x, 0)
}

// --- createOpHistory record / undo / redo 主流程 ---
{
  const history = createOpHistory({ maxSize: 10 })
  const s0 = snap([{ id: 'a', x: 0 }])
  const s1 = snap([{ id: 'a', x: 1 }])
  const s2 = snap([{ id: 'a', x: 2 }, { id: 'b', x: 100 }])

  // 第一次 record 仅设置基线
  const r0 = history.record(s0)
  assert.equal(r0.recorded, false, '第一次 record 仅建 baseline')
  assert.equal(history.length, 0)
  assert.equal(history.canUndo, false)

  history.record(s1)
  history.record(s2)
  assert.equal(history.length, 2)
  assert.equal(history.canUndo, true)
  assert.equal(history.canRedo, false)

  // undo 回到 s1
  let current = s2
  history.undo(state => { current = state })
  assert.equal(current.nodes.length, 1, 'undo 回到只有 a 的状态')
  assert.equal(current.nodes[0].x, 1)
  assert.equal(history.canRedo, true)

  // undo 再回到 s0
  history.undo(state => { current = state })
  assert.equal(current.nodes[0].x, 0)
  assert.equal(history.canUndo, false)

  // redo 前进到 s1
  history.redo(state => { current = state })
  assert.equal(current.nodes[0].x, 1)
  assert.equal(history.canRedo, true)

  // redo 前进到 s2
  history.redo(state => { current = state })
  assert.equal(current.nodes.length, 2)
  const a = current.nodes.find(n => n.id === 'a')
  const b = current.nodes.find(n => n.id === 'b')
  assert.equal(a.x, 2)
  assert.equal(b.x, 100)
  assert.equal(history.canRedo, false)
}

// --- 无变化时 record 跳过 ---
{
  const history = createOpHistory()
  const s = snap([{ id: 'a', x: 0 }])
  history.record(s)
  const r = history.record(snap([{ id: 'a', x: 0 }]))
  assert.equal(r.recorded, false)
  assert.equal(r.reason, 'no-changes')
  assert.equal(history.length, 0)
}

// --- 截断未来栈 ---
{
  const history = createOpHistory()
  history.record(snap([{ id: 'a', x: 0 }]))
  history.record(snap([{ id: 'a', x: 1 }]))
  history.record(snap([{ id: 'a', x: 2 }]))
  history.record(snap([{ id: 'a', x: 3 }]))
  assert.equal(history.length, 3)

  let current = snap([{ id: 'a', x: 3 }])
  history.undo(state => { current = state })
  history.undo(state => { current = state })
  assert.equal(history.canRedo, true)

  // 当前是 x=1，再 record 新状态应丢弃 redo 路径
  history.record(snap([{ id: 'a', x: 99 }]))
  assert.equal(history.canRedo, false)
  assert.equal(history.length, 2, '截断未来栈后只剩前 2 条 diff + 当前 diff')
}

// --- maxSize 限制 ---
{
  const history = createOpHistory({ maxSize: 3 })
  history.record(snap([{ id: 'a', x: 0 }]))
  history.record(snap([{ id: 'a', x: 1 }]))
  history.record(snap([{ id: 'a', x: 2 }]))
  history.record(snap([{ id: 'a', x: 3 }]))
  history.record(snap([{ id: 'a', x: 4 }]))
  assert.ok(history.length <= 3, 'maxSize 必须生效')
}

// --- edges 也要进 diff ---
{
  const prev = snap([{ id: 'a' }], [{ id: 'e1', source: 'a', target: 'b' }])
  const next = snap([{ id: 'a' }], [{ id: 'e2', source: 'a', target: 'c' }])
  const diff = computeDiff(prev, next)
  assert.equal(diff.edges.added.length, 1)
  assert.equal(diff.edges.removed.length, 1)
}

// --- clear & trim ---
{
  const history = createOpHistory()
  history.record(snap([{ id: 'a', x: 0 }]))
  history.record(snap([{ id: 'a', x: 1 }]))
  history.record(snap([{ id: 'a', x: 2 }]))
  assert.equal(history.length, 2)
  const removed = history.trim(1)
  assert.equal(removed, 1)
  assert.equal(history.length, 1)

  history.clear()
  assert.equal(history.length, 0)
  assert.equal(history.canUndo, false)
}

console.log('opHistory unit tests passed')
