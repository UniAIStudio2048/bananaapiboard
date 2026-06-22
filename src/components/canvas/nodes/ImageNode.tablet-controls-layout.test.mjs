import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readImageNode() {
  return readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')
}

function cssBlock(source, selector) {
  const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('image node tablet controls keep generate button inside prompt panel', () => {
  const source = readImageNode()

  const configRow = cssBlock(source, '.config-row')
  const configLeft = cssBlock(source, '.config-left')
  const configRight = cssBlock(source, '.config-right')
  const modelName = cssBlock(source, '.model-name')
  const ratioSelector = cssBlock(source, '.ratio-selector')
  const cameraToggleBtn = cssBlock(source, '.camera-toggle-btn')
  const paramChipGroup = cssBlock(source, '.param-chip-group')
  const paramChip = cssBlock(source, '.param-chip')
  const generateBtn = cssBlock(source, '.generate-btn')

  assert.match(configRow, /flex-wrap:\s*nowrap;/)
  assert.match(configRow, /overflow:\s*visible;/)
  assert.match(configLeft, /min-width:\s*0;/)
  assert.match(configLeft, /flex:\s*1\s+1\s+auto;/)
  assert.match(configLeft, /flex-wrap:\s*nowrap;/)
  assert.match(configRight, /max-width:\s*100%;/)
  assert.match(configRight, /margin-left:\s*auto;/)
  assert.match(configRight, /flex-shrink:\s*0;/)
  assert.match(modelName, /overflow:\s*hidden;/)
  assert.match(modelName, /text-overflow:\s*ellipsis;/)
  assert.match(ratioSelector, /flex-shrink:\s*0;/)
  assert.match(cameraToggleBtn, /white-space:\s*nowrap;/)
  assert.match(cameraToggleBtn, /flex-shrink:\s*0;/)
  assert.match(paramChipGroup, /flex-wrap:\s*nowrap;/)
  assert.match(paramChipGroup, /flex-shrink:\s*0;/)
  assert.match(paramChip, /white-space:\s*nowrap;/)
  assert.match(paramChip, /flex-shrink:\s*0;/)
  assert.match(generateBtn, /flex-shrink:\s*0;/)
})
