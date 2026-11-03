import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { create, act } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const compiled = await build({
  stdin: { contents: "export { useTextPresets } from './useTextPresets'; export { bindEditorStorage } from './storage'", resolveDir: new URL('.', import.meta.url).pathname },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react']
})
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { useTextPresets, bindEditorStorage } = module.exports
const namespace = value => `media-canvas-preferences:v1:${value.repeat(64)}`
const layer = { text: '标题', start: 1, end: 3, x: .4, y: .6, size: 120, color: 'FF0000', opacity: .7, font: 'serif', rotation: 30, background: { enabled: true, color: '000000', padding: 20 }, keyframes: { x: [{ time: 1, value: .1 }] } }

test('文字预设立即交给数据库写入器，重开后恢复，且不读写浏览器存储', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const browser = new EventTarget()
  Object.defineProperty(browser, 'localStorage', { get() { throw new Error('browser storage is forbidden') } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
  const writes = [], renderers = []
  let stored = {}, unbind = bindEditorStorage(stored, value => { stored = value; writes.push(value) })
  const mount = async scope => {
    let state, renderer
    function Harness() { state = useTextPresets(scope); return null }
    await act(async () => { renderer = create(React.createElement(Harness)) })
    renderers.push(renderer)
    return { get: () => state, renderer }
  }
  try {
    const a = await mount(namespace('a')), same = await mount(namespace('a')), other = await mount(namespace('b'))
    await act(async () => a.get().save(layer))
    assert.equal(writes.length, 1)
    assert.equal(a.get().status, '预设已保存')
    assert.equal(same.get().items.length, 1)
    assert.equal(other.get().items.length, 0)
    const saved = a.get().items[0]
    assert.equal(saved.style.text, layer.text)
    assert.equal(saved.style.start, undefined)
    assert.equal(saved.style.keyframes, undefined)
    await act(async () => a.get().rename(saved.id, '字幕样式'))
    assert.equal(writes.length, 2)
    assert.equal(same.get().items[0].name, '字幕样式')
    await act(async () => renderers.splice(0).forEach(renderer => renderer.unmount()))
    unbind(); unbind = bindEditorStorage(stored, value => { stored = value; writes.push(value) })
    const reopened = await mount(namespace('a'))
    assert.equal(reopened.get().items[0].name, '字幕样式')
    await act(async () => reopened.get().remove(saved.id))
    assert.equal(writes.length, 3)
    assert.deepEqual(JSON.parse(Object.values(stored)[0]), [])
  } finally {
    await act(async () => renderers.splice(0).forEach(renderer => renderer.unmount()))
    unbind()
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('已有大量文字预设不会被截断，非法样式不会写入数据库', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  const { start, end, keyframes, ...style } = layer
  const key = `media-video-text-presets:v1:${namespace('a')}`
  const writes = []
  const unbind = bindEditorStorage({ [key]: JSON.stringify(Array.from({ length: 101 }, (_, i) => ({ id: String(i), name: `预设 ${i}`, style }))) }, value => writes.push(value))
  let state, renderer
  function Harness() { state = useTextPresets(namespace('a')); return null }
  try {
    await act(async () => { renderer = create(React.createElement(Harness)) })
    assert.equal(state.items.length, 101)
    await act(async () => state.save({ ...layer, color: 'bad' }))
    assert.equal(writes.length, 0)
    assert.match(state.status, /请检查/)
    await act(async () => state.save(layer))
    assert.equal(state.items.length, 102)
    assert.equal(JSON.parse(writes[0][key]).length, 102)
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    unbind()
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
