import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'ImageNode.vue'), 'utf8')

test('image node uses the video-style parameter dropdown while keeping generation count in the original footer position', () => {
  assert.match(source, /import VideoParametersDropdown from '\.\.\/VideoParametersDropdown\.vue'/)
  assert.match(source, /<VideoParametersDropdown[\s\S]*?:quality-options="imageParameterQualityOptions"/)
  assert.match(source, /:resolution-options="showResolutionOption \? imageSizes : \[\]"/)

  const configRight = source.slice(source.indexOf('<div class="config-right">'), source.indexOf('</div>', source.indexOf('<div class="config-right">')))
  assert.match(configRight, /class="count-display clickable"/)
  assert.match(source, /const countOptions = \[1, 2, 4\]/)
  assert.match(source, /async function toggleCount\(\)/)
})

test('image node only exposes configured aspect ratios and enabled 1K–4K pricing tiers', () => {
  assert.match(source, /if \(!Array\.isArray\(currentModel\?\.aspectRatios\)\) return aspectRatios/)
  assert.match(source, /if \(currentModel\.aspectRatios\.length === 0\) return \[\]/)
  assert.match(source, /\['1K', '2K', '3K', '4K'\]/)
  assert.match(source, /getAvailableImageResolutionOptions\(currentModel\)/)
  assert.match(source, /getImageResolutionCost\(currentModel, imageSize\.value\)/)
})

test('image quality controls are shown only for models with declared quality support', () => {
  assert.match(source, /const configured = currentModel\?\.qualityOptions \|\| currentModel\?\.qualities/)
  assert.match(source, /if \(currentModel\?\.defaultQuality\) return pixmaxQualityOptions/)
  assert.match(source, /return \[\]/)
  assert.match(source, /baseParams\.quality = selectedQuality\.value/)
})
