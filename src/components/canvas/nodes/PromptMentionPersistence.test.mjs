import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ref } from 'vue'
import { bindMediaMention, normalizeMediaMentionLabel, resolveMediaMentionItem, syncPromptMediaMentions } from '../../../utils/promptMediaBindings.js'

// Load the pure text operations without cloud-media/Vite configuration imports.
const mentionSource = readFileSync(new URL('../../../utils/promptMention.js', import.meta.url), 'utf8')
const mentionFunctions = ['getPromptMentionReplaceEnd', 'getActivePromptMentionRange', 'replacePromptEditorMentionText']
  .map(name => mentionSource.match(new RegExp(`(?:export )?function ${name}\\([\\s\\S]*?\\n\\}(?=\\n)`))[0].replace(/^export /, ''))
  .join('\n')
const { getActivePromptMentionRange, replacePromptEditorMentionText } = runInNewContext(
  `${mentionFunctions}\n({ getActivePromptMentionRange, replacePromptEditorMentionText })`
)

const mediaItems = [
  { type: 'video', index: 1, label: '视频1', url: 'https://example.com/a.mp4', key: 'video:https://example.com/a.mp4' },
  { type: 'image', index: 1, label: '图片1', url: 'https://example.com/a.png', key: 'image:https://example.com/a.png' }
]

function createEditor(file, initialText, selection, mounted = true) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const functions = ['updatePromptMentionBindings', 'insertMediaTag', 'syncPromptMentionsWithMedia']
    .map(name => {
      const body = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}(?=\\n)`))?.[0]
      assert.ok(body, `${file}: ${name}`)
      return body
    }).join('\n')
  const promptText = ref(initialText)
  const saved = { prompt: initialText, promptMentionBindings: {}, model: 'unchanged' }
  const editor = { scrollTop: 25, scrollLeft: 0 }
  const queued = []
  const sandbox = {
    props: { id: 'target' }, promptText, promptMentionBindings: ref({}),
    promptTextareaRef: ref(mounted ? editor : null), promptEditorRenderKey: ref(0),
    referenceMediaList: ref(mediaItems),
    canvasStore: { updateNodeData(id, patch) { assert.equal(id, 'target'); Object.assign(saved, patch) } },
    bindMediaMention, normalizeMediaMentionLabel, resolveMediaMentionItem, syncPromptMediaMentions,
    getActivePromptMentionRange, replacePromptEditorMentionText,
    getPromptEditorSelectionRange: () => selection,
    serializePromptEditorContent: () => promptText.value,
    nextTick: callback => queued.push(callback),
    removePromptEditorOrphanTextNodes() {}, autoResizeTextarea() {}, updatePromptOverlayCaret() {},
    restorePromptEditorSelection(element, start, end) { selection.start = start; selection.end = end }
  }
  const actions = runInNewContext(`${functions}\n({ insertMediaTag, syncPromptMentionsWithMedia })`, sandbox)
  return {
    ...actions, saved, promptText,
    flushParentEcho() {
      // Vue Flow can publish the binding update before the queued prompt watcher.
      // The echoed node must already contain the edited prompt, not its old text.
      promptText.value = saved.prompt
      queued.splice(0).forEach(callback => callback())
    }
  }
}

for (const file of ['VideoNode.vue', 'ImageNode.vue']) {
  test(`${file}: first image and video clicks survive the parent data echo at the chosen caret`, () => {
    const selection = { start: 7, end: 7 }
    const editor = createEditor(file, '@视频1 让画面中的人物转身', selection)
    for (const [type, expected, caret] of [
      ['image', '@视频1 让画 @图片1 面中的人物转身', 13],
      ['video', '@视频1 让画 @视频1 @图片1 面中的人物转身', 12],
      ['image', '@视频1 让画 @图片1 @视频1 @图片1 面中的人物转身', 12]
    ]) {
      selection.start = selection.end = 7
      editor.insertMediaTag({ type, index: 1, label: type === 'image' ? '图片1' : '视频1' })
      editor.flushParentEcho()
      assert.equal(editor.promptText.value, expected)
      assert.equal(editor.saved.prompt, expected)
      assert.equal(editor.saved.model, 'unchanged')
      assert.equal(selection.start, caret)
      assert.equal(selection.end, selection.start)
    }
    assert.equal(Object.keys(editor.saved.promptMentionBindings).length, 2)
  })

  test(`${file}: selected text is replaced and saved on the first reference click`, () => {
    const editor = createEditor(file, '@视频1 让画面中的人物转身', { start: 7, end: 11 })
    editor.insertMediaTag(mediaItems[1])
    editor.flushParentEcho()
    assert.equal(editor.saved.prompt, '@视频1 让画 @图片1 物转身')
    assert.equal(editor.promptText.value, editor.saved.prompt)
  })

  test(`${file}: active at query replacement is saved with its binding`, () => {
    const editor = createEditor(file, '@视频1 参考@图', { start: 9, end: 9 })
    editor.insertMediaTag(mediaItems[1])
    editor.flushParentEcho()
    assert.equal(editor.saved.prompt, '@视频1 参考 @图片1 ')
  })

  test(`${file}: insertion without a mounted editor persists the appended reference`, () => {
    const editor = createEditor(file, '参考', { start: 0, end: 0 }, false)
    editor.insertMediaTag(mediaItems[1])
    editor.flushParentEcho()
    assert.equal(editor.saved.prompt, '参考 @图片1 ')
  })

  test(`${file}: removing unavailable media persists text and bindings together`, () => {
    const editor = createEditor(file, '@视频2 和 @图片1', { start: 0, end: 0 })
    editor.syncPromptMentionsWithMedia()
    editor.flushParentEcho()
    assert.equal(editor.saved.prompt, ' 和 @图片1')
    assert.equal(editor.promptText.value, editor.saved.prompt)
    assert.equal(Object.keys(editor.saved.promptMentionBindings).length, 1)
  })
}
