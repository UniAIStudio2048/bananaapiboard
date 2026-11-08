import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { create, act } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const compiled = await build({
  entryPoints: [new URL('./SourcePicker.tsx', import.meta.url).pathname], bundle: true,
  write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'],
  plugins: [{ name: 'preview-stubs', setup(build) {
    build.onResolve({ filter: /^\.\/(SourceThumbnail|EditorPanel)$/ }, args => ({ path: args.path, namespace: 'preview-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'preview-stub' }, () => ({ contents: 'export const SourceThumbnail=()=>null; export const EditorPanelHeader=()=>null' }))
  } }]
})
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)

test('素材添加、分页、切换文件夹和历史详情失败均显示提示', async () => {
  const errors = []
  const fail = async () => { throw new Error('network failure') }
  const snapshot = {
    folderStatus: 'ready', folderScope: 'personal', folders: [{ uuid: 'folder', name: '个人资产' }],
    assets: { status: 'ready', filter: 'all', items: [], page: 2, page_size: 30, total: 100 },
    history: { status: 'ready', filter: 'all', items: [{ task_uuid: 'job', modality: 'video', status: 'succeeded', created_at: '2026-11-03' }], page: 2, page_size: 30, total: 100 },
    tasks: []
  }
  const library = {
    subscribe: () => () => {}, getSnapshot: () => snapshot,
    loadFolders: fail, loadAssetPage: fail, openFolder: fail,
    loadHistoryPage: fail, loadHistoryTask: fail
  }
  let renderer
  await act(async () => { renderer = create(React.createElement(module.exports.SourcePicker, {
    kinds: ['video', 'image', 'audio'], library,
    sources: { video: [{ resource: 'video', name: '测试视频' }], image: [], audio: [] },
    disabled: () => false, onAdd: fail, onError: message => errors.push(message), onDragStart() {}, onDragEnd() {}
  })) })
  const click = async (label, assertFailure = false) => {
    const before = errors.length
    const button = renderer.root.findAllByType('button').find(node => node.props['aria-label'] === label || node.children.join('') === label)
    assert.ok(button, label)
    await act(async () => { button.props.onClick(); await new Promise(resolve => setImmediate(resolve)) })
    if (assertFailure) assert.ok(errors.length > before, `${label}失败应显示提示`)
  }
  try {
    await click('添加测试视频到时间线', true)
    await click('我的资产')
    for (const label of ['团队', '个人资产', '上一页', '下一页']) await click(label, true)
    await click('历史记录')
    const historyButton = renderer.root.findAllByType('button').find(node => node.children.join('').startsWith('生成记录'))
    const before = errors.length
    await act(async () => { historyButton.props.onClick(); await new Promise(resolve => setImmediate(resolve)) })
    assert.ok(errors.length > before, '历史详情失败应显示提示')
    await click('上一页', true); await click('下一页', true)
    assert.ok(errors.every(message => /失败/.test(message)))
  } finally { await act(async () => renderer.unmount()) }
})
