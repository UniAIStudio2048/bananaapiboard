/**
 * canvas op-based 历史栈
 *
 * 与旧的"全量快照"撤销栈不同，本模块只存储每次保存之间的差分 diff，
 * 内存占用从 O(nodes × historySize) 降为 O(实际变化数 × historySize)，
 * 对 1000+ 节点的画布而言能节省 90% 以上的历史内存。
 *
 * 设计：
 *   - 维护一个 baseline 全量快照（占 1 份），与一个 diff 栈
 *   - record(state) → 计算 baseline → state 的 diff，入栈，刷新 baseline
 *   - undo(apply)   → 反向 apply 栈顶 diff
 *   - redo(apply)   → 正向 apply 下一条 diff
 *
 * Diff 结构：
 *   {
 *     nodes: { added: [...], removed: [...], changed: [{id, before, after}] },
 *     edges: { added: [...], removed: [...], changed: [{id, before, after}] },
 *     nodesOrder: string[] | null,  // 节点顺序变化时记录 next 顺序
 *     edgesOrder: string[] | null
 *   }
 *
 * 该模块无 Vue 依赖，可直接 node 运行单测。
 */

function deepClone(value) {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

function buildIndex(list) {
  const map = new Map()
  for (const item of list) {
    if (item && item.id != null) map.set(item.id, item)
  }
  return map
}

function diffCollection(prevList, nextList) {
  const prevMap = buildIndex(prevList)
  const nextMap = buildIndex(nextList)

  const added = []
  const removed = []
  const changed = []

  for (const [id, nextItem] of nextMap) {
    const prevItem = prevMap.get(id)
    if (!prevItem) {
      added.push(deepClone(nextItem))
      continue
    }
    const prevJson = JSON.stringify(prevItem)
    const nextJson = JSON.stringify(nextItem)
    if (prevJson !== nextJson) {
      changed.push({ id, before: deepClone(prevItem), after: deepClone(nextItem) })
    }
  }

  for (const [id, prevItem] of prevMap) {
    if (!nextMap.has(id)) removed.push(deepClone(prevItem))
  }

  const prevOrder = prevList.map(item => item && item.id).filter(id => id != null)
  const nextOrder = nextList.map(item => item && item.id).filter(id => id != null)
  const orderChanged = prevOrder.join('|') !== nextOrder.join('|')

  return { added, removed, changed, order: orderChanged ? nextOrder : null }
}

function isEmptyDiff(diff) {
  return (
    diff.nodes.added.length === 0 &&
    diff.nodes.removed.length === 0 &&
    diff.nodes.changed.length === 0 &&
    !diff.nodes.order &&
    diff.edges.added.length === 0 &&
    diff.edges.removed.length === 0 &&
    diff.edges.changed.length === 0 &&
    !diff.edges.order
  )
}

export function computeDiff(prev, next) {
  return {
    nodes: diffCollection(prev?.nodes ?? [], next?.nodes ?? []),
    edges: diffCollection(prev?.edges ?? [], next?.edges ?? [])
  }
}

function applyCollection(baselineList, partDiff, direction) {
  const map = new Map(baselineList.map(item => [item.id, deepClone(item)]))

  if (direction === 'forward') {
    for (const item of partDiff.removed) map.delete(item.id)
    for (const item of partDiff.added) map.set(item.id, deepClone(item))
    for (const change of partDiff.changed) map.set(change.id, deepClone(change.after))
  } else {
    for (const item of partDiff.added) map.delete(item.id)
    for (const item of partDiff.removed) map.set(item.id, deepClone(item))
    for (const change of partDiff.changed) map.set(change.id, deepClone(change.before))
  }

  if (partDiff.order && direction === 'forward') {
    const ordered = []
    for (const id of partDiff.order) {
      if (map.has(id)) ordered.push(map.get(id))
    }
    for (const [id, item] of map) {
      if (!partDiff.order.includes(id)) ordered.push(item)
    }
    return ordered
  }

  return Array.from(map.values())
}

export function applyDiff(state, diff, direction) {
  return {
    nodes: applyCollection(state?.nodes ?? [], diff.nodes, direction),
    edges: applyCollection(state?.edges ?? [], diff.edges, direction)
  }
}

export function createOpHistory({ maxSize = 50, baseline = null } = {}) {
  let stack = []
  let index = -1
  let base = baseline ? deepClone(baseline) : null

  function setBaseline(state) {
    base = state ? deepClone(state) : null
    stack = []
    index = -1
  }

  function record(currentState) {
    if (!base) {
      base = deepClone(currentState)
      return { recorded: false, reason: 'initial-baseline' }
    }

    const diff = computeDiff(base, currentState)
    if (isEmptyDiff(diff)) {
      return { recorded: false, reason: 'no-changes' }
    }

    if (index < stack.length - 1) {
      stack = stack.slice(0, index + 1)
    }

    stack.push(diff)
    index = stack.length - 1

    while (stack.length > maxSize) {
      stack.shift()
      if (index > 0) index--
    }

    base = deepClone(currentState)
    return {
      recorded: true,
      diffSize:
        diff.nodes.added.length +
        diff.nodes.removed.length +
        diff.nodes.changed.length +
        diff.edges.added.length +
        diff.edges.removed.length +
        diff.edges.changed.length
    }
  }

  function undo(applyState) {
    if (index < 0 || !base) return false
    const diff = stack[index]
    const newState = applyDiff(base, diff, 'backward')
    applyState(newState)
    base = deepClone(newState)
    index--
    return true
  }

  function redo(applyState) {
    if (index >= stack.length - 1 || !base) return false
    const nextDiff = stack[index + 1]
    const newState = applyDiff(base, nextDiff, 'forward')
    applyState(newState)
    base = deepClone(newState)
    index++
    return true
  }

  function cancelLatest(currentState) {
    if (!base || index < 0 || index !== stack.length - 1) return false
    stack.pop()
    index--
    base = deepClone(currentState)
    return true
  }

  function clear() {
    stack = []
    index = -1
    base = null
  }

  function trim(keepCount = 5) {
    if (stack.length <= keepCount) return 0
    const removeCount = stack.length - keepCount
    stack = stack.slice(removeCount)
    index = Math.max(-1, index - removeCount)
    return removeCount
  }

  function getStats() {
    let totalDiffSize = 0
    for (const diff of stack) {
      totalDiffSize +=
        diff.nodes.added.length +
        diff.nodes.removed.length +
        diff.nodes.changed.length +
        diff.edges.added.length +
        diff.edges.removed.length +
        diff.edges.changed.length
    }
    return { length: stack.length, index, totalDiffSize, hasBaseline: !!base }
  }

  return {
    record,
    undo,
    redo,
    cancelLatest,
    clear,
    trim,
    setBaseline,
    getStats,
    get length() { return stack.length },
    get index() { return index },
    get canUndo() { return index >= 0 },
    get canRedo() { return index < stack.length - 1 }
  }
}
