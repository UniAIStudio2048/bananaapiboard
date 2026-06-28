import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
const apiClientSource = readFileSync(new URL('../api/client.js', import.meta.url), 'utf8')

test('global user-info refresh also refreshes model entitlements', () => {
  assert.match(appSource, /import\s+\{[^}]*loadModelEntitlements[^}]*\}\s+from\s+'@\/config\/tenant'/)
  const refreshBlockStart = appSource.indexOf('async function refreshUserInfo()')
  assert.ok(refreshBlockStart >= 0, 'refreshUserInfo should exist')
  const refreshBlock = appSource.slice(refreshBlockStart, appSource.indexOf('// 加载备案号配置', refreshBlockStart))
  assert.match(refreshBlock, /await\s+loadModelEntitlements\(\)/)
})

test('persisting an auth token triggers model entitlement refresh event', () => {
  assert.match(apiClientSource, /window\.dispatchEvent\(new CustomEvent\('auth-session-updated'\)\)/)
})

