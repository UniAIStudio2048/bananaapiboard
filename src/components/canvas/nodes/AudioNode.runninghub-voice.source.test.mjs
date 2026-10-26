import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')
const models = readFileSync(new URL('../../../config/audioModels.js', import.meta.url), 'utf8')

test('audio node sends RunningHub design, clone, and TTS inputs through the shared audio route', () => {
  assert.match(source, /isRunningHubMusic/)
  assert.match(source, /isRunningHubAudio\.value && audioCapability\.value === 'voice_design'/)
  assert.match(source, /isRunningHubAudio\.value && audioCapability\.value === 'voice_clone'/)
  assert.match(source, /isRunningHubAudio\.value && audioCapability\.value === 'tts'/)
  assert.match(source, /body\.reference_audio_url = inheritedAudioUrl\.value \|\| selectedVoicePreset\.value\?\.previewUrl/)
})

test('audio model normalization preserves RunningHub node mappings for tenant configuration', () => {
  assert.match(models, /nodeInfoList: Array\.isArray\(model\.nodeInfoList\)/)
})
