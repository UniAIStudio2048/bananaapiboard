import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('assistant attachment thumbnails insert their @ mention labels when clicked', () => {
  assert.match(
    source,
    /function\s+insertAttachmentMention\(/,
    'AIAssistantPanel should expose a click handler for inserting attachment mentions'
  )

  assert.match(
    source,
    /@click\.stop="insertAttachmentMention\(index\)"/,
    'image/video attachment thumbnails should insert their indexed mention on click'
  )
})

test('assistant attachment thumbnail clicks replace an active @ query instead of appending @@', () => {
  assert.match(
    source,
    /getActivePromptMentionRange\(inputText\.value,\s*start\)/,
    'assistant attachment insertion should detect the active @ query'
  )

  assert.match(
    source,
    /const\s+replaceStart\s*=\s*activeMention\?\.start\s*\?\?\s*start[\s\S]*const\s+replaceEnd\s*=\s*activeMention\?\.end\s*\?\?\s*end/,
    'assistant attachment insertion should replace the active @ query range'
  )
})

test('assistant attachment mention insertion remounts the contenteditable editor before restoring selection', () => {
  assert.match(
    source,
    /const\s+inputEditorRenderKey\s*=\s*ref\(0\)/,
    'assistant input should keep a render key for controlled contenteditable remounts'
  )

  assert.match(
    source,
    /:key="inputEditorRenderKey"[\s\S]*ref="inputRef"/,
    'assistant contenteditable input should use the render key'
  )

  const insertHandler = source.match(/function\s+insertAttachmentMention\(index\)[\s\S]*?\n}\n/)?.[0] || ''
  assert.match(
    insertHandler,
    /inputEditorRenderKey\.value\s*\+=\s*1[\s\S]*nextTick/,
    'thumbnail insertion should remount the editor before restoring the caret'
  )

  const selectHandler = source.match(/function\s+selectAttachmentMention\(item\)[\s\S]*?\n}\n/)?.[0] || ''
  assert.match(
    selectHandler,
    /inputEditorRenderKey\.value\s*\+=\s*1[\s\S]*nextTick/,
    'popup selection should remount the editor before restoring the caret'
  )
})

test('assistant input guards IME composition before serializing the contenteditable editor', () => {
  const handler = source.match(/function\s+handleInputEvent\(event\)[\s\S]*?\n}\n/)?.[0] || ''
  assert.match(
    handler,
    /if\s*\(\s*isInputComposing\s*\|\|\s*event\?\.isComposing\s*\)\s*return/,
    'assistant input should not serialize or restore selection while IME composition is active'
  )

  assert.match(
    source,
    /function\s+handleInputCompositionStart\(\)\s*\{[\s\S]*?isInputComposing\s*=\s*true/,
    'assistant input should mark IME composition start'
  )

  assert.match(
    source,
    /function\s+handleInputCompositionEnd\(event\)\s*\{[\s\S]*?isInputComposing\s*=\s*false[\s\S]*?handleInputEvent\(event\)/,
    'assistant input should sync the final composed value on compositionend'
  )

  assert.match(source, /@compositionstart="handleInputCompositionStart"/)
  assert.match(source, /@compositionend="handleInputCompositionEnd"/)
})

test('assistant attachment drags reset local and canvas drag state on every drag end path', () => {
  assert.match(
    source,
    /function\s+resetAttachmentDragState\(/,
    'AIAssistantPanel should centralize attachment drag cleanup'
  )

  assert.match(
    source,
    /@dragend="resetAttachmentDragState"/,
    'attachment dragend should use the shared cleanup handler'
  )

  assert.match(
    source,
    /window\.dispatchEvent\(new CustomEvent\('canvas-drag-end'\)\)/,
    'attachment drag cleanup should release global canvas drag listeners'
  )
})
