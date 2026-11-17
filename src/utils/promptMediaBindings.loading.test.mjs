import test from 'node:test'
import assert from 'node:assert/strict'
import * as mentions from './promptMediaBindings.js'

const item = (id, index, url = `${id}.png`) => ({
  type: 'image', index, label: `图片${index}`, url, key: `image:node:${id}:${index}`
})
const original = [item('a', 1), item('b', 2)]
const text = 'A @图片1 说第一句；B @图片2 说第二句'
const bind = items => items.reduce((bindings, media) => mentions.bindMediaMention(bindings, media), {})

test('empty references during loading or reopening preserve text and bindings and recover afterwards', () => {
  const bindings = bind(original)
  const loading = mentions.syncPromptMediaMentions(text, bindings, [])
  assert.deepEqual(loading, { text, bindings })
  assert.deepEqual(mentions.syncPromptMediaMentions(loading.text, loading.bindings, original), { text, bindings })
})

test('partial loading never merges two character labels into one', () => {
  const bindings = bind(original)
  const partial = mentions.syncPromptMediaMentions(text, bindings, [item('b', 1)])
  assert.deepEqual(partial, { text, bindings })
  assert.equal(mentions.syncPromptMediaMentions(partial.text, partial.bindings, original).text, text)
})

test('unbound historical mentions are not bound by temporary indexes while upstream data loads', () => {
  assert.deepEqual(mentions.syncPromptMediaMentions('B @图片1', {}, [item('a', 1)], { mediaReady: false }), {
    text: 'B @图片1', bindings: {}
  })
})

test('node-backed references follow their source nodes after reordering, including legacy bindings', () => {
  const legacy = {
    'image:node:a:1': { type: 'image', label: '图片1' },
    'image:node:b:2': { type: 'image', label: '图片2' }
  }
  const result = mentions.syncPromptMediaMentions(text, legacy, [item('b', 1), item('a', 2)])
  assert.equal(result.text, 'A @图片2 说第一句；B @图片1 说第二句')
  assert.equal(result.bindings['image:node:a:2'].label, '图片2')
  assert.equal(mentions.syncPromptMediaMentions(result.text, result.bindings, original).text, text)
})

test('multiple images from one source follow their own URLs when reordered', () => {
  const before = [item('source', 1, 'a.png'), item('source', 2, 'b.png')]
  const after = [item('source', 1, 'b.png'), item('source', 2, 'a.png')]
  assert.equal(mentions.syncPromptMediaMentions(text, bind(before), after).text, 'A @图片2 说第一句；B @图片1 说第二句')
})

test('explicit removal deletes only the removed reference and renumbers the surviving character', () => {
  const result = mentions.syncPromptMediaMentions(text, bind(original), [item('b', 1)], { previousMediaItems: original })
  assert.equal(result.text, 'A  说第一句；B @图片1 说第二句')
  assert.deepEqual(Object.keys(result.bindings), ['image:node:b:1'])
})

test('explicit removal also handles old text with no stored bindings', () => {
  const result = mentions.syncPromptMediaMentions(text, {}, [item('b', 1)], { previousMediaItems: original })
  assert.equal(result.text, 'A  说第一句；B @图片1 说第二句')
})

test('readiness requires the target and every directly connected source to finish loading', () => {
  const nodes = [{ id: 'target', data: {} }, { id: 'a', data: { _mediaLoading: true } }, { id: 'b', data: {} }]
  const edges = [{ source: 'a', target: 'target' }, { source: 'b', target: 'target' }]
  assert.equal(mentions.isPromptMediaReady('target', nodes, edges), false)
  nodes[1].data = {}
  assert.equal(mentions.isPromptMediaReady('target', nodes, edges), true)
  nodes[2].data._shellLoading = true
  assert.equal(mentions.isPromptMediaReady('target', nodes, edges), false)
  nodes.pop()
  assert.equal(mentions.isPromptMediaReady('target', nodes, edges), false)
  assert.equal(mentions.isPromptMediaReady('target', nodes, []), true)
  nodes[0].data._shellLoading = true
  assert.equal(mentions.isPromptMediaReady('target', nodes, []), false)
})


test('partial results from a multi-image source never merge two character bindings', () => {
  const before = [item('source', 1, 'a.png'), item('source', 2, 'b.png')]
  const bindings = bind(before)
  assert.deepEqual(mentions.syncPromptMediaMentions(text, bindings, [item('source', 1, 'b.png')]), { text, bindings })
})
