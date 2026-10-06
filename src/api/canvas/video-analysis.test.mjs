import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (await readFile(new URL('./video-analysis.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/m, "const getApiUrl = path => path; const getTenantHeaders = () => ({ 'X-Tenant-ID': 'test' })")
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
globalThis.localStorage = { getItem: () => 'test-token' }
test('reads fragmented SSE and requires a persisted successful result', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
      for (const chunk of [': connected\n\nevent: res', 'ult\ndata: {"success":true,"result":"视频描述","node":{"id":"text"},"edge":{"id":"edge"}}\n', '\ndata: [DONE]\n\n']) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    } }), { headers: { 'Content-Type': 'text/event-stream' } })
    const result = await api.analyzeVideoNode({ workflowId: 'wf', sourceNodeId: 'video', requestId: 'request' })
    assert.equal(result.node.id, 'text')
    assert.equal(result.edge.id, 'edge')
    for (const body of [': heartbeat\n\n', 'data: [DONE]\n\n', 'event: error\ndata: {"message":"积分不足","status":402}\n\n']) {
      globalThis.fetch = async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
      await assert.rejects(api.analyzeVideoNode({}), /未完成|积分不足/)
    }
  } finally { globalThis.fetch = original }
})

test('processing and failed node events are delivered before completion and failures still reject', async () => {
  const original = globalThis.fetch
  const processing = { status: 'processing', taskId: 'task', node: { id: 'node', data: { status: 'processing' } }, edge: { id: 'edge' } }
  const completed = { success: true, node: { id: 'node', data: { status: 'success' } }, edge: { id: 'edge' } }
  const updates = []
  try {
    globalThis.fetch = async () => new Response(`event: started\ndata: ${JSON.stringify(processing)}\n\nevent: result\ndata: ${JSON.stringify(completed)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    const result = await api.analyzeVideoNode({}, { onUpdate: data => updates.push(data) })
    assert.equal(updates[0].node.data.status, 'processing')
    assert.equal(result.node.id, processing.node.id)
    const error = { error: 'video_analysis_failed', status: 400, message: '上游失败', node: { id: 'node', data: { status: 'error' } }, edge: processing.edge }
    globalThis.fetch = async () => new Response(`event: error\ndata: ${JSON.stringify(error)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    await assert.rejects(api.analyzeVideoNode({}, { onUpdate: data => updates.push(data) }), /上游失败/)
    assert.equal(updates.at(-1).node.data.status, 'error')
  } finally { globalThis.fetch = original }
})

test('async acceptance is displayed first and task polling returns the same completed node', async () => {
  const original = globalThis.fetch
  const calls = [], updates = []
  const node = { id: 'node', data: { status: 'processing', processingStartedAt: 1000 } }, edge = { id: 'edge' }
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      if (calls.length === 1) return Response.json({ status: 'processing', taskId: 'task', node, edge }, { status: 202 })
      return Response.json({ success: true, status: 'completed', taskId: 'task', node: { ...node, data: { ...node.data, status: 'success', text: '视频描述' } }, edge })
    }
    const result = await api.analyzeVideoNode({ workflowId: 'wf' }, { onUpdate: state => updates.push(state) })
    assert.equal(JSON.parse(calls[0].options.body).async, true)
    assert.equal(updates[0].node.data.status, 'processing')
    assert.equal(result.node.id, node.id)
    assert.equal(calls[1].url, '/api/video-tools/analysis/tasks/task')
  } finally { globalThis.fetch = original }
})
