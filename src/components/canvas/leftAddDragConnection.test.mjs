// 节点左侧 + 号反向拖拽连线：松开在空白处推荐上游节点，松开在其他节点上连接其右侧输出
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getLeftDragUpstreamOptions } from '../../config/canvas/nodeTypes.js'
import { findConnectionSnapTarget } from '../../utils/canvasConnectionPosition.js'
import { buildDragConnectionEdge, watchLeftAddButtonDrag } from '../../utils/canvasLeftAddDrag.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(__dirname, path), 'utf8')

const types = (nodeType) => getLeftDragUpstreamOptions(nodeType).map(option => option.type)

test('left drag recommends upstream node types per node kind', () => {
  const all = ['text-input', 'image-input', 'video-input', 'audio-input']
  for (const nodeType of ['text-input', 'text']) assert.deepEqual(types(nodeType), all, nodeType)
  for (const nodeType of ['image-input', 'image']) assert.deepEqual(types(nodeType), ['text-input', 'image-input'], nodeType)
  for (const nodeType of ['video-input', 'video']) assert.deepEqual(types(nodeType), all, nodeType)
  for (const nodeType of ['audio-input', 'audio']) assert.deepEqual(types(nodeType), ['text-input', 'audio-input'], nodeType)
  assert.ok(getLeftDragUpstreamOptions('image').every(option => option.label), 'options carry node config')
  assert.deepEqual(types('group'), [])
})

test('reverse drag connects the other node output into the dragging node input', () => {
  assert.deepEqual(
    buildDragConnectionEdge({ direction: 'reverse', draggingNodeId: 'me', draggingHandleId: 'input', otherNodeId: 'other' }),
    { source: 'other', sourceHandle: 'output', target: 'me', targetHandle: 'input' }
  )
  assert.deepEqual(
    buildDragConnectionEdge({ direction: 'forward', draggingNodeId: 'me', draggingHandleId: 'output', otherNodeId: 'other', targetHandleId: 'input-2' }),
    { source: 'me', sourceHandle: 'output', target: 'other', targetHandle: 'input-2' }
  )
})

test('reverse drag snaps to other nodes right output handles', () => {
  const nodes = [
    { id: 'me', type: 'image', position: { x: 600, y: 0 } },
    { id: 'other', type: 'text-input', position: { x: 0, y: 0 } }
  ]
  const handles = {
    me: { input: { x: 566, y: 140 }, output: { x: 1014, y: 140 } },
    other: { input: { x: -34, y: 140 }, output: { x: 434, y: 140 } }
  }
  const options = {
    sourceNodeId: 'me',
    nodes,
    getHandlePosition: (nodeId, handleType) => handles[nodeId][handleType],
    viewport: { x: 0, y: 0, zoom: 1 },
    snapRadius: 60
  }
  assert.deepEqual(
    findConnectionSnapTarget({ ...options, screenPosition: { x: 440, y: 150 }, handleType: 'output' }),
    { nodeId: 'other', position: { x: 434, y: 140 } }
  )
  assert.equal(findConnectionSnapTarget({ ...options, screenPosition: { x: -30, y: 150 }, handleType: 'output' }), null)
  assert.deepEqual(
    findConnectionSnapTarget({ ...options, screenPosition: { x: -30, y: 150 } }),
    { nodeId: 'other', position: { x: -34, y: 140 } },
    'forward drag still snaps to input handles by default'
  )
})

function createFakeEventTargets() {
  const listeners = { doc: new Map(), win: new Map() }
  const make = (bucket) => ({
    addEventListener: (type, fn) => bucket.set(type, [...(bucket.get(type) || []), fn]),
    removeEventListener: (type, fn) => bucket.set(type, (bucket.get(type) || []).filter(item => item !== fn)),
    emit: (type, event) => (bucket.get(type) || []).forEach(fn => fn(event))
  })
  return { doc: make(listeners.doc), win: make(listeners.win), listeners }
}

const mouseDown = (overrides = {}) => ({ button: 0, clientX: 100, clientY: 100, preventDefault() {}, ...overrides })

