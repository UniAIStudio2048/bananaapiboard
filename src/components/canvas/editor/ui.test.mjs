import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import React from 'react'
import { create, act } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const compiled = await build({ entryPoints: [new URL('./ui.tsx', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'] })
const module = { exports: {} }, require = createRequire(import.meta.url)
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports)

test('剪辑器及弹出菜单覆盖画布控件，导出和封面仍保持各自层级', async () => {
  const legacyModal = readFileSync(new URL('../VideoToolModal.vue', import.meta.url), 'utf8')
  const minimumLayer = Number(legacyModal.match(/\.video-tool-modal\s*\{[^}]*z-index:\s*(\d+)/s)[1])
  const isolated = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(name => name === 'react-dom' ? { createPortal: child => child } : require(name), isolated, isolated.exports)
  const previousDocument = globalThis.document
  globalThis.document = { body: {} }
  let modal, popup
  try {
    await act(async () => { modal = create(React.createElement(isolated.exports.MediaModal, { open: true }, 'editor')) })
    const editorLayer = modal.root.findAllByType('div').find(node => node.props.style?.zIndex)?.props.style.zIndex
    assert.ok(editorLayer >= minimumLayer, '剪辑器必须覆盖现有画布控件')
    await act(async () => { popup = create(React.createElement(isolated.exports.MediaPopover, { open: true, content: 'menu' }, React.createElement('button', null, 'open'))) })
    const popover = popup.root.findByProps({ 'data-editor-popover': true })
    const popupLayer = Number(popover.props.className.match(/z-\[(\d+)\]/)[1])
    const editor = readFileSync(new URL('./VideoToolEditor.tsx', import.meta.url), 'utf8')
    const cover = readFileSync(new URL('./CoverSelector.tsx', import.meta.url), 'utf8')
    const exportLayer = Number(editor.match(/zIndex=\{(\d+)\}/)[1])
    const coverLayer = Number(cover.match(/zIndex=\{(\d+)\}/)[1])
    assert.ok(editorLayer < exportLayer && exportLayer < popupLayer && popupLayer < coverLayer)
    const bridge = readFileSync(new URL('../FullVideoEditor.vue', import.meta.url), 'utf8')
    assert.ok(Number(bridge.match(/\.editor-save-status\s*\{[^}]*z-index:\s*(\d+)/s)[1]) > coverLayer)
  } finally {
    await act(async () => { modal?.unmount(); popup?.unmount() })
    globalThis.document = previousDocument
  }
})

test('轨道上下文菜单不改变整行布局，左键选择不打开菜单，右键才触发', async () => {
  const opened = [], clicks = []
  let root
  await act(async () => { root = create(React.createElement(module.exports.MediaPopover, { trigger: 'contextMenu', open: false, onOpenChange: value => opened.push(value), content: 'menu' }, React.createElement('div', { onClick: () => clicks.push('selected') }, 'track'))) })
  try {
    const track = root.root.findByType('div')
    await act(async () => track.props.onClick?.({ stopPropagation() {}, target: {}, currentTarget: {} }))
    assert.deepEqual(clicks, ['selected'])
    assert.deepEqual(opened, [])
    assert.ok(!root.root.findAllByType('span').some(node => String(node.props.className).includes('inline-flex')))
    await act(async () => track.props.onContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 100, clientY: 200 }))
    assert.deepEqual(opened, [true])
  } finally { await act(async () => root.unmount()) }
})
