import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readTextNode() {
  return readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')
}

function openingTagAround(source, needle) {
  const refIndex = source.indexOf(needle)
  assert.ok(refIndex >= 0, `Expected TextNode markup containing ${needle}`)
  const tagStart = source.lastIndexOf('<div', refIndex)
  const tagEnd = source.indexOf('\n          >', refIndex)
  assert.ok(tagStart >= 0 && tagEnd > refIndex, `Expected opening div around ${needle}`)
  return source.slice(tagStart, tagEnd)
}

test('text node empty quick actions consume tablet touch events before canvas node gestures', () => {
  const source = readTextNode()
  assert.match(
    source,
    /labelKey:\s*'canvas\.textNode\.writeContent',\s*action:\s*\(\)\s*=>\s*handlePrepareEdit\(\)/,
    'Write content action should enter the ready state before tablet double tap editing'
  )

  const actionIndex = source.indexOf('v-for="action in quickActions"')
  assert.ok(actionIndex >= 0, 'Expected TextNode quick action markup')
  const tagStart = source.lastIndexOf('<div', actionIndex)
  const tagEnd = source.indexOf('\n            >', actionIndex)
  assert.ok(tagStart >= 0 && tagEnd > actionIndex, 'Expected TextNode quick action opening tag')
  const quickAction = source.slice(tagStart, tagEnd)

  assert.match(quickAction, /class="text-node-action quick-action nodrag"/)
  assert.match(quickAction, /@pointerdown\.stop/)
  assert.match(quickAction, /@touchstart\.stop/)
  assert.match(quickAction, /@touchmove\.stop/)
  assert.doesNotMatch(quickAction, /@touch(?:start|move)\.stop\.prevent/)
  assert.doesNotMatch(quickAction, /@pointerdown\.stop\.prevent/)
})

test('text node ready prompt handles tablet double taps explicitly', () => {
  const source = readTextNode()
  assert.match(source, /const READY_EDIT_DOUBLE_TAP_MS\s*=\s*350/)
  assert.match(source, /let lastReadyEditTapAt\s*=\s*0/)
  assert.match(source, /function handleReadyEditTap\([\s\S]*?handleEdit\(\)/)

  const readyIndex = source.indexOf("nodeState === 'ready'")
  assert.ok(readyIndex >= 0, 'Expected TextNode ready prompt markup')
  const tagStart = source.lastIndexOf('<div', readyIndex)
  const tagEnd = source.indexOf('\n          >', readyIndex)
  assert.ok(tagStart >= 0 && tagEnd > readyIndex, 'Expected TextNode ready prompt opening tag')
  const readyPrompt = source.slice(tagStart, tagEnd)

  assert.match(readyPrompt, /class="text-node-ready quick-action nodrag"/)
  assert.match(readyPrompt, /@click\.stop="handleReadyEditTap"/)
  assert.match(readyPrompt, /@dblclick\.stop="handleEdit"/)
  assert.match(readyPrompt, /@pointerdown\.stop/)
  assert.match(readyPrompt, /@touchstart\.stop/)
  assert.match(readyPrompt, /@touchmove\.stop/)
  assert.doesNotMatch(readyPrompt, /@touch(?:start|move)\.stop\.prevent/)
  assert.doesNotMatch(readyPrompt, /@pointerdown\.stop\.prevent/)
})

test('text node content editors consume tablet touch events without preventing caret movement', () => {
  const source = readTextNode()
  const richTextEditor = openingTagAround(source, 'ref="textareaRef"')
  const llmInput = openingTagAround(source, 'ref="llmInputRef"')

  for (const editor of [richTextEditor, llmInput]) {
    assert.match(editor, /contenteditable="true"/)
    assert.match(editor, /@pointerdown\.stop/)
    assert.match(editor, /@touchstart\.stop/)
    assert.match(editor, /@touchmove\.stop/)
    assert.doesNotMatch(editor, /@touch(?:start|move)\.stop\.prevent/)
    assert.doesNotMatch(editor, /@pointerdown\.stop\.prevent/)
  }
})
