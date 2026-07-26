import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('video mode selector is placed between model and aspect ratio controls', () => {
  const configRowStart = source.indexOf('<div class="config-row">')
  const configRowEnd = source.indexOf('<div class="config-right">', configRowStart)
  assert.ok(configRowStart >= 0, 'video config row should exist')
  assert.ok(configRowEnd > configRowStart, 'video config left controls should exist')

  const configLeft = source.slice(configRowStart, configRowEnd)
  const modelIndex = configLeft.indexOf('class="model-selector-custom"')
  const modeIndex = configLeft.indexOf('class="video-mode-selector"')
  const ratioIndex = configLeft.indexOf('class="ratio-selector"')

  assert.ok(modelIndex >= 0, 'model selector should remain visible')
  assert.ok(modeIndex > modelIndex, 'mode selector should follow model selector')
  assert.ok(ratioIndex > modeIndex, 'mode selector should precede aspect ratio selector')
  assert.match(configLeft, /class="video-mode-trigger"/)
  assert.match(configLeft, /class="video-mode-dropdown-panel"/)
  assert.match(configLeft, /v-for="option in activeVideoModeSelector\.options"/)
  assert.doesNotMatch(configLeft, /class="video-mode-select"/)
  assert.match(configLeft, /getVideoModeIconClass\(activeVideoModeSelector\.value\)/)
  assert.match(configLeft, /getVideoModeIconClass\(option\.value\)/)
})

test('video mode selector reuses existing mode state and available option lists', () => {
  assert.match(source, /const activeVideoModeSelector = computed\(\(\) => \{[\s\S]*?selectedSeedance2Mode[\s\S]*?seedance2Modes[\s\S]*?\}\)/)
  assert.match(source, /activeVideoModeSelector[\s\S]*?selectedWanMode\.value[\s\S]*?wanModes/)
  assert.match(source, /activeVideoModeSelector[\s\S]*?selectedKlingV3OmniMode\.value[\s\S]*?klingV3OmniModes/)
  assert.match(source, /function setActiveVideoMode\(value\)\s*\{[\s\S]*?selectedSeedance2Mode\.value\s*=\s*value[\s\S]*?\}/)
  assert.match(source, /function setActiveVideoMode\(value\)\s*\{[\s\S]*?selectedWanMode\.value\s*=\s*value[\s\S]*?\}/)
  assert.match(source, /function setActiveVideoMode\(value\)\s*\{[\s\S]*?selectedKlingV3OmniMode\.value\s*=\s*value[\s\S]*?\}/)
  assert.match(source, /@click="setActiveVideoMode\(option\.value\); videoModeDropdownOpen = null"/)
  assert.match(source, /const activeVideoSubmodeSelector = computed\(\(\) => \{[\s\S]*?selectedWanAnimateMode\.value[\s\S]*?wanAnimateModeOptions[\s\S]*?\}\)/)
  assert.match(source, /@click="setActiveVideoSubmode\(option\.value\); videoModeDropdownOpen = null"/)
  assert.doesNotMatch(source, /v-for="opt in seedance2Modes"[\s\S]*class="sd2-mode-btn"/)
  assert.doesNotMatch(source, /v-for="opt in wanAnimateModeOptions"[\s\S]*class="sd2-mode-btn"/)
})

test('aspect ratio selector uses the same custom dropdown style', () => {
  const ratioStart = source.indexOf('<div v-if="availableAspectRatios.length > 0" class="ratio-selector"')
  const ratioEnd = source.indexOf('<!-- 时长切换', ratioStart)
  assert.ok(ratioStart >= 0, 'aspect ratio selector should exist')
  assert.ok(ratioEnd > ratioStart, 'aspect ratio selector section should be complete')

  const ratioSection = source.slice(ratioStart, ratioEnd)
  assert.match(ratioSection, /class="video-mode-trigger ratio-mode-trigger"/)
  assert.match(ratioSection, /videoModeDropdownOpen === 'ratio'/)
  assert.match(ratioSection, /v-for="ratio in availableAspectRatios"/)
  assert.match(ratioSection, /selectedAspectRatio = ratio\.value/)
  assert.doesNotMatch(ratioSection, /<select/)
  assert.match(ratioSection, /getAspectRatioIconClass\(selectedAspectRatio\)/)
})

test('video aspect ratios follow model configuration and include square and portrait variants', () => {
  assert.match(source, /const availableAspectRatios = computed\(\(\) => \{[\s\S]*currentModelConfig\.value\?\.aspectRatios[\s\S]*if \(configuredValues\.length === 0\) return \[\]/)
  for (const ratio of ['1:1', '3:4', '4:3']) {
    assert.match(source, new RegExp(`value: '${ratio}'`))
  }
  assert.match(source, /v-if="availableAspectRatios\.length > 0" class="ratio-selector"/)
  assert.match(source, /v-for="ratio in availableAspectRatios"/)
  assert.match(source, /ratio-icon-square/)
  assert.match(source, /ratio-icon-3-4/)
  assert.match(source, /ratio-icon-4-3/)
})

test('video duration and ratio selections can both be empty', () => {
  assert.match(source, /if \(options\.length === 0\) \{[\s\S]*selectedAspectRatio\.value = ''/)
  assert.match(source, /if \(options\.length === 0\) \{[\s\S]*selectedDuration\.value = ''/)
  assert.match(source, /if \(selectedAspectRatio\.value\) \{\s*formData\.append\('aspect_ratio'/)
  assert.match(source, /&& selectedDuration\.value\) \{\s*formData\.append\('duration'/)
})

test('video preview uses the selected ratio instead of treating every non-portrait ratio as 16:9', () => {
  assert.match(source, /const parsed = parseAspectRatioValue\(ratio\)[\s\S]*aspectRatio: `\$\{parsed\.width\} \/ \$\{parsed\.height\}`/)
})
