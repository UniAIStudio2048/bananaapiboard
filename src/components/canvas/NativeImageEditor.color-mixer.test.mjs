import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'NativeImageEditor.vue'), 'utf8')

assert.match(source, /color-mixer-panel/, 'NativeImageEditor should render a right-side color mixer panel')
assert.match(source, /const mixerColorChannels = \[/, 'Color mixer should define fixed target color channels')
assert.match(source, /mixer-tabs/, 'NativeImageEditor should group mixer controls by tabs')
assert.match(source, /色相/, 'Color mixer should expose hue controls')
assert.match(source, /饱和度/, 'Color mixer should expose saturation controls')
assert.match(source, /明亮度/, 'Color mixer should expose lightness controls')
for (const colorName of ['红色', '橙色', '黄色', '绿色', '浅绿色', '蓝色', '紫色', '洋红']) {
  assert.match(source, new RegExp(`label: '${colorName}'`), `Color mixer should expose ${colorName} channel`)
}
assert.match(source, /hslMixer/, 'NativeImageEditor should store per-color HSL mixer values')
assert.match(source, /applyColorMixerToCanvas/, 'Color mixer should apply per-color HSL edits to canvas pixels')
assert.match(source, /rgbToHsl/, 'Color mixer should convert pixels from RGB to HSL')
assert.match(source, /hslToRgb/, 'Color mixer should convert adjusted HSL pixels back to RGB')
assert.match(source, /getChannelWeight/, 'Color mixer should softly target nearby hue ranges')
assert.match(source, /hslMixer\[channel\.id\]\[activeMixerTab\]/, 'Fixed color rows should bind to the active HSL parameter')
assert.match(source, /@input="previewFilters"/, 'Color mixer sliders should preview changes while dragging')
assert.match(source, /@change="commitFilters"/, 'Color mixer sliders should commit changes to edit history')
assert.match(source, /调色混色器/, 'Filter tool should be presented as the color mixer')
assert.doesNotMatch(source, /<span class="tool-label">滤镜<\/span>/, 'Toolbar should no longer label the tool as filter')
assert.doesNotMatch(source, /hue-rotate\(/, 'Color mixer should not rely on one global CSS hue rotation')

console.log('NativeImageEditor color mixer source tests passed')
