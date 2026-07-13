import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AssetCard.vue'), 'utf8')

assert.doesNotMatch(
  source,
  /<video\b/,
  'AssetCard should not mount video elements during grid render'
)

assert.doesNotMatch(
  source,
  /preload="metadata"/,
  'AssetCard should not trigger video metadata requests during grid render'
)

assert.match(
  source,
  /video-placeholder/,
  'Video cards without poster thumbnails should render a lightweight placeholder'
)

console.log('AssetCard media performance tests passed')
