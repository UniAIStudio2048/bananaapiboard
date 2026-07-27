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
  assert.match(source, /voiceDesignStyle/)
  assert.match(source, /voiceDialect/)
  assert.match(source, /voicePace/)
  assert.match(source, /isVoiceStyleDropdownOpen/)
  assert.match(source, /toggleVoiceStyleDropdown/)
  assert.match(source, /class="voice-style-selector"/)
  assert.match(source, /audio-reference-remove/)
  assert.match(source, /function removeReferenceAudio\(/)
  assert.match(source, /canvasStore\.edges\.find\(edge => edge\.target === props\.id/)
  assert.match(source, /body\.style = voiceDesignStyle\.value/)
  assert.match(source, /audioCapability\.value === 'voice_clone'\) \{\s*body\.prompt = musicPrompt\.value\s*body\.reference_audio_url = inheritedAudioUrl\.value/)
  assert.match(source, /说话的文本内容，描述希望角色说出的内容/)
  assert.match(source, /说话的文本内容，描述你需要克隆的文本内容/)
})

test('TTS offers a preset voice picker and respects reference audio priority', () => {
  assert.match(source, /VoicePresetPicker/)
  assert.match(source, /selectedVoicePreset/)
  assert.match(source, /audioCapability === 'tts'/)
  assert.match(source, /body\.reference_audio_url = inheritedAudioUrl\.value/)
  assert.match(source, /body\.voice_id = selectedVoicePreset\.value\.previewUrl/)
  assert.match(source, /body\.reference_audio_text = selectedVoicePreset\.value\.transcript/)
})

test('voice output keeps voiceId and audio nodes may connect to audio nodes', () => {
  assert.match(source, /voiceId:\s*data\.voice_id/)
  assert.match(source, /sourceData\?\.voiceId/)
  assert.match(rules, /'audio':\s*\[\s*NODE_TYPES\.AUDIO_INPUT/)
})

test('Coze audio generation does not require input parameters at the node boundary', () => {
  assert.match(source, /const canGenerateCurrentAudio = computed\(\(\) => \{\s*if \(audioCapability\.value\) return true/)
})

test('audio output duration is normalized to a number after metadata loads', () => {
  assert.match(source, /const audioDuration = Number\(audioRef\.value\.duration\)/)
  assert.match(source, /output: \{ \.\.\.props\.data\.output, duration: audioDuration \}/)
})

test('AudioNode uses the shared processing card treatment', () => {
  assert.match(source, /'is-processing': props\.data\?\.status === 'processing'/)
  assert.match(source, /class="comet-border"/)
  assert.match(source, /v-if="props\.data\?\.status === 'processing'" class="node-content preview-loading"/)
  assert.match(source, /音频生成中\.\.\./)
})

test('AudioNode keeps the prompt panel available after audio output is generated', () => {
  assert.match(source, /class="music-gen-panel"/)
  assert.doesNotMatch(source, /<div v-if="!hasAudio" class="music-gen-panel">/)
})

test('AudioNode routes post-generation actions through the right-side node creator', () => {
  assert.match(source, /class="node-add-btn node-add-btn-right nodrag"/)
  assert.match(source, /canvasStore\.openNodeSelector\(/)
  assert.doesNotMatch(source, /class="audio-info-panel"/)
  assert.doesNotMatch(source, /handleLipSync|handleAudioToVideo|handleAudioToText/)
  assert.doesNotMatch(source, /音频生视频/)
})
