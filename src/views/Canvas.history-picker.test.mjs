import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const canvas = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../components/canvas/HistoryPanel.vue', import.meta.url), 'utf8')
const menu = readFileSync(new URL('../components/canvas/CanvasContextMenu.vue', import.meta.url), 'utf8')
const selector = readFileSync(new URL('../components/canvas/NodeSelector.vue', import.meta.url), 'utf8')

function loadFunction(source, name, context) {
  const declaration = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))?.[0]
  assert.ok(declaration, `${name} must exist`)
  return runInNewContext(`(${declaration})`, context)
}

test('both resource menus expose history selection and Canvas handles the event', () => {
  for (const source of [menu, selector]) {
    assert.match(source, /从生成历史选择/)
    assert.match(source, /emit\('select-history'/)
  }
  assert.equal((canvas.match(/@select-history="openHistoryPicker"/g) || []).length, 2)
  assert.match(canvas, /@select-history="handleHistorySelection"/)
})

test('picker distinguishes identical IDs across media types and ignores unfinished results', () => {
  const context = { pickerItems: { value: new Map() } }
  context.isHistoryPickable = loadFunction(panel, 'isHistoryPickable', context)
  const toggle = loadFunction(panel, 'toggleHistoryPick', context)
  const image = { id: 1, type: 'image', url: '/image.png', status: 'completed' }
  const video = { id: 1, type: 'video', url: '/video.mp4', status: 'completed' }
  toggle(image)
  toggle(video)
  toggle({ id: 2, type: 'image', status: 'processing' })
  toggle({ id: 3, type: 'video', url: '/pending.mp4', status: 'failed' })
  assert.equal(context.pickerItems.value.size, 2)
  toggle(image)
  assert.deepEqual([...context.pickerItems.value.values()], [video])
})

test('confirmation only emits selected results still available in the active history', () => {
  const image = { id: 1, type: 'image', url: '/image.png' }
  const deleted = { id: 2, type: 'video', url: '/deleted.mp4' }
  const events = []
  const context = {
    pickerItems: { value: new Map([['image:1', image], ['video:2', deleted]]) },
    historyList: { value: [image] },
    emit: (...args) => events.push(args)
  }
  context.isHistoryPickable = loadFunction(panel, 'isHistoryPickable', context)
  loadFunction(panel, 'confirmHistorySelection', context)()
  assert.equal(events.length, 1)
  assert.equal(events[0][0], 'select-history')
  assert.deepEqual(Array.from(events[0][1]), [image])
})

test('history imports preserve result data, insert at the requested position and save immediately', async () => {
  const added = []
  const saved = []
  let closed = false
  const context = {
    console: { log() {} }, window: { innerWidth: 1200, innerHeight: 800 }, t: key => key,
    historyPickerPosition: { value: { x: 123, y: 456 } },
    canvasStore: { viewport: { x: -50, y: -100, zoom: 2 }, addNode: node => { added.push(node); return node } },
    closeHistoryPanel: () => { closed = true },
    autoSaveWorkflow: async options => saved.push(options)
  }
  context.handleHistoryApply = loadFunction(canvas, 'handleHistoryApply', context)
  const select = loadFunction(canvas, 'handleHistorySelection', context)
  await select([
    { id: 1, type: 'image', url: '/image.png', prompt: 'test' },
    { id: 1, type: 'video', url: '/video.mp4', thumbnail_url: '/poster.png' },
    { id: 2, type: 'audio', url: '/audio.mp3' }
  ])
  assert.equal(added.length, 3)
  assert.equal(added[0].position.x, 123)
  assert.equal(added[0].position.y, 456)
  assert.ok(added[1].position.x > added[0].position.x + 420)
  assert.deepEqual(Array.from(added[0].data.sourceImages), ['/image.png'])
  assert.equal(added[1].data.output.thumbnail_url, '/poster.png')
  assert.equal(added[2].data.audioUrl, '/audio.mp3')
  assert.ok(closed)
  assert.equal(saved[0].force, true)
  assert.equal(saved[0].reason, 'history-picker')
  assert.match(canvas, /workflowData.nodes.length >= 2 \|\| reason === 'history-picker'/)
})

test('picker offers keyboard selection and resets across close and space changes', () => {
  assert.match(panel, /@keydown\.space\.prevent="selectionMode && toggleHistoryPick\(item\)"/)
  assert.match(panel, /watch\(\[\(\) => props.visible, \(\) => props.selectionMode, spaceFilter\]/)
  assert.match(panel, /:disabled="pickerItems.size === 0"/)
})

test('opening from the toolbar resolves the viewport center without inserting or saving', () => {
  let closedPanels = 0
  const context = {
    window: { innerWidth: 1200, innerHeight: 800 },
    canvasStore: { viewport: { x: -50, y: -100, zoom: 2 } },
    historyPickerPosition: { value: null },
    showHistoryPanel: { value: false },
    closeLeftPanels: () => { closedPanels++ }
  }
  const open = loadFunction(canvas, 'openHistoryPicker', context)
  open()
  assert.equal(context.historyPickerPosition.value.x, 125)
  assert.equal(context.historyPickerPosition.value.y, 150)
  assert.equal(context.showHistoryPanel.value, true)
  assert.equal(closedPanels, 1)
  const point = { x: 22, y: 33 }
  open(point)
  point.x = 999
  assert.equal(context.historyPickerPosition.value.x, 22, 'menu closing must not change the insertion point')
})

test('empty confirmation and stale confirmation after closing do not insert or save', async () => {
  const context = {
    historyPickerPosition: { value: { x: 1, y: 2 } },
    handleHistoryApply: () => assert.fail('unexpected insertion'),
    autoSaveWorkflow: () => assert.fail('unexpected save')
  }
  const select = loadFunction(canvas, 'handleHistorySelection', context)
  await select([])
  context.historyPickerPosition.value = null
  await select([{ id: 1, type: 'image', url: '/image.png' }])
})
