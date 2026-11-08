import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const start = source.indexOf('async function ensureCanvasWorkflowForVideoSubmission')
const end = source.indexOf('\n}\n\n// 单次生成请求', start)
const body = source.slice(start, end)

test('existing team workflow video submission flushes incremental changes instead of saving a full snapshot', () => {
  assert.ok(start >= 0 && end > start, 'video submission workflow guard should exist')
  assert.match(body, /currentSpace\.spaceType\s*===\s*['"]team['"]/, 'team workflow branch should be explicit')
  assert.match(body, /flushIncrementalWriter/, 'team workflow should flush pending incremental operations')
  assert.match(body, /return\s*\{[\s\S]*workflowId/, 'team workflow should return its existing workflow id')
})
