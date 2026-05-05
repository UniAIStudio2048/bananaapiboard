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
