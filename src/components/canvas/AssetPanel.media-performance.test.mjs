import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AssetPanel.vue'), 'utf8')

const getVideoThumbnailMatch = source.match(/function getVideoThumbnail\(asset\) \{[\s\S]*?\n\}/)
assert.ok(getVideoThumbnailMatch, 'AssetPanel should keep getVideoThumbnail helper')

assert.doesNotMatch(
  getVideoThumbnailMatch[0],
  /extractVideoThumbnail\(asset\)/,
  'AssetPanel should not extract video thumbnails as a side effect of card rendering'
)

assert.doesNotMatch(
  getVideoThumbnailMatch[0],
  /loading_\$\{asset\.id\}/,
  'AssetPanel should not mark render-time thumbnail loading state from getVideoThumbnail'
)

assert.match(
  source,
  /\.filter\(item => item\.type === 'image' && item\.url\)[\s\S]*?\.slice\(0,\s*8\)/,
  'AssetPanel should only preload a small image thumbnail window after fetching assets'
)

console.log('AssetPanel media performance tests passed')
