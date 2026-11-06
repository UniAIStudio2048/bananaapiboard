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

test('移出时暂停并保留当前画面，再次移入继续播放', async () => {
  const video = { currentTime: 4.25, paused: false, volume: 0.5, dataset: { volumeInitialized: 'true' }, pause() { this.paused = true }, play() { this.paused = false; return Promise.resolve() } }
  const context = { videoPlayerRef: { value: video }, videoPreviewTime: { value: null }, isVideoPreviewActive: { value: true }, showSegmentClip: { value: false }, props: { data: {} }, console }
  getFunction('handleVideoMouseLeave', context)()
  assert.equal(video.paused, true)
  assert.equal(video.currentTime, 4.25)
  assert.equal(context.videoPreviewTime.value, 4.25)
  assert.equal(context.isVideoPreviewActive.value, true)
  getFunction('handleVideoMouseEnter', context)()
  assert.equal(video.paused, false)
  assert.equal(video.currentTime, 4.25)
})

test('播放器重新加载后恢复暂停位置，并保留角色节点的默认裁剪起点', () => {
  const video = { currentTime: 0, duration: 12, videoWidth: 640, videoHeight: 360 }
  const context = {
    videoPreviewTime: { value: 4.25 }, props: { id: 'video-1', data: { output: { url: 'video.mp4' }, isCharacterNode: true, clipStartTime: 2 } },
    normalizedVideoUrl: { value: 'video.mp4' }, applyDetectedVideoDimensions() {}, canvasStore: { updateNodeData() {} }, console: { log() {} }
  }
  const loaded = getFunction('handleVideoLoaded', context)
  loaded({ target: video })
  assert.equal(video.currentTime, 4.25)
  context.videoPreviewTime.value = null
  loaded({ target: video })
  assert.equal(video.currentTime, 2)
})

test('鼠标快速移出时不会在下一帧意外开始播放', () => {
  let scheduled, plays = 0
  const context = {
    isCanvasMediaMoving: { value: false }, isVideoPreviewActive: { value: false }, isVideoHovered: { value: true },
    nextTick: callback => { scheduled = callback }, handleVideoMouseEnter: () => { plays++ }
  }
  const activate = getFunction('activateVideoPreview', context)
  activate()
  context.isVideoHovered.value = false
  scheduled()
  assert.equal(plays, 0)
  activate({ force: true })
  scheduled()
  assert.equal(plays, 1)
})

test('画布拖动时记录当前播放位置', () => {
  const video = { currentTime: 7.3, paused: false, pause() { this.paused = true } }
  const context = { videoPlayerRef: { value: video }, videoPreviewTime: { value: null }, isCanvasDragging: { value: false }, isVideoPreviewActive: { value: true } }
  getFunction('handleCanvasDragStart', context)()
  assert.equal(context.videoPreviewTime.value, 7.3)
  assert.equal(video.paused, true)
  assert.equal(context.isVideoPreviewActive.value, false)
})
