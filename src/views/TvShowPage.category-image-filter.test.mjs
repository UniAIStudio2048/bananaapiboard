import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./TvShowPage.vue', import.meta.url), 'utf8')

test('filtered TV Show fallback does not force portrait-only loading', () => {
  assert.match(
    source,
    /function hasScopedTvShowFilter\(\)/,
    'TV Show should identify category, featured, and search-scoped views'
  )

  assert.match(
    source,
    /hasScopedTvShowFilter\(\)\s*\?\s*\{\s*page:\s*portraitPage\.value,\s*pageSize:\s*20\s*\}\s*:\s*\{\s*orientation:\s*'portrait'/s,
    'Scoped TV Show views should fetch all matching works instead of only portrait works'
  )
})
