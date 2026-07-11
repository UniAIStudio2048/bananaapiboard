import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const storeSource = fs.readFileSync(new URL('./canvasStore.js', import.meta.url), 'utf8')
const boardSource = fs.readFileSync(new URL('../../components/canvas/CanvasBoard.vue', import.meta.url), 'utf8')

test('canvas store exposes visible group construction', () => {
  assert.match(
    storeSource,
    /import\s+\{\s*getVisibleGroupGeometry\s*\}\s+from\s+'@\/utils\/canvasBatchLayout'/
  )
  assert.match(
    storeSource,
    /function createVisibleGroup\(nodeIds, groupName = null, options = \{\}\)/
  )
  assert.match(storeSource, /getVisibleGroupGeometry\(memberNodes/)
  assert.match(storeSource, /createGroup\(nodeIds, groupName, \{ skipHistory: true \}\)/)
  assert.match(storeSource, /createVisibleGroup,/)
})

test('manual grouping delegates to the shared visible group operation', () => {
  assert.match(boardSource, /canvasStore\.createVisibleGroup\(nodeIds\)/)
  assert.doesNotMatch(boardSource, /const groupWidth = maxX - minX/)
})
