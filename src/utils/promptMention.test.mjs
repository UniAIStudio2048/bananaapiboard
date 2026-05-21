import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyPromptEditorTextInput,
  applyPromptEditorQueuedTextInput,
  getActivePromptMentionRange,
  getEnclosingPromptMention,
  getMentionPopupPosition,
  getMentionPreviewImageSrc,
  hasPromptEditorOrphanTextNodes,
  isPromptEditorSelectionAtMentionBoundary,
  replacePromptEditorMentionText,
  sanitizePromptEditorText,
  shouldDeferPromptEditorBoundaryBeforeInputForIme,
  restoreTextareaSelectionAndScroll,
  serializePromptEditorContent,
  snapPromptEditorCaretOutOfMention
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

test('serializes contenteditable prompt without browser object replacement placeholders', () => {
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
    text('放大'),
    text('\uFFFC\uFFFC'),
    element('SPAN', [text('图片1')], { 'data-prompt-mention': '@图片1' }),
    text('\n'),
    text('\uFFFC'),
    text('继续')
  ])

  assert.equal(serializePromptEditorContent(root), '放大@图片1\n继续')
})

test('sanitizes browser object replacement placeholders from prompt text values', () => {
  assert.equal(sanitizePromptEditorText('放大\uFFFC@图片1\uFFFC继续'), '放大@图片1继续')
})

test('normalizes CRLF and lone CR newlines pasted from windows clipboards to LF', () => {
  assert.equal(sanitizePromptEditorText('第一行\r\n第二行\r第三行\n第四行'), '第一行\n第二行\n第三行\n第四行')
})

test('serializes pasted multiline text node with CRLF as LF only', () => {
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
    text('【第 30 集 片段三】\r\n0:00-0:15\r\n画面：'),
    element('SPAN', [text('图片1')], { 'data-prompt-mention': '@图片1' }),
    text('\r\n台词')
  ])

  assert.equal(
    serializePromptEditorContent(root),
    '【第 30 集 片段三】\n0:00-0:15\n画面：@图片1\n台词'
  )
})

test('detects browser-inserted direct text nodes around prompt chips', () => {
  const text = (value) => ({ nodeType: 3, nodeValue: value })
  const element = (tagName, childNodes = [], attrs = {}) => ({
    nodeType: 1,
    tagName,
    childNodes,
    getAttribute(name) {
      return attrs[name] || null
    }
  })

  assert.equal(
    hasPromptEditorOrphanTextNodes(element('DIV', [
      text('新增'),
      element('SPAN', [text('视频1')], { 'data-prompt-mention': '@视频1' })
    ])),
    true
  )

  assert.equal(
    hasPromptEditorOrphanTextNodes(element('DIV', [
      element('SPAN', [text('新增')]),
      element('SPAN', [text('视频1')], { 'data-prompt-mention': '@视频1' })
    ])),
    false
  )
})

test('applies controlled text insertion at prompt chip boundaries without duplicating existing text', () => {
  assert.deepEqual(
    applyPromptEditorTextInput({
      text: '参考@视频1生成',
      selection: { start: 2, end: 2 },
      data: '新增'
    }),
    { text: '参考新增@视频1生成', cursor: 4 }
  )

  assert.deepEqual(
    applyPromptEditorTextInput({
      text: '参考@视频1生成',
      selection: { start: 2, end: 6 },
      data: '替换'
    }),
    { text: '参考替换生成', cursor: 4 }
  )
})

test('applies rapid queued text insertion against the latest pending prompt text', () => {
  const first = applyPromptEditorQueuedTextInput({
    text: '参考@视频1生成',
    selection: { start: 2, end: 2 },
    data: '快'
  })

  assert.deepEqual(first, {
    text: '参考快@视频1生成',
    cursor: 3,
    pending: { text: '参考快@视频1生成', cursor: 3 }
  })

  assert.deepEqual(
    applyPromptEditorQueuedTextInput({
      text: '参考@视频1生成',
      selection: { start: 2, end: 2 },
      data: '速',
      pending: first.pending
    }),
    {
      text: '参考快速@视频1生成',
      cursor: 4,
      pending: { text: '参考快速@视频1生成', cursor: 4 }
    }
  )
})

