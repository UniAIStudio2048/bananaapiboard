import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'CanvasBoard.vue'), 'utf8')

test('touch long press uses a dedicated duration and cleanup timer', () => {
  assert.match(source, /const TOUCH_LONG_PRESS_DURATION = \d+/)
  assert.match(source, /let touchLongPressTimer = null/)
  assert.match(source, /function clearTouchLongPressTimer\(\)/)
  assert.match(source, /clearTouchLongPressTimer\(\)[\s\S]*removeGlobalTouchListeners\(\)/)
})

test('blank canvas long press opens the node selector at the touched flow position', () => {
  assert.match(source, /mode: 'blank-long-press'/)
  assert.match(source, /function startBlankTouchLongPress\(/)
  assert.match(source, /canvasStore\.openNodeSelector\(\s*touchState\.lastPoint,\s*'canvas',\s*null,\s*flowPosition\s*\)/)
})

test('selected node long press deletes only that selected node', () => {
  assert.match(source, /mode: 'node-delete-pending'/)
  assert.match(source, /function startSelectedNodeTouchDelete\(/)
  assert.match(source, /function isNodeSelectedForTouchDelete\(/)
  assert.match(source, /canvasStore\.removeNode\(touchState\.nodeId\)/)
})

test('moving a pending long press cancels the destructive or create action', () => {
  assert.match(source, /if \(touchState\.mode === 'blank-long-press'\) \{/)
  assert.match(source, /if \(touchState\.mode === 'node-delete-pending'\) \{/)
  assert.match(source, /clearTouchLongPressTimer\(\)/)
})
