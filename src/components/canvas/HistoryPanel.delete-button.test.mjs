import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'HistoryPanel.vue'), 'utf8')

const hoverRule = source.match(/\.history-card:hover\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const selectedRule = source.match(/\.history-card\.selected\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const cardActionsRule = source.match(/\.history-card-actions\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const deleteRule = source.match(/\.overlay-delete\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const handleDeleteBody = source.match(/function handleDelete\(e, item\) \{([\s\S]*?)\n\}/)?.[1] || ''
const cachedImageWrapperRule = source.match(/\.history-card\s+:deep\(\.cached-image-wrapper\)\s*\{([\s\S]*?)\n\}/)?.[1] || ''
const cachedImageRule = source.match(/\.history-card\s+:deep\(\.card-image\)\s*\{([\s\S]*?)\n\}/)?.[1] || ''

assert.doesNotMatch(
  hoverRule,
  /transform\s*:\s*scale\(/,
  'History cards must not grow on hover because they can cover text in adjacent waterfall columns'
)

assert.doesNotMatch(
  selectedRule,
  /transform\s*:\s*scale\(/,
  'Selected history cards must not grow because they can cover adjacent thumbnails'
)

assert.match(cardActionsRule, /position\s*:\s*absolute/, 'Card action group should be positioned inside the media card')
assert.match(cardActionsRule, /top\s*:\s*6px/, 'Card action group should sit near the top edge of the media card')
assert.match(cardActionsRule, /right\s*:\s*6px/, 'Card action group should sit near the right edge of the media card')
assert.match(deleteRule, /width\s*:\s*28px/, 'Delete button should use the unified compact action button size')
assert.match(handleDeleteBody, /showDeleteConfirm\.value\s*=\s*true/, 'Deleting a history item should open the manual confirmation modal')
assert.match(cachedImageWrapperRule, /width\s*:\s*100%/, 'CachedImage wrapper should fill the card column')
assert.match(cachedImageRule, /width\s*:\s*100%/, 'CachedImage img should use full card width through scoped CSS deep selector')
assert.match(cachedImageRule, /display\s*:\s*block/, 'CachedImage img should not leave inline gaps or intrinsic overflow')
