import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Missing CSS rule for ${selector}`)
  return match[1]
}

test('canvas history panel uses aspect ratios instead of fixed card heights', () => {
  assert.match(source, /getHistoryCardAspectStyle/)
  assert.match(source, /normalizeHistoryAspectRatio/)
  assert.match(source, /columnItems/)
  assert.doesNotMatch(source, /height:\s*172px/)
  assert.doesNotMatch(source, /:style="\{ height: totalHeight \+ 'px' \}"/)
})

test('canvas history media thumbnails fill waterfall cards without letterboxing', () => {
  assert.match(cssRule('.card-image'), /object-fit:\s*cover/)
  assert.match(cssRule('.history-card :deep(.card-image)'), /object-fit:\s*cover/)
  assert.match(cssRule('.card-video-preview'), /object-fit:\s*cover/)
  assert.match(cssRule('.history-card.portrait-video .card-image'), /object-fit:\s*cover/)
})
