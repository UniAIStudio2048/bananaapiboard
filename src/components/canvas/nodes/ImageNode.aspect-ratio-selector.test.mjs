import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')

test('image aspect ratio selector matches the video custom dropdown with icon previews', () => {
  const ratioStart = source.indexOf('<div v-if="availableImageAspectRatios.length > 0"')
  const ratioEnd = source.indexOf('<!-- 预设选择器', ratioStart)
  assert.ok(ratioStart >= 0, 'image aspect ratio selector should exist')
  assert.ok(ratioEnd > ratioStart, 'image aspect ratio selector section should be complete')

  const ratioSection = source.slice(ratioStart, ratioEnd)
  assert.match(ratioSection, /class="video-mode-trigger ratio-mode-trigger"/)
  assert.match(ratioSection, /class="video-mode-dropdown-panel ratio-dropdown-panel"/)
  assert.match(ratioSection, /v-for="ratio in availableImageAspectRatios"/)
  assert.match(ratioSection, /getAspectRatioIconClass\(selectedAspectRatio\)/)
  assert.match(ratioSection, /getAspectRatioIconClass\(ratio\.value\)/)
  assert.doesNotMatch(ratioSection, /<select/)
})

test('image aspect ratio dropdown supports video-style previews and viewport-aware placement', () => {
  assert.match(source, /function toggleAspectRatioDropdown\(event\)/)
  assert.match(source, /aspectRatioDropdownDirection\.value = 'up'/)
  assert.match(source, /function getAspectRatioIconClass\(value\)[\s\S]*width < height \? 'ratio-icon-portrait' : 'ratio-icon-landscape'/)
  assert.match(source, /\.ratio-dropdown-panel\s*\{[\s\S]*max-height:[\s\S]*overflow-y: auto/)

  for (const iconClass of [
    'ratio-icon-landscape',
    'ratio-icon-portrait',
    'ratio-icon-square',
    'ratio-icon-3-4',
    'ratio-icon-4-3'
  ]) {
    assert.match(source, new RegExp(`\\.${iconClass}::before`))
  }
})
