import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.localStorage = {
  getItem(key) {
    return key === 'token' ? 'token-1' : null
  }
}

const requests = []
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url, options })
  return {
    ok: true,
    async json() {
      return { success: true, schedule: { id: 'schedule-1' } }
    }
  }
}

const api = await import('./groupSchedule.js')

test('createGroupSchedule sends workflow, group, time, batch count, and snapshot', async () => {
  requests.length = 0
  const snapshot = { nodes: [{ id: 'g', type: 'group', data: { nodeIds: ['n'] } }], edges: [] }

  await api.createGroupSchedule({
    workflowId: 'wf-1',
    groupId: 'g',
    scheduledAt: 1770000000000,
    batchCount: 5,
    snapshot
  })

  assert.equal(requests.length, 1)
  assert.match(String(requests[0].url), /\/api\/canvas\/group-schedules$/)
  assert.equal(requests[0].options.method, 'POST')
  const body = JSON.parse(requests[0].options.body)
  assert.equal(body.workflowId, 'wf-1')
  assert.equal(body.groupId, 'g')
  assert.equal(body.scheduledAt, 1770000000000)
  assert.equal(body.batchCount, 5)
  assert.deepEqual(body.snapshot, snapshot)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token-1')
})

test('list and detail helpers use expected endpoints', async () => {
  requests.length = 0

  await api.listGroupSchedules({ workflowId: 'wf-1' })
  await api.getGroupSchedule('schedule-1')
  await api.cancelGroupSchedule('schedule-1')
  await api.getGroupRun('run-1')

  assert.match(String(requests[0].url), /\/api\/canvas\/group-schedules\?workflowId=wf-1$/)
  assert.match(String(requests[1].url), /\/api\/canvas\/group-schedules\/schedule-1$/)
  assert.match(String(requests[2].url), /\/api\/canvas\/group-schedules\/schedule-1\/cancel$/)
  assert.equal(requests[2].options.method, 'POST')
  assert.match(String(requests[3].url), /\/api\/canvas\/group-runs\/run-1$/)
})
