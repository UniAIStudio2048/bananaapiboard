import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('AudioNode displays the character-tiered charge for Coze audio models', () => {
  assert.match(source, /import \{ calculateAudioPointsCost \} from '@\/utils\/audioPricing'/)
  assert.match(source, /calculateAudioPointsCost\(cost, musicPrompt\.value\)/)
})
