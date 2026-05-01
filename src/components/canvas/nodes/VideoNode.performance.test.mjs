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
  /const shouldFallbackToReadonlyVideoFrame = computed\(/,
  'VideoNode should allow readonly community previews to fall back to the video first frame when no poster exists'
)

assert.match(
  source,
  /const videoPosterFailed = ref\(false\)/,
  'VideoNode should track failed poster image loads'
)

assert.match(
  source,
  /function handleVideoPosterError\(\)/,
  'VideoNode should switch away from broken poster images'
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
  /<img[\s\S]*v-else-if="videoPosterUrl && !videoPosterFailed"[\s\S]*@error="handleVideoPosterError"/,
  'VideoNode should render a lightweight poster image and handle load failures'
)

console.log('VideoNode performance tests passed')
