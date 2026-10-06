import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const body = source.match(/async function confirmVideoAnalysis\(modelId\) \{[\s\S]*?\n\}/)?.[0]
function harness({ delayed = false, failure = false, upload = false, missing = false, slowPreparation = false, preparationFailure = false } = {}) {
  const tab = { id: 'tab-a', workflowId: 'workflow-a' }
  const calls = [], busy = { value: false }
  const sourceNode = { id: 'source', type: 'video', position: { x: 0, y: 0 }, data: { output: { url: upload ? 'blob:local-video' : 'https://media.test/old.mp4' }, _baseVersion: 2 } }
  let persisted = !missing, reads = 0, patched = false
  const processing = { taskId: 'analysis-task', status: 'processing', node: { id: 'analysis-node', type: 'text-input', version: 1, data: { status: 'processing', processingText: '正在解析...', analysisTaskId: 'analysis-task' } }, edge: { id: 'analysis-edge', source: 'source', target: 'analysis-node' } }
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  let prepare
  const preparation = new Promise(resolve => { prepare = resolve })
  const store = {
    nodes: [sourceNode], edges: [], getCurrentTab: () => tab,
    closeNodeSelector() { calls.push('close-selector') },
    addNode(node) { calls.push('display-node'); this.nodes.push(structuredClone(node)) },
    addEdge(edge) { calls.push('display-edge'); this.edges.push(edge) },
    applyIncrementalNode(node) { const target = this.nodes.find(n => n.id === node.id); target.data = { ...target.data, ...node.data, _baseVersion: node.version } },
    updateNodeData(id, data) { Object.assign(this.nodes.find(n => n.id === id).data, data) }
  }
  const deps = {
    isVideoAnalyzing: busy, showAnalysisDialog: { value: true }, canvasStore: store,
    props: { id: 'source', data: sourceNode.data }, normalizedVideoUrl: { value: sourceNode.data.output.url },
    ensureCanvasWorkflowForVideoSubmission: async () => { calls.push('full-save'); throw new Error('节点版本过低') },
    getWorkflowNodesBatch: async () => {
      reads++
      calls.push('read-source')
      if (slowPreparation && reads === 1) await preparation
      if (preparationFailure) throw new Error('读取视频失败')
      return { nodes: persisted ? [{ ...sourceNode, version: patched ? 13 : upload && reads > 1 ? 12 : 9, data: { title: '当前标题', output: { url: patched ? 'https://media.test/uploaded.mp4' : 'https://media.test/current.mp4', duration: 4 } } }] : [] }
    },
    patchWorkflowNode: async (workflowId, id, patch, version) => {
      calls.push(['patch', { workflowId, id, patch, version }])
      if (!upload) throw new Error('must not overwrite a newer source node')
      patched = true
    },
    postWorkflowOps: async (workflowId, ops) => { calls.push(['ops', { workflowId, ops }]); if (ops.some(op => op.payload.id === 'source')) persisted = true },
    analyzeVideoNode: async (payload, options) => {
      processing.node.id = payload.resultNodeId || processing.node.id
      processing.edge.id = payload.resultEdgeId || processing.edge.id
      processing.edge.target = processing.node.id
      calls.push(['parse', payload]); options?.onUpdate?.(processing)
      if (delayed) await gate
      if (failure) {
        options?.onUpdate?.({ ...processing, node: { ...processing.node, version: 2, data: { status: 'error', error: '上游失败' } } })
        throw new Error('上游失败')
      }
      return { ...processing, success: true, result: '山间云雾', cost: 1, node: { ...processing.node, version: 2, data: { status: 'success', text: '山间云雾', llmResponse: '山间云雾' } } }
    },
    fetch: async () => ({ blob: async () => new Blob(['video'], { type: 'video/mp4' }) }), File: globalThis.File,
    uploadCanvasMedia: async () => { if (!upload) throw new Error('unexpected upload'); return { url: 'https://media.test/uploaded.mp4' } },
    showToast: (message, kind) => calls.push(['toast', message, kind]), formatPoints: value => value,
    window: { dispatchEvent() {} }, CustomEvent: class {}, crypto: globalThis.crypto,
    nextTick: async () => { calls.push('render') }
  }
  assert.ok(body)
  const handle = new Function(...Object.keys(deps), `${body}; return confirmVideoAnalysis`)(...Object.values(deps))
  return { handle, calls, tab, store, busy, finish, prepare }
}

