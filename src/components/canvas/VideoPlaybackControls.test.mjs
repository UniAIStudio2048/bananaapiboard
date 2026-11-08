import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

function loadFunction(file, name, context) {
  const text = readFileSync(new URL(file, import.meta.url), 'utf8')
  const source = text.match(/<script setup>([\s\S]*?)<\/script>/)[1]
  const ast = parse(source, { sourceType: 'module' })
  const declaration = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(declaration, `${name} should exist`)
  return runInNewContext(`${source.slice(declaration.start, declaration.end)}\n;${name}`, context)
}

test('播放时间支持长视频和无效值', () => {
  const format = loadFunction('./VideoPlaybackControls.vue', 'formatTime', {})
  assert.equal(format(0), '0:00')
  assert.equal(format(73.8), '1:13')
  assert.equal(format(3605), '1:00:05')
  assert.equal(format(Infinity), '0:00')
})

test('空格只在当前视频预览生效，输入框及修饰键不受影响', () => {
  let toggles = 0
  const context = { props: { keyboardActive: true, videoElement: {} }, togglePlay: () => toggles++ }
  const keydown = loadFunction('./VideoPlaybackControls.vue', 'handleSpaceKey', context)
  function event(overrides = {}) {
    return { key: ' ', target: { tagName: 'DIV' }, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true }, ...overrides }
  }
  const normal = event()
  keydown(normal)
  assert.equal(toggles, 1)
  assert.equal(normal.prevented, true)
  assert.equal(normal.stopped, true)
  keydown(event({ repeat: true }))
  keydown(event({ target: { tagName: 'TEXTAREA' } }))
  keydown(event({ target: { isContentEditable: true } }))
  keydown(event({ ctrlKey: true }))
  keydown(event({ target: { tagName: 'INPUT', type: 'range' } }))
  assert.equal(toggles, 2)
  context.props.keyboardActive = false
  keydown(event())
  assert.equal(toggles, 2)
})

test('悬停预览默认以 50% 音量播放', async () => {
  const video = { paused: true, muted: false, volume: 1, dataset: {}, play() { return Promise.resolve() } }
  const context = { videoPlayerRef: { value: video }, isVideoPreviewActive: { value: true }, console }
  loadFunction('./nodes/VideoNode.vue', 'handleVideoMouseEnter', context)()
  await Promise.resolve()
  assert.equal(video.volume, 0.5)
  assert.equal(video.muted, false)
})

test('自动播放被浏览器拦截时回退静音，主动播放后恢复音量', async () => {
  let attempts = 0
  const video = {
    paused: true, muted: false, volume: 1, dataset: {},
    play() { attempts++; return attempts === 1 ? Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) : Promise.resolve() },
    pause() { this.paused = true }
  }
  const context = { videoPlayerRef: { value: video }, isVideoPreviewActive: { value: true }, console }
  loadFunction('./nodes/VideoNode.vue', 'handleVideoMouseEnter', context)()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(attempts, 2)
  assert.equal(video.muted, true)
  assert.equal(video.dataset.autoplayMuted, 'true')
  loadFunction('./VideoPlaybackControls.vue', 'togglePlay', { props: { videoElement: video } })()
  assert.equal(video.muted, false)
  assert.equal(video.volume, 0.5)
  assert.equal(video.dataset.autoplayMuted, undefined)
})

test('用户手动静音后播放不会自动取消静音', () => {
  const video = { paused: true, muted: true, volume: 0.5, dataset: {}, play: () => Promise.resolve() }
  loadFunction('./VideoPlaybackControls.vue', 'togglePlay', { props: { videoElement: video } })()
  assert.equal(video.muted, true)
})

