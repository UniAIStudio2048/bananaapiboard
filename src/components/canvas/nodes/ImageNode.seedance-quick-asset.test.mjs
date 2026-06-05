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

test('ImageNode preserves face URI for quick review assets from OpenAPI Pro channels', () => {
  assert.match(source, /const quickProviderType = result\.quickAsset\?\.providerType/)
  assert.match(source, /const isQuickOpenApiPro = quickProviderType === 'seedance_openapi_pro' \|\| quickProviderType === 'bytefor'/)
  assert.match(source, /assetUri: isQuickOpenApiPro \? `face:\$\{finalFaceCode\}` : `asset:\/\/\$\{finalAsset\.Id \|\| assetId\}`/)
})

test('ImageNode quick review synchronizes the active asset provider before creating and polling', () => {
  assert.match(source, /import \{ createQuickSeedanceCharacterAsset, listAssetGroups, pollAssetStatus \} from '@\/api\/canvas\/volcengine-assets'/)
  assert.match(source, /async function getQuickSeedanceProviderType\(/)
  assert.match(source, /const providerType = await getQuickSeedanceProviderType\(\)/)
  assert.match(source, /providerType/)
  assert.match(source, /pollAssetStatus\(assetId,\s*\{[^}]*providerType/)
})
