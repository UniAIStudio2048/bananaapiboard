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
