import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('audio model selector uses a single grouped dropdown', () => {
  assert.match(source, /const currentAudioGroupModels = computed/)
  assert.match(source, /class="model-dropdown-list"[\s\S]*class="audio-group-column"[\s\S]*class="audio-model-column"/)
  assert.doesNotMatch(source, /class="type-selector"/)
  assert.doesNotMatch(source, /class="audio-group-selector"/)
})

test('audio prompt area includes a reference audio add entry', () => {
  assert.match(source, /class="audio-reference-section"/)
  assert.match(source, />参考音频</)
  assert.match(source, /class="audio-reference-add[^\"]*"[\s\S]*handleAddLeftClick/)
})

test('audio prompt panel matches the video node compact dimensions and point display', () => {
  assert.match(source, /width:\s*min\(max\(100%, 780px\), 90vw\);/)
  assert.match(source, /\.prompt-textarea\s*\{[\s\S]*?min-height:\s*63px;/)
  assert.doesNotMatch(source, /<span class="points-icon">/)
})

test('audio model options show average generation duration instead of points cost', () => {
  assert.match(source, /class="model-duration-text"/)
  assert.doesNotMatch(source, /class="model-item-points"/)
})
