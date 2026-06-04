import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readNode(fileName) {
  return readFileSync(join(__dirname, fileName), 'utf8')
}

function assertOutputHandleBeforeRightAddButton(source, wrapperClass) {
  const start = source.indexOf(`<div class="${wrapperClass}"`)
  assert.notEqual(start, -1, `${wrapperClass} wrapper should exist`)

  const sourceHandle = source.indexOf('type="source"', start)
  const rightAddButton = source.indexOf('ref="addRightBtnRef"', start)

  assert.notEqual(sourceHandle, -1, `${wrapperClass} output handle should exist`)
  assert.notEqual(rightAddButton, -1, `${wrapperClass} right add button should exist`)
  assert.ok(
    sourceHandle < rightAddButton,
    `${wrapperClass} output handle should share the wrapper coordinate system with the right add button`
  )
}

function assertDragConnectionStartsFromRightAddButton(source, nodeName) {
  const start = source.indexOf('function startDragConnection(event)')
  assert.notEqual(start, -1, `${nodeName} startDragConnection should exist`)

  const end = source.indexOf('\n}', start)
  assert.notEqual(end, -1, `${nodeName} startDragConnection should have a function body`)

  const body = source.slice(start, end)
  assert.match(
    body,
    /getElementCenterFlowPosition\(addRightBtnRef\.value,\s*getViewport\(\)\)/,
    `${nodeName} drag connection should use the same right add button center calculation as text and video nodes`
  )
  assert.doesNotMatch(
    body,
    /getElementSideCenterFlowPosition|nodeWidth|nodeHeight|handleOffset|outputX|outputY/,
    `${nodeName} drag connection should not fall back to node/card geometry`
  )
}

function assertRightAddButtonIsNoDrag(source, nodeName) {
  assert.match(
    source,
    /class="[^"]*\bnode-add-btn\b[^"]*\bnodrag\b[^"]*"/,
    `${nodeName} right add button should opt out of Vue Flow node dragging for touch connection gestures`
  )
}

test('text node output handle is positioned in the same wrapper as the right add button', () => {
  const source = readNode('TextNode.vue')
  assertOutputHandleBeforeRightAddButton(source, 'text-node-card-wrapper')
})

test('audio node output handle is positioned in the same wrapper as the right add button', () => {
  const source = readNode('AudioNode.vue')
  assertOutputHandleBeforeRightAddButton(source, 'node-wrapper')
})

test('image node output handle is positioned in the same wrapper as the right add button', () => {
  const source = readNode('ImageNode.vue')
  assertOutputHandleBeforeRightAddButton(source, 'node-wrapper')
})

test('video node output handle is positioned in the same wrapper as the right add button', () => {
  const source = readNode('VideoNode.vue')
  assertOutputHandleBeforeRightAddButton(source, 'node-wrapper')
})

test('image node drag connection starts from the right add button center', () => {
  const source = readNode('ImageNode.vue')
  assertDragConnectionStartsFromRightAddButton(source, 'image node')
})

test('image node refreshes handle bounds when media layout changes', () => {
  const source = readNode('ImageNode.vue')

  assert.match(
    source,
    /const\s+nodeWrapperRef\s*=\s*ref\(null\)/,
    'image node should keep a ref to the wrapper that owns the handles and add buttons'
  )
  assert.match(
    source,
    /ref="nodeWrapperRef"/,
    'image node wrapper should bind nodeWrapperRef'
  )
  assert.match(
    source,
    /function\s+scheduleNodeInternalsUpdate\(\)[\s\S]*requestAnimationFrame[\s\S]*updateNodeInternals\(props\.id\)/,
    'image node should schedule handle-bound refreshes after DOM layout settles'
  )
  assert.match(
    source,
    /new\s+ResizeObserver\([\s\S]*scheduleNodeInternalsUpdate/,
    'image node should watch media-driven wrapper size changes'
  )
  assert.match(
    source,
    /nodeGeometryObserver\.observe\(nodeWrapperRef\.value\)/,
    'image node should observe the wrapper that defines handle coordinates'
  )
  assert.match(
    source,
    /nodeGeometryObserver\.disconnect\(\)/,
    'image node should disconnect the geometry observer on unmount'
  )
})

test('image node media load events refresh handle bounds', () => {
  const source = readNode('ImageNode.vue')
  const loadHandlers = source.match(/@load="scheduleNodeInternalsUpdate"/g) || []

  assert.ok(
    loadHandlers.length >= 2,
    'source and output image loads should refresh handle bounds after decoded media changes node height'
  )
})

test('audio node drag connection starts from the right add button center', () => {
  const source = readNode('AudioNode.vue')
  assertDragConnectionStartsFromRightAddButton(source, 'audio node')
})

test('node right add buttons do not start Vue Flow node dragging on touch', () => {
  for (const [fileName, nodeName] of [
    ['TextNode.vue', 'text node'],
    ['ImageNode.vue', 'image node'],
    ['VideoNode.vue', 'video node'],
    ['AudioNode.vue', 'audio node'],
    ['SeedanceCharacterNode.vue', 'character node'],
    ['LLMNode.vue', 'llm node']
  ]) {
    assertRightAddButtonIsNoDrag(readNode(fileName), nodeName)
  }
})