test('defers single latin beforeinput at prompt chip boundaries for Chrome and Edge IME startup', () => {
  assert.equal(
    shouldDeferPromptEditorBoundaryBeforeInputForIme({
      inputType: 'insertText',
      data: 'n',
      isComposing: false
    }),
    true
  )

  assert.equal(
    shouldDeferPromptEditorBoundaryBeforeInputForIme({
      inputType: 'insertText',
      data: '你',
      isComposing: false
    }),
    false
  )

  assert.equal(
    shouldDeferPromptEditorBoundaryBeforeInputForIme({
      inputType: 'deleteContentBackward',
      data: null,
      isComposing: false
    }),
    false
  )
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

// ---- mention caret snapping ----

function makeMockDom(structure) {
  // structure example:
  //   ['DIV', [
  //     ['SPAN', [['#text', '前']]],
  //     ['SPAN-MENTION', '@视频1', [['SPAN', [['#text', '视频1']]]]],
  //     ['SPAN', [['#text', '后']]]
  //   ]]
  const make = (spec, parent) => {
    if (Array.isArray(spec) && spec[0] === '#text') {
      const node = {
        nodeType: 3,
        nodeValue: spec[1],
        parentNode: parent,
        childNodes: [],
        contains(other) { return other === this }
      }
      return node
    }
    let tagName, attrs = {}, childSpecs = []
    if (spec[0] === 'SPAN-MENTION') {
      tagName = 'SPAN'
      attrs['data-prompt-mention'] = spec[1]
      childSpecs = spec[2] || []
    } else {
      tagName = spec[0]
      childSpecs = spec[1] || []
    }
    const node = {
      nodeType: 1,
      tagName,
      attrs,
      parentNode: parent,
      childNodes: [],
      getAttribute(name) { return attrs[name] ?? null },
      contains(other) {
        if (other === this) return true
        return (node.childNodes || []).some(child => child.contains?.(other))
      }
    }
    childSpecs.forEach(childSpec => {
      const child = make(childSpec, node)
      node.childNodes.push(child)
    })
    return node
  }
  return make(structure, null)
}

test('getEnclosingPromptMention returns the chip ancestor for a node inside a chip', () => {
  const root = makeMockDom(['DIV', [
    ['SPAN', [['#text', '前']]],
    ['SPAN-MENTION', '@视频1', [['SPAN', [['#text', '视频1']]]]],
    ['SPAN', [['#text', '后']]]
  ]])
  const chip = root.childNodes[1]
  const innerSpan = chip.childNodes[0]
  const innerText = innerSpan.childNodes[0]

  assert.equal(getEnclosingPromptMention(root, innerText), chip)
  assert.equal(getEnclosingPromptMention(root, innerSpan), chip)
  assert.equal(getEnclosingPromptMention(root, chip), chip)
  assert.equal(getEnclosingPromptMention(root, root.childNodes[0]), null)
  assert.equal(getEnclosingPromptMention(root, null), null)
  assert.equal(getEnclosingPromptMention(null, root), null)
})

function installSelectionShim(root, range, { rectMap = new Map() } = {}) {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document

  const selection = {
    rangeCount: 1,
    isCollapsed: range.collapsed !== false && range.startContainer === range.endContainer && range.startOffset === range.endOffset,
    getRangeAt() { return range },
    removeAllRanges() {},
    addRange(next) {
      selection.lastRange = next
      selection.rangeCount = 1
      selection.isCollapsed = next.collapsed !== false
    }
  }

  globalThis.window = {
    getSelection() { return selection }
  }
  globalThis.document = {
    createRange() {
      const r = {
        startContainer: null,
        startOffset: 0,
        endContainer: null,
        endOffset: 0,
        collapsed: false,
        setStart(node, offset) { r.startContainer = node; r.startOffset = offset; if (r.collapsed) { r.endContainer = node; r.endOffset = offset } },
        setEnd(node, offset) { r.endContainer = node; r.endOffset = offset },
        collapse() { r.collapsed = true; r.endContainer = r.startContainer; r.endOffset = r.startOffset },
        getBoundingClientRect() { return null },
        selectNodeContents() {},
        cloneContents() { return { childNodes: [] } }
      }
      return r
    }
  }

  // 用 rectMap 给 mention chip 装备 getBoundingClientRect
  rectMap.forEach((rect, node) => {
    node.getBoundingClientRect = () => rect
  })

  return {
    selection,
    restore() {
      if (previousWindow === undefined) delete globalThis.window
      else globalThis.window = previousWindow
      if (previousDocument === undefined) delete globalThis.document
      else globalThis.document = previousDocument
    }
  }
}

test('isPromptEditorSelectionAtMentionBoundary recognises caret trapped inside a chip', () => {
  const root = makeMockDom(['DIV', [
    ['SPAN-MENTION', '@视频1', [['SPAN', [['#text', '视频1']]]]],
    ['SPAN', [['#text', 'abc']]]
  ]])
  const chip = root.childNodes[0]
  const innerText = chip.childNodes[0].childNodes[0]
  const range = {
    startContainer: innerText,
    startOffset: 0,
    endContainer: innerText,
    endOffset: 0,
    collapsed: true
  }
  const shim = installSelectionShim(root, range)
  try {
    assert.equal(isPromptEditorSelectionAtMentionBoundary(root), true)
  } finally {
    shim.restore()
  }
})

test('snapPromptEditorCaretOutOfMention moves caret to chip start when at chip head', () => {
  const root = makeMockDom(['DIV', [
    ['SPAN-MENTION', '@视频1', [['SPAN', [['#text', '视频1']]]]],
    ['SPAN', [['#text', 'abc']]]
  ]])
  const chip = root.childNodes[0]
  const innerText = chip.childNodes[0].childNodes[0]
  const range = {
    startContainer: innerText,
    startOffset: 0,
    endContainer: innerText,
    endOffset: 0,
    collapsed: true
  }
  const shim = installSelectionShim(root, range)
  try {
    const adjusted = snapPromptEditorCaretOutOfMention(root)
    assert.equal(adjusted, true)
    assert.equal(shim.selection.lastRange.startContainer, root)
    // mention 是 root.childNodes[0]，snap 到 chip 之前 → offset 0
    assert.equal(shim.selection.lastRange.startOffset, 0)
  } finally {
    shim.restore()
  }
})

test('snapPromptEditorCaretOutOfMention moves caret to chip end when at chip tail', () => {
  const root = makeMockDom(['DIV', [
    ['SPAN', [['#text', '前']]],
    ['SPAN-MENTION', '@视频1', [['SPAN', [['#text', '视频1']]]]]
  ]])
  const chip = root.childNodes[1]
  const innerText = chip.childNodes[0].childNodes[0]
  const range = {
    startContainer: innerText,
    startOffset: '视频1'.length, // 末尾
    endContainer: innerText,
    endOffset: '视频1'.length,
    collapsed: true
  }
  const shim = installSelectionShim(root, range)
  try {
    const adjusted = snapPromptEditorCaretOutOfMention(root)
    assert.equal(adjusted, true)
    assert.equal(shim.selection.lastRange.startContainer, root)
    // mention 是 root.childNodes[1]，snap 到 chip 之后 → offset 2
    assert.equal(shim.selection.lastRange.startOffset, 2)
  } finally {
    shim.restore()
  }
})

test('snapPromptEditorCaretOutOfMention is a no-op when caret is already outside chips', () => {
  const root = makeMockDom(['DIV', [
    ['SPAN', [['#text', '前']]],
    ['SPAN-MENTION', '@视频1', [['SPAN', [['#text', '视频1']]]]],
    ['SPAN', [['#text', '后']]]
  ]])
  const editableText = root.childNodes[0].childNodes[0]
  const range = {
    startContainer: editableText,
    startOffset: 1,
    endContainer: editableText,
    endOffset: 1,
    collapsed: true
  }
  const shim = installSelectionShim(root, range)
  try {
    const adjusted = snapPromptEditorCaretOutOfMention(root)
    assert.equal(adjusted, false)
  } finally {
    shim.restore()
  }
})
