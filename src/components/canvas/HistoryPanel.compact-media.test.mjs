import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const panel = readFileSync(new URL('./HistoryPanel.vue', import.meta.url), 'utf8')
const playerPath = new URL('./HistoryAudioCard.vue', import.meta.url)
const player = existsSync(playerPath) ? readFileSync(playerPath, 'utf8') : ''

function columns(width, selectionMode, fullscreen) {
  const declaration = panel.match(/const columnCount = computed\([\s\S]*?\n\n/)[0]
  return runInNewContext(`${declaration}; columnCount.value`, {
    computed: fn => ({ get value() { return fn() } }),
    historyListWidth: { value: width }, props: { selectionMode }, isFullscreen: { value: fullscreen }
  })
}

test('history picker uses the same compact columns as expanded history', () => {
  assert.equal(columns(1380, true, false), 6)
  assert.equal(columns(1380, true, false), columns(1380, false, true))
  assert.equal(columns(480, false, false), 2)
  assert.equal(columns(680, true, false), 3)
  assert.equal(columns(300, true, false), 1)
})

function createPlayers() {
  assert.ok(player, 'History audio needs a playable waveform card')
  const setup = player.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*\n/gm, '')
  const module = player.match(/<script>([\s\S]*?)<\/script>/)[1]
  return runInNewContext(`${module}; (function createPlayer() { ${setup}; return { audioRef, playing, currentTime, duration, error, togglePlayback, handlePlay, seekTo, resetPlayback } })`, {
    defineProps: () => ({ src: '/audio.wav', duration: 10, active: true }),
    ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }),
    watch() {}, onBeforeUnmount() {}
  })
}

function audioStub() {
  return { paused: true, currentTime: 0, duration: 10, pause() { this.paused = true }, async play() { this.paused = false } }
}

test('play failure is visible and retry can start playback', async () => {
  const create = createPlayers()
  const state = create()
  const audio = audioStub()
  state.audioRef.value = audio
  audio.play = async () => { throw new Error('unavailable') }
  await state.togglePlayback()
  assert.ok(state.error.value)
  assert.equal(state.playing.value, false)
  audio.play = async () => { audio.paused = false }
  await state.togglePlayback()
  assert.equal(state.error.value, '')
  assert.equal(audio.paused, false)
})

test('starting another history audio pauses the previous one', () => {
  const create = createPlayers()
  const first = create(), second = create()
  first.audioRef.value = audioStub(); second.audioRef.value = audioStub()
  first.audioRef.value.paused = false
  first.handlePlay()
  second.handlePlay()
  assert.equal(first.audioRef.value.paused, true)
  assert.equal(second.playing.value, true)
})

test('seeking clamps to the duration and resetting stops playback', () => {
  const state = createPlayers()()
  state.audioRef.value = audioStub()
  state.seekTo({ target: { value: 30 } })
  assert.equal(state.audioRef.value.currentTime, 10)
  state.seekTo({ target: { value: -2 } })
  assert.equal(state.audioRef.value.currentTime, 0)
  state.playing.value = true
  state.resetPlayback()
  assert.equal(state.playing.value, false)
  assert.equal(state.audioRef.value.paused, true)
})

test('audio controls do not toggle a history selection and do not preload every track', () => {
  assert.match(player, /preload="none"/)
  assert.match(player, /@click\.stop="togglePlayback"/)
  assert.match(player, /@keydown\.stop/)
  assert.match(player, /onBeforeUnmount\(resetPlayback\)/)
  assert.match(panel, /<HistoryAudioCard/)
  assert.match(panel, /:active="!showPreview"/)
})
