import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('./ImageCropper.vue', import.meta.url), 'utf8')

test('crop mode opens with a large image fit while outpaint keeps workspace padding', () => {
  assert.match(source, /const cropModeDisplayRatio = 0\.82/)
  assert.match(source, /const outpaintDisplayRatio = 0\.6/)
  assert.match(source, /props\.mode === 'outpaint'\s*\?\s*outpaintDisplayRatio\s*:\s*cropModeDisplayRatio/)
})

test('desktop crop canvas allows portrait images to use more vertical space', () => {
  assert.match(source, /compact \? 520 : 690/)
})
