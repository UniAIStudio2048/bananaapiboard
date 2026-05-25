import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageToolbar.vue'), 'utf8')

assert.match(
  source,
  /async function loadImageForCanvas\(imageUrl\)/,
  'ImageToolbar should use a resilient canvas image loader for crop operations'
)

const genericCropBlock = source.match(/async function handleGenericGridCrop\(cols, rows\) \{([\s\S]*?)\n\}/)?.[1] || ''
assert.match(
  genericCropBlock,
  /const img = await loadImageForCanvas\(imageUrl\.value\)/,
  'grid crop only should load images through the resilient loader'
)
assert.doesNotMatch(
  genericCropBlock,
  /new Image\(\)/,
  'grid crop only should not rely on direct Image loading'
)

const storyboardBlock = source.match(/async function createStoryboardFromCrop\(cols, rows\) \{([\s\S]*?)\n\}/)?.[1] || ''
assert.match(
  storyboardBlock,
  /const img = await loadImageForCanvas\(imageUrl\.value\)/,
  'storyboard crop should load images through the resilient loader'
)
assert.doesNotMatch(
  storyboardBlock,
  /new Image\(\)/,
  'storyboard crop should not rely on direct Image loading'
)
