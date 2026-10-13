import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  saveWorkflowToHistory, getWorkflowHistory, getWorkflowHistoryById,
  deleteWorkflowHistory, updateWorkflowHistoryDescription, clearWorkflowHistory,
  saveWorkflowSession, getWorkflowSession, getWorkflowSessionAsync,
  saveSpaceWorkflowSession, getSpaceWorkflowSessionAsync, getLastActiveWorkflowPointer
} from './workflowAutoSave.js'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
}
const login = id => {
  storage.set('user', JSON.stringify({ id }))
  storage.set('user_id', id)
  storage.set('userId', id)
  storage.set('token', `session-${id}`)
}
const workflow = name => ({
  name, workflowId: `workflow-${name}`,
  nodes: [{ id: `node-${name}`, type: 'text', position: { x: 0, y: 0 }, data: { text: name } }], edges: []
})
const session = name => ({ tabs: [{ id: `tab-${name}`, ...workflow(name) }], activeTabId: `tab-${name}` })
beforeEach(() => storage.clear())

test('new account cannot see or automatically restore another account history', () => {
  login('a')
  saveWorkflowToHistory(workflow('private-a'))
  const historyId = getWorkflowHistory()[0].id
  login('b')
  assert.deepEqual(getWorkflowHistory(), [])
  assert.equal(getWorkflowHistoryById(historyId), null)
  assert.equal(updateWorkflowHistoryDescription(historyId, 'changed by b'), false)
})

test('legacy history without an owner is never claimed by the next login', () => {
  storage.set('workflow_auto_saves', JSON.stringify([{ ...workflow('legacy-a'), savedAt: Date.now() }]))
  login('b')
  assert.deepEqual(getWorkflowHistory(), [])
})

test('A → B → A keeps each account history and deletion affects only the current account', () => {
  login('a')
  saveWorkflowToHistory(workflow('private-a'))
  const aId = getWorkflowHistory()[0].id
  login('b')
  saveWorkflowToHistory(workflow('private-b'))
  deleteWorkflowHistory(aId)
  clearWorkflowHistory()
  login('a')
  assert.deepEqual(getWorkflowHistory().map(item => item.name), ['private-a'])
})

test('logged-out sessions cannot read private history, tabs, spaces or server pointers', async () => {
  login('a')
  saveWorkflowToHistory(workflow('private-a'))
  saveWorkflowSession(session('private-a'))
  saveSpaceWorkflowSession('personal', session('private-a'))
  for (const key of ['user', 'user_id', 'userId', 'token']) storage.delete(key)
  assert.deepEqual(getWorkflowHistory(), [])
  assert.equal(getWorkflowSession(), null)
  assert.equal(await getWorkflowSessionAsync(), null)
  assert.equal(await getSpaceWorkflowSessionAsync('personal'), null)
  assert.equal(getLastActiveWorkflowPointer(), null)
  assert.equal(saveWorkflowToHistory(workflow('unowned')), false)
})

test('canonical user identity takes precedence over stale legacy user ID keys', () => {
  login('a')
  saveWorkflowSession(session('private-a'))
  storage.set('user', JSON.stringify({ id: 'b' }))
  assert.equal(getWorkflowSession(), null)
})

test('storage failure returns no history and recovers on the next read', () => {
  login('a')
  const getItem = localStorage.getItem
  localStorage.getItem = () => { throw new Error('storage unavailable') }
  try { assert.deepEqual(getWorkflowHistory(), []) } finally { localStorage.getItem = getItem }
  saveWorkflowToHistory(workflow('recovered-a'))
  assert.equal(getWorkflowHistory()[0].name, 'recovered-a')
})
