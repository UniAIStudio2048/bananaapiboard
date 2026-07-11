import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpHistory } from './opHistory.js'
import { getVisibleNodeGroups } from '../../utils/canvasBatchLayout.js'

test('one post-layout history record undoes and redoes the complete visible batch group', () => {
  const before = {
    nodes: [
      { id: 'input-1', type: 'image-input', position: { x: -420, y: 0 }, data: {} },
      { id: 'image-1', type: 'image', position: { x: 0, y: 0 }, data: { status: 'processing' } }
    ],
    edges: [{ id: 'input-to-image-1', source: 'input-1', target: 'image-1' }]
  }
  const after = {
    nodes: [
      { id: 'input-1', type: 'image-input', position: { x: -420, y: 0 }, data: {} },
      {
        id: 'image-1',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { status: 'processing' }
      },
      {
        id: 'image-copy',
        type: 'image',
        position: { x: 40, y: 40 },
        data: { status: 'pending', groupId: 'group-1' }
      },
      {
        id: 'image-2',
        type: 'image',
        position: { x: 460, y: 40 },
        data: { status: 'pending', groupId: 'group-1' }
      },
      {
        id: 'group-1',
        type: 'group',
        position: { x: -20, y: -50 },
        data: { groupName: '图片生成 ×2', nodeIds: ['image-copy', 'image-2'] }
      }
    ],
    edges: [
      { id: 'input-to-image-1', source: 'input-1', target: 'image-1' },
      { id: 'input-to-image-1-image-copy', source: 'input-1', target: 'image-copy' }
    ]
  }
  const history = createOpHistory({ baseline: before })
  const recordResult = history.record(after)

  assert.equal(recordResult.recorded, true)
  assert.equal(history.canUndo, true)

  let current = after
  history.undo(state => { current = state })
  assert.deepEqual(current, before)
  assert.equal(current.nodes.some(node => node.id === 'image-copy'), false)
  assert.equal(current.edges.some(edge => edge.target === 'image-copy'), false)
  assert.deepEqual(getVisibleNodeGroups(current.nodes), [])

  history.redo(state => { current = state })
  assert.deepEqual(current, after)
  assert.equal(current.nodes.some(node => node.id === 'image-copy'), true)
  assert.equal(current.edges.some(edge => edge.target === 'image-copy'), true)
  assert.deepEqual(getVisibleNodeGroups(current.nodes).map(group => group.id), ['group-1'])
})
