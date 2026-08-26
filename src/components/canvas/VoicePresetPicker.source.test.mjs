import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VoicePresetPicker.vue', import.meta.url), 'utf8')

test('voice picker defaults to simplified Chinese', () => {
  assert.match(source, /const locale = ref\(isMiniMax\.value \|\| isFish\.value \? '' : 'zh-CN'\)/)
  assert.match(source, /中文（简体）/)
})

test('voice picker paginates the list from the bottom', () => {
  assert.match(source, /const currentPage = ref\(1\)/)
  assert.match(source, /const paginatedVoices = computed\(/)
  assert.match(source, /const visiblePageItems = computed\(/)
  assert.match(source, /function getVisiblePageItems\(total, current\)/)
  assert.match(source, /item\.type === 'ellipsis'/)
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
  assert.match(source, /v-if="!isMiniMax && !isFish" class="mine-upload"/)
  assert.match(source, /accept="audio\/mpeg,\.mp3"/)
  assert.match(source, /function handleMineAudioUpload\(event\)/)
  assert.match(source, /duration > 3 && duration < 35/)
})

test('MiniMax picker exposes clone controls only when the configured fixed price is available', () => {
  assert.match(source, /provider: \{ type: String, default: 'coze' \}/)
  assert.match(source, /const isMiniMax = computed\(\(\) => props\.provider === 'minimax'\)/)
  assert.match(source, /\/api\/audio\/minimax\/system-voices\?model=/)
  assert.match(source, /\?provider=minimax&_t=\$\{Date\.now\(\)\}/)
  assert.match(source, /const isMiniMaxCloneEnabled = computed\(\(\) => isMiniMax\.value && Number\.isFinite\(props\.clonePointsCost\)/)
  assert.match(source, /v-if="\(!isMiniMax && !isFish\) \|\| isMiniMaxCloneEnabled \|\| isFishCloneEnabled"[^>]*>克隆新音色/)
  assert.match(source, /accept="audio\/mpeg,audio\/mp4,audio\/wav,\.mp3,\.m4a,\.wav"/)
  assert.match(source, /\/api\/audio\/minimax\/voices\/clone/)
  assert.match(source, /本次复刻将消耗/)
  assert.match(source, /我确认拥有该声音的合法授权/)
  assert.match(source, /v-if="!isMiniMax && !isFish" class="mine-upload"/)
  assert.match(source, /:disabled="!voice\.hasPreview && !isMiniMax && !isFish"/)
})

test('my voices avoids stale caches and retries transient network failures', () => {
  assert.match(source, /provider=minimax[^'`]*_t=\$\{Date\.now\(\)\}/)
  assert.match(source, /Failed to fetch\|fetch failed\|NetworkError\|Load failed/)
  assert.match(source, /loadMineVoices\(attempt \+ 1\)/)
})

test('Fish picker loads its voice library, permits voices without previews, and clones with authorization', () => {
  assert.match(source, /const isFish = computed\(\(\) => props\.provider === 'fish'\)/)
  assert.match(source, /\/api\/audio\/fish\/voices\?model=/)
  assert.match(source, /\?provider=fish&_t=\$\{Date\.now\(\)\}/)
  assert.match(source, /const isFishCloneEnabled = computed\(\(\) => isFish\.value && Number\.isFinite\(props\.clonePointsCost\)/)
  assert.match(source, /\/api\/audio\/fish\/voices\/clone/)
  assert.match(source, /isFish\.value \? 'fish' : 'reference'/)
  assert.match(source, /!voice\.hasPreview && !isMiniMax && !isFish/)
})

test('MiniMax clone checks file constraints and keeps the provider-required source format', () => {
  assert.match(source, /复刻音频不能超过20MB/)
  assert.match(source, /复刻音频时长需在10秒至5分钟之间/)
  assert.match(source, /function getRecordingExtension\(mimeType = ''\)/)
  assert.match(source, /recording-\$\{Date\.now\(\)\}\$\{getRecordingExtension\(blob\.type\)\}/)
  assert.match(source, /if \(recordSeconds\.value >= 300\) stopRecording\(\)/)
})

test('MiniMax official voices can generate and cache a playable preview', () => {
  assert.match(source, /\/api\/audio\/minimax\/system-voices\/\$\{encodeURIComponent\(voice\.sourceVoice\)\}\/preview/)
  assert.match(source, /const previewLoadingId = ref\(''\)/)
  assert.match(source, /function requestMiniMaxSystemPreview\(voice, attempts = 0\)/)
  assert.match(source, /previewLoadingId\.value === voice\.id/)
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
