import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('video vendor dropdown preserves the ungrouped vendor selection', () => {
  assert.match(
    source,
    /const selectedVendor = ref\(null\)/,
    'the ungrouped vendor needs a distinct null initial state'
  )
  assert.match(
    source,
    /selectedVendor\.value !== null\s*\?\s*selectedVendor\.value\s*:/,
    'an empty vendor name must not fall back to the first vendor'
  )
})
