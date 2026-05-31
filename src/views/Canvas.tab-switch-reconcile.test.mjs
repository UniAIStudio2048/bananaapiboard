import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const canvasSource = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')
const backgroundTaskManagerSource = readFileSync(
  join(__dirname, '../stores/canvas/backgroundTaskManager.js'),
  'utf8'
)

test('Canvas reconciles background tasks after the active workflow tab changes', () => {
  assert.match(
    canvasSource,
    /watch\(\s*\(\)\s*=>\s*canvasStore\.activeTabId[\s\S]*?reconcileTasksForActiveTab\(\)/,
    'Canvas should watch canvasStore.activeTabId and reconcile tasks after tab switches'
  )
})

test('Canvas active-tab reconciliation restarts polling and writes terminal task state', () => {
  const reconcileMatch = canvasSource.match(/function reconcileTasksForActiveTab\(\) \{[\s\S]*?\n\}/)
  assert.ok(reconcileMatch, 'Canvas should define reconcileTasksForActiveTab')

  const reconcileSource = reconcileMatch[0]
  assert.match(
    reconcileSource,
    /node\.data\?\.status !== 'processing'/,
    'reconcile should only process nodes that are still generating'
  )
  assert.match(
    reconcileSource,
    /ensureTaskPolling\(/,
    'reconcile should ensure polling exists for canvas node task ids'
  )
  assert.match(
    reconcileSource,
    /updateNodeFromTask\(task\)/,
    'reconcile should write completed or failed task state back through updateNodeFromTask'
  )
})

test('backgroundTaskManager exports idempotent ensureTaskPolling that reuses startPolling', () => {
  const ensureMatch = backgroundTaskManagerSource.match(/export function ensureTaskPolling\([\s\S]*?\n\}/)
  assert.ok(ensureMatch, 'backgroundTaskManager should export ensureTaskPolling')

  const ensureSource = ensureMatch[0]
  assert.match(
    ensureSource,
    /tasks\.get\(taskId\)/,
    'ensureTaskPolling should first check the in-memory task registry'
  )
  assert.match(
    ensureSource,
    /pollingTimers\.has\(taskId\)/,
    'ensureTaskPolling should check whether polling is already active'
  )
  assert.match(
    ensureSource,
    /startPolling\(taskId\)/,
    'ensureTaskPolling should reuse startPolling so the existing idempotent timer guard applies'
  )
  assert.match(
    ensureSource,
    /registerTask\(/,
    'ensureTaskPolling should re-register missing tasks from canvas node data'
  )
})
