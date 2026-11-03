import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { create, act } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const compiled = await build({ entryPoints: [new URL('./ui.tsx', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'] })
const module = { exports: {} }, require = createRequire(import.meta.url)
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports)

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
