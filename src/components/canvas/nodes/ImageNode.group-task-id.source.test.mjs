import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const start = source.indexOf('function createGroupImageNodes')
const end = source.indexOf('function handleBackgroundTaskFailed', start)
const body = source.slice(start, end)

test('multi-image child nodes persist the originating task identity', () => {
  assert.ok(start >= 0 && end > start)
  assert.match(body, /taskId:\s*task\.taskId/)
  assert.match(body, /taskType:\s*task\.type\s*\|\|\s*['"]image['"]/)
})
