import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
const ast = parse(source, { sourceType: 'module' })

function getFunction(name, context) {
  const declaration = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(declaration, `${name} should exist`)
  return runInNewContext(`${source.slice(declaration.start, declaration.end)}\n;${name}`, context)
}

test('片段截取复用持久化导出流程并传入准确范围', async () => {
  const calls = []
  const context = {
    segmentClipSubmitting: { value: false },
    showSegmentClip: { value: true },
    videoToolInitialSource: { value: { url: 'https://cdn.example.com/source.mp4' } },
    loadVideoEditDraft: async () => calls.push('load'),
    exportEditedClipToCanvas: async payload => calls.push(JSON.parse(JSON.stringify(payload))),
    showToast: message => { throw new Error(message) }
  }
  context.closeSegmentClip = () => { context.showSegmentClip.value = false }
  await getFunction('confirmSegmentClip', context)({ start: 1.5, end: 4.75 })
  assert.equal(calls[0], 'load')
  assert.deepEqual(calls[1], { operation: 'segment', clips: [{ url: 'https://cdn.example.com/source.mp4', startTime: 1.5, endTime: 4.75, duration: 3.25 }] })
  assert.equal(context.showSegmentClip.value, false)
  assert.equal(context.segmentClipSubmitting.value, false)
})

test('片段编辑期间移出视频不会停止预览，平时暂停并保留画面', () => {
  let pauses = 0
  const video = { paused: false, currentTime: 3, pause() { pauses++ } }
  const context = { showSegmentClip: { value: true }, videoPlayerRef: { value: video }, videoPreviewTime: { value: null }, props: { data: {} }, isVideoPreviewActive: { value: true } }
  const leave = getFunction('handleVideoMouseLeave', context)
  leave()
  assert.equal(pauses, 0)
  assert.equal(context.isVideoPreviewActive.value, true)
  context.showSegmentClip.value = false
  leave()
  assert.equal(pauses, 1)
  assert.equal(context.isVideoPreviewActive.value, true)
  assert.equal(video.currentTime, 3)
})

test('退出片段截取时停止播放并卸载预览', () => {
  let pauses = 0
  const context = { showSegmentClip: { value: true }, videoPlayerRef: { value: { pause() { pauses++ } } }, isVideoPreviewActive: { value: true } }
  getFunction('closeSegmentClip', context)()
  assert.equal(pauses, 1)
  assert.equal(context.showSegmentClip.value, false)
  assert.equal(context.isVideoPreviewActive.value, false)
})

test('本地视频先上传再导出，避免将 blob 地址发送给后端', async () => {
  let submitted
  const context = {
    segmentClipSubmitting: { value: false }, videoToolInitialSource: { value: { url: 'blob:video' } },
    fetch: async () => ({ blob: async () => ({ type: 'video/mp4' }) }),
    File: class { constructor(parts, name, options) { this.name = name; this.type = options.type } },
    uploadCanvasMedia: async (file, type) => { assert.equal(type, 'video'); return { url: 'https://cdn.example.com/upload.mp4' } },
    loadVideoEditDraft: async () => {}, closeSegmentClip: () => {},
    exportEditedClipToCanvas: async payload => { submitted = payload },
    showToast: message => { throw new Error(message) }
  }
  await getFunction('confirmSegmentClip', context)({ start: 0, end: 2 })
  assert.equal(submitted.clips[0].url, 'https://cdn.example.com/upload.mp4')
})
