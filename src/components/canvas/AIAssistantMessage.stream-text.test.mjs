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

test('media generation shows a visual placeholder grid with image/video label', () => {
  assert.match(source, /v-if="message\.mediaGenerating"[\s\S]*?class="media-generating"/)
  assert.match(source, /message\.mediaGenerating === 'video' \? '视频生成中' : '图片生成中'/)
  assert.match(source, /class="media-generating__grid"/)
  assert.match(source, /\.media-generating__placeholder \{[\s\S]*?aspect-ratio: 1;/)
})

test('assistant media previews normalize API-relative URLs before rendering', () => {
  assert.match(source, /import\s+\{\s*toSameOriginUrl\s*\}\s+from\s+'@\/utils\/canvasThumbnail'/)
  assert.match(source, /:src="toSameOriginUrl\(att\.url\)"/)
  assert.match(source, /url: toSameOriginUrl\(att\.url\)/)
})

test('user messages render the model reference as a tag card', () => {
  assert.match(source, /v-if="message\.role === 'user' && \(message\.skillRef \|\| message\.modelRef \|\| visibleAttachments\.length\)" class="ai-message__references"/)
  assert.match(source, /message\.modelRef\.label \|\| message\.modelRef\.modelId/)
  assert.match(source, /message\.skillRef\.label/)
  assert.match(source, /class="ai-message-reference__thumbnail"/)
  assert.match(source, /\.ai-message-reference \{[\s\S]*?border-radius:\s*10px;/)
})

test('generation results render as visual media cards with a download button', () => {
  assert.match(source, /import \{ startStreamDownload \} from '@\/api\/client'/)
  assert.match(source, /const mediaResults = computed\(\(\) => \{[\s\S]*?MEDIA_TOOL_NAMES\.some\(name => toolName\.includes\(name\)\)/,
    'media results should be extracted from image/video/task-status tool events')
  assert.match(source, /const MEDIA_URL_RE = \//)
  assert.match(source, /mediaTypeFromUrl\(/)
  assert.match(source, /v-if="message\.role === 'assistant' && mediaResults\.length" class="ai-media-results"/)
  assert.match(source, /v-if="media\.type === 'image'"[\s\S]*?class="ai-media-card__preview"/)
  assert.match(source, /class="ai-media-card__download"[\s\S]*?@click\.stop="startStreamDownload\(media\.url, media\.name\)"/)
  assert.match(source, /showMediaResults = !showMediaResults/)
  assert.match(source, /v-if="!showMediaResults"[\s\S]*?class="ai-media-results__collapsed"/)
  assert.match(source, /class="ai-media-results__remaining">\+\{\{ mediaResults\.length - 1 \}\}/)
  assert.match(source, /\.ai-media-card \{[\s\S]*?aspect-ratio:\s*1;/)
})
