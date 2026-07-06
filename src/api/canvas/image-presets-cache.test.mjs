import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'image-presets.js'), 'utf8')

test('image presets API deduplicates and caches list requests', () => {
  assert.match(source, /IMAGE_PRESETS_CACHE_TTL/)
  assert.match(source, /let imagePresetsRequest = null/)
  assert.match(source, /if \(!forceRefresh && imagePresetsRequest\)/)
  assert.match(source, /imagePresetsCache = \{/)
})

test('image presets mutations invalidate cached lists', () => {
  assert.match(source, /export function invalidateImagePresetsCache/)
  const invalidations = source.match(/invalidateImagePresetsCache\(\)/g) || []
  assert.ok(invalidations.length >= 4)
})

test('image presets API normalizes legacy and partial list payloads', () => {
  assert.match(source, /export function normalizeImagePresetsPayload/)
  assert.match(source, /Array\.isArray\(presets\)/)
  assert.match(source, /tenant:\s*normalizeImagePresetList\(presets\?\.tenant\)/)
  assert.match(source, /user:\s*normalizeImagePresetList\(presets\?\.user,\s*\{\s*forceFree:\s*true\s*\}\)/)
})
