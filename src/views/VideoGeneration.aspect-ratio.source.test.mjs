import { localizedPattern } from '../i18n/sourceAssertions.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')

test('VideoGeneration maps 21:9 ratio to a friendly label', () => {
  assert.match(source, localizedPattern(/'21:9': '超宽 \(21:9\)'/))
})
