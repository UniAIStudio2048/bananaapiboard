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
