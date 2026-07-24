import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')
const rules = readFileSync(new URL('../../../config/canvas/nodeTypes.js', import.meta.url), 'utf8')

test('AudioNode switches among Coze voice design, clone and TTS capabilities', () => {
  assert.match(source, /getAvailableAudioModels/)
  assert.match(source, /audioCapability/)
  assert.match(source, /voice_design/)
  assert.match(source, /voice_clone/)
  assert.match(source, /\/api\/audio\/generate/)
  assert.match(source, /\/api\/audio\/query\//)
  assert.match(source, /VOICE_DESIGN_STYLES/)
})

test('voice output keeps voiceId and audio nodes may connect to audio nodes', () => {
  assert.match(source, /voiceId:\s*data\.voice_id/)
  assert.match(source, /props\.data\.inheritedData\?\.voiceId/)
  assert.match(rules, /'audio':\s*\[\s*NODE_TYPES\.AUDIO_INPUT/)
})