test('left add button starts a drag only after moving past the threshold, and a plain click stays a click', async () => {
  const { doc, win, listeners } = createFakeEventTargets()
  let started = 0
  watchLeftAddButtonDrag(mouseDown(), { onDragStart: () => { started += 1 }, eventTarget: doc, clickTarget: win })
  doc.emit('mousemove', { clientX: 103, clientY: 102 })
  assert.equal(started, 0, 'small jitter is not a drag')
  doc.emit('mouseup', {})
  assert.equal(listeners.doc.get('mousemove').length, 0, 'listeners are removed on mouseup')
  assert.equal((listeners.win.get('click') || []).length, 0, 'plain click is not suppressed')

  watchLeftAddButtonDrag(mouseDown(), { onDragStart: () => { started += 1 }, eventTarget: doc, clickTarget: win })
  doc.emit('mousemove', { clientX: 120, clientY: 100 })
  doc.emit('mousemove', { clientX: 160, clientY: 100 })
  assert.equal(started, 1, 'drag starts once')
  doc.emit('mouseup', {})
  assert.equal(listeners.win.get('click').length, 1, 'the click that ends a drag is swallowed')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(listeners.win.get('click').length, 0, 'click suppression is released right after')
})

test('left add button ignores non-primary or modified mouse downs', () => {
  const { doc, win, listeners } = createFakeEventTargets()
  for (const event of [mouseDown({ button: 2 }), mouseDown({ shiftKey: true }), mouseDown({ ctrlKey: true }), mouseDown({ metaKey: true })]) {
    assert.equal(watchLeftAddButtonDrag(event, { onDragStart() {}, eventTarget: doc, clickTarget: win }), false)
  }
  assert.equal((listeners.doc.get('mousemove') || []).length, 0)
})

test('store supports a reverse drag direction that opens the left-drag selector', () => {
  const store = read('../../stores/canvas/canvasStore.js')
  assert.match(store, /function startDragConnection\(nodeId, handleId = 'output', startPosition, extraSourceIds = null, direction = 'forward'\)/)
  assert.match(store, /const dragConnectionDirection = ref\('forward'\)/)
  assert.match(store, /buildDragConnectionEdge\(\{/)
  assert.match(store, /'node-left-drag'/)
  const exportBlock = store.slice(store.lastIndexOf('\n  return {'))
  assert.match(exportBlock, /\bdragConnectionDirection,/)
})

test('canvas board snaps reverse drags to outputs and ignores drops on other left add buttons', () => {
  const board = read('CanvasBoard.vue')
  assert.match(board, /handleType: isReverseDragConnection\(\) \? 'output' : 'input'/)
  assert.match(board, /closest\?\.\('\.node-add-btn-left'\)/)
  assert.match(board, /canvasStore\.cancelDragConnection\(\)/)
})

test('node selector offers left-drag recommendations and wires them upstream', () => {
  const selector = read('NodeSelector.vue')
  assert.match(selector, /getLeftDragUpstreamOptions/)
  assert.match(selector, /const isLeftDragTrigger = computed\(\(\) => props\.trigger === 'node-left-drag'\)/)
  assert.match(selector, /const isLeftTrigger = computed\(\(\) => props\.trigger === 'node-left' \|\| isLeftDragTrigger\.value\)/)
})

test('text, image, video and audio nodes start a reverse drag from the left add button', () => {
  for (const file of ['TextNode.vue', 'ImageNode.vue', 'VideoNode.vue', 'AudioNode.vue']) {
    const source = read(`nodes/${file}`)
    assert.match(source, /ref="addLeftBtnRef"/, `${file} left button ref`)
    assert.match(source, /class="node-add-btn node-add-btn-left nodrag"/, `${file} left button opts out of node dragging`)
    assert.match(source, /@mousedown\.stop="handleAddLeftMouseDown"/, `${file} left button mousedown`)
    assert.match(source, /watchLeftAddButtonDrag\(event, \{ onDragStart: startLeftDragConnection \}\)/, `${file} uses the shared drag helper`)
    assert.match(
      source,
      /canvasStore\.startDragConnection\(props\.id, 'input', buttonPosition, null, 'reverse'\)/,
      `${file} starts a reverse drag from the left button center`
    )
  }
})
