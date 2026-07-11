import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./uploadManager.js', import.meta.url), 'utf8')

function extractStoreSetup() {
  const marker = "defineStore('uploadManager', () =>"
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, 'uploadManager store setup must exist')
  const bodyStart = source.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(bodyStart, index + 1)
  }
  assert.fail('uploadManager store setup must have a complete body')
}

function createManager(uploadCanvasMedia = async () => ({ status: 'completed', url: 'https://cdn.test/file' })) {
  const scheduled = []
  const cleared = []
  const cancelled = []
  const setupBody = extractStoreSetup()
  const setup = new Function(
    'ref',
    'computed',
    'uploadCanvasMedia',
    'cancelCanvasUpload',
    'setTimeout',
    'clearTimeout',
    `return (() => ${setupBody})()`
  )
  const manager = setup(
    value => ({ value }),
    getter => ({ get value() { return getter() } }),
    uploadCanvasMedia,
    (nodeId, tabId) => cancelled.push([nodeId, tabId]),
    callback => {
      const timer = { callback }
      scheduled.push(timer)
      return timer
    },
    timer => cleared.push(timer)
  )
  return { manager, scheduled, cleared, cancelled }
}

function failedTask(nodeId, tabId) {
  return {
    nodeId,
    tabId,
    file: { name: `${nodeId}.png` },
    type: 'image',
    blobUrl: `blob:${nodeId}`,
    field: 'sourceImages',
    error: 'failed'
  }
}

test('cancelNodeRetries removes a matching pending task and its waiting timer', () => {
  const { manager, scheduled, cleared, cancelled } = createManager()
  assert.equal(typeof manager.cancelNodeRetries, 'function')
  manager.registerFailedUpload('task-a', failedTask('node-a', 'tab-a'))
  manager.registerFailedUpload('task-b', failedTask('node-a', 'tab-b'))

  manager.cancelNodeRetries('node-a', 'tab-a')

  assert.equal(manager.pendingUploads.value.has('task-a'), false)
  assert.equal(manager.pendingUploads.value.has('task-b'), true)
  assert.deepEqual(cleared, [scheduled[0]])
  assert.deepEqual(cancelled, [['node-a', 'tab-a']])
})

test('an aborted active retry is removed without scheduling another retry', async () => {
  const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })
  const { manager, scheduled, cleared } = createManager(async () => { throw abortError })
  assert.equal(typeof manager.cancelNodeRetries, 'function')
  manager.registerFailedUpload('task-active', failedTask('node-active', 'tab-active'))

  await manager.retryUpload('task-active')

  assert.equal(manager.pendingUploads.value.has('task-active'), false)
  assert.equal(scheduled.length, 1)
  assert.deepEqual(cleared, [scheduled[0]])
})

test('cancelAllRetries clears every pending task and waiting timer', () => {
  const { manager, scheduled, cleared } = createManager()
  assert.equal(typeof manager.cancelAllRetries, 'function')
  manager.registerFailedUpload('task-a', failedTask('node-a', 'tab-a'))
  manager.registerFailedUpload('task-b', failedTask('node-b', 'tab-b'))

  manager.cancelAllRetries()

  assert.equal(manager.pendingUploads.value.size, 0)
  assert.deepEqual(cleared, scheduled)
})
