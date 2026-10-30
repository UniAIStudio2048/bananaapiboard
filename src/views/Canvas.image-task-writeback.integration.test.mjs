import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { getTaskMediaUrl, normalizeTaskMediaResult } from '../utils/canvasTaskResult.js'
import { withNoChargeNotice } from '../utils/mediaTaskBillingMessage.js'
import { getTaskStatusConfig } from '../stores/canvas/backgroundTaskConfig.js'
import { classifyBackgroundTaskStatus } from '../stores/canvas/backgroundTaskStatus.js'
import { classifyPollingError } from '../stores/canvas/backgroundTaskErrorPolicy.js'

const canvasSource = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')
const managerSource = readFileSync(new URL('../stores/canvas/backgroundTaskManager.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/import\.meta\.hot/g, 'undefined')
  .replace(/^export /gm, '')

function extractFunction(name) {
  const start = canvasSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} is missing`)
  const end = canvasSource.indexOf('\n}', start)
  assert.notEqual(end, -1, `${name} is incomplete`)
  const prefix = canvasSource.slice(start - 6, start) === 'async ' ? 'async ' : ''
  return prefix + canvasSource.slice(start, end + 2)
}

function createHarness(result) {
  const node = { id: 'image-node', data: { status: 'processing', taskId: 'task-1' } }
  const tab = { id: 'tab-1', workflowId: 'workflow-1', name: 'Test workflow', hasChanges: true }
  const storage = new Map()
  const timeouts = new Map()
  const intervals = new Map()
  const saves = []
  const events = []
  const errors = []
  let nextTimer = 0
  let manager
  let canvas

  const canvasStore = {
    activeTabId: tab.id,
    nodes: [node],
    edges: [],
    getCurrentTab: () => tab,
    updateNodeData: (_nodeId, patch) => { Object.assign(node.data, patch) },
    findInactiveWorkflowTabNode: () => null,
    exportWorkflowForSave: () => ({ nodes: structuredClone([node]), edges: [], viewport: {} }),
    markCurrentTabSaved: () => { tab.hasChanges = false }
  }
  const context = {
    console: { log() {}, warn: (...args) => errors.push(args.map(String).join(' ')), error: (...args) => errors.push(args.map(String).join(' ')) },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    window: {
      addEventListener() {},
      dispatchEvent(event) {
        events.push(event.type)
        if (event.type === 'background-task-complete') canvas.handleBackgroundTaskComplete(event)
      }
    },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail } },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timeouts.set(id, { callback, delay }); return id },
    clearTimeout: id => timeouts.delete(id),
    setInterval: callback => { const id = ++nextTimer; intervals.set(id, callback); return id },
    clearInterval: id => intervals.delete(id),
    canvasStore,
    teamStore: { getSpaceParams: () => ({ spaceType: 'personal', teamId: null }) },
    uploadManager: { failedCount: 0 },
    findBlockingCanvasUploads: () => [],
    lastAutoSave: { value: null },
    _isCanvasDragging: false,
    _persistAfterTaskTimer: null,
    PERSIST_AFTER_TASK_DEBOUNCE_MS: 200,
    fakeWorkflowModule: { saveWorkflowRaw: async json => { saves.push(JSON.parse(json)); return {} } },
    fakeSerializerModule: {
      serializeWorkflow: async payload => {
        const json = JSON.stringify(payload)
        return { json, size: Buffer.byteLength(json), viaWorker: false, elapsed: 0 }
      }
    },
    removeGenerationSubmission() {},
    removeCompletedTask: taskId => manager.removeCompletedTask(taskId),
    getTaskMediaUrl, normalizeTaskMediaResult, withNoChargeNotice, getTaskStatusConfig,
    classifyBackgroundTaskStatus, classifyPollingError,
    getImageTaskStatus: async () => result
  }

  const autoSave = extractFunction('autoSaveWorkflow')
    .replace("import('@/api/canvas/workflow')", 'Promise.resolve(fakeWorkflowModule)')
    .replace("import('@/utils/workflowSerializer')", 'Promise.resolve(fakeSerializerModule)')
  assert.doesNotMatch(autoSave, /import\(/)
  canvas = vm.runInNewContext([
    extractFunction('collectImageTaskOutputUrls'),
    autoSave,
    extractFunction('handleBackgroundTaskComplete'),
    extractFunction('schedulePersistAfterTask'),
    extractFunction('updateNodeFromTask'),
    ';({ handleBackgroundTaskComplete })'
  ].join('\n'), context)
  manager = vm.runInNewContext(`${managerSource}\n;({ registerTask, removeCompletedTask })`, context)

  return {
    node, saves, events, errors,
    register: () => manager.registerTask({ taskId: 'task-1', type: 'image', nodeId: node.id, tabId: tab.id }),
    persist() {
      for (const [id, timer] of timeouts) {
        if (timer.delay === 200) {
          timeouts.delete(id)
          timer.callback()
        }
      }
    }
  }
}

for (const [mode, result] of [
  ['text-to-image', { id: 'task-1', status: 'completed', url: 'https://cdn.example/text.png' }],
  ['image-to-image', { id: 'task-1', status: 'completed', url: 'https://cdn.example/edit.png' }]
]) {
  test(`${mode} background result updates and persists the active canvas node`, async () => {
    const harness = createHarness(result)
    harness.register()
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(harness.events.includes('background-task-complete'))
    assert.equal(harness.node.data.status, 'success')
    assert.equal(harness.node.data.output.url, result.url)
    harness.persist()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(harness.saves.length, 1, harness.errors.join('; '))
    assert.equal(harness.saves[0].id, 'workflow-1')
    assert.equal(harness.saves[0].nodes[0].data.taskId, 'task-1')
    assert.equal(harness.saves[0].nodes[0].data.output.urls[0], result.url)
  })
}
