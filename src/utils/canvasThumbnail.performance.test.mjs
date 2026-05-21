import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasThumbnail.js'), 'utf8')
const lodSource = readFileSync(join(__dirname, 'lodSelector.js'), 'utf8')

// LOD 档位策略迁移至 lodSelector.js（纯函数，可独立单元测试）
assert.match(
  lodSource,
  /export const MIN_CANVAS_PREVIEW_WIDTH = 384/,
  'Canvas thumbnails should start at 384 tier for large boards (lots of nodes scenario)'
)

assert.match(
  lodSource,
  /export const PREVIEW_WIDTHS = Object\.freeze\(\[384, 768, 1280, 1920\]\)/,
  'LOD tiers must cover from very small (384) up to near-screen-size (1920) for clarity'
)

assert.match(
  lodSource,
  /export const ORIGINAL_THRESHOLD = 1920/,
  'Display width >= 1920 must fall back to the original image for sharpness when zoomed in'
)

assert.match(
  lodSource,
  /preferLowQuality = false/,
  'LOD selector should support a low-quality moving mode for pan/zoom'
)

assert.match(
  lodSource,
  /if \(preferLowQuality\) return MIN_CANVAS_PREVIEW_WIDTH/,
  'Moving mode should force the smallest thumbnail tier'
)

assert.match(
  lodSource,
  /if \(displayWidth >= ORIGINAL_THRESHOLD\) return 0/,
  'When node is close to screen size, return 0 to signal original-image usage'
)

// canvasThumbnail.js 仍然要从 lodSelector 导入并使用
assert.match(
  source,
  /from '\.\/lodSelector\.js'/,
  'canvasThumbnail.js should consume the pure LOD selector'
)

assert.match(
  source,
  /selectLodWidth\(opts\)/,
  'getHighQualityCanvasPreviewUrl should delegate tier selection to selectLodWidth'
)

console.log('Canvas thumbnail performance tests passed')
