import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('AudioNode speed editor is layered above the audio configuration panel', () => {
  const speedEditorCss = source.match(/\.speed-editor \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(speedEditorCss, /z-index:\s*1100;/)
})

test('AudioNode speed editor keeps its controls out of the canvas drag gesture', () => {
  assert.match(source, /class="speed-editor nodrag" @mousedown\.stop @pointerdown\.stop/)
  assert.match(source, /v-show="showConfigPanel && !showSpeedEditor"/)
})

test('AudioNode applies playback speed while editing instead of waiting for submit', () => {
  assert.match(source, /function handlePlaybackRateInput\(event\)/)
  assert.match(source, /@input="handlePlaybackRateInput"/)
  assert.match(source, /function handlePlaybackRateInput\(event\)[\s\S]*?updatePlaybackRate\(event\?\.target\?\.value\)/)
  assert.match(source, /function normalizePlaybackRate\(value, fallback = null\)[\s\S]*?value === '' \|\| value === null \|\| value === undefined/)
  assert.match(source, /function updatePlaybackRate\(value\)[\s\S]*?audioRef\.value\.playbackRate = rate/)
  assert.match(source, /function updatePlaybackRate\(value\)[\s\S]*?canvasStore\.updateNodeData\(props\.id, \{ playbackRate: rate \}\)/)
})

test('AudioNode time display follows the effective playback timeline', () => {
  assert.match(source, /const effectiveCurrentTime = computed\(\(\) => \{[\s\S]*?currentTime\.value \/ rate/)
  assert.match(source, /const effectiveDuration = computed\(\(\) => \{[\s\S]*?duration\.value \/ rate/)
  assert.match(source, /formatTime\(effectiveCurrentTime\)\s*\}\}\s*\/\s*\{\{\s*formatTime\(effectiveDuration\)/)
})
