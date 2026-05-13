import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

test('image node resolves clicked thumbnail payloads before binding media mentions', () => {
  assert.match(
    source,
    /resolveMediaMentionItem/,
    'ImageNode should import and use resolveMediaMentionItem like VideoNode'
  )

  assert.match(
    source,
    /const\s+resolvedMedia\s*=\s*resolveMediaMentionItem\(media,\s*referenceMediaList\.value\)[\s\S]*const\s+mentionMedia\s*=\s*resolvedMedia\s*\|\|\s*media[\s\S]*bindMediaMention\(promptMentionBindings\.value,\s*mentionMedia\)/,
    'thumbnail click/selection should bind the resolved item that contains url/key'
  )
})

test('image node opens mention popup from the active @ query without relying on InputEvent.data', () => {
  assert.doesNotMatch(
    source,
    /event\.data\s*===\s*['"]@['"]/,
    'contenteditable mention popup should not depend on event.data'
  )

  assert.match(
    source,
    /if\s*\(query\.length\s*<\s*4\s*&&\s*!\s*\/\\s\/\.test\(query\)\)/,
    'ImageNode should show mention choices for short active @ queries'
  )
})

test('image node re-renders the contenteditable prompt after inserting media mentions', () => {
  assert.match(
    source,
    /const\s+promptEditorRenderKey\s*=\s*ref\(0\)/,
    'ImageNode should track a render key for the contenteditable prompt'
  )

  assert.match(
    source,
    /:key="promptEditorRenderKey"/,
    'ImageNode prompt editor should be keyed so inserted chips render immediately'
  )

  assert.match(
    source,
    /promptEditorRenderKey\.value\s*\+=\s*1/,
    'ImageNode should bump the render key after inserting or selecting a mention'
  )
})

test('image node thumbnail clicks replace the active @ query instead of appending a second at sign', () => {
  assert.match(
    source,
    /getActivePromptMentionRange\(currentText,\s*start\)/,
    'thumbnail insertion should detect the active @ query at the caret'
  )

  assert.match(
    source,
    /if\s*\(activeMention\)\s*\{[\s\S]*?mentionStart:\s*activeMention\.start[\s\S]*?caret:\s*activeMention\.end/,
    'thumbnail insertion should replace the active @ query range when mention is active'
  )
})
