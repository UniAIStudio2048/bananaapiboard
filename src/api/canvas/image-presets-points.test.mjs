import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const presetsSource = readFileSync(join(__dirname, 'image-presets.js'), 'utf8')
const nodesSource = readFileSync(join(__dirname, 'nodes.js'), 'utf8')

test('image presets API normalizes tenant pointsCost and forces personal presets free', () => {
  assert.match(presetsSource, /export function normalizePresetPointsCost/)
  assert.match(presetsSource, /const pointsCost\s*=\s*forceFree\s*\?\s*0\s*:\s*normalizePresetPointsCost\(preset\.pointsCost\s*\?\?\s*preset\.points_cost\)/)
  assert.match(presetsSource, /pointsCost,\s*points_cost:\s*pointsCost/s)
  assert.match(presetsSource, /normalizeImagePresetList\(presets\?\.user,\s*\{\s*forceFree:\s*true\s*\}\)/)
})

test('image generation API wrappers forward imagePresetId as image_preset_id', () => {
  assert.match(nodesSource, /imagePresetId/)
  const forwards = nodesSource.match(/body\.image_preset_id\s*=\s*imagePresetId/g) || []
  assert.ok(forwards.length >= 2, 'text-to-image and image-to-image wrappers should both forward the preset id')
})
