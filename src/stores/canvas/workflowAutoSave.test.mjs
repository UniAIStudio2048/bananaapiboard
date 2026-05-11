import assert from 'node:assert/strict'
import {
  getWorkflowSession,
  getWorkflowHistory,
  saveWorkflowSession,
  saveWorkflowToHistory,
  updateWorkflowHistoryDescription,
  formatBeijingSaveTime
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
      description: '标签描述',
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
assert.equal(restored.tabs[1].description, '标签描述')
assert.deepEqual(restored.tabs[1].nodes[0].id, 'node-2')

assert.equal(saveWorkflowSession({
  tabs: [
    {
      id: 'tab-edit',
      name: '编辑会话',
      nodes: [{
        id: 'image-edit',
        type: 'image',
        position: { x: 0, y: 0 },
        data: {
          title: 'Image',
          editSession: {
            version: 1,
            historyIndex: 0,
            history: [
              { snapshotUrl: 'https://cdn.example.com/snapshot-1.png' },
              { snapshotUrl: 'data:image/png;base64,AAAA' }
            ]
          }
        }
      }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  ],
  activeTabId: 'tab-edit'
}), true)

const restoredEditSession = getWorkflowSession()
assert.equal(
  restoredEditSession.tabs[0].nodes[0].data.editSession.history.length,
  1
)
assert.equal(
  restoredEditSession.tabs[0].nodes[0].data.editSession.history[0].snapshotUrl,
  'https://cdn.example.com/snapshot-1.png'
)

assert.equal(saveWorkflowSession({
  tabs: [
    {
      id: 'tab-storyboard',
      name: '分镜会话',
      nodes: [{
        id: 'storyboard-1',
        type: 'storyboard',
        position: { x: 0, y: 0 },
        data: {
          title: '分镜格子',
          images: [
            'https://cdn.example.com/frame-1.png',
            null,
            'blob:https://app.local/frame-2',
            'data:image/png;base64,AAAA',
            '/api/images/file/frame-5.png'
          ]
        }
      }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  ],
  activeTabId: 'tab-storyboard'
}), true)

const restoredStoryboardSession = getWorkflowSession()
assert.deepEqual(
  restoredStoryboardSession.tabs[0].nodes[0].data.images,
  [
    'https://cdn.example.com/frame-1.png',
    null,
    null,
    null,
    '/api/images/file/frame-5.png'
  ]
)

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

assert.equal(formatBeijingSaveTime(Date.UTC(2026, 4, 1, 6, 5)), '2026/05/01 14:05')

assert.equal(updateWorkflowHistoryDescription('history-old-format', '新的历史描述'), true)
const updatedHistory = getWorkflowHistory()
assert.equal(updatedHistory[0].description, '新的历史描述')

assert.equal(updateWorkflowHistoryDescription('missing-history', '不会写入'), false)

storage.set('workflow_auto_saves', JSON.stringify([
  {
    id: 'history-within-retention',
    name: '14天内历史',
    nodes: [{ id: 'recent-node', type: 'text', position: { x: 0, y: 0 }, data: { title: 'Recent' } }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    savedAt: now - 14 * 24 * 60 * 60 * 1000
  },
  {
    id: 'history-expired',
    name: '超过15天历史',
    nodes: [{ id: 'expired-node', type: 'text', position: { x: 0, y: 0 }, data: { title: 'Expired' } }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    savedAt: now - 15 * 24 * 60 * 60 * 1000 - 1
  }
]))

const retainedHistory = getWorkflowHistory()
assert.equal(retainedHistory.length, 1)
assert.equal(retainedHistory[0].id, 'history-within-retention')

storage.set('workflow_tab_session', JSON.stringify({
  tabs: [
    {
      id: 'tab-within-retention',
      name: '14天内会话',
      nodes: [{ id: 'session-node', type: 'text', position: { x: 0, y: 0 }, data: { title: 'Session' } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  ],
  activeTabId: 'tab-within-retention',
  userId: null,
  savedAt: now - 14 * 24 * 60 * 60 * 1000
}))

const retainedSession = getWorkflowSession()
assert.equal(retainedSession.tabs.length, 1)
assert.equal(retainedSession.activeTabId, 'tab-within-retention')

storage.delete('workflow_auto_saves')
assert.equal(saveWorkflowToHistory({
  name: '带描述的自动保存',
  description: '自动保存时保留的描述',
  nodes: [{ id: 'node-desc', type: 'text', position: { x: 0, y: 0 }, data: { title: 'Desc' } }],
  edges: []
}), true)
assert.equal(getWorkflowHistory()[0].description, '自动保存时保留的描述')

storage.clear()
storage.set('user_id', 'user-a')
assert.equal(saveWorkflowSession({
  tabs: [
    {
      id: 'tab-user-a',
      name: '用户 A 的画布',
      nodes: [{ id: 'node-user-a', type: 'text', position: { x: 0, y: 0 }, data: { title: 'A' } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  ],
  activeTabId: 'tab-user-a'
}), true)

storage.set('user_id', 'user-b')
assert.equal(getWorkflowSession(), null)
assert.equal(storage.has('workflow_tab_session'), false)

console.log('workflowAutoSave session tests passed')
