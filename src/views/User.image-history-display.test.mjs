import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./User.vue', import.meta.url), 'utf8')
const cachedImageSource = readFileSync(new URL('../components/CachedImage.vue', import.meta.url), 'utf8')

test('user image history uses cached image fallback instead of raw image tags', () => {
  assert.match(source, /import CachedImage from '@\/components\/CachedImage\.vue'/)
  assert.match(source, /import \{ getHistoryImageDisplayUrl, makeHistoryImagePlaceholder \} from '@\/utils\/historyImageDisplay'/)
  assert.match(source, /:src="getImageDisplayUrl\(image\)"/)
  assert.match(source, /:placeholder="makeHistoryImagePlaceholder\(image\)"/)
})

test('user image history grid adapts and avoids cropping generated images', () => {
  assert.match(source, /grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4/)
  assert.match(source, /img-class="w-full h-full object-contain"/)
})

test('image history filter toolbar wraps into responsive rows', () => {
  assert.match(source, /image-history-filter-toolbar/)
  assert.match(source, /grid-cols-1 sm:grid-cols-2 xl:grid-cols-\[minmax\(150px,170px\)_minmax\(180px,1fr\)_minmax\(280px,300px\)_auto_auto_auto_auto\]/)
  assert.doesNotMatch(source, /<!-- 分隔线 -->\s*<div class="flex-1"><\/div>/)
})

test('image history rating control is anchored inside image preview area', () => {
  assert.match(source, /history-image-stage/)
  assert.match(source, /history-image-overlay-actions/)
  assert.match(source, /absolute top-2 right-2 z-10 flex items-center gap-1 history-image-overlay-actions/)
})

test('image history hover actions are layered above CachedImage image', () => {
  assert.match(cachedImageSource, /\.cached-image-wrapper\s*>\s*img\s*\{[\s\S]*?z-index:\s*2;/)
  assert.match(
    source,
    /absolute top-2 right-2 z-10 flex items-center gap-1 history-image-overlay-actions/
  )
  assert.match(
    source,
    /absolute inset-0 z-10 bg-black\/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center space-x-2/
  )
})

test('user image history card click opens preview outside selection mode', () => {
  assert.match(
    source,
    /@click="imageSelectMode \? toggleImageSelection\(image\.id\) : viewImage\(image\)"/
  )
})

test('image preview can show the full image and full prompt text', () => {
  assert.match(source, /img-class="max-w-full max-h-\[calc\(96vh-190px\)\] w-auto h-auto object-contain/)
  assert.match(source, /whitespace-pre-wrap break-words leading-relaxed/)
  assert.doesNotMatch(source, /<p class="text-white font-medium mb-2 truncate"/)
})
