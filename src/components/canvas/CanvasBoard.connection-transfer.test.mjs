import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

function getFunctionBody(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`${name} body is not balanced`)
}

test('modifier drag starts only from a node and records move/copy mode', () => {
  const body = getFunctionBody('handleConnectionTransferMouseDown')
  assert.match(body, /event\.button\s*!==\s*0/)
  assert.match(body, /event\.shiftKey/)
  assert.match(body, /event\.ctrlKey\s*\|\|\s*event\.metaKey/)
  assert.match(source, /function getConnectionTransferNodeId\(/)
  assert.match(body, /connectionTransferState/)
  assert.match(body, /event\.preventDefault\(\)/)
})

test('modifier drag also starts from the node plus button', () => {
  const body = getFunctionBody('isConnectionTransferInteractiveTarget')
  assert.match(body, /node-add-btn/)
  assert.match(body, /return false/)
})

test('modifier drag commits the transfer on mouseup through the canvas store', () => {
  const body = getFunctionBody('handleConnectionTransferMouseUp')
  assert.match(body, /canvasStore\.transferNodeConnections\(/)
  assert.match(body, /targetNodeId/)
  assert.match(body, /mode/)
  assert.match(body, /connectionTransferPreview\.value\s*=\s*null/)
})

test('modifier drag renders all attached edges following the pointer', () => {
  assert.match(source, /const connectionTransferPreviewPaths = computed\(/)
  assert.match(source, /connection-transfer-preview/)
  assert.match(source, /connection-transfer-preview-base/)
  assert.match(source, /v-for="\(path, i\) in connectionTransferPreviewPaths"/)
  const body = getFunctionBody('handleConnectionTransferMouseMove')
  assert.match(body, /screenToFlowPosition\(/)
  assert.match(body, /flowPosition/)
})

test('modifier drag listeners are capture listeners and are cleaned up', () => {
  assert.match(source, /document\.addEventListener\('mousedown', handleConnectionTransferMouseDown, \{ capture: true \}\)/)
  assert.match(source, /document\.removeEventListener\('mousedown', handleConnectionTransferMouseDown, \{ capture: true \}\)/)
  assert.match(source, /document\.addEventListener\('mousemove', handleConnectionTransferMouseMove, \{ capture: true \}\)/)
  assert.match(source, /document\.addEventListener\('mouseup', handleConnectionTransferMouseUp, \{ capture: true \}\)/)
})
