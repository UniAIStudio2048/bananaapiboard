import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantMessage.vue'), 'utf8')

test('streaming assistant messages render plain text instead of full markdown', () => {
  assert.match(source, /<template v-else-if="message\.isStreaming && message\.content">[\s\S]*?<div class="ai-message__text-stream">\{\{ message\.content \}\}<\/div>/)
  assert.match(source, /<template v-else>[\s\S]*?<div v-html="formattedContent"><\/div>/)
  assert.match(source, /\.ai-message__text-stream \{[\s\S]*?white-space: pre-wrap;/)
})

test('media generation shows a generating card with image/video label', () => {
  assert.match(source, /v-if="message\.mediaGenerating"[\s\S]*?class="media-generating"/)
  assert.match(source, /message\.mediaGenerating === 'video' \? '视频生成中' : '图片生成中'/)
  assert.match(source, /\.media-generating__icon \{[\s\S]*?animation: media-generating-pulse/)
})

test('assistant media previews normalize API-relative URLs before rendering', () => {
  assert.match(source, /import\s+\{\s*toSameOriginUrl\s*\}\s+from\s+'@\/utils\/canvasThumbnail'/)
  assert.match(source, /:src="toSameOriginUrl\(att\.url\)"/)
  assert.match(source, /url: toSameOriginUrl\(att\.url\)/)
})
