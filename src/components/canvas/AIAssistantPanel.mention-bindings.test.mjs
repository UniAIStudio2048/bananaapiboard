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

test('assistant input defers editor sync and remount for Chrome IME first pinyin character', () => {
  const handler = source.match(/function\s+handleInputEvent\(event\)[\s\S]*?\n}\n/)?.[0] || ''
  assert.match(
    handler,
    /shouldDeferPromptEditorBoundaryBeforeInputForIme\(event\)[\s\S]*?needsStructuralRepair[\s\S]*?nextTick\(\(\) => \{[\s\S]*?if \(isInputComposing\) return[\s\S]*?inputEditorRenderKey\.value\s*\+= 1/,
    'assistant input should defer inputText sync and editor remount when a single latin char may start IME composition'
  )
  assert.match(
    handler,
    /shouldDeferPromptEditorBoundaryBeforeInputForIme\(event\)[\s\S]*?nextTick\(\(\) => \{[\s\S]*?inputText\.value[\s\S]*?inputEditorRenderKey\.value\s*\+= 1/,
    'assistant input should fall back to syncing text and remounting when no composition starts'
  )
})

test('assistant input treats browser-pasted styled spans as needing structural repair', () => {
  const handler = source.match(/function\s+handleInputEvent\(event\)[\s\S]*?\n}\n/)?.[0] || ''
  // 浏览器粘贴带样式/富文本内容时会在 contenteditable 里插入 <span style="...">，
  // 它不属于 Vue 受控的 prompt-highlight-segment span，可能在 editor 根级，也可能
  // 嵌套在受控段内部；needsStructuralRepair 必须把它识别为结构性残留并走 remount
  // 分支，否则粘贴文本会与受控 span 在 DOM 中同时存在而重复显示，且发送后残留输入区。
  assert.match(
    handler,
    /needsStructuralRepair[\s\S]*?querySelectorAll\([^)]*\)[\s\S]*?prompt-highlight-segment/,
    'assistant input should scan all element descendants (not only direct children) for non-controlled nodes when deciding structural repair'
  )
  assert.match(
    handler,
    /prompt-highlight-segment\.is-prompt-tag-slot/,
    'assistant input should allow nested elements only inside prompt tag slots (PromptMediaTag render)'
  )
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

test('assistant @ mention candidates include conversation media (AI generated + user uploaded)', () => {
  assert.match(
    source,
    /import \{ buildConversationMediaFromMessages, buildConversationMentionCandidates \} from '@\/utils\/aiAssistantConversationMedia'/,
    'should import the conversation media merging helpers'
  )
  assert.match(
    source,
    /const conversationMentionItems = computed\(\(\) => buildConversationMentionCandidates\(\{[\s\S]*?currentAttachments: attachments\.value,[\s\S]*?conversationMedia: buildConversationMediaFromMessages\(messages\.value\)/,
    'mention candidates should merge current attachments with all conversation media'
  )
  assert.match(
    source,
    /const filteredAttachmentMentionItems = computed\(\(\) => \{[\s\S]*?return conversationMentionItems\.value\.filter/,
    'the @ popup list should filter over the conversation-scoped candidates'
  )
  assert.match(
    source,
    /function mergeMentionedHistoryMedia\(baseAttachments = \[\]\)[\s\S]*?key\.startsWith\('url:'\)/,
    'history media referenced via @ should be merged into outgoing attachments'
  )
})
