import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
function getSubmit(fetch) {
  const start = source.indexOf('async function sendSeedanceDraftFinalRequest(')
  assert.ok(start >= 0, 'final submission must bypass ordinary reference processing')
  const end = source.indexOf('\nasync function sendGenerateRequest', start)
  return new Function('fetch', 'getApiUrl', 'getTenantHeaders', 'localStorage', `${source.slice(start, end)}; return sendSeedanceDraftFinalRequest`)(fetch, value => value, () => ({ 'X-Tenant-ID': 'default' }), { getItem: () => 'test-token' })
}

test('final submission sends only source task and persistent canvas identity', async () => {
  const submit = getSubmit(async (url, options) => {
    assert.equal(url, '/api/videos/generate')
    assert.deepEqual(JSON.parse(options.body), { seedance_draft_task_id: 'source', client_submission_id: 'submit', canvas_node_id: 'node', canvas_workflow_id: 'workflow', canvas_tab_id: 'tab' })
    return { ok: true, json: async () => ({ task_id: 'final', points_cost: 100 }) }
  })
  assert.deepEqual(await submit('source', { submissionId: 'submit', nodeId: 'node', workflowId: 'workflow', tabId: 'tab' }), { data: { task_id: 'final', points_cost: 100 }, submissionId: 'submit' })
})

test('failed final submission preserves identity for existing recovery and displays server error', async () => {
  const submit = getSubmit(async () => ({ ok: false, json: async () => ({ error: 'insufficient_points', message: '积分不足' }) }))
  await assert.rejects(submit('source', { submissionId: 'submit' }), error => error.message === '积分不足' && error.clientSubmissionId === 'submit')
})

function getDraftSettings({ fail = false, resolution = '480p', enabled = false } = {}) {
  const calls = []
  const props = { id: 'node', data: { seedanceDraftEnabled: enabled } }
  const savingSeedanceDraft = { value: false }
  const selectedVideoParameterResolution = { value: resolution }
  const bindings = {
    props,
    savingSeedanceDraft,
    selectedVideoParameterResolution,
    seedanceDraftEnabled: { get value() { return props.data.seedanceDraftEnabled } },
    supportsSeedanceDraft: { value: true },
    isGenerating: { value: false },
    canvasStore: {
      getCurrentTab: () => ({ id: 'tab', savedNodeVersions: { other: 7, node: 1 } }),
      updateNodeData: (id, data) => { calls.push(['local', data]); Object.assign(props.data, data) },
      applyWorkflowSaveVersions: data => calls.push(['version', data])
    },
    ensureCanvasWorkflowForVideoSubmission: async () => ({ workflowId: 'workflow' }),
    patchWorkflowNode: async (workflowId, nodeId, patch) => {
      calls.push(['persist', patch.data])
      if (fail) throw new Error('save failed')
      return { version: 2 }
    },
    syncGenericVideoResolution: value => { selectedVideoParameterResolution.value = value },
    showToast: message => calls.push(['error', message])
  }
  const start = source.indexOf('async function setSeedanceDraftEnabled(')
  const end = source.indexOf('\nasync function handleSeedanceDraftFinal', start)
  const set = new Function(...Object.keys(bindings), `${source.slice(start, end)}; return setSeedanceDraftEnabled`)(...Object.values(bindings))
  return { set, calls, props, bindings }
}

test('draft on/off selections persist before updating the node and retain 480p', async () => {
  const state = getDraftSettings()
  await state.set(true)
  await state.set(false)
  assert.deepEqual(state.calls.filter(([type]) => type === 'persist').map(([, data]) => data), [
    { seedanceDraftEnabled: true, seedanceResolution: '480p', videoResolution: '480p' },
    { seedanceDraftEnabled: false, seedanceResolution: '480p', videoResolution: '480p' }
  ])
  assert.equal(state.calls[0][0], 'persist')
  assert.equal(state.calls[1][0], 'local')
  assert.equal(state.props.data.seedanceDraftEnabled, false)
})

test('switching away from 480p persists resolution and disables draft together', async () => {
  const state = getDraftSettings({ enabled: true })
  await state.set(false, '1080p')
  assert.deepEqual(state.calls[0], ['persist', { seedanceDraftEnabled: false, seedanceResolution: '1080p', videoResolution: '1080p' }])
  assert.equal(state.bindings.selectedVideoParameterResolution.value, '1080p')
})

test('failed draft setting save leaves the original selection unchanged', async () => {
  const state = getDraftSettings({ enabled: true, fail: true })
  await state.set(false, '720p')
  assert.equal(state.props.data.seedanceDraftEnabled, true)
  assert.equal(state.bindings.selectedVideoParameterResolution.value, '480p')
  assert.equal(state.bindings.savingSeedanceDraft.value, false)
  assert.equal(state.calls.some(([type]) => type === 'local'), false)
  assert.deepEqual(state.calls.at(-1), ['error', 'save failed'])
})

test('saving draft settings preserves other nodes versions for subsequent workflow saves', async () => {
  const state = getDraftSettings()
  await state.set(true)
  const [, workflow] = state.calls.find(([type]) => type === 'version')
  assert.deepEqual(workflow.node_versions, { other: 7, node: 2 })
})

test('draft cannot be enabled outside 480p or changed while saving or generating', async () => {
  const state = getDraftSettings({ resolution: '720p' })
  await state.set(true)
  state.bindings.savingSeedanceDraft.value = true
  await state.set(false)
  state.bindings.savingSeedanceDraft.value = false
  state.bindings.isGenerating.value = true
  await state.set(false)
  assert.deepEqual(state.calls, [])
})

test('enabling draft keeps higher resolution choices available', () => {
  const start = source.indexOf('const videoParameterResolutionOptions = computed(')
  const end = source.indexOf('\nconst selectedVideoParameterResolution', start)
  const options = [{ value: '480p' }, { value: '720p' }, { value: '1080p' }]
  const result = new Function('computed', 'seedanceDraftEnabled', 'genericVideoResolutionOptions', `${source.slice(start, end)}; return videoParameterResolutionOptions`)(fn => fn(), { value: true }, { value: options })
  assert.deepEqual(result, options)
})

test('resolution selection disables draft through the same persistence operation', () => {
  const start = source.indexOf('const selectedVideoParameterResolution = computed(')
  const end = source.indexOf('\nconst showVideoParameterDuration', start)
  const calls = []
  const selector = new Function('computed', 'videoParameterResolutionOptions', 'supportsSeedanceDraft', 'seedanceDraftEnabled', 'setSeedanceDraftEnabled', 'genericVideoResolutionOptions', 'syncGenericVideoResolution', `${source.slice(start, end)}; return selectedVideoParameterResolution`)(value => value, { value: [{ value: '480p' }, { value: '720p' }] }, { value: true }, { value: true }, (...args) => calls.push(args), { value: [{ value: '720p' }] }, () => {})
  selector.set('720p')
  assert.deepEqual(calls, [[false, '720p']])
})
