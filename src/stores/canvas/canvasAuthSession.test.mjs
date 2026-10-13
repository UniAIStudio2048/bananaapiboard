import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { ref, computed, reactive } from 'vue'
import { bindCanvasAuthSession } from './canvasAuthSession.js'
import { createOpHistory } from './opHistory.js'

let token = 'session-a'
globalThis.localStorage = { getItem: key => key === 'token' ? token : null }
beforeEach(() => { token = 'session-a' })

function fixture() {
  const events = new EventTarget()
  const store = {
    nodes: [{ id: 'private-a' }], workflowTabs: [{ id: 'tab-a' }],
    clipboard: { nodes: [{ id: 'copied-a' }] }, nodeGroups: [{ id: 'group-a' }],
    editingNodeId: 'private-a', editModeViewport: {}, editTool: 'crop',
    closeAllTabs() { this.nodes = []; this.workflowTabs = [] }
  }
  const dispose = bindCanvasAuthSession(store, events)
  return { store, events, dispose }
}

for (const eventName of ['auth-session-cleared', 'auth-session-updated', 'storage']) {
  test(`${eventName} clears old canvas data before the next account can save it`, () => {
    const { store, events, dispose } = fixture()
    token = eventName === 'auth-session-cleared' ? null : 'session-b'
    events.dispatchEvent(new Event(eventName))
    assert.deepEqual(store.nodes, [])
    assert.deepEqual(store.workflowTabs, [])
    assert.equal(store.clipboard, null)
    assert.deepEqual(store.nodeGroups, [])
    assert.equal(store.editingNodeId, null)
    dispose()
  })
}

test('same session events preserve the canvas and disposal removes listeners', () => {
  const { store, events, dispose } = fixture()
  events.dispatchEvent(new Event('storage'))
  events.dispatchEvent(new Event('auth-session-updated'))
  assert.equal(store.nodes.length, 1)
  dispose()
  token = 'session-b'
  events.dispatchEvent(new Event('auth-session-updated'))
  assert.equal(store.nodes.length, 1)
})

test('actual canvas Store clipboard is cleared, so paste cannot resurrect the previous account nodes', () => {
  const source = readFileSync(new URL('./canvasStore.js', import.meta.url), 'utf8')
  const ast = parse(source, { sourceType: 'module' })
  const declaration = ast.program.body.find(node => node.type === 'ExportNamedDeclaration'
    && node.declaration?.declarations?.[0]?.id.name === 'useCanvasStore')
  const factory = declaration.declaration.declarations[0].init.arguments[1]
  const setup = runInNewContext(`(${source.slice(factory.start, factory.end)})`, {
    ref, computed, createOpHistory, console: { log() {} }
  })
  const store = reactive(setup())
  store.nodes = [{ id: 'private-a', type: 'text', data: { text: 'private' } }]
  store.selectedNodeIds = ['private-a']
  store.copySelectedNodes()
  assert.equal(store.hasClipboard, true)
  const events = new EventTarget()
  const dispose = bindCanvasAuthSession(store, events)
  token = 'session-b'
  events.dispatchEvent(new Event('auth-session-updated'))
  assert.equal(store.hasClipboard, false)
  store.pasteNodes()
  assert.equal(store.nodes.length, 0)
  assert.equal(store.canUndo, false)
  dispose()
})

const canvasSource = readFileSync(new URL('../../views/Canvas.vue', import.meta.url), 'utf8')
function restoreFunction(name, deps) {
  const start = canvasSource.indexOf(`async function ${name}(`)
  const end = canvasSource.indexOf('\n}', start) + 2
  return new Function(...Object.keys(deps), `${canvasSource.slice(start, end)}; return ${name}`)(...Object.values(deps))
}

for (const name of ['tryAutoRestoreWorkflowSession', 'tryRestoreFromServerPointer']) {
  test(`${name} discards a late response after identity replacement`, async () => {
    let resolve
    const pending = new Promise(done => { resolve = done })
    const applied = []
    const restore = restoreFunction(name, {
      getWorkflowSessionAsync: () => pending,
      getLastActiveWorkflowPointer: () => ({ workflowId: 'private-a', userId: 'a' }),
      loadWorkflowFromServer: () => pending,
      me: { value: { id: 'a' } },
      canvasStore: {
        restoreWorkflowSession: data => { applied.push(data); return true },
        openWorkflowInNewTab: data => applied.push(data)
      }
    })
    const restoring = restore()
    token = 'session-b'
    resolve({ tabs: [{ id: 'private-a' }], workflow: { id: 'private-a' } })
    assert.equal(await restoring, false)
    assert.deepEqual(applied, [])
  })
}
