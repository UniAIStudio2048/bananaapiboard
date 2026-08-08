import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./AIAssistantMessage.vue', import.meta.url), 'utf8')

test('thinking is a single collapsed disclosure row with a live thinking state', () => {
  assert.match(source, /message\.thinking \|\| message\.isThinking/)
  assert.match(source, /message\.isThinking \? '思考中…' : '思考过程'/)
  assert.match(source, /v-if="showThinking && message\.thinking" class="ai-thinking__content"/)
  assert.match(source, /const showThinking = ref\(false\)/)
})

test('ordinary tool calls stay out of the conversation while image generation uses a visual grid', () => {
  assert.doesNotMatch(source, /v-if="message\.tool_calls\?\.length"/)
  assert.doesNotMatch(source, /v-if="message\.toolEvents\?\.length"/)
  assert.match(source, /v-for="index in mediaGeneratingCount"/)
  assert.match(source, /class="media-generating__placeholder"/)
  assert.match(source, /const mediaGeneratingCount = computed\(\(\) =>/)
  assert.match(source, /v-if="message\.preGenerationContent" class="ai-message__text ai-message__text--pre-generation"/)
})
