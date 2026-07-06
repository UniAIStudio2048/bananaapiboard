import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

test('tenant preset options preserve raw id and per-image points cost', () => {
  assert.match(source, /const pointsCost\s*=\s*normalizePresetPointsCost\(p\.pointsCost\s*\?\?\s*p\.points_cost\)/)
  assert.match(source, /pointsCost,\s*_rawId:\s*p\.id/s)
  assert.match(source, /_rawId:\s*p\.id/)
  assert.match(source, /formatPresetOptionName\(p\.name,\s*pointsCost\)/)
  assert.match(source, /pointsCost:\s*0/)
})

test('selected preset data persists trusted tenant raw id and cost', () => {
  assert.match(source, /selectedPresetRawId:\s*isTenantPreset\s*\?\s*\(resolvedPreset\?\._rawId\s*\|\|\s*''\)\s*:\s*''/)
  assert.match(source, /selectedPresetPointsCost:\s*isTenantPreset\s*\?\s*normalizePresetPointsCost\(resolvedPreset\?\.pointsCost\s*\?\?\s*0\)\s*:\s*0/)
  assert.match(source, /const selectedTenantPresetId\s*=\s*selectedPreset\.value\.startsWith\('tenant-'\)/)
})

test('image generation passes only tenant preset raw id and estimate includes preset per output', () => {
  assert.match(source, /imagePresetId:\s*selectedTenantPresetId/)
  assert.match(source, /const presetPointsCost\s*=\s*selectedPresetPointsCost\.value/)
  assert.match(source, /const outputCount\s*=\s*groupCount\s*\*\s*selectedCount\.value/)
  assert.match(source, /return roundPoints\(\(basePointsCost\.value\s*\+\s*presetPointsCost\)\s*\*\s*outputCount\)/)
  assert.match(source, /const totalCost\s*=\s*currentPointsCost\.value/)
})
