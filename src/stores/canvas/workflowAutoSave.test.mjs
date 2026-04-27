import assert from 'node:assert/strict'
import {
  getWorkflowSession,
  getWorkflowHistory,
  saveWorkflowSession
} from './workflowAutoSave.js'

const storage = new Map()
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null
  },
  setItem(key, value) {
    storage.set(key, String(value))
  },
  removeItem(key) {
    storage.delete(key)
  }
}

const session = {
  tabs: [
    {
      id: 'tab-1',
      name: '工作流 1',
      workflowId: null,
      nodes: [{ id: 'node-1', type: 'text', position: { x: 0, y: 0 }, data: { title: 'Text' } }],
      edges: [],
      viewport: { x: 1, y: 2, zoom: 1 }
    },
    {
      id: 'tab-2',
      name: '工作流 2',
      workflowId: 'wf-2',
      nodes: [{ id: 'node-2', type: 'image', position: { x: 10, y: 20 }, data: { title: 'Image' } }],
      edges: [],
      viewport: { x: 3, y: 4, zoom: 0.8 }
    }
  ],
  activeTabId: 'tab-2'
}

assert.equal(saveWorkflowSession(session), true)

const restored = getWorkflowSession()
assert.equal(restored.tabs.length, 2)
assert.equal(restored.activeTabId, 'tab-2')
assert.deepEqual(restored.tabs.map(tab => tab.id), ['tab-1', 'tab-2'])
assert.deepEqual(restored.tabs.map(tab => tab.name), ['工作流 1', '工作流 2'])
assert.deepEqual(restored.tabs[1].nodes[0].id, 'node-2')

const now = Date.now()
storage.set('workflow_auto_saves', JSON.stringify([
  {
    id: 'history-old-format',
    name: '旧格式历史',
    nodes: JSON.stringify([{ id: 'old-node', type: 'text', position: { x: 0, y: 0 }, data: { title: 'Old' } }]),
    edges: JSON.stringify([{ id: 'old-edge', source: 'old-node', target: 'target-node' }]),
    viewport: JSON.stringify({ x: 9, y: 8, zoom: 0.7 }),
    savedAt: now
  }
]))

const history = getWorkflowHistory()
assert.equal(history.length, 1)
assert.equal(Array.isArray(history[0].nodes), true)
assert.equal(history[0].nodes[0].id, 'old-node')
assert.equal(Array.isArray(history[0].edges), true)
assert.equal(history[0].edges[0].id, 'old-edge')
assert.deepEqual(history[0].viewport, { x: 9, y: 8, zoom: 0.7 })

console.log('workflowAutoSave session tests passed')
