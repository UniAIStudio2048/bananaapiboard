import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./canvasStore.js', import.meta.url), 'utf8')
const ast = parse(source, { sourceType: 'module' })
function findFunction(name, node) {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'FunctionDeclaration' && node.id?.name === name) return node
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findFunction(name, child)
      if (found) return found
    }
  }
  return null
}

function harness() {
  const enqueued = []
  const tab = { id: 'tab-a', workflowId: 'wf-a', collabRevision: 1, savedNodeVersions: { ghost: 3, n2: 1 } }
  const context = {
    nodes: { value: [{ id: 'ghost', type: 'image', position: { x: 1, y: 2 }, version: 3, data: { prompt: 'local', __collabDirty: true } }] },
    edges: { value: [{ id: 'ghost-edge', source: 'ghost', target: 'n2', version: 2, __collabDirty: true }] },
    getCurrentTab: () => tab,
    incrementalWriter: { enqueue: op => enqueued.push(op) }
  }
  const node = findFunction('acknowledgeIncrementalResults', ast)
  context.acknowledgeIncrementalResults = runInNewContext(`(${source.slice(node.start, node.end)})`, context)
  return { context, enqueued, tab }
}

test('服务端提示节点/连线缺失时，用本地完整数据补发 add', () => {
  const h = harness()
  h.context.acknowledgeIncrementalResults([
    { target: 'node', op: 'update', nodeId: 'ghost', missing: true, revision: 5 },
    { target: 'edge', op: 'update', edgeId: 'ghost-edge', missing: true, revision: 6 }
  ], 6)
  const plain = JSON.parse(JSON.stringify(h.enqueued))
  assert.equal(plain.length, 2)
  assert.deepEqual(plain[0], {
    op: 'add', target: 'node',
    payload: { id: 'ghost', type: 'image', position: { x: 1, y: 2 }, version: 3, data: { prompt: 'local' } }
  })
  assert.deepEqual(plain[1], {
    op: 'add', target: 'edge',
    payload: { id: 'ghost-edge', source: 'ghost', target: 'n2', version: 2 }
  })
  assert.equal(h.tab.collabRevision, 6)
})

test('本地也已不存在的节点不补发', () => {
  const h = harness()
  h.context.acknowledgeIncrementalResults([{ target: 'node', op: 'update', nodeId: 'gone', missing: true }], 2)
  assert.equal(h.enqueued.length, 0)
})

test('增量写入确认的节点版本同步到整份保存基线，避免下一次整份保存冲突', () => {
  const h = harness()
  h.context.acknowledgeIncrementalResults([{ target: 'node', op: 'update', nodeId: 'ghost', version: 5 }], 3)
  assert.equal(h.tab.savedNodeVersions.ghost, 5)
  assert.equal(h.context.nodes.value[0].version, 5)
  assert.equal(h.tab.savedNodeVersions.n2, 1)
})
