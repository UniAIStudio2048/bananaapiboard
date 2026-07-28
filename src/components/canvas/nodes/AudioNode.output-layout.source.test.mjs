import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('AudioNode renders the compact waveform player layout', () => {
  assert.match(source, /const nodeWidth = ref\(props\.data\.width \|\| 614\)/)
  assert.match(source, /class="node-label-icon"/)
  assert.match(source, /class="audio-visual" title="点击跳转播放进度" @click="handleProgressClick"/)
  assert.match(source, /v-for="i in 43"/)
  assert.match(source, /class="audio-playhead" :style="\{ left: progressPercent \+ '%' \}"/)
  assert.match(source, /class="audio-controls-spacer"/)
  assert.doesNotMatch(source, /class="progress-bar"/)
})
