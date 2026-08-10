import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./Canvas.vue', import.meta.url), 'utf8')

test('opens the Skills market next to its triggering button', () => {
  assert.match(source, /const skillsMarketAnchor = ref\(null\)/)
  assert.match(source, /function toggleSkillsMarket\(event\)/)
  assert.match(source, /event\.currentTarget\.getBoundingClientRect\(\)/)
  assert.match(source, /:anchor="skillsMarketAnchor"/)
  assert.match(source, /@open-skills="toggleSkillsMarket"/)
})
