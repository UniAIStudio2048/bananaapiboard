import test from 'node:test'
import assert from 'node:assert/strict'

import { syncPastedNodeSelection } from './canvasPasteSelection.js'

test('syncs selection so only pasted nodes stay selected', () => {
  const existingNodes = [
    { id: 'node-original', selected: true },
    { id: 'node-other', selected: false }
  ]
  const pastedNodes = [
    { id: 'node-pasted', selected: true }
  ]

  const selectedIds = syncPastedNodeSelection({ existingNodes, pastedNodes })

  assert.deepEqual(selectedIds, ['node-pasted'])
  assert.equal(existingNodes[0].selected, false)
  assert.equal(existingNodes[1].selected, false)
  assert.equal(pastedNodes[0].selected, true)
})
