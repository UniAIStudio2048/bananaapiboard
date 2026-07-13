import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasDirectoryPanel.vue'), 'utf8')

assert.doesNotMatch(
  source,
  /<video\b/,
  'CanvasDirectoryPanel should not mount videos in directory rows'
)

assert.doesNotMatch(
  source,
  /preload="metadata"/,
  'CanvasDirectoryPanel rows should not trigger video metadata requests'
)

assert.match(
  source,
  /getRowIcon\(row\.type\)/,
  'CanvasDirectoryPanel should fall back to type icons for non-image rows'
)

console.log('CanvasDirectoryPanel performance tests passed')
