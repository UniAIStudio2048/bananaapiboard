import test from 'node:test'
import assert from 'node:assert/strict'
import { createStreamVideoPlayback } from './streamVideoPlayback.js'

function video() {
  const listeners = new Map()
  return {
    src: 'https://r2.example.com/original.mp4', poster: '', paused: false, currentTime: 2,
    duration: 10, autoplay: false, controlsList: { add() {}, remove() {} },
    canPlayType: () => '', load() {}, play() { this.paused = false; return Promise.resolve() },
    addEventListener(name, callback) { listeners.set(name, callback) },
    removeEventListener(name) { listeners.delete(name) },
    fire(name) { listeners.get(name)?.() }
  }
}

test('ready HLS changes the player only; the source used by downloads stays unchanged', async () => {
  const el = video(), source = el.src
  const callbacks = {}
  let loaded
  class Hls {
    static isSupported() { return true }
    static Events = { ERROR: 'error' }
    on(event, fn) { callbacks[event] = fn }
    loadSource(url) { loaded = url }
    attachMedia() {}
    destroy() {}
  }
  const controller = createStreamVideoPlayback(el, source, {
    resolve: async () => ({ status: 'ready', playbackUrl: 'https://stream.example.com/a.m3u8', downloadUrl: source }),
    loadHls: async () => Hls
  })
  await controller.start()
  assert.equal(loaded, 'https://stream.example.com/a.m3u8')
  assert.equal(source, 'https://r2.example.com/original.mp4')
  callbacks.error(null, { fatal: true })
  assert.equal(el.src, source)
  el.fire('loadedmetadata')
  assert.equal(el.currentTime, 2)
  controller.destroy()
})

test('non-R2 and unauthorized responses never load HLS or replace the original source', async () => {
  for (const response of [{ status: 'original' }, { status: 'failed' }, { status: 'ready', playbackUrl: null }]) {
    const el = video(), source = el.src
    const controller = createStreamVideoPlayback(el, source, { resolve: async () => response, loadHls: async () => { throw Error('must_not_load') } })
    await controller.start()
    assert.equal(el.src, source)
    controller.destroy()
  }
})

test('source change/unmount cancels pending results and scheduled polling', async () => {
  const el = video(), source = el.src
  let finish
  const controller = createStreamVideoPlayback(el, source, {
    resolve: () => new Promise(resolve => { finish = resolve }),
    loadHls: async () => { throw Error('must_not_load') }
  })
  const started = controller.start()
  controller.destroy()
  finish({ status: 'ready', playbackUrl: 'https://stream.example.com/a.m3u8' })
  await started
  assert.equal(el.src, source)
})

test('native HLS playback restores position and falls back to original on error', async () => {
  const el = video(), source = el.src
  el.canPlayType = () => 'probably'
  const controller = createStreamVideoPlayback(el, source, {
    resolve: async () => ({ status: 'ready', playbackUrl: 'https://stream.example.com/a.m3u8' })
  })
  await controller.start()
  assert.ok(el.src.endsWith('.m3u8'))
  el.fire('loadedmetadata')
  assert.equal(el.currentTime, 2)
  el.fire('error')
  assert.equal(el.src, source)
  controller.destroy()
})

test('changing a video clears the previous generated poster and download restriction', async () => {
  const el = video()
  el.canPlayType = () => 'probably'
  const controls = new Set()
  el.controlsList = controls
  el.controlsList.remove = value => controls.delete(value)
  const controller = createStreamVideoPlayback(el, el.src, {
    resolve: async () => ({ status: 'ready', playbackUrl: 'https://stream.example.com/a.m3u8', posterUrl: 'https://stream.example.com/poster.jpg' })
  })
  await controller.start()
  assert.ok(el.poster.endsWith('poster.jpg'))
  controller.destroy()
  assert.equal(el.poster, '')
  assert.equal(controls.has('nodownload'), false)
})

test('destroy does not overwrite a new poster supplied by the component during a source change', async () => {
  const el = video()
  el.canPlayType = () => 'probably'
  const controller = createStreamVideoPlayback(el, el.src, {
    resolve: async () => ({ status: 'ready', playbackUrl: 'https://stream.example.com/a.m3u8', posterUrl: 'https://stream.example.com/poster.jpg' })
  })
  await controller.start()
  el.poster = 'https://r2.example.com/new-poster.jpg'
  controller.destroy()
  assert.equal(el.poster, 'https://r2.example.com/new-poster.jpg')
})