test('视频重建前记录静音状态，并在重新挂载时恢复', () => {
  const video = { muted: true }
  const context = { videoPlayerRef: { value: video }, isVideoMuted: { value: false } }
  const syncMute = loadFunction('./nodes/VideoNode.vue', 'handleVideoVolumeChange', context)
  syncMute({ target: video })
  assert.equal(context.isVideoMuted.value, true)
  syncMute({ target: { muted: false } })
  assert.equal(context.isVideoMuted.value, true)
  video.muted = false
  syncMute({ target: video })
  assert.equal(context.isVideoMuted.value, false)

  const source = readFileSync(new URL('./nodes/VideoNode.vue', import.meta.url), 'utf8')
  assert.match(source, /:muted="isVideoMuted"/)
  assert.match(source, /@volumechange="handleVideoVolumeChange"/)
})

test('视频画面滚轮按 5% 调节音量，并阻止画布滚动', () => {
  const video = { volume: 0.5, muted: false, dataset: {} }
  const wheel = loadFunction('./nodes/VideoNode.vue', 'handleVideoVolumeWheel', { videoPlayerRef: { value: video } })
  const event = deltaY => ({ deltaY, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } })
  const up = event(-100)
  wheel(up)
  assert.equal(video.volume, 0.55)
  assert.equal(up.prevented, true)
  assert.equal(up.stopped, true)
  wheel(event(100))
  assert.equal(video.volume, 0.5)
  video.volume = 1
  wheel(event(-100))
  assert.equal(video.volume, 1)
  video.volume = 0.05
  wheel(event(100))
  assert.equal(video.volume, 0)
  assert.equal(video.muted, true)
  wheel(event(-100))
  assert.equal(video.volume, 0.05)
  assert.equal(video.muted, false)
})

test('滚轮调整自动静音的视频时从默认音量继续', () => {
  const video = { volume: 0.5, muted: true, dataset: { autoplayMuted: 'true' } }
  const wheel = loadFunction('./nodes/VideoNode.vue', 'handleVideoVolumeWheel', { videoPlayerRef: { value: video } })
  wheel({ deltaY: -1, preventDefault() {}, stopPropagation() {} })
  assert.equal(video.volume, 0.55)
  assert.equal(video.muted, false)
  assert.equal(video.dataset.autoplayMuted, undefined)
})

test('截取首帧、尾帧和当前帧发送正确时间并持久化图片节点', async () => {
  const calls = []
  const tab = { id: 'tab-1', workflowId: 'workflow-1' }
  const context = {
    props: { id: 'video-1', data: { output: { url: 'https://cdn.example.com/video.mp4' } } },
    canvasStore: {
      nodes: [{ id: 'video-1', position: { x: 20, y: 30 }, data: { width: 420 } }],
      getCurrentTab: () => tab,
      addNode: node => calls.push(['node', node]),
      addEdge: edge => calls.push(['edge', edge])
    },
    frameCaptureBusy: { value: false },
    extractVideoFrame: async args => { calls.push(['extract', args]); return { url: 'https://cdn.example.com/frame.jpg', time: args.time } },
    postWorkflowOps: async (workflowId, operations) => calls.push(['persist', workflowId, operations]),
    showToast: message => { throw new Error(message) },
    globalThis: { crypto: { randomUUID: (() => { let id = 0; return () => String(++id) })() } }
  }
  const capture = loadFunction('./nodes/VideoNode.vue', 'handleCaptureVideoFrame', context)
  for (const captureInfo of [{ mode: 'current', time: 2.4, duration: 12 }, { mode: 'first', time: 2.4, duration: 12 }, { mode: 'last', time: 2.4, duration: 12 }]) await capture(captureInfo)
  const extracts = calls.filter(call => call[0] === 'extract').map(call => ({ time: call[1].time, mode: call[1].mode }))
  assert.deepEqual(extracts, [{ time: 2.4, mode: 'time' }, { time: 0, mode: 'time' }, { time: 11.88, mode: 'last' }])
  assert.equal(calls.filter(call => call[0] === 'persist').length, 3)
  for (const call of calls.filter(call => call[0] === 'persist')) {
    assert.equal(call[1], 'workflow-1')
    assert.equal(call[2][0].payload.data.output.url, 'https://cdn.example.com/frame.jpg')
    assert.equal(call[2][1].payload.source, 'video-1')
  }
  assert.equal(context.frameCaptureBusy.value, false)
})
