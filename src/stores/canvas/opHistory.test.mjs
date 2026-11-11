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

// --- cancelLatest 移除临时操作并采用恢复后的当前状态 ---
{
  const before = snap([{ id: 'a', x: 0 }])
  const arranged = snap([{ id: 'a', x: 200 }])
  const restoredWithFreshData = snap([{ id: 'a', x: 0, status: 'complete' }])
  const history = createOpHistory({ baseline: before })
  history.record(arranged)

  assert.equal(typeof history.cancelLatest, 'function', '历史栈必须支持取消最新临时操作')
  assert.equal(history.cancelLatest(restoredWithFreshData), true)
  assert.equal(history.length, 0)
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)

  history.record(snap([{ id: 'a', x: 20, status: 'complete' }]))
  let current = null
  history.undo(state => { current = state })
  assert.deepEqual(current, restoredWithFreshData)
}

// --- 改动前保存历史（store 的实际用法）：每次 Ctrl+Z 只撤销一步 ---
{
  const s0 = snap([{ id: 'a', x: 0 }])
  const s1 = snap([{ id: 'a', x: 0 }, { id: 'b', x: 1 }])
  const s2 = snap([{ id: 'a', x: 0 }, { id: 'b', x: 1 }, { id: 'c', x: 2 }])
  const s3 = snap([{ id: 'a', x: 0 }, { id: 'b', x: 1 }, { id: 'c', x: 2 }, { id: 'd', x: 3 }])
  const history = createOpHistory()
  history.record(s0) // 打开画布建立基线
  history.record(s0) // 操作 A 前保存 → s1
  history.record(s1) // 操作 B 前保存 → s2
  history.record(s2) // 操作 C 前保存 → s3

  let current = s3
  const apply = state => { current = state }
  history.undo(apply, current)
  assert.deepEqual(current, s2, '第一次撤销只能撤掉最后一步 C')
  history.undo(apply, current)
  assert.deepEqual(current, s1, '第二次撤销撤掉 B')
  history.undo(apply, current)
  assert.deepEqual(current, s0, '第三次撤销撤掉 A')
  assert.equal(history.canUndo, false)

  history.redo(apply)
  history.redo(apply)
  history.redo(apply)
  assert.deepEqual(current, s3, '重做必须能恢复到最后一步 C')
}

// --- 未入栈的改动（如拖动）单独作为一步撤销 ---
{
  const history = createOpHistory()
  history.record(snap([{ id: 'a', x: 0 }]))
  history.record(snap([{ id: 'a', x: 0 }, { id: 'b', x: 1 }])) // 添加 b 后的下一次保存
  let current = snap([{ id: 'a', x: 50 }, { id: 'b', x: 1 }]) // 拖动 a，未保存历史
  history.undo(state => { current = state }, current)
  assert.deepEqual(current, snap([{ id: 'a', x: 0 }, { id: 'b', x: 1 }]), '只撤销拖动，不连带撤销添加 b')
}

// --- 撤销后无新改动时不截断重做栈 ---
{
  const history = createOpHistory()
  history.record(snap([{ id: 'a', x: 0 }]))
  history.record(snap([{ id: 'a', x: 1 }]))
  history.record(snap([{ id: 'a', x: 2 }]))
  let current = snap([{ id: 'a', x: 2 }])
  history.undo(state => { current = state }, current)
  history.undo(state => { current = state }, current)
  assert.equal(current.nodes[0].x, 0)
  assert.equal(history.canRedo, true, '连续撤销不应丢失重做路径')
}

// --- applyState 返回实际应用的状态时作为新基线，避免出现"空撤销" ---
{
  const history = createOpHistory()
  history.record(snap([{ id: 'a', status: 'idle' }]))
  history.record(snap([{ id: 'a', status: 'processing' }]))
  history.record(snap([{ id: 'a', status: 'processing' }, { id: 'b' }]))
  let current = snap([{ id: 'a', status: 'processing' }, { id: 'b' }])
  const sanitizeApply = state => {
    current = { ...state, nodes: state.nodes.map(n => (n.status === 'processing' ? { ...n, status: 'idle' } : n)) }
    return current
  }
  history.undo(sanitizeApply, current)
  assert.deepEqual(current.nodes.map(n => n.id), ['a'])
  const lengthBefore = history.length
  history.undo(sanitizeApply, current)
  assert.equal(history.length, lengthBefore, '恢复时的清洗差异不应被当作新的一步')
  assert.equal(history.canUndo, false)
}

console.log('opHistory unit tests passed')
