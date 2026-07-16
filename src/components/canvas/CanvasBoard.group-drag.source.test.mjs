import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')
const dragHandler = source.match(/onNodeDrag\(\(event\) => \{[\s\S]*?\n\}\)\n\n\/\/ 计算对齐辅助线/)

assert.ok(dragHandler, 'CanvasBoard should contain the node drag handler')
assert.doesNotMatch(
  dragHandler[0],
  /updateGroupOffsetForNode\(/,
  'group child offsets should be committed after drag, not during Vue Flow drag events'
)
assert.doesNotMatch(
  dragHandler[0],
  /clampPositionInsideNodeGroup\(/,
  'group children should remain free to cross group bounds while dragging'
)

const dragStopHandler = source.match(/onNodeDragStop\(\(event\) => \{[\s\S]*?\n\}\)\n\n\n\/\/ 处理节点拖拽中/)
assert.ok(dragStopHandler, 'CanvasBoard should contain the node drag stop handler')
assert.match(
  dragStopHandler[0],
  /commitNodeGroupDrop\(/,
  'node drag stop should reconcile automatic group membership from the drop position'
)

const touchFinishHandler = source.match(/function finishTouchNodeDrag\(\) \{[\s\S]*?\n\}/)
assert.ok(touchFinishHandler, 'CanvasBoard should contain the touch drag finish handler')
assert.match(
  touchFinishHandler[0],
  /commitNodeGroupDrop\(/,
  'touch drag finish should use the same automatic group membership behavior'
)
