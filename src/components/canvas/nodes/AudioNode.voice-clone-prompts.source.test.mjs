import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')

test('voice clone keeps its prompt editable and submits the entered text as prompt', () => {
  assert.match(source, /voice_clone_reading_texts/)
  assert.match(source, /audioCapability\.value === 'voice_clone'\) \{\s*body\.prompt = musicPrompt\.value\s*body\.reference_audio_url = inheritedAudioUrl\.value/)
  assert.match(source, /contenteditable="true"/)
  assert.doesNotMatch(source, /function refreshVoiceCloneReadingText\(/)
  assert.doesNotMatch(source, /需朗读内容/)
  assert.doesNotMatch(source, /文本刷新/)
})
