import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const storeSource = fs.readFileSync(new URL('./canvasStore.js', import.meta.url), 'utf8')
const boardSource = fs.readFileSync(new URL('../../components/canvas/CanvasBoard.vue', import.meta.url), 'utf8')

test('canvas store exposes visible group construction', () => {
  assert.match(
    storeSource,
    /import\s+\{[^}]*getVisibleGroupGeometry[^}]*getVisibleNodeGroups[^}]*\}\s+from\s+'@\/utils\/canvasBatchLayout'/
  )
  assert.match(
    storeSource,
    /function createVisibleGroup\(nodeIds, groupName = null, options = \{\}\)/
  )
  assert.match(storeSource, /getVisibleGroupGeometry\(memberNodes/)
  assert.match(storeSource, /createGroup\(nodeIds, groupName, \{ skipHistory: true \}\)/)
  assert.match(storeSource, /createVisibleGroup,/)
  assert.match(storeSource, /getVisibleNodeGroups/)
  assert.match(storeSource, /function syncNodeGroupsFromVisibleNodes\(\)/)
  assert.match(storeSource, /getVisibleNodeGroups\(nodes\.value, nodeGroups\.value\)/)
})

test('manual grouping delegates to the shared visible group operation', () => {
  assert.match(boardSource, /canvasStore\.createVisibleGroup\(nodeIds\)/)
  assert.doesNotMatch(boardSource, /const groupWidth = maxX - minX/)

  const visibleGroupSource = storeSource.slice(
    storeSource.indexOf('function createVisibleGroup('),
    storeSource.indexOf('function disbandGroup(')
  )
  assert.equal(
    visibleGroupSource.match(/saveHistory\(\{ force: true \}\)/g)?.length,
    2,
    'default visible grouping should record both its baseline and completed state'
  )
})

test('undo and redo rebuild redundant group metadata from visible group nodes', () => {
  const undoSource = storeSource.slice(
    storeSource.indexOf('function undo()'),
    storeSource.indexOf('function redo()')
  )
  const redoSource = storeSource.slice(
    storeSource.indexOf('function redo()'),
    storeSource.indexOf('function trimHistory(')
  )

  assert.match(undoSource, /syncNodeGroupsFromVisibleNodes\(\)/)
  assert.match(redoSource, /syncNodeGroupsFromVisibleNodes\(\)/)
})
