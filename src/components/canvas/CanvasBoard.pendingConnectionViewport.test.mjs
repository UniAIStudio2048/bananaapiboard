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
  const nextMarker = source.indexOf('\n// 是否显示待连接的虚拟连线', start)
  assert.notEqual(nextMarker, -1, `${name} body end marker should exist`)
  return source.slice(start, nextMarker)
}

test('pending connection path uses live Vue Flow viewport', () => {
  const body = getFunctionBody('getPendingConnectionPath')

  assert.match(body, /const viewport = getViewport\(\)/)
  assert.match(body, /flowPositionToScreenPosition\(\{ x: sourceX, y: sourceY \}, viewport\)/)
  assert.doesNotMatch(body, /canvasStore\.viewport/)
})
