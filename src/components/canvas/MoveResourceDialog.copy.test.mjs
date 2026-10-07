import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('./MoveResourceDialog.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = transformSync(compileScript(descriptor, { id: 'resource-copy-test' }).content, { format: 'cjs' }).code

function createDialog({ operation = 'copy', projectList = [], overrides = {}, loadError } = {}) {
  const requests = []
  const events = []
  const spaces = [
    { id: 'personal', type: 'personal' },
    { id: 'team-target', type: 'team', teamId: 'target', name: 'Target' }
  ]
  const api = {
    async getProjectList(params) {
      requests.push(['list', params])
      if (loadError) throw loadError
      return { data: projectList }
    },
    async copyWorkflowToSpace(id, payload) {
      requests.push(['copy', id, payload])
      return { success: true, data: { id: 'copy-id' } }
    },
    async transferWorkflowSpace(id, payload) {
      requests.push(['move', id, payload])
      return { success: true }
    }
  }
  const runtimeRequire = id => {
    if (id === 'vue') return { ...require('vue'), watch() {} }
    if (id === '@/api/canvas/project') return api
    if (id === '@/stores/team') return { useTeamStore: () => ({ getAllSpaces: () => spaces }) }
    return require(id)
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(runtimeRequire, module, module.exports)
  const dialog = module.exports.default.setup({
    modelValue: true, resourceType: 'workflow', resourceId: 'source-id',
    currentProjectId: 'current', currentSpaceType: 'personal', currentTeamId: '',
    operation, ...overrides
  }, { expose() {}, emit: (...args) => events.push(args) })
  dialog.targetSpaceId.value = 'personal'
  return { dialog, requests, events }
}

test('copying is available when the current project is the only project', async () => {
  const { dialog } = createDialog({ projectList: [{ id: 'current', is_default: true }] })
  await dialog.loadTargetProjects()
  assert.deepEqual(dialog.projects.value.map(project => project.id), ['current'])
  assert.equal(dialog.selectedProjectId.value, 'current')
  assert.equal(dialog.loadingProjects.value, false)
})

test('copying defaults to the current project instead of the default project', async () => {
  const { dialog } = createDialog({ projectList: [
    { id: 'default', is_default: true }, { id: 'current' }, { id: 'other' }
  ] })
  await dialog.loadTargetProjects()
  assert.equal(dialog.selectedProjectId.value, 'current')
  assert.equal(dialog.projects.value.length, 3)
})

test('moving still excludes the current project and selects the default destination', async () => {
  const { dialog } = createDialog({ operation: 'move', projectList: [
    { id: 'current' }, { id: 'default', is_default: true }
  ] })
  await dialog.loadTargetProjects()
  assert.deepEqual(dialog.projects.value.map(project => project.id), ['default'])
  assert.equal(dialog.selectedProjectId.value, 'default')
})

test('copying to another space loads that space and selects its default project', async () => {
  const { dialog, requests } = createDialog({ projectList: [
    { id: 'target-other' }, { id: 'target-default', is_default: true }
  ] })
  dialog.targetSpaceId.value = 'team-target'
  await dialog.loadTargetProjects()
  assert.deepEqual(requests, [['list', { spaceType: 'team', teamId: 'target' }]])
  assert.equal(dialog.selectedProjectId.value, 'target-default')
})

test('copying without a matching current or default project selects the first available project', async () => {
  const { dialog } = createDialog({ projectList: [{ id: 123 }, { id: 456 }] })
  await dialog.loadTargetProjects()
  assert.equal(dialog.selectedProjectId.value, '123')
})

test('same-project copies call the copy endpoint and refresh the list after success', async () => {
  const { dialog, requests, events } = createDialog({ projectList: [{ id: 'current' }] })
  await dialog.loadTargetProjects()
  await dialog.handleMove()
  assert.deepEqual(requests[1], ['copy', 'source-id', {
    targetSpaceType: 'personal', targetTeamId: null, targetProjectId: 'current'
  }])
  assert.deepEqual(events, [
    ['moved', { success: true, data: { id: 'copy-id' } }], ['update:modelValue', false]
  ])
  assert.equal(dialog.loading.value, false)
})

test('a failed project request clears stale destinations and exposes the error', async () => {
  const { dialog } = createDialog({ loadError: new Error('Project request failed') })
  dialog.projects.value = [{ id: 'stale' }]
  dialog.selectedProjectId.value = 'stale'
  await dialog.loadTargetProjects()
  assert.deepEqual(dialog.projects.value, [])
  assert.equal(dialog.selectedProjectId.value, '')
  assert.equal(dialog.error.value, 'Project request failed')
  assert.equal(dialog.loadingProjects.value, false)
})
