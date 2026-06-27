import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./WorkCard.vue', import.meta.url), 'utf8')

test('paid and featured work badges use grayscale glass styling', () => {
  assert.match(source, /community-work-card-paid-badge/, 'paid badge should have a stable semantic class')
  assert.match(source, /community-work-card-featured-badge/, 'featured badge should have a stable semantic class')
  assert.match(source, /community-work-card-paid-badge[^"]*bg-white\/75[^"]*text-neutral-950/, 'paid badge should use a brighter grayscale glass background')
  assert.match(source, /community-work-card-featured-badge[^"]*bg-black\/45[^"]*text-white/, 'featured badge should use a darker grayscale glass background')
  assert.match(source, /backdrop-blur-md/, 'work badges should use a frosted glass blur')
  assert.match(source, /border-white\/35/, 'the brighter paid badge should have a light translucent border')
  assert.match(source, /border-white\/20/, 'the darker featured badge should have a subtler translucent border')
  assert.doesNotMatch(source, /bg-amber-500\/90/, 'paid badge should no longer use the amber background')
  assert.doesNotMatch(source, /bg-purple-500\/90/, 'featured badge should no longer use the purple background')
})
