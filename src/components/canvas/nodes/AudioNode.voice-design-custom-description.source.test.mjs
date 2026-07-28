import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('voice design custom description is empty by default and provides a roomy example textarea', () => {
  assert.match(source, /const voiceCustomDescription = ref\(props\.data\.voiceCustomDescription \|\| ''\)/)
  assert.match(source, /<textarea v-model="voiceCustomDescription"[\s\S]*?placeholder="威严深沉的恶魔男声，语速缓慢，自带回音感和极强的压迫力，仿佛高高在上的神明。"/)
  assert.match(source, /\.voice-style-custom-input textarea \{[\s\S]*?min-height: 104px;/)
})
