import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VoicePresetPicker.vue', import.meta.url), 'utf8')

test('voice picker defaults to simplified Chinese', () => {
  assert.match(source, /const locale = ref\('zh-CN'\)/)
  assert.match(source, /中文（简体）/)
})

test('voice picker paginates the list from the bottom', () => {
  assert.match(source, /const currentPage = ref\(1\)/)
  assert.match(source, /const paginatedVoices = computed\(/)
  assert.match(source, /class="voice-picker-pagination"/)
  assert.match(source, /上一页/)
  assert.match(source, /下一页/)
})

test('voice picker shows each voice type description', () => {
  assert.match(source, /voice\.description/)
})

test('voice clone can refresh the reading text before recording', () => {
  assert.match(source, /@click="refreshReadingText"/)
  assert.match(source, /const currentReadingTextIndex = ref\(0\)/)
  assert.match(source, /function refreshReadingText\(\)/)
})

test('voice clone displays a live waveform while recording', () => {
  assert.match(source, /ref="waveformCanvas"/)
  assert.match(source, /function startWaveform\(stream\)/)
  assert.match(source, /getByteTimeDomainData/)
  assert.match(source, /requestAnimationFrame/)
  assert.match(source, /cancelAnimationFrame/)
})

test('my voices supports uploading MP3 files between 3 and 35 seconds', () => {
  assert.match(source, /accept="audio\/mpeg,\.mp3"/)
  assert.match(source, /function handleMineAudioUpload\(event\)/)
  assert.match(source, /duration > 3 && duration < 35/)
})

test('my voices displays transcripts only for recorded clone voices', () => {
  assert.match(source, /<small v-if="voice\.transcript">/)
  assert.match(source, /transcript: item\.transcript \|\| ''/)
})

test('deleting a personal voice uses a styled confirmation card', () => {
  assert.match(source, /v-if="voicePendingDeletion"/)
  assert.match(source, /class="delete-confirm-card"/)
  assert.match(source, /function requestDeleteMineVoice\(voice\)/)
  assert.match(source, /function confirmDeleteMineVoice\(\)/)
  assert.doesNotMatch(source, /window\.confirm/)
})
