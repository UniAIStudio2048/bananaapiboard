import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8')

test('running requests use a square stop control', () => {
  assert.match(source, /class="send-btn"[\s\S]*:class="\{ 'send-btn--stop': isLoading \}"/)
  assert.match(source, /isLoading \? stopCurrentActivity\(\) : sendMessage\(\)/)
  assert.match(source, /function stopCurrentActivity\(/)
})

test('follow-up drafts queue above the composer and support force insertion', () => {
  assert.match(source, /class="queued-message-bar"/)
  assert.match(source, /@click="forceInsertQueuedMessage\(queued\)"/)
  assert.match(source, /const queuedMessages = ref\(\[\]\)/)
  assert.match(source, /if \(isLoading\.value && !force\)/)
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/)
})
