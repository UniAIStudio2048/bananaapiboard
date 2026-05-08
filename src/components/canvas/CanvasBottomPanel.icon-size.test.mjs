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

test('image model selector icons match video vendor group icon size', () => {
  const bottomPanel = readComponent('CanvasBottomPanel.vue')
  const videoNode = readComponent('nodes/VideoNode.vue')
  const videoVendorLogo = cssBlock(videoNode, '.vendor-logo')
  const videoVendorLogoImg = cssBlock(videoNode, '.vendor-logo-img')
  const videoVendorLogoText = cssBlock(videoNode, '.vendor-logo-text')

  assert.match(videoVendorLogo, /width:\s*34px;/)
  assert.match(videoVendorLogo, /height:\s*34px;/)
  assert.match(videoVendorLogo, /border-radius:\s*10px;/)
  assert.match(videoVendorLogoImg, /width:\s*100%;/)
  assert.match(videoVendorLogoImg, /height:\s*100%;/)
  assert.match(videoVendorLogoText, /font-size:\s*14px;/)

  const selectedIcon = cssBlock(bottomPanel, '.model-icon')
  const optionIcon = cssBlock(bottomPanel, '.model-option-icon')
  const imageIcon = cssBlock(bottomPanel, '.model-icon-image')
  const textIcon = cssBlock(bottomPanel, '.model-icon-text')

  assert.match(selectedIcon, /width:\s*34px;/)
  assert.match(selectedIcon, /height:\s*34px;/)
  assert.match(selectedIcon, /border-radius:\s*10px;/)
  assert.match(optionIcon, /width:\s*34px;/)
  assert.match(optionIcon, /height:\s*34px;/)
  assert.match(optionIcon, /border-radius:\s*10px;/)
  assert.match(imageIcon, /width:\s*100%;/)
  assert.match(imageIcon, /height:\s*100%;/)
  assert.match(textIcon, /font-size:\s*14px;/)
})

test('shared model icon component owns child image and text sizing styles', () => {
  const modelIcon = readComponent('../common/ModelIcon.vue')

  assert.match(modelIcon, /<style\s+scoped>/)

  const rootIcon = cssBlock(modelIcon, '.model-icon-root')
  const imageIcon = cssBlock(modelIcon, '.model-icon-image')
  const squareImageIcon = cssBlock(modelIcon, '.model-icon-image-square')
  const textIcon = cssBlock(modelIcon, '.model-icon-text')

  assert.match(rootIcon, /width:\s*100%;/)
  assert.match(rootIcon, /height:\s*100%;/)
  assert.match(rootIcon, /display:\s*flex;/)
  assert.match(rootIcon, /align-items:\s*center;/)
  assert.match(rootIcon, /justify-content:\s*center;/)
  assert.match(imageIcon, /width:\s*100%;/)
  assert.match(imageIcon, /height:\s*100%;/)
  assert.match(imageIcon, /object-fit:\s*cover;/)
  assert.match(imageIcon, /display:\s*block;/)
  assert.match(imageIcon, /border-radius:\s*50%;/)
  assert.match(squareImageIcon, /border-radius:\s*inherit;/)
  assert.match(textIcon, /display:\s*flex;/)
  assert.match(textIcon, /align-items:\s*center;/)
  assert.match(textIcon, /justify-content:\s*center;/)
  assert.match(textIcon, /font-size:\s*inherit;/)
})
