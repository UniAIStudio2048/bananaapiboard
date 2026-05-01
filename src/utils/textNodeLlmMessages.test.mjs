import test from 'node:test'
import assert from 'node:assert/strict'

import { buildTextNodeLlmMessages } from './textNodeLlmMessages.js'

test('uses node body text as the user prompt when reference media is present and the input is empty', () => {
  const messages = buildTextNodeLlmMessages({
    inheritedText: '',
    currentNodeText: '<p>使用@图片1的藏品花瓶，做一个30秒的视频宣传脚本</p>',
    llmInputText: '',
    hasReferenceMedia: true
  })

  assert.deepEqual(messages, [
    {
      role: 'user',
      content: '使用@图片1的藏品花瓶，做一个30秒的视频宣传脚本'
    }
  ])
})

test('keeps existing context behavior when an explicit input prompt is provided', () => {
  const messages = buildTextNodeLlmMessages({
    inheritedText: '上游资料',
    currentNodeText: '<strong>上一轮回复</strong>',
    llmInputText: '基于参考图继续优化',
    hasReferenceMedia: true
  })

  assert.deepEqual(messages, [
    { role: 'assistant', content: '上游资料' },
    { role: 'assistant', content: '上一轮回复' },
    { role: 'user', content: '基于参考图继续优化' }
  ])
})
