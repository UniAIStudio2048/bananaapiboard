import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const cases = [
  ['ImageNode', 'handlePromptInput', 'promptText', 'promptEditorRenderKey', 'promptTextareaRef'],
  ['VideoNode', 'handlePromptInput', 'promptText', 'promptEditorRenderKey', 'promptTextareaRef'],
  ['AudioNode', 'handleMusicInput', 'musicPrompt', 'promptEditorRenderKey', 'promptTextareaRef'],
  ['TextNode', 'handleLLMInput', 'llmInputText', 'llmInputRenderKey', 'llmInputRef']
]

for (const [file, handler, value, key, ref] of cases) {
  for (const remount of [false, true]) {
    test(`${file} keeps the edited position after input${remount ? ' and remount' : ''}`, () => {
      const source = readFileSync(new URL(`./${file}.vue`, import.meta.url), 'utf8')
      const start = source.indexOf(`function ${handler}(event) {`)
      const end = source.indexOf('\nfunction ', start + 1)
      assert.ok(start >= 0 && end > start)
      const callbacks = []
      const editor = { scrollTop: 120, scrollLeft: 8, childNodes: [], focus() {} }
      const replacement = remount ? { ...editor, scrollTop: 0, scrollLeft: 0 } : editor
      const context = {
        [value]: { value: 'old' }, [key]: { value: 0 }, [ref]: { value: replacement },
        isPromptInputComposing: false, isMusicInputComposing: false, isLLMInputComposing: false,
        getPromptEditorSelectionRange: () => ({ start: 4, end: 4 }),
        serializePromptEditorContent: () => 'text',
        hasPromptEditorOrphanTextNodes: () => remount,
        autoResizeTextarea: () => { editor.scrollTop = 0; editor.scrollLeft = 0 },
        autoResizeLLMInput: () => { editor.scrollTop = 0; editor.scrollLeft = 0 },
        nextTick: callback => callbacks.push(callback),
        restorePromptEditorSelection: target => { target.scrollTop = 0; target.scrollLeft = 0 },
        removePromptEditorOrphanTextNodes() {}, cleanOrphanedEditorTextNodes() {},
        updatePromptOverlayCaret() {}, updatePromptMentionPopup() {},
        referenceMediaList: { value: [] }, showMentionPopup: { value: false },
        showMediaMentionPopup: { value: false }, showMentionList: { value: false }
      }
      runInNewContext(`${source.slice(start, end)}\n${handler}({ target: editor })`, { ...context, editor })
      callbacks.forEach(callback => callback())
      assert.equal(replacement.scrollTop, 120)
      assert.equal(replacement.scrollLeft, 8)
    })
  }
}

for (const [file, , , , ref] of cases) {
  test(`${file} keeps scroll position while recalculating height`, () => {
    const source = readFileSync(new URL(`./${file}.vue`, import.meta.url), 'utf8')
    const handler = file === 'TextNode' ? 'autoResizeLLMInput' : 'autoResizeTextarea'
    const start = source.indexOf(`function ${handler}() {`)
    const end = source.indexOf('\n}', start + 1) + 2
    assert.ok(start >= 0 && end > start)
    const editor = { scrollTop: 120, scrollLeft: 8, scrollHeight: 400 }
    editor.style = { set height(value) { if (value === 'auto') { editor.scrollTop = 0; editor.scrollLeft = 0 } } }
    const context = {
      [ref]: { value: editor }, hasManualPromptTextareaSize: { value: false },
      hasManualLLMInputSize: { value: false }, syncPromptHighlightOverlayScroll() {},
      syncLLMHighlightOverlayScroll() {}
    }
    runInNewContext(`${source.slice(start, end)}\n${handler}()`, context)
    assert.equal(editor.scrollTop, 120)
    assert.equal(editor.scrollLeft, 8)
  })
}
