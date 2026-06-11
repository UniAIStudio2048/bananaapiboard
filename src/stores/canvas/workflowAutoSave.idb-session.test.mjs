import assert from 'node:assert/strict'

// ---- localStorage mock ----
const storage = new Map()
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) }
}

// ---- minimal in-memory IndexedDB mock (single store, get/put/delete) ----
const idbStore = new Map()
function makeRequest(resultFn) {
  const req = { onsuccess: null, onerror: null, result: undefined }
  queueMicrotask(() => {
    try { req.result = resultFn(); req.onsuccess && req.onsuccess() }
    catch (e) { req.error = e; req.onerror && req.onerror() }
  })
  return req
}
globalThis.window = globalThis
globalThis.indexedDB = {
  open() {
    const db = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => {},
      transaction() {
        const tx = { oncomplete: null, onerror: null, onabort: null }
        const store = {
          put(val) { idbStore.set(val.id, val); queueMicrotask(() => tx.oncomplete && tx.oncomplete()) },
          get(id) { return makeRequest(() => idbStore.get(id) || null) },
          delete(id) { idbStore.delete(id); queueMicrotask(() => tx.oncomplete && tx.oncomplete()) }
        }
        tx.objectStore = () => store
        return tx
      }
    }
    const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: db }
    queueMicrotask(() => { req.onsuccess && req.onsuccess() })
    return req
  }
}

const {
  saveWorkflowSession,
  saveWorkflowSessionAsync,
  getWorkflowSession,
  getWorkflowSessionAsync,
  clearWorkflowSession,
  getLastActiveWorkflowPointer
} = await import('./workflowAutoSave.js')

const SESSION_KEY = 'workflow_tab_session'
const POINTER_KEY = 'canvas_last_active_workflow'

function bigSession(tabId, extra = {}) {
  // build a session payload > 2MB so it routes to IndexedDB
  const bigText = 'x'.repeat(2_200_000)
  return {
    tabs: [{
      id: tabId,
      name: '大会话',
      workflowId: extra.workflowId || null,
      workflowSpaceType: extra.spaceType || null,
      nodes: [{ id: 'n1', type: 'text', position: { x: 0, y: 0 }, data: { title: 'big', notes: bigText } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 }
    }],
    activeTabId: tabId
  }
}

// 1) 大会话同步保存：localStorage 只存指针，getWorkflowSession（同步）返回 null
storage.clear(); idbStore.clear()
assert.equal(saveWorkflowSession(bigSession('tab-big', { workflowId: 'wf-1' })), true)
const ptrRaw = JSON.parse(storage.get(SESSION_KEY))
assert.equal(ptrRaw.__idb, true, '大会话 localStorage 应写指针')
assert.equal(getWorkflowSession(), null, '同步读遇 __idb 指针应返回 null，不抛错')
// 指针写入（activeTab 有 workflowId）
assert.equal(getLastActiveWorkflowPointer()?.workflowId, 'wf-1')

// 2) 大会话异步保存 + 异步读取：能从 IndexedDB 取回完整会话
storage.clear(); idbStore.clear()
assert.equal(await saveWorkflowSessionAsync(bigSession('tab-idb', { workflowId: 'wf-2' })), true)
const idbBack = await getWorkflowSessionAsync()
assert.ok(idbBack, '异步读应能从 IndexedDB 取回大会话')
assert.equal(idbBack.tabs[0].id, 'tab-idb')

// 3) getWorkflowSessionAsync 合并 localStorage 与 IndexedDB，返回 savedAt 较新者
storage.clear(); idbStore.clear()
// IDB 里放旧会话
idbStore.set('current', {
  id: 'current', tabs: [{ id: 'idb-old', name: '旧', nodes: [{ id: 'x' }], edges: [], viewport: {} }],
  activeTabId: 'idb-old', userId: null, savedAt: 1000
})
// localStorage 放新内联会话
storage.set(SESSION_KEY, JSON.stringify({
  tabs: [{ id: 'ls-new', name: '新', nodes: [{ id: 'y' }], edges: [], viewport: {} }],
  activeTabId: 'ls-new', userId: null, savedAt: Date.now()
}))
const merged = await getWorkflowSessionAsync()
assert.equal(merged.tabs[0].id, 'ls-new', 'localStorage 较新应返回内联会话')

// 反向：IDB 较新（带 __idb 指针），应返回 IDB 会话
storage.clear(); idbStore.clear()
idbStore.set('current', {
  id: 'current', tabs: [{ id: 'idb-new', name: '新', nodes: [{ id: 'z' }], edges: [], viewport: {} }],
  activeTabId: 'idb-new', userId: null, savedAt: Date.now()
})
storage.set(SESSION_KEY, JSON.stringify({ __idb: true, userId: null, savedAt: Date.now() - 100000, tabCount: 1 }))
const mergedIdb = await getWorkflowSessionAsync()
assert.equal(mergedIdb.tabs[0].id, 'idb-new', '指针场景应从 IDB 取回会话')

// 4) userId 不匹配：异步读应拒绝恢复
storage.clear(); idbStore.clear()
storage.set('user_id', 'user-a')
storage.set(SESSION_KEY, JSON.stringify({
  tabs: [{ id: 't', name: 'a', nodes: [{ id: 'a' }], edges: [], viewport: {} }],
  activeTabId: 't', userId: 'user-a', savedAt: Date.now()
}))
storage.set('user_id', 'user-b')
assert.equal(await getWorkflowSessionAsync(), null, 'userId 不匹配应拒绝恢复')

// 5) clearWorkflowSession 清理 localStorage 会话键、指针键、IndexedDB，且返回 true
storage.clear(); idbStore.clear()
storage.set(SESSION_KEY, 'whatever')
storage.set(POINTER_KEY, 'whatever')
idbStore.set('current', { id: 'current' })
assert.equal(clearWorkflowSession(), true)
assert.equal(storage.has(SESSION_KEY), false, '应清理会话键')
assert.equal(storage.has(POINTER_KEY), false, '应清理指针键')
await new Promise(r => setTimeout(r, 10))  // 等待 IndexedDB 异步删除
assert.equal(idbStore.has('current'), false, '应清理 IndexedDB 兜底数据')

// 6) getLastActiveWorkflowPointer userId 隔离
storage.clear()
storage.set('user_id', 'user-a')
storage.set(POINTER_KEY, JSON.stringify({ workflowId: 'wf-x', userId: 'user-b', savedAt: Date.now() }))
assert.equal(getLastActiveWorkflowPointer(), null, 'userId 不匹配的指针应返回 null')

console.log('workflowAutoSave IndexedDB/pointer session tests passed')
