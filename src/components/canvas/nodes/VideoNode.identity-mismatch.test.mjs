import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(__dirname, 'VideoNode.vue'), 'utf8')

test('VideoNode exposes retry action for paused identity-mismatch video tasks', () => {
  const handlerStart = source.indexOf('function handleBackgroundTaskNetworkError')
  assert.ok(handlerStart >= 0, 'network error handler should exist')

  const handlerEnd = source.indexOf('function handleBackgroundTaskNetworkRecovered', handlerStart)
  assert.ok(handlerEnd > handlerStart, 'network recovered handler should follow network error handler')

  const handler = source.slice(handlerStart, handlerEnd)
  assert.match(handler, /_pausedByIdentityMismatch/)
  assert.match(handler, /status:\s*'error'/)
  assert.match(handler, /_failedTaskId:\s*task\.taskId/)
})
