import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { sanitizeWorkflowForSave } from './workflowSaveSanitizer.js'

function loadFunction(path, name, context) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
  const ast = parse(source, { sourceType: 'module' })
  const fn = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  const body = source.slice(fn.start, fn.end).replace("const { saveWorkflow } = await import('@/api/canvas/workflow')", '')
  return runInNewContext(`(${body})`, context)
}

const mediaNode = () => ({ id: 'media', version: 7, data: {
  _mediaLoading: true, sourceImages: [], output: null,
  _originalMedia: { sourceImages: ['https://example.com/source.png'], output: { url: 'https://example.com/result.png' } }
} })

test('quick save exports a guarded snapshot with the original media and deletion baseline', async () => {
  const saved = []
  const tab = { id: 'tab', workflowId: 'wf', name: 'test', savedNodeVersions: { media: 7, deleted: 3 } }
  const nodes = [mediaNode()]
  const context = {
    canvasStore: {
      nodes, edges: [], getCurrentTab: () => tab,
      exportWorkflow: () => ({ nodes, edges: [] }),
      exportWorkflowForSave: () => ({ ...sanitizeWorkflowForSave({ nodes, edges: [] }), baseNodeVersions: tab.savedNodeVersions, clientTabId: tab.id }),
      markCurrentTabSaved() {}
    },
    teamStore: { getSpaceParams: () => ({ spaceType: 'personal' }) },
    saveWorkflow: async value => saved.push(value), findBlockingCanvasUploads: () => [],
    displayToast() {}, persistManualSaveRecoverySnapshot() {}, lastAutoSave: { value: null },
    workflowPanelRef: { value: null }, console: { log() {}, error() {} }
  }
  assert.equal(await loadFunction('../views/Canvas.vue', 'quickSaveWorkflow', context)(), true)
  assert.equal(saved[0].nodes[0].data.output?.url, 'https://example.com/result.png')
  assert.deepEqual(saved[0].baseNodeVersions, tab.savedNodeVersions)
  assert.equal(saved[0].clientTabId, 'tab')
})

test('space switching also restores media when saving an inactive workflow tab', async () => {
  const saved = []
  const tab = { id: 'inactive', workflowId: 'wf', name: 'test', hasChanges: true, nodes: [mediaNode()], edges: [], viewport: {}, savedNodeVersions: { media: 7 } }
  const context = {
    canvasStore: { workflowTabs: [tab], activeTabId: 'active', exportWorkflowSession: () => ({}), closeAllTabs() {} },
    teamStore: { getSpaceParams: () => ({ spaceType: 'personal' }) }, spaceKeyOf: () => 'personal',
    saveSpaceWorkflowSession() {}, sanitizeWorkflowForSave, toRaw: value => value,
    findBlockingCanvasUploads: () => [], saveWorkflow: async value => saved.push(value), console: { warn() {} }
  }
  assert.equal(await loadFunction('../components/canvas/CanvasSpaceSwitcher.vue', 'saveAllTabsAndReset', context)(), true)
  assert.equal(saved[0].nodes[0].data.output?.url, 'https://example.com/result.png')
  assert.equal('_originalMedia' in saved[0].nodes[0].data, false)
  assert.deepEqual(saved[0].baseNodeVersions, tab.savedNodeVersions)
})
