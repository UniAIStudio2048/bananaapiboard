import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'ImageNode.vue'), 'utf8')

test('ImageNode exposes quick Seedance review button and approved/expired badge', () => {
  assert.match(source, /createQuickSeedanceCharacterAsset/)
  assert.match(source, /handleQuickSeedanceReview/)
  assert.match(source, /seedance-review-btn/)
  assert.match(source, /seedance-review-badge/)
  assert.match(source, /已过审/)
  assert.match(source, /已失效/)
})
