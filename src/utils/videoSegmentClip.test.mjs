import test from 'node:test'
import assert from 'node:assert/strict'
import { initialClipRange, moveClipRange, resizeClipRange, adjustClipRangeByKey, getClipBarPosition } from './videoSegmentClip.js'

test('默认选择视频前三分之一，短视频保留完整长度', () => {
  assert.deepEqual(initialClipRange(12), { start: 0, end: 4 })
  assert.deepEqual(initialClipRange(2), { start: 0, end: 1 })
  assert.deepEqual(initialClipRange(0.7), { start: 0, end: 0.7 })
})

test('拖拽两端限制在视频内并保留至少一秒', () => {
  const range = { start: 2, end: 6 }
  assert.deepEqual(resizeClipRange(range, 10, 'start', 5.9), { start: 5, end: 6 })
  assert.deepEqual(resizeClipRange(range, 10, 'end', 20), { start: 2, end: 10 })
  assert.deepEqual(resizeClipRange(range, 10, 'end', 2.1), { start: 2, end: 3 })
  assert.deepEqual(resizeClipRange(range, 10, 'start', 3.46, true), { start: 3, end: 6 })
  assert.deepEqual(resizeClipRange({ start: 0, end: 0.7 }, 0.7, 'start', 0.5), { start: 0, end: 0.7 })
})

test('启用吸附时边缘始终对齐整数秒，并可整体移动选区', () => {
  const range = { start: 2, end: 6 }
  assert.deepEqual(resizeClipRange(range, 10, 'start', 2.94, true), { start: 3, end: 6 })
  assert.deepEqual(resizeClipRange(range, 10, 'start', 3.46, true), { start: 3, end: 6 })
  assert.deepEqual(resizeClipRange(range, 10, 'end', 6.06, true), { start: 2, end: 6 })
  assert.deepEqual(resizeClipRange(range, 10, 'end', 6.46, true), { start: 2, end: 6 })
  assert.deepEqual(resizeClipRange(range, 10, 'end', 6.06, false), { start: 2, end: 6.06 })
  assert.deepEqual(moveClipRange({ start: 2.2, end: 5.4 }, 10, 0.74, true), { start: 3, end: 6.2 })
  assert.deepEqual(moveClipRange({ start: 2.2, end: 5.4 }, 10, 0.74, false), { start: 2.94, end: 6.14 })
})

test('整体移动选区时保持长度且不越界', () => {
  assert.deepEqual(moveClipRange({ start: 2, end: 5 }, 10, -20), { start: 0, end: 3 })
  assert.deepEqual(moveClipRange({ start: 2, end: 5 }, 10, 20), { start: 7, end: 10 })
})

test('快捷键按 0.1 秒或 1 秒移动、缩放和设置出入点', () => {
  const range = { start: 2, end: 5 }
  assert.deepEqual(adjustClipRangeByKey(range, 10, 'ArrowRight'), { start: 2.1, end: 5.1 })
  assert.deepEqual(adjustClipRangeByKey(range, 10, 'ArrowUp', 0, true), { start: 2, end: 4 })
  assert.deepEqual(adjustClipRangeByKey(range, 10, 'i', 4.8), { start: 4, end: 5 })
  assert.deepEqual(adjustClipRangeByKey(range, 10, 'o', 8), { start: 2, end: 8 })
})

test('工具栏优先位于节点下方并保持在视口内', () => {
  assert.deepEqual(getClipBarPosition({ left: 0, width: 200, top: 300, bottom: 500 }, 1000, 800, 68), { left: 12, top: 512, width: 976 })
  assert.deepEqual(getClipBarPosition({ left: 900, width: 100, top: 20, bottom: 220 }, 1000, 800, 68), { left: 12, top: 232, width: 976 })
  assert.deepEqual(getClipBarPosition({ left: 20, width: 100, top: 200, bottom: 300 }, 320, 600, 68), { left: 12, top: 312, width: 296 })
  assert.deepEqual(getClipBarPosition({ left: 20, width: 100, top: 1000, bottom: 1100 }, 320, 600, 68), { left: 12, top: 524, width: 296 })
})
