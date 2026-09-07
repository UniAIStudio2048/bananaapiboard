import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'ImageNode.vue'), 'utf8')
const button = readFileSync(join(import.meta.dirname, '../SeedanceReviewButton.vue'), 'utf8')
const controller = readFileSync(join(import.meta.dirname, '../../../utils/seedanceReviewController.js'), 'utf8')

test('ImageNode exposes quick Seedance review button and approved/expired badge', () => {
  assert.match(source, /<SeedanceReviewButton[^>]*asset-type="Image"/)
  assert.match(button, /createQuickSeedanceCharacterAsset/)
  assert.match(button, /seedance-review-btn/)
  assert.match(source, /seedance-review-badge/)
  assert.match(source, /已过审/)
  assert.match(source, /已失效/)
})

test('ImageNode preserves face URI for quick review assets from OpenAPI Pro channels', () => {
  assert.match(controller, /const savedProvider = quickAsset\.providerType \|\| providerType/)
  assert.match(controller, /\['seedance_openapi_pro', 'bytefor'\]\.includes\(savedProvider\)/)
  assert.match(controller, /assetUri: quickAsset\.assetUri \|\|[\s\S]*?`face:\$\{faceCode\}`/)
})

test('ImageNode quick review synchronizes the active asset provider before creating and polling', () => {
  assert.match(button, /import \{ createQuickSeedanceCharacterAsset, listAssetGroups, pollAssetStatus \} from '@\/api\/canvas\/volcengine-assets'/)
  assert.match(button, /getProvider: async \(\) => \(await listAssetGroups/)
  assert.match(controller, /const providerType = await getProvider\(\)/)
  assert.match(controller, /poll\(asset\.assetId,\s*\{[^}]*providerType: asset\.providerType/)
})
