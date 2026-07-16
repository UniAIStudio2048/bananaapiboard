import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./CanvasBoard.vue', import.meta.url), 'utf8')

test('node drag stop persists every Vue Flow dragged node as one position batch', () => {
  const dragStopHandler = source.match(
    /onNodeDragStop\(\(event\) => \{[\s\S]*?\n\}\)\n\n\n\/\/ 处理节点拖拽中/
  )

  assert.ok(dragStopHandler, 'CanvasBoard should contain the node drag stop handler')
  assert.match(dragStopHandler[0], /const draggedNodes = event\.nodes\?\.length \? event\.nodes : \[node\]/)
  assert.match(
    dragStopHandler[0],
    /canvasStore\.updateNodePositionsBatch\(\s*getDraggedNodeFinalPositions\(draggedNodes, node, finalPosition\)\s*\)/
  )
  assert.doesNotMatch(dragStopHandler[0], /canvasStore\.updateNodePosition\(node\.id, finalPosition\)/)
})
