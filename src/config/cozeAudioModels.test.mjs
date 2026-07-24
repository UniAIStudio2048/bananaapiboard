import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAudioModels, VOICE_DESIGN_STYLES } from './audioModels.js'

test('publishes enabled Coze audio models and fixed voice styles', () => {
  assert.deepEqual(normalizeAudioModels([{ name: 'voice', displayName: 'Voice', apiType: 'coze-audio-workflow', capability: 'tts', enabled: true }])[0].capability, 'tts')
  assert.deepEqual(VOICE_DESIGN_STYLES.map(item => item.value), [
    'general', 'narration', 'conversational', 'advertising', 'character', 'emotional'
  ])
})
