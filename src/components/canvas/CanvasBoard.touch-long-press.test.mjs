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

test('node long press opens the node context menu without requiring prior selection', () => {
  assert.match(source, /mode: 'node-delete-pending'/)
  assert.match(source, /function startSelectedNodeTouchDelete\(/)
  assert.match(source, /nodeId && !isInteractiveTouchTarget\(event\.target\)[\s\S]{0,160}startSelectedNodeTouchDelete\(event, nodeId\)/)
  assert.doesNotMatch(source, /nodeId && isNodeSelectedForTouchDelete\(nodeId\)/)
  assert.match(source, /const node = canvasStore\.nodes\.find\(n => n\.id === touchState\.nodeId\)/)
  assert.match(source, /canvasStore\.openContextMenu\(\s*touchState\.lastPoint,\s*node\s*\)/)
  assert.doesNotMatch(source, /canvasStore\.removeNode\(touchState\.nodeId\)/)
})

test('moving a pending long press cancels the menu or create action', () => {
  assert.match(source, /if \(touchState\.mode === 'blank-long-press'\) \{/)
  assert.match(source, /if \(touchState\.mode === 'node-delete-pending'\) \{/)
  assert.match(source, /clearTouchLongPressTimer\(\)/)
})
