import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./BannerCarousel.vue', import.meta.url), 'utf8')

test('carousel banner covers use CDN thumbnails, fullscreen preview keeps original', () => {
  assert.match(
    source,
    /import\s*\{[^}]*getCanvasThumbnailUrl[^}]*\}\s*from\s*'@\/utils\/canvasThumbnail'/,
    'BannerCarousel should reuse the canvas thumbnail utility for CDN images'
  )
  assert.match(
    source,
    /BANNER_THUMB_WIDTH\s*=\s*\d+/,
    'banner thumbnail width should be a fixed constant'
  )
  assert.match(
    source,
    /bannerThumb\(prevBanner\.cover_url\)/,
    'left carousel card should use the thumbnail transform'
  )
  assert.match(
    source,
    /bannerThumb\(currentBanner\.cover_url\)/,
    'center carousel card should use the thumbnail transform'
  )
  assert.match(
    source,
    /bannerThumb\(nextBanner\.cover_url\)/,
    'right carousel card should use the thumbnail transform'
  )
  assert.match(
    source,
    /viewPhase === 'cover'[\s\S]*:src="activeBanner\.cover_url"/,
    'fullscreen preview should keep the original cover image'
  )
})
