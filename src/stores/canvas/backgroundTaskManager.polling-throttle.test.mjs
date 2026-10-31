import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { normalizeTaskMediaResult } from '../../utils/canvasTaskResult.js'
import { withNoChargeNotice } from '../../utils/mediaTaskBillingMessage.js'
import { getTaskStatusConfig } from './backgroundTaskConfig.js'
import { classifyBackgroundTaskStatus } from './backgroundTaskStatus.js'
import { classifyPollingError } from './backgroundTaskErrorPolicy.js'

// 在受控的 HTTP 响应、定时器与 document 可见性下执行真实的任务管理器
function createHarness() {
  const requests = []
  const intervals = new Map()
  const timeouts = new Map()
  const windowListeners = new Map()
  const documentListeners = new Map()
  const events = []
  const storageWrites = []
  let nextTimer = 0
  const query = () => new Promise((resolve, reject) => requests.push({ resolve, reject }))
  const document = {
    hidden: false,
    addEventListener: (type, fn) => documentListeners.set(type, fn)
  }
  const context = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: () => null, setItem: (key, value) => storageWrites.push({ key, value }) },
    document,
    window: {
      addEventListener: (type, fn) => windowListeners.set(type, fn),
      dispatchEvent(event) {
        events.push({ type: event.type, status: event.detail.task.status, taskId: event.detail.taskId })
      }
    },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail } },
    setInterval: callback => { const id = ++nextTimer; intervals.set(id, callback); return id },
    clearInterval: id => intervals.delete(id),
    setTimeout: callback => { const id = ++nextTimer; timeouts.set(id, callback); return id },
    clearTimeout: id => timeouts.delete(id),
    normalizeTaskMediaResult, withNoChargeNotice, getTaskStatusConfig,
    classifyBackgroundTaskStatus, classifyPollingError,
    getImageTaskStatus: query, getVideoTaskStatus: query, getVideoHdTaskStatus: query,
    getImageHdTaskStatus: query, getImagePanoramaTaskStatus: query,
    getRemoveBackgroundTaskStatus: query, getAudioEditTaskStatus: query, getDigitalHumanTaskStatus: query
  }
  const source = readFileSync(new URL('./backgroundTaskManager.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/import\.meta\.hot/g, 'undefined')
    .replace(/^export /gm, '')
  const manager = vm.runInNewContext(`${source}\n;({ registerTask, getTask, getPendingTasks })`, context)
  return {
    manager, requests, events, storageWrites, document, timeouts,
    tick() { for (const callback of [...intervals.values()]) callback() },
    runTimeouts() { for (const [id, callback] of [...timeouts]) { timeouts.delete(id); callback() } },
    fireWindow(type) { windowListeners.get(type)?.() },
    fireDocument(type) { documentListeners.get(type)?.() },
    register(taskId = 'task-1') { manager.registerTask({ taskId, nodeId: 'node-1', tabId: 'tab-1', type: 'video' }) }
  }
}

const flush = () => new Promise(resolve => setImmediate(resolve))
const processing = { status: 'processing', progress: '生成中' }

test('poll tick is skipped while the previous status request is still in flight', async () => {
  const h = createHarness()
  h.register()
  assert.equal(h.requests.length, 1, 'register polls immediately')
  h.tick()
  h.tick()
  assert.equal(h.requests.length, 1, 'ticks during an in-flight request must not start new requests')

  h.requests[0].resolve(processing)
  await flush()
  h.tick()
  assert.equal(h.requests.length, 2, 'next tick polls again once the request has returned')
})

test('in-flight flag is released after a failed request', async () => {
  const h = createHarness()
  h.register()
  h.requests[0].reject(new Error('Failed to fetch'))
  await flush()
  h.tick()
  assert.equal(h.requests.length, 2)
})

test('hidden page polls only every 4th tick and polls immediately when visible again', async () => {
  const h = createHarness()
  h.register()
  h.requests[0].resolve(processing)
  await flush()

  h.document.hidden = true
  h.tick(); h.tick(); h.tick()
  assert.equal(h.requests.length, 1, 'first three hidden ticks are skipped')
  h.tick()
  assert.equal(h.requests.length, 2, '4th hidden tick polls (≈12s effective interval)')
  h.requests[1].resolve(processing)
  await flush()

  h.document.hidden = false
  h.fireDocument('visibilitychange')
  assert.equal(h.requests.length, 3, 'returning to foreground polls immediately')
  h.fireDocument('visibilitychange')
  assert.equal(h.requests.length, 3, 'immediate poll still respects the in-flight flag')
})

test('task storage writes are coalesced and flushed on pagehide/beforeunload', async () => {
  const h = createHarness()
  h.register('task-1')
  h.register('task-2')
  assert.equal(h.storageWrites.length, 0, 'saves are deferred')
  h.runTimeouts()
  assert.equal(h.storageWrites.length, 1, 'multiple saves collapse into one write')
  assert.equal(JSON.parse(h.storageWrites[0].value).length, 2)

  h.requests[0].resolve(processing)
  await flush()
  assert.equal(h.storageWrites.length, 1)
  h.fireWindow('pagehide')
  assert.equal(h.storageWrites.length, 2, 'pagehide flushes pending save immediately')
  assert.equal(h.timeouts.size, 0, 'flush cancels the pending debounce timer')

  h.requests[1].resolve(processing)
  await flush()
  h.fireWindow('beforeunload')
  assert.equal(h.storageWrites.length, 3, 'beforeunload flushes pending save immediately')
})

test('completion callbacks and events are unchanged', async () => {
  const h = createHarness()
  h.register()
  h.requests[0].resolve({ status: 'SUCCESS', video_url: 'https://example.com/video.mp4' })
  await flush()
  assert.equal(h.events.filter(e => e.type === 'background-task-complete').length, 1)
  assert.equal(h.manager.getTask('task-1').status, 'completed')
  assert.equal(h.manager.getPendingTasks().length, 0)
})
