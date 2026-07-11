import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

test('VideoNode creates a durable pending submission before posting video generation', () => {
  const sendStart = source.indexOf('async function sendGenerateRequest')
  const fetchIndex = source.indexOf("fetch(getApiUrl('/api/videos/generate')", sendStart)
  const createIndex = source.indexOf('createPendingGenerationSubmission', sendStart)

  assert.ok(sendStart >= 0, 'sendGenerateRequest should exist')
  assert.ok(createIndex > sendStart, 'sendGenerateRequest should create a pending submission')
  assert.ok(createIndex < fetchIndex, 'pending submission must be persisted before the backend request starts')
  assert.match(source.slice(sendStart, fetchIndex), /formData\.append\('client_submission_id'/)
  assert.match(source.slice(sendStart, fetchIndex), /formData\.append\('canvas_node_id',\s*nodeId\)/)
  assert.match(source.slice(sendStart, fetchIndex), /formData\.append\('canvas_tab_id'/)
  assert.match(source.slice(sendStart, fetchIndex), /formData\.append\('canvas_workflow_id'/)
})

test('VideoNode links returned task ids back to the pending submission for later cleanup', () => {
  const executeStart = source.indexOf('async function executeNodeGeneration')
  const executeEnd = source.indexOf('// 计算错峰模式的轮询间隔', executeStart)
  const executeSource = source.slice(executeStart, executeEnd)

  assert.match(executeSource, /sendGenerateRequest\(nodeId,\s*finalPrompt,\s*finalImages,\s*capturedState\)/)
  assert.match(executeSource, /markSubmissionTaskCreated\(submissionId,\s*taskId\)/)
  assert.match(executeSource, /clientSubmissionId:\s*submissionId/)
  assert.match(executeSource, /removeGenerationSubmission\(submissionId\)/)
})
