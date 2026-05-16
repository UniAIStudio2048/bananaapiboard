import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'VideoNode.vue'), 'utf8')

test('VideoNode injects quick reviewed asset URI only for Seedance 2 generation path', () => {
  assert.match(source, /getSeedanceQuickAsset/)
  assert.match(source, /quickAssetUris/)
  assert.match(source, /capturedState\.isSeedance2 && capturedState\.quickAssetUris\.length > 0/)
  assert.match(source, /\.\.\.capturedState\.quickAssetUris,\s*\.\.\.nonQuickImages/)
})

test('VideoNode sends Seedance OpenAPI Pro character assets as face codes', () => {
  assert.match(source, /apiType === 'seedance-openapi-pro'/)
  assert.match(source, /faceCodes/)
  assert.match(source, /formData\.append\('seedance_face_codes'/)
  assert.match(source, /!capturedState\.isSeedanceOpenApiPro && capturedState\.characterAssetUris\.length > 0/)
})
