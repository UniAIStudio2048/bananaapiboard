import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { normalizeTaskMediaResult } from '../../utils/canvasTaskResult.js'
import { withNoChargeNotice } from '../../utils/mediaTaskBillingMessage.js'
import { getTaskStatusConfig } from './backgroundTaskConfig.js'
import { classifyBackgroundTaskStatus } from './backgroundTaskStatus.js'
import { classifyPollingError } from './backgroundTaskErrorPolicy.js'

// Execute the real manager with controlled HTTP responses and browser timers.
function createHarness({ removeOnComplete = false } = {}) {
  const requests = []
  const timers = new Map()
  const events = []
  let nextTimer = 0
  const query = () => new Promise((resolve, reject) => requests.push({ resolve, reject }))
  const storage = new Map()
  let manager
  const context = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    window: {
      addEventListener() {},
      dispatchEvent(event) {
        events.push({ type: event.type, status: event.detail.task.status, taskId: event.detail.taskId })
        if (removeOnComplete && event.type === 'background-task-complete') {
          manager.removeCompletedTask(event.detail.taskId)
        }
      }
    },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail } },
    setInterval: callback => { const id = ++nextTimer; timers.set(id, callback); return id },
    clearInterval: id => timers.delete(id),
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
  manager = vm.runInNewContext(`${source}\n;({ registerTask, getTask, getPendingTasks, removeCompletedTask, stopAllPolling, ensureTaskPolling })`, context)
  return {
    manager, requests, events, timers,
    tick() { for (const callback of [...timers.values()]) callback() },
    register(type = 'video') { manager.registerTask({ taskId: 'task-1', nodeId: 'node-1', tabId: 'tab-1', type }) }
  }
}

const flush = () => new Promise(resolve => setImmediate(resolve))
const success = { status: 'SUCCESS', video_url: 'https://example.com/video.mp4' }

for (const removeOnComplete of [false, true]) {
  test(`late processing response cannot undo completion (node removes task: ${removeOnComplete})`, async () => {
    const h = createHarness({ removeOnComplete })
    h.register()
    h.tick()
    assert.equal(h.requests.length, 2)
    h.requests[1].resolve(success)
    await flush()
    h.requests[0].resolve({ status: 'processing', progress: '生成中' })
    await flush()
    assert.equal(h.events.filter(e => e.type === 'background-task-complete').length, 1)
    assert.equal(h.events.filter(e => e.type === 'background-task-progress').length, 0)
    assert.equal(h.manager.getPendingTasks().length, 0)
    assert.equal(h.timers.size, 0)
    assert.equal(h.manager.getTask('task-1')?.status, removeOnComplete ? undefined : 'completed')
  })
}

test('late HTTP error cannot replace a completed video with failure', async () => {
  const h = createHarness()
  h.register()
  h.tick()
  h.requests[1].resolve(success)
  await flush()
  h.requests[0].reject(Object.assign(new Error('401 Unauthorized'), { status: 401 }))
  await flush()
  assert.equal(h.manager.getTask('task-1').status, 'completed')
  assert.equal(h.events.filter(e => e.type === 'background-task-failed').length, 0)
})

test('a stopped polling run cannot mutate or stop the resumed run for the same task', async () => {
  const h = createHarness()
  h.register()
  h.manager.stopAllPolling()
  h.manager.ensureTaskPolling({ taskId: 'task-1', nodeId: 'node-1', type: 'video', tabId: 'tab-1' })
  h.requests[0].resolve({ status: 'FAILURE', fail_reason: 'obsolete response' })
  await flush()
  assert.equal(h.events.length, 0)
  assert.equal(h.timers.size, 1)
  h.requests[1].resolve(success)
  await flush()
  assert.equal(h.manager.getTask('task-1').status, 'completed')
})

test('re-registering a task invalidates the old task object response', async () => {
  const h = createHarness()
  h.register()
  h.register()
  h.requests[0].resolve({ status: 'FAILURE', fail_reason: 'obsolete task' })
  await flush()
  assert.equal(h.events.length, 0)
  h.tick()
  h.requests.at(-1).resolve(success)
  await flush()
  assert.equal(h.manager.getTask('task-1').status, 'completed')
})

for (const [type, result] of [
  ['video', success],
  ['image', { status: 'SUCCESS', url: 'https://example.com/image.png' }],
  ['audio-edit', { status: 'completed', audio_url: 'https://example.com/audio.mp3' }],
  ['video-hd', success]
]) {
  test(`${type} still retries network failure and completes once`, async () => {
    const h = createHarness()
    h.register(type)
    h.requests[0].reject(new Error('Failed to fetch'))
    await flush()
    assert.equal(h.timers.size, 1)
    h.tick()
    h.requests[1].resolve({ status: 'processing' })
    await flush()
    assert.equal(h.manager.getTask('task-1').status, 'processing')
    h.tick()
    h.tick()
    h.requests[3].resolve(result)
    await flush()
    h.requests[2].resolve(result)
    await flush()
    assert.equal(h.manager.getTask('task-1').status, 'completed')
    assert.equal(h.events.filter(e => e.type === 'background-task-complete').length, 1)
    assert.equal(h.events.filter(e => e.type === 'canvas-history-invalidate').length, 1)
    assert.equal(h.timers.size, 0)
  })
}
