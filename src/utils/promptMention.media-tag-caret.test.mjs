import test from 'node:test'
import assert from 'node:assert/strict'

import * as promptMention from './promptMention.js'

test('maps a click in the visual gap between adjacent media tags to the previous tag end', () => {
  const { getPromptMediaTagCaretIndex } = promptMention
  assert.equal(
    typeof getPromptMediaTagCaretIndex,
    'function',
    'promptMention.js should export getPromptMediaTagCaretIndex'
  )

  const segments = [
    { text: '@视频1', isTag: true, start: 0, end: 4 },
    { text: '@图片4', isTag: true, start: 4, end: 8 }
  ]

  const caretIndex = getPromptMediaTagCaretIndex({
    segments,
    segmentIndex: 0,
    clickX: 152,
    tagRects: [
      { left: 100, right: 148 },
      { left: 156, right: 204 }
    ]
  })

  assert.equal(caretIndex, segments[0].end)
})

test('uses the visual boundary between adjacent media tag chips for the overlay caret rect', () => {
  const { getPromptMediaTagBoundaryCaretRect } = promptMention
  assert.equal(
    typeof getPromptMediaTagBoundaryCaretRect,
    'function',
    'promptMention.js should export getPromptMediaTagBoundaryCaretRect'
  )

  const segments = [
    { text: '@视频1', isTag: true, start: 0, end: 4 },
    { text: '@图片4', isTag: true, start: 4, end: 8 }
  ]

  const rect = getPromptMediaTagBoundaryCaretRect({
    segments,
    caretIndex: 4,
    tagRects: [
      { left: 100, right: 148, top: 20, bottom: 42, height: 22 },
      { left: 156, right: 204, top: 20, bottom: 42, height: 22 }
    ],
    height: 20
  })

  assert.deepEqual(rect, {
    left: 152,
    top: 21,
    height: 20
  })
})

test('uses tag rect order, not full segment indexes, for adjacent tag boundary caret rects', () => {
  const { getPromptMediaTagBoundaryCaretRect } = promptMention

  const segments = [
    { text: '参考', isTag: false, start: 0, end: 2 },
    { text: '@视频1', isTag: true, start: 2, end: 6 },
    { text: '@图片4', isTag: true, start: 6, end: 10 }
  ]

  const rect = getPromptMediaTagBoundaryCaretRect({
    segments,
    caretIndex: 6,
    tagRects: [
      { left: 100, right: 148, top: 20, bottom: 42, height: 22 },
      { left: 156, right: 204, top: 20, bottom: 42, height: 22 }
    ],
    height: 20
  })

  assert.deepEqual(rect, {
    left: 152,
    top: 21,
    height: 20
  })
})

test('keeps a prompt overlay click caret at the visual click x while insertion stays snapped', () => {
  const { getPromptMediaTagCaretIndex, getPromptOverlayClickCaretRect } = promptMention
  assert.equal(
    typeof getPromptOverlayClickCaretRect,
    'function',
    'promptMention.js should export getPromptOverlayClickCaretRect'
  )

  const segments = [
    { text: '@视频1', isTag: true, start: 0, end: 4 },
    { text: '@图片4', isTag: true, start: 4, end: 8 }
  ]

  const caretIndex = getPromptMediaTagCaretIndex({
    segments,
    segmentIndex: 0,
    clickX: 150,
    tagRects: [
      { left: 100, right: 148 },
      { left: 156, right: 204 }
    ]
  })
  const rect = getPromptOverlayClickCaretRect({
    clickX: 150,
    clickY: 31,
    overlayRect: { left: 90, right: 220, top: 10, bottom: 60 },
    lineRect: { left: 100, right: 204, top: 20, bottom: 42, height: 22 },
    height: 20
  })

  assert.equal(caretIndex, 4)
  assert.deepEqual(rect, {
    left: 150,
    top: 21,
    height: 20
  })
})
