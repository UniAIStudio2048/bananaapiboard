import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

const typeFilterRule = source.match(/\.type-filter\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const previewPromptRule = source.match(/\.preview-prompt\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const previewDetailItemRule = source.match(/\.preview-detail-item\s*\{([\s\S]*?)\n\}/)?.[1] || ''

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

assert.match(
  source,
  /import \{ buildHistoryMediaDetails, enrichHistoryMediaDetails \} from '@\/utils\/historyMediaDetails'/,
  'Preview metadata should use the shared history media details formatter'
)

assert.match(
  source,
  /enrichHistoryMediaDetails\(item, \{ resolveUrl: getMediaUrl \}\)/,
  'Preview should enrich media metadata when opened'
)

assert.match(
  source,
  /v-for="detail in getHistoryPreviewDetails\(previewItem\)"/,
  'Preview metadata should render every generated detail item'
)

assert.match(
  source,
  /\.preview-detail-grid\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*user-select:\s*text;/,
  'Preview metadata should be compact plain selectable text'
)

assert.match(
  source,
  /\.preview-detail-value\s*\{[\s\S]*word-break:\s*break-all;/,
  'Preview metadata values should wrap instead of truncating IDs'
)

assert.doesNotMatch(
  previewDetailItemRule,
  /background:\s*rgba/,
  'Preview metadata items should not render as bordered/card-like boxes'
)
