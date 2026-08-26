import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

function getComputedBody(name) {
  const start = source.indexOf(`const ${name} = computed(`)
  assert.notEqual(start, -1, `Expected ${name} computed to exist`)
  let depth = 0
  let i = source.indexOf('{', start)
  const begin = start
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  return source.slice(begin, i + 1)
}

function getFunctionBody(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  let depth = 0
  let i = source.indexOf('{', start)
  const begin = start
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  return source.slice(begin, i + 1)
}

test('multi-select connect anchor reads the Vue Flow selection, not the store mirror', () => {
  const body = getComputedBody('multiSelectConnectAnchor')

  // vue-flow 1.48.0 不 emit selection-change，canvasStore.selectedNodeIds 在框选后不会更新，
  // 因此按钮必须直接读取 Vue Flow 内部的 getSelectedNodes。
  assert.match(body, /getSelectedNodes\.value/, 'anchor should read the Vue Flow selection source')
  assert.doesNotMatch(body, /canvasStore\.selectedNodeIds/, 'anchor must not depend on the store mirror')
  assert.match(body, /nodes\.length < 2/, 'anchor should hide below two selected nodes')
})

test('multi-select connect anchor hides during node drags and connection drags', () => {
  const body = getComputedBody('multiSelectConnectAnchor')

  assert.match(body, /canvasStore\.isDraggingConnection/, 'anchor should hide while a connection drag is active')
  assert.match(body, /activeDragNodeIds\.value\.size > 0/, 'anchor should hide while nodes are being dragged')
})

test('multi-select connect anchor derives from node bounds and excludes groups', () => {
  const body = getComputedBody('multiSelectConnectAnchor')

  assert.match(body, /type !== 'group'/, 'anchor should skip group nodes')
  assert.match(body, /getNodeSize\(/, 'anchor should size nodes via getNodeSize')
  assert.match(body, /flowPositionToScreenPosition\(/, 'anchor should convert flow bounds to screen space')
  assert.match(body, /canvasStore\.viewport/, 'anchor should track the reactive viewport')
})

test('template renders the multi-select connect button wired to mousedown', () => {
  assert.match(source, /multi-select-connect-btn/, 'template should render the multi-select connect button')
  assert.match(source, /@mousedown="handleMultiSelectConnectStart/, 'button should start the drag on mousedown')
  assert.match(source, /v-if="multiSelectConnectAnchor"/, 'button should be gated on the anchor computed')
})

test('mousedown handler starts a multi-source drag connection from the Vue Flow selection', () => {
  const body = getFunctionBody('handleMultiSelectConnectStart')

  assert.match(body, /canvasStore\.startDragConnection\(/, 'handler should start the store drag connection')
  assert.match(body, /getSelectedNodes\.value/, 'handler should read the Vue Flow selection')
  assert.match(body, /sourceIds/, 'handler should pass the selected node ids as multi sources')
  assert.match(body, /type !== 'group'/, 'handler should exclude group nodes from sources')
})
