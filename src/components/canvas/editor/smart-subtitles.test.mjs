import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { create, act } from 'react-test-renderer'
import { bindEditorStorage, editorStorage } from './storage.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const compiled = await build({ entryPoints: [new URL('./smart-subtitles.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], plugins: [{ name: 'shared-storage', setup(plugin) { plugin.onResolve({ filter: /^\.\/storage$/ }, () => ({ path: 'editor-test-storage', external: true })) } }] })
const module = { exports: {} }, require = createRequire(import.meta.url)
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(name => name === 'editor-test-storage' ? { editorStorage } : require(name), module, module.exports)
const { useSmartSubtitles, subtitleTextLayers } = module.exports
const id = '00000000-0000-4000-8000-000000000001'
const target = { resource: '/video.mp4', media_type: 'video', source_start: 0, source_end: 11, timeline_start: 0, rate: 1, name: '片段 1' }
const quote = { uuid: id, operation: 'subtitle', state: 'quoted', peas: 2, seconds: 11, created_at: '2026-11-03T00:00:00Z' }
const key = 'subtitle-test'
async function mount(api, onSegments = () => '已添加字幕') {
  let state, root
  function Harness() { state = useSmartSubtitles({ api, project: 'project', storageKey: key, onSegments }); return null }
  await act(async () => { root = create(React.createElement(Harness)) })
  return { get state() { return state }, async dispose() { await act(async () => root.unmount()) } }
}

test('提交响应丢失前任务编号已保存，重新打开恢复原任务并只应用一次结果', async () => {
  let persisted = {}, submissions = 0, applied = 0
  const unbind = bindEditorStorage({}, value => { persisted = value })
  const api = { quote: async () => quote, submit: async () => { submissions++; assert.equal(JSON.parse(persisted[key]).job, id); throw new Error('response lost') }, get: async () => ({ ...quote, state: 'succeeded' }), subtitles: async () => [{ start: 0, end: 1, text: '你好' }] }
  let editor
  try {
    editor = await mount(api)
    await act(async () => editor.state.start(target))
    await act(async () => editor.state.confirm())
    assert.equal(JSON.parse(persisted[key]).job, id)
    await editor.dispose()
    editor = await mount(api, () => { applied++; return '已添加' })
    assert.equal(applied, 1)
    assert.equal(submissions, 1)
    assert.equal(persisted[key], undefined)
  } finally { await editor?.dispose(); unbind() }
})

test('任务恢复与读取结果的短暂失败自动重试，不重新报价或扣费', async () => {
  const unbind = bindEditorStorage({ [key]: JSON.stringify({ job: id, target }) }, () => {})
  let lookups = 0, results = 0, applied = 0, editor
  const api = { get: async () => { if (++lookups === 1) throw new Error('temporary'); return { ...quote, state: 'succeeded' } }, subtitles: async () => { if (++results === 1) throw new Error('temporary'); return [{ start: 0, end: 1, text: '恢复' }] } }
  try {
    editor = await mount(api, () => { applied++; return '已添加' })
    assert.equal(editor.state.active, true)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)) })
    assert.equal(lookups, 2)
    assert.equal(results, 2)
    assert.equal(applied, 1)
    assert.equal(editorStorage.getItem(key), null)
  } finally { await editor?.dispose(); unbind() }
})

test('数据库未保存任务编号时不提交付费任务；字幕与恢复标记同一次写入', async () => {
  let submissions = 0, writes = [], editor
  const unbind = bindEditorStorage({}, value => writes.push(value), async () => { throw new Error('数据库离线') })
  const api = { quote: async () => quote, submit: async () => { submissions++; return { ...quote, state: 'queued' } } }
  try {
    editor = await mount(api)
    await act(async () => editor.state.start(target))
    await act(async () => editor.state.confirm())
    assert.equal(submissions, 0)
    assert.equal(editor.state.job.state, 'quoted')
  } finally { await editor?.dispose(); unbind() }
  writes = []
  const restore = bindEditorStorage({ [key]: JSON.stringify({ job: id, target }) }, value => writes.push(value))
  try {
    editor = await mount({ get: async () => ({ ...quote, state: 'succeeded' }), subtitles: async () => [{ start: 0, end: 1, text: '你好' }] }, () => { editorStorage.setItem('draft', '已添加字幕'); return '已添加' })
    assert.equal(writes.length, 1)
    assert.equal(writes[0].draft, '已添加字幕')
    assert.equal(writes[0][key], undefined)
  } finally { await editor?.dispose(); restore() }
})

test('识别期间文字轨满额时保留完整付费结果，腾出空间后应用全部字幕', async () => {
  const unbind = bindEditorStorage({ [key]: JSON.stringify({ job: id, target }) }, () => {})
  const segments = [{ start: 0, end: 1, text: '第一句' }, { start: 1, end: 2, text: '第二句' }]
  let texts = Array.from({ length: 299 }, () => ({})), editor, applied
  const api = { get: async () => ({ ...quote, state: 'succeeded' }), subtitles: async () => segments }
  try {
    editor = await mount(api, () => {
      applied = subtitleTextLayers({ clips: [], videoLayers: [], imageLayers: [], effectLayers: [], audioLayers: [], textLayers: texts }, target, segments, `subtitle-${id}`, 30)
      return '已添加全部字幕'
    })
    assert.equal(applied, undefined)
    assert.ok(editorStorage.getItem(key))
    assert.match(editor.state.error, /文字元素.*300.*保留/)
    texts = []
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)) })
    assert.equal(applied.length, 2)
    assert.equal(editorStorage.getItem(key), null)
  } finally { await editor?.dispose(); unbind() }
})
