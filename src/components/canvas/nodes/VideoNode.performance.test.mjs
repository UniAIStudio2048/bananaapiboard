import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

assert.match(
  source,
  /const shouldMountVideoElement = computed\(/,
  'VideoNode should gate heavy video element mounting behind a computed state'
)

assert.match(
  source,
  /props\.data\.cover_url/,
  'VideoNode poster selection should include top-level community workflow cover_url'
)

assert.match(
  source,
  /props\.data\.thumbnail_url/,
  'VideoNode poster selection should include top-level community workflow thumbnail_url'
)

assert.match(
  source,
  /props\.data\.output\?\.thumbnail\s*\|\|\s*props\.data\.output\?\.thumbnail_url/,
  'VideoNode poster selection should use the thumbnail returned with a completed canvas video task'
)

assert.match(
  source,
  /const shouldFallbackToVideoFrame = computed\(/,
  'VideoNode should allow video previews to fall back to the video first frame when no poster exists'
)

assert.match(source, /requestCanvasVideoPoster\(/, 'VideoNode should request a server cover for videos without a usable poster')
assert.match(source, /const output = \{ \.\.\.props\.data\.output, cover_url: thumbnailUrl, thumbnailUrl \}[\s\S]*canvasStore\.updateNodeData\(props\.id, \{ output \}\)/, 'VideoNode should save a recovered cover ahead of a broken old cover')
assert.match(source, /shouldFallbackToVideoFrame[\s\S]*serverPosterFailed\.value/, 'VideoNode should wait for the cover request before mounting bulk video fallbacks')
assert.match(source, /class="video-poster-output"[\s\S]*loading="eager"/, 'visible video node posters should load immediately at low canvas zoom')

assert.match(
  source,
  /const videoPosterFailed = ref\(false\)/,
  'VideoNode should track failed poster image loads'
)

assert.match(
  source,
  /function handleVideoPosterError\(event\)/,
  'VideoNode should switch away from broken poster images and accept event for original-URL fallback'
)

assert.match(
  source,
  /img\.dataset\.fallbackTried/,
  'VideoNode poster error handler should attempt original-URL fallback before declaring failure'
)

assert.match(
  source,
  /@mouseenter="activateVideoPreview"/,
  'VideoNode should mount video only after user intent such as hover'
)

assert.match(
  source,
  /:preload="videoPreloadMode"/,
  'VideoNode should choose preload mode based on whether it is using poster or readonly first-frame fallback'
)

assert.match(
  source,
  /v-if="shouldMountVideoElement && isNodeVisible"/,
  'VideoNode should destroy video elements when hidden or inactive'
)

assert.match(
  source,
  /<img[\s\S]*v-if="videoPosterUrl && !videoPosterFailed"[\s\S]*@error="handleVideoPosterError"/,
  'VideoNode should render a lightweight poster image and handle load failures'
)

console.log('VideoNode performance tests passed')
