import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
const ast = parse(script, { sourceType: 'module' })
const functions = ['isEditableShortcutTarget', 'handleKeyDown', 'toggleInteractionMode', 'saveInteractionMode']
  .map(name => {
    const node = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
    assert.ok(node, `${name} must exist`)
    return script.slice(node.start, node.end)
  }).join('\n')

function setup() {
  const saved = []
  const created = []
  const state = {
    interactionMode: { value: 'comfyui' },
    cleanCanvasMode: { value: false },
    me: { value: { preferences: { language: 'zh-CN', canvas: { gridSnap: true } } } },
    updateUserPreferences: async preferences => { saved.push(preferences); return true },
    createDownstreamNode: (...args) => created.push(args)
  }
  const handleKeyDown = new Function(...Object.keys(state), `${functions}\nreturn handleKeyDown`)(...Object.values(state))
  return { ...state, saved, created, handleKeyDown }
}

function keyEvent(overrides = {}) {
  return {
    key: 'c', repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    isComposing: false, defaultPrevented: false,
    target: { tagName: 'DIV', closest: () => null },
    preventDefault() { this.defaultPrevented = true },
    ...overrides
  }
}

test('C switches both ways, saves each mode and preserves other preferences', async () => {
  const state = setup()
  for (const mode of ['infinite-canvas', 'comfyui', 'infinite-canvas', 'comfyui']) {
    const event = keyEvent()
    await state.handleKeyDown(event)
    assert.equal(state.interactionMode.value, mode)
    assert.equal(event.defaultPrevented, true)
    assert.equal(state.saved.at(-1).canvas.interactionMode, mode)
    assert.equal(state.saved.at(-1).canvas.gridSnap, true)
    assert.equal(state.saved.at(-1).language, 'zh-CN')
  }
  assert.equal(state.saved.length, 4)
  assert.deepEqual(state.created, [], 'C must not create a downstream video node')
})

test('Caps Lock C also switches modes in clean mode', async () => {
  const state = setup()
  state.cleanCanvasMode.value = true
  await state.handleKeyDown(keyEvent({ key: 'C' }))
  assert.equal(state.interactionMode.value, 'infinite-canvas')
  assert.equal(state.cleanCanvasMode.value, true)
})

test('V still creates a downstream video without switching modes', async () => {
  const state = setup()
  const event = keyEvent({ key: 'v' })
  await state.handleKeyDown(event)
  assert.deepEqual(state.created, [['video', '视频']])
  assert.equal(state.interactionMode.value, 'comfyui')
  assert.equal(event.defaultPrevented, true)
  assert.equal(state.saved.length, 0)
})

for (const overrides of [
  { repeat: true }, { shiftKey: true }, { isComposing: true },
  { ctrlKey: true }, { metaKey: true }, { altKey: true }
]) {
  test(`modified, repeated or composing C is ignored: ${JSON.stringify(overrides)}`, async () => {
    const state = setup()
    const event = keyEvent(overrides)
    await state.handleKeyDown(event)
    assert.equal(state.interactionMode.value, 'comfyui')
    assert.equal(event.defaultPrevented, false)
    assert.deepEqual(state.created, [])
    assert.deepEqual(state.saved, [])
  })
}

for (const target of [
  { tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' },
  { tagName: 'DIV', isContentEditable: true }, { tagName: 'SPAN', closest: () => ({}) }
]) {
  test(`V and C preserve editing in ${target.tagName}${target.isContentEditable ? ' contenteditable' : ''}`, async () => {
    const state = setup()
    for (const key of ['v', 'c']) {
      const event = keyEvent({ target: { closest: () => null, ...target }, key })
      await state.handleKeyDown(event)
      assert.equal(event.defaultPrevented, false)
    }
    assert.equal(state.interactionMode.value, 'comfyui')
    assert.deepEqual(state.created, [])
    assert.deepEqual(state.saved, [])
  })
}

test('other downstream node shortcuts remain available', async () => {
  const state = setup()
  for (const key of ['i', 't', 'a']) await state.handleKeyDown(keyEvent({ key }))
  assert.deepEqual(state.created, [['image-input', '图片'], ['text-input', '文本'], ['audio-input', '音频']])
})

test('Ctrl/Cmd+C and Ctrl/Cmd+V retain their copy and paste behavior', async () => {
  const state = setup()
  for (const key of ['c', 'v']) {
    for (const modifier of ['ctrlKey', 'metaKey']) {
      const event = keyEvent({ key, [modifier]: true })
      await state.handleKeyDown(event)
      assert.equal(event.defaultPrevented, false)
    }
  }
  assert.deepEqual(state.created, [])
})
