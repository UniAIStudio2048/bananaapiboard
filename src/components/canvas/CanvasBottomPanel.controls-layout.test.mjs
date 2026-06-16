import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBottomPanel.vue'), 'utf8')

function cssBlock(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('canvas bottom panel keeps model parameters on one row with long model names', () => {
  const controls = cssBlock('.canvas-bottom-controls')
  const left = cssBlock('.canvas-controls-left')
  const right = cssBlock('.canvas-controls-right')
  const selector = cssBlock('.model-selector')
  const modelName = cssBlock('.model-name')
  const sizeSelector = cssBlock('.size-selector')

  assert.match(controls, /flex-wrap:\s*nowrap;/)
  assert.match(controls, /overflow:\s*hidden;/)
  assert.match(left, /min-width:\s*0;/)
  assert.match(left, /flex:\s*1\s+1\s+auto;/)
  assert.match(right, /flex-shrink:\s*0;/)
  assert.match(right, /margin-left:\s*auto;/)
  assert.match(selector, /min-width:\s*0;/)
  assert.match(selector, /flex:\s*0\s+1\s+\d+px;/)
  assert.match(modelName, /white-space:\s*nowrap;/)
  assert.match(modelName, /overflow:\s*hidden;/)
  assert.match(modelName, /text-overflow:\s*ellipsis;/)
  assert.match(sizeSelector, /flex-shrink:\s*0;/)
})

test('image size selector stays with the left-side model parameters', () => {
  assert.match(
    source,
    /<div class="canvas-controls-left">[\s\S]*<div class="model-selector"[\s\S]*<div v-if="isImageGenerateNode && availableImageSizes\.length > 0" class="size-selector">[\s\S]*<\/div>\s*<\/div>\s*<div class="canvas-controls-right">/
  )
})
