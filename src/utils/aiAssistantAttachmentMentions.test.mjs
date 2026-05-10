import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bindAssistantAttachmentMention,
  buildAssistantMentionItems,
  ensureAssistantAttachmentKey,
  resolveAssistantAttachmentsForSend,
  syncAssistantAttachmentMentions
} from './aiAssistantAttachmentMentions.js'

test('generates stable keys for local files and direct urls', () => {
  const local = ensureAssistantAttachmentKey({ type: 'image', name: 'a.png', file: { name: 'a.png', size: 12 } }, 'local-1')
  const direct = ensureAssistantAttachmentKey({ type: 'image', url: 'https://cdn.test/a.png', name: 'a.png' })

  assert.equal(local.key, 'local:local-1')
  assert.equal(direct.key, 'url:image:https://cdn.test/a.png')
})

test('builds ordered labels by type while preserving original attachment keys', () => {
  const attachments = [
    { key: 'k-img-a', type: 'image', url: 'a.png', name: 'a.png' },
    { key: 'k-video', type: 'video', url: 'v.mp4', name: 'v.mp4' },
    { key: 'k-img-b', type: 'image', url: 'b.png', name: 'b.png' },
    { key: 'k-file', type: 'file', name: 'notes.pdf' }
  ]

  const items = buildAssistantMentionItems(attachments)

  assert.deepEqual(items.map(item => [item.key, item.label]), [
    ['k-img-a', '图片1'],
    ['k-video', '视频1'],
    ['k-img-b', '图片2'],
    ['k-file', '文件1']
  ])
})

test('binds selected mention item to the current text', () => {
  const item = { key: 'k-img-a', type: 'image', label: '图片1' }
  const result = bindAssistantAttachmentMention({
    text: '参考 @ 做图',
    start: 3,
    queryLength: 0,
    item,
    bindings: {}
  })

  assert.equal(result.text, '参考 @图片1 做图')
  assert.deepEqual(result.bindings, {
    'k-img-a': { type: 'image', label: '图片1' }
  })
  assert.equal(result.cursor, 7)
})

test('renames bound mentions after reorder while preserving keys', () => {
  const attachments = [
    { key: 'k-img-b', type: 'image', url: 'b.png' },
    { key: 'k-img-a', type: 'image', url: 'a.png' }
  ]
  const result = syncAssistantAttachmentMentions('先看@图片1再看@图片2', {
    'k-img-a': { type: 'image', label: '图片1' },
    'k-img-b': { type: 'image', label: '图片2' }
  }, attachments)

  assert.equal(result.text, '先看@图片2再看@图片1')
  assert.deepEqual(result.bindings, {
    'k-img-a': { type: 'image', label: '图片2' },
    'k-img-b': { type: 'image', label: '图片1' }
  })
})

test('removes deleted bound mentions', () => {
  const result = syncAssistantAttachmentMentions('参考@图片1继续', {
    'k-img-a': { type: 'image', label: '图片1' }
  }, [])

  assert.equal(result.text, '参考继续')
  assert.deepEqual(result.bindings, {})
})

test('resolves only referenced attachments when bindings exist', () => {
  const attachments = [
    { key: 'k-img-a', type: 'image', url: 'a.png' },
    { key: 'k-img-b', type: 'image', url: 'b.png' }
  ]

  const result = resolveAssistantAttachmentsForSend({
    text: '只看@图片2',
    bindings: { 'k-img-b': { type: 'image', label: '图片2' } },
    attachments
  })

  assert.deepEqual(result.map(item => item.key), ['k-img-b'])
})

test('sends all attachments when no mentions are bound', () => {
  const attachments = [
    { key: 'k-img-a', type: 'image', url: 'a.png' },
    { key: 'k-img-b', type: 'image', url: 'b.png' }
  ]

  const result = resolveAssistantAttachmentsForSend({
    text: '帮我分析这些附件',
    bindings: {},
    attachments
  })

  assert.deepEqual(result.map(item => item.key), ['k-img-a', 'k-img-b'])
})

test('resolves manually typed unbound labels by current order', () => {
  const attachments = [
    { key: 'k-img-a', type: 'image', url: 'a.png' },
    { key: 'k-img-b', type: 'image', url: 'b.png' }
  ]

  const result = resolveAssistantAttachmentsForSend({
    text: '只看@图片2',
    bindings: {},
    attachments
  })

  assert.deepEqual(result.map(item => item.key), ['k-img-b'])
})
