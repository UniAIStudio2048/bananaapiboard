import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./CommunityHome.vue', import.meta.url), 'utf8')

assert.match(
  source,
  /columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 \[column-fill:_balance\]/,
  'the mixed-work masonry layout must use the standard balancing mode so its final cards remain visible'
)

assert.doesNotMatch(
  source,
  /\[column-fill:_(?:auto|balance-all)\]/,
  'the mixed-work masonry layout must not use unsupported or single-column fill modes'
)

console.log('CommunityHome masonry layout source tests passed')
