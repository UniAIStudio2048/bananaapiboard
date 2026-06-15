import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'useImageHoverPreview.js'), 'utf8')

test('video hover preview retries playback when hovering the same video URL again', () => {
  assert.match(
    source,
    /function\s+playVideoPreview\(\)\s*\{[\s\S]*?videoEl\.play\(\)\.catch\(\(\)\s*=>\s*\{\}\)/,
    'video preview playback should be centralized so it can be retried'
  )
  assert.match(
    source,
    /else\s+if\s*\(\s*type\s*===\s*['"]video['"]\s*\)\s*\{[\s\S]*?playVideoPreview\(\)/,
    'doShow should resume playback even when the preview URL did not change'
  )
})
