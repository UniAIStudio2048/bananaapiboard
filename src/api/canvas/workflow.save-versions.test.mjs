import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { prepareWorkflowSaveBody } from '../../utils/workflowMediaUpload.js'

const source = readFileSync(new URL('./workflow.js', import.meta.url), 'utf8')
const ast = parse(source, { sourceType: 'module' })
function harness(ok = true, conflictNodeVersions = null, options = {}) {
  const { lease = {}, serverNodes = [], errorBody = null, conflicts = null } = options
  const flushes = []
  const applied = []
  const requests = []
  const requestHeaders = []
  const batchCalls = []
  const marks = []
  const remoteApplied = []
  const workflow = { id: 'wf-a', client_tab_id: 'tab-a', node_versions: { media: 8 } }
  const context = {
    getApiUrl: path => path, getAuthHeaders: () => ({}),
    prepareWorkflowSaveBody, uploadCanvasFile: async () => { throw new Error('unexpected upload') },
    useCanvasStore: () => ({
      applyWorkflowSaveVersions: value => applied.push(value),
      applyIncrementalNode: (node, opts) => remoteApplied.push({ node, opts }),
      flushIncrementalWriter: async () => { flushes.push(requests.length) }
    }),
    canvasEditLease: {
      isReadonly: () => Boolean(lease.readonly),
      getState: () => (lease.editor ? { mode: 'editor', token: 4 } : null),
      getLeaseHeaders: () => ({ 'X-Canvas-Session-Id': 'sess-1', ...(lease.editor ? { 'X-Canvas-Lease-Token': '4' } : {}) }),
      markLost: (...args) => marks.push(args)
    },
    getWorkflowNodesBatch: async (workflowId, ids) => {
      batchCalls.push({ workflowId, ids })
      return { nodes: serverNodes.filter(node => ids.includes(node.id)) }
    },
    fetch: async (_url, init = {}) => {
      requests.push(JSON.parse(init.body))
      requestHeaders.push(init.headers || {})
      const isRetry = requests.length > 1
      const responseOk = conflicts ? requests.length > conflicts.length : (ok || isRetry)
      const versions = conflicts ? conflicts[requests.length - 1] : conflictNodeVersions
      return {
        ok: responseOk,
        status: responseOk ? 200 : 409,
        text: async () => JSON.stringify(responseOk
          ? { workflow }
          : (errorBody || { error: '画布内容已更新', code: 'version_conflict', node_versions: versions }))
      }
    }
  }
  for (const name of ['requestWorkflowSave', 'saveWorkflowWithConflictRetry', 'syncSavedWorkflowVersions', 'saveWorkflowRaw', 'saveWorkflow',
    'assertWorkflowWritable', 'noteLeaseRejection', 'holdsWorkflowLease', 'rebaseConflictingNodes', 'flushIncrementalWritesBeforeSave']) {
    const node = ast.program.body.map(item => item.declaration || item).find(item => item.type === 'FunctionDeclaration' && item.id?.name === name)
    if (!node) continue
    // The Vite-only store import is provided by the test context; execute the actual API body.
    const body = source.slice(node.start, node.end).replace("const { useCanvasStore } = await import('@/stores/canvas/canvasStore')", '')
    context[name] = runInNewContext(`(${body})`, context)
  }
  return { context, applied, workflow, requests, requestHeaders, batchCalls, marks, remoteApplied, flushes }
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

test('team saves without explicit protocol metadata are upgraded by the client API', async () => {
  const h = harness()
  await h.context.saveWorkflow({ id: 'team-wf', spaceType: 'team', nodes: [] })
  assert.equal(h.requests[0].protocolVersion, 2)
  assert.equal(h.requests[0].baseRevision, 0)
})

test('a rejected manual save does not advance the node baseline', async () => {
  const h = harness(false)
  await assert.rejects(h.context.saveWorkflow({ id: 'wf-a' }), /画布内容已更新/)
  assert.deepEqual(h.applied, [])
})

test('a legacy save retries once with the server node baseline', async () => {
  const h = harness(false, { media: 8 })
  await h.context.saveWorkflow({ id: 'wf-a', baseNodeVersions: { media: 7 } })
  assert.equal(h.requests.length, 2)
  assert.deepEqual(h.requests[1].baseNodeVersions, { media: 8 })
  assert.deepEqual(JSON.parse(JSON.stringify(h.applied)), [
    { node_versions: { media: 8 } },
    h.workflow
  ])
})

test('a collaborative save does not retry a stale full snapshot', async () => {
  const h = harness(false, { media: 8 })
  await assert.rejects(
    h.context.saveWorkflow({ id: 'wf-a', protocolVersion: 2, baseRevision: 3 }),
    /画布内容已更新/
  )
  assert.equal(h.requests.length, 1)
  assert.deepEqual(h.applied, [])
})

test('只读会话不发保存请求，直接以 edit_lease_readonly 拒绝', async () => {
  const h = harness(true, null, { lease: { readonly: true } })
  await assert.rejects(h.context.saveWorkflow({ id: 'wf-a', nodes: [] }), err => err.code === 'edit_lease_readonly')
  assert.equal(h.requests.length, 0)
})

test('持有编辑权时保存请求携带会话与令牌', async () => {
  const h = harness(true, null, { lease: { editor: true } })
  await h.context.saveWorkflow({ id: 'wf-a', nodes: [] })
  assert.equal(h.requestHeaders[0]['X-Canvas-Session-Id'], 'sess-1')
  assert.equal(h.requestHeaders[0]['X-Canvas-Lease-Token'], '4')
})

test('服务端以 edit_lease_lost 拒绝时记录持有者并切为只读，不重试', async () => {
  const holder = { userName: '李四', device: 'Edge · Windows' }
  const h = harness(false, null, { lease: { editor: true }, errorBody: { error: '编辑权已转移', code: 'edit_lease_lost', holder } })
  await assert.rejects(h.context.saveWorkflow({ id: 'wf-a', nodes: [] }), err => err.code === 'edit_lease_lost')
  assert.equal(h.requests.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(h.marks)), [['wf-a', holder, 'edit_lease_lost']])
})

