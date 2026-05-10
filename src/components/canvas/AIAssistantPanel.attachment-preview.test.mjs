import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

function cssBlock(selector) {
  const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('assistant input attachments reuse canvas hover preview behavior', () => {
  assert.match(source, /import\s+\{\s*useImageHoverPreview\s*\}\s+from\s+'@\/composables\/useImageHoverPreview'/)
  assert.match(source, /const\s+\{\s*onHoverStart,\s*onVideoHoverStart,\s*onHoverEnd\s*\}\s*=\s*useImageHoverPreview\(\)/)
  assert.match(source, /@mouseenter="onHoverStart\(att\.preview,\s*\$event\)"/)
  assert.match(source, /@mouseenter="onVideoHoverStart\(att\.preview,\s*\$event\)"/)
  assert.match(source, /@mouseleave="onHoverEnd"/)
})

test('assistant input media thumbnails are rounded squares with mention labels', () => {
  const wrapper = cssBlock('.attachment-thumb-wrapper')
  const thumb = cssBlock('.attachment-thumb')
  const label = cssBlock('.attachment-mention-label')

  assert.match(source, /<div v-if="attachmentMentionItems\[index\]" class="attachment-mention-label">[\s\S]*@\{\{ attachmentMentionItems\[index\]\.label \}\}/)
  assert.match(wrapper, /width:\s*72px;/)
  assert.match(wrapper, /height:\s*72px;/)
  assert.match(wrapper, /border-radius:\s*8px;/)
  assert.match(thumb, /object-fit:\s*cover;/)
  assert.match(label, /bottom:\s*6px;/)
  assert.match(label, /border-radius:\s*999px;/)
})
