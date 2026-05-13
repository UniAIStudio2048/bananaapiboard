import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const componentPath = join(__dirname, 'PromptMediaTag.vue')
const componentSource = existsSync(componentPath) ? readFileSync(componentPath, 'utf8') : ''
const popupSource = readFileSync(join(__dirname, 'PromptMentionPopup.vue'), 'utf8')
const imageNodeSource = readFileSync(join(__dirname, 'nodes/ImageNode.vue'), 'utf8')
const videoNodeSource = readFileSync(join(__dirname, 'nodes/VideoNode.vue'), 'utf8')
const textNodeSource = readFileSync(join(__dirname, 'nodes/TextNode.vue'), 'utf8')
const audioNodeSource = readFileSync(join(__dirname, 'nodes/AudioNode.vue'), 'utf8')
const aiAssistantSource = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')
const aiAssistantMentionSource = readFileSync(join(__dirname, '../../utils/aiAssistantAttachmentMentions.js'), 'utf8')

test('prompt media tag renders the thumbnail and mention label together as an inline chip that does not float outside its own bounds', () => {
  assert.ok(componentSource, 'Expected PromptMediaTag.vue to exist')
  assert.match(componentSource, /class="prompt-media-tag prompt-media-tag-chip"/)
  assert.match(componentSource, /class="prompt-media-tag-thumb"/)
  assert.match(componentSource, /<span class="prompt-media-tag-text">\{\{ displayText \}\}<\/span>/)
  assert.match(componentSource, /getMentionPreviewImageSrc\(props\.media\)/)
  assert.match(componentSource, /\.prompt-media-tag-chip\s*\{[\s\S]*display:\s*inline-flex;/)
  assert.match(componentSource, /\.prompt-media-tag-chip\s*\{[\s\S]*align-items:\s*center;/)
  assert.match(componentSource, /\.prompt-media-tag-chip\s*\{[\s\S]*border-radius:\s*999px/)
  assert.match(componentSource, /\.prompt-media-tag-thumb\s*\{[\s\S]*display:\s*inline-block;/)
  assert.match(componentSource, /\.prompt-media-tag-thumb\s*\{[\s\S]*width:\s*18px;/)
  assert.match(componentSource, /\.prompt-media-tag-thumb\s*\{[\s\S]*height:\s*18px;/)
  assert.match(componentSource, /\.prompt-media-tag-thumb\s*\{[\s\S]*border-radius:\s*50%;/)
  assert.doesNotMatch(componentSource, /position:\s*absolute/)
  assert.doesNotMatch(componentSource, /left:\s*-\d+px/)
})

test('media prompt editors render inline media chips', () => {
  for (const source of [imageNodeSource, videoNodeSource, textNodeSource, aiAssistantSource]) {
    assert.match(source, /import PromptMediaTag from/)
    assert.match(source, /<PromptMediaTag[\s\S]*:text="seg\.text"[\s\S]*:media="seg\.media"/)
    assert.match(source, /contenteditable="true"/)
    assert.match(source, /data-prompt-mention/)
  }
  assert.doesNotMatch(componentSource, /defineEmits/)
  assert.doesNotMatch(componentSource, /update:modelValue/)
})

test('canvas prompt editors keep native text selection when media mentions exist', () => {
  for (const source of [imageNodeSource, videoNodeSource, textNodeSource, aiAssistantSource]) {
    assert.match(source, /contenteditable="true"/)
    assert.match(source, /:contenteditable="seg\.isTag \? 'false' : undefined"[\s\S]*<PromptMediaTag/)
    assert.match(source, /serializePromptEditorContent/)
    assert.match(source, /restorePromptEditorSelection/)
    assert.doesNotMatch(source, /has-prompt-media-tags[\s\S]*color:\s*transparent;/)
  }
})

test('media prompt editors render mentions as atomic contenteditable chips', () => {
  for (const source of [imageNodeSource, videoNodeSource, textNodeSource, aiAssistantSource]) {
    assert.match(source, /data-prompt-mention/)
    assert.match(source, /data-prompt-segment-start/)
    assert.match(source, /data-prompt-segment-end/)
    assert.match(source, /@mousedown="seg\.isTag && handlePromptTagMousedown/)
    assert.match(source, /function\s+handlePromptTagMousedown\(seg,\s*event\)[\s\S]*event\.preventDefault\(\)/)
    assert.match(source, /getPromptEditorSelectionRange\(editor\)/)
    assert.match(source, /serializePromptEditorContent\(editor\)/)
    assert.match(source, /restorePromptEditorSelection\(editor,\s*targetIndex,\s*targetIndex\)/)
    assert.doesNotMatch(source, /prompt-highlight-overlay|llm-highlight-overlay|assistant-highlight-overlay/)
  }
})

test('media prompt overlays remain visible while selecting textarea text', () => {
  assert.match(imageNodeSource, /contenteditable="true"/)
  assert.match(imageNodeSource, /user-select:\s*text;/)
  assert.doesNotMatch(imageNodeSource, /\.prompt-input\.has-prompt-media-tags::selection\s*\{/)

  assert.match(videoNodeSource, /contenteditable="true"/)
  assert.match(videoNodeSource, /user-select:\s*text;/)
  assert.doesNotMatch(videoNodeSource, /\.prompt-input\.has-prompt-media-tags::selection\s*\{/)

  assert.match(textNodeSource, /contenteditable="true"/)
  assert.match(textNodeSource, /user-select:\s*text;/)
  assert.doesNotMatch(textNodeSource, /\.llm-input\.has-prompt-media-tags::selection\s*\{/)
})

test('video prompt media chips map visual clicks back to serialized caret positions', () => {
  assert.match(videoNodeSource, /@mousedown="seg\.isTag && handlePromptTagMousedown/)
  assert.match(videoNodeSource, /data-prompt-segment-index/)
  assert.match(videoNodeSource, /restorePromptEditorSelection\(editor,\s*targetIndex,\s*targetIndex\)/)
  assert.match(videoNodeSource, /getPromptMediaTagCaretIndex/)
  assert.doesNotMatch(videoNodeSource, /class="prompt-overlay-caret"/)
  assert.doesNotMatch(videoNodeSource, /\.prompt-input\.has-overlay-caret/)
})

test('audio music prompt uses the same contenteditable input surface', () => {
  assert.match(audioNodeSource, /contenteditable="true"/)
  assert.match(audioNodeSource, /serializePromptEditorContent/)
  assert.doesNotMatch(audioNodeSource, /<textarea[\s\S]*ref="promptTextareaRef"/)
})

test('migrated prompt editors no longer use legacy media overlays', () => {
  for (const source of [imageNodeSource, videoNodeSource, textNodeSource, aiAssistantSource]) {
    assert.match(
      source,
      /\.(?:prompt-input-wrapper|llm-input-wrapper|input-area)\s*\{[\s\S]*overflow:\s*hidden;/,
      'Prompt input wrapper should clip editor content to the prompt box'
    )
    assert.match(
      source,
      /\.(?:prompt-input|llm-input|input-textarea)\s*\{[\s\S]*box-sizing:\s*border-box;/,
      'Prompt editor should use border-box sizing'
    )
    assert.doesNotMatch(source, /prompt-highlight-overlay|llm-highlight-overlay|assistant-highlight-overlay/)
  }
})

test('prompt media tag still exposes the media prop so hover preview from the parent keeps working', () => {
  assert.match(componentSource, /media:\s*\{\s*type:\s*Object/)
  assert.match(textNodeSource, /<PromptMediaTag[\s\S]*@mouseenter="handlePromptTagHover/)
})

test('video prompt media tag falls back to rendering the video source inside the chip', () => {
  assert.match(componentSource, /<video\s+v-else-if="videoSrc"/)
  assert.match(componentSource, /:src="videoSrc"/)
  assert.match(componentSource, /preload="metadata"/)
  assert.match(componentSource, /handlePreviewError/)
  assert.match(componentSource, /hasPreviewError/)
})

test('text node media chips only highlight complete numbered media mentions', () => {
  for (const source of [imageNodeSource, videoNodeSource, textNodeSource, aiAssistantSource]) {
    assert.match(source, /const regex = \/.*\\d\+.*\/g/)
    assert.match(source, /String\(text \|\| ''\)\.match\(\/\^.*\\d\+.*\$\/\)/)
    assert.doesNotMatch(source, /const regex = \/.*\\d\*.*\/g/)
  }
  assert.match(textNodeSource, /const tagRegex = \/.*\\d\+.*\/g/)
  assert.doesNotMatch(textNodeSource, /const tagRegex = \/.*\\d\*.*\/g/)
})

test('prompt mention popup does not duplicate a media label at sign', () => {
  assert.match(popupSource, /function displayLabel\(item\)/)
  assert.match(popupSource, /displayLabel\(item\)/)
  assert.doesNotMatch(popupSource, /<span class="mention-item-label">@\{\{ item\.label \}\}<\/span>/)
})

test('prompt mention selections use the shared replacement helper', () => {
  const mediaMentionHandlers = [
    imageNodeSource.match(/function handleMentionSelect\(media\)[\s\S]*?\n}\n/)?.[0] || '',
    videoNodeSource.match(/function handleMentionSelect\(media\)[\s\S]*?\n}\n/)?.[0] || '',
    textNodeSource.match(/function handleMediaMentionSelect\(media\)[\s\S]*?\n}\n/)?.[0] || ''
  ]

  for (const source of mediaMentionHandlers) {
    assert.match(source, /replacePromptEditorMentionText/)
    assert.doesNotMatch(source, /const before = .*\.slice\(0,\s*(?:mentionStartPos|mediaMentionStartPos)\)/)
    assert.doesNotMatch(source, /promptText\.value = before \+ tag \+ ' ' \+ after/)
    assert.doesNotMatch(source, /llmInputText\.value = before \+ tag \+ ' ' \+ after/)
  }

  assert.match(aiAssistantMentionSource, /replacePromptEditorMentionText/)
})

test('node prompt media insertion uses current contenteditable text before replacing mentions', () => {
  const cases = [
    {
      name: 'ImageNode',
      source: imageNodeSource,
      textRef: 'promptText'
    },
    {
      name: 'VideoNode',
      source: videoNodeSource,
      textRef: 'promptText'
    },
    {
      name: 'TextNode',
      source: textNodeSource,
      textRef: 'llmInputText'
    }
  ]

  for (const { name, source, textRef } of cases) {
    const insertHandler = source.match(/function insertMediaTag\(media\)[\s\S]*?\n}\n/)?.[0] || ''
    assert.match(
      insertHandler,
      /const\s+currentText\s*=\s*serializePromptEditorContent\(editor\)/,
      `${name} should read the live contenteditable text before thumbnail insertion`
    )
    assert.match(
      insertHandler,
      new RegExp(`if\\s*\\(currentText\\s*!==\\s*${textRef}\\.value\\)\\s*\\{\\s*${textRef}\\.value\\s*=\\s*currentText\\s*\\}`),
      `${name} should sync reactive text from live editor text before replacing`
    )
    assert.match(
      insertHandler,
      /getActivePromptMentionRange\(currentText,\s*start\)/,
      `${name} should detect active @ query against current editor text`
    )
    assert.match(
      insertHandler,
      /text:\s*currentText/,
      `${name} should replace against current editor text, not stale reactive text`
    )

    const selectHandler = source.match(/function handle(?:Media)?MentionSelect\(media\)[\s\S]*?\n}\n/)?.[0] || ''
    assert.match(
      selectHandler,
      /const\s+currentText\s*=\s*serializePromptEditorContent\(editor\)/,
      `${name} should read the live contenteditable text before popup mention selection`
    )
    assert.match(
      selectHandler,
      /text:\s*currentText/,
      `${name} popup mention selection should replace against current editor text`
    )
  }
})
