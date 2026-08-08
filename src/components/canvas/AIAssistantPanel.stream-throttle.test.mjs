import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('stream content updates are throttled and flushed on done', () => {
  assert.match(source, /let streamContentTimer = null[\s\S]*?let pendingStreamContent = ''/)
  assert.match(source, /const flushStreamContent = \(\) => \{[\s\S]*?clearTimeout\(streamContentTimer\)[\s\S]*?messages\.value\[assistantMessageIndex\]\.content = pendingStreamContent/)
  assert.match(source, /onContent: \(chunk, fullContent\) => \{[\s\S]*?pendingStreamContent = fullContent[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?}, 40\)/)
  assert.match(source, /onDone: \(fullContent, result\) => \{[\s\S]*?flushStreamContent\(\)/)
})

test('media generation shows a generating state instead of skill text', () => {
  assert.match(source, /const generatingType = getAssistantMediaGeneratingType\(event\)/)
  assert.match(source, /message\.mediaGenerating = generatingType/)
  assert.match(source, /message\.mediaGeneratingCount = getRequestedMediaCount\(messageText, generatingType\)/)
  assert.match(source, /message\.toolEvents\.push\(\{[\s\S]*?name: formatAssistantToolName\(event\.tool_name \|\| ''\)/)
  assert.match(source, /const applyGeneratedResult = \(result\) => \{[\s\S]*?delete message\.mediaGenerating/)
  assert.match(source, /onDone: \(fullContent, result\) => \{[\s\S]*?delete messages\.value\[assistantMessageIndex\]\.mediaGenerating/)
  assert.match(source, /if \(event\.result && !event\.result\?\.error && Array\.isArray\(event\.result\?\.result_urls\)\)/)
  assert.match(source, /if \(!urls\.length\) return[\s\S]*?if \(!message\.content\)/)
})
