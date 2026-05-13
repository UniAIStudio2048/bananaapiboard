import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readComponent(relativePath) {
  return readFileSync(join(__dirname, relativePath), 'utf8')
}

function cssBlock(source, selector) {
  const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('image node model dropdown icons match video vendor group icon size', () => {
  const imageNode = readComponent('ImageNode.vue')
  const videoNode = readComponent('VideoNode.vue')
  const videoVendorLogo = cssBlock(videoNode, '.vendor-logo')
  const videoVendorLogoImg = cssBlock(videoNode, '.vendor-logo-img')
  const videoVendorLogoText = cssBlock(videoNode, '.vendor-logo-text')

  assert.match(videoVendorLogo, /width:\s*34px;/)
  assert.match(videoVendorLogo, /height:\s*34px;/)
  assert.match(videoVendorLogo, /border-radius:\s*10px;/)
  assert.match(videoVendorLogoImg, /width:\s*100%;/)
  assert.match(videoVendorLogoImg, /height:\s*100%;/)
  assert.match(videoVendorLogoText, /font-size:\s*14px;/)

  assert.doesNotMatch(imageNode, /<span class="model-icon">🍌<\/span>/)

  const itemIcon = cssBlock(imageNode, '.model-item-icon')
  const imageIcon = cssBlock(imageNode, '.model-icon-image')

  assert.match(itemIcon, /width:\s*34px;/)
  assert.match(itemIcon, /height:\s*34px;/)
  assert.match(itemIcon, /border-radius:\s*10px;/)
  assert.match(imageIcon, /width:\s*100%;/)
  assert.match(imageIcon, /height:\s*100%;/)
})

test('image node trigger icon matches video node compact trigger style', () => {
  // 触发按钮内的模型图标应与 VideoNode 底部参数行的紧凑风格保持一致
  // 不再使用 34px 大方块（与下拉项尺寸混淆），改为紧凑的 18px 内联图标
  const imageNode = readComponent('ImageNode.vue')
  const selectedIcon = cssBlock(imageNode, '.model-icon')

  assert.match(selectedIcon, /width:\s*18px;/)
  assert.match(selectedIcon, /height:\s*18px;/)
  assert.doesNotMatch(selectedIcon, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\)/)
})

test('image node model selector delegates configured icon expressions to ModelIcon', () => {
  const imageNode = readComponent('ImageNode.vue')

  assert.match(imageNode, /import ModelIcon from '..\/..\/common\/ModelIcon\.vue'/)
  assert.match(imageNode, /<ModelIcon\s+:icon="selectedModelIcon"\s+:label="selectedModelLabel"\s+class="model-icon"/)
  assert.match(imageNode, /<ModelIcon\s+:icon="m\.icon"\s+:label="m\.label"\s+class="model-item-icon"/)
  assert.doesNotMatch(imageNode, /v-if="isModelIconImage\(selectedModelIcon\)"/)
  assert.doesNotMatch(imageNode, /v-if="isModelIconImage\(m\.icon\)"/)
  assert.doesNotMatch(imageNode, /\{\{\s*formatModelTextIcon\(selectedModelIcon\)\s*\}\}/)
  assert.doesNotMatch(imageNode, /\{\{\s*formatModelTextIcon\(m\.icon\)\s*\}\}/)
  assert.doesNotMatch(imageNode, /\{\{\s*selectedModelIcon\s*\}\}/)
  assert.doesNotMatch(imageNode, /\{\{\s*m\.icon\s*\}\}/)
})

test('image node model description is rendered beside icon under model name', () => {
  const imageNode = readComponent('ImageNode.vue')

  const itemMainStart = imageNode.indexOf('<div class="model-item-main">')
  const itemMainEnd = imageNode.indexOf('</div>\n                </div>', itemMainStart)
  assert.ok(itemMainStart >= 0, 'Expected model item main markup')
  assert.ok(itemMainEnd > itemMainStart, 'Expected model item main closing markup')
  const itemMainMarkup = imageNode.slice(itemMainStart, itemMainEnd)

  assert.match(itemMainMarkup, /<ModelIcon\s+:icon="m\.icon"\s+:label="m\.label"\s+class="model-item-icon"\s+\/>[\s\S]*<div class="model-item-content">/)
  assert.match(itemMainMarkup, /<div class="model-item-content">[\s\S]*<div class="model-item-header">[\s\S]*<span class="model-item-label">/)
  assert.match(itemMainMarkup, /<div class="model-item-content">[\s\S]*<div v-if="m\.description" class="model-item-desc">/)

  const contentBlock = cssBlock(imageNode, '.model-item-content')
  const descBlock = cssBlock(imageNode, '.model-item-desc')

  assert.match(contentBlock, /display:\s*flex;/)
  assert.match(contentBlock, /flex-direction:\s*column;/)
  assert.doesNotMatch(descBlock, /padding-left:/)
  assert.doesNotMatch(descBlock, /margin-top:\s*4px;/)
})
