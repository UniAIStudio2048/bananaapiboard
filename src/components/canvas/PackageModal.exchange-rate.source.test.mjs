import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./PackageModal.vue', import.meta.url), 'utf8')

test('package modal loads tenant balance-to-points exchange rate', () => {
  assert.match(source, /fetch\(getApiUrl\('\/api\/points-config'\)/)
  assert.match(source, /exchange_rate_points_per_currency/)
  assert.match(source, /convertExchangeRate\.value = Number\(/)
  assert.match(source, /async function loadPackages\(\) \{[\s\S]*loadConvertExchangeRate\(\)/)
})

test('package modal calculates conversion preview from tenant exchange rate', () => {
  assert.match(source, /Math\.floor\(yuan \* convertExchangeRate\.value\)/)
  assert.match(source, /汇率：1元 = \{\{ convertExchangeRate \}\}积分/)
})
