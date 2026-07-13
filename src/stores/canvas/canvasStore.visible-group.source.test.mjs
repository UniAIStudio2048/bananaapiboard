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
  assert.match(storeSource, /getVisibleGroupGeometry\(geometryNodes, options\)/)
  assert.match(storeSource, /createGroup\(nodeIds, groupName, \{ skipHistory: true \}\)/)
  assert.match(storeSource, /createVisibleGroup,/)
  assert.match(storeSource, /getVisibleNodeGroups/)
  assert.match(storeSource, /function syncNodeGroupsFromVisibleNodes\(\)/)
  assert.match(storeSource, /getVisibleNodeGroups\(nodes\.value, nodeGroups\.value\)/)
})

test('manual grouping delegates to the shared visible group operation', () => {
  assert.match(boardSource, /canvasStore\.createVisibleGroup\(nodeIds, null, \{ geometryNodes: selectedNodes \}\)/)
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

test('visible grouping replaces the member selection with the group node', () => {
  const visibleGroupSource = storeSource.slice(
    storeSource.indexOf('function createVisibleGroup('),
    storeSource.indexOf('function disbandGroup(')
  )

  assert.match(visibleGroupSource, /memberNodes\.forEach\(node => \{[\s\S]*?node\.selected = false/)
  assert.match(visibleGroupSource, /selectable: true,[\s\S]*?selected: true/)
  assert.match(visibleGroupSource, /selectedNodeId\.value = group\.id/)
  assert.match(visibleGroupSource, /selectedNodeIds\.value = \[group\.id\]/)
})

test('group movement publishes the group and child positions through one immutable node batch', () => {
  const batchPositionSource = storeSource.slice(
    storeSource.indexOf('function updateNodePositionsBatch('),
    storeSource.indexOf('function addNodeToGroup(')
  )
  const syncSource = boardSource.slice(
    boardSource.indexOf('function syncGroupChildrenPositions('),
    boardSource.indexOf('// 处理选择变化')
  )

  assert.match(storeSource, /function updateNodePositionsBatch\(positionsById\)/)
  assert.match(batchPositionSource, /const nextNodes = nodes\.value\.map/)
  assert.match(batchPositionSource, /nodes\.value = nextNodes/)
  assert.match(syncSource, /const positionsById = \{[\s\S]*?\[groupNode\.id\]: \{ \.\.\.groupNode\.position \}[\s\S]*?\.\.\.result\.childPositions[\s\S]*?\}/)
  assert.match(syncSource, /canvasStore\.updateNodePositionsBatch\(positionsById\)/)
  assert.doesNotMatch(syncSource, /canvasStore\.updateNodePosition\(nodeId, position\)/)
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

test('directory moves update both visible group membership records atomically', () => {
  const moveSource = storeSource.slice(
    storeSource.indexOf('function moveNodeToGroup('),
    storeSource.indexOf('/**\n   * 删除节点')
  )

  assert.match(storeSource, /function moveNodeToGroup\(nodeId, targetGroupId = null\)/)
  assert.match(moveSource, /saveHistory\(\{ force: true \}\)/)
  assert.match(moveSource, /delete sourceOffsets\[nodeId\]/)
  assert.match(moveSource, /groupId:\s*null/)
  assert.match(moveSource, /clampNodePositionToGroup\(node, targetGroupNode\)/)
  assert.match(moveSource, /updateNodePosition\(nodeId, targetPosition\)/)
  assert.match(moveSource, /addNodeToGroup\(nodeId, targetGroupId\)/)
  assert.match(storeSource, /moveNodeToGroup,/)
})

test('directory duplication can preserve generated media without changing existing callers', () => {
  const duplicateSource = storeSource.slice(
    storeSource.indexOf('function duplicateNodeWithIncomingEdges('),
    storeSource.indexOf('function pasteNodes(')
  )

  assert.match(duplicateSource, /!options\.preserveResults/)
  assert.match(duplicateSource, /cleanNodeDataForProcessingDuplicate\(newNode\.data, node\.type\)/)
})
