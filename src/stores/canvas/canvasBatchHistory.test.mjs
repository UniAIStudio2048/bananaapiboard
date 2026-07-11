import test from 'node:test'
import assert from 'node:assert/strict'
import { createOpHistory } from './opHistory.js'
import { getVisibleNodeGroups } from '../../utils/canvasBatchLayout.js'

test('one post-layout history record undoes and redoes the complete visible batch group', () => {
  const before = {
    nodes: [{ id: 'image-1', type: 'image', position: { x: 0, y: 0 }, data: { status: 'idle' } }],
    edges: []
  }
  const after = {
    nodes: [
      {
        id: 'image-1',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { status: 'idle', groupId: 'group-1' }
      },
      {
        id: 'image-2',
        type: 'image',
        position: { x: 420, y: 0 },
        data: { status: 'pending', groupId: 'group-1' }
      },
      {
        id: 'group-1',
        type: 'group',
        position: { x: -60, y: -90 },
        data: { groupName: '图片生成 ×2', nodeIds: ['image-1', 'image-2'] }
      }
    ],
    edges: []
  }
  const history = createOpHistory({ baseline: before })
  const recordResult = history.record(after)

  assert.equal(recordResult.recorded, true)
  assert.equal(history.canUndo, true)

  let current = after
  history.undo(state => { current = state })
  assert.deepEqual(current, before)
  assert.deepEqual(getVisibleNodeGroups(current.nodes), [])

  history.redo(state => { current = state })
  assert.deepEqual(current, after)
  assert.deepEqual(getVisibleNodeGroups(current.nodes).map(group => group.id), ['group-1'])
})
