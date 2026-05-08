import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(__dirname, 'HistoryPanel.vue'), 'utf8')

assert.match(
  source,
  /async\s+function\s+copyHistoryPrompt\s*\(\s*e\s*,\s*item\s*\)/,
  'HistoryPanel should expose a copyHistoryPrompt handler for history card prompts'
)

assert.match(
  source,
  /navigator\.clipboard\.writeText\(\s*prompt\s*\)/,
  'copyHistoryPrompt should copy the complete prompt text through the clipboard API'
)

assert.match(
  source,
  /class="overlay-prompt-full"[\s\S]*\{\{\s*item\.prompt\s*\}\}/,
  'History card hover overlay should render the full prompt without truncating it in the template'
)

assert.match(
  source,
  /class="overlay-copy-prompt"[\s\S]*@click\.stop="copyHistoryPrompt\(\$event,\s*item\)"/,
  'History card hover overlay should include a one-click prompt copy button'
)

const cardActionsRule = source.match(/\.history-card-actions\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const actionRevealRule = source.match(/\.history-card:(?:hover|focus-within)\s+\.history-card-actions,\n\.history-card:(?:hover|focus-within)\s+\.history-card-actions\s*\{([\s\S]*?)\n\}/)?.[1] || ''

assert.match(
  cardActionsRule,
  /opacity\s*:\s*0/,
  'History card copy and delete actions should be hidden by default'
)

assert.match(
  cardActionsRule,
  /pointer-events\s*:\s*none/,
  'Hidden history card actions should not intercept card hover or clicks'
)

assert.match(
  actionRevealRule,
  /opacity\s*:\s*1/,
  'History card copy and delete actions should appear when the media card is hovered or focused'
)

assert.match(
  actionRevealRule,
  /pointer-events\s*:\s*auto/,
  'Visible history card actions should be clickable while the media card is hovered or focused'
)
