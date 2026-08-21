import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('VideoNode persists the current canvas before it submits a video task', () => {
  assert.match(source, /async function ensureCanvasWorkflowForVideoSubmission\(nodeId\)/)
  assert.match(source, /const \{ currentTab, workflowId \} = await ensureCanvasWorkflowForVideoSubmission\(nodeId\)/)
  assert.match(source, /formData\.append\('canvas_workflow_id', workflowId\)/)
})

test('VideoNode stops submission when the canvas draft cannot be persisted', () => {
  assert.match(source, /throw new Error\('画布保存失败，无法提交视频生成任务'\)/)
  assert.match(source, /canvasStore\.exportWorkflowForSave\(\)/)
})
