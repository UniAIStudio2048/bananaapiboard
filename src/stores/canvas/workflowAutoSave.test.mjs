import assert from 'node:assert/strict'
import {
  getWorkflowSession,
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

console.log('workflowAutoSave session tests passed')
