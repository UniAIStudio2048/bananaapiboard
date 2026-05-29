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
assert.match(source, /@change="settleFilterPreview"/, 'Color mixer sliders should keep mouse-up work on the fast preview path')
assert.match(source, /requestAnimationFrame\(runScheduledFilterPreview\)/, 'Color mixer preview should coalesce drag updates into animation frames')
assert.match(source, /cancelAnimationFrame\(scheduledFilterPreviewFrame/, 'Color mixer preview should cancel queued frame work when committing or leaving')
assert.match(source, /filterPreviewMinIntervalMs/, 'Color mixer should throttle fast previews below the browser frame rate when needed')
assert.match(source, /drawFastFilterPreview/, 'Color mixer should use a reduced-size preview path while dragging')
assert.match(source, /getFilterPreviewSize/, 'Color mixer should cap preview pixel work to the displayed image size')
assert.match(source, /filterPreviewCanvasRef/, 'Color mixer should render fast previews on a separate low-resolution canvas layer')
assert.match(source, /isShowingFilterPreview/, 'Color mixer should toggle the preview layer without repainting the full-resolution canvas')
assert.match(source, /hasPendingFilterCommit/, 'Color mixer should track pending full-resolution commits separately from fast previews')
assert.match(source, /commitPendingFilters/, 'Color mixer should defer full-resolution filter commits until they are needed')
assert.match(source, /getActiveMixerChannels/, 'Color mixer pixel loop should skip color channels with no active adjustment')
assert.match(source, /nudgeMixerControl/, 'Color mixer should support precise stepper adjustments')
assert.match(source, /type="number"/, 'Color mixer should support direct numeric entry for precise adjustments')
assert.match(source, /调色混色器/, 'Filter tool should be presented as the color mixer')
assert.doesNotMatch(source, /<span class="tool-label">滤镜<\/span>/, 'Toolbar should no longer label the tool as filter')
assert.doesNotMatch(source, /hue-rotate\(/, 'Color mixer should not rely on one global CSS hue rotation')

console.log('NativeImageEditor color mixer source tests passed')
