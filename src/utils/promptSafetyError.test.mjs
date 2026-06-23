import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPromptSafetyDialog,
  createPromptSafetyError,
  isPromptSafetyBlockedError
} from './promptSafetyError.js'

test('createPromptSafetyError preserves safety payload', () => {
  const err = createPromptSafetyError({
    error: 'prompt_safety_blocked',
    message: 'blocked',
    safety: {
      level: 'unsafe',
      categories: ['sexual'],
      reason: 'matched',
      blockedContent: 'Contains sexual content.'
    }
  })

  assert.equal(err.code, 'prompt_safety_blocked')
  assert.equal(err.message, 'blocked')
  assert.equal(err.safety.level, 'unsafe')
  assert.deepEqual(err.safety.categories, ['sexual'])
  assert.equal(err.safety.blockedContent, 'Contains sexual content.')
  assert.equal(err.payload.error, 'prompt_safety_blocked')
})

test('isPromptSafetyBlockedError detects structured errors', () => {
  assert.equal(isPromptSafetyBlockedError({ code: 'prompt_safety_blocked' }), true)
  assert.equal(isPromptSafetyBlockedError({ error: 'prompt_safety_blocked' }), true)
  assert.equal(isPromptSafetyBlockedError(new Error('x')), false)
})

test('buildPromptSafetyDialog returns Chinese copy and details', () => {
  const dialog = buildPromptSafetyDialog({
    safety: {
      level: 'unsafe',
      categories: ['Violent', 'Sexual Content or Sexual Acts'],
      reason: 'Safety: Unsafe\nCategories: violence, sexual',
      blockedContent: '包含暴力或性相关描述'
    }
  }, { language: 'zh-CN' })

  assert.equal(dialog.title, '安全审核未通过')
  assert.match(dialog.message, /请修改提示词/)
  assert.match(dialog.detail, /需要修改的内容：包含暴力或性相关描述/)
  assert.match(dialog.detail, /暴力/)
  assert.match(dialog.detail, /性内容或性行为/)
  assert.doesNotMatch(dialog.detail, /Safety:/)
})

test('buildPromptSafetyDialog localizes generic category fallback in Chinese', () => {
  const dialog = buildPromptSafetyDialog({
    safety: {
      level: 'unsafe',
      categories: ['Violent'],
      reason: 'Safety: Unsafe\nCategories: Violent',
      blockedContent: 'Contains content related to Violent.'
    }
  }, { language: 'zh-CN' })

  assert.match(dialog.detail, /需要修改的内容：包含暴力相关内容/)
  assert.match(dialog.detail, /风险类别：暴力/)
  assert.doesNotMatch(dialog.detail, /Contains content related/)
})

test('buildPromptSafetyDialog supports English copy', () => {
  const dialog = buildPromptSafetyDialog({
    safety: {
      level: 'unsafe',
      categories: ['Sexual Content or Sexual Acts'],
      reason: 'Safety: Unsafe\nCategories: Sexual Content or Sexual Acts'
    }
  }, { language: 'en' })

  assert.equal(dialog.title, 'Safety Review Failed')
  assert.match(dialog.message, /Please edit your prompt/)
  assert.match(dialog.detail, /What to edit:/)
  assert.match(dialog.detail, /Sexual Content or Sexual Acts/)
  assert.equal(dialog.confirmText, 'OK')
  assert.doesNotMatch(dialog.detail, /Safety:/)
})
