import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [assistantSource, marketSource, canvasSource] = await Promise.all([
  readFile(new URL('./AIAssistantPanel.vue', import.meta.url), 'utf8'),
  readFile(new URL('./SkillsPanel.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../views/Canvas.vue', import.meta.url), 'utf8')
])

test('Skills entry and market use the canvas neutral grayscale palette', () => {
  const triggerStyles = assistantSource.match(/\.skills-market-trigger \{[\s\S]*?\.model-picker-trigger/m)?.[0] || ''
  const canvasButtonStyles = canvasSource.match(/\.canvas-skills-btn \{[\s\S]*?\.skills-burst-icon/m)?.[0] || ''

  assert.doesNotMatch(triggerStyles, /rgba\(167, 139, 250|rgba\(139, 92, 246|#c4b5fd|#ede9fe/)
  assert.doesNotMatch(marketSource, /#6d5dfc|#a5b4fc|#c4b5fd|#86efac|#f9a8d4|#7dd3fc|#fca5a5/)
  assert.doesNotMatch(canvasButtonStyles, /#fff8d6|#f6d77d|#b87a19|#f5c96a|#7b4b0b|#7a4b00/)
})
