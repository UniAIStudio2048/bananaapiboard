import test from 'node:test'
import assert from 'node:assert/strict'

import { createOpHistory } from '../stores/canvas/opHistory.js'

const previewModule = await import('./canvasOrganizationPreview.js').catch(() => ({}))

test('records layout and the first later edit as separate undo operations', () => {
  assert.equal(
    typeof previewModule.createCanvasOrganizationPreviewController,
    'function',
    'canvas organization needs a behavior-testable preview controller'
  )

  const before = {
    nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }],
    edges: []
  }
  const arranged = {
    nodes: [{ id: 'a', position: { x: 200, y: 0 }, data: {} }],
    edges: []
  }
  const edited = {
    nodes: [
      { id: 'a', position: { x: 200, y: 0 }, data: {} },
      { id: 'b', position: { x: 500, y: 0 }, data: {} }
    ],
    edges: []
  }
  const history = createOpHistory({ baseline: before })
  let current = arranged
  const controller = previewModule.createCanvasOrganizationPreviewController({
    saveHistory: () => history.record(current)
  })

  controller.open({ snapshot: before })
  current = edited
  controller.keepAfterMutation()

  history.undo(state => { current = state })
  assert.deepEqual(current, arranged)
  history.undo(state => { current = state })
  assert.deepEqual(current, before)
})

test('explicit keep does not create a duplicate history operation', () => {
  assert.equal(typeof previewModule.createCanvasOrganizationPreviewController, 'function')
  let historyWrites = 0
  const controller = previewModule.createCanvasOrganizationPreviewController({
    saveHistory: () => { historyWrites += 1 }
  })

  controller.open({ snapshot: {} })
  assert.equal(controller.keep(), true)
  assert.equal(historyWrites, 1)
  assert.equal(controller.current, null)
})

test('workflow action runs only after an open preview is kept', () => {
  assert.equal(typeof previewModule.createCanvasOrganizationPreviewController, 'function')
  const events = []
  const controller = previewModule.createCanvasOrganizationPreviewController({
    saveHistory: () => { events.push('history') },
    onChange: preview => { events.push(preview ? 'preview-open' : 'preview-closed') }
  })

  controller.open({ snapshot: {} })
  const result = controller.beforeCanvasSwitch(() => {
    events.push('switch')
    return 'new-tab'
  })

  assert.equal(result, 'new-tab')
  assert.deepEqual(events, ['history', 'preview-open', 'preview-closed', 'switch'])
})