test('版本冲突重试只拉取冲突节点，服务端写回字段覆盖本地，其余字段保留本地修改', async () => {
  const serverNodes = [{ id: 'video', version: 5, data: { prompt: '服务端旧提示词', output: { url: 'https://cdn/v.mp4' }, status: 'success', progress: null } }]
  const h = harness(false, { video: 5, text: 2 }, { serverNodes })
  await h.context.saveWorkflow({
    id: 'wf-a',
    baseNodeVersions: { video: 4, text: 2 },
    nodes: [
      { id: 'video', data: { prompt: '本地新提示词', status: 'processing' } },
      { id: 'text', data: { text: 'hi' } }
    ]
  })
  assert.deepEqual(JSON.parse(JSON.stringify(h.batchCalls)), [{ workflowId: 'wf-a', ids: ['video'] }])
  const retried = h.requests[1].nodes.find(node => node.id === 'video')
  assert.equal(retried.data.prompt, '本地新提示词')
  assert.deepEqual(retried.data.output, { url: 'https://cdn/v.mp4' })
  assert.equal(retried.data.status, 'success')
  assert.deepEqual(h.requests[1].baseNodeVersions, { video: 5, text: 2 })
  assert.equal(h.remoteApplied.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(h.remoteApplied[0].node.data)), { output: { url: 'https://cdn/v.mp4' }, status: 'success', progress: null })
})

test('团队协作快照在持有编辑权时允许按服务端基线重试', async () => {
  const h = harness(false, { media: 8 }, { lease: { editor: true } })
  await h.context.saveWorkflow({ id: 'wf-a', protocolVersion: 2, baseRevision: 3, baseNodeVersions: { media: 7 } })
  assert.equal(h.requests.length, 2)
  assert.deepEqual(h.requests[1].baseNodeVersions, { media: 8 })
})

test('增量写入在冲突重试期间继续推进版本时，按每次返回的最新基线最多重试 3 次', async () => {
  const h = harness(false, null, { conflicts: [{ media: 8 }, { media: 9 }] })
  await h.context.saveWorkflow({ id: 'wf-a', baseNodeVersions: { media: 7 }, nodes: [] })
  assert.equal(h.requests.length, 3)
  assert.deepEqual(h.requests[1].baseNodeVersions, { media: 8 })
  assert.deepEqual(h.requests[2].baseNodeVersions, { media: 9 })
})

test('连续冲突超过重试上限时抛出冲突错误', async () => {
  const h = harness(false, null, { conflicts: [{ media: 8 }, { media: 9 }, { media: 10 }, { media: 11 }] })
  await assert.rejects(h.context.saveWorkflow({ id: 'wf-a', baseNodeVersions: { media: 7 }, nodes: [] }), err => err.code === 'version_conflict')
  assert.equal(h.requests.length, 4)
})

test('已保存工作流整份保存前先发完排队中的增量写入', async () => {
  const h = harness()
  await h.context.saveWorkflow({ id: 'wf-a', nodes: [] })
  assert.deepEqual(h.flushes, [0], '必须在第一次保存请求之前 flush')
})
