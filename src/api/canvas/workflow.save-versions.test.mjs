import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { prepareWorkflowSaveBody } from '../../utils/workflowMediaUpload.js'

const source = readFileSync(new URL('./workflow.js', import.meta.url), 'utf8')
const ast = parse(source, { sourceType: 'module' })
function harness(ok = true) {
  const applied = []
  const workflow = { id: 'wf-a', client_tab_id: 'tab-a', node_versions: { media: 8 } }
  const context = {
    getApiUrl: path => path, getAuthHeaders: () => ({}),
    prepareWorkflowSaveBody, uploadCanvasFile: async () => { throw new Error('unexpected upload') },
    useCanvasStore: () => ({ applyWorkflowSaveVersions: value => applied.push(value) }),
    fetch: async () => ({ ok, text: async () => JSON.stringify(ok ? { workflow } : { error: '画布内容已更新', code: 'version_conflict' }) })
  }
  for (const name of ['requestWorkflowSave', 'saveWorkflowWithConflictRetry', 'syncSavedWorkflowVersions', 'saveWorkflowRaw', 'saveWorkflow']) {
    const node = ast.program.body.map(item => item.declaration || item).find(item => item.type === 'FunctionDeclaration' && item.id?.name === name)
    if (!node) continue
    // The Vite-only store import is provided by the test context; execute the actual API body.
    const body = source.slice(node.start, node.end).replace("const { useCanvasStore } = await import('@/stores/canvas/canvasStore')", '')
    context[name] = runInNewContext(`(${body})`, context)
  }
  return { context, applied, workflow }
}

test('successful raw autosave synchronizes the returned node versions before resolving', async () => {
  const h = harness()
  const result = await h.context.saveWorkflowRaw('{"id":"wf-a"}')
  assert.equal(result.workflow.id, 'wf-a')
  assert.deepEqual(JSON.parse(JSON.stringify(h.applied)), [h.workflow])
})

test('a rejected save leaves the client baseline unchanged and exposes the conflict message', async () => {
  const h = harness(false)
  await assert.rejects(h.context.saveWorkflowRaw('{"id":"wf-a"}'), /画布内容已更新/)
  assert.deepEqual(h.applied, [])
})

test('successful manual save synchronizes versions so a subsequent save uses the acknowledged baseline', async () => {
  const h = harness()
  await h.context.saveWorkflow({ id: 'wf-a', baseNodeVersions: { media: 7 } })
  assert.deepEqual(JSON.parse(JSON.stringify(h.applied)), [h.workflow])
})

test('a rejected manual save does not advance the node baseline', async () => {
  const h = harness(false)
  await assert.rejects(h.context.saveWorkflow({ id: 'wf-a' }), /画布内容已更新/)
  assert.deepEqual(h.applied, [])
})
