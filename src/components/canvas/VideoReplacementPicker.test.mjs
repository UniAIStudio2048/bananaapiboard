import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

function getFunction(source, name, context) {
  const ast = parse(source, { sourceType: 'module' })
  const fn = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(fn)
  return runInNewContext(`${source.slice(fn.start, fn.end)}\n;${name}`, context)
}

test('素材选择器只提供有效视频，并保留来源、封面和时长', () => {
  const source = readFileSync(new URL('./VideoReplacementPicker.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
  const normalize = getFunction(source, 'normalizeVideoSources', {})
  const rows = normalize([
    { id: 'a', type: 'video', url: 'https://example.com/a.mp4', thumbnail_url: 'https://example.com/a.jpg', duration: 9 },
    { id: 'b', type: 'image', url: 'https://example.com/b.jpg' },
    { id: 'c', type: 'video', url: '', status: 'completed' },
    { id: 'd', type: 'video', url: 'https://example.com/d.mp4', status: 'failed' }
  ], 'history')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].source, 'history')
  assert.equal(rows[0].thumbnail_url, 'https://example.com/a.jpg')
  assert.equal(rows[0].duration, 9)
})

test('资产状态不影响可用视频的选择', () => {
  const source = readFileSync(new URL('./VideoReplacementPicker.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
  const normalize = getFunction(source, 'normalizeVideoSources', {})
  const rows = normalize([{ id: 'a', type: 'video', url: 'https://example.com/a.mp4', status: 'active' }], 'asset')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].source, 'asset')
})

test('历史视频分页复用当前列表，限制同时加载的预览数量', async () => {
  const source = readFileSync(new URL('./VideoReplacementPicker.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
  let requests = 0
  const rows = Array.from({ length: 25 }, (_, id) => ({ id, type: 'video', url: `https://example.com/${id}.mp4` }))
  const context = {
    requestId: 0, pageSize: 24, props: { spaceParams: {} }, activeSource: { value: 'history' },
    historyItems: { value: null }, items: { value: [] }, page: { value: 1 }, hasNextPage: { value: false },
    loading: { value: false }, errorMessage: { value: '' },
    getHistory: async () => { requests++; return { history: rows } },
    normalizeVideoSources: value => value
  }
  const load = getFunction(source, 'loadSource', context)
  await load(1)
  assert.equal(context.items.value.length, 24)
  assert.equal(context.hasNextPage.value, true)
  await load(2)
  assert.equal(context.items.value.length, 1)
  assert.equal(context.hasNextPage.value, false)
  assert.equal(requests, 1)
})
