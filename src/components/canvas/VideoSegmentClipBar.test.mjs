import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./VideoSegmentClipBar.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
const declarations = parse(source, { sourceType: 'module' }).program.body.filter(node => node.type === 'FunctionDeclaration')
function getFunction(name, context) {
  const declaration = declarations.find(node => node.id.name === name)
  assert.ok(declaration, `${name} should exist`)
  return runInNewContext(`${source.slice(declaration.start, declaration.end)}\n;${name}`, context)
}

test('焦点在按钮时 Enter 和空格保留按钮的原生键盘操作', () => {
  const actions = []
  const handle = getFunction('handleKey', {
    shiftPressed: { value: false }, props: { busy: false }, ready: { value: true },
    range: { value: { start: 0, end: 2 } }, duration: { value: 10 }, video: null,
    emit: action => actions.push(action), togglePlay: () => actions.push('play')
  })
  for (const key of ['Enter', ' ']) {
    const event = { key, target: { tagName: 'BUTTON', closest: () => ({}) }, preventDefault() { actions.push('prevent') }, stopPropagation() {} }
    handle(event)
  }
  assert.deepEqual(actions, [])
})

test('空格键事件使用 Space 或 code 标识时都能切换播放', () => {
  const actions = []
  const handle = getFunction('handleKey', {
    shiftPressed: { value: false }, props: { busy: false }, ready: { value: true },
    range: { value: { start: 0, end: 2 } }, duration: { value: 10 }, video: null,
    emit() {}, togglePlay: () => actions.push('play')
  })
  for (const keyEvent of [{ key: 'Space' }, { key: 'Unidentified', code: 'Space' }]) {
    const event = {
      ...keyEvent,
      target: { tagName: 'DIV' },
      preventDefault() { actions.push('prevent') },
      stopPropagation() {}
    }
    handle(event)
  }
  assert.deepEqual(actions, ['prevent', 'play', 'prevent', 'play'])
})

test('开启整数秒吸附时先把当前选区边界归一到整数秒', () => {
  const context = {
    snap: { value: false },
    duration: { value: 35.91 },
    range: { value: { start: 0.34, end: 11.97 } },
    video: null
  }
  getFunction('toggleSnap', context)()
  assert.equal(context.snap.value, true)
  assert.equal(context.range.value.start, 0)
  assert.equal(context.range.value.end, 12)
})

test('选区循环关闭时可从选区外继续播放，开启时回到选区', () => {
  const actions = []
  const video = { currentTime: 8, paused: true, play() { actions.push('play'); return Promise.resolve() } }
  const context = { video, ready: { value: true }, loop: { value: false }, range: { value: { start: 2, end: 5 } }, seek: time => { actions.push(time); video.currentTime = time } }
  const togglePlay = getFunction('togglePlay', context)
  togglePlay()
  assert.deepEqual(actions, ['play'])
  context.loop.value = true
  togglePlay()
  assert.deepEqual(actions, ['play', 2, 'play'])
})

test('循环开启时在选区终点返回，关闭后继续播放', () => {
  const video = { currentTime: 5, paused: false }
  const context = { video, loop: { value: true }, range: { value: { start: 2, end: 5 } }, currentTime: { value: 0 } }
  const updateTime = getFunction('updateTime', context)
  updateTime()
  assert.equal(video.currentTime, 2)
  context.loop.value = false
  video.currentTime = 5
  updateTime()
  assert.equal(video.currentTime, 5)
})

test('通过视频播放器开始播放时也遵守选区循环设置', () => {
  const actions = []
  const context = { video: { currentTime: 8 }, loop: { value: true }, range: { value: { start: 2, end: 5 } }, playing: { value: false }, seek: time => actions.push(time), animatePlayhead: () => actions.push('animate') }
  const handlePlay = getFunction('handlePlay', context)
  handlePlay()
  assert.deepEqual(actions, [2, 'animate'])
  context.loop.value = false
  handlePlay()
  assert.deepEqual(actions, [2, 'animate', 'animate'])
})

test('视频播放到结尾时仅在选区循环开启时重新播放', () => {
  const actions = []
  const context = { video: { play() { actions.push('play'); return Promise.resolve() } }, loop: { value: true }, range: { value: { start: 2, end: 5 } }, playing: { value: true }, seek: time => actions.push(time), updateTime: () => actions.push('update') }
  const handleEnded = getFunction('handleEnded', context)
  handleEnded()
  assert.deepEqual(actions, [2, 'play'])
  context.loop.value = false
  handleEnded()
  assert.deepEqual(actions, [2, 'play', 'update'])
})

test('截取期间暂时禁用视频原生循环，退出后恢复', () => {
  const listeners = new Map()
  const element = { loop: true, paused: true, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const context = { video: null, previousVideoLoop: null, cancelAnimationFrame() {}, animationFrame: 0, handleMetadata() {}, updateTime() {}, handlePlay() {}, handlePause() {}, handleEnded() {}, playing: { value: false }, animatePlayhead() {} }
  const bindVideo = getFunction('bindVideo', context)
  bindVideo(element)
  assert.equal(element.loop, false)
  assert.equal(listeners.has('ended'), true)
  bindVideo(null)
  assert.equal(element.loop, true)
  assert.equal(listeners.size, 0)
})
