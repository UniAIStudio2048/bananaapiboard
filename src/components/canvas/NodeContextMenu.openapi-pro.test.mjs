import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./NodeContextMenu.vue', import.meta.url), 'utf8')

test('NodeContextMenu preserves Seedance OpenAPI Pro face URI semantics', () => {
  assert.match(source, /activeProvider/)
  assert.match(source, /activeProvider\.value === 'seedance_openapi_pro'/)
  assert.match(source, /seedance-openapi-pro-character/)
  assert.match(source, /`face:\$\{faceCode\}`/)
  assert.match(source, /providerType/)
  assert.match(source, /const savedAssetUrl = isOpenApiPro \? `face:\$\{faceCode\}` : `asset:\/\/\$\{assetId\}`/)
  assert.doesNotMatch(source, /type:\s*'seedance-openapi-pro-character'[\s\S]{0,300}url:\s*`asset:\/\//)
})

test('NodeContextMenu does not wait for asset polling after OpenAPI Pro face submit', () => {
  assert.match(source, /if \(isOpenApiPro\) \{[\s\S]*showToast\(isBytefor \? 'Bytefor 角色已提交审核' : 'Seedance 角色已提交审核', 'success'\)[\s\S]*canvasStore\.addNode\({[\s\S]*assetUri:\s*savedAssetUrl[\s\S]*status:\s*initialStatus[\s\S]*url:\s*savedAssetUrl[\s\S]*return[\s\S]*\}[\s\S]*const \{ promise \} = pollAssetStatus/)
})

test('NodeContextMenu keeps the selected Seedance group when polling response omits GroupId', () => {
  assert.match(source, /groupId:\s*finalAsset\.GroupId\s*\|\|\s*groupId/)
})
