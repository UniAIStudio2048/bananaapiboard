import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./WorkCard.vue', import.meta.url), 'utf8')

test('work card cover images use CDN thumbnails instead of originals', () => {
  assert.match(
    source,
    /import\s*\{[^}]*getCanvasThumbnailUrl[^}]*\}\s*from\s*'@\/utils\/canvasThumbnail'/,
    'WorkCard should reuse the canvas thumbnail utility for CDN images'
  )
  assert.match(
    source,
    /displayImageUrl[\s\S]*getCanvasThumbnailUrl\(/,
    'default cover URL should be transformed to a thumbnail URL'
  )
  assert.match(
    source,
    /currentSlideUrl[\s\S]*getCanvasThumbnailUrl\(/,
    'slideshow slide URLs should also be transformed to thumbnail URLs'
  )
  assert.match(
    source,
    /CARD_THUMBNAIL_WIDTH\s*=\s*\d+/,
    'thumbnail width should be a fixed constant so CDN originals are never loaded'
  )
  assert.match(
    source,
    /getCanvasThumbnailUrl\([^)]*CARD_THUMBNAIL_WIDTH\)/,
    'thumbnail transforms should pass the fixed card width constant'
  )
})
