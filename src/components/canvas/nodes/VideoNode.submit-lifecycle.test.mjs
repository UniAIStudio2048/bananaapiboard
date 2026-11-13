import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const extract = name => source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0]
function guardHarness({ flush = { ok: true }, savedNodes = [{ id: 'video-a' }], switchTab = false } = {}) {
  const tab = { id: 'tab-a', workflowId: 'wf-a', workflowSpaceType: 'personal' }
  let current = tab
  let saves = 0
  const deps = {
    canvasStore: {
      getCurrentTab: () => current,
      exportWorkflowForSave: () => ({ nodes: [{ id: 'video-a' }], edges: [] }),
      flushIncrementalWriter: async () => { if (switchTab) current = { id: 'tab-b' }; return flush },
      markCurrentTabSaved: () => {}
    },
    getWorkflowNodesBatch: async () => ({ nodes: savedNodes }),
    teamStore: { getSpaceParams: () => ({ spaceType: 'personal' }) },
    saveWorkflow: async () => { saves++; return { workflow: { id: 'wf-a' } } }
  }
  const run = new Function(...Object.keys(deps), `${extract('ensureCanvasWorkflowForVideoSubmission')}; return ensureCanvasWorkflowForVideoSubmission`)(...Object.values(deps))
  return { run, get saves() { return saves } }
}
test('saved personal video node submits using incremental persistence without full-snapshot conflicts', async () => {
  const h = guardHarness()
  assert.equal((await h.run('video-a')).workflowId, 'wf-a')
  assert.equal(h.saves, 0)
})
test('failed incremental flush stops submission instead of saving a conflicting snapshot', async () => {
  const h = guardHarness({ flush: { ok: false, paused: true } })
  await assert.rejects(h.run('video-a'), /保存|协作|同步/)
  assert.equal(h.saves, 0)
})
test('switching workflow while saving cancels submission before any video request', async () => {
  const h = guardHarness({ switchTab: true })
  await assert.rejects(h.run('video-a'), /切换/)
})
test('missing incremental writer still persists a previously unsaved node', async () => {
  const h = guardHarness({ flush: { skipped: true, reason: 'writer_unavailable' }, savedNodes: [] })
  await h.run('video-a')
  assert.equal(h.saves, 1)
})

test('a stalled workflow save times out without continuing to the video submission', async () => {
  let expire
  let finishSave
  const tab = { id: 'tab-a', workflowId: 'wf-a' }
  const deps = {
    canvasStore: { getCurrentTab: () => tab },
    ensureCanvasWorkflowForVideoSubmission: () => new Promise(resolve => { finishSave = resolve }),
    setTimeout: fn => { expire = fn; return 1 },
    clearTimeout: () => {}
  }
  const body = extract('prepareVideoSubmissionContext')
  assert.ok(body, 'submission preparation must have a bounded lifetime')
  const prepare = new Function(...Object.keys(deps), `${body}; return prepareVideoSubmissionContext`)(...Object.values(deps))
  const result = prepare('video-a', { submissionTabId: 'tab-a' })
  expire()
  await assert.rejects(result, /超时/)
  finishSave({ currentTab: tab, workflowId: 'wf-a' })
})

test('submission failure after switching tabs updates and persists the original node', async () => {
  const calls = []
  const deps = {
    canvasStore: {
      getCurrentTab: () => ({ id: 'tab-b' }),
      updateNodeDataForTab: (...args) => calls.push(['local', ...args])
    },
    getWorkflowNodesBatch: async (workflowId, ids) => {
      assert.equal(workflowId, 'wf-a')
      assert.deepEqual(ids, ['video-a'])
      return { nodes: [{ id: 'video-a', version: 7, data: {} }] }
    },
    patchWorkflowNode: async (...args) => calls.push(['persist', ...args]),
    console
  }
  const body = extract('updateVideoSubmissionNode')
  assert.ok(body, 'failure writeback must retain the submitting tab')
  const update = new Function(...Object.keys(deps), `${body}; return updateVideoSubmissionNode`)(...Object.values(deps))
  const data = { status: 'error', progress: null, error: '保存超时' }
  await update('video-a', data, { submissionTabId: 'tab-a', submissionWorkflowId: 'wf-a' })
  assert.deepEqual(calls, [
    ['local', 'tab-a', 'video-a', data],
    ['persist', 'wf-a', 'video-a', { data }, 7]
  ])
})

test('task acknowledgement after a tab switch registers the original tab and clears old submission identity', async () => {
  let current = { id: 'tab-a', workflowId: 'wf-a' }
  const data = { taskId: 'old-task', clientSubmissionId: 'old-submission' }
  const registered = []
  const patches = []
  const deps = {
    canvasStore: { getCurrentTab: () => current },
    updateVideoSubmissionNode: async (id, patch, state) => {
      assert.equal(id, 'video-a')
      assert.equal(state.submissionTabId, 'tab-a')
      patches.push(patch)
      Object.assign(data, patch)
    },
    sendGenerateRequest: async () => {
      assert.equal(data.taskId, null)
      assert.equal(data.clientSubmissionId, null)
      assert.equal(data.progress, '正在提交任务...')
      current = { id: 'tab-b', workflowId: 'wf-b' }
      return { data: { task_id: 'new-task' }, submissionId: 'new-submission' }
    },
    markSubmissionTaskCreated: () => {},
    registerTask: task => registered.push(task),
    selectedModel: { value: 'model-a' }, selectedAspectRatio: { value: '9:16' },
    window: { dispatchEvent: () => {} }, CustomEvent: class {}, console
  }
  const execute = new Function(...Object.keys(deps), `${extract('executeNodeGeneration')}; return executeNodeGeneration`)(...Object.values(deps))
  assert.equal(await execute('video-a', 'prompt', [], 0), 'new-task')
  assert.equal(registered[0].tabId, 'tab-a')
  assert.equal(data.taskId, 'new-task')
  assert.equal(data.clientSubmissionId, 'new-submission')
  assert.equal(data.progress, '排队中...')
})
