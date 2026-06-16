import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../../../../', import.meta.url).pathname

function source(path) {
  return readFileSync(join(root, path), 'utf8')
}

const nodeFiles = [
  'src/components/canvas/nodes/ImageNode.vue',
  'src/components/canvas/nodes/VideoNode.vue',
  'src/components/canvas/nodes/TextNode.vue',
  'src/components/canvas/nodes/AudioNode.vue'
]

for (const file of nodeFiles) {
  const code = source(file)

  assert.match(
    code,
    /class="model-dropdown(?:-list)?[^"]*"/,
    `${file} should keep a custom model dropdown container`
  )
  assert.match(
    code,
    /model-item-main/,
    `${file} should render model dropdown rows with the shared model item layout`
  )
  assert.match(
    code,
    /model-item-icon/,
    `${file} should render a left model icon block`
  )
  assert.match(
    code,
    /model-item-content/,
    `${file} should render model name and description in a content column`
  )
  assert.match(
    code,
    /model-item-meta/,
    `${file} should render points or status metadata in a right aligned column`
  )
}

const combined = nodeFiles.map(source).join('\n')

assert.match(
  combined,
  /\.model-dropdown(?:-list)?[\s\S]*?backdrop-filter:\s*blur\(/,
  'model dropdowns should use a glass blur panel'
)
assert.match(
  combined,
  /\.model-dropdown-item[\s\S]*?border-radius:\s*(?:12|14|16)px/,
  'model dropdown rows should use modern rounded card styling'
)
assert.match(
  combined,
  /\.model-item-icon[\s\S]*?width:\s*(?:34|36|40|42|44)px[\s\S]*?height:\s*(?:34|36|40|42|44)px/,
  'model icon blocks should be large square badges like the reference'
)

const textNode = source('src/components/canvas/nodes/TextNode.vue')
const bottomPanel = source('src/components/canvas/CanvasBottomPanel.vue')

for (const [label, code] of [
  ['TextNode', textNode],
  ['CanvasBottomPanel', bottomPanel]
]) {
  const capabilityConfig = code.match(/const llmCapabilityOptions = \[[\s\S]*?\]\n\nfunction getEnabledLlmCapabilities/)?.[0] || ''
  const capabilityMarkup = code.match(/<div v-if=".*?getEnabledLlmCapabilities\(model\)\.length" class="model-capability-row"[\s\S]*?<\/div>/)?.[0] || ''
  assert.match(
    code,
    /getEnabledLlmCapabilities/,
    `${label} should compute enabled LLM capability icons`
  )
  assert.match(
    code,
    /model-capability-row/,
    `${label} should render a compact capability icon row`
  )
  assert.match(
    code,
    /model-capability-icon/,
    `${label} should style individual capability icons`
  )
  assert.doesNotMatch(capabilityConfig + capabilityMarkup, /🖼️|📺|🎵/, `${label} should avoid colorful emoji capability icons`)
  assert.match(code, /model-capability-glyph--image/, `${label} should render a monochrome image glyph`)
  assert.match(code, /model-capability-glyph--video/, `${label} should render a monochrome TV glyph`)
  assert.match(code, /model-capability-glyph--audio/, `${label} should render a monochrome music glyph`)
  assert.match(code, /stroke="currentColor"/, `${label} capability icons should inherit theme color`)
}
