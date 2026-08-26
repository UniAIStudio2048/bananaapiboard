import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveMultiConnectExtraSourceIds } from './canvasMultiConnect.js'

const nodes = [
  { id: 'img-1', type: 'image' },
  { id: 'audio-1', type: 'audio' },
  { id: 'video-1', type: 'video' },
  { id: 'group-1', type: 'group' }
]

test('returns every selected source except the primary and the target itself', () => {
  const extras = resolveMultiConnectExtraSourceIds({
    sourceIds: ['img-1', 'audio-1'],
    primarySourceId: 'img-1',
    nodes,
    targetNode: { id: 'video-1', type: 'video' }
  })

  assert.deepEqual(extras, ['audio-1'])
})

test('skips group nodes, missing nodes and duplicate ids', () => {
  const extras = resolveMultiConnectExtraSourceIds({
    sourceIds: ['group-1', 'missing-1', 'audio-1', 'audio-1'],
    primarySourceId: 'img-1',
    nodes,
    targetNode: { id: 'video-1', type: 'video' }
  })

  assert.deepEqual(extras, ['audio-1'])
})

test('returns nothing for storyboard cell-level targets to avoid cell overwrite', () => {
  const extras = resolveMultiConnectExtraSourceIds({
    sourceIds: ['img-1', 'audio-1'],
    primarySourceId: 'img-1',
    nodes,
    targetNode: { id: 'sb-1', type: 'storyboard' },
    cellLevelTarget: true
  })

  assert.deepEqual(extras, [])
})

test('returns nothing without a target node or a source id array', () => {
  assert.deepEqual(
    resolveMultiConnectExtraSourceIds({ sourceIds: ['img-1'], primarySourceId: 'img-1', nodes, targetNode: null }),
    []
  )
  assert.deepEqual(
    resolveMultiConnectExtraSourceIds({ sourceIds: null, primarySourceId: 'img-1', nodes, targetNode: { id: 't', type: 'video' } }),
    []
  )
})
