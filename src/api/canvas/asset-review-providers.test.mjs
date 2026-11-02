import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('provider discovery shares only in-flight requests for the same tenant and user, then fetches fresh settings', async () => {
  const source = readFileSync(new URL('./volcengine-assets.js', import.meta.url), 'utf8')
  const start = source.indexOf('// ========== 角色组 ==========')
  const end = source.indexOf('\n/**', start)
  let tenant = 'tenant-a', user = 'user-a'
  const requests = [], completions = []
  const get = new Function('deps', `with (deps) { ${source.slice(start, end).replace('export async function', 'async function')}; return getAssetReviewProviders }`)({
    getApiUrl: path => path,
    getAuthHeaders: () => ({ tenant, user }),
    fetchAssetApi: (url, options) => { requests.push({ url, headers: options.headers }); return new Promise(resolve => completions.push(resolve)) },
    parseAssetResponse: async response => response
  })
  const first = get(), duplicate = get()
  assert.equal(requests.length, 1)
  tenant = 'tenant-b'
  const otherTenant = get()
  assert.equal(requests.length, 2, 'a different tenant must not receive the previous tenant options')
  user = 'user-b'
  const otherUser = get()
  assert.equal(requests.length, 3)
  completions[0]({ enabledProviders: ['official'] })
  completions[1]({ enabledProviders: ['tokenhub'] })
  completions[2]({ enabledProviders: [] })
  assert.deepEqual(await first, await duplicate)
  assert.deepEqual(await otherTenant, { enabledProviders: ['tokenhub'] })
  await otherUser
  const refreshed = get()
  assert.equal(requests.length, 4, 'resolved options must not cache channel switches')
  completions[3]({ enabledProviders: ['stars'] })
  assert.deepEqual(await refreshed, { enabledProviders: ['stars'] })
})
