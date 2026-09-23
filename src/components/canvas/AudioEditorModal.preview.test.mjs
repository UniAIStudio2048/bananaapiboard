import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('./AudioEditorModal.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'audio-preview-test' }).content
const compiled = transformSync(script, { format: 'cjs' }).code
const vue = { ...require('vue'), onUnmounted() {} }
const runtimeRequire = id => id === 'vue' ? vue : require(id)

function createEditor() {
  const frames = new Map()
  let nextFrame = 0
  const requestAnimationFrame = callback => {
    const id = ++nextFrame
    frames.set(id, callback)
    return id
  }
  const cancelAnimationFrame = id => frames.delete(id)
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', compiled)(
    runtimeRequire, module, module.exports, requestAnimationFrame, cancelAnimationFrame
  )
  const editor = module.exports.default.setup(
    { audioUrl: '/sample.mp3', title: 'sample', duration: 5 },
    { expose() {}, emit() {} }
  )
  const audio = {
    currentTime: 0,
    volume: 1,
    playbackRate: 1,
    pauseCount: 0,
    playCount: 0,
    play() { this.playCount++; return Promise.resolve() },
    pause() { this.pauseCount++ }
  }
  editor.audioRef.value = audio
  const tick = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach(callback => callback())
  }
  return { editor, audio, tick }
}

test('preview starts at the selected start and stops at its end without waiting for timeupdate', () => {
  const { editor, audio, tick } = createEditor()
  editor.startTime.value = 1.2
  editor.endTime.value = 2.4

  editor.togglePlay()
  assert.equal(audio.currentTime, 1.2)
  assert.equal(audio.playCount, 1)
  assert.equal(editor.previewTime.value, 0)

  audio.currentTime = 1.7
  tick()
  assert.equal(editor.previewTime.value, 0.5)
  audio.currentTime = 2.4
  tick()
  assert.equal(audio.pauseCount, 1)
  assert.equal(editor.isPlaying.value, false)
  assert.equal(audio.currentTime, 1.2)
})

test('moving the selection during preview keeps playback inside the new range', () => {
  const { editor, audio, tick } = createEditor()
  editor.startTime.value = 1
  editor.endTime.value = 3
  editor.togglePlay()

  audio.currentTime = 1.5
  editor.startTime.value = 2
  editor.endTime.value = 4
  tick()
  assert.equal(audio.currentTime, 2)

  editor.endTime.value = 2.2
  audio.currentTime = 2.2
  tick()
  assert.equal(editor.isPlaying.value, false)
  assert.equal(audio.currentTime, 2)
})
