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
  assert.match(source, /history-masonry history-masonry-images/)
  assert.match(source, /\.history-masonry-images\s*\{[\s\S]*column-width:\s*260px;/)
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

test('image and video preview details use shared history media metadata formatter', () => {
  assert.match(source, /import \{ buildHistoryMediaDetails, enrichHistoryMediaDetails \} from '@\/utils\/historyMediaDetails'/)
  assert.match(source, /function getImagePreviewDetails\(image\)[\s\S]*buildHistoryMediaDetails\(image/)
  assert.match(source, /function getVideoPreviewDetails\(video\)[\s\S]*buildHistoryMediaDetails\(\{ \.\.\.video, type: 'video' \}/)
  assert.match(source, /enrichHistoryMediaDetails\(selectedImage\.value, \{ resolveUrl: getMediaUrl \}\)/)
  assert.match(source, /enrichHistoryMediaDetails\(selectedVideo\.value, \{ resolveUrl: getMediaUrl \}\)/)
  assert.match(source, /v-for="detail in getImagePreviewDetails\(selectedImage\)"/)
  assert.match(source, /v-for="detail in getVideoPreviewDetails\(selectedVideo\)"/)
  assert.match(source, /flex flex-wrap items-start gap-x-4 gap-y-1\.5 text-sm text-white\/75 select-text/)
  assert.match(source, /min-w-0 break-all font-medium text-white/)
  assert.doesNotMatch(source, /rounded-lg bg-white\/10 px-3 py-2/)
})

test('image preview supports keyboard save shortcuts with remembered directory', () => {
  assert.match(source, /import \{ buildStreamDownloadPath \} from '@\/api\/downloadRouting'/)
  assert.match(source, /import \{ getHistoryImageDownloadFilename, getHistoryImageShortcutAction \} from '@\/utils\/historyImageDownload'/)
  assert.match(source, /const historyImageDownloadDirectoryHandle = ref\(null\)/)
  assert.match(source, /async function saveSelectedImageToDirectory\(/)
  assert.match(source, /async function saveHistoryImageDownloadDirectoryHandle\(/)
  assert.match(source, /async function loadHistoryImageDownloadDirectoryHandle\(/)
  assert.match(source, /async function downloadSelectedImageFromPreview\(/)
  assert.match(source, /function handleImagePreviewShortcut\(event\)/)
  assert.match(source, /loadHistoryImageDownloadDirectoryHandle\(\)/)
  assert.match(source, /window\.addEventListener\('keydown', handleImagePreviewShortcut\)/)
  assert.match(source, /window\.removeEventListener\('keydown', handleImagePreviewShortcut\)/)
  assert.match(source, /getHistoryImageShortcutAction\(event\)/)
})
