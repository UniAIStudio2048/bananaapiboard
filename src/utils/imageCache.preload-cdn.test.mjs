import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'imageCache.js'), 'utf8')

assert.match(
  source,
  /function shouldPreloadImageUrl\(url\)[\s\S]*filescos\.nananobanana\.cn[\s\S]*return false/,
  'ImageCache preload should skip COS CDN URLs because cross-origin fetch can fail while direct img rendering still works'
)

assert.match(
  source,
  /if \(!shouldPreloadImageUrl\(url\)\) return/,
  'preloadImages should not call loadImageWithCache for non-cacheable CDN URLs'
)

console.log('ImageCache CDN preload tests passed')
