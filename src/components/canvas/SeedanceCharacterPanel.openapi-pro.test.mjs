import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SeedanceCharacterPanel.vue', import.meta.url), 'utf8')

test('SeedanceCharacterPanel isolates OpenAPI Pro role assets into a dedicated local type', () => {
  assert.match(source, /isSeedanceOpenApiProProvider/)
  assert.match(source, /seedance-openapi-pro-character/)
  assert.match(source, /seedanceAssetType/)
  assert.match(source, /faceCode/)
  assert.match(source, /function getSeedanceAssetUri\(asset\)/)
  assert.match(source, /return `face:\$\{asset\.FaceCode \|\| asset\.faceCode \|\| asset\.Id\}`/)
  assert.match(source, /assetUri:\s*getSeedanceAssetUri\(asset\)/)
  assert.match(source, /activeProvider\.value === 'seedance_openapi_pro'/)
})

test('SeedanceCharacterPanel keeps the selected group when polling response omits GroupId', () => {
  assert.match(source, /const finalMetadata = \{\s*assetId:\s*asset\.Id,\s*groupId:\s*asset\.GroupId\s*\|\|\s*groupId,/)
})

test('SeedanceCharacterPanel notifies My Assets immediately after local persistence for every provider', () => {
  assert.match(
    source,
    /canvasAssetId = saved\.id \|\| saved\.asset\?\.id\s*emit\('groups-updated'\)/,
    'the parent panel should refresh as soon as the local asset row exists'
  )
  assert.doesNotMatch(
    source,
    /if \(isSeedanceOpenApiProProvider\.value\) \{\s*emit\('groups-updated'\)/,
    'refresh notification must not be limited to the OpenAPI Pro provider'
  )
})
