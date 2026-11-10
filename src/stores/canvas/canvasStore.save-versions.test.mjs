import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { sanitizeWorkflowForSave } from '../../utils/workflowSaveSanitizer.js'
import { isStaleTaskResultForInFlightNode, TASK_RESULT_FIELDS } from '../../utils/canvasTaskResultGuard.js'

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
  const workflowTabs = { value: [{ id: 'tab-a', workflowId: 'wf-a', savedNodeVersions: { media: 7, removed: 4 }, nodes: [{ id: 'media', version: 7, data: { output: { url: 'https://example.com/result.png' } } }] }, { id: 'tab-b', workflowId: 'wf-b', savedNodeVersions: { other: 2 }, nodes: [{ id: 'other', version: 2, data: {} }] }] }
  const context = {
    workflowTabs, activeTabId: { value: 'tab-a' }, nodes: { value: structuredClone(workflowTabs.value[0].nodes) },
    edges: { value: [] }, viewport: { value: {} }, sanitizeWorkflowForSave, isStaleTaskResultForInFlightNode, TASK_RESULT_FIELDS,
    getCurrentTab: () => workflowTabs.value.find(tab => tab.id === context.activeTabId.value), console: { warn() {} },
    createSkeletonNodes: nodes => structuredClone(nodes), cleanEdges: edges => edges,
    switchToTab: id => { context.activeTabId.value = id; context.nodes.value = structuredClone(workflowTabs.value.find(tab => tab.id === id).nodes) }
  }
  for (const name of ['captureNodeVersions', 'exportWorkflowForSave', 'applyWorkflowSaveVersions', 'markCurrentTabSaved', 'applyIncrementalNode', 'openWorkflowInNewTab', 'setCollaborationState']) {
    const fn = findFunction(name, ast)
    if (fn) context[name] = runInNewContext(`(${source.slice(fn.start, fn.end)})`, context)
  }
  return context
}

test('full-save baseline includes deleted nodes rather than inferring deletion from a stale snapshot', () => {
  const h = harness()
  const saved = h.exportWorkflowForSave()
  assert.deepEqual(JSON.parse(JSON.stringify(saved.baseNodeVersions)), { media: 7, removed: 4 })
  assert.equal(saved.clientTabId, 'tab-a')
})

test('personal workflows keep the legacy full-save protocol', () => {
  const h = harness()
  h.workflowTabs.value[0].workflowSpaceType = 'personal'
  const saved = h.exportWorkflowForSave()
  assert.equal(saved.protocolVersion, undefined)
  assert.equal(saved.baseRevision, undefined)
  assert.equal(saved.collabEpoch, undefined)
})

test('team workflows include the collaboration protocol metadata', () => {
  const h = harness()
  h.workflowTabs.value[0].workflowSpaceType = 'team'
  h.workflowTabs.value[0].collabRevision = 4
  h.workflowTabs.value[0].collabEpoch = 'epoch-1'
  const saved = h.exportWorkflowForSave()
  assert.equal(saved.protocolVersion, 2)
  assert.equal(saved.baseRevision, 4)
  assert.equal(saved.collabEpoch, 'epoch-1')
})

test('save acknowledgment updates the originating tab even after switching tabs', () => {
  const h = harness()
  h.activeTabId.value = 'tab-b'
  h.nodes.value = structuredClone(h.workflowTabs.value[1].nodes)
  assert.equal(typeof h.applyWorkflowSaveVersions, 'function')
  h.applyWorkflowSaveVersions({ id: 'wf-a', node_versions: { media: 8 }, client_tab_id: 'tab-a' })
  assert.equal(h.workflowTabs.value[0].savedNodeVersions.media, 8)
  assert.equal('removed' in h.workflowTabs.value[0].savedNodeVersions, false)
  assert.equal(h.workflowTabs.value[1].savedNodeVersions.other, 2)
  assert.equal(h.nodes.value[0].version, 2)
})

test('new-workflow acknowledgment only records nodes included in the successful save', () => {
  const h = harness()
  const tab = h.workflowTabs.value[0]
  tab.workflowId = null
  tab.savedNodeVersions = null
  h.nodes.value.push({ id: 'added-during-request', data: {} })
  assert.equal(typeof h.applyWorkflowSaveVersions, 'function')
  h.applyWorkflowSaveVersions({ id: 'new-wf', node_versions: { media: 1 }, client_tab_id: 'tab-a' })
  h.markCurrentTabSaved('new-wf')
  assert.deepEqual(JSON.parse(JSON.stringify(h.exportWorkflowForSave().baseNodeVersions)), { media: 1 })
})

test('late acknowledgments cannot roll back a newer remote node version', () => {
  const h = harness()
  h.workflowTabs.value[0].savedNodeVersions.media = 9
  h.nodes.value[0].version = 9
  assert.equal(typeof h.applyWorkflowSaveVersions, 'function')
  h.applyWorkflowSaveVersions({ id: 'wf-a', node_versions: { media: 8 } })
  assert.equal(h.exportWorkflowForSave().baseNodeVersions.media, 9)
  assert.equal(h.nodes.value[0].version, 9)
})

