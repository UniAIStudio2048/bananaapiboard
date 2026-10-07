import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { isPanoramaVrSupportedRatio } from '../../../utils/canvasPanoramaExport.js'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
function harness() {
  const start = source.indexOf('// 全景 VR 预览状态')
  const end = source.indexOf('function openPanoramaPreview(', start)
  const requests = []
  const sandbox = {
    ref: value => ({ value }), currentImageUrl: { value: 'https://filescos.nananobanana.cn/canvas/a.png' },
    isPanoramaVrSupportedRatio, scheduleNodeInternalsUpdate: () => {}, console,
    getSmartImageUrl: value => value,
    Image: class {
      naturalWidth = 1920
      naturalHeight = 1080
      set src(value) { requests.push(value); queueMicrotask(() => this.onload?.()) }
    }
  }
  const api = runInNewContext(`${source.slice(start, end)}; ({ detectPanoramaImage, isPanoramaCandidate })`, sandbox)
  return { ...api, requests, currentImageUrl: sandbox.currentImageUrl }
}

test('panorama detection reuses displayed preview dimensions without creating another request', async () => {
  const api = harness()
  await api.detectPanoramaImage({ target: { naturalWidth: 128, naturalHeight: 72 } }, api.currentImageUrl.value)
  assert.equal(api.isPanoramaCandidate.value, true)
  assert.deepEqual(api.requests, [])
})

test('portrait previews are not panoramic and unrelated output images cannot override the main image', async () => {
  const api = harness()
  await api.detectPanoramaImage({ target: { naturalWidth: 128, naturalHeight: 256 } }, api.currentImageUrl.value)
  assert.equal(api.isPanoramaCandidate.value, false)
  await api.detectPanoramaImage({ target: { naturalWidth: 128, naturalHeight: 72 } }, 'other-output.png')
  assert.equal(api.isPanoramaCandidate.value, false)
  assert.deepEqual(api.requests, [])
})

test('decode completion without a DOM event does not reset an established panorama result', async () => {
  const api = harness()
  await api.detectPanoramaImage({ target: { naturalWidth: 128, naturalHeight: 72 } }, api.currentImageUrl.value)
  await api.detectPanoramaImage(undefined, api.currentImageUrl.value)
  assert.equal(api.isPanoramaCandidate.value, true)
  assert.deepEqual(api.requests, [])
})

test('source changes reset panorama state without eagerly loading originals', () => {
  const start = source.indexOf('watch(currentImageUrl,')
  const end = source.indexOf('const VIDEO_NODE_TYPES', start)
  const state = { value: true }
  const requests = []
  let callback
  runInNewContext(source.slice(start, end), {
    currentImageUrl: { value: 'old.png' }, isPanoramaCandidate: state,
    watch: (_source, cb) => { callback = cb }, detectPanoramaImage: url => requests.push(url)
  })
  callback('new.png')
  assert.equal(state.value, false)
  assert.deepEqual(requests, [])
})

test('both source and output preview load events drive panorama detection', () => {
  assert.ok(/@load="detectPanoramaImage\(\$event, sourceImages\[0\]\)"/.test(source))
  assert.ok(/@load="detectPanoramaImage\(\$event, img\)"/.test(source))
})
