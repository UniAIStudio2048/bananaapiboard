import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

assert.match(
  source,
  /route\.path === '\/docs'/,
  'docs should be treated as a standalone surface'
)

assert.match(
  source,
  /isGlobalNavVisible/,
  'global navigation visibility should be centralized for standalone surfaces'
)

assert.match(
  source,
  /<nav v-if="isGlobalNavVisible"/,
  'docs must not inherit the normal app header'
)

console.log('App docs standalone source tests passed')
