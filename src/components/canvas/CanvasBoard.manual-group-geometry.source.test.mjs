import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const boardSource = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')
const storeSource = readFileSync(join(__dirname, '../../stores/canvas/canvasStore.js'), 'utf8')

test('manual grouping forwards the current Vue Flow selected-node geometry', () => {
  const source = boardSource.slice(
    boardSource.indexOf('function groupSelectedNodes()'),
    boardSource.indexOf('// 同步视口变化到 store')
  )

  assert.match(source, /const selectedNodes = getSelectedNodes\.value/)
  assert.match(source, /canvasStore\.createVisibleGroup\(nodeIds, null, \{ geometryNodes: selectedNodes \}\)/)
})

test('visible group creation resolves optional live geometry before calculating bounds', () => {
  const source = storeSource.slice(
    storeSource.indexOf('function createVisibleGroup('),
    storeSource.indexOf('/**\n   * 解散编组')
  )

  assert.match(storeSource, /resolveVisibleGroupGeometryNodes/)
  assert.match(source, /resolveVisibleGroupGeometryNodes\(memberNodes, options\.geometryNodes\)/)
  assert.match(source, /getVisibleGroupGeometry\(geometryNodes, options\)/)
})
