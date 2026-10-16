import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileScript, parse } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const { descriptor } = parse(readFileSync(new URL('./SaveWorkflowDialog.vue', import.meta.url), 'utf8'))
const compiled = transformSync(compileScript(descriptor, { id: 'save-default-test' }).content, { format: 'cjs' }).code

function fixture() {
  const watches = [], requests = []
  const store = { workflowMeta: null, workflowTabs: [], nodes: [{ id: 'text', type: 'text-input', data: { text: 'hello' } }], edges: [], exportWorkflowForSave() { return { nodes: this.nodes, edges: [] } } }
  const state = { projects: [{ id: 'custom', is_default: '0' }, { id: 'default', is_default: '1' }], failure: false, pending: null }
  const api = {
    async getProjectList() { const projects = [...state.projects]; if (state.pending) await state.pending; if (state.failure) throw new Error('unavailable'); return { data: projects } },
    async createProject() { if (state.creating) await state.creating; state.projects.push({ id: 'new-project', is_default: 0 }); return { data: { id: 'new-project' } } },
    async getStorageQuota() { return { quota: {} } },
    async saveWorkflow(body) { requests.push(body); return { workflow: { ...body, id: body.id || 'saved' } } }
  }
  const mocks = {
    vue: { ...require('vue'), watch: (source, callback) => watches.push(callback) },
    '@/stores/canvas': { useCanvasStore: () => store },
    '@/stores/team': { useTeamStore: () => ({ globalSpaceType: { value: 'personal' }, globalTeamId: { value: null }, getSpaceParams: () => ({ spaceType: 'personal' }) }) },
    '@/api/canvas/project': api, '@/api/canvas/workflow': api,
    '@/i18n': { useI18n: () => ({ t: key => key }) },
    '@/components/community/PublishWorkDialog.vue': {},
    '@/utils/canvasUploadGuard': { findBlockingCanvasUploads: () => [] }
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'localStorage', compiled)(id => mocks[id] || require(id), module, module.exports, { setItem() {}, getItem() { return null }, removeItem() {} })
  const dialog = module.exports.default.setup({ visible: false }, { expose() {}, emit() {} })
  return { dialog, store, state, requests, open: () => watches[0](true), close: () => watches[0](false) }
}

test('new workflows select the marked default, including numeric string flags', async () => {
  const f = fixture()
  await f.open()
  assert.equal(f.dialog.selectedProjectId.value, 'default')
})

test('a project chosen when creating or opening a workflow takes precedence', async () => {
  const f = fixture()
  f.store.workflowMeta = { project_id: 'custom' }
  await f.open()
  assert.equal(f.dialog.selectedProjectId.value, 'custom')
})

test('manual project changes and quick-created projects are submitted unchanged', async () => {
  for (const quick of [false, true]) {
    const f = fixture()
    await f.open()
    if (quick) {
      f.dialog.quickProjectName.value = 'New project'
      await f.dialog.handleQuickCreateProject()
    } else f.dialog.selectedProjectId.value = 'custom'
    f.dialog.workflowName.value = 'Workflow'
    await f.dialog.handleSave()
    assert.equal(f.requests.length, 1)
    assert.equal(f.requests[0].project_id, quick ? 'new-project' : 'custom')
  }
})

test('reopening for another workflow clears a previous project and form before loading', async () => {
  const f = fixture()
  await f.open()
  f.dialog.selectedProjectId.value = 'custom'
  f.dialog.showQuickCreate.value = true
  f.dialog.quickProjectName.value = 'stale'
  await f.close()
  f.state.failure = true
  await f.open()
  assert.equal(f.dialog.selectedProjectId.value, '')
  assert.equal(f.dialog.projects.value.length, 0)
  assert.equal(f.dialog.showQuickCreate.value, false)
  assert.equal(f.dialog.quickProjectName.value, '')
})

test('save waits for project initialization, so a stale destination cannot be submitted', async () => {
  const f = fixture()
  let resolve
  f.state.pending = new Promise(done => { resolve = done })
  const opening = f.open()
  await Promise.resolve()
  f.dialog.workflowName.value = 'Workflow'
  await f.dialog.handleSave()
  assert.equal(f.requests.length, 0)
  resolve()
  await opening
})

test('a new workflow never inherits another workflow project when no default is available', async () => {
  const f = fixture()
  await f.open()
  f.dialog.selectedProjectId.value = 'custom'
  await f.close()
  f.state.projects = []
  await f.open()
  assert.equal(f.dialog.selectedProjectId.value, '')
})

test('a late project list cannot overwrite a reopened dialog', async () => {
  const f = fixture()
  let resolve
  f.state.pending = new Promise(done => { resolve = done })
  const oldOpen = f.open()
  await new Promise(done => setImmediate(done))
  await f.close()
  f.state.pending = null
  f.state.projects = [{ id: 'other-default', is_default: 1 }]
  await f.open()
  resolve()
  await oldOpen
  assert.equal(f.dialog.selectedProjectId.value, 'other-default')
  assert.deepEqual(f.dialog.projects.value.map(p => p.id), ['other-default'])
})

test('saving waits for a manually created project and then uses that project', async () => {
  const f = fixture()
  await f.open()
  let resolve
  f.state.creating = new Promise(done => { resolve = done })
  f.dialog.quickProjectName.value = 'New project'
  const creating = f.dialog.handleQuickCreateProject()
  f.dialog.workflowName.value = 'Workflow'
  await f.dialog.handleSave()
  assert.equal(f.requests.length, 0)
  resolve()
  await creating
  await f.dialog.handleSave()
  assert.equal(f.requests[0].project_id, 'new-project')
})
