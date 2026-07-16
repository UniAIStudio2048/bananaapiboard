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
