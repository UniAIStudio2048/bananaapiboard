import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('lightbox shows download and load-to-canvas actions for image and video media', () => {
  assert.match(source, /v-if="lightboxMedia\.type === 'image' \|\| lightboxMedia\.type === 'video'" class="lightbox-actions"/)
  assert.match(source, /@click="downloadLightboxMedia"/)
  assert.match(source, /@click="loadLightboxMediaToCanvas"/)
})

test('download reuses the stream download helper with the media name', () => {
  // 命名导入集合可能随其他 API 一并引入（startStreamDownload + updateUserPreferences 等）
  assert.match(source, /import \{ [^}]*startStreamDownload[^}]*\} from '@\/api\/client'/)
  assert.match(source, /function downloadLightboxMedia\(\) \{[\s\S]*?startStreamDownload\(url, name \|\| 'ai-assistant-media'\)[\s\S]*?closeLightbox\(\)/)
})

test('load to canvas emits canvas-writeback targeting the currently selected node', () => {
  assert.match(source, /function loadLightboxMediaToCanvas\(\) \{[\s\S]*?emit\('canvas-writeback', \{[\s\S]*?node_id: null,[\s\S]*?media_type: type,[\s\S]*?result_urls: \[url\],[\s\S]*?history_id: null[\s\S]*?\}\)[\s\S]*?closeLightbox\(\)/)
})

test('lightbox buttons adapt to light theme and close preview after action', () => {
  assert.match(source, /:root\.canvas-theme-light \.media-lightbox \{[\s\S]*?rgba\(248, 250, 252, 0\.92\)/)
  assert.match(source, /:root\.canvas-theme-light \.lightbox-close \{[\s\S]*?color: rgba\(0, 0, 0, 0\.8\)/)
  assert.match(source, /:root\.canvas-theme-light \.lightbox-action-btn \{[\s\S]*?background: #7668e8/)
})
