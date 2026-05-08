import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const nodeDir = __dirname
const storeSource = readFileSync(join(nodeDir, '../../../stores/canvas/modelStatsStore.js'), 'utf8')
const imageSource = readFileSync(join(nodeDir, 'ImageNode.vue'), 'utf8')
const videoSource = readFileSync(join(nodeDir, 'VideoNode.vue'), 'utf8')
const audioSource = readFileSync(join(nodeDir, 'AudioNode.vue'), 'utf8')

test('model stats store exposes average duration for image video and audio models', () => {
  assert.match(storeSource, /audioStats = ref\(\{\}\)/, 'store should track audio stats')
  assert.match(storeSource, /getImageModelAvgDurationSeconds/, 'image duration accessor is required')
  assert.match(storeSource, /getVideoModelAvgDurationSeconds/, 'video duration accessor is required')
  assert.match(storeSource, /getAudioModelAvgDurationSeconds/, 'audio duration accessor is required')
})

test('image and video dropdowns render average duration below success rate', () => {
  assert.match(imageSource, /model-duration-text/, 'image model dropdown should render duration text')
  assert.match(imageSource, /formatModelAvgDuration\(m\.value\)/, 'image duration should be formatted per model')
  assert.match(videoSource, /model-duration-text/, 'video model dropdown should render duration text')
  assert.match(videoSource, /formatModelAvgDuration\(m\.value\)/, 'video duration should be formatted per model')
})

test('audio dropdown uses shared model stats and renders average duration', () => {
  assert.match(audioSource, /useModelStatsStore/, 'audio node should use shared stats store')
  assert.match(audioSource, /formatModelAvgDuration\(m\.value\)/, 'audio duration should be formatted per model')
  assert.match(audioSource, /model-duration-text/, 'audio model dropdown should render duration text')
})

test('image model dropdown keeps model names on one line with adaptive content width', () => {
  assert.match(
    imageSource,
    /\.model-dropdown-list\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?max-width:\s*min\(/,
    'image model dropdown should adapt to option content while staying viewport bounded'
  )
  assert.match(
    imageSource,
    /\.model-item-main\s*\{[\s\S]*?white-space:\s*nowrap;/,
    'image model option main row should not wrap'
  )
  assert.match(
    imageSource,
    /\.model-item-label\s*\{[\s\S]*?white-space:\s*nowrap;/,
    'image model label should stay on one line'
  )
  assert.match(
    imageSource,
    /\.model-item-desc\s*\{[\s\S]*?display:\s*block;/,
    'image model description should render as a separate second row'
  )
})
