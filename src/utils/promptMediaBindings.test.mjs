import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bindMediaMention,
  buildMediaMentionItems,
  syncPromptMediaMentions
} from './promptMediaBindings.js'

test('removes prompt mentions when their bound media is removed', () => {
  const items = buildMediaMentionItems({ images: ['a.png', 'b.png'] })
  const bindings = bindMediaMention({}, items[0])

  const result = syncPromptMediaMentions('让@图片1动起来', bindings, buildMediaMentionItems({ images: ['b.png'] }))

  assert.equal(result.text, '让动起来')
  assert.deepEqual(result.bindings, {})
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
