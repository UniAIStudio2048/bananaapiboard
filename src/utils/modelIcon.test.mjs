import test from 'node:test'
import assert from 'node:assert/strict'

import { formatModelTextIcon, isModelIconImage, parseModelIcon } from './modelIcon.js'

test('parseModelIcon recognizes Lobe avatar expressions with props', () => {
  const icon = parseModelIcon("Gemini.Avatar size={64} shape={'square'}")

  assert.equal(icon.type, 'lobe/avatar')
  assert.equal(icon.slug, 'gemini')
  assert.equal(icon.src, 'https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/gemini.webp')
  assert.equal(icon.src.includes('/light/'), false)
  assert.equal(icon.src.endsWith('.png'), false)
  assert.equal(icon.size, 64)
  assert.equal(icon.shape, 'square')
})

test('parseModelIcon recognizes Lobe avatar chained type prop', () => {
  const icon = parseModelIcon("OpenAI.Avatar.type={'platform'}")

  assert.equal(icon.type, 'lobe/avatar')
  assert.equal(icon.slug, 'openai')
  assert.equal(icon.src, 'https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/openai.webp')
  assert.equal(icon.src.includes('/light/'), false)
  assert.equal(icon.src.endsWith('.png'), false)
  assert.equal(icon.avatarType, 'platform')
})

test('parseModelIcon keeps URLs as image icons', () => {
  const icon = parseModelIcon('https://example.com/model.png')

  assert.equal(icon.type, 'image')
  assert.equal(icon.src, 'https://example.com/model.png')
  assert.equal(isModelIconImage(icon), true)
})

test('parseModelIcon keeps emoji and single characters as text icons', () => {
  assert.deepEqual(parseModelIcon('✨'), {
    type: 'text',
    text: '✨',
    title: '✨',
    raw: '✨'
  })

  assert.equal(parseModelIcon('G').text, 'G')
})

test('formatModelTextIcon falls long strings back to uppercase first character', () => {
  assert.equal(formatModelTextIcon('Gemini.Avatar size={64}'), 'G')
  assert.equal(formatModelTextIcon('openai'), 'O')
  assert.equal(formatModelTextIcon(''), '▶')
})
