import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'VideoNode.vue'), 'utf8')

test('VideoNode injects quick reviewed asset URI only for Seedance 2 generation path', () => {
  assert.match(source, /getSeedanceQuickAsset/)
  assert.match(source, /quickAssetUris/)
  assert.match(source, /capturedState\.isSeedance2 && capturedState\.quickAssetUris\.length > 0/)
  assert.match(source, /includeQuickAssets:\s*true/)
  assert.match(source, /finalImages = applyOrderedMediaReplacements\(finalImages,\s*quickReplacements\)/)
})

test('VideoNode sends Seedance OpenAPI Pro character assets as face codes', () => {
  assert.match(source, /apiType === 'seedance-openapi-pro'/)
  assert.match(source, /faceCodes/)
  assert.match(source, /formData\.append\('seedance_face_codes'/)
  assert.match(source, /!capturedState\.isSeedanceOpenApiPro && capturedState\.characterAssetUris\.length > 0/)
})

test('VideoNode excludes Seedance OpenAPI Pro character HTTP URLs from image payload fields', () => {
  assert.match(source, /capturedState\.isSeedanceOpenApiPro && capturedState\.faceCodes\?\.length > 0/)
  assert.match(source, /Seedance OpenAPI Pro 仅保留普通参考图/)
  assert.match(source, /finalImages = finalImages\.filter\(u => !charHttpUrls\.has\(u\)\)/)
})

test('VideoNode uses shared SD2 detector for Seedance 2 panel and payload decisions', () => {
  assert.match(source, /isSeedanceSd2VideoModel/, 'VideoNode should import and use the shared SD2 detector')
  assert.match(source, /isSeedanceSd2VideoModel\(currentModelConfig\.value\)/, 'current model SD2 capability should come from shared detector')
  assert.doesNotMatch(
    source,
    /apiType === 'seedance-2\.0'\s*\|\|\s*apiType === 'ant'\s*\|\|\s*apiType === 'happyhorse'/,
    'VideoNode should not keep a direct seedance-2.0/ant/happyhorse SD2 check'
  )
  assert.doesNotMatch(
    source,
    /modelName\.includes\('seedance'\) && modelName\.includes\('2\.0'\)/,
    'VideoNode should not infer SD2 mode from model names'
  )
  assert.doesNotMatch(
    source,
    /modelConfig\?\.apiType === 'seedance-2\.0'/,
    'VideoNode model switching should not keep a direct seedance-2.0 apiType check'
  )
})
