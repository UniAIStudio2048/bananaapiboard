import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')

test('Canvas registers background task event listeners before manager initialization can emit completion events', () => {
  const mountedBody = source.match(/onMounted\(async \(\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''
  const initIndex = mountedBody.indexOf('initBackgroundTaskManager()')
  const progressListenerIndex = mountedBody.indexOf("window.addEventListener('background-task-progress'")
  const completeListenerIndex = mountedBody.indexOf("window.addEventListener('background-task-complete'")
  const failedListenerIndex = mountedBody.indexOf("window.addEventListener('background-task-failed'")

  assert.notEqual(initIndex, -1, 'Canvas should initialize the background task manager on mount')
  assert.notEqual(progressListenerIndex, -1, 'Canvas should listen for background task progress events')
  assert.notEqual(completeListenerIndex, -1, 'Canvas should listen for background task completion events')
  assert.notEqual(failedListenerIndex, -1, 'Canvas should listen for background task failure events')

  assert.ok(progressListenerIndex < initIndex, 'progress listener must be registered before initialization')
  assert.ok(completeListenerIndex < initIndex, 'completion listener must be registered before initialization')
  assert.ok(failedListenerIndex < initIndex, 'failure listener must be registered before initialization')
})

test('Canvas initializes background task manager after canvas nodes are restored or created', () => {
  const mountedBody = source.match(/onMounted\(async \(\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''
  const initIndex = mountedBody.indexOf('initBackgroundTaskManager()')
  const sessionRestoreIndex = mountedBody.indexOf('tryAutoRestoreWorkflowSession()')
  const defaultTabIndex = mountedBody.indexOf('canvasStore.initDefaultTab()')
  const restoreSubscriptionsIndex = mountedBody.indexOf('restoreBackgroundTasks()')
  const zombieCheckIndex = mountedBody.indexOf('failZombieCanvasVideoNodes()')

  assert.notEqual(initIndex, -1, 'Canvas should initialize the background task manager on mount')
  assert.notEqual(sessionRestoreIndex, -1, 'Canvas should try to restore workflow session nodes')
  assert.notEqual(defaultTabIndex, -1, 'Canvas should create a default tab when no workflow is restored')
  assert.notEqual(restoreSubscriptionsIndex, -1, 'Canvas should subscribe to restored background tasks')
  assert.notEqual(zombieCheckIndex, -1, 'Canvas should check zombie nodes after task state is loaded')

  assert.ok(sessionRestoreIndex < initIndex, 'background task manager should start after workflow session restore')
  assert.ok(defaultTabIndex < initIndex, 'background task manager should start after default tab initialization branch')
  assert.ok(initIndex < restoreSubscriptionsIndex, 'background task subscriptions should run after task state is loaded')
  assert.ok(restoreSubscriptionsIndex < zombieCheckIndex, 'zombie node checks should run after task subscriptions are restored')
})

test('Canvas exit persistence saves existing workflows even when the dirty flag was missed', () => {
  const saveExitMatch = source.match(/function saveCanvasExitState\(reason = 'exit'\) \{[\s\S]*?\n\}/)
  assert.ok(saveExitMatch, 'Canvas should define saveCanvasExitState')
  const saveExitSource = saveExitMatch[0]

  assert.match(
    saveExitSource,
    /currentTab\?\.workflowId/,
    'exit persistence should target already saved workflows'
  )
  assert.doesNotMatch(
    saveExitSource,
    /currentTab\?\.workflowId && currentTab\?\.hasChanges/,
    'saved workflow exit persistence should not depend on hasChanges because progress updates can miss the dirty flag'
  )
  assert.match(
    saveExitSource,
    /cleanedData = canvasStore\.exportWorkflowForSave\(\)/,
    'exit persistence should build a cleaned server-save payload for existing workflows'
  )
})

test('Canvas persists saved workflow progress when the canvas route unmounts', () => {
  const unmountedBody = source.match(/onUnmounted\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''
  const persistIndex = unmountedBody.indexOf("persistCurrentWorkflowOnExit('unmounted')")
  const stopIndex = unmountedBody.indexOf('stopAutoSave()')

  assert.notEqual(persistIndex, -1, 'Canvas unmount should persist the current saved workflow')
  assert.notEqual(stopIndex, -1, 'Canvas unmount should still stop the autosave timer')
  assert.ok(persistIndex < stopIndex, 'Canvas should persist before stopping autosave during route exit')
})
