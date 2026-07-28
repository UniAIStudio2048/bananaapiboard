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
