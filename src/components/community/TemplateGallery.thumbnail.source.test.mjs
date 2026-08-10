import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./TemplateGallery.vue', import.meta.url), 'utf8')

test('template gallery covers use CDN thumbnails instead of originals', () => {
  assert.match(
    source,
    /import\s*\{[^}]*getCanvasThumbnailUrl[^}]*\}\s*from\s*'@\/utils\/canvasThumbnail'/,
    'TemplateGallery should reuse the canvas thumbnail utility for CDN images'
  )
  assert.match(
    source,
    /TEMPLATE_THUMB_WIDTH\s*=\s*\d+/,
    'template thumbnail width should be a fixed constant'
  )
  assert.match(
    source,
    /:src="getCanvasThumbnailUrl\(tpl\.cover_url,\s*TEMPLATE_THUMB_WIDTH\)"/,
    'template cover should be transformed to a thumbnail URL'
  )
})
