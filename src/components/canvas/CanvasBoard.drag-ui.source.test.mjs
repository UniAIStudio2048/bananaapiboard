import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const board = readFileSync(new URL('./CanvasBoard.vue', import.meta.url), 'utf8')
const group = readFileSync(new URL('./nodes/GroupNode.vue', import.meta.url), 'utf8')

test('dragging a node hides contextual toolbars and prompt panels without changing selection', () => {
  assert.ok(/'is-node-dragging': isDraggingNode/.test(board), 'CanvasBoard should expose the node drag state to CSS')
  for (const className of [
    'image-toolbar', 'video-toolbar', 'audio-toolbar', 'format-toolbar',
    'storyboard-toolbar', 'group-toolbar', 'config-panel', 'llm-config-panel'
  ]) {
    assert.ok(
      new RegExp(`\\.canvas-board\\.is-node-dragging[^,{]*:deep\\([^)]*\\.${className}\\)`).test(board),
      `${className} should be hidden while a node is dragged`
    )
  }
  assert.ok(
    /v-if="selected && !isEditing && !props\.data\?\.readonly" class="group-toolbar"/.test(group),
    'Group toolbar should require selection'
  )
})