test('an applied server media completion advances the full-save baseline along with its output', () => {
  const h = harness()
  h.applyIncrementalNode({ id: 'media', version: 8, data: { status: 'success', output: { url: 'https://example.com/completed.mp4' } } })
  assert.equal(h.exportWorkflowForSave().baseNodeVersions.media, 8)
  assert.equal(h.nodes.value[0].version, 8)
  assert.equal(h.nodes.value[0].data.output.url, 'https://example.com/completed.mp4')
})

test('a completion during media loading replaces the original output without losing source images', () => {
  const h = harness()
  h.nodes.value[0].data = { _mediaLoading: true, sourceImages: [], output: null,
    _originalMedia: { sourceImages: ['https://example.com/source.png'], output: { url: 'https://example.com/old.mp4' } }
  }
  h.applyIncrementalNode({ id: 'media', version: 8, data: { status: 'success', output: { url: 'https://example.com/completed.mp4' } } })
  const saved = h.exportWorkflowForSave()
  assert.equal(saved.nodes[0].data.output.url, 'https://example.com/completed.mp4')
  assert.deepEqual(saved.nodes[0].data.sourceImages, ['https://example.com/source.png'])
  assert.equal(saved.baseNodeVersions.media, 8)
})

test('a late older media event cannot replace a newer result while retaining its newer baseline', () => {
  const h = harness()
  h.applyIncrementalNode({ id: 'media', version: 9, data: { output: { url: 'https://example.com/latest.mp4' } } })
  h.applyIncrementalNode({ id: 'media', version: 8, data: { output: { url: 'https://example.com/old.mp4' } } })
  const saved = h.exportWorkflowForSave()
  assert.equal(saved.nodes[0].data.output.url, 'https://example.com/latest.mp4')
  assert.equal(saved.baseNodeVersions.media, 9)
})

test('a remote node still carrying the previous task result cannot revert a node being regenerated', () => {
  const h = harness()
  h.nodes.value[0].data = { prompt: 'p', status: 'processing', processingStartedAt: 2000, taskId: null, output: null }
  h.applyIncrementalNode({ id: 'media', version: 8, data: {
    prompt: 'p', status: 'success', progress: null, taskId: 'cgt-old', processingStartedAt: 1000,
    output: { type: 'video', url: 'https://example.com/old.mp4' }
  } }, { remote: true })
  const data = h.nodes.value[0].data
  assert.equal(data.status, 'processing')
  assert.equal(data.output, null)
  assert.equal(data.processingStartedAt, 2000)
  assert.equal(h.nodes.value[0].version, 8, 'version still advances so the next full save does not conflict')
})

test('a pasted node pushed back as idle with its copied video cannot revert the regeneration', () => {
  const h = harness()
  h.nodes.value[0].data = { prompt: 'p', status: 'processing', processingStartedAt: 2000, taskId: null, output: null }
  h.applyIncrementalNode({ id: 'media', version: 8, data: {
    prompt: 'p', status: 'idle', progress: null, taskId: null, processingStartedAt: 1000,
    output: { type: 'video', url: 'https://example.com/old.mp4' }
  } }, { remote: true })
  assert.equal(h.nodes.value[0].data.status, 'processing')
  assert.equal(h.nodes.value[0].data.output, null)
})

test('a remote result of the current generation still completes the node', () => {
  const h = harness()
  h.nodes.value[0].data = { status: 'processing', processingStartedAt: 2000, taskId: 'cgt-new', output: null }
  h.applyIncrementalNode({ id: 'media', version: 8, data: {
    status: 'success', taskId: 'cgt-new', processingStartedAt: 2000, output: { type: 'video', url: 'https://example.com/new.mp4' }
  } }, { remote: true })
  assert.equal(h.nodes.value[0].data.status, 'success')
  assert.equal(h.nodes.value[0].data.output.url, 'https://example.com/new.mp4')
})

test('reopening an authoritative empty workflow also clears the old tab nodes', () => {
  const h = harness()
  h.openWorkflowInNewTab({ id: 'wf-a', nodes: [], edges: [] })
  const saved = h.exportWorkflowForSave()
  assert.deepEqual(saved.nodes, [])
  assert.deepEqual(JSON.parse(JSON.stringify(saved.baseNodeVersions)), {})
})

test('协作状态按工作流写入对应标签，不污染当前激活的其他标签', () => {
  const h = harness()
  h.workflowTabs.value[0].collabEpoch = 'epoch-a'
  h.workflowTabs.value[0].collabRevision = 10
  h.workflowTabs.value[1].collabEpoch = 'epoch-b'
  h.workflowTabs.value[1].collabRevision = 2
  // 工作流 A 的保存响应在切到 B 之后才返回
  h.activeTabId.value = 'tab-b'
  h.setCollaborationState({ workflowId: 'wf-a', collabRevision: 11, collabEpoch: 'epoch-a' })
  assert.equal(h.workflowTabs.value[1].collabEpoch, 'epoch-b')
  assert.equal(h.workflowTabs.value[1].collabRevision, 2)
  assert.equal(h.workflowTabs.value[0].collabRevision, 11)
  // 已关闭工作流的迟到响应直接忽略
  h.setCollaborationState({ workflowId: 'wf-closed', collabRevision: 99, collabEpoch: 'epoch-x' })
  assert.equal(h.workflowTabs.value[1].collabEpoch, 'epoch-b')
})
