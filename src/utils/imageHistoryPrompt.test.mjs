import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeImageHistoryItem } from './imageHistoryPrompt.js'

test('normalizes canvas preset history to show only user prompt', () => {
  const item = normalizeImageHistoryItem({
    id: 'img_1',
    prompt: 'a quiet lake, internal preset prompt with private style rules',
    user_prompt: 'a quiet lake'
  })

  assert.equal(item.prompt, 'a quiet lake')
  assert.equal(item.fullPrompt, 'a quiet lake, internal preset prompt with private style rules')
  assert.equal(item.user_prompt, 'a quiet lake')
})

test('falls back to prompt when user prompt is missing', () => {
  const item = normalizeImageHistoryItem({
    id: 'img_2',
    prompt: 'standalone prompt'
  })

  assert.equal(item.prompt, 'standalone prompt')
  assert.equal(item.fullPrompt, 'standalone prompt')
})
