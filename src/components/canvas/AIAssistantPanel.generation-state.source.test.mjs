import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8')

test('assistant starts in a visible thinking state before streaming its answer', () => {
  assert.match(source, /thinking: '',[\s\S]*?isThinking: true,[\s\S]*?isStreaming: true/)
  assert.match(source, /onThinking: \(chunk, fullThinking\) => \{[\s\S]*?messages\.value\[assistantMessageIndex\]\.isThinking = true/)
  assert.match(source, /onContent: \(chunk, fullContent\) => \{[\s\S]*?messages\.value\[assistantMessageIndex\]\.isThinking = false/)
})

test('only image or video tool events become visible generation state', () => {
  assert.match(source, /function getAssistantMediaGeneratingType\(event\)/)
  assert.match(source, /message\.mediaGenerating = generatingType/)
  assert.match(source, /message\.mediaGeneratingCount = getRequestedMediaCount\(messageText, generatingType\)/)
  assert.match(source, /delete message\.mediaGeneratingCount/)
})

test('content produced before an image tool remains above the generated media group', () => {
  assert.match(source, /message\.preGenerationContent = message\.content/)
  assert.match(source, /message\.generationContentOffset = message\.content\.length/)
  assert.match(source, /pendingStreamContent = fullContent\.slice\(message\.generationContentOffset \|\| 0\)/)
})
