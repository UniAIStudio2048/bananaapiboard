import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getActivePromptMentionRange,
  getMentionPopupPosition,
  getMentionPreviewImageSrc,
  replacePromptEditorMentionText,
  restoreTextareaSelectionAndScroll,
  serializePromptEditorContent
} from './promptMention.js'

test('positions mention popup below caret when there is enough viewport space', () => {
  const result = getMentionPopupPosition({
    caretRect: { top: 420, bottom: 440, left: 100 },
    popupHeight: 120,
    viewportHeight: 700,
    offset: 8
  })

  assert.deepEqual(result, { top: 448, left: 100 })
})

test('positions mention popup above caret when below would overflow viewport', () => {
  const result = getMentionPopupPosition({
    caretRect: { top: 620, bottom: 640, left: 100 },
    popupHeight: 180,
    viewportHeight: 700,
    offset: 8
  })

  assert.deepEqual(result, { top: 432, left: 100 })
})

test('uses a video poster url for video mentions without explicit thumbnails', () => {
  const result = getMentionPreviewImageSrc({
    type: 'video',
    url: 'https://filescos.nananobanana.cn/demo/reference.mp4'
  })

  assert.match(result, /ci-process=snapshot/)
  assert.doesNotMatch(result, /imageView2/)
})

test('restores textarea selection without changing current scroll position', () => {
  const calls = []
  const textarea = {
    scrollTop: 180,
    scrollLeft: 24,
    focus() {
      calls.push('focus')
      this.scrollTop = 999
      this.scrollLeft = 99
    },
    setSelectionRange(start, end) {
      calls.push(['selection', start, end])
      this.scrollTop = 999
      this.scrollLeft = 99
    }
  }

  restoreTextareaSelectionAndScroll(textarea, 12)

  assert.deepEqual(calls, ['focus', ['selection', 12, 12]])
  assert.equal(textarea.scrollTop, 180)
  assert.equal(textarea.scrollLeft, 24)
})

test('restores textarea selection to an explicitly captured scroll position', () => {
  const textarea = {
    scrollTop: 999,
    scrollLeft: 99,
    focus() {},
    setSelectionRange() {}
  }

  restoreTextareaSelectionAndScroll(textarea, 12, 12, { scrollTop: 180, scrollLeft: 24 })

  assert.equal(textarea.scrollTop, 180)
  assert.equal(textarea.scrollLeft, 24)
})

test('serializes contenteditable prompt chips back to prompt mention text', () => {
  const text = (value) => ({ nodeType: 3, nodeValue: value })
  const element = (tagName, childNodes = [], attrs = {}) => ({
    nodeType: 1,
    tagName,
    childNodes,
    getAttribute(name) {
      return attrs[name] || null
    }
  })

  const root = element('DIV', [
    text('参考'),
    element('SPAN', [text('视频1')], { 'data-prompt-mention': '@视频1' }),
    text('和'),
    element('SPAN', [text('图片1')], { 'data-prompt-mention': '@图片1' }),
    element('BR'),
    text('生成')
  ])

  assert.equal(serializePromptEditorContent(root), '参考@视频1和@图片1\n生成')
})

test('replaces the active prompt mention query without duplicating the at sign', () => {
  assert.deepEqual(
    replacePromptEditorMentionText({
      text: '@',
      mentionStart: 0,
      caret: 1,
      replacement: '@图片1',
      appendSpace: true
    }),
    { text: '@图片1 ', cursor: 5 }
  )

  assert.deepEqual(
    replacePromptEditorMentionText({
      text: '@图',
      mentionStart: 0,
      caret: 2,
      replacement: '@图片1',
      appendSpace: true
    }),
    { text: '@图片1 ', cursor: 5 }
  )

  assert.deepEqual(
    replacePromptEditorMentionText({
      text: '参考 @图 做图',
      mentionStart: 3,
      caret: 5,
      replacement: '@图片1',
      appendSpace: true
    }),
    { text: '参考 @图片1 做图', cursor: 7 }
  )

  assert.deepEqual(
    replacePromptEditorMentionText({
      text: '参考 @ 做图',
      mentionStart: 3,
      caret: 3,
      replacement: '@图片1',
      appendSpace: true
    }),
    { text: '参考 @图片1 做图', cursor: 7 }
  )

  assert.deepEqual(
    replacePromptEditorMentionText({
      text: '参考 @ 做图',
      mentionStart: 4,
      caret: 4,
      replacement: '@图片1',
      appendSpace: true
    }),
    { text: '参考 @图片1 做图', cursor: 7 }
  )
})

test('finds the active mention query before the caret for thumbnail insertion', () => {
  assert.deepEqual(
    getActivePromptMentionRange('参考 @图', 5),
    { start: 3, end: 5, query: '图' }
  )

  assert.deepEqual(
    getActivePromptMentionRange('@', 1),
    { start: 0, end: 1, query: '' }
  )

  assert.equal(getActivePromptMentionRange('参考 @图片1', 7), null)
  assert.equal(getActivePromptMentionRange('参考 @图 继续', 8), null)
})
