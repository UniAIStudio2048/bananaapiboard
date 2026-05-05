import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

const typeFilterRule = source.match(/\.type-filter\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const previewPromptRule = source.match(/\.preview-prompt\s*\{([\s\S]*?)\n\}/)?.[1] || ''

assert.match(
  source,
  /class="history-card-actions"[\s\S]*class="overlay-copy-prompt"[\s\S]*class="overlay-delete"/,
  'History card copy/delete controls should share one top-right action group inside the media card'
)

assert.match(
  typeFilterRule,
  /flex-wrap\s*:\s*wrap/,
  'History type navigation should wrap across narrow screen ratios instead of forcing horizontal overflow'
)

assert.doesNotMatch(
  previewPromptRule,
  /max-height\s*:\s*60px/,
  'Preview prompt should not be capped to a short 60px strip'
)

assert.match(
  previewPromptRule,
  /white-space\s*:\s*pre-wrap/,
  'Preview prompt should preserve full multiline prompt text'
)
