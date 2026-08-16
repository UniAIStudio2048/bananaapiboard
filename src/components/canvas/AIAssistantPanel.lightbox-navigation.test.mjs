import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const panelSource = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')
const messageSource = readFileSync(join(__dirname, 'AIAssistantMessage.vue'), 'utf8')

test('generated image preview forwards the sibling images in its message group', () => {
  assert.match(messageSource, /function previewImage\(media, images\) \{[\s\S]*?const imageGroup = images[\s\S]*?\.filter\(item => item\.type === 'image'\)[\s\S]*?images:\s*imageGroup/)
  assert.match(messageSource, /@click="previewImage\(media, mediaResults\)"/)
})

test('image lightbox shows bounded previous and next navigation controls', () => {
  assert.match(panelSource, /v-if="lightboxMedia\.type === 'image' && lightboxImages\.length > 1" class="lightbox-navigation"/)
  assert.match(panelSource, /@click="showPreviousLightboxImage"/)
  assert.match(panelSource, /@click="showNextLightboxImage"/)
  assert.match(panelSource, /:disabled="!hasPreviousLightboxImage"/)
  assert.match(panelSource, /:disabled="!hasNextLightboxImage"/)
  assert.match(panelSource, /function showPreviousLightboxImage\(\) \{[\s\S]*?if \(lightboxImageIndex\.value <= 0\) return/)
  assert.match(panelSource, /function showNextLightboxImage\(\) \{[\s\S]*?if \(lightboxImageIndex\.value >= lightboxImages\.value\.length - 1\) return/)
})

test('single images without a group retain the existing standalone preview behavior', () => {
  assert.match(panelSource, /function previewMedia\(\{ type, url, name, images = \[\] \}\)/)
  assert.match(panelSource, /lightboxMedia\.value = imageIndex >= 0 \? imageGroup\[imageIndex\] : \{ type, url, name \}/)
})

test('image lightbox maps ArrowLeft and ArrowRight to navigation while retaining Escape close', () => {
  const keydown = panelSource.match(/function handleLightboxKeydown\(e\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(keydown, 'handleLightboxKeydown must exist')
  assert.match(keydown, /e\.key === 'Escape'/)
  assert.match(keydown, /e\.key === 'ArrowLeft'/)
  assert.match(keydown, /showPreviousLightboxImage\(\)/)
  assert.match(keydown, /e\.key === 'ArrowRight'/)
  assert.match(keydown, /showNextLightboxImage\(\)/)
})
