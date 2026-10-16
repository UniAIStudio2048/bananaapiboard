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
