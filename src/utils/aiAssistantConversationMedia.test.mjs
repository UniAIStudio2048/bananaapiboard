import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildConversationMediaFromMessages,
  buildConversationMentionCandidates
} from './aiAssistantConversationMedia.js'

test('extracts user-uploaded and AI-generated media from messages in order, dedup by url', () => {
  const media = buildConversationMediaFromMessages([
    { role: 'user', attachments: [{ type: 'image', url: 'https://cdn.test/a.png', name: 'a.png' }, { type: 'file', url: 'https://cdn.test/x.pdf', name: 'x.pdf' }] },
    { role: 'assistant', attachments: [{ type: 'video', url: 'https://cdn.test/gen-v.mp4', name: 'gen-v.mp4' }] },
    { role: 'assistant', attachments: [{ type: 'image', url: 'https://cdn.test/a.png', name: 'dup' }] }, // 重复 url → 跳过
    { role: 'assistant', content: '无附件' },
  ])

  assert.deepEqual(media.map(item => [item.type, item.url]), [
    ['image', 'https://cdn.test/a.png'],
    ['video', 'https://cdn.test/gen-v.mp4'],
  ])
})

test('skips media without url and non-media attachments', () => {
  const media = buildConversationMediaFromMessages([
    { role: 'user', attachments: [{ type: 'image', name: 'no-url' }, { type: 'audio', url: 'https://cdn.test/a.mp3' }] },
    { role: 'assistant', attachments: [{ type: 'file', url: 'https://cdn.test/x.pdf' }] },
  ])

  assert.deepEqual(media.map(item => item.type), ['audio'])
})

test('candidates merge current attachments with conversation media, dedup by url', () => {
  const candidates = buildConversationMentionCandidates({
    currentAttachments: [
      { key: 'k-a', type: 'image', url: 'a.png', name: 'a.png' },
      { key: 'k-v', type: 'video', url: 'v.mp4', name: 'v.mp4' },
    ],
    conversationMedia: [
      { type: 'image', url: 'a.png', name: 'a.png' }, // 与当前附件同 url → 跳过
      { type: 'image', url: 'gen-1.png', name: 'gen-1.png' }, // AI 生成图
      { type: 'video', url: 'gen-v.mp4', name: 'gen-v.mp4' }, // AI 生成视频
      { type: 'audio', url: 'gen-a.mp3', name: 'gen-a.mp3' },
      { type: 'file', url: 'x.pdf', name: 'x.pdf' }, // 历史文件不纳入
      { type: 'image', url: 'gen-1.png', name: 'dup' }, // 历史内重复 → 跳过
    ],
  })

  assert.deepEqual(candidates.map(item => [item.key, item.label, item.type]), [
    ['k-a', '图片1', 'image'],
    ['k-v', '视频1', 'video'],
    ['url:image:gen-1.png', '图片2', 'image'],
    ['url:video:gen-v.mp4', '视频2', 'video'],
    ['url:audio:gen-a.mp3', '音频1', 'audio'],
  ])
})

test('conversation media without url is skipped from mention candidates', () => {
  const candidates = buildConversationMentionCandidates({
    currentAttachments: [],
    conversationMedia: [
      { type: 'image', name: 'no-url.png' }, // 无 url → 跳过
      { type: 'video', url: 'v.mp4', name: 'v.mp4' },
    ],
  })

  assert.deepEqual(candidates.map(item => [item.key, item.label]), [
    ['url:video:v.mp4', '视频1'],
  ])
})

test('current attachments keep their keys so bindings stay removable', () => {
  const candidates = buildConversationMentionCandidates({
    currentAttachments: [{ key: 'k-a', type: 'image', url: 'a.png' }],
    conversationMedia: [],
  })

  assert.equal(candidates[0].key, 'k-a')
  assert.equal(candidates[0].attachment?.key, 'k-a')
})

test('extracts media from toolEvents (image-gen/video-gen/task-status results) like the message renderer', () => {
  const media = buildConversationMediaFromMessages([
    { role: 'assistant', attachments: [], toolEvents: [
      { tool: 'task-status', status: 'done', result: { content: [{ type: 'text', text: JSON.stringify({ status: 200, result: { task: { task_id: 't1', status: 'completed', result_urls: ['https://cdn.test/gen-1.png'] } } }) }] } },
      { tool: 'video-gen', status: 'done', result: { content: [{ type: 'text', text: JSON.stringify({ status: 200, result: { task: { result_urls: ['https://cdn.test/gen-v.mp4'] } } }) }] } },
    ] },
  ])

  assert.deepEqual(media.map(item => [item.type, item.url]), [
    ['image', 'https://cdn.test/gen-1.png'],
    ['video', 'https://cdn.test/gen-v.mp4'],
  ])
})

test('dedups media across attachments and toolEvents and skips non-http urls', () => {
  const media = buildConversationMediaFromMessages([
    { role: 'user', attachments: [{ type: 'image', url: 'https://cdn.test/user.png' }] },
    { role: 'assistant', attachments: [], toolEvents: [
      { tool: 'task-status', status: 'done', result: { content: [{ type: 'text', text: JSON.stringify({ result: { result_urls: ['https://cdn.test/user.png', 'relative/x.png', 'https://cdn.test/new.png'] } }) }] } },
    ] },
  ])

  assert.deepEqual(media.map(item => item.url), ['https://cdn.test/user.png', 'https://cdn.test/new.png'])
})

test('extracts media from tool text that mixes JSON with mandatory_next_action suffix', () => {
  // MCP task-status 返回 text = JSON.stringify(...) + "<mandatory_next_action>..." 提示后缀
  const jsonPart = JSON.stringify({ status: 200, result: { task: { status: 'completed', result_urls: ['https://cdn.test/gen-1.png'] } } })
  const text = jsonPart + '\n\n<mandatory_next_action>任务已完成，请把结果地址返回给用户</mandatory_next_action>'
  const media = buildConversationMediaFromMessages([
    { role: 'assistant', toolEvents: [{ tool: 'task-status', status: 'done', result: { content: [{ type: 'text', text }] } }] },
  ])

  assert.deepEqual(media.map(item => [item.type, item.url]), [
    ['image', 'https://cdn.test/gen-1.png'],
  ])
})
