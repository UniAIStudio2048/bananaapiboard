import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'volcengine-assets.js'), 'utf8')

test('asset status polling preserves the provider channel used for quick review', () => {
  assert.match(source, /export async function getAsset\(id,\s*params = \{\}\)/)
  assert.match(source, /if \(params\.providerType\) queryParams\.set\('providerType', params\.providerType\)/)
  assert.match(source, /export function pollAssetStatus\(assetId,\s*\{[^}]*providerType/)
  assert.match(source, /getAsset\(assetId,\s*\{ providerType \}\)/)
})
