import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const body = source.match(/\nasync function handleToolbarDepth\(\) \{[\s\S]*?\n\}/)?.[0]

function harness({ taskFailure = false, addVersion = 7, patchVersion = 8 } = {}) {
  const calls = []
  const sourceNode = { id: 'source', type: 'video', position: { x: 0, y: 0 }, data: { output: { url: 'https://media.test/source.mp4' } } }
  const tab = { id: 'tab-a', workflowId: 'workflow-a', savedNodeVersions: {} }
  let addedNodeId = ''
  const store = {
    nodes: [sourceNode],
    edges: [],
    getCurrentTab: () => tab,
    addNode(node) { calls.push(['add-node']); addedNodeId = node.id; this.nodes.push(structuredClone(node)) },
    addEdge(edge) { calls.push(['add-edge', edge]) },
    applyWorkflowSaveVersions(workflow) {
      calls.push(['save-versions', workflow])
      tab.savedNodeVersions = { ...tab.savedNodeVersions, ...workflow.node_versions }
      for (const node of this.nodes) {
        if (tab.savedNodeVersions[node.id]) node.version = tab.savedNodeVersions[node.id]
      }
    },
    updateNodeData(nodeId, data, options = {}) {
      calls.push(['update-node', { nodeId, data, options }])
      Object.assign(this.nodes.find(node => node.id === nodeId).data, data)
    }
  }
  const deps = {
    isDepthProcessing: { value: false },
    props: { id: 'source', data: sourceNode.data },
    normalizedVideoUrl: { value: '' },
    canvasStore: store,
    localStorage: { getItem: () => 'token' },
    getTenantHeaders: () => ({}),
    getApiUrl: path => path,
    uploadCanvasMedia: async () => ({ url: 'https://media.test/uploaded.mp4' }),
    ensureCanvasWorkflowForVideoSubmission: async () => { calls.push(['ensure-workflow']); return { workflowId: 'workflow-a', currentTab: tab } },
    postWorkflowOps: async (workflowId, ops) => {
      calls.push(['ops', { workflowId, ops }])
      const nodeOp = ops.find(op => op.target === 'node')
      return { ok: true, results: [{ target: 'node', op: 'add', nodeId: nodeOp.payload.id, version: addVersion }] }
    },
    fetch: async (url) => {
      calls.push(['fetch', url])
      if (url === '/api/videos/depth/config') return { ok: true, json: async () => ({ enabled: true, billing_mode: 'fixed', points_cost: 10 }) }
      if (url === '/api/videos/depth/tasks') {
        return taskFailure
          ? { ok: false, json: async () => ({ message: '深度提取提交失败' }) }
          : { ok: true, json: async () => ({ taskId: 'depth-task', prepaid: 10 }) }
      }
      throw new Error(`unexpected fetch: ${url}`)
    },
    patchWorkflowNode: async (workflowId, nodeId, patch, baseVersion) => {
      calls.push(['patch', { workflowId, nodeId, patch, baseVersion }])
      if (!Number.isSafeInteger(baseVersion) || baseVersion < 1) throw new Error('更新操作必须携带有效 baseVersion')
      return { ok: true, nodeId, version: patchVersion }
    },
    registerTask: task => calls.push(['register-task', task]),
    formatPoints: value => String(value),
    showToast: (message, kind) => calls.push(['toast', message, kind])
  }
  assert.ok(body)
  const handle = new Function(...Object.keys(deps), `${body}; return handleToolbarDepth`)(...Object.values(deps))
  return { handle, calls, store, tab, getAddedNodeId: () => addedNodeId }
}

test('depth submission saves task metadata with the version returned by the add operation', async () => {
  const h = harness()
  await h.handle()

  const patch = h.calls.find(call => call[0] === 'patch')?.[1]
  assert.ok(patch)
  assert.equal(patch.baseVersion, 7, 'must use the server-issued node version instead of omitting baseVersion')
  assert.equal(patch.nodeId, h.getAddedNodeId())
  const node = h.store.nodes.find(item => item.id === h.getAddedNodeId())
  assert.equal(node.version, 8, 'the patched node version must be applied to the canvas cache')
  assert.equal(node.data.taskId, 'depth-task')
  assert.equal(h.tab.savedNodeVersions[patch.nodeId], 8)
  assert.equal(h.calls.some(call => call[0] === 'toast' && call[2] === 'error'), false)
})

test('depth submission failure persists the error node using the same valid baseVersion', async () => {
  const h = harness({ taskFailure: true })
  await h.handle()

  const patch = h.calls.find(call => call[0] === 'patch')?.[1]
  assert.ok(patch)
  assert.equal(patch.baseVersion, 7)
  const node = h.store.nodes.find(item => item.id === h.getAddedNodeId())
  assert.equal(node.data.status, 'error')
  assert.equal(node.data.error, '深度提取提交失败')
  assert.equal(node.version, 8, 'the error patch version must also be applied to the canvas cache')
  assert.equal(h.tab.savedNodeVersions[patch.nodeId], 8)
  assert.ok(h.calls.some(call => call[0] === 'toast' && call[2] === 'error'))
})
