import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./PackageModal.vue', import.meta.url), 'utf8')
const rechargeEntrySources = [
  source,
  readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8'),
  readFileSync(new URL('../../views/User.vue', import.meta.url), 'utf8'),
  readFileSync(new URL('../../views/Packages.vue', import.meta.url), 'utf8')
]

test('PackageModal binds custom recharge input and validation to tenant limits', () => {
  assert.match(source, /getRechargeLimits/)
  assert.match(source, /:placeholder="rechargeAmountPlaceholder"/)
  assert.match(source, /:min="rechargeLimits\.minAmount"/)
  assert.match(source, /:max="rechargeLimits\.maxAmount"/)
  assert.match(source, /amountInCents < rechargeLimits\.value\.minAmount \* 100/)
  assert.match(source, /amountInCents > rechargeLimits\.value\.maxAmount \* 100/)
})

test('PackageModal delegates focus styling to the rounded amount wrapper', () => {
  assert.match(source, /\.custom-amount-input:focus\s*\{[\s\S]*?outline:\s*none;[\s\S]*?box-shadow:\s*none;/)
})

test('all user recharge entries consume tenant limits without the legacy 1500 yuan cap', () => {
  for (const entrySource of rechargeEntrySources) {
    assert.match(entrySource, /getRechargeLimits/)
    assert.match(entrySource, /rechargeLimits\.value\.minAmount \* 100/)
    assert.match(entrySource, /rechargeLimits\.value\.maxAmount \* 100/)
    assert.doesNotMatch(entrySource, /amount > 150000|yuan <= 1500/)
  }
})
