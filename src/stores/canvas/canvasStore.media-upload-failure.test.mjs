import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { resolveMediaUploadCommitTarget } from './mediaUploadCommit.js'

const source = readFileSync(new URL('./canvasStore.js', import.meta.url), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const bodyStart = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(start, index + 1)
  }
  assert.fail(`${name} must have a complete body`)
}

test('a media upload failure after switching tabs updates the owning tab', () => {
  const tabA = {
    id: 'tab-a',
    hasChanges: false,
    nodes: [{ id: 'node-a', data: { isUploading: true, uploadFailed: false } }],
    edges: []
  }
  const tabBNode = { id: 'node-b', data: {} }
  const nodes = { value: [tabBNode] }
  const edges = { value: [] }
  const workflowTabs = { value: [tabA, { id: 'tab-b', nodes: [tabBNode], edges: [] }] }
  const activeTabId = { value: 'tab-b' }
  const activeUpdates = []
  const mergeNodeData = (current, patch) => ({ ...current, ...patch })
  const updateNodeData = (...args) => activeUpdates.push(args)
  const createMarkMediaUploadFailed = new Function(
    'resolveMediaUploadCommitTarget',
    'nodes',
    'edges',
    'workflowTabs',
    'activeTabId',
    'mergeNodeData',
    'updateNodeData',
    `return (${extractFunction('markMediaUploadFailed')})`
  )
  const markMediaUploadFailed = createMarkMediaUploadFailed(
    resolveMediaUploadCommitTarget,
    nodes,
    edges,
    workflowTabs,
    activeTabId,
    mergeNodeData,
    updateNodeData
  )

  assert.equal(markMediaUploadFailed({ nodeId: 'node-a', tabId: 'tab-a', error: new Error('network down') }), true)
  assert.deepEqual(tabA.nodes[0].data, {
    isUploading: false,
    uploadFailed: true,
    uploadError: 'network down'
  })
  assert.equal(tabA.hasChanges, true)
  assert.deepEqual(activeUpdates, [])
})

test('canvas store exposes media upload failure updates to upload owners', () => {
  assert.match(source, /markMediaUploadFailed,/)
})