test('existing canvases parse from the current persisted source without a full stale snapshot save', async () => {
  const h = harness(); await h.handle('vision')
  assert.equal(h.calls.includes('full-save'), false)
  assert.equal(h.calls.some(c => c[0] === 'patch'), false)
  assert.equal(h.calls.filter(c => c[0] === 'parse').length, 1)
  assert.equal(h.store.nodes[0].data._baseVersion, 9)
})

test('uploads use the refreshed persisted version and patch only video output', async () => {
  const h = harness({ upload: true }); await h.handle('vision')
  const patch = h.calls.find(c => c[0] === 'patch')?.[1]
  assert.ok(patch)
  assert.equal(patch.version, 12, 'uploading must not keep a version captured before the upload')
  assert.deepEqual(Object.keys(patch.patch.data), ['output'])
  assert.equal(patch.patch.data.output.url, 'https://media.test/uploaded.mp4')
  assert.equal(patch.patch.data.output.duration, 4)
  assert.equal(h.store.nodes[0].data._baseVersion, 13)
})

test('an unpersisted source is added alone without resaving the rest of an existing canvas', async () => {
  const h = harness({ missing: true }); await h.handle('vision')
  const ops = h.calls.find(c => c[0] === 'ops' && c[1].ops[0].payload.id === 'source')?.[1].ops
  assert.equal(h.calls.includes('full-save'), false)
  assert.equal(ops.length, 1)
  assert.equal(ops[0].target, 'node')
  assert.equal(ops[0].payload.id, 'source')
  assert.equal(h.store.nodes[1].data.status, 'success')
})

test('shows the persisted processing node and edge before the model returns, then updates the same node', async () => {
  const h = harness({ delayed: true }); const running = h.handle('vision')
  for (let i = 0; i < 12; i++) await Promise.resolve()
  assert.equal(h.store.nodes.length, 2)
  assert.equal(h.store.edges.length, 1)
  assert.equal(h.store.nodes[1].data.status, 'processing')
  assert.equal(h.busy.value, true)
  h.finish(); await running
  assert.equal(h.store.nodes.length, 2)
  assert.equal(h.store.nodes[1].data.status, 'success')
  assert.equal(h.store.nodes[1].data.llmResponse, '山间云雾')
  assert.equal(h.store.nodes[1].data._baseVersion, 2)
})

test('upstream failure updates the same processing node to a persisted error', async () => {
  const h = harness({ failure: true }); await h.handle('vision')
  assert.equal(h.store.nodes.length, 2)
  assert.equal(h.store.nodes[1].data.status, 'error')
  assert.equal(h.store.nodes[1].data.error, '上游失败')
  assert.equal(h.busy.value, false)
})

test('duplicate clicks submit once and completion cannot write into a different canvas tab', async () => {
  const h = harness({ delayed: true }); const running = h.handle('vision')
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await h.handle('vision')
  assert.equal(h.calls.filter(c => c[0] === 'parse').length, 1)
  h.tab.id = 'tab-b'; h.finish(); await running
  assert.equal(h.store.nodes[1].data.status, 'processing')
})

test('renders a connected timed placeholder synchronously before any slow preparation request', async () => {
  const h = harness({ slowPreparation: true }); const running = h.handle('vision')
  assert.equal(h.store.nodes.length, 2, 'the first await must not precede visible feedback')
  assert.equal(h.store.edges.length, 1)
  const node = h.store.nodes[1]
  assert.equal(node.data.status, 'processing')
  assert.ok(node.data.processingStartedAt > 0)
  assert.equal(h.calls.includes('read-source'), false)
  await h.handle('vision')
  h.prepare(); await running
  assert.equal(h.store.nodes.length, 2)
  assert.equal(h.calls.filter(c => c[0] === 'parse').length, 1)
  assert.equal(h.calls.find(c => c[0] === 'parse')[1].resultNodeId, node.id)
})

test('preparation failure ends the immediate placeholder timer and does not start a model task', async () => {
  const h = harness({ preparationFailure: true }); await h.handle('vision')
  assert.equal(h.store.nodes.length, 2)
  assert.equal(h.store.nodes[1].data.status, 'error')
  assert.ok(h.store.nodes[1].data.processingCompletedAt >= h.store.nodes[1].data.processingStartedAt)
  assert.equal(h.calls.some(c => c[0] === 'parse'), false)
})
