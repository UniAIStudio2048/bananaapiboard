import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bindMediaMention,
  buildMediaMentionItems,
  resolveMediaMentionItem,
  syncPromptMediaMentions,
  escapePromptMediaMentions
} from './promptMediaBindings.js'

test('removes prompt mentions when their bound media is removed', () => {
  const items = buildMediaMentionItems({ images: ['a.png', 'b.png'] })
  const bindings = bindMediaMention({}, items[0])

  const result = syncPromptMediaMentions('让@图片1动起来', bindings, buildMediaMentionItems({ images: ['b.png'] }))

  assert.equal(result.text, '让动起来')
  assert.deepEqual(result.bindings, {})
})

test('does not treat incomplete media mention input as a removable mention', () => {
  const items = buildMediaMentionItems({ images: ['a.png'] })
  const bindings = bindMediaMention({}, items[0])

  const result = syncPromptMediaMentions('正在输入@图片', bindings, items)

  assert.equal(result.text, '正在输入@图片')
  assert.deepEqual(result.bindings, {})
})

test('normalizes media labels that already include an at sign', () => {
  const bindings = bindMediaMention({}, {
    type: 'image',
    label: '@图片1',
    url: 'a.png'
  })

  assert.deepEqual(bindings, {
    'image:a.png': { type: 'image', label: '图片1' }
  })
})

test('resolves thumbnail click payloads to full media mention items', () => {
  const items = buildMediaMentionItems({
    videos: ['v.mp4'],
    images: ['a.png'],
    audios: ['sound.mp3']
  })

  assert.deepEqual(
    resolveMediaMentionItem({ type: 'image', index: 1, label: '图片1' }, items),
    items[1]
  )
})

test('escapePromptMediaMentions adds spaces around mentions', () => {
  assert.equal(
    escapePromptMediaMentions('让@图片1的人物穿上@图片2的衣服'),
    '让 @图片1 的人物穿上 @图片2 的衣服'
  )
})

test('escapePromptMediaMentions handles bracket-wrapped mentions', () => {
  assert.equal(
    escapePromptMediaMentions('用【@视频1】做参考'),
    '用 @视频1 做参考'
  )
})

test('escapePromptMediaMentions does not double-space', () => {
  assert.equal(
    escapePromptMediaMentions('看 @图片1 然后@图片2'),
    '看 @图片1 然后 @图片2'
  )
})

test('renames bound prompt mentions after media reorder', () => {
  const items = buildMediaMentionItems({ images: ['a.png', 'b.png'] })
  let bindings = bindMediaMention({}, items[0])
  bindings = bindMediaMention(bindings, items[1])

  const reordered = buildMediaMentionItems({ images: ['b.png', 'a.png'] })
  const result = syncPromptMediaMentions('先看@图片1，再看@图片2', bindings, reordered)

  assert.equal(result.text, '先看@图片2，再看@图片1')
  assert.deepEqual(result.bindings, {
    'image:a.png': { type: 'image', label: '图片2' },
    'image:b.png': { type: 'image', label: '图片1' }
  })
})

test('keeps a mention bound when the upstream media URL changes but its stable key stays', () => {
  const original = {
    type: 'image',
    index: 1,
    label: '图片1',
    url: 'old.png',
    key: 'image:node:source-1:1'
  }
  const replaced = {
    ...original,
    url: 'new.png'
  }
  const bindings = bindMediaMention({}, original)

  const result = syncPromptMediaMentions('请参考@图片1', bindings, [replaced])

  assert.equal(result.text, '请参考@图片1')
  assert.deepEqual(result.bindings, {
    'image:node:source-1:1': { type: 'image', label: '图片1' }
  })
})

test('migrates a legacy URL binding to the stable key before a later media replacement', () => {
  const legacyBindings = {
    'image:old.png': { type: 'image', label: '图片1' }
  }
  const current = {
    type: 'image',
    index: 1,
    label: '图片1',
    url: 'old.png',
    key: 'image:node:source-1:1'
  }

  const result = syncPromptMediaMentions('请参考@图片1', legacyBindings, [current])

  assert.equal(result.text, '请参考@图片1')
  assert.deepEqual(result.bindings, {
    'image:node:source-1:1': { type: 'image', label: '图片1' }
  })
})
