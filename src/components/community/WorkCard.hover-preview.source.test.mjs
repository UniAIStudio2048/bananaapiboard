import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./WorkCard.vue', import.meta.url), 'utf8')

test('like action is hidden until the community work card is hovered or focused', () => {
  assert.match(source, /class="[^"]*community-work-card-like/, 'like button should have a stable class for hover visibility')
  assert.match(source, /opacity-0/, 'like button should be visually hidden by default')
  assert.match(source, /pointer-events-none/, 'hidden like button should not catch pointer clicks')
  assert.match(source, /group-hover:opacity-100/, 'card hover should reveal the like button')
  assert.match(source, /group-hover:pointer-events-auto/, 'card hover should restore pointer interaction')
  assert.match(source, /group-focus-within:opacity-100/, 'keyboard focus should reveal the like button')
  assert.match(source, /\[@media\(hover:none\)\]:opacity-100/, 'touch devices should keep the like button visible')
  assert.match(source, /:aria-label="work\.is_liked \? '取消点赞' : '点赞'"/, 'like button should expose an accessible action label')
})

test('video work cards play a muted preview only while hovered', () => {
  assert.match(source, /@mouseenter="playPreviewVideo"/, 'card hover should start video preview playback')
  assert.match(source, /@mouseleave="resetPreviewVideo"/, 'leaving the card should stop and rewind video preview playback')
  assert.match(source, /const isVideoPreviewActive = ref\(false\)/, 'video preview should be inactive by default so the card shows the cover')
  assert.match(source, /<img[\s\S]*v-if="displayImageUrl"[\s\S]*:src="displayImageUrl"/, 'video cards should render the cover image as the default visual')
  assert.match(source, /v-if="isVideoPreviewActive && isVideoWork && videoPreviewUrl"/, 'the video element should only render while preview playback is active')
  assert.match(source, /ref="previewVideoRef"/, 'video preview element should be addressable from script')
  assert.match(source, /<video[\s\S]*:src="videoPreviewUrl"[\s\S]*muted[\s\S]*loop[\s\S]*playsinline[\s\S]*preload="metadata"/, 'video preview should be muted, looping, inline, and metadata-preloaded')
  assert.match(source, /function playPreviewVideo\(\)/, 'component should expose a hover play handler')
  assert.match(source, /function resetPreviewVideo\(\)/, 'component should expose a hover reset handler')
  assert.match(source, /isVideoPreviewActive\.value = true/, 'hover play should activate the preview layer')
  assert.match(source, /isVideoPreviewActive\.value = false/, 'leaving the card should deactivate the preview layer')
  assert.match(source, /video\.play\?\.\(\)/, 'hover play handler should call play on the video element')
  assert.match(source, /video\.pause\?\.\(\)/, 'hover reset handler should pause the video element')
  assert.match(source, /video\.currentTime = 0/, 'hover reset handler should rewind the preview')
})

test('paid and featured work badges use grayscale glass styling', () => {
  assert.match(source, /community-work-card-paid-badge/, 'paid badge should have a stable semantic class')
  assert.match(source, /community-work-card-featured-badge/, 'featured badge should have a stable semantic class')
  assert.match(source, /community-work-card-paid-badge[^"]*bg-white\/75[^"]*text-neutral-950/, 'paid badge should use a brighter grayscale glass background')
  assert.match(source, /community-work-card-featured-badge[^"]*bg-black\/45[^"]*text-white/, 'featured badge should use a darker grayscale glass background')
  assert.match(source, /backdrop-blur-md/, 'work badges should use a frosted glass blur')
  assert.match(source, /border-white\/35/, 'the brighter paid badge should have a light translucent border')
  assert.match(source, /border-white\/20/, 'the darker featured badge should have a subtler translucent border')
  assert.doesNotMatch(source, /bg-amber-500\/90/, 'paid badge should no longer use the amber background')
  assert.doesNotMatch(source, /bg-purple-500\/90/, 'featured badge should no longer use the purple background')
})
