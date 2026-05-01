import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasThumbnail.js'), 'utf8')

assert.match(
  source,
  /const MIN_CANVAS_PREVIEW_WIDTH = 384/,
  'Canvas thumbnails should start at a small enough tier for large boards'
)

assert.match(
  source,
  /const PREVIEW_WIDTHS = \[384, 768, 1024\]/,
  'Canvas thumbnails should avoid 2K/3K preview tiers in the board'
)

assert.match(
  source,
  /preferLowQuality = false/,
  'Canvas thumbnail selection should support a low-quality moving mode'
)

assert.match(
  source,
  /if \(preferLowQuality\) return getCanvasThumbnailUrl\(url, MIN_CANVAS_PREVIEW_WIDTH\)/,
  'Moving mode should force the smallest thumbnail tier'
)

console.log('Canvas thumbnail performance tests passed')
