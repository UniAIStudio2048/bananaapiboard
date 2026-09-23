import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
test('depth tooltip refreshes fixed/per-second prices and never submits a paid task', async () => {
  const start = source.indexOf('async function refreshDepthPriceHint()')
  const end = source.indexOf('async function handleToolbarDepth()', start)
  assert.ok(start >= 0 && end > start)
  const hint = { value: '' }
  let config = { enabled: true, billing_mode: 'fixed', points_cost: 12 }
  const refresh = new Function('depthPriceHint','fetch','getApiUrl','getTenantHeaders','localStorage','formatPoints',`${source.slice(start,end)}; return refreshDepthPriceHint`)(
    hint, async url => { assert.equal(url, '/api/videos/depth/config'); return { ok: true, json: async () => config } },
    x=>x,()=>({}),{getItem:()=> 'test-token'},String
  )
  await refresh(); assert.match(hint.value, /12 积分\/次/)
  config = {enabled:true,billing_mode:'per_second',points_per_second:2}
  await refresh(); assert.match(hint.value, /2 积分\/秒/)
  config = {enabled:false}
  await refresh(); assert.match(hint.value, /未配置/)
})
