import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'backgroundTaskManager.js'), 'utf8')

function extractFunction(name) {
  const marker = `function ${name}(`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${name} should exist`)
  const braceStart = source.indexOf('{', start)
  let depth = 0
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') depth -= 1
    if (depth === 0) return source.slice(start, i + 1)
  }
  throw new Error(`Could not extract ${name}`)
}

test('restored background tasks do not fail locally before checking server status', () => {
  const resumeBody = extractFunction('resumePendingTasks')

  assert.doesNotMatch(
    resumeBody,
    /notifyTaskFailed\(/,
    'resumePendingTasks should restart polling instead of marking stale local tasks failed'
  )
  assert.doesNotMatch(
    resumeBody,
    /任务 .*已超时/,
    'restore should not use local task age as a terminal status source'
  )
})

test('polling asks the backend before applying local timeout fallback', () => {
  const startPollingBody = extractFunction('startPolling')
  const serverQueryIndex = startPollingBody.indexOf('await getStatus(taskId)')
  const timeoutIndex = startPollingBody.indexOf('taskAge > pollTimeout')

  assert.notEqual(serverQueryIndex, -1, 'startPolling should query task status')
  assert.notEqual(timeoutIndex, -1, 'startPolling should retain a local timeout fallback')
  assert.ok(
    serverQueryIndex < timeoutIndex,
    'server status must win over stale local timeout metadata'
  )
})

test('ensureTaskPolling rechecks terminal local cache for processing canvas nodes', () => {
  const ensureBody = source.match(/export function ensureTaskPolling\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(ensureBody, /forceRefreshTerminal/)
  assert.match(
    ensureBody,
    /existingTask\.status === 'completed' \|\| existingTask\.status === 'failed'[\s\S]*startPolling\(taskId\)/,
    'existing local terminal cache should be re-polled when a canvas node still needs reconciliation'
  )
})
